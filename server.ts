import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import Database from "better-sqlite3";
import crypto from "crypto";
import nodemailer from "nodemailer";
import https from "https";
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
    similarQuestion TEXT,
    paperName TEXT,
    standardAnswer TEXT,
    score INTEGER
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

  // 迁移逻辑：检测并添加试卷/作业名称字段
  const hasPaperName = tableInfo.some(col => col.name === 'paperName');
  if (!hasPaperName) {
    console.log("正在升级 questions 表以支持试卷/作业批次名称字段...");
    db.exec("ALTER TABLE questions ADD COLUMN paperName TEXT");
  }

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

  // 迁移逻辑：检测并添加标准答案与得分字段
  const hasStandardAnswer = tableInfo.some(col => col.name === 'standardAnswer');
  if (!hasStandardAnswer) {
    console.log("正在升级 questions 表以支持标准答案字段...");
    db.exec("ALTER TABLE questions ADD COLUMN standardAnswer TEXT");
  }
  const hasScore = tableInfo.some(col => col.name === 'score');
  if (!hasScore) {
    console.log("正在升级 questions 表以支持得分字段...");
    db.exec("ALTER TABLE questions ADD COLUMN score INTEGER");
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

// Helper to extract JSON string from raw LLM response text
function extractJsonString(str: string): string {
  const firstArray = str.indexOf('[');
  const firstObject = str.indexOf('{');

  let startIdx = -1;
  let endIdx = -1;

  if (firstArray !== -1 && (firstObject === -1 || firstArray < firstObject)) {
    startIdx = firstArray;
    endIdx = str.lastIndexOf(']');
  } else if (firstObject !== -1) {
    startIdx = firstObject;
    endIdx = str.lastIndexOf('}');
  }

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    return str.substring(startIdx, endIdx + 1);
  }

  return str;
}

// Helper to escape LaTeX backslashes inside JSON string values so JSON.parse won't crash
function sanitizeJsonString(rawStr: string): string {
  let result = '';
  let inString = false;
  let i = 0;
  
  while (i < rawStr.length) {
    const char = rawStr[i];
    
    if (!inString) {
      result += char;
      if (char === '"') {
        inString = true;
      }
      i++;
    } else {
      if (char === '"') {
        result += char;
        inString = false;
        i++;
      } else if (char === '\\') {
        let backslashCount = 0;
        while (i < rawStr.length && rawStr[i] === '\\') {
          backslashCount++;
          i++;
        }
        
        const nextChar = rawStr[i] || '';
        
        let isLatexN = false;
        if (nextChar === 'n') {
          const nextNextChar = rawStr[i + 1] || '';
          if (/[a-zA-Z]/.test(nextNextChar)) {
            isLatexN = true;
          }
        }
        
        if (nextChar === '"') {
          const literalCount = backslashCount - 1;
          result += '\\'.repeat(literalCount * 2) + '\\"';
          i++;
        } else if (nextChar === 'n' && !isLatexN) {
          const literalCount = backslashCount - 1;
          result += '\\'.repeat(literalCount * 2) + '\\n';
          i++;
        } else {
          result += '\\'.repeat(backslashCount * 2);
        }
      } else {
        result += char;
        i++;
      }
    }
  }
  return result;
}

