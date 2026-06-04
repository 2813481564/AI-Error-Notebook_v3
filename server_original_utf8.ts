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

// 鍒濆鍖?SQLite 鏁版嵁搴?const db = new Database(path.join(process.cwd(), "questions.db"));
db.pragma("journal_mode = WAL");

// 閰嶇疆 SMTP 鍙戦€佹湇鍔?const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.qq.com",
  port: parseInt(process.env.SMTP_PORT || "465"),
  secure: parseInt(process.env.SMTP_PORT || "465") === 465,
  auth: {
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || ""
  }
});

// 鍒濆鍖栬〃缁撴瀯
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

// 鏁版嵁搴撹縼绉婚€昏緫锛氭娴?questions 琛ㄦ槸鍚︾己灏?userId 瀛楁
try {
  const tableInfo = db.pragma("table_info(questions)") as any[];
  const hasUserId = tableInfo.some(col => col.name === 'userId');
  if (!hasUserId) {
    console.log("妫€娴嬪埌鏃х増鏁版嵁搴撶粨鏋勶紝姝ｅ湪鍗囩骇 questions 琛ㄤ互鏀寔澶氱敤鎴蜂綋绯?..");
    db.exec("ALTER TABLE questions ADD COLUMN userId TEXT NOT NULL DEFAULT 'admin'");
    db.exec("CREATE INDEX IF NOT EXISTS idx_questions_userId ON questions(userId)");
    console.log("questions 琛ㄥ崌绾ф垚鍔燂紒");
  }
} catch (err) {
  console.error("questions 鏁版嵁搴撹縼绉绘鏌ュけ璐?", err);
}

// 鏁版嵁搴撹縼绉婚€昏緫锛氭娴?questions 琛ㄦ槸鍚︾己灏?studentId 鍜?status 瀛楁
try {
  const tableInfo = db.pragma("table_info(questions)") as any[];
  const hasStudentId = tableInfo.some(col => col.name === 'studentId');
  if (!hasStudentId) {
    console.log("姝ｅ湪鍗囩骇 questions 琛ㄤ互鏀寔瀛︾敓鍒嗛厤瀛楁...");
    db.exec("ALTER TABLE questions ADD COLUMN studentId TEXT");
  }
  const hasStatus = tableInfo.some(col => col.name === 'status');
  if (!hasStatus) {
    db.exec("ALTER TABLE questions ADD COLUMN status TEXT DEFAULT 'pending'");
  }
  db.exec("UPDATE questions SET status = 'audited' WHERE status IS NULL");

  // 杩佺Щ閫昏緫锛氭娴嬪苟娣诲姞璇曞嵎/浣滀笟鍚嶇О瀛楁
  const hasPaperName = tableInfo.some(col => col.name === 'paperName');
  if (!hasPaperName) {
    console.log("姝ｅ湪鍗囩骇 questions 琛ㄤ互鏀寔璇曞嵎/浣滀笟鎵规鍚嶇О瀛楁...");
    db.exec("ALTER TABLE questions ADD COLUMN paperName TEXT");
  }

  // 杩佺Щ閫昏緫锛氭娴嬪苟娣诲姞瀛︾敓鎵嬪啓浣滅瓟涓庢楠よ瘖鏂瓧娈?  const hasStudentAnswer = tableInfo.some(col => col.name === 'studentAnswer');
  if (!hasStudentAnswer) {
    console.log("姝ｅ湪鍗囩骇 questions 琛ㄤ互鏀寔瀛︾敓浣滅瓟鎻愬彇瀛楁...");
    db.exec("ALTER TABLE questions ADD COLUMN studentAnswer TEXT");
  }
  const hasErrorDiagnosis = tableInfo.some(col => col.name === 'errorDiagnosis');
  if (!hasErrorDiagnosis) {
    console.log("姝ｅ湪鍗囩骇 questions 琛ㄤ互鏀寔姝ラ閿欒璇婃柇瀛楁...");
    db.exec("ALTER TABLE questions ADD COLUMN errorDiagnosis TEXT");
  }

  // 杩佺Щ閫昏緫锛氭娴嬪苟娣诲姞鏍囧噯绛旀涓庡緱鍒嗗瓧娈?  const hasStandardAnswer = tableInfo.some(col => col.name === 'standardAnswer');
  if (!hasStandardAnswer) {
    console.log("姝ｅ湪鍗囩骇 questions 琛ㄤ互鏀寔鏍囧噯绛旀瀛楁...");
    db.exec("ALTER TABLE questions ADD COLUMN standardAnswer TEXT");
  }
  const hasScore = tableInfo.some(col => col.name === 'score');
  if (!hasScore) {
    console.log("姝ｅ湪鍗囩骇 questions 琛ㄤ互鏀寔寰楀垎瀛楁...");
    db.exec("ALTER TABLE questions ADD COLUMN score INTEGER");
  }
} catch (err) {
  console.error("questions 鏂板瓧娈佃縼绉绘鏌ュけ璐?", err);
}

// 鏁版嵁搴撹縼绉婚€昏緫锛氭娴?users 琛ㄦ槸鍚︾己灏戝鐢ㄦ埛绠＄悊鍜岄檺娴佸瓧娈?try {
  const tableInfo = db.pragma("table_info(users)") as any[];
  const hasRole = tableInfo.some(col => col.name === 'role');
  if (!hasRole) {
    console.log("妫€娴嬪埌鏃х増鏁版嵁搴撶粨鏋勶紝姝ｅ湪鍗囩骇 users 琛ㄤ互鏀寔澶氱敤鎴风瓑绾т笌闄愭祦...");
    db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'student'");
  }

  // 杩佺Щ鏅€氱敤鎴蜂负瀛︾敓瑙掕壊锛孷IP/SVIP 杩佺Щ涓鸿€佸笀瑙掕壊
  try {
    db.exec("UPDATE users SET role = 'student' WHERE role = 'normal'");
    db.exec("UPDATE users SET role = 'teacher' WHERE role IN ('vip', 'svip')");
    console.log("鐢ㄦ埛瑙掕壊鎴愬姛鍗囩骇杩佺Щ (normal->student, vip/svip->teacher)锛?);
  } catch (migrateErr) {
    console.error("瑙掕壊杩佺Щ鍗囩骇澶辫触:", migrateErr);
  }

  const hasResetDate = tableInfo.some(col => col.name === 'lastAiResetDate');
  if (!hasResetDate) {
    db.exec("ALTER TABLE users ADD COLUMN lastAiResetDate TEXT");
  }
  const hasAiUsed = tableInfo.some(col => col.name === 'aiUsedToday');
  if (!hasAiUsed) {
    db.exec("ALTER TABLE users ADD COLUMN aiUsedToday INTEGER NOT NULL DEFAULT 0");
  }

  // 鏂板韬唤璇佷笌鎵嬫満瀛楁妫€娴嬭縼绉?  const hasIdCard = tableInfo.some(col => col.name === 'idCardLast6');
  if (!hasIdCard) {
    console.log("姝ｅ湪鍗囩骇 users 琛ㄤ互鏀寔韬唤璇佸悗6浣嶅瓧娈?..");
    db.exec("ALTER TABLE users ADD COLUMN idCardLast6 TEXT");
  }
  const hasPhone = tableInfo.some(col => col.name === 'phoneLast4');
  if (!hasPhone) {
    console.log("姝ｅ湪鍗囩骇 users 琛ㄤ互鏀寔鎵嬫満鍙峰悗4浣嶅瓧娈?..");
    db.exec("ALTER TABLE users ADD COLUMN phoneLast4 TEXT");
  }

  console.log("users 琛ㄥ崌绾ф鏌ュ畬鎴愶紒");
} catch (err) {
  console.error("users 鏁版嵁搴撹縼绉绘鏌ュけ璐?", err);
}

