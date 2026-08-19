import express from "express";
import crypto from "crypto";
import { db } from "../config/db";
import { AuthenticatedRequest } from "../middleware/auth";
import { generateContentWithFallback, extractJsonString, sanitizeJsonString } from "../services/aiService";
import { executeDeepDiagnosis } from "../services/diagnosticEngine";
import { GEOMETRY_PROMPT_TEMPLATE } from "./aiController";
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

// ===== 第二阶段：按 userId 分组的线程池队列 =====
// 需求：同一账号同一时刻仅处理 1 个请求（其余按提交顺序进入该账号专属队列排队），不同账号之间可并行。
// 为兼容第一阶段，统一使用该分组队列；第一阶段任务也会自动获得"同账号串行、跨账号并行"能力。
const userQueues = new Map<string, string[]>();      // userId -> taskId 队列
const userActiveWorkers = new Set<string>();         // 正在处理中的 userId

// 在服务器启动或重载时，将所有未完成且非等待审核的任务按 userId 加入各自队列
export const initTaskQueue = () => {
  try {
    const pendingTasks = db.prepare(`
      SELECT id, userId FROM background_tasks 
      WHERE status IN ('queued', 'extracting', 'diagnosing', 'generating_variation')
    `).all() as { id: string; userId: string }[];
    
    // 重置异常断电时的处理中状态为 queued
    db.prepare(`
      UPDATE background_tasks 
      SET status = 'queued', progress = 0 
      WHERE status IN ('extracting', 'diagnosing', 'generating_variation')
    `).run();

    for (const task of pendingTasks) {
      if (!userQueues.has(task.userId)) userQueues.set(task.userId, []);
      userQueues.get(task.userId)!.push(task.id);
    }
    console.log(`[TaskQueue] 成功初始化，已将 ${pendingTasks.length} 个挂起任务按账号分组加入队列。`);
    triggerAllQueues();
  } catch (err) {
    console.error("[TaskQueue] 初始化失败:", err);
  }
};

// 触发所有有排队任务的账号队列
const triggerAllQueues = () => {
  for (const userId of userQueues.keys()) {
    triggerQueue(userId);
  }
};

// 触发指定账号的队列：若该账号当前无在途请求且有排队任务，则取出队首执行
const triggerQueue = (userId?: string) => {
  if (!userId) return;
  const q = userQueues.get(userId);
  if (!q || q.length === 0) return;
  if (userActiveWorkers.has(userId)) return; // 该账号已在处理中，其余排队
  const taskId = q.shift();
  if (!taskId) return;
  userActiveWorkers.add(userId);
  processTask(taskId).finally(() => {
    userActiveWorkers.delete(userId);
    // 队列可能还有该账号的后续任务，继续触发
    triggerQueue(userId);
  });
};

// 兼容旧调用（第一阶段 createTask / submitReview 直接调用 triggerQueue）
// 为了不破坏原有调用点，提供一个通过任务 id 定位 userId 再入队的入口
const enqueueTask = (taskId: string) => {
  const task = db.prepare("SELECT userId FROM background_tasks WHERE id = ?").get(taskId) as { userId: string } | undefined;
  if (!task) return;
  if (!userQueues.has(task.userId)) userQueues.set(task.userId, []);
  userQueues.get(task.userId)!.push(taskId);
  triggerQueue(task.userId);
};

// 创建任务入队：按 userId 分组
const enqueueForUser = (userId: string, taskId: string) => {
  if (!userQueues.has(userId)) userQueues.set(userId, []);
  userQueues.get(userId)!.push(taskId);
  triggerQueue(userId);
};