// Robust helper function with automatic fallback to gemma-4-26b-a4b-it or OpenAI provider compatible output
async function generateContentWithFallback(params: {
  contents: any[];
  config?: any;
  model?: string;
  systemPrompt?: string;
  thinkingMode?: 'enabled' | 'disabled';
}) {
  if (AI_PROVIDER === 'openai') {
    const modelToUse = params.model || process.env.AI_MODEL || 'deepseek-chat';
    console.log(`[AI Request via OpenAI Compat] Using model: ${modelToUse}, thinkingMode: ${params.thinkingMode || 'disabled'}`);

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

    console.log("[AI API Payload messages]:", JSON.stringify(messages, (key, value) => {
      if (key === 'url' && typeof value === 'string') {
        return value.substring(0, 100) + '...';
      }
      return value;
    }, 2));

    // 使用 Node.js 原生 https 模块，彻底绕开 undici 的 headersTimeout 限制
    const urlObj = new URL(`${AI_API_BASE_URL}/chat/completions`);

    const reqData: any = {
      model: modelToUse,
      messages: messages,
      temperature: params.config?.temperature ?? 0.7
    };

    if (modelToUse === 'glm-5.1') {
      reqData.thinking = {
        type: params.thinkingMode || 'disabled'
      };
      if (params.thinkingMode === 'enabled') {
        reqData.temperature = 1.0;
      } else {
        reqData.temperature = 0.1;
      }
    }

    const reqBody = JSON.stringify(reqData);

    const responseText = await new Promise<string>((resolve, reject) => {
      const reqOptions: import('https').RequestOptions = {
        hostname: urlObj.hostname,
        port: Number(urlObj.port) || 443,
        path: urlObj.pathname + urlObj.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${AI_API_KEY}`,
          'Content-Length': Buffer.byteLength(reqBody)
        },
        timeout: 1200000
      };

      const req = https.request(reqOptions, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => resolve(data));
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('AI 请求超时（600s），请重试')); });
      req.write(reqBody);
      req.end();
    });

    try {
      const json = JSON.parse(responseText) as any;
      if (!json.choices) {
        throw new Error(json.error?.message || `API 错误: ${responseText.substring(0, 200)}`);
      }
      const text = json.choices?.[0]?.message?.content;
      if (!text) throw new Error("Empty response from AI API");
      return { text };
    } catch (parseError: any) {
      console.error("[AI OpenAI Parse Error]", parseError.message, responseText.substring(0, 300));
      throw parseError;
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

    const { imageBase64, mimeType, answerImageBase64, answerMimeType, answerText } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: "Missing imageBase64" });
    }

    const prompt = `
你是一位经验丰富的高中数学/物理/化学名师。请根据以下原题信息，出一道【相似度约80%】的同类练习题。

【原题信息】
- 学科: ${subject}
- 题目内容: ${originalText}
- 核心知识点: ${knowledgePoints?.join(', ')}

【命题要求】
1. 核心知识点与原题完全相同。
2. 题型、步骤数量、公式类型与原题保持一致。
3. 修改具体数值/已知条件/情境背景，使题目全新（约20%差异）。
4. 知识点/图形/公式均不超出高中范围。
5. 数学公式必须用标准 $ 或 $ 包围。

【几何图形数据规范（必须填写 geometry 字段）】
根据题目类型填写 geometry.type：

A) 格点/网格类（题干含"格点"/"网格"/"方格"）: type="grid", gridSize=网格大小
   shapes 坐标: (0,0) 在左下角，Y轴向上，以格点为单位。

B) 坐标系类（题干给出如 A(-4,-1) 等具体坐标）: type="coordinate"
   xRange=[x最小-1, x最大+1], yRange=[y最小-1, y最大+1]
   shapes 坐标直接使用题目中的数学坐标值。

C) 平面几何类（有三角形/圆/四边形等，但无坐标数值）: type="plane"
   shapes 坐标用 0-100 比例值，(0,0) 在左下角，Y轴向上，合理分布在画面中。

D) 纯计算/代数题，无需图形: type="none", shapes=[]

shapes 元素格式：
polygon: {"type":"polygon","points":[[x1,y1],[x2,y2],...],"fill":"#eff6ff","stroke":"#374151"}
line:    {"type":"line","from":[x1,y1],"to":[x2,y2],"stroke":"#374151","dashed":false}
circle:  {"type":"circle","cx":x,"cy":y,"r":radius,"fill":"none","stroke":"#374151"}
point:   {"type":"point","x":x,"y":y,"r":3,"fill":"#374151"}
label:   {"type":"label","text":"A","x":x,"y":y,"color":"#1e293b","anchor":"middle"}

请严格按以下 JSON 格式返回，不要包含 Markdown 代码块标记：
{
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
    ]
  }
}
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
            ...(answerImageBase64 ? [{
              inlineData: {
                data: answerImageBase64.split(',')[1] || answerImageBase64,
                mimeType: answerMimeType || 'image/jpeg'
              }
            }] : []),
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

    // 清洗输出：高精度提取并解析 JSON
    const parsedText = extractJsonString(text);
    const data = JSON.parse(sanitizeJsonString(parsedText));
    const result = Array.isArray(data) ? data : [data];
    res.json(result);

  } catch (error: any) {
    console.error("AI Analysis Error:", error);
    res.status(500).json({ error: error.message || "Failed to analyze image" });
  }
});

