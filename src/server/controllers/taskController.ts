import express from "express";
import { db } from "../config/db";
import { AuthenticatedRequest } from "../middleware/auth";
import { generateContentWithFallback, extractJsonString, sanitizeJsonString } from "../services/aiService";
import { getSetting } from "../services/settingService";
import crypto from "crypto";

// ================= 后台任务队列处理器 =================

interface QueueTask {
  id: string;
  userId: string;
  status: string;
  autoRun: number;
  uploadMode: string;
  notebookId: string | null;
  payload: string; // JSON string
}

const queue: string[] = [];
let activeWorkers = 0;
const MAX_CONCURRENCY = 1; // 串行处理 AI 请求，对速率限制友好

// 在服务器启动或重载时，将所有未完成且非等待审核的任务加入队列
export const initTaskQueue = () => {
  try {
    const pendingTasks = db.prepare(`
      SELECT id FROM background_tasks 
      WHERE status IN ('queued', 'extracting', 'diagnosing')
    `).all() as { id: string }[];
    
    // 重置异常断电时的处理中状态为 queued
    db.prepare(`
      UPDATE background_tasks 
      SET status = 'queued', progress = 0 
      WHERE status IN ('extracting', 'diagnosing')
    `).run();

    for (const task of pendingTasks) {
      queue.push(task.id);
    }
    console.log(`[TaskQueue] 成功初始化，已将 ${pendingTasks.length} 个挂起任务加入队列。`);
    triggerQueue();
  } catch (err) {
    console.error("[TaskQueue] 初始化失败:", err);
  }
};

const triggerQueue = () => {
  if (activeWorkers >= MAX_CONCURRENCY || queue.length === 0) return;
  const taskId = queue.shift();
  if (taskId) {
    activeWorkers++;
    processTask(taskId).finally(() => {
      activeWorkers--;
      triggerQueue();
    });
  }
};

const processTask = async (id: string) => {
  console.log(`[TaskQueue] 开始处理任务: ${id}`);
  const task = db.prepare("SELECT * FROM background_tasks WHERE id = ?").get(id) as QueueTask | undefined;
  if (!task) {
    console.error(`[TaskQueue] 任务 ${id} 未找到`);
    return;
  }

  try {
    let payload = JSON.parse(task.payload);

    // 第一阶段：如果是在 queued 状态，进行 OCR 识别文本提取
    if (task.status === 'queued') {
      db.prepare("UPDATE background_tasks SET status = 'extracting', progress = 20, updatedAt = ?, isNotified = 0 WHERE id = ?").run(Date.now(), id);
      console.log(`[TaskQueue] [${id}] 进入文本提取阶段`);
      
      const extracted = await runAiExtract(payload.imageBase64, payload.mimeType, payload.extractMode || task.uploadMode);
      payload.extractedQuestions = extracted;

      db.prepare("UPDATE background_tasks SET payload = ?, updatedAt = ? WHERE id = ?").run(JSON.stringify(payload), Date.now(), id);

      if (task.autoRun === 0) {
        // 需要人工审核：变更状态为待校对，挂起任务
        db.prepare("UPDATE background_tasks SET status = 'pending_extract_review', progress = 50, updatedAt = ?, isNotified = 0 WHERE id = ?").run(Date.now(), id);
        console.log(`[TaskQueue] [${id}] 需要人工校对，挂起任务`);
        return;
      } else {
        // 全自动：直接进入下一阶段
        task.status = 'extracting'; // 模拟状态向下流转
      }
    }

    // 第二阶段：文本提取成功后，进行诊断
    if (task.status === 'extracting') {
      db.prepare("UPDATE background_tasks SET status = 'diagnosing', progress = 60, updatedAt = ?, isNotified = 0 WHERE id = ?").run(Date.now(), id);
      console.log(`[TaskQueue] [${id}] 进入 AI 智能诊断阶段`);

      const diagnosed = await runAiDiagnoseAll(payload.extractedQuestions, payload.imageBase64, task.notebookId);
      payload.diagnosedQuestions = diagnosed;

      db.prepare("UPDATE background_tasks SET payload = ?, updatedAt = ? WHERE id = ?").run(JSON.stringify(payload), Date.now(), id);

      if (task.autoRun === 0) {
        // 需要审核诊断：变更状态为待确认，挂起任务
        db.prepare("UPDATE background_tasks SET status = 'pending_diagnose_review', progress = 80, updatedAt = ?, isNotified = 0 WHERE id = ?").run(Date.now(), id);
        console.log(`[TaskQueue] [${id}] 需要人工确认诊断，挂起任务`);
        return;
      } else {
        // 全自动：直接归档保存
        await saveFinalQuestionsToLibrary(task.userId, diagnosed, payload.imageBase64, task.notebookId);
        db.prepare("UPDATE background_tasks SET status = 'completed', progress = 100, updatedAt = ?, isNotified = 0 WHERE id = ?").run(Date.now(), id);
        console.log(`[TaskQueue] [${id}] 全自动处理成功并归档完毕！`);
      }
    }
  } catch (error: any) {
    console.error(`[TaskQueue] [${id}] 执行失败:`, error);
    db.prepare("UPDATE background_tasks SET status = 'failed', errorMsg = ?, updatedAt = ?, isNotified = 0 WHERE id = ?")
      .run(error.message || "未知错误", Date.now(), id);
  }
};

