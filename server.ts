import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import Database from "better-sqlite3";
import crypto from "crypto";
import nodemailer from "nodemailer";
dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || "3008");

// 初始化 SQLite 数据库
const db = new Database(path.join(process.cwd(), "questions.db"));
db.pragma("journal_mode = WAL");

// 配置 SMTP 发送服务
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.qq.com",
  port: parseInt(process.env.SMTP_PORT || "465"),
  secure: parseInt(process.env.SMTP_PORT || "465") === 465,
  auth: {
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || ""
  }
});

// 初始化表结构
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    username TEXT PRIMARY KEY,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'student',
    lastAiResetDate TEXT,
    aiUsedToday INTEGER NOT NULL DEFAULT 0,
    idCardLast6 TEXT,
    phoneLast4 TEXT
  );
  
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    createdAt INTEGER NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS verification_codes (
    email TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    createdAt INTEGER NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS questions (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    studentId TEXT,
    status TEXT DEFAULT 'pending',
    imageUrl TEXT,
    originalText TEXT NOT NULL,
    subject TEXT NOT NULL,
    knowledgePoints TEXT,
    errorReason TEXT,
    solution TEXT,
    createdAt INTEGER NOT NULL,
    similarQuestion TEXT
  );
  
  CREATE INDEX IF NOT EXISTS idx_questions_userId ON questions(userId);

  CREATE TABLE IF NOT EXISTS public_questions (
    id TEXT PRIMARY KEY,
    originalText TEXT NOT NULL,
    subject TEXT NOT NULL,
    knowledgePoints TEXT,
    solution TEXT,
    createdAt INTEGER NOT NULL
  );
`);

// 数据库迁移逻辑：检测 questions 表是否缺少 userId 字段
try {
  const tableInfo = db.pragma("table_info(questions)") as any[];
  const hasUserId = tableInfo.some(col => col.name === 'userId');
  if (!hasUserId) {
    console.log("检测到旧版数据库结构，正在升级 questions 表以支持多用户体系...");
    db.exec("ALTER TABLE questions ADD COLUMN userId TEXT NOT NULL DEFAULT 'admin'");
    db.exec("CREATE INDEX IF NOT EXISTS idx_questions_userId ON questions(userId)");
    console.log("questions 表升级成功！");
  }
} catch (err) {
  console.error("questions 数据库迁移检查失败:", err);
}

// 数据库迁移逻辑：检测 questions 表是否缺少 studentId 和 status 字段
try {
  const tableInfo = db.pragma("table_info(questions)") as any[];
  const hasStudentId = tableInfo.some(col => col.name === 'studentId');
  if (!hasStudentId) {
    console.log("正在升级 questions 表以支持学生分配字段...");
    db.exec("ALTER TABLE questions ADD COLUMN studentId TEXT");
  }
  const hasStatus = tableInfo.some(col => col.name === 'status');
  if (!hasStatus) {
    db.exec("ALTER TABLE questions ADD COLUMN status TEXT DEFAULT 'pending'");
  }
  db.exec("UPDATE questions SET status = 'audited' WHERE status IS NULL");

  // 迁移逻辑：检测并添加学生手写作答与步骤诊断字段
  const hasStudentAnswer = tableInfo.some(col => col.name === 'studentAnswer');
  if (!hasStudentAnswer) {
    console.log("正在升级 questions 表以支持学生作答提取字段...");
    db.exec("ALTER TABLE questions ADD COLUMN studentAnswer TEXT");
  }
  const hasErrorDiagnosis = tableInfo.some(col => col.name === 'errorDiagnosis');
  if (!hasErrorDiagnosis) {
    console.log("正在升级 questions 表以支持步骤错误诊断字段...");
    db.exec("ALTER TABLE questions ADD COLUMN errorDiagnosis TEXT");
  }
} catch (err) {
  console.error("questions 新字段迁移检查失败:", err);
}

// 数据库迁移逻辑：检测 users 表是否缺少多用户管理和限流字段
try {
  const tableInfo = db.pragma("table_info(users)") as any[];
  const hasRole = tableInfo.some(col => col.name === 'role');
  if (!hasRole) {
    console.log("检测到旧版数据库结构，正在升级 users 表以支持多用户等级与限流...");
    db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'student'");
  }
  
  // 迁移普通用户为学生角色，VIP/SVIP 迁移为老师角色
  try {
    db.exec("UPDATE users SET role = 'student' WHERE role = 'normal'");
    db.exec("UPDATE users SET role = 'teacher' WHERE role IN ('vip', 'svip')");
    console.log("用户角色成功升级迁移 (normal->student, vip/svip->teacher)！");
  } catch (migrateErr) {
    console.error("角色迁移升级失败:", migrateErr);
  }

  const hasResetDate = tableInfo.some(col => col.name === 'lastAiResetDate');
  if (!hasResetDate) {
    db.exec("ALTER TABLE users ADD COLUMN lastAiResetDate TEXT");
  }
  const hasAiUsed = tableInfo.some(col => col.name === 'aiUsedToday');
  if (!hasAiUsed) {
    db.exec("ALTER TABLE users ADD COLUMN aiUsedToday INTEGER NOT NULL DEFAULT 0");
  }
  
  // 新增身份证与手机字段检测迁移
  const hasIdCard = tableInfo.some(col => col.name === 'idCardLast6');
  if (!hasIdCard) {
    console.log("正在升级 users 表以支持身份证后6位字段...");
    db.exec("ALTER TABLE users ADD COLUMN idCardLast6 TEXT");
  }
  const hasPhone = tableInfo.some(col => col.name === 'phoneLast4');
  if (!hasPhone) {
    console.log("正在升级 users 表以支持手机号后4位字段...");
    db.exec("ALTER TABLE users ADD COLUMN phoneLast4 TEXT");
  }
  
  console.log("users 表升级检查完成！");
} catch (err) {
  console.error("users 数据库迁移检查失败:", err);
}

// 自动初始化 admin 用户
try {
  const hashPasswordTemp = (pwd: string) => crypto.createHash("sha256").update(pwd).digest("hex");
  const adminUser = db.prepare("SELECT username, role FROM users WHERE username = 'admin'").get() as { username: string, role: string } | undefined;
  if (!adminUser) {
    console.log("检测到无管理员用户，正在创建默认管理员账号: admin / admin123");
    db.prepare("INSERT INTO users (username, password, role) VALUES ('admin', ?, 'admin')").run(hashPasswordTemp("admin123"));
  } else if (adminUser.role !== 'admin') {
    console.log("检测到已存在 admin 账号但其角色不为管理员，正在强制升级其角色等级并重置密码为 admin123...");
    db.prepare("UPDATE users SET role = 'admin', password = ? WHERE username = 'admin'").run(hashPasswordTemp("admin123"));
  }
} catch (err) {
  console.error("初始化 admin 失败:", err);
}


// 密码哈希
function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password).digest("hex");
}

// 鉴权请求接口
interface AuthenticatedRequest extends express.Request {
  userId?: string;
}

// 鉴权中间件
const requireAuth = (req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "未登录，请先登录" });
  }
  const token = authHeader.substring(7);
  try {
    const stmt = db.prepare("SELECT username FROM sessions WHERE token = ?");
    const row = stmt.get(token) as { username: string } | undefined;
    if (!row) {
      return res.status(401).json({ error: "登录已过期或凭证无效，请重新登录" });
    }
    req.userId = row.username;
    next();
  } catch (err) {
    console.error("Auth Middleware Error:", err);
    return res.status(500).json({ error: "服务器内部鉴权错误" });
  }
};

// 限制 AI 使用次数中间件
const checkAiLimit = (req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) => {
  const username = req.userId;
  if (!username) {
    return res.status(401).json({ error: "未登录，请先登录" });
  }
  
  if (username === 'admin') {
    return next();
  }

  try {
    const user = db.prepare("SELECT role, lastAiResetDate, aiUsedToday FROM users WHERE username = ?").get(username) as {
      role: string;
      lastAiResetDate: string | null;
      aiUsedToday: number;
    } | undefined;

    if (!user) {
      return res.status(404).json({ error: "用户不存在" });
    }

    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    let used = user.aiUsedToday;

    if (user.lastAiResetDate !== today) {
      db.prepare("UPDATE users SET lastAiResetDate = ?, aiUsedToday = 0 WHERE username = ?").run(today, username);
      used = 0;
    }

    let limit = 30;
    if (user.role === 'teacher') limit = 5000;
    else if (user.role === 'admin') limit = Infinity;

    if (used >= limit) {
      return res.status(429).json({ error: `您今日的 AI 额度已用尽（当前等级: ${user.role.toUpperCase()}，每日额度: ${limit}次）。如需更多额度，请联系管理员。` });
    }

    // 预扣除 AI 使用次数
    db.prepare("UPDATE users SET aiUsedToday = aiUsedToday + 1 WHERE username = ?").run(username);
    next();
  } catch (err) {
    console.error("AI Limit Check Error:", err);
    return res.status(500).json({ error: "服务器限额校验失败" });
  }
};

// 管理员专用中间件
const requireAdmin = (req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) => {
  requireAuth(req, res, () => {
    try {
      const user = db.prepare("SELECT role FROM users WHERE username = ?").get(req.userId) as { role: string } | undefined;
      if (!user || user.role !== 'admin') {
        return res.status(403).json({ error: "权限不足，只有系统管理员方可访问此资源" });
      }
      next();
    } catch (err) {
      return res.status(500).json({ error: "服务器内部鉴权错误" });
    }
  });
};

// Need to increase body limit for base64 images
app.use(express.json({ limit: '50mb' }));

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const AI_PROVIDER = process.env.AI_PROVIDER || 'gemini';
const AI_API_BASE_URL = process.env.AI_API_BASE_URL || '';
const AI_API_KEY = process.env.AI_API_KEY || '';

// Robust helper function with automatic fallback to gemma-4-26b-a4b-it or OpenAI provider compatible output
async function generateContentWithFallback(params: {
  contents: any[];
  config?: any;
  model?: string;
  systemPrompt?: string;
}) {
  if (AI_PROVIDER === 'openai') {
    const modelToUse = params.model || process.env.AI_MODEL || 'deepseek-chat';
    console.log(`[AI Request via OpenAI Compat] Using model: ${modelToUse}`);
    
    // 自动将 Gemini contents 格式翻译转换为 OpenAI messages 格式
    const userMessages = params.contents.map(c => {
      const openAiContent: any[] = [];
      if (c.parts) {
        for (const part of c.parts) {
          if (part.text) {
            openAiContent.push({ type: 'text', text: part.text });
          } else if (part.inlineData) {
            openAiContent.push({
              type: 'image_url',
              image_url: {
                url: `data:${part.inlineData.mimeType || 'image/jpeg'};base64,${part.inlineData.data}`
              }
            });
          }
        }
      }
      return {
        role: c.role || 'user',
        content: openAiContent.length === 1 && openAiContent[0].type === 'text'
          ? openAiContent[0].text
          : openAiContent
      };
    });

    // 如果有 systemPrompt，则在 messages 数组最前面注入 system 角色消息
    const messages = params.systemPrompt
      ? [{ role: 'system', content: params.systemPrompt }, ...userMessages]
      : userMessages;

    try {
      const response = await fetch(`${AI_API_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${AI_API_KEY}`
        },
        body: JSON.stringify({
          model: modelToUse,
          messages: messages,
          temperature: params.config?.temperature ?? 0.7
          // 注意：此处不使用 response_format: json_object，因为它要求顶层必须是 {}，
          // 与我们需要返回 JSON 数组 [] 的格式冲突，改为在 prompt 中约束格式。
        })
      });

      const json = await response.json() as any;
      if (!response.ok) {
        throw new Error(json.error?.message || `OpenAI API Error: status code ${response.status}`);
      }

      const text = json.choices?.[0]?.message?.content;
      if (!text) throw new Error("Empty response from OpenAI compatible API");
      
      return { text };
    } catch (error: any) {
      console.error("[AI OpenAI Error] request failed:", error);
      throw error;
    }
  }

  // 以下为 Gemini / Google GenAI 默认处理逻辑
  const primaryModel = process.env.GEMINI_MODEL || 'gemma-4-31b-it';
  const modelToUse = params.model || primaryModel;

  try {
    console.log(`[AI Request] Using model: ${modelToUse}`);
    return await ai.models.generateContent({
      ...params,
      model: modelToUse,
    });
  } catch (error: any) {
    const errorStr = (error.message || error.toString() || "").toLowerCase();
    const isRetriableError = errorStr.includes("429") || 
                         errorStr.includes("quota") || 
                         errorStr.includes("limit") || 
                         errorStr.includes("resource_exhausted") || 
                         errorStr.includes("rate_limit") ||
                         errorStr.includes("socket") ||
                         errorStr.includes("fetch failed") ||
                         errorStr.includes("503") ||
                         errorStr.includes("unavailable") ||
                         errorStr.includes("high demand") ||
                         (error.status && (error.status === 503 || error.status === 429));

    if (isRetriableError && modelToUse !== 'gemma-4-26b-a4b-it') {
      console.warn(`[AI Warning] Model ${modelToUse} failed due to network or quota limit: ${error.message || error.toString()}. Automatically retrying with fallback 'gemma-4-26b-a4b-it'...`);
      try {
        return await ai.models.generateContent({
          ...params,
          model: 'gemma-4-26b-a4b-it',
        });
      } catch (fallbackError: any) {
        console.error("[AI Error] Fallback to gemma-4-26b-a4b-it also failed:", fallbackError);
        throw fallbackError;
      }
    }
    throw error;
  }
}

// API Route for analyzing an image
app.post("/api/analyze", requireAuth, checkAiLimit, async (req: AuthenticatedRequest, res) => {
  try {
    // 检查角色权限：学生无法使用 AI 功能
    const user = db.prepare("SELECT role FROM users WHERE username = ?").get(req.userId) as { role: string } | undefined;
    if (!user || user.role === 'student') {
      return res.status(403).json({ error: "权限不足，学生角色无法使用 AI 解析功能" });
    }

    const { imageBase64, mimeType } = req.body;
    if (!imageBase64) {
       return res.status(400).json({ error: "Missing imageBase64" });
    }

    const prompt = `
【任务说明】请仔细观察图片，执行以下分析任务：

【第一步 - 必须先数题目数量】：
扫描图片，找出所有带有独立题号的大题（题号通常是阿拉伯数字，如"20."、"21."、"22."）。
记住这个数量，后续必须创建同等数量的数组元素。

【第二步 - 逐题独立分析】：
针对第一步识别到的每一道独立大题，分别创建一个对象，填写以下字段：
- "originalText": 【仅限本题】的完整题干文字（含题号，如"20. 在平面..."）。严禁把其他题号的题干混入此字段。
- "subject": 本题学科（数学/物理/化学/英语/语文等）。
- "knowledgePoints": 本题核心考点，最多3个。
- "solution": 【仅针对本题】的详细解题步骤，含LaTeX公式。
- "hasStudentAnswer": 本题区域内是否有学生手写作答痕迹（true/false）。
- "studentAnswer": 【仅本题】学生手写的原始文本（无则空字符串）。
- "errorDiagnosis": 若本题有学生作答，将【本题学生的解答步骤】逐行数字化。步骤序号从1开始重新计数。每步包含：
  * "stepNumber": 本题内的步骤序号（每道题从1开始重置）。
  * "stepContent": 该步骤内容（数学公式用$...$包围）。
  * "status": "correct" / "incorrect" / "consequential_error"。
  * "comment": 仅在错误步骤时填写说明。

【第三步 - 组装JSON数组】：
将所有题目对象按题号顺序组装成JSON数组输出。数组元素数量必须严格等于第一步数到的题目数量。

输出格式（示例为图片中有3道独立大题 第20、21、22题时）：
[
  {
    "originalText": "20. 第20题完整题干...",
    "subject": "数学",
    "knowledgePoints": ["两点间距离公式"],
    "solution": "第20题解题过程...",
    "hasStudentAnswer": true,
    "studentAnswer": "学生对第20题的手写解答",
    "errorDiagnosis": [
      { "stepNumber": 1, "stepContent": "$AB=\\sqrt{...}$", "status": "correct", "comment": "" }
    ]
  },
  {
    "originalText": "21. 第21题完整题干...",
    "subject": "数学",
    "knowledgePoints": ["三角形重心性质"],
    "solution": "第21题解题过程...",
    "hasStudentAnswer": true,
    "studentAnswer": "学生对第21题的手写解答",
    "errorDiagnosis": [
      { "stepNumber": 1, "stepContent": "G是重心，$AG=\\frac{2}{3}AE$", "status": "correct", "comment": "" }
    ]
  },
  {
    "originalText": "22. 第22题完整题干...",
    "subject": "数学",
    "knowledgePoints": ["平行线画法与面积平分"],
    "solution": "第22题解题过程...",
    "hasStudentAnswer": false,
    "studentAnswer": "",
    "errorDiagnosis": []
  }
]
`;
    // System prompt: 严格约束模型必须输出 JSON 数组，每道题独立成一个对象
    const systemPrompt = `你是一个严谨的 AI 智能名师助手。你的输出格式有且只有一种：一个合法的 JSON 数组（以 [ 开头，以 ] 结尾）。
你必须遵守以下铁律：
1. 【绝对禁止】将图片中多道独立的题目（如第20题、第21题、第22题）合并为一个数组元素返回。
2. 图片中有几道独立的题目（以题号区分，例如 20、21、22），就必须返回几个独立的数组元素对象。
3. 每个数组元素对象只能包含其对应题目的内容，不能混入其他题目的题干、解析或步骤。
4. 你的整个回复内容只能是纯 JSON 数组文本，不得包含任何 Markdown 标记（如 \`\`\`json）、解释文字或其他内容。`;

    // We send base64 data to Gemini using the fallback-safe wrapper
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
        systemPrompt
    });

    const text = response.text;
    if (!text) throw new Error("Empty response from AI");
    
    // 清洗输出：移除可能残留的 Markdown 包裹标记，提取纯 JSON
    let parsedText = text.trim();
    // 移除 ```json ... ``` 包裹
    parsedText = parsedText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    
    const data = JSON.parse(parsedText);
    
    // 确保响应总是数组格式（兜底：如果模型仍返回单对象，包装成数组）
    const result = Array.isArray(data) ? data : [data];
    res.json(result);

  } catch (error: any) {
    console.error("AI Analysis Error:", error);
    res.status(500).json({ error: error.message || "Failed to analyze image" });
  }
});