// API Route for extracting text from an image (printed question & student handwriting)
app.post("/api/extract", requireAuth, checkAiLimit, async (req: AuthenticatedRequest, res) => {
  let text = 'not_sent_yet';
  try {
    const user = db.prepare("SELECT role FROM users WHERE username = ?").get(req.userId) as { role: string } | undefined;
    if (!user || user.role === 'student') {
      return res.status(403).json({ error: "权限不足，学生角色无法使用 AI 解析功能" });
    }

    const { imageBase64, mimeType, answerImageBase64, answerMimeType, answerText } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: "Missing imageBase64" });
    }

    let prompt = `
...识别我提供的图片中的所有独立大题或子题（如"20."、"21."、"22."等）。
我提供了一张【学生试卷/作业图片】（第一张图）。
`;
    if (answerImageBase64) {
      prompt += `另外，我提供了一张对应的【标准答案参考图片】（第二张图）。请务必对照两张图，将同一道题的题干、学生手写作答以及参考的标准答案进行一一匹配提取。\n`;
    }
    if (answerText) {
      prompt += `另外，我提供了一段参考答案文本如下：\n【完整参考答案文本开始】\n${answerText}\n【完整参考答案文本结束】\n请结合此参考文本，将其中的各题答案切分并匹配到对应题目的标准答案字段中。\n`;
    }
    prompt += `
【具体输出字段要求】：
对于每一道独立的题目，请严格按照以下文本格式输出（不同题目之间用 ===题目分割=== 进行隔开，不要包含 Markdown 代码块标记如 \`\`\`）：

===题目分割===
学科: [学科名称，如数学/物理/化学等]
题干: [本题的高精度完整题干印刷体文字，包含题号，绝对不能写“略”]
学生作答: [本题区域内学生手写作答出的答案或步骤，若无则留空]
标准答案: [根据上传的【标准答案参考图片】或【参考答案文本】匹配得到的本题标准参考答案，包含推导过程和最终正确答案，若无则留空]

【注意事项】：
1. 不要输出任何解释性前言或后缀（如“以下是识别内容：”），直接以第一个 ===题目分割=== 开始。
2. 公式必须用标准的 $ 或 $ 包围输出为 LaTeX 格式。
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
      model: process.env.AI_VISION_MODEL || 'glm-5v-turbo',
      systemPrompt
    });

    text = response.text || '';
    if (!text) throw new Error("Empty response from AI");

    const result: any[] = [];
    // 按照题目分割拆分
    const parts = text.split(/===+题目分割===+/);
    for (const part of parts) {
      const trimmedPart = part.trim();
      if (!trimmedPart) continue;

      // 解析学科
      const subjectMatch = trimmedPart.match(/学科:\s*(.+)/);
      const subject = subjectMatch ? subjectMatch[1].trim() : "数学";

      // 解析题干、学生作答与标准答案
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
        // 如果没有题干标记，但有学科，尝试把其余内容作为题干
        originalText = trimmedPart.replace(/学科:\s*.+/, "").trim();
      }

      if (originalText) {
        result.push({
          subject: subject.substring(0, 10), // 限制长度以防意外
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
    res.json(result);

  } catch (error: any) {
    console.error("AI Extraction text:", text);
    console.error("AI Extraction Error:", error);
    res.status(500).json({ error: error.message || "Failed to extract image content" });
  }
});

// API Route for diagnosing verified question text and student answer
app.post("/api/diagnose", requireAuth, checkAiLimit, async (req: AuthenticatedRequest, res) => {
  try {
    const user = db.prepare("SELECT role FROM users WHERE username = ?").get(req.userId) as { role: string } | undefined;
    if (!user || user.role === 'student') {
      return res.status(403).json({ error: "权限不足，学生角色无法使用 AI 诊断功能" });
    }

    const { subject, originalText, studentAnswer, standardAnswer, thinkingMode } = req.body;
    if (!originalText) {
      return res.status(400).json({ error: "Missing originalText" });
    }

    let standardAnswerSection = '';
    if (standardAnswer) {
      standardAnswerSection = `- 老师提供的参考标准答案: ${standardAnswer}\n`;
    }
    const prompt = `
你是一个人工智能名师。请根据已录入和校对好的错题信息，进行深度的解答和批改诊断：

【题目信息】
- 学科: ${subject || '未指定'}
- 题干: ${originalText}
${standardAnswerSection}
- 学生作答内容: ${studentAnswer || '（无学生作答）'}