// ================= AI 工具方法封装 =================

const runAiExtract = async (imageBase64: string, mimeType: string, extractMode: string) => {
  const isSingle = extractMode === 'single'; // 跨页默认也是长图单题或长图多题，但在 extract 时由前端决定单或多
  // 如果是跨页合并，且我们在接口上传递了最终的 extract 模式，则应该传入真正的 isSingle 逻辑。
  // 在任务 payload 中，可以保存真正的 mode，下面我们将优先从 payload 中获取 mode
  
  let prompt = ``;
  if (isSingle) {
    prompt += `
识别我提供的图片中的题目文本及手写内容。
【重要指令】：当前为单题提取模式。请不要将图片切分为多道题，只将其中的最核心的一道题完整提取出来，作为一个整体题目返回。
我提供了一张【学生试卷/作业图片】（第一张图）。
`;
  } else {
    prompt += `
识别我提供的图片中的所有独立大题或子题（如"20."、"21."、"22."等）。
我提供了一张【学生试卷/作业图片】（第一张图）。
`;
  }
  prompt += `
【具体输出字段要求】：
对于每一道独立的题目，请严格按照以下文本格式输出（不同题目之间用 ===题目分割=== 进行隔开，不要包含 Markdown 代码块标记如 \`\`\`）：

===题目分割===
学科: [学科名称，如数学/物理/化学等]
题干: [本题的高精度完整题干印刷体文字，包含题号，绝对不能写“略”]
学生作答: [本题区域内学生手写作答出的答案或步骤，若无则留空]
标准答案: [根据参考答案，匹配得到的本题标准参考答案，包含推导过程和最终正确答案，若无则留空]

【注意事项】：
1. 不要输出任何解释性前言或后缀（如“以下是识别内容：”），直接以第一个 ===题目分割=== 开始。
2. 公式必须用标准的 $ 或 $$ 包围输出为 LaTeX 格式。
`;

  const systemPrompt = `你是一个只输出结构化纯文本的 OCR 助手。你的整个回复必须严格按照 ===题目分割=== 的格式输出各字段，不要包含 Markdown 代码块标记（如 \`\`\`）或任何额外的多余废话。`;

  const response = await generateContentWithFallback({
    contents: [
      {
        role: 'user',
        parts: [
          {
            inlineData: {
              data: imageBase64.split(',')[1] || imageBase64,
              mimeType: mimeType || 'image/jpeg'
            }
          },
          { text: prompt }
        ]
      }
    ],
    config: {
      temperature: 0.1
    },
    model: getSetting("AI_VISION_MODEL", process.env.AI_VISION_MODEL || 'glm-5v-turbo'),
    systemPrompt
  });

  const text = response.text || '';
  if (!text) throw new Error("AI 未返回提取文本");

  const result: any[] = [];
  const parts = text.split(/===+题目分割===+/);
  for (const part of parts) {
    const trimmedPart = part.trim();
    if (!trimmedPart) continue;

    const subjectMatch = trimmedPart.match(/学科:\s*(.+)/);
    const subject = subjectMatch ? subjectMatch[1].trim() : "数学";

    const qIndex = trimmedPart.indexOf("题干:");
    const aIndex = trimmedPart.indexOf("学生作答:");
    const sIndex = trimmedPart.indexOf("标准答案:");

    let originalText = "";
    let studentAnswer = "";
    let standardAnswer = "";

    if (qIndex !== -1) {
      if (aIndex !== -1) {
        originalText = trimmedPart.substring(qIndex + 3, aIndex).trim();
        if (sIndex !== -1) {
          studentAnswer = trimmedPart.substring(aIndex + 5, sIndex).trim();
          standardAnswer = trimmedPart.substring(sIndex + 5).trim();
        } else {
          studentAnswer = trimmedPart.substring(aIndex + 5).trim();
        }
      } else {
        if (sIndex !== -1) {
          originalText = trimmedPart.substring(qIndex + 3, sIndex).trim();
          standardAnswer = trimmedPart.substring(sIndex + 5).trim();
        } else {
          originalText = trimmedPart.substring(qIndex + 3).trim();
        }
      }
    } else {
      originalText = trimmedPart.replace(/学科:\s*.+/, "").trim();
    }

    if (originalText) {
      result.push({
        subject: subject.substring(0, 10),
        originalText,
        studentAnswer,
        standardAnswer
      });
    }
  }

  if (result.length === 0) {
    result.push({
      subject: "数学",
      originalText: text,
      studentAnswer: "",
      standardAnswer: ""
    });
  }

  return result;
};