// 鑷姩鍒濆鍖?admin 鐢ㄦ埛
try {
  const hashPasswordTemp = (pwd: string) => crypto.createHash("sha256").update(pwd).digest("hex");
  const adminUser = db.prepare("SELECT username, role FROM users WHERE username = 'admin'").get() as { username: string, role: string } | undefined;
  if (!adminUser) {
    console.log("妫€娴嬪埌鏃犵鐞嗗憳鐢ㄦ埛锛屾鍦ㄥ垱寤洪粯璁ょ鐞嗗憳璐﹀彿: admin / admin123");
    db.prepare("INSERT INTO users (username, password, role) VALUES ('admin', ?, 'admin')").run(hashPasswordTemp("admin123"));
  } else if (adminUser.role !== 'admin') {
    console.log("妫€娴嬪埌宸插瓨鍦?admin 璐﹀彿浣嗗叾瑙掕壊涓嶄负绠＄悊鍛橈紝姝ｅ湪寮哄埗鍗囩骇鍏惰鑹茬瓑绾у苟閲嶇疆瀵嗙爜涓?admin123...");
    db.prepare("UPDATE users SET role = 'admin', password = ? WHERE username = 'admin'").run(hashPasswordTemp("admin123"));
  }
} catch (err) {
  console.error("鍒濆鍖?admin 澶辫触:", err);
}


// 瀵嗙爜鍝堝笇
function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password).digest("hex");
}

// 閴存潈璇锋眰鎺ュ彛
interface AuthenticatedRequest extends express.Request {
  userId?: string;
}