【任务要求】：
1. **核心考点** ("knowledgePoints"): 分析该题考查的核心知识点（例如：“平行线的判定”、“二次函数最值”等），最多列出 3 个，存入数组。
2. **标准解析** ("solution"): 给出该题的名师标准解题推导步骤。如果涉及数学公式，请用标准的 $ 或 $$ 符号包围以保证 LaTeX 完美渲染。
3. **学生作答步骤级诊断** ("errorDiagnosis"):
   - 如果 "学生作答内容" 为空，则 "errorDiagnosis" 必须返回空数组 []。
   - If "学生作答内容" has content, digitize it step-by-step (step number starting from 1). For each step:
     * "stepNumber": step sequence.
     * "stepContent": digitized content (wrapped in $).
     * "status": "correct", "incorrect" or "consequential_error".
     * "comment": comment description (empty for correct).
4. **学生本题所得评分** ("score"):
   - 根据学生的解答步骤与提供的【老师提供的参考标准答案】（如果提供了）的比对程度，评估学生本题的最终得分，只能是 0 到 100 之间的整数（如果学生完全未作答，或者 "学生作答内容" 缺失，则返回 0）。

请返回严格的 JSON 对象格式，不要包含 Markdown 的 \`\`\`json\`\`\` 标记，格式如下：
{
  "knowledgePoints": ["核心考点1", "核心考点2"],
  "solution": "标准详细解答步骤内容...",
  "score": 85,
  "errorDiagnosis": [
    {
      "stepNumber": 1,
      "stepContent": "步骤1内容",
      "status": "correct",
      "comment": ""
    }
  ]
}
`;

    const systemPrompt = `你是一个严谨的 AI 智能名师批改助手。你的输出格式有且只有一种：一个合法的 JSON 对象（以 { 开头，以 } 结尾）。
你必须遵守以下铁律：
1. 你的整个回复内容只能是纯 JSON 文本，不得包含任何 Markdown 标记（如 \`\`\`json\`\`\`）、解释文字或其他非 JSON 内容。
2. 确保 JSON 的格式、逗号、双引号完全正确，以便程序能直接解析。`;

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
        temperature: 0.2
      },
      systemPrompt,
      thinkingMode: thinkingMode || 'disabled'
    });

    const text = response.text;
    if (!text) throw new Error("Empty response from AI");

    let resultObj = null;
    try {
      const parsedText = extractJsonString(text);
      if (!parsedText) throw new Error("No JSON found in response");
      resultObj = JSON.parse(sanitizeJsonString(parsedText));
    } catch (e) {
      console.warn("Failed to parse AI diagnosis response as JSON. Falling back to default format.", e);
      resultObj = {
        knowledgePoints: ["需手动分析"],
        solution: text,
        score: 0,
        errorDiagnosis: []
      };
    }
    res.json(resultObj);

  } catch (error: any) {
    console.error("AI Diagnose Error:", error);
    res.status(500).json({ error: error.message || "Failed to diagnose question" });
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
你是一位经验丰富的高中数学/物理/化学名师。请根据以下原题信息，出一道【相似度约80%】的同类练习题。

【原题信息】
- 学科: ${subject}
- 题目内容: ${originalText}
- 核心知识点: ${knowledgePoints?.join(', ')}

【命题要求】
1. 核心知识点与原题完全相同。
2. 题型、步骤数量、公式类型与原题保持一致。
3. 修改具体数值/已知条件/情境背景，使题目全新（约20%差异）。
4. 知识点/图形/公式均不超出高中范围。
5. 数学公式必须用标准 $ 或 $ 包围。

【几何图形数据规范（必须填写 geometry 字段）】
根据题目类型填写 geometry.type：

A) 格点/网格类（题干含"格点"/"网格"/"方格"）: type="grid", gridSize=网格大小
   shapes 坐标: (0,0) 在左下角，Y轴向上，以格点为单位。

B) 坐标系类（题干给出如 A(-4,-1) 等具体坐标）: type="coordinate"
   xRange=[x最小-1, x最大+1], yRange=[y最小-1, y最大+1]
   shapes 坐标直接使用题目中的数学坐标值。

C) 平面几何类（有三角形/圆/四边形等，但无坐标数值）: type="plane"
   shapes 坐标用 0-100 比例值，(0,0) 在左下角，Y轴向上，合理分布在画面中。

D) 纯计算/代数题，无需图形: type="none", shapes=[]