const runAiDiagnoseAll = async (questions: any[], imageBase64: string, notebookId: string | null) => {
  const diagnosedResults: any[] = [];

  let grade = '';
  if (notebookId) {
    try {
      const nb = db.prepare("SELECT grade FROM notebooks WHERE id = ?").get(notebookId) as { grade: string | null } | undefined;
      if (nb && nb.grade) {
        grade = nb.grade;
      }
    } catch (dbErr) {
      console.warn("Failed to query notebook grade in background runAiDiagnoseAll:", dbErr);
    }
  }

  for (let idx = 0; idx < questions.length; idx++) {
    const item = questions[idx];
    
    let standardAnswerSection = '';
    if (item.standardAnswer) {
      standardAnswerSection = `- 老师提供的参考标准答案: ${item.standardAnswer}\n`;
    }

    const gradeConstraint = grade 
      ? `本道题所属年级为：${grade}。在给出标准解析和分析错误原因时，必须严格保持与这道题目的实际年级和学段级别（小学/初中/高中）完全一致，绝对不能使用超纲的知识和方法来解析该题（例如：若本题是小学六年级的题目，则严禁使用初中、高中或大学的代数、微积分、方程等超纲知识，必须控制在小学六年级及以下的解题范围内）。`
      : `请智能自动识别这道题目所属的实际年级和学段级别（从小学一年级到高中三年级）。在给出标准解析和分析错误原因时，必须严格保持与这道题目的实际年级和学段级别完全一致，绝对不能使用超纲的知识和方法来解析该题（例如：若本题是小学六年级的题目，则严禁使用初中、高中或大学的代数、微积分、方程等超纲知识，必须控制在小学六年级及以下的解题范围内）。`;

    const prompt = `
幕后名师AI诊断任务。请根据已录入和校对好的错题信息，进行深度的解答和批改诊断：

【错题信息】
- 学科: ${item.subject || '数学'}
- 题干: ${item.originalText}
${standardAnswerSection}
- 学生作答内容: ${item.studentAnswer || '（无学生作答）'}
- 难度与年级限制: ${gradeConstraint}

【任务要求】：
1. **核心考点** ("knowledgePoints"): 分析该题考查的核心知识点，最多列出 3 个，存入数组。
2. **标准解析** ("solution"): 给出该题的名师标准解题推导步骤。数学公式用 $ 或 $$ 包围。
3. **错误原因分析** ("errorAnalysis"):
   - 如果 "学生作答内容" 不为空，请结合学生作答、题干和标准答案，诊断出具体的犯错原因。
   - 如果 "学生作答内容" 为空或缺失，请结合本题的核心考点与推导步骤，分析学生在解答此题时【最容易掉入的常见错误陷阱】以及其【概念/习惯层面的根本原因】。
   - 无论何种情况，都必须输出结构化文本，严格包含以下两项：
     1. 常见错误：[描述学生在解答该题时的常见逻辑或计算错误]
     2. 根本原因：[剖析学生由于哪些概念不清、公式记错或基础不牢导致该错因]
4. **学生本题所得评分** ("score"): 评估学生本题得分，0到100之间的整数（未作答或缺失则为0）。

请返回严格的 JSON 对象格式，不要包含 Markdown 的 \`\`\`json\`\`\` 标记：
{
  "knowledgePoints": ["核心考点1", "核心考点2"],
  "solution": "标准详细解答步骤内容...",
  "score": 85,
  "errorAnalysis": "1. 常见错误：...\n2. 根本原因：..."
}
`;




    const systemPrompt = `你是一个严谨的 AI 智能名师批改助手。你的输出格式有且只有一种：一个合法的 JSON 对象。不得包含任何 Markdown 标记或解释文字。`;

    const response = await generateContentWithFallback({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { temperature: 0.2 },
      systemPrompt,
      thinkingMode: 'disabled'
    });

    const text = response.text || '';
    let resultObj = {
      knowledgePoints: ["需手动分析"],
      solution: text || '无解析步骤',
      score: 0,
      errorAnalysis: "识别异常，请手动分析",
      errorDiagnosis: []
    };

    try {
      const parsedText = extractJsonString(text);
      if (parsedText) {
        resultObj = JSON.parse(sanitizeJsonString(parsedText));
      }
    } catch (e) {
      console.warn(`[TaskQueue] 题目 #${idx + 1} 诊断 JSON 解析失败，降级处理`, e);
    }

    diagnosedResults.push({
      id: crypto.randomUUID ? crypto.randomUUID() : (Date.now() + Math.random()).toString(),
      imageUrl: imageBase64 || undefined,
      originalText: item.originalText,
      subject: item.subject || '数学',
      knowledgePoints: resultObj.knowledgePoints || [],
      errorReason: '概念不清',
      solution: resultObj.solution || '',
      createdAt: Date.now(),
      studentAnswer: item.studentAnswer || '',
      errorDiagnosis: [],
      errorAnalysis: resultObj.errorAnalysis || '',
      notebookId: notebookId || undefined,
      score: resultObj.score !== undefined ? resultObj.score : 0,
      masteryStatus: 'not_mastered',
      standardAnswer: item.standardAnswer || null
    });
  }

  return diagnosedResults;
};