// 供其他控制器（如 jiaoxueController）将新建任务加入后台线程池队列
export const enqueueTaskForUser = (userId: string, taskId: string) => {
  enqueueForUser(userId, taskId);
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

    // ===== 第二阶段：快速答题（仅输出标准答案/关键步骤，跳过诊断） =====
    if (task.uploadMode === 'quick_answer') {
      if (task.status === 'queued') {
        db.prepare("UPDATE background_tasks SET status = 'extracting', progress = 20, updatedAt = ?, isNotified = 0 WHERE id = ?").run(Date.now(), id);
        console.log(`[TaskQueue] [${id}] 快速答题：进入文本提取阶段`);
        const optimizedBase64 = await enhanceImageForOcr(payload.imageBase64);
        const extracted = await runAiExtract(optimizedBase64, payload.mimeType, payload.extractMode || 'single');
        payload.extractedQuestions = extracted;
        task.status = 'extracting';
        db.prepare("UPDATE background_tasks SET payload = ?, updatedAt = ? WHERE id = ?").run(JSON.stringify(payload), Date.now(), id);
      }

      if (task.status === 'extracting') {
        db.prepare("UPDATE background_tasks SET status = 'generating_answer', progress = 60, updatedAt = ?, isNotified = 0 WHERE id = ?").run(Date.now(), id);
        console.log(`[TaskQueue] [${id}] 快速答题：生成标准答案/关键步骤`);
        const answers = await runAiQuickAnswer(payload.extractedQuestions);
        payload.quickAnswers = answers;
        db.prepare("UPDATE background_tasks SET status = 'completed', progress = 100, payload = ?, updatedAt = ?, isNotified = 0 WHERE id = ?")
          .run(JSON.stringify(payload), Date.now(), id);
        console.log(`[TaskQueue] [${id}] 快速答题完成`);
      }
      return;
    }

    // ===== 第二阶段：作业批改（完整 OCR + 诊断，完成后进入待审查，归档到学生错题本） =====
    if (task.uploadMode === 'correct_task') {
      if (task.status === 'queued') {
        db.prepare("UPDATE background_tasks SET status = 'extracting', progress = 20, updatedAt = ?, isNotified = 0 WHERE id = ?").run(Date.now(), id);
        console.log(`[TaskQueue] [${id}] 作业批改：进入文本提取阶段`);
        const optimizedBase64 = await enhanceImageForOcr(payload.imageBase64);
        const extracted = await runAiExtract(optimizedBase64, payload.mimeType, payload.extractMode || 'single');
        payload.extractedQuestions = extracted;
        task.status = 'extracting';
        db.prepare("UPDATE background_tasks SET payload = ?, updatedAt = ? WHERE id = ?").run(JSON.stringify(payload), Date.now(), id);
      }

      if (task.status === 'extracting') {
        db.prepare("UPDATE background_tasks SET status = 'diagnosing', progress = 60, updatedAt = ?, isNotified = 0 WHERE id = ?").run(Date.now(), id);
        console.log(`[TaskQueue] [${id}] 作业批改：进入 AI 智能诊断阶段`);
        const diagnosed = await runAiDiagnoseAll(payload.extractedQuestions, payload.imageBase64, task.notebookId);
        payload.diagnosedQuestions = diagnosed;
        // 批改完成后自动进入待审查（教学老师需审查确认后才能归档到学生错题本）
        db.prepare("UPDATE background_tasks SET status = 'pending_diagnose_review', progress = 80, payload = ?, updatedAt = ?, isNotified = 0 WHERE id = ?")
          .run(JSON.stringify(payload), Date.now(), id);
        console.log(`[TaskQueue] [${id}] 作业批改完成，已进入待审查列表`);
      }
      return;
    }

    // 第一阶段：针对 AI 变式题异步排队生成任务
    if (task.uploadMode === 'variation' && task.status === 'queued') {
      db.prepare("UPDATE background_tasks SET status = 'generating_variation', progress = 30, updatedAt = ?, isNotified = 0 WHERE id = ?").run(Date.now(), id);
      console.log(`[TaskQueue] [${id}] 进入 AI变式题深度推理阶段`);

      const variations = await runAiVariation(payload, task.userId);
      await saveVariationQuestionsToLibrary(task.userId, variations, task.notebookId, payload);
      
      db.prepare("UPDATE background_tasks SET status = 'completed', progress = 100, updatedAt = ?, isNotified = 0 WHERE id = ?").run(Date.now(), id);
      console.log(`[TaskQueue] [${id}] AI变式题成功深度推理并自动落盘归档完毕！`);
      return;
    }

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
export function unwrapJsonString(str: any, fieldHint?: 'originalText' | 'studentAnswer' | 'solution' | 'errorAnalysis' | 'standardAnswer'): string {
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

// ===== 第二阶段：快速答题（只求标准答案 + 关键解题步骤，不分析错因） =====
const runAiQuickAnswer = async (questions: any[]): Promise<any[]> => {
  const results: any[] = [];
  for (const item of (questions || [])) {
    let standardAnswer = item.standardAnswer || '';
    let keySteps = '';
    try {
      const prompt = `
你是一位快速答题助手。请根据以下题目信息，只输出【标准答案】和【解题关键步骤】，无需分析错因、无需诊断掌握程度。

【题目】
- 学科: ${item.subject || '数学'}
- 题干: ${item.originalText || ''}
${item.studentAnswer ? `- 学生作答（仅供参考）: ${item.studentAnswer}` : ''}

【输出要求】请严格按以下 JSON 对象返回，不要包含 Markdown 代码块标记：
{
  "standardAnswer": "本题的标准答案/正确结果",
  "keySteps": "解题的关键步骤，分步用 1. 2. 3. 列出，含必要的公式"
}
数学公式用标准 $ 或 $$ 包围（LaTeX），JSON 中反斜杠双写转义。
`;
      const response = await generateContentWithFallback({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: { temperature: 0.2 }
      });
      const text = response.text || '';
      if (text) {
        const extracted = extractJsonString(text);
        const parsed = JSON.parse(sanitizeJsonString(extracted));
        standardAnswer = parsed.standardAnswer || standardAnswer;
        keySteps = parsed.keySteps || '';
      }
    } catch (e) {
      console.warn("快速答题 AI 解析失败，保留 OCR 标准答案:", e);
    }
    results.push({
      id: crypto.randomUUID ? crypto.randomUUID() : (Date.now() + Math.random()).toString(),
      originalText: unwrapJsonString(item.originalText, 'originalText'),
      subject: item.subject || '数学',
      standardAnswer: unwrapJsonString(standardAnswer, 'standardAnswer'),
      keySteps
    });
  }
  return results;
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

const runAiVariation = async (payload: any, userId: string) => {
  const { originalText, subject, knowledgePoints, count, grade, variantMode, examDirection, kps } = payload;
  const numQuestions = Math.min(3, Math.max(1, count || 1));

  const modeInstruction = variantMode === '条件升级'
    ? "【条件升级模式】：在原考点基础上增加隐蔽条件，或者将直接已知条件转为需要通过多一步计算先求出的间接条件，整体难度提升一星。绝对不允许超纲！绝对不允许引入更高年级的知识点（例如小学题绝对禁止考查初中几何定理）！"
    : variantMode === '逆向陷阱'
      ? "【逆向陷阱模式】：强制要求采用逆向思维出题（例如给出原题的结果，要求反推原题的某个初始条件）；或者在题目中设置该知识点常见的易错陷阱（如定义域陷阱、单位陷阱、隐含的分类讨论），重点考察学生是否真正理解，而非死记硬背套公式。"
      : "【同考点换壳模式】：保持原始难度和解题路径，仅修改具体的数值、已知条件的描述方式或情境背景，使题目成为一道全新的换壳题。";

  const prompt = `
你是一位经验丰富的高中数学/物理/化学名师。请根据以下原题信息，出 ${numQuestions} 道【相似度约80%】的同类练习题。

【原题信息】
- 学科: ${subject || '数学'}
- 题目内容: ${originalText || ''}
- 核心知识点: ${knowledgePoints?.join(', ') || ''}

【命题要求】
1. 核心知识点与原题完全相同。
2. 题型、核心公式类型尽量与原题保持一致（除非变式模式要求提升难度或逆向推理）。
3. ${modeInstruction}
4. 【极度重要 - 逆向推导命题法】：为了保证计算结果是干净的有限小数或整数，涉及圆柱、圆锥体积计算时，你必须先在后台预设好合理的半径 r 和高 h，且**强制规定高 h 必须是 3 的倍数**（如 3, 6, 9），以消除圆锥公式中 1/3 导致的无限循环小数。算好题干需要的表面积等数值后，再输出题目。
5. 【极度重要 - 场景迁移与常识编排】：必须改变原题的**生活应用场景（换一个故事外壳）**。例如更换物品材质（从橡皮泥换成木材、金属、食物等），并根据新材质的物理特性使用合理的动词（如金属对应熔铸，木材对应切削/损耗，橡皮泥对应重塑/体积不变）。同时根据场景自然改变最终的提问方式（如求原体积、损耗体积、剩余体积等），使其读起来像一个全新的故事，绝对不能只改数字！
6. 知识点/图形/公式均不超出原题所述学段水平。
7. 数学公式必须用标准 $ 或 $$ 包围。**注意：JSON 字符串中的所有 LaTeX 反斜杠必须双写转义（例如 \\\\pi, \\\\frac, \\\\text），否则会导致 JSON 解析失败！**
8. 【极度重要】：保持与原题完全一致的年级和学段级别（例如原题如果是小学六年级，生成的同类题也必须是小学六年级水平；原题如果是高一，生成的题也必须是高一水平。若指定了年级为：${grade || '自动识别原题年级'}，请严格按照该年级设计，绝对不能超纲或降纲）。
9. 【数量要求】：你必须生成且只能生成正好 ${numQuestions} 道题目。

${GEOMETRY_PROMPT_TEMPLATE}

${numQuestions === 1 ? `
请严格按以下单个 JSON 对象格式返回，不要包含 Markdown 代码块标记，不要包含其他任何解释性文字：
{
  "thinkingProcess": "【极为重要】在写题目和解析前，必须在此处打草稿！预先设定好干净的整数/有限小数值（如 r=2, h=3），计算出需要的表面积/体积数值，然后再生成题目！",
  "questionText": "新题目的完整文字（纯文字+LaTeX公式，不包含任何SVG代码）",
  "solution": "详细解题步骤（含LaTeX公式，每步用1. 2. 3.标注）",
  "geometry": {
    "type": "coordinate",
    "xRange": [-6, 2],
    "yRange": [-4, 2],
    "shapes": [
      {"type":"polygon","points":[[-4,-1],[-3,-3],[-1,-2]],"fill":"#eff6ff","stroke":"#374151"},
      {"type":"point","x":-4,"y":-1,"r":3,"fill":"#374151"},
      {"type":"label","text":"A","x":-4.4,"y":-0.7,"color":"#1e293b","anchor":"middle"}
    ],
    "solids": []
  }
}
` : `
请严格按以下 JSON 数组格式返回，包含 ${numQuestions} 个元素对象，不要包含 Markdown 代码块标记，不要包含其他任何解释性文字：
[
  {
    "thinkingProcess": "预先设定变量和数值推演草稿...",
    "questionText": "第1道新题目的完整文字...",
    "solution": "第1道新题的详细解题步骤...",
    "geometry": { ... }
  },
  ...
]
`}
`;

  const response = await generateContentWithFallback({
    contents: [
      {
        role: 'user',
        parts: [
          { text: prompt }
        ]
      }
    ],
    config: {
      temperature: 0.7
    }
  });

  const text = response.text;
  if (!text) throw new Error("Empty response from AI variation");

  let data: any;
  try {
    const extracted = extractJsonString(text);
    data = JSON.parse(sanitizeJsonString(extracted));
  } catch {
    let fallback = text.trim();
    if (fallback.startsWith('```')) {
      fallback = fallback.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/, '').trim();
    }
    data = JSON.parse(fallback);
  }
  const dataArray = Array.isArray(data) ? data : [data];
  return dataArray;
};

const saveVariationQuestionsToLibrary = async (userId: string, variations: any[], notebookId: string | null, payload: any) => {
  if (!variations || variations.length === 0) return;

  const stmt = db.prepare(`
    INSERT INTO questions (
      id, userId, status, originalText, subject, knowledgePoints, errorReason, solution, createdAt, similarQuestion, notebookId, masteryStatus, examDirection, studentId
    ) VALUES (?, ?, 'audited', ?, ?, ?, 'AI变式题', ?, ?, ?, ?, 'not_mastered', ?, ?)
  `);

  for (let i = 0; i < variations.length; i++) {
    const item = variations[i];
    if (!item) continue;
    const id = crypto.randomUUID ? crypto.randomUUID() : "q_var_" + Math.random().toString(36).substring(2, 9);
    stmt.run(
      id,
      userId,
      item.questionText || item.originalText || "",
      item.subject || payload.subject || "数学",
      JSON.stringify(payload.kps || payload.knowledgePoints || []),
      item.solution || "",
      Date.now() + i,
      JSON.stringify(item),
      notebookId || null,
      payload.examDirection || null,
      payload.studentId || null
    );
  }
};


// ================= Express API 路由处理方法 =================

// 1. 创建后台任务
export const createTask = async (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const { taskName, autoRun, uploadMode, notebookId, payload } = req.body;
    if (!payload || (!payload.imageBase64 && uploadMode !== 'variation')) {
      return res.status(400).json({ error: "参数不完整，缺少必要的任务数据" });
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

    // 压入后台执行队列（按 userId 分组），并触发 Worker
    enqueueForUser(req.userId!, taskId);

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
        WHERE userId = ? AND status IN ('queued', 'extracting', 'diagnosing', 'pending_extract_review', 'pending_diagnose_review', 'generating_variation')
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
          COUNT(CASE WHEN status IN ('queued', 'extracting', 'diagnosing', 'generating_variation') THEN 1 END) as runningCount,
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

      // 压回队列（按 userId 分组），继续进行诊断
      enqueueForUser(req.userId!, id);

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

    // 从内存处理队列中移除 (如果还在排队，按 userId 分组)
    const userQueue = userQueues.get(req.userId!);
    if (userQueue) {
      const index = userQueue.indexOf(id);
      if (index !== -1) {
        userQueue.splice(index, 1);
      }
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