// API Route for generating similar questions
app.post("/api/similar", requireAuth, checkAiLimit, async (req: AuthenticatedRequest, res) => {
  try {
    // 检查角色权限：学生无法使用 AI 推荐同类题
    const user = db.prepare("SELECT role FROM users WHERE username = ?").get(req.userId) as { role: string } | undefined;
    if (!user || user.role === 'student') {
      return res.status(403).json({ error: "权限不足，学生角色无法生成同类题" });
    }

    const { originalText, subject, knowledgePoints } = req.body;
    
    const prompt = `
请作为AI导师，根据以下信息出一道相似的练习题，帮助学生巩固查漏补缺：
- 学科: ${subject}
- 题目内容: ${originalText}
- 核心知识点: ${knowledgePoints?.join(', ')}

请返回严格的JSON格式：
{
  "questionText": "新题目的完整文字",
  "solution": "新题目的详细解题步骤"
}
`;

    // We generate similar content using the fallback-safe wrapper
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
            responseMimeType: 'application/json',
            temperature: 0.7
        }
    });

    const text = response.text;
    if (!text) throw new Error("Empty response from AI");
    
    let parsedText = text;
    if (parsedText.startsWith('```json')) {
      parsedText = parsedText.replace(/```json/i, '').replace(/```/g, '').trim();
    }
    const data = JSON.parse(parsedText);
    res.json(data);

  } catch (error: any) {
    console.error("Similar question Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// 批量生成试卷题目变式
app.post("/api/paper/variants", requireAuth, checkAiLimit, async (req: AuthenticatedRequest, res) => {
  try {
    // 检查角色权限：学生无法使用 AI 变式功能
    const user = db.prepare("SELECT role FROM users WHERE username = ?").get(req.userId) as { role: string } | undefined;
    if (!user || user.role === 'student') {
      return res.status(403).json({ error: "权限不足，学生角色无法生成试卷变式" });
    }

    const { questions } = req.body;
    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ error: "组卷题目数据不能为空" });
    }

    const prompt = `
请作为金牌备考辅导名师。输入是一个错题列表 JSON。
请你为输入的每一道错题，分别精心命制一道【1:1 相似变式强化练习题】。

命题要求：
1. 考察的核心知识点和难度水平必须与原题完全保持一致。
2. 改变题目的情境背景、具体数值或者提问角度，确保题目是全新的。
3. 对变式题目提供标准、严谨、逻辑清晰的详细名师解题步骤。
4. ⚠️非常重要：变式题干与解答步骤务必保持精简（解题步骤只列出核心关键推导，不要废话），每个题目的解题步骤控制在 120 字以内，以防网络超时。

输入错题列表：
${JSON.stringify(questions.map((q, idx) => ({ index: idx + 1, text: q.originalText, subject: q.subject, knowledgePoints: q.knowledgePoints })))}

请务必返回以下格式的严格 JSON 数组，不要在最外层包含任何 Markdown 格式的 \`\`\`json 标记，必须是一个纯粹的合法 JSON 数组：
[
  {
    "index": 1,
    "subject": "题目科目",
    "originalText": "原题题干文本",
    "variantText": "命制的 1:1 变式题干文本（如果需要 LaTeX 数学公式，请使用标准的 $ 或 $$ 符号包围，以保证前端数学公式渲染完美）",
    "solution": "变式题名师详细标准解题步骤（解题分析加推导步骤）"
  }
]
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
            temperature: 0.3
        }
    });

    const text = response.text;
    if (!text) throw new Error("Empty response from AI");
    
    let parsedText = text.trim();
    
    // 正则寻找最外层包裹的 JSON 数组结构
    const jsonMatch = parsedText.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (jsonMatch) {
      parsedText = jsonMatch[0];
    } else {
      if (parsedText.startsWith('```json')) {
        parsedText = parsedText.replace(/```json/i, '').replace(/```/g, '').trim();
      }
    }
    
    const data = JSON.parse(parsedText);
    res.json(data);

  } catch (error: any) {
    console.error("Batch Paper Variants Error:", error);
    res.status(500).json({ error: error.message || "批量生成变式失败" });
  }
});