// 閴存潈涓棿浠?const requireAuth = (req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "鏈櫥褰曪紝璇峰厛鐧诲綍" });
  }
  const token = authHeader.substring(7);
  try {
    const stmt = db.prepare("SELECT username FROM sessions WHERE token = ?");
    const row = stmt.get(token) as { username: string } | undefined;
    if (!row) {
      return res.status(401).json({ error: "鐧诲綍宸茶繃鏈熸垨鍑瘉鏃犳晥锛岃閲嶆柊鐧诲綍" });
    }
    req.userId = row.username;
    next();
  } catch (err) {
    console.error("Auth Middleware Error:", err);
    return res.status(500).json({ error: "鏈嶅姟鍣ㄥ唴閮ㄩ壌鏉冮敊璇? });
  }
};

// 闄愬埗 AI 浣跨敤娆℃暟涓棿浠?const checkAiLimit = (req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) => {
  const username = req.userId;
  if (!username) {
    return res.status(401).json({ error: "鏈櫥褰曪紝璇峰厛鐧诲綍" });
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
      return res.status(404).json({ error: "鐢ㄦ埛涓嶅瓨鍦? });
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
      return res.status(429).json({ error: `鎮ㄤ粖鏃ョ殑 AI 棰濆害宸茬敤灏斤紙褰撳墠绛夌骇: ${user.role.toUpperCase()}锛屾瘡鏃ラ搴? ${limit}娆★級銆傚闇€鏇村棰濆害锛岃鑱旂郴绠＄悊鍛樸€俙 });
    }

    // 棰勬墸闄?AI 浣跨敤娆℃暟
    db.prepare("UPDATE users SET aiUsedToday = aiUsedToday + 1 WHERE username = ?").run(username);
    next();
  } catch (err) {
    console.error("AI Limit Check Error:", err);
    return res.status(500).json({ error: "鏈嶅姟鍣ㄩ檺棰濇牎楠屽け璐? });
  }
};

// 绠＄悊鍛樹笓鐢ㄤ腑闂翠欢
const requireAdmin = (req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) => {
  requireAuth(req, res, () => {
    try {
      const user = db.prepare("SELECT role FROM users WHERE username = ?").get(req.userId) as { role: string } | undefined;
      if (!user || user.role !== 'admin') {
        return res.status(403).json({ error: "鏉冮檺涓嶈冻锛屽彧鏈夌郴缁熺鐞嗗憳鏂瑰彲璁块棶姝よ祫婧? });
      }
      next();
    } catch (err) {
      return res.status(500).json({ error: "鏈嶅姟鍣ㄥ唴閮ㄩ壌鏉冮敊璇? });
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

    // 鑷姩灏?Gemini contents 鏍煎紡缈昏瘧杞崲涓?OpenAI messages 鏍煎紡
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

    // 濡傛灉鏈?systemPrompt锛屽垯鍦?messages 鏁扮粍鏈€鍓嶉潰娉ㄥ叆 system 瑙掕壊娑堟伅
    const messages = params.systemPrompt
      ? [{ role: 'system', content: params.systemPrompt }, ...userMessages]
      : userMessages;

    console.log("[AI API Payload messages]:", JSON.stringify(messages, (key, value) => {
      if (key === 'url' && typeof value === 'string') {
        return value.substring(0, 100) + '...';
      }
      return value;
    }, 2));

    // 浣跨敤 Node.js 鍘熺敓 https 妯″潡锛屽交搴曠粫寮€ undici 鐨?headersTimeout 闄愬埗
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
      req.on('timeout', () => { req.destroy(); reject(new Error('AI 璇锋眰瓒呮椂锛?00s锛夛紝璇烽噸璇?)); });
      req.write(reqBody);
      req.end();
    });

    try {
      const json = JSON.parse(responseText) as any;
      if (!json.choices) {
        throw new Error(json.error?.message || `API 閿欒: ${responseText.substring(0, 200)}`);
      }
      const text = json.choices?.[0]?.message?.content;
      if (!text) throw new Error("Empty response from AI API");
      return { text };
    } catch (parseError: any) {
      console.error("[AI OpenAI Parse Error]", parseError.message, responseText.substring(0, 300));
      throw parseError;
    }
  }

  // 浠ヤ笅涓?Gemini / Google GenAI 榛樿澶勭悊閫昏緫
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
    // 妫€鏌ヨ鑹叉潈闄愶細瀛︾敓鏃犳硶浣跨敤 AI 鍔熻兘
    const user = db.prepare("SELECT role FROM users WHERE username = ?").get(req.userId) as { role: string } | undefined;
    if (!user || user.role === 'student') {
      return res.status(403).json({ error: "鏉冮檺涓嶈冻锛屽鐢熻鑹叉棤娉曚娇鐢?AI 瑙ｆ瀽鍔熻兘" });
    }

    const { imageBase64, mimeType, answerImageBase64, answerMimeType, answerText } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: "Missing imageBase64" });
    }

    const prompt = `
銆愪换鍔¤鏄庛€戣浠旂粏瑙傚療鍥剧墖锛屾墽琛屼互涓嬪垎鏋愪换鍔★細

銆愮涓€姝?- 蹇呴』鍏堟暟棰樼洰鏁伴噺銆戯細
鎵弿鍥剧墖锛屾壘鍑烘墍鏈夊甫鏈夌嫭绔嬮鍙风殑澶ч锛堥鍙烽€氬父鏄樋鎷変集鏁板瓧锛屽"20."銆?21."銆?22."锛夈€?璁颁綇杩欎釜鏁伴噺锛屽悗缁繀椤诲垱寤哄悓绛夋暟閲忕殑鏁扮粍鍏冪礌銆?
銆愮浜屾 - 閫愰鐙珛鍒嗘瀽銆戯細
閽堝绗竴姝ヨ瘑鍒埌鐨勬瘡涓€閬撶嫭绔嬪ぇ棰橈紝鍒嗗埆鍒涘缓涓€涓璞★紝濉啓浠ヤ笅瀛楁锛?- "originalText": 銆愪粎闄愭湰棰樸€戠殑瀹屾暣棰樺共鏂囧瓧锛堝惈棰樺彿锛屽"20. 鍦ㄥ钩闈?.."锛夈€備弗绂佹妸鍏朵粬棰樺彿鐨勯骞叉贩鍏ユ瀛楁銆?- "subject": 鏈瀛︾锛堟暟瀛?鐗╃悊/鍖栧/鑻辫/璇枃绛夛級銆?- "knowledgePoints": 鏈鏍稿績鑰冪偣锛屾渶澶?涓€?- "solution": 銆愪粎閽堝鏈銆戠殑璇︾粏瑙ｉ姝ラ锛屽惈LaTeX鍏紡銆?- "hasStudentAnswer": 鏈鍖哄煙鍐呮槸鍚︽湁瀛︾敓鎵嬪啓浣滅瓟鐥曡抗锛坱rue/false锛夈€?- "studentAnswer": 銆愪粎鏈銆戝鐢熸墜鍐欑殑鍘熷鏂囨湰锛堟棤鍒欑┖瀛楃涓诧級銆?- "errorDiagnosis": 鑻ユ湰棰樻湁瀛︾敓浣滅瓟锛屽皢銆愭湰棰樺鐢熺殑瑙ｇ瓟姝ラ銆戦€愯鏁板瓧鍖栥€傛楠ゅ簭鍙蜂粠1寮€濮嬮噸鏂拌鏁般€傛瘡姝ュ寘鍚細
  * "stepNumber": 鏈鍐呯殑姝ラ搴忓彿锛堟瘡閬撻浠?寮€濮嬮噸缃級銆?  * "stepContent": 璇ユ楠ゅ唴瀹癸紙鏁板鍏紡鐢?...$鍖呭洿锛夈€?  * "status": "correct" / "incorrect" / "consequential_error"銆?  * "comment": 浠呭湪閿欒姝ラ鏃跺～鍐欒鏄庛€?
銆愮涓夋 - 缁勮JSON鏁扮粍銆戯細
灏嗘墍鏈夐鐩璞℃寜棰樺彿椤哄簭缁勮鎴怞SON鏁扮粍杈撳嚭銆傛暟缁勫厓绱犳暟閲忓繀椤讳弗鏍肩瓑浜庣涓€姝ユ暟鍒扮殑棰樼洰鏁伴噺銆?
杈撳嚭鏍煎紡锛堢ず渚嬩负鍥剧墖涓湁3閬撶嫭绔嬪ぇ棰?绗?0銆?1銆?2棰樻椂锛夛細
[
  {
    "originalText": "20. 绗?0棰樺畬鏁撮骞?..",
    "subject": "鏁板",
    "knowledgePoints": ["涓ょ偣闂磋窛绂诲叕寮?],
    "solution": "绗?0棰樿В棰樿繃绋?..",
    "hasStudentAnswer": true,
    "studentAnswer": "瀛︾敓瀵圭20棰樼殑鎵嬪啓瑙ｇ瓟",
    "errorDiagnosis": [
      { "stepNumber": 1, "stepContent": "$AB=\\sqrt{...}$", "status": "correct", "comment": "" }
    ]
  },
  {
    "originalText": "21. 绗?1棰樺畬鏁撮骞?..",
    "subject": "鏁板",
    "knowledgePoints": ["涓夎褰㈤噸蹇冩€ц川"],
    "solution": "绗?1棰樿В棰樿繃绋?..",
    "hasStudentAnswer": true,
    "studentAnswer": "瀛︾敓瀵圭21棰樼殑鎵嬪啓瑙ｇ瓟",
    "errorDiagnosis": [
      { "stepNumber": 1, "stepContent": "G鏄噸蹇冿紝$AG=\\frac{2}{3}AE$", "status": "correct", "comment": "" }
    ]
  },
  {
    "originalText": "22. 绗?2棰樺畬鏁撮骞?..",
    "subject": "鏁板",
    "knowledgePoints": ["骞宠绾跨敾娉曚笌闈㈢Н骞冲垎"],
    "solution": "绗?2棰樿В棰樿繃绋?..",
    "hasStudentAnswer": false,
    "studentAnswer": "",
    "errorDiagnosis": []
  }
]
`;
    // System prompt: 涓ユ牸绾︽潫妯″瀷蹇呴』杈撳嚭 JSON 鏁扮粍锛屾瘡閬撻鐙珛鎴愪竴涓璞?    const systemPrompt = `浣犳槸涓€涓弗璋ㄧ殑 AI 鏅鸿兘鍚嶅笀鍔╂墜銆備綘鐨勮緭鍑烘牸寮忔湁涓斿彧鏈変竴绉嶏細涓€涓悎娉曠殑 JSON 鏁扮粍锛堜互 [ 寮€澶达紝浠?] 缁撳熬锛夈€?浣犲繀椤婚伒瀹堜互涓嬮搧寰嬶細
1. 銆愮粷瀵圭姝€戝皢鍥剧墖涓閬撶嫭绔嬬殑棰樼洰锛堝绗?0棰樸€佺21棰樸€佺22棰橈級鍚堝苟涓轰竴涓暟缁勫厓绱犺繑鍥炪€?2. 鍥剧墖涓湁鍑犻亾鐙珛鐨勯鐩紙浠ラ鍙峰尯鍒嗭紝渚嬪 20銆?1銆?2锛夛紝灏卞繀椤昏繑鍥炲嚑涓嫭绔嬬殑鏁扮粍鍏冪礌瀵硅薄銆?3. 姣忎釜鏁扮粍鍏冪礌瀵硅薄鍙兘鍖呭惈鍏跺搴旈鐩殑鍐呭锛屼笉鑳芥贩鍏ュ叾浠栭鐩殑棰樺共銆佽В鏋愭垨姝ラ銆?4. 浣犵殑鏁翠釜鍥炲鍐呭鍙兘鏄函 JSON 鏁扮粍鏂囨湰锛屼笉寰楀寘鍚换浣?Markdown 鏍囪锛堝 \`\`\`json锛夈€佽В閲婃枃瀛楁垨鍏朵粬鍐呭銆俙;

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

    // 娓呮礂杈撳嚭锛氶珮绮惧害鎻愬彇骞惰В鏋?JSON
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
      return res.status(403).json({ error: "鏉冮檺涓嶈冻锛屽鐢熻鑹叉棤娉曚娇鐢?AI 瑙ｆ瀽鍔熻兘" });
    }

    const { imageBase64, mimeType, answerImageBase64, answerMimeType, answerText } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: "Missing imageBase64" });
    }

    let prompt = `
...璇嗗埆鎴戞彁渚涚殑鍥剧墖涓殑鎵€鏈夌嫭绔嬪ぇ棰樻垨瀛愰锛堝"20."銆?21."銆?22."绛夛級銆?鎴戞彁渚涗簡涓€寮犮€愬鐢熻瘯鍗?浣滀笟鍥剧墖銆戯紙绗竴寮犲浘锛夈€?`;
    if (answerImageBase64) {
      prompt += `鍙﹀锛屾垜鎻愪緵浜嗕竴寮犲搴旂殑銆愭爣鍑嗙瓟妗堝弬鑰冨浘鐗囥€戯紙绗簩寮犲浘锛夈€傝鍔″繀瀵圭収涓ゅ紶鍥撅紝灏嗗悓涓€閬撻鐨勯骞层€佸鐢熸墜鍐欎綔绛斾互鍙婂弬鑰冪殑鏍囧噯绛旀杩涜涓€涓€鍖归厤鎻愬彇銆俓n`;
    }
    if (answerText) {
      prompt += `鍙﹀锛屾垜鎻愪緵浜嗕竴娈靛弬鑰冪瓟妗堟枃鏈涓嬶細\n銆愬畬鏁村弬鑰冪瓟妗堟枃鏈紑濮嬨€慭n${answerText}\n銆愬畬鏁村弬鑰冪瓟妗堟枃鏈粨鏉熴€慭n璇风粨鍚堟鍙傝€冩枃鏈紝灏嗗叾涓殑鍚勯绛旀鍒囧垎骞跺尮閰嶅埌瀵瑰簲棰樼洰鐨勬爣鍑嗙瓟妗堝瓧娈典腑銆俓n`;
    }
    prompt += `
銆愬叿浣撹緭鍑哄瓧娈佃姹傘€戯細
瀵逛簬姣忎竴閬撶嫭绔嬬殑棰樼洰锛岃涓ユ牸鎸夌収浠ヤ笅鏂囨湰鏍煎紡杈撳嚭锛堜笉鍚岄鐩箣闂寸敤 ===棰樼洰鍒嗗壊=== 杩涜闅斿紑锛屼笉瑕佸寘鍚?Markdown 浠ｇ爜鍧楁爣璁板 \`\`\`锛夛細

===棰樼洰鍒嗗壊===
瀛︾: [瀛︾鍚嶇О锛屽鏁板/鐗╃悊/鍖栧绛塢
棰樺共: [鏈鐨勯珮绮惧害瀹屾暣棰樺共鍗板埛浣撴枃瀛楋紝鍖呭惈棰樺彿锛岀粷瀵逛笉鑳藉啓鈥滅暐鈥漖
瀛︾敓浣滅瓟: [鏈鍖哄煙鍐呭鐢熸墜鍐欎綔绛斿嚭鐨勭瓟妗堟垨姝ラ锛岃嫢鏃犲垯鐣欑┖]
鏍囧噯绛旀: [鏍规嵁涓婁紶鐨勩€愭爣鍑嗙瓟妗堝弬鑰冨浘鐗囥€戞垨銆愬弬鑰冪瓟妗堟枃鏈€戝尮閰嶅緱鍒扮殑鏈鏍囧噯鍙傝€冪瓟妗堬紝鍖呭惈鎺ㄥ杩囩▼鍜屾渶缁堟纭瓟妗堬紝鑻ユ棤鍒欑暀绌篯

銆愭敞鎰忎簨椤广€戯細
1. 涓嶈杈撳嚭浠讳綍瑙ｉ噴鎬у墠瑷€鎴栧悗缂€锛堝鈥滀互涓嬫槸璇嗗埆鍐呭锛氣€濓級锛岀洿鎺ヤ互绗竴涓?===棰樼洰鍒嗗壊=== 寮€濮嬨€?2. 鍏紡蹇呴』鐢ㄦ爣鍑嗙殑 $ 鎴?$ 鍖呭洿杈撳嚭涓?LaTeX 鏍煎紡銆?`;

    const systemPrompt = `浣犳槸涓€涓彧杈撳嚭缁撴瀯鍖栫函鏂囨湰鐨?OCR 鍔╂墜銆備綘鐨勬暣涓洖澶嶅繀椤讳弗鏍兼寜鐓?===棰樼洰鍒嗗壊=== 鐨勬牸寮忚緭鍑哄悇瀛楁锛屼笉瑕佸寘鍚?Markdown 浠ｇ爜鍧楁爣璁帮紙濡?\`\`\`锛夋垨浠讳綍棰濆鐨勫浣欏簾璇濄€俙;

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
    // 鎸夌収棰樼洰鍒嗗壊鎷嗗垎
    const parts = text.split(/===+棰樼洰鍒嗗壊===+/);
    for (const part of parts) {
      const trimmedPart = part.trim();
      if (!trimmedPart) continue;

      // 瑙ｆ瀽瀛︾
      const subjectMatch = trimmedPart.match(/瀛︾:\s*(.+)/);
      const subject = subjectMatch ? subjectMatch[1].trim() : "鏁板";

      // 瑙ｆ瀽棰樺共銆佸鐢熶綔绛斾笌鏍囧噯绛旀
      const qIndex = trimmedPart.indexOf("棰樺共:");
      const aIndex = trimmedPart.indexOf("瀛︾敓浣滅瓟:");
      const sIndex = trimmedPart.indexOf("鏍囧噯绛旀:");

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
        // 濡傛灉娌℃湁棰樺共鏍囪锛屼絾鏈夊绉戯紝灏濊瘯鎶婂叾浣欏唴瀹逛綔涓洪骞?        originalText = trimmedPart.replace(/瀛︾:\s*.+/, "").trim();
      }

      if (originalText) {
        result.push({
          subject: subject.substring(0, 10), // 闄愬埗闀垮害浠ラ槻鎰忓
          originalText,
          studentAnswer,
          standardAnswer
        });
      }
    }

    if (result.length === 0) {
      result.push({
        subject: "鏁板",
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
      return res.status(403).json({ error: "鏉冮檺涓嶈冻锛屽鐢熻鑹叉棤娉曚娇鐢?AI 璇婃柇鍔熻兘" });
    }

    const { subject, originalText, studentAnswer, standardAnswer, thinkingMode } = req.body;
    if (!originalText) {
      return res.status(400).json({ error: "Missing originalText" });
    }

    let standardAnswerSection = '';
    if (standardAnswer) {
      standardAnswerSection = `- 鑰佸笀鎻愪緵鐨勫弬鑰冩爣鍑嗙瓟妗? ${standardAnswer}\n`;
    }
    const prompt = `
浣犳槸涓€涓汉宸ユ櫤鑳藉悕甯堛€傝鏍规嵁宸插綍鍏ュ拰鏍″濂界殑閿欓淇℃伅锛岃繘琛屾繁搴︾殑瑙ｇ瓟鍜屾壒鏀硅瘖鏂細

銆愰鐩俊鎭€?- 瀛︾: ${subject || '鏈寚瀹?}
- 棰樺共: ${originalText}
${standardAnswerSection}
- 瀛︾敓浣滅瓟鍐呭: ${studentAnswer || '锛堟棤瀛︾敓浣滅瓟锛?}

銆愪换鍔¤姹傘€戯細
1. **鏍稿績鑰冪偣** ("knowledgePoints"): 鍒嗘瀽璇ラ鑰冨療鐨勬牳蹇冪煡璇嗙偣锛堜緥濡傦細鈥滃钩琛岀嚎鐨勫垽瀹氣€濄€佲€滀簩娆″嚱鏁版渶鍊尖€濈瓑锛夛紝鏈€澶氬垪鍑?3 涓紝瀛樺叆鏁扮粍銆?2. **鏍囧噯瑙ｆ瀽** ("solution"): 缁欏嚭璇ラ鐨勫悕甯堟爣鍑嗚В棰樻帹瀵兼楠ゃ€傚鏋滄秹鍙婃暟瀛﹀叕寮忥紝璇风敤鏍囧噯鐨?$ 鎴?$ 绗﹀彿鍖呭洿浠ヤ繚璇?LaTeX 瀹岀編娓叉煋銆?3. **瀛︾敓浣滅瓟姝ラ绾ц瘖鏂?* ("errorDiagnosis"):
   - 濡傛灉 "瀛︾敓浣滅瓟鍐呭" 涓虹┖锛屽垯 "errorDiagnosis" 蹇呴』杩斿洖绌烘暟缁?[]銆?   - If "瀛︾敓浣滅瓟鍐呭" has content, digitize it step-by-step (step number starting from 1). For each step:
     * "stepNumber": step sequence.
     * "stepContent": digitized content (wrapped in $).
     * "status": "correct", "incorrect" or "consequential_error".
     * "comment": comment description (empty for correct).
4. **瀛︾敓鏈鎵€寰楄瘎鍒?* ("score"):
   - 鏍规嵁瀛︾敓鐨勮В绛旀楠や笌鎻愪緵鐨勩€愯€佸笀鎻愪緵鐨勫弬鑰冩爣鍑嗙瓟妗堛€戯紙濡傛灉鎻愪緵浜嗭級鐨勬瘮瀵圭▼搴︼紝璇勪及瀛︾敓鏈鐨勬渶缁堝緱鍒嗭紝鍙兘鏄?0 鍒?100 涔嬮棿鐨勬暣鏁帮紙濡傛灉瀛︾敓瀹屽叏鏈綔绛旓紝鎴栬€?"瀛︾敓浣滅瓟鍐呭" 缂哄け锛屽垯杩斿洖 0锛夈€?
璇疯繑鍥炰弗鏍肩殑 JSON 瀵硅薄鏍煎紡锛屼笉瑕佸寘鍚?Markdown 鐨?\`\`\`json\`\`\` 鏍囪锛屾牸寮忓涓嬶細
{
  "knowledgePoints": ["鏍稿績鑰冪偣1", "鏍稿績鑰冪偣2"],
  "solution": "鏍囧噯璇︾粏瑙ｇ瓟姝ラ鍐呭...",
  "score": 85,
  "errorDiagnosis": [
    {
      "stepNumber": 1,
      "stepContent": "姝ラ1鍐呭",
      "status": "correct",
      "comment": ""
    }
  ]
}
`;

    const systemPrompt = `浣犳槸涓€涓弗璋ㄧ殑 AI 鏅鸿兘鍚嶅笀鎵规敼鍔╂墜銆備綘鐨勮緭鍑烘牸寮忔湁涓斿彧鏈変竴绉嶏細涓€涓悎娉曠殑 JSON 瀵硅薄锛堜互 { 寮€澶达紝浠?} 缁撳熬锛夈€?浣犲繀椤婚伒瀹堜互涓嬮搧寰嬶細
1. 浣犵殑鏁翠釜鍥炲鍐呭鍙兘鏄函 JSON 鏂囨湰锛屼笉寰楀寘鍚换浣?Markdown 鏍囪锛堝 \`\`\`json\`\`\`锛夈€佽В閲婃枃瀛楁垨鍏朵粬闈?JSON 鍐呭銆?2. 纭繚 JSON 鐨勬牸寮忋€侀€楀彿銆佸弻寮曞彿瀹屽叏姝ｇ‘锛屼互渚跨▼搴忚兘鐩存帴瑙ｆ瀽銆俙;

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
        knowledgePoints: ["闇€鎵嬪姩鍒嗘瀽"],
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
    // 妫€鏌ヨ鑹叉潈闄愶細瀛︾敓鏃犳硶浣跨敤 AI 鎺ㄨ崘鍚岀被棰?    const user = db.prepare("SELECT role FROM users WHERE username = ?").get(req.userId) as { role: string } | undefined;
    if (!user || user.role === 'student') {
      return res.status(403).json({ error: "鏉冮檺涓嶈冻锛屽鐢熻鑹叉棤娉曠敓鎴愬悓绫婚" });
    }

    const { originalText, subject, knowledgePoints } = req.body;

    const prompt = `
璇蜂綔涓篈I瀵煎笀锛屾牴鎹互涓嬩俊鎭嚭涓€閬撶浉浼肩殑缁冧範棰橈紝甯姪瀛︾敓宸╁浐鏌ユ紡琛ョ己锛?- 瀛︾: ${subject}
- 棰樼洰鍐呭: ${originalText}
- 鏍稿績鐭ヨ瘑鐐? ${knowledgePoints?.join(', ')}

璇疯繑鍥炰弗鏍肩殑JSON鏍煎紡锛?{
  "questionText": "鏂伴鐩殑瀹屾暣鏂囧瓧",
  "solution": "鏂伴鐩殑璇︾粏瑙ｉ姝ラ"
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

// 鎵归噺鐢熸垚璇曞嵎棰樼洰鍙樺紡
app.post("/api/paper/variants", requireAuth, checkAiLimit, async (req: AuthenticatedRequest, res) => {
  try {
    // 妫€鏌ヨ鑹叉潈闄愶細瀛︾敓鏃犳硶浣跨敤 AI 鍙樺紡鍔熻兘
    const user = db.prepare("SELECT role FROM users WHERE username = ?").get(req.userId) as { role: string } | undefined;
    if (!user || user.role === 'student') {
      return res.status(403).json({ error: "鏉冮檺涓嶈冻锛屽鐢熻鑹叉棤娉曠敓鎴愯瘯鍗峰彉寮? });
    }

    const { questions } = req.body;
    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ error: "缁勫嵎棰樼洰鏁版嵁涓嶈兘涓虹┖" });
    }

    const prompt = `
璇蜂綔涓洪噾鐗屽鑰冭緟瀵煎悕甯堛€傝緭鍏ユ槸涓€涓敊棰樺垪琛?JSON銆?璇蜂綘涓鸿緭鍏ョ殑姣忎竴閬撻敊棰橈紝鍒嗗埆绮惧績鍛藉埗涓€閬撱€?:1 鐩镐技鍙樺紡寮哄寲缁冧範棰樸€戙€?
鍛介瑕佹眰锛?1. 鑰冨療鐨勬牳蹇冪煡璇嗙偣鍜岄毦搴︽按骞冲繀椤讳笌鍘熼瀹屽叏淇濇寔涓€鑷淬€?2. 鏀瑰彉棰樼洰鐨勬儏澧冭儗鏅€佸叿浣撴暟鍊兼垨鑰呮彁闂搴︼紝纭繚棰樼洰鏄叏鏂扮殑銆?3. 瀵瑰彉寮忛鐩彁渚涙爣鍑嗐€佷弗璋ㄣ€侀€昏緫娓呮櫚鐨勮缁嗗悕甯堣В棰樻楠ゃ€?4. 鈿狅笍闈炲父閲嶈锛氬彉寮忛骞蹭笌瑙ｇ瓟姝ラ鍔″繀淇濇寔绮剧畝锛堣В棰樻楠ゅ彧鍒楀嚭鏍稿績鍏抽敭鎺ㄥ锛屼笉瑕佸簾璇濓級锛屾瘡涓鐩殑瑙ｉ姝ラ鎺у埗鍦?120 瀛椾互鍐咃紝浠ラ槻缃戠粶瓒呮椂銆?
杈撳叆閿欓鍒楄〃锛?${JSON.stringify(questions.map((q, idx) => ({ index: idx + 1, text: q.originalText, subject: q.subject, knowledgePoints: q.knowledgePoints })))}

璇峰姟蹇呰繑鍥炰互涓嬫牸寮忕殑涓ユ牸 JSON 鏁扮粍锛屼笉瑕佸湪鏈€澶栧眰鍖呭惈浠讳綍 Markdown 鏍煎紡鐨?\`\`\`json 鏍囪锛屽繀椤绘槸涓€涓函绮圭殑鍚堟硶 JSON 鏁扮粍锛?[
  {
    "index": 1,
    "subject": "棰樼洰绉戠洰",
    "originalText": "鍘熼棰樺共鏂囨湰",
    "variantText": "鍛藉埗鐨?1:1 鍙樺紡棰樺共鏂囨湰锛堝鏋滈渶瑕?LaTeX 鏁板鍏紡锛岃浣跨敤鏍囧噯鐨?$ 鎴?$$ 绗﹀彿鍖呭洿锛屼互淇濊瘉鍓嶇鏁板鍏紡娓叉煋瀹岀編锛?,
    "solution": "鍙樺紡棰樺悕甯堣缁嗘爣鍑嗚В棰樻楠わ紙瑙ｉ鍒嗘瀽鍔犳帹瀵兼楠わ級"
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

    // 姝ｅ垯瀵绘壘鏈€澶栧眰鍖呰９鐨?JSON 鏁扮粍缁撴瀯
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
    res.status(500).json({ error: error.message || "鎵归噺鐢熸垚鍙樺紡澶辫触" });
  }
});

// 鍙戦€侀獙璇佺爜鎺ュ彛
app.post("/api/auth/send-code", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: "閭涓嶈兘涓虹┖" });
    }

    // 鏍￠獙鏄惁涓哄悎娉?QQ 閭
    const qqEmailRegex = /^[a-zA-Z0-9_-]+@qq\.com$/i;
    if (!qqEmailRegex.test(email)) {
      return res.status(400).json({ error: "浠呮敮鎸佷娇鐢?QQ 閭娉ㄥ唽" });
    }

    // 妫€鏌ラ偖绠辨槸鍚﹀凡琚敞鍐?    const userExist = db.prepare("SELECT username FROM users WHERE username = ?").get(email);
    if (userExist) {
      return res.status(400).json({ error: "璇ラ偖绠卞凡琚敞鍐岋紝璇风洿鎺ョ櫥褰? });
    }

    // 鐢熸垚 6 浣嶉殢鏈洪獙璇佺爜
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const createdAt = Date.now();

    // 鎻掑叆鎴栨洿鏂伴獙璇佺爜璁板綍
    db.prepare(`
      INSERT OR REPLACE INTO verification_codes (email, code, createdAt)
      VALUES (?, ?, ?)
    `).run(email, code, createdAt);

    // 妫€鏌ョ幆澧冨彉閲忔槸鍚﹂厤缃簡閭鏈嶅姟
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS || process.env.SMTP_PASS === "your-smtp-auth-code") {
      console.log(`[寮€鍙戞祴璇曟ā寮廬 楠岃瘉鐮佸彂閫佽嚦: ${email}锛岄獙璇佺爜涓? ${code}`);
      return res.json({
        success: true,
        message: "楠岃瘉鐮佸凡鐢熸垚锛堝紑鍙戞祴璇曟ā寮忥紝楠岃瘉鐮佸凡鎵撳嵃鍦ㄦ帶鍒跺彴锛?,
        devCode: code
      });
    }

    // 閭欢鍐呭
    const mailOptions = {
      from: `"鏅鸿兘閿欓璇嗗埆绯荤粺" <${process.env.SMTP_USER}>`,
      to: email,
      subject: "銆愭櫤鑳介敊棰樿瘑鍒€戞敞鍐岄獙璇佺爜",
      html: `
        <div style="padding: 24px; font-family: sans-serif; color: #333; max-width: 600px; margin: auto; border: 1px solid #eee; border-radius: 12px;">
          <h2 style="color: #2563eb; font-size: 20px; font-weight: bold; margin-bottom: 16px;">鏅鸿兘閿欓璇嗗埆绯荤粺</h2>
          <p style="font-size: 14px; line-height: 1.6; color: #555;">鎮ㄥソ锛屾偍姝ｅ湪浣跨敤 QQ 閭娉ㄥ唽鏅鸿兘閿欓璇嗗埆璐﹀彿銆?/p>
          <p style="font-size: 14px; line-height: 1.6; color: #555;">鎮ㄧ殑娉ㄥ唽楠岃瘉鐮佷负锛?/p>
          <div style="background-color: #f3f4f6; padding: 16px; text-align: center; border-radius: 8px; margin: 20px 0;">
            <span style="font-size: 24px; font-weight: 800; color: #1e293b; letter-spacing: 4px;">${code}</span>
          </div>
          <p style="font-size: 12px; color: #9ca3af; margin-top: 24px; border-top: 1px solid #f3f4f6; padding-top: 16px;">
            鎻愮ず锛氭楠岃瘉鐮佹湁鏁堟椂闂翠负 10 鍒嗛挓銆傚鏋滀笉鏄偍鏈汉鐨勬搷浣滐紝璇峰拷鐣ユ閭欢銆?          </p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    res.json({ success: true, message: "楠岃瘉鐮佸凡鍙戦€佽嚦鎮ㄧ殑 QQ 閭" });
  } catch (error: any) {
    console.error("Send Code Error:", error);
    res.status(500).json({ error: error.message || "楠岃瘉鐮佸彂閫佸け璐ワ紝璇风◢鍚庨噸璇? });
  }
});

// 鐢ㄦ埛娉ㄥ唽
app.post("/api/auth/register", (req, res) => {
  try {
    const { username, password, code } = req.body;
    if (!username || !password || !code || username.trim() === "" || password.trim() === "" || code.trim() === "") {
      return res.status(400).json({ error: "閭銆佸瘑鐮佸拰楠岃瘉鐮佸潎涓嶈兘涓虹┖" });
    }
    const cleanUsername = username.trim();
    if (cleanUsername.length < 2) {
      return res.status(400).json({ error: "鐢ㄦ埛鍚嶉暱搴︿笉鑳藉皯浜?2 浣? });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "瀵嗙爜闀垮害涓嶈兘灏戜簬 6 浣? });
    }

    // 闄愬埗鍙兘閫氳繃 QQ 閭娉ㄥ唽
    const qqEmailRegex = /^[a-zA-Z0-9_-]+@qq\.com$/i;
    if (!qqEmailRegex.test(cleanUsername)) {
      return res.status(400).json({ error: "娉ㄥ唽璐﹀彿蹇呴』涓烘湁鏁堢殑 QQ 閭锛堝: 123456@qq.com锛? });
    }

    // 鏍￠獙楠岃瘉鐮?    const codeRecord = db.prepare("SELECT code, createdAt FROM verification_codes WHERE email = ?").get(cleanUsername) as { code: string, createdAt: number } | undefined;
    if (!codeRecord) {
      return res.status(400).json({ error: "灏氭湭鑾峰彇楠岃瘉鐮佹垨楠岃瘉鐮佸凡澶辨晥" });
    }

    if (codeRecord.code !== code.trim()) {
      return res.status(400).json({ error: "楠岃瘉鐮侀敊璇紝璇烽噸鏂拌緭鍏? });
    }

    if (Date.now() - codeRecord.createdAt > 10 * 60 * 1000) {
      return res.status(400).json({ error: "楠岃瘉鐮佸凡杩囨湡锛岃閲嶆柊鑾峰彇" });
    }

    // 楠岃瘉鎴愬姛锛屽垹闄ら獙璇佺爜璁板綍
    db.prepare("DELETE FROM verification_codes WHERE email = ?").run(cleanUsername);

    const checkStmt = db.prepare("SELECT username FROM users WHERE username = ?");
    if (checkStmt.get(cleanUsername)) {
      return res.status(400).json({ error: "璇ョ敤鎴峰悕宸茶娉ㄥ唽" });
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
    res.status(500).json({ error: error.message || "娉ㄥ唽澶辫触" });
  }
});

// 鐢ㄦ埛鐧诲綍
app.post("/api/auth/login", (req, res) => {
  try {
    const { username, password, loginRole, loginType, idCardLast6, phoneLast4 } = req.body;
    if (!username || username.trim() === "") {
      return res.status(400).json({ error: "濮撳悕鎴栬处鍙蜂笉鑳戒负绌? });
    }
    const cleanUsername = username.trim();

    if (loginRole === 'student') {
      // 瀛︾敓鐧诲綍锛氬厤瀵嗭紝鏀寔濮撳悕+韬唤璇佸悗6浣嶏紝鎴栧鍚?鎵嬫満鍚?浣?      if (loginType === 'idCard') {
        if (!idCardLast6 || idCardLast6.trim() === "") {
          return res.status(400).json({ error: "韬唤璇佸悗6浣嶄笉鑳戒负绌? });
        }
        const user = db.prepare("SELECT username, role FROM users WHERE username = ? AND idCardLast6 = ? AND role = 'student'").get(cleanUsername, idCardLast6.trim()) as { username: string, role: string } | undefined;
        if (!user) {
          return res.status(400).json({ error: "濮撳悕鎴栬韩浠借瘉鍚?浣嶉敊璇? });
        }

        const token = crypto.randomUUID();
        db.prepare("INSERT INTO sessions (token, username, createdAt) VALUES (?, ?, ?)").run(token, user.username, Date.now());
        return res.json({ token, username: user.username, role: user.role });
      } else if (loginType === 'phone') {
        if (!phoneLast4 || phoneLast4.trim() === "") {
          return res.status(400).json({ error: "鎵嬫満鍙峰悗4浣嶄笉鑳戒负绌? });
        }
        const user = db.prepare("SELECT username, role FROM users WHERE username = ? AND phoneLast4 = ? AND role = 'student'").get(cleanUsername, phoneLast4.trim()) as { username: string, role: string } | undefined;
        if (!user) {
          return res.status(400).json({ error: "濮撳悕鎴栨墜鏈哄彿鍚?浣嶉敊璇? });
        }

        const token = crypto.randomUUID();
        db.prepare("INSERT INTO sessions (token, username, createdAt) VALUES (?, ?, ?)").run(token, user.username, Date.now());
        return res.json({ token, username: user.username, role: user.role });
      } else {
        return res.status(400).json({ error: "璇烽€夋嫨瀛︾敓鐧诲綍楠岃瘉鏂瑰紡" });
      }
    } else {
      // 鑰佸笀/绠＄悊鍛樼櫥褰曪細閭/璐﹀彿+瀵嗙爜
      if (!password) {
        return res.status(400).json({ error: "瀵嗙爜涓嶈兘涓虹┖" });
      }
      const hashedPassword = hashPassword(password);
      const user = db.prepare("SELECT username, password, role FROM users WHERE username = ?").get(cleanUsername) as { username: string; password: string; role: string } | undefined;
      if (!user || user.password !== hashedPassword) {
        return res.status(400).json({ error: "鐢ㄦ埛鍚嶆垨瀵嗙爜閿欒" });
      }
      if (user.role === 'student') {
        return res.status(400).json({ error: "姝よ处鍙蜂负瀛︾敓瑙掕壊锛岃閫夋嫨瀛︾敓鐧诲綍" });
      }

      const token = crypto.randomUUID();
      db.prepare("INSERT INTO sessions (token, username, createdAt) VALUES (?, ?, ?)").run(token, user.username, Date.now());
      return res.json({ token, username: user.username, role: user.role });
    }
  } catch (error: any) {
    console.error("Login Error:", error);
    res.status(500).json({ error: error.message || "鐧诲綍澶辫触" });
  }
});

// 鐢ㄦ埛娉ㄩ攢
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
    res.status(500).json({ error: error.message || "娉ㄩ攢澶辫触" });
  }
});

// ================= 绠＄悊鍛樼敤鎴风鐞?API =================

// 鑾峰彇鍏ㄩ儴鐢ㄦ埛鍒楄〃 (浠?admin)
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
    res.status(500).json({ error: error.message || "鑾峰彇鐢ㄦ埛鍒楄〃澶辫触" });
  }
});

// 娣诲姞鐢ㄦ埛 (浠?admin)
app.post("/api/admin/users", requireAdmin, (req, res) => {
  try {
    const { role, username, password, idCardLast6, phoneLast4 } = req.body;
    if (!role || !['student', 'teacher'].includes(role)) {
      return res.status(400).json({ error: "闈炴硶鐨勭敤鎴疯鑹茬瓑绾? });
    }
    if (!username || username.trim() === "") {
      return res.status(400).json({ error: "鐢ㄦ埛鍚?璐﹀彿涓嶈兘涓虹┖" });
    }
    const cleanUsername = username.trim();
    if (cleanUsername.length < 2) {
      return res.status(400).json({ error: "鐢ㄦ埛鍚嶉暱搴︿笉鑳藉皯浜?2 浣? });
    }

    const exists = db.prepare("SELECT username FROM users WHERE username = ?").get(cleanUsername);
    if (exists) {
      return res.status(400).json({ error: "璇ョ敤鎴峰悕/璐﹀彿宸插瓨鍦? });
    }

    if (role === 'student') {
      const cleanIdCard = idCardLast6?.trim();
      const cleanPhone = phoneLast4?.trim();
      if (!cleanIdCard && !cleanPhone) {
        return res.status(400).json({ error: "韬唤璇佸悗6浣嶅拰鎵嬫満鍙峰悗4浣嶅繀椤昏嚦灏戝～鍐欎竴椤? });
      }
      if (cleanIdCard && cleanIdCard.length !== 6) {
        return res.status(400).json({ error: "韬唤璇佸悗6浣嶅繀椤绘槸6浣? });
      }
      if (cleanPhone && cleanPhone.length !== 4) {
        return res.status(400).json({ error: "鎵嬫満鍙峰悗4浣嶅繀椤绘槸4浣? });
      }
      // 瀛︾敓璐﹀彿鍝堝笇榛樿鏃犲瘑鐮佸崰浣?      const hashedPassword = hashPassword("student_no_password");
      db.prepare(`
        INSERT INTO users (username, password, role, idCardLast6, phoneLast4)
        VALUES (?, ?, 'student', ?, ?)
      `).run(cleanUsername, hashedPassword, cleanIdCard || null, cleanPhone || null);
    } else if (role === 'teacher') {
      if (!password || password.trim() === "") {
        return res.status(400).json({ error: "鑰佸笀鐧诲綍瀵嗙爜涓嶈兘涓虹┖" });
      }
      if (password.length < 6) {
        return res.status(400).json({ error: "瀵嗙爜闀垮害涓嶈兘灏戜簬 6 浣? });
      }
      const emailRegex = /^[a-zA-Z0-9_-]+@[a-zA-Z0-9_-]+(\.[a-zA-Z0-9_-]+)+$/;
      if (!emailRegex.test(cleanUsername)) {
        return res.status(400).json({ error: "鑰佸笀璐﹀彿蹇呴』涓哄悎娉曠殑閭鏍煎紡" });
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
    res.status(500).json({ error: error.message || "鍒涘缓鐢ㄦ埛澶辫触" });
  }
});

// 淇敼鐢ㄦ埛灞炴€?(浠?admin)
app.put("/api/admin/users/:username", requireAdmin, (req, res) => {
  try {
    const oldUsername = req.params.username;
    const { newUsername, password, role, idCardLast6, phoneLast4 } = req.body;

    if (!newUsername || newUsername.trim() === "") {
      return res.status(400).json({ error: "鐢ㄦ埛鍚嶄笉鑳戒负绌? });
    }
    const cleanNewUsername = newUsername.trim();
    if (cleanNewUsername.length < 2) {
      return res.status(400).json({ error: "鐢ㄦ埛鍚嶉暱搴︿笉鑳藉皯浜?2 浣? });
    }

    if (role && !['student', 'teacher', 'admin'].includes(role)) {
      return res.status(400).json({ error: "闈炴硶鐨勭敤鎴疯鑹茬瓑绾? });
    }

    // 绾ц仈鏁版嵁搴撴洿鏂颁簨鍔?    const updateTransaction = db.transaction(() => {
      if (oldUsername !== cleanNewUsername) {
        const exists = db.prepare("SELECT username FROM users WHERE username = ?").get(cleanNewUsername);
        if (exists) {
          throw new Error("鏂扮敤鎴峰悕宸茶鍏朵粬鐢ㄦ埛鍗犵敤");
        }
        db.prepare("UPDATE users SET username = ? WHERE username = ?").run(cleanNewUsername, oldUsername);
        db.prepare("UPDATE questions SET userId = ? WHERE userId = ?").run(cleanNewUsername, oldUsername);
        db.prepare("UPDATE sessions SET username = ? WHERE username = ?").run(cleanNewUsername, oldUsername);
      }

      if (password && password.trim() !== "") {
        if (password.length < 6) {
          throw new Error("瀵嗙爜闀垮害涓嶈兘灏戜簬 6 浣?);
        }
        const hashedPassword = hashPassword(password);
        db.prepare("UPDATE users SET password = ? WHERE username = ?").run(hashedPassword, cleanNewUsername);
      }

      if (role) {
        db.prepare("UPDATE users SET role = ? WHERE username = ?").run(role, cleanNewUsername);
      }

      // 鏇存柊瀛︾敓棰濆瀛楁
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
    res.status(400).json({ error: error.message || "鏇存柊鐢ㄦ埛淇℃伅澶辫触" });
  }
});

// 鍒犻櫎鐢ㄦ埛鍙婃墍鏈夌浉鍏虫暟鎹?(浠?admin)
app.delete("/api/admin/users/:username", requireAdmin, (req, res) => {
  try {
    const { username } = req.params;
    if (username === 'admin') {
      return res.status(400).json({ error: "涓嶈兘鍒犻櫎绯荤粺绠＄悊鍛樿处鍙? });
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
    res.status(500).json({ error: error.message || "鍒犻櫎鐢ㄦ埛澶辫触" });
  }
});

// 鑾峰彇鎵€鏈夊鐢熷垪琛?(浠?admin 鍜?teacher 鍙闂紝鐢ㄤ簬鎸囨淳鎺ㄩ€?
app.get("/api/students", requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const user = db.prepare("SELECT role FROM users WHERE username = ?").get(req.userId) as { role: string } | undefined;
    if (!user || (user.role !== 'admin' && user.role !== 'teacher')) {
      return res.status(403).json({ error: "鏉冮檺涓嶈冻锛屼粎鑰佸笀鎴栫鐞嗗憳鍙煡鐪嬪鐢熷垪琛? });
    }
    const stmt = db.prepare("SELECT username FROM users WHERE role = 'student' ORDER BY username ASC");
    const students = stmt.all();
    res.json(students);
  } catch (error: any) {
    console.error("Get Students Error:", error);
    res.status(500).json({ error: error.message || "鑾峰彇瀛︾敓鍒楄〃澶辫触" });
  }
});

// 鑾峰彇閿欓 (瀛︾敓鍙兘鏌ョ湅鎸囨淳缁欒嚜宸辩殑宸插鏍搁敊棰橈紝鑰佸笀/绠＄悊鍛樻煡鐪嬪叏閮?
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
    res.status(500).json({ error: error.message || "鑾峰彇閿欓澶辫触" });
  }
});

// 淇濆瓨鎴栨洿鏂伴敊棰?app.post("/api/questions", requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const question = req.body;
    if (!question || !question.id || !question.originalText) {
      return res.status(400).json({ error: "閿欓鏁版嵁涓嶅畬鏁? });
    }

    // 妫€鏌ヨ鑹叉潈闄愶細瀛︾敓鏃犳硶褰曢敊棰?    const user = db.prepare("SELECT role FROM users WHERE username = ?").get(req.userId) as { role: string } | undefined;
    if (!user || user.role === 'student') {
      return res.status(403).json({ error: "鏉冮檺涓嶈冻锛屽鐢熻鑹叉棤娉曞綍鍏ユ垨缂栬緫閿欓" });
    }

    const checkStmt = db.prepare("SELECT userId, studentId, status FROM questions WHERE id = ?");
    const existing = checkStmt.get(question.id) as { userId: string, studentId: string | null, status: string } | undefined;
    if (existing && existing.userId !== req.userId && user.role !== 'admin' && user.role !== 'teacher') {
      return res.status(403).json({ error: "鎮ㄦ病鏈夋潈闄愪慨鏀硅閿欓" });
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
      question.subject || "鍏朵粬",
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
    res.status(500).json({ error: error.message || "淇濆瓨閿欓澶辫触" });
  }
});

// 鍒犻櫎閿欓
app.delete("/api/questions/:id", requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;

    // 妫€鏌ヨ鑹叉潈闄愶細瀛︾敓鏃犳硶鍒犻櫎閿欓
    const user = db.prepare("SELECT role FROM users WHERE username = ?").get(req.userId) as { role: string } | undefined;
    if (!user || user.role === 'student') {
      return res.status(403).json({ error: "鏉冮檺涓嶈冻锛屽鐢熻鑹叉棤娉曞垹闄ら敊棰? });
    }

    const checkStmt = db.prepare("SELECT userId FROM questions WHERE id = ?");
    const existing = checkStmt.get(id) as { userId: string } | undefined;
    if (!existing) {
      return res.status(404).json({ error: "閿欓涓嶅瓨鍦? });
    }
    if (existing.userId !== req.userId && user.role !== 'admin' && user.role !== 'teacher') {
      return res.status(403).json({ error: "鎮ㄦ病鏈夋潈闄愬垹闄よ閿欓" });
    }

    const stmt = db.prepare("DELETE FROM questions WHERE id = ?");
    const result = stmt.run(id);

    if (result.changes === 0) {
      return res.status(400).json({ error: "鍒犻櫎澶辫触" });
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error("Delete Question Error:", error);
    res.status(500).json({ error: error.message || "鍒犻櫎閿欓澶辫触" });
  }
});

// 鏁欏笀鎴栫鐞嗗憳鏉冮檺涓棿浠?const requireTeacherOrAdmin = (req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) => {
  requireAuth(req, res, () => {
    try {
      const user = db.prepare("SELECT role FROM users WHERE username = ?").get(req.userId) as { role: string } | undefined;
      if (!user || (user.role !== 'admin' && user.role !== 'teacher')) {
        return res.status(403).json({ error: "鏉冮檺涓嶈冻锛屼粎鑰佸笀鎴栫鐞嗗憳鏈夋鎿嶄綔鏉冮檺" });
      }
      next();
    } catch (err) {
      return res.status(500).json({ error: "鏈嶅姟鍣ㄥ唴閮ㄩ壌鏉冮敊璇? });
    }
  });
};

// ================= 鍏叡棰樺簱 API =================

// 鑾峰彇鍏叡棰樺簱涓殑鎵€鏈夐鐩垪琛?(闇€瑕佺櫥褰曢壌鏉?
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
    res.status(500).json({ error: error.message || "鑾峰彇鍏叡棰樺簱澶辫触" });
  }
});

// 鍚戝叕鍏遍搴撲腑娣诲姞鎴栨洿鏂伴鐩?(浠呴檺鑰佸笀鎴栫鐞嗗憳)
app.post("/api/public-questions", requireTeacherOrAdmin, (req, res) => {
  try {
    const question = req.body;
    if (!question || !question.id || !question.originalText) {
      return res.status(400).json({ error: "棰樼洰鏁版嵁涓嶅畬鏁? });
    }

    const stmt = db.prepare(`
      INSERT OR REPLACE INTO public_questions (
        id, originalText, subject, knowledgePoints, solution, createdAt
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      question.id,
      question.originalText,
      question.subject || "鍏朵粬",
      question.knowledgePoints ? JSON.stringify(question.knowledgePoints) : "[]",
      question.solution || "",
      question.createdAt || Date.now()
    );

    res.json({ success: true });
  } catch (error: any) {
    console.error("Save Public Question Error:", error);
    res.status(500).json({ error: error.message || "淇濆瓨鑷抽搴撳け璐? });
  }
});

// 浠庡叕鍏遍搴撲腑鍒犻櫎鏌愰亾棰樼洰 (浠呴檺鑰佸笀鎴栫鐞嗗憳)
app.delete("/api/public-questions/:id", requireTeacherOrAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const stmt = db.prepare("DELETE FROM public_questions WHERE id = ?");
    const result = stmt.run(id);
    if (result.changes === 0) {
      return res.status(400).json({ error: "鍒犻櫎澶辫触锛岄鐩笉瀛樺湪" });
    }
    res.json({ success: true });
  } catch (error: any) {
    console.error("Delete Public Question Error:", error);
    res.status(500).json({ error: error.message || "浠庨搴撳垹闄ゅけ璐? });
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