const saveFinalQuestionsToLibrary = async (
  userId: string, 
  diagnosedQuestions: any[], 
  imageUrl: string, 
  notebookId: string | null
) => {
  const activeQuestions = diagnosedQuestions.filter(q => q.errorReason !== '不纳入归档');
  if (activeQuestions.length === 0) return;

  const stmt = db.prepare(`
    INSERT INTO questions (
      id, userId, status, imageUrl, originalText, subject, knowledgePoints, errorReason, solution, createdAt, studentAnswer, errorDiagnosis, errorAnalysis, notebookId, score, masteryStatus, standardAnswer
    ) VALUES (?, ?, 'audited', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'not_mastered', ?)
  `);

  for (let i = 0; i < activeQuestions.length; i++) {
    const q = activeQuestions[i];
    const id = crypto.randomUUID ? crypto.randomUUID() : (Date.now() + Math.random()).toString();

    stmt.run(
      id,
      userId,
      imageUrl || null,
      q.originalText,
      q.subject || '数学',
      JSON.stringify(q.knowledgePoints || []),
      q.errorReason || '概念不清',
      q.solution || '',
      Date.now() + i, // 稍微错开时间戳以保证排序相对顺序
      q.studentAnswer || '',
      JSON.stringify(q.errorDiagnosis || []),
      q.errorAnalysis || '',
      notebookId || null,
      q.score !== undefined ? q.score : null,
      q.standardAnswer || null
    );
  }
};


// ================= Express API 路由处理方法 =================

