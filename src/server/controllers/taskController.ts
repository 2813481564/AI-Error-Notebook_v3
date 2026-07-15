import express from "express";
import { db } from "../config/db";
import { AuthenticatedRequest } from "../middleware/auth";
import { generateContentWithFallback, extractJsonString, sanitizeJsonString } from "../services/aiService";
import { executeDeepDiagnosis } from "../services/diagnosticEngine";
import { getSetting } from "../services/settingService";
import { isBase64Image, saveBase64Image, deleteImageFile } from "../services/fileService";
import { enhanceImageForOcr } from "../utils/imageOptimizer";
import { stringSimilarity } from "../utils/stringUtils";

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
      
      // 【物理外挂】：在发给视觉大模型之前，对原始图片进行“锐化、去底灰”处理
      console.log(`[TaskQueue] [${id}] 正在执行图像增强外挂...`);
      const optimizedBase64 = await enhanceImageForOcr(payload.imageBase64);
      
      const extracted = await runAiExtract(optimizedBase64, payload.mimeType, payload.extractMode || task.uploadMode);
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
        // 优先使用创建任务时已落盘的物理文件路径，否则再传 Base64（saveImage 内部会再次落盘）
        const imageForLib = payload.savedImageUrl || payload.imageBase64;
        await saveFinalQuestionsToLibrary(task.userId, diagnosed, imageForLib, task.notebookId);
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
  const isSingle = extractMode === 'single';
  
  let prompt = ``;
  if (isSingle) {
    prompt += `
识别我提供的图片中的题目文本、配图信息及手写内容。
【绝对强制指令】：当前为单题截取模式（物理切图模式）。不论图中包含多少个大题、小问（如 (1)(2)(3)）、或表格，你都必须把图片内的**所有内容**视作**极其完整的一道题**！
绝对禁止拆分为多个题目，绝对禁止舍弃任何内容。你返回的 JSON 数组必须且只能包含 1 个对象！所有小问和公共题干必须统一放进这个唯一的 originalText 中！
我提供了一张【学生试卷/作业图片】（第一张图）。
`;
  } else {
    prompt += `
识别我提供的图片中的所有独立题目。
【大题合并铁律】：对于包含 (1)(2)(3) 等多个小问的综合题、阅读理解题、表格题，绝对禁止将小问拆分为独立题目！你必须将公共题干与所有小问作为一个不可分割的整体，完整保存在一个题目的 originalText 中。
我提供了一张【学生试卷/作业图片】（第一张图）。
`;
  }
  prompt += `
【具体输出字段要求】：
请严格以 JSON 数组的形式返回（即使只有一题也要用数组包围），数组中的每个对象代表一道题，包含以下字段：
- subject: [学科名称，如数学/物理/化学等]
- boundingBox: [题目所在区域的矩形框坐标，格式为 {"x": 10, "y": 20, "w": 400, "h": 200}]
- originalText: [本题的高精度完整题干印刷体文字，包含题号。绝对不能写“略”]
- studentAnswer: [看清原图！一字不差照抄图片里的所有手写步骤与最终答案（严格按照图片书写，哪怕算错或写错也必须照抄，千万别帮学生自动改对！）]
- standardAnswer: [根据参考资料提取的本题标准答案，若无则留空]
- visualContext: [如果你在题目中看到了几何图形、函数图像或实物配图，请在此字段用纯文本极其详细地描述图形的拓扑结构、形状特征、嵌套关系和标注字母。【几何标注极度警示】：必须极其精准地识别出图上所有距离、长度标注线（如 32cm）的起止点！例如，仔细区分 32cm 是指“两个图形的水平净距离”还是“左侧直角边到右侧直角边的中心距”！一旦看错标注范围，计算会彻底崩溃。如果没有图，返回空字符串。]

【深度校准与格式规约（极度重要）】：
1. **语义级防错**：如果在数学题中识别出汉字“元”、“兀”等，且上下文是关于圆、面积、体积等几何计算，必须将其纠正为数学符号“\\pi”。理清易混淆的“t”与“+”。
2. **公式规范**：公式必须用标准的 $ 或 $$ 包围输出为 LaTeX 格式。
3. **【视觉抗干扰指令（核心）】**：图片中存在老师使用**红色或蓝色笔**打的勾、叉、减分（如-2）或批改写下的正确答案。你必须凭借颜色特征**完全忽略所有红色/蓝色的批阅痕迹**，绝对不能将它们混入原题干或手写作答中！**仅提取深灰色/黑色的原版印刷体和学生原本的手写铅笔字迹！**
`;

  const systemPrompt = "你是一个只输出结构化 JSON 的 OCR 助手。你的整个回复必须是一个合法的 JSON 数组，不要包含 Markdown 代码块标记或任何额外的多余废话。";

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

  const result = [];
  try {
    const extracted = extractJsonString(text);
    const sanitized = sanitizeJsonString(extracted);
    let parsedData: any = null;
    try {
      parsedData = JSON.parse(sanitized);
    } catch (parseErr) {
      try {
        parsedData = new Function("return " + sanitized)();
      } catch (fnErr) {
        throw parseErr;
      }
    }
    const items = Array.isArray(parsedData) ? parsedData : [parsedData];
    
    for (const item of items) {
       if (!item.originalText && !item.studentAnswer) continue;
       result.push({
         subject: item.subject || "数学",
         originalText: unwrapJsonString(item.originalText || "", 'originalText'),
         studentAnswer: unwrapJsonString(item.studentAnswer || "", 'studentAnswer'),
         standardAnswer: item.standardAnswer || "",
         visualContext: item.visualContext || "",
         boundingBox: item.boundingBox || { x: 0, y: 0, w: 0, h: 0 }
       });
    }
  } catch (e) {
     console.error("Failed to parse extract JSON", e, text);
     result.push({
       subject: "数学",
       originalText: unwrapJsonString(text, 'originalText'),
       studentAnswer: unwrapJsonString(text, 'studentAnswer'),
       standardAnswer: "",
       visualContext: "",
       boundingBox: { x: 0, y: 0, w: 0, h: 0 }
     });
  }

  // 按照现代 VLM 端到端及 KISS 原则，彻底砍掉“没有眼睛”的第二阶段纯文本校对，防止将算错的数字脑补修改为正确答案。
  return result;
};