shapes 元素格式：
polygon: {"type":"polygon","points":[[x1,y1],[x2,y2],...],"fill":"#eff6ff","stroke":"#374151"}
line:    {"type":"line","from":[x1,y1],"to":[x2,y2],"stroke":"#374151","dashed":false}
circle:  {"type":"circle","cx":x,"cy":y,"r":radius,"fill":"none","stroke":"#374151"}
point:   {"type":"point","x":x,"y":y,"r":3,"fill":"#374151"}
label:   {"type":"label","text":"A","x":x,"y":y,"color":"#1e293b","anchor":"middle"}

请严格按以下 JSON 格式返回，不要包含 Markdown 代码块标记：
{
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
    ]
  }
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
        temperature: 0.7
        // 注意：不能设置 responseMimeType: 'application/json'
        // 因为当 questionText 中嵌入 SVG 代码时，JSON 模式会让 AI 转义 SVG 的单引号，导致图形损坏
      }
    });

    const text = response.text;
    if (!text) throw new Error("Empty response from AI");

    // 使用健壮的 JSON 提取与净化工具（与其他接口保持一致）
    // SVG 嵌入 JSON 字符串时可能带来转义问题，sanitizeJsonString 可以处理大部分情况
    let data: any;
    try {
      const extracted = extractJsonString(text);
      data = JSON.parse(sanitizeJsonString(extracted));
    } catch {
      // 兜底：尝试移除 Markdown 代码块标记后再解析
      let fallback = text.trim();
      if (fallback.startsWith('```')) {
        fallback = fallback.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/,'').trim();
      }
      data = JSON.parse(fallback);
    }
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
4. 数学公式必须用标准 $ 或 $$ 包围。

【几何图形数据规范（仅当题目涉及几何图形时填写 geometry 字段）】
根据题目类型填写 geometry.type：
A) 格点/网格类（题干含"格点"/"网格"/"方格"）: type="grid", gridSize=网格大小
   shapes 坐标: (0,0) 在左下角，Y轴向上，以格点为单位。
B) 坐标系类（题干给出如 A(-4,-1) 等具体坐标）: type="coordinate"
   xRange=[x最小-1, x最大+1], yRange=[y最小-1, y最大+1]
   shapes 坐标直接使用题目中的数学坐标值。
C) 平面几何类（有三角形/圆/四边形等，但无坐标数值）: type="plane"
   shapes 坐标用 0-100 比例值，(0,0) 在左下角，Y轴向上。
D) 纯计算/代数题，无需图形: type="none", shapes=[]

shapes 元素格式：
polygon: {"type":"polygon","points":[[x1,y1],[x2,y2],...],"fill":"#eff6ff","stroke":"#374151"}
line:    {"type":"line","from":[x1,y1],"to":[x2,y2],"stroke":"#374151","dashed":false}
circle:  {"type":"circle","cx":x,"cy":y,"r":radius,"fill":"none","stroke":"#374151"}
point:   {"type":"point","x":x,"y":y,"r":3,"fill":"#374151"}
label:   {"type":"label","text":"A","x":x,"y":y,"color":"#1e293b","anchor":"middle"}

输入错题列表：
${JSON.stringify(questions.map((q: any, idx: number) => ({ index: idx + 1, text: q.originalText, subject: q.subject, knowledgePoints: q.knowledgePoints })))}

请务必返回以下格式的严格 JSON 数组，不要包含任何 Markdown 格式的 \`\`\`json 标记：
[
  {
    "index": 1,
    "subject": "题目科目",
    "originalText": "原题题干文本",
    "variantText": "新题目的完整文字（纯文字+LaTeX公式，不包含任何SVG代码）",
    "solution": "详细解题步骤（含LaTeX公式）",
    "geometry": {
      "type": "coordinate",
      "xRange": [-6, 2],
      "yRange": [-4, 2],
      "shapes": []
    }
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
      errorDiagnosis: row.errorDiagnosis ? JSON.parse(row.errorDiagnosis) : [],
      paperName: row.paperName || undefined,
      standardAnswer: row.standardAnswer || undefined,
      score: row.score !== null && row.score !== undefined ? row.score : undefined
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
        id, userId, studentId, status, imageUrl, originalText, subject, knowledgePoints, errorReason, solution, createdAt, similarQuestion, studentAnswer, errorDiagnosis, paperName, standardAnswer, score
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      question.errorDiagnosis ? JSON.stringify(question.errorDiagnosis) : "[]",
      question.paperName || null,
      question.standardAnswer || null,
      question.score !== undefined ? question.score : null
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