// 1. 创建后台任务
export const createTask = async (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const { taskName, autoRun, uploadMode, notebookId, payload } = req.body;
    if (!payload || !payload.imageBase64) {
      return res.status(400).json({ error: "参数不完整，缺少图片" });
    }

    const taskId = "task_" + Math.random().toString(36).substring(2, 9);
    const timeNow = Date.now();

    const stmt = db.prepare(`
      INSERT INTO background_tasks (
        id, userId, taskName, status, progress, autoRun, uploadMode, notebookId, payload, createdAt, updatedAt, isNotified
      ) VALUES (?, ?, ?, 'queued', 0, ?, ?, ?, ?, ?, ?, 0)
    `);

    stmt.run(
      taskId,
      req.userId,
      taskName || "未命名录题任务",
      autoRun !== undefined ? autoRun : 1,
      uploadMode || "single",
      notebookId || null,
      JSON.stringify(payload),
      timeNow,
      timeNow
    );

    // 压入后台执行队列，并触发 Worker
    queue.push(taskId);
    triggerQueue();

    res.json({ success: true, taskId });
  } catch (error: any) {
    console.error("Create Background Task Error:", error);
    res.status(500).json({ error: error.message || "创建后台任务失败" });
  }
};

// 2. 获取任务列表 (仅自己，不包含 payload 字段以提升性能)
export const getTasks = async (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const pageParam = req.query.page;
    const limitParam = req.query.limit;

    if (pageParam !== undefined && limitParam !== undefined) {
      const page = parseInt(pageParam as string) || 1;
      const limit = parseInt(limitParam as string) || 10;
      const offset = (page - 1) * limit;

      const countStmt = db.prepare("SELECT COUNT(*) as count FROM background_tasks WHERE userId = ?");
      const countRow = countStmt.get(req.userId) as { count: number };
      const total = countRow.count;

      const statsStmt = db.prepare(`
        SELECT 
          COUNT(CASE WHEN status IN ('queued', 'extracting', 'diagnosing') THEN 1 END) as runningCount,
          COUNT(CASE WHEN status = 'pending_extract_review' THEN 1 END) as pendingOcrCount,
          COUNT(CASE WHEN status = 'pending_diagnose_review' THEN 1 END) as pendingDiagCount,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completedCount
        FROM background_tasks WHERE userId = ?
      `);
      const statsRow = statsStmt.get(req.userId) as {
        runningCount: number;
        pendingOcrCount: number;
        pendingDiagCount: number;
        completedCount: number;
      };

      const stmt = db.prepare(`
        SELECT id, userId, taskName, status, progress, autoRun, uploadMode, notebookId, createdAt, updatedAt, errorMsg, isNotified 
        FROM background_tasks 
        WHERE userId = ? 
        ORDER BY createdAt DESC 
        LIMIT ? OFFSET ?
      `);
      const rows = stmt.all(req.userId, limit, offset) as any[];

      const tasks = rows.map(row => ({
        id: row.id,
        userId: row.userId,
        taskName: row.taskName,
        status: row.status,
        progress: row.progress,
        autoRun: row.autoRun,
        uploadMode: row.uploadMode,
        notebookId: row.notebookId || undefined,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        errorMsg: row.errorMsg || undefined,
        isNotified: row.isNotified !== undefined ? row.isNotified : 0
      }));

      return res.json({
        total,
        page,
        limit,
        tasks,
        stats: {
          running: statsRow.runningCount,
          pendingOcr: statsRow.pendingOcrCount,
          pendingDiag: statsRow.pendingDiagCount,
          completed: statsRow.completedCount
        }
      });
    }

    // 兼容原本无分页时的调用
    const stmt = db.prepare(`
      SELECT id, userId, taskName, status, progress, autoRun, uploadMode, notebookId, createdAt, updatedAt, errorMsg, isNotified 
      FROM background_tasks 
      WHERE userId = ? 
      ORDER BY createdAt DESC
    `);
    const rows = stmt.all(req.userId) as any[];

    const tasks = rows.map(row => ({
      id: row.id,
      userId: row.userId,
      taskName: row.taskName,
      status: row.status,
      progress: row.progress,
      autoRun: row.autoRun,
      uploadMode: row.uploadMode,
      notebookId: row.notebookId || undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      errorMsg: row.errorMsg || undefined,
      isNotified: row.isNotified !== undefined ? row.isNotified : 0
    }));

    res.json(tasks);
  } catch (error: any) {
    console.error("Get Tasks Error:", error);
    res.status(500).json({ error: error.message || "获取任务列表失败" });
  }
};