// 自动解包被错误存储为 JSON 字符串或非严格 JS 对象的文本字段
function unwrapJsonString(str: any, fieldHint?: 'originalText' | 'studentAnswer' | 'solution' | 'errorAnalysis'): string {
  if (!str) return '';
  const strVal = typeof str === 'string' ? str : String(str);
  let trimmed = strVal.trim();
  const mdMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (mdMatch && mdMatch[1]) {
    trimmed = mdMatch[1].trim();
  }
  if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
    let parsed: any = null;
    try {
      parsed = JSON.parse(trimmed);
    } catch (e) {
      try {
        parsed = new Function("return " + trimmed)();
      } catch (e2) {}
    }
    if (parsed) {
      const item = Array.isArray(parsed) ? parsed[0] : parsed;
      if (item && typeof item === 'object') {
        if (fieldHint && item[fieldHint] !== undefined) return String(item[fieldHint]);
        if (item.originalText !== undefined) return String(item.originalText);
        if (item.studentAnswer !== undefined) return String(item.studentAnswer);
        if (item.questionText !== undefined) return String(item.questionText);
        if (item.text !== undefined) return String(item.text);
      }
    }
  }
  return strVal;
}

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

    let visualContextSection = '';
    if (item.visualContext) {
      visualContextSection = `- 题干配图与几何标注说明: ${item.visualContext}\n`;
    }

    const isMathScience = ['数学', '物理', '化学', '理综', '科学', '算术', '奥数'].some(s => (item.subject || '').includes(s));
    const finalThinkingMode = isMathScience ? 'enabled' : 'disabled';

    const gradeConstraint = grade 
      ? `本道题所属年级为：${grade}。在给出标准解析和分析错误原因时，必须严格保持与这道题目的实际年级和学段级别（小学/初中/高中）完全一致，绝对不能使用超纲的知识和方法来解析该题（例如：若本题是小学六年级的题目，则严禁使用初中、高中或大学的代数、微积分、方程等超纲知识，必须控制在小学六年级及以下的解题范围内）。`
      : `请智能自动识别这道题目所属的实际年级和学段级别（从小学一年级到高中三年级）。在给出标准解析和分析错误原因时，必须严格保持与这道题目的实际年级和学段级别完全一致，绝对不能使用超纲的知识和方法来解析该题（例如：若本题是小学六年级的题目，则严禁使用初中、高中或大学的代数、微积分、方程等超纲知识，必须控制在小学六年级及以下的解题范围内）。`;

    const diagResult = await executeDeepDiagnosis({
      subject: item.subject || '数学',
      originalText: item.originalText,
      studentAnswer: item.studentAnswer || '',
      visualContext: item.visualContext || '',
      standardAnswer: item.standardAnswer || null,
      gradeConstraint,
      imageBase64: imageBase64 || undefined
    });

    const scoreVal = diagResult.score !== undefined ? Number(diagResult.score) : 0;
    const isPerfect = scoreVal >= 100 || (diagResult.errorReason && (diagResult.errorReason.includes('完全掌握') || diagResult.errorReason.includes('无错') || diagResult.errorReason.includes('正确')));
    const finalErrorReason = isPerfect ? '【完全掌握/无误】完美作答' : (diagResult.errorReason || '【概念/审题】');
    const finalMasteryStatus = isPerfect ? 'mastered' : 'not_mastered';

    diagnosedResults.push({
      id: crypto.randomUUID ? crypto.randomUUID() : (Date.now() + Math.random()).toString(),
      imageUrl: imageBase64 || undefined,
      originalText: unwrapJsonString(item.originalText, 'originalText'),
      subject: item.subject || '数学',
      knowledgePoints: diagResult.knowledgePoints || [],
      examDirection: diagResult.examDirection || '未提取',
      errorReason: finalErrorReason,
      solution: diagResult.solution || '',
      createdAt: Date.now(),
      studentAnswer: unwrapJsonString(item.studentAnswer || '', 'studentAnswer'),
      errorDiagnosis: [],
      errorAnalysis: diagResult.errorAnalysis || '',
      notebookId: notebookId || undefined,
      score: scoreVal,
      masteryStatus: finalMasteryStatus,
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

  // 获取最终入库的图片 URL：如果仍是 Base64 格式则落盘为物理文件
  let finalImageUrl: string | null = imageUrl || null;
  if (finalImageUrl && isBase64Image(finalImageUrl)) {
    try {
      finalImageUrl = saveBase64Image(finalImageUrl);
      console.log("[TaskQueue] 归档时图片落盘成功:", finalImageUrl);
    } catch (imgErr) {
      console.warn("[TaskQueue] 归档时图片落盘失败，将以 Base64 入库:", imgErr);
    }
  }

  const stmt = db.prepare(`
    INSERT INTO questions (
      id, userId, status, imageUrl, originalText, subject, knowledgePoints, errorReason, solution, createdAt, studentAnswer, errorDiagnosis, errorAnalysis, notebookId, score, masteryStatus, standardAnswer, examDirection
    ) VALUES (?, ?, 'audited', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (let i = 0; i < activeQuestions.length; i++) {
    const q = activeQuestions[i];
    const id = crypto.randomUUID ? crypto.randomUUID() : (Date.now() + Math.random()).toString();

    stmt.run(
      id,
      userId,
      finalImageUrl,
      unwrapJsonString(q.originalText, 'originalText'),
      q.subject || '数学',
      JSON.stringify(q.knowledgePoints || []),
      q.errorReason || '概念不清',
      q.solution || '',
      Date.now() + i, // 稍微错开时间戳以保证排序相对顺序
      unwrapJsonString(q.studentAnswer || '', 'studentAnswer'),
      JSON.stringify(q.errorDiagnosis || []),
      q.errorAnalysis || '',
      notebookId || null,
      q.score !== undefined ? q.score : null,
      q.masteryStatus || 'not_mastered',
      q.standardAnswer || null,
      q.examDirection || null
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

    // 提前将 Base64 图片落盘为物理文件，savedImageUrl 仅用于数据库存储
    // 注意：imageBase64 原始数据必须保留，因为后续 AI OCR 阶段需要将其传给远程 AI API
    let savedImageUrl: string | null = null;
    if (payload.imageBase64 && isBase64Image(payload.imageBase64)) {
      try {
        savedImageUrl = saveBase64Image(payload.imageBase64);
        // 仅追加落盘路径字段，不清空 imageBase64（AI OCR 阶段仍需要原始 Base64 数据）
        payload.savedImageUrl = savedImageUrl;
        console.log(`[TaskQueue] 任务 Payload 图片落盘成功: ${savedImageUrl}`);
      } catch (imgErr) {
        console.warn("[TaskQueue] 创建任务时图片落盘失败，将在归档时重新尝试落盘:", imgErr);
      }
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
    const statusParam = req.query.status;
    if (statusParam === 'active') {
      const stmt = db.prepare(`
        SELECT id, userId, taskName, status, progress, autoRun, uploadMode, notebookId, payload, createdAt, updatedAt, errorMsg, isNotified 
        FROM background_tasks 
        WHERE userId = ? AND status IN ('queued', 'extracting', 'diagnosing', 'pending_extract_review', 'pending_diagnose_review')
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
        payload: row.payload ? JSON.parse(row.payload) : {},
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        errorMsg: row.errorMsg || undefined,
        isNotified: row.isNotified !== undefined ? row.isNotified : 0
      }));
      return res.json(tasks);
    }

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