// 发送验证码接口
app.post("/api/auth/send-code", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: "邮箱不能为空" });
    }
    
    // 校验是否为合法 QQ 邮箱
    const qqEmailRegex = /^[a-zA-Z0-9_-]+@qq\.com$/i;
    if (!qqEmailRegex.test(email)) {
      return res.status(400).json({ error: "仅支持使用 QQ 邮箱注册" });
    }

    // 检查邮箱是否已被注册
    const userExist = db.prepare("SELECT username FROM users WHERE username = ?").get(email);
    if (userExist) {
      return res.status(400).json({ error: "该邮箱已被注册，请直接登录" });
    }

    // 生成 6 位随机验证码
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const createdAt = Date.now();

    // 插入或更新验证码记录
    db.prepare(`
      INSERT OR REPLACE INTO verification_codes (email, code, createdAt)
      VALUES (?, ?, ?)
    `).run(email, code, createdAt);

    // 检查环境变量是否配置了邮箱服务
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS || process.env.SMTP_PASS === "your-smtp-auth-code") {
      console.log(`[开发测试模式] 验证码发送至: ${email}，验证码为: ${code}`);
      return res.json({ 
        success: true, 
        message: "验证码已生成（开发测试模式，验证码已打印在控制台）",
        devCode: code
      });
    }

    // 邮件内容
    const mailOptions = {
      from: `"智能错题识别系统" <${process.env.SMTP_USER}>`,
      to: email,
      subject: "【智能错题识别】注册验证码",
      html: `
        <div style="padding: 24px; font-family: sans-serif; color: #333; max-width: 600px; margin: auto; border: 1px solid #eee; border-radius: 12px;">
          <h2 style="color: #2563eb; font-size: 20px; font-weight: bold; margin-bottom: 16px;">智能错题识别系统</h2>
          <p style="font-size: 14px; line-height: 1.6; color: #555;">您好，您正在使用 QQ 邮箱注册智能错题识别账号。</p>
          <p style="font-size: 14px; line-height: 1.6; color: #555;">您的注册验证码为：</p>
          <div style="background-color: #f3f4f6; padding: 16px; text-align: center; border-radius: 8px; margin: 20px 0;">
            <span style="font-size: 24px; font-weight: 800; color: #1e293b; letter-spacing: 4px;">${code}</span>
          </div>
          <p style="font-size: 12px; color: #9ca3af; margin-top: 24px; border-top: 1px solid #f3f4f6; padding-top: 16px;">
            提示：此验证码有效时间为 10 分钟。如果不是您本人的操作，请忽略此邮件。
          </p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    res.json({ success: true, message: "验证码已发送至您的 QQ 邮箱" });
  } catch (error: any) {
    console.error("Send Code Error:", error);
    res.status(500).json({ error: error.message || "验证码发送失败，请稍后重试" });
  }
});

// 用户注册
app.post("/api/auth/register", (req, res) => {
  try {
    const { username, password, code } = req.body;
    if (!username || !password || !code || username.trim() === "" || password.trim() === "" || code.trim() === "") {
      return res.status(400).json({ error: "邮箱、密码和验证码均不能为空" });
    }
    const cleanUsername = username.trim();
    if (cleanUsername.length < 2) {
      return res.status(400).json({ error: "用户名长度不能少于 2 位" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "密码长度不能少于 6 位" });
    }
    
    // 限制只能通过 QQ 邮箱注册
    const qqEmailRegex = /^[a-zA-Z0-9_-]+@qq\.com$/i;
    if (!qqEmailRegex.test(cleanUsername)) {
      return res.status(400).json({ error: "注册账号必须为有效的 QQ 邮箱（如: 123456@qq.com）" });
    }
    
    // 校验验证码
    const codeRecord = db.prepare("SELECT code, createdAt FROM verification_codes WHERE email = ?").get(cleanUsername) as { code: string, createdAt: number } | undefined;
    if (!codeRecord) {
      return res.status(400).json({ error: "尚未获取验证码或验证码已失效" });
    }

    if (codeRecord.code !== code.trim()) {
      return res.status(400).json({ error: "验证码错误，请重新输入" });
    }

    if (Date.now() - codeRecord.createdAt > 10 * 60 * 1000) {
      return res.status(400).json({ error: "验证码已过期，请重新获取" });
    }

    // 验证成功，删除验证码记录
    db.prepare("DELETE FROM verification_codes WHERE email = ?").run(cleanUsername);

    const checkStmt = db.prepare("SELECT username FROM users WHERE username = ?");
    if (checkStmt.get(cleanUsername)) {
      return res.status(400).json({ error: "该用户名已被注册" });
    }
    
    const hashedPassword = hashPassword(password);
    const insertUser = db.prepare("INSERT INTO users (username, password, role) VALUES (?, ?, 'student')");
    insertUser.run(cleanUsername, hashedPassword);
    
    const token = crypto.randomUUID();
    const insertSession = db.prepare("INSERT INTO sessions (token, username, createdAt) VALUES (?, ?, ?)");
    insertSession.run(token, cleanUsername, Date.now());
    
    res.json({ token, username: cleanUsername, role: 'student' });
  } catch (error: any) {
    console.error("Register Error:", error);
    res.status(500).json({ error: error.message || "注册失败" });
  }
});

// 用户登录
app.post("/api/auth/login", (req, res) => {
  try {
    const { username, password, loginRole, loginType, idCardLast6, phoneLast4 } = req.body;
    if (!username || username.trim() === "") {
      return res.status(400).json({ error: "姓名或账号不能为空" });
    }
    const cleanUsername = username.trim();

    if (loginRole === 'student') {
      // 学生登录：免密，支持姓名+身份证后6位，或姓名+手机后4位
      if (loginType === 'idCard') {
        if (!idCardLast6 || idCardLast6.trim() === "") {
          return res.status(400).json({ error: "身份证后6位不能为空" });
        }
        const user = db.prepare("SELECT username, role FROM users WHERE username = ? AND idCardLast6 = ? AND role = 'student'").get(cleanUsername, idCardLast6.trim()) as { username: string, role: string } | undefined;
        if (!user) {
          return res.status(400).json({ error: "姓名或身份证后6位错误" });
        }
        
        const token = crypto.randomUUID();
        db.prepare("INSERT INTO sessions (token, username, createdAt) VALUES (?, ?, ?)").run(token, user.username, Date.now());
        return res.json({ token, username: user.username, role: user.role });
      } else if (loginType === 'phone') {
        if (!phoneLast4 || phoneLast4.trim() === "") {
          return res.status(400).json({ error: "手机号后4位不能为空" });
        }
        const user = db.prepare("SELECT username, role FROM users WHERE username = ? AND phoneLast4 = ? AND role = 'student'").get(cleanUsername, phoneLast4.trim()) as { username: string, role: string } | undefined;
        if (!user) {
          return res.status(400).json({ error: "姓名或手机号后4位错误" });
        }
        
        const token = crypto.randomUUID();
        db.prepare("INSERT INTO sessions (token, username, createdAt) VALUES (?, ?, ?)").run(token, user.username, Date.now());
        return res.json({ token, username: user.username, role: user.role });
      } else {
        return res.status(400).json({ error: "请选择学生登录验证方式" });
      }
    } else {
      // 老师/管理员登录：邮箱/账号+密码
      if (!password) {
        return res.status(400).json({ error: "密码不能为空" });
      }
      const hashedPassword = hashPassword(password);
      const user = db.prepare("SELECT username, password, role FROM users WHERE username = ?").get(cleanUsername) as { username: string; password: string; role: string } | undefined;
      if (!user || user.password !== hashedPassword) {
        return res.status(400).json({ error: "用户名或密码错误" });
      }
      if (user.role === 'student') {
        return res.status(400).json({ error: "此账号为学生角色，请选择学生登录" });
      }
      
      const token = crypto.randomUUID();
      db.prepare("INSERT INTO sessions (token, username, createdAt) VALUES (?, ?, ?)").run(token, user.username, Date.now());
      return res.json({ token, username: user.username, role: user.role });
    }
  } catch (error: any) {
    console.error("Login Error:", error);
    res.status(500).json({ error: error.message || "登录失败" });
  }
});

// 用户注销
app.post("/api/auth/logout", (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      const stmt = db.prepare("DELETE FROM sessions WHERE token = ?");
      stmt.run(token);
    }
    res.json({ success: true });
  } catch (error: any) {
    console.error("Logout Error:", error);
    res.status(500).json({ error: error.message || "注销失败" });
  }
});

// ================= 管理员用户管理 API =================

// 获取全部用户列表 (仅 admin)
app.get("/api/admin/users", requireAdmin, (req, res) => {
  try {
    const stmt = db.prepare(`
      SELECT 
        u.username, 
        u.role, 
        u.lastAiResetDate, 
        u.aiUsedToday,
        u.idCardLast6,
        u.phoneLast4,
        COUNT(q.id) as questionCount
      FROM users u
      LEFT JOIN questions q ON u.username = q.userId
      WHERE u.username != 'admin'
      GROUP BY u.username
      ORDER BY u.username ASC
    `);
    const users = stmt.all();
    res.json(users);
  } catch (error: any) {
    console.error("Admin Get Users Error:", error);
    res.status(500).json({ error: error.message || "获取用户列表失败" });
  }
});

// 添加用户 (仅 admin)
app.post("/api/admin/users", requireAdmin, (req, res) => {
  try {
    const { role, username, password, idCardLast6, phoneLast4 } = req.body;
    if (!role || !['student', 'teacher'].includes(role)) {
      return res.status(400).json({ error: "非法的用户角色等级" });
    }
    if (!username || username.trim() === "") {
      return res.status(400).json({ error: "用户名/账号不能为空" });
    }
    const cleanUsername = username.trim();
    if (cleanUsername.length < 2) {
      return res.status(400).json({ error: "用户名长度不能少于 2 位" });
    }

    const exists = db.prepare("SELECT username FROM users WHERE username = ?").get(cleanUsername);
    if (exists) {
      return res.status(400).json({ error: "该用户名/账号已存在" });
    }

    if (role === 'student') {
      const cleanIdCard = idCardLast6?.trim();
      const cleanPhone = phoneLast4?.trim();
      if (!cleanIdCard && !cleanPhone) {
        return res.status(400).json({ error: "身份证后6位和手机号后4位必须至少填写一项" });
      }
      if (cleanIdCard && cleanIdCard.length !== 6) {
        return res.status(400).json({ error: "身份证后6位必须是6位" });
      }
      if (cleanPhone && cleanPhone.length !== 4) {
        return res.status(400).json({ error: "手机号后4位必须是4位" });
      }
      // 学生账号哈希默认无密码占位
      const hashedPassword = hashPassword("student_no_password");
      db.prepare(`
        INSERT INTO users (username, password, role, idCardLast6, phoneLast4)
        VALUES (?, ?, 'student', ?, ?)
      `).run(cleanUsername, hashedPassword, cleanIdCard || null, cleanPhone || null);
    } else if (role === 'teacher') {
      if (!password || password.trim() === "") {
        return res.status(400).json({ error: "老师登录密码不能为空" });
      }
      if (password.length < 6) {
        return res.status(400).json({ error: "密码长度不能少于 6 位" });
      }
      const emailRegex = /^[a-zA-Z0-9_-]+@[a-zA-Z0-9_-]+(\.[a-zA-Z0-9_-]+)+$/;
      if (!emailRegex.test(cleanUsername)) {
        return res.status(400).json({ error: "老师账号必须为合法的邮箱格式" });
      }
      const hashedPassword = hashPassword(password);
      db.prepare(`
        INSERT INTO users (username, password, role)
        VALUES (?, ?, 'teacher')
      `).run(cleanUsername, hashedPassword);
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error("Admin Create User Error:", error);
    res.status(500).json({ error: error.message || "创建用户失败" });
  }
});

// 修改用户属性 (仅 admin)
app.put("/api/admin/users/:username", requireAdmin, (req, res) => {
  try {
    const oldUsername = req.params.username;
    const { newUsername, password, role, idCardLast6, phoneLast4 } = req.body;

    if (!newUsername || newUsername.trim() === "") {
      return res.status(400).json({ error: "用户名不能为空" });
    }
    const cleanNewUsername = newUsername.trim();
    if (cleanNewUsername.length < 2) {
      return res.status(400).json({ error: "用户名长度不能少于 2 位" });
    }

    if (role && !['student', 'teacher', 'admin'].includes(role)) {
      return res.status(400).json({ error: "非法的用户角色等级" });
    }

    // 级联数据库更新事务
    const updateTransaction = db.transaction(() => {
      if (oldUsername !== cleanNewUsername) {
        const exists = db.prepare("SELECT username FROM users WHERE username = ?").get(cleanNewUsername);
        if (exists) {
          throw new Error("新用户名已被其他用户占用");
        }
        db.prepare("UPDATE users SET username = ? WHERE username = ?").run(cleanNewUsername, oldUsername);
        db.prepare("UPDATE questions SET userId = ? WHERE userId = ?").run(cleanNewUsername, oldUsername);
        db.prepare("UPDATE sessions SET username = ? WHERE username = ?").run(cleanNewUsername, oldUsername);
      }

      if (password && password.trim() !== "") {
        if (password.length < 6) {
          throw new Error("密码长度不能少于 6 位");
        }
        const hashedPassword = hashPassword(password);
        db.prepare("UPDATE users SET password = ? WHERE username = ?").run(hashedPassword, cleanNewUsername);
      }

      if (role) {
        db.prepare("UPDATE users SET role = ? WHERE username = ?").run(role, cleanNewUsername);
      }

      // 更新学生额外字段
      const userObj = db.prepare("SELECT role FROM users WHERE username = ?").get(cleanNewUsername) as { role: string } | undefined;
      if (userObj && userObj.role === 'student') {
        const cleanIdCard = idCardLast6 === undefined ? undefined : idCardLast6?.trim();
        const cleanPhone = phoneLast4 === undefined ? undefined : phoneLast4?.trim();
        
        if (cleanIdCard !== undefined) {
          db.prepare("UPDATE users SET idCardLast6 = ? WHERE username = ?").run(cleanIdCard || null, cleanNewUsername);
        }
        if (cleanPhone !== undefined) {
          db.prepare("UPDATE users SET phoneLast4 = ? WHERE username = ?").run(cleanPhone || null, cleanNewUsername);
        }
      }
    });

    updateTransaction();
    res.json({ success: true });
  } catch (error: any) {
    console.error("Admin Update User Error:", error);
    res.status(400).json({ error: error.message || "更新用户信息失败" });
  }
});

// 删除用户及所有相关数据 (仅 admin)
app.delete("/api/admin/users/:username", requireAdmin, (req, res) => {
  try {
    const { username } = req.params;
    if (username === 'admin') {
      return res.status(400).json({ error: "不能删除系统管理员账号" });
    }

    const deleteTransaction = db.transaction(() => {
      db.prepare("DELETE FROM questions WHERE userId = ?").run(username);
      db.prepare("DELETE FROM sessions WHERE username = ?").run(username);
      db.prepare("DELETE FROM users WHERE username = ?").run(username);
    });

    deleteTransaction();
    res.json({ success: true });
  } catch (error: any) {
    console.error("Admin Delete User Error:", error);
    res.status(500).json({ error: error.message || "删除用户失败" });
  }
});

// 获取所有学生列表 (仅 admin 和 teacher 可访问，用于指派推送)
app.get("/api/students", requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const user = db.prepare("SELECT role FROM users WHERE username = ?").get(req.userId) as { role: string } | undefined;
    if (!user || (user.role !== 'admin' && user.role !== 'teacher')) {
      return res.status(403).json({ error: "权限不足，仅老师或管理员可查看学生列表" });
    }
    const stmt = db.prepare("SELECT username FROM users WHERE role = 'student' ORDER BY username ASC");
    const students = stmt.all();
    res.json(students);
  } catch (error: any) {
    console.error("Get Students Error:", error);
    res.status(500).json({ error: error.message || "获取学生列表失败" });
  }
});

// 获取错题 (学生只能查看指派给自己的已审核错题，老师/管理员查看全部)
app.get("/api/questions", requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const user = db.prepare("SELECT role FROM users WHERE username = ?").get(req.userId) as { role: string } | undefined;
    let rows: any[];
    if (user?.role === 'student') {
      const stmt = db.prepare("SELECT * FROM questions WHERE studentId = ? AND status = 'audited' ORDER BY createdAt DESC");
      rows = stmt.all(req.userId) as any[];
    } else {
      const stmt = db.prepare("SELECT * FROM questions ORDER BY createdAt DESC");
      rows = stmt.all() as any[];
    }
    
    const questions = rows.map(row => ({
      id: row.id,
      userId: row.userId,
      studentId: row.studentId || undefined,
      status: row.status || 'pending',
      imageUrl: row.imageUrl || undefined,
      originalText: row.originalText,
      subject: row.subject,
      knowledgePoints: row.knowledgePoints ? JSON.parse(row.knowledgePoints) : [],
      errorReason: row.errorReason || "",
      solution: row.solution || "",
      createdAt: row.createdAt,
      similarQuestion: row.similarQuestion ? JSON.parse(row.similarQuestion) : undefined,
      studentAnswer: row.studentAnswer || "",
      errorDiagnosis: row.errorDiagnosis ? JSON.parse(row.errorDiagnosis) : []
    }));
    
    res.json(questions);
  } catch (error: any) {
    console.error("Get Questions Error:", error);
    res.status(500).json({ error: error.message || "获取错题失败" });
  }
});

// 保存或更新错题
app.post("/api/questions", requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const question = req.body;
    if (!question || !question.id || !question.originalText) {
      return res.status(400).json({ error: "错题数据不完整" });
    }

    // 检查角色权限：学生无法录错题
    const user = db.prepare("SELECT role FROM users WHERE username = ?").get(req.userId) as { role: string } | undefined;
    if (!user || user.role === 'student') {
      return res.status(403).json({ error: "权限不足，学生角色无法录入或编辑错题" });
    }
    
    const checkStmt = db.prepare("SELECT userId, studentId, status FROM questions WHERE id = ?");
    const existing = checkStmt.get(question.id) as { userId: string, studentId: string | null, status: string } | undefined;
    if (existing && existing.userId !== req.userId && user.role !== 'admin' && user.role !== 'teacher') {
      return res.status(403).json({ error: "您没有权限修改该错题" });
    }

    const targetUserId = existing ? existing.userId : req.userId;
    const targetStudentId = question.studentId !== undefined ? question.studentId : (existing ? existing.studentId : null);
    const targetStatus = question.status !== undefined ? question.status : (existing ? existing.status : 'pending');
    
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO questions (
        id, userId, studentId, status, imageUrl, originalText, subject, knowledgePoints, errorReason, solution, createdAt, similarQuestion, studentAnswer, errorDiagnosis
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      question.id,
      targetUserId,
      targetStudentId,
      targetStatus,
      question.imageUrl || null,
      question.originalText,
      question.subject || "其他",
      question.knowledgePoints ? JSON.stringify(question.knowledgePoints) : "[]",
      question.errorReason || "",
      question.solution || "",
      question.createdAt || Date.now(),
      question.similarQuestion ? JSON.stringify(question.similarQuestion) : null,
      question.studentAnswer || "",
      question.errorDiagnosis ? JSON.stringify(question.errorDiagnosis) : "[]"
    );
    
    res.json({ success: true });
  } catch (error: any) {
    console.error("Save Question Error:", error);
    res.status(500).json({ error: error.message || "保存错题失败" });
  }
});

// 删除错题
app.delete("/api/questions/:id", requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;

    // 检查角色权限：学生无法删除错题
    const user = db.prepare("SELECT role FROM users WHERE username = ?").get(req.userId) as { role: string } | undefined;
    if (!user || user.role === 'student') {
      return res.status(403).json({ error: "权限不足，学生角色无法删除错题" });
    }
    
    const checkStmt = db.prepare("SELECT userId FROM questions WHERE id = ?");
    const existing = checkStmt.get(id) as { userId: string } | undefined;
    if (!existing) {
      return res.status(404).json({ error: "错题不存在" });
    }
    if (existing.userId !== req.userId && user.role !== 'admin' && user.role !== 'teacher') {
      return res.status(403).json({ error: "您没有权限删除该错题" });
    }
    
    const stmt = db.prepare("DELETE FROM questions WHERE id = ?");
    const result = stmt.run(id);
    
    if (result.changes === 0) {
      return res.status(400).json({ error: "删除失败" });
    }
    
    res.json({ success: true });
  } catch (error: any) {
    console.error("Delete Question Error:", error);
    res.status(500).json({ error: error.message || "删除错题失败" });
  }
});

// 教师或管理员权限中间件
const requireTeacherOrAdmin = (req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) => {
  requireAuth(req, res, () => {
    try {
      const user = db.prepare("SELECT role FROM users WHERE username = ?").get(req.userId) as { role: string } | undefined;
      if (!user || (user.role !== 'admin' && user.role !== 'teacher')) {
        return res.status(403).json({ error: "权限不足，仅老师或管理员有此操作权限" });
      }
      next();
    } catch (err) {
      return res.status(500).json({ error: "服务器内部鉴权错误" });
    }
  });
};

// ================= 公共题库 API =================

// 获取公共题库中的所有题目列表 (需要登录鉴权)
app.get("/api/public-questions", requireAuth, (req, res) => {
  try {
    const stmt = db.prepare("SELECT * FROM public_questions ORDER BY createdAt DESC");
    const rows = stmt.all() as any[];
    const questions = rows.map(row => ({
      id: row.id,
      originalText: row.originalText,
      subject: row.subject,
      knowledgePoints: row.knowledgePoints ? JSON.parse(row.knowledgePoints) : [],
      solution: row.solution || "",
      createdAt: row.createdAt
    }));
    res.json(questions);
  } catch (error: any) {
    console.error("Get Public Questions Error:", error);
    res.status(500).json({ error: error.message || "获取公共题库失败" });
  }
});

// 向公共题库中添加或更新题目 (仅限老师或管理员)
app.post("/api/public-questions", requireTeacherOrAdmin, (req, res) => {
  try {
    const question = req.body;
    if (!question || !question.id || !question.originalText) {
      return res.status(400).json({ error: "题目数据不完整" });
    }

    const stmt = db.prepare(`
      INSERT OR REPLACE INTO public_questions (
        id, originalText, subject, knowledgePoints, solution, createdAt
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      question.id,
      question.originalText,
      question.subject || "其他",
      question.knowledgePoints ? JSON.stringify(question.knowledgePoints) : "[]",
      question.solution || "",
      question.createdAt || Date.now()
    );

    res.json({ success: true });
  } catch (error: any) {
    console.error("Save Public Question Error:", error);
    res.status(500).json({ error: error.message || "保存至题库失败" });
  }
});

// 从公共题库中删除某道题目 (仅限老师或管理员)
app.delete("/api/public-questions/:id", requireTeacherOrAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const stmt = db.prepare("DELETE FROM public_questions WHERE id = ?");
    const result = stmt.run(id);
    if (result.changes === 0) {
      return res.status(400).json({ error: "删除失败，题目不存在" });
    }
    res.json({ success: true });
  } catch (error: any) {
    console.error("Delete Public Question Error:", error);
    res.status(500).json({ error: error.message || "从题库删除失败" });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(console.error);