// 2.5 获取单个任务详情 (包含 payload)
export const getTaskById = async (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const { id } = req.params;
    const task = db.prepare("SELECT * FROM background_tasks WHERE id = ? AND userId = ?").get(id, req.userId) as any;
    if (!task) {
      return res.status(404).json({ error: "任务不存在" });
    }

    res.json({
      id: task.id,
      userId: task.userId,
      taskName: task.taskName,
      status: task.status,
      progress: task.progress,
      autoRun: task.autoRun,
      uploadMode: task.uploadMode,
      notebookId: task.notebookId || undefined,
      payload: task.payload ? JSON.parse(task.payload) : {},
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      errorMsg: task.errorMsg || undefined,
      isNotified: task.isNotified !== undefined ? task.isNotified : 0
    });
  } catch (error: any) {
    console.error("Get Task Detail Error:", error);
    res.status(500).json({ error: error.message || "获取任务详情失败" });
  }
};

// 3. 提交审核与确认数据继续流转
export const submitReview = async (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const { id } = req.params;
    const { step, payload } = req.body;

    const task = db.prepare("SELECT * FROM background_tasks WHERE id = ? AND userId = ?").get(id, req.userId) as QueueTask | undefined;
    if (!task) {
      return res.status(404).json({ error: "任务不存在" });
    }

    let taskPayload = JSON.parse(task.payload);

    if (step === 2) {
      // 提交的是 OCR 文本校对审核结果，继续进入诊断阶段
      if (task.status !== 'pending_extract_review') {
        return res.status(400).json({ error: "任务当前状态不是等待文本校对" });
      }

      taskPayload.extractedQuestions = payload.extractedQuestions;
      
      db.prepare(`
        UPDATE background_tasks 
        SET status = 'extracting', payload = ?, updatedAt = ?, isNotified = 0 
        WHERE id = ?
      `).run(JSON.stringify(taskPayload), Date.now(), id);

      // 压回队列，继续进行诊断
      queue.push(id);
      triggerQueue();

      return res.json({ success: true, message: "已提交文本校对结果，后台正在进行智能诊断..." });
    } else if (step === 3) {
      // 提交的是最后的诊断确认审核结果，进行归档入库
      if (task.status !== 'pending_diagnose_review') {
        return res.status(400).json({ error: "任务当前状态不是等待诊断确认" });
      }

      const selectedNotebook = payload.notebookId || task.notebookId;
      const finalDiagnosed = payload.diagnosedQuestions;

      await saveFinalQuestionsToLibrary(req.userId, finalDiagnosed, taskPayload.imageBase64, selectedNotebook);

      db.prepare(`
        UPDATE background_tasks 
        SET status = 'completed', progress = 100, updatedAt = ?, isNotified = 0 
        WHERE id = ?
      `).run(Date.now(), id);

      return res.json({ success: true, message: "错题已成功审核并归档保存入库！" });
    }

    res.status(400).json({ error: "无效的审核步骤代码" });
  } catch (error: any) {
    console.error("Submit Task Review Error:", error);
    res.status(500).json({ error: error.message || "提交任务审核失败" });
  }
};

// 4. 删除/取消任务
export const deleteTask = async (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const { id } = req.params;
    const stmt = db.prepare("DELETE FROM background_tasks WHERE id = ? AND userId = ?");
    const result = stmt.run(id, req.userId);

    if (result.changes === 0) {
      return res.status(404).json({ error: "删除失败，任务不存在或无权操作" });
    }

    // 从内存处理队列中移除 (如果还在排队)
    const index = queue.indexOf(id);
    if (index !== -1) {
      queue.splice(index, 1);
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error("Delete Task Error:", error);
    res.status(500).json({ error: error.message || "删除任务失败" });
  }
};

// 5. 标记后台任务已发送通知
export const updateTaskNotified = async (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const { id } = req.params;
    const stmt = db.prepare("UPDATE background_tasks SET isNotified = 1 WHERE id = ? AND userId = ?");
    const result = stmt.run(id, req.userId);

    if (result.changes === 0) {
      return res.status(404).json({ error: "任务不存在或无权操作" });
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error("Update Task Notified Error:", error);
    res.status(500).json({ error: error.message || "更新任务已通知状态失败" });
  }
};
