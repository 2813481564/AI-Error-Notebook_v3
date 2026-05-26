import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import Database from "better-sqlite3";
import crypto from "crypto";

dotenv.config();

const app = express();
const PORT = 3005;

// 初始化 SQLite 数据库
const db = new Database(path.join(process.cwd(), "questions.db"));
db.pragma("journal_mode = WAL");

// 初始化表结构
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    username TEXT PRIMARY KEY,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'normal',
    lastAiResetDate TEXT,
    aiUsedToday INTEGER NOT NULL DEFAULT 0
  );
  
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    createdAt INTEGER NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS questions (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
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

// 数据库迁移逻辑：检测 users 表是否缺少多用户管理和限流字段
try {
  const tableInfo = db.pragma("table_info(users)") as any[];
  const hasRole = tableInfo.some(col => col.name === 'role');
  if (!hasRole) {
    console.log("检测到旧版数据库结构，正在升级 users 表以支持多用户等级与限流...");
    db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'normal'");
  }
  const hasResetDate = tableInfo.some(col => col.name === 'lastAiResetDate');
  if (!hasResetDate) {
    db.exec("ALTER TABLE users ADD COLUMN lastAiResetDate TEXT");
  }
  const hasAiUsed = tableInfo.some(col => col.name === 'aiUsedToday');
  if (!hasAiUsed) {
    db.exec("ALTER TABLE users ADD COLUMN aiUsedToday INTEGER NOT NULL DEFAULT 0");
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
    if (user.role === 'vip') limit = 120;
    else if (user.role === 'svip') limit = 5000;
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
    if (req.userId !== 'admin') {
      return res.status(403).json({ error: "权限不足，只有系统管理员方可访问此资源" });
    }
    next();
  });
};

// Need to increase body limit for base64 images
app.use(express.json({ limit: '50mb' }));

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Robust helper function with automatic fallback to gemini-3.5-flash in case of quota or rate-limiting errors
async function generateContentWithFallback(params: {
  contents: any[];
  config?: any;
  model?: string;
}) {
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
    const isQuotaError = errorStr.includes("429") || 
                         errorStr.includes("quota") || 
                         errorStr.includes("limit") || 
                         errorStr.includes("resource_exhausted") || 
                         errorStr.includes("rate_limit");

    if (isQuotaError && modelToUse !== 'gemma-4-26b-a4b-it') {
      console.warn(`[AI Warning] Model ${modelToUse} failed due to quota/rate limit: ${error.message || error.toString()}. Automatically retrying with fallback 'gemma-4-26b-a4b-it'...`);
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
app.post("/api/analyze", requireAuth, checkAiLimit, async (req, res) => {
  try {
    const { imageBase64, mimeType } = req.body;
    if (!imageBase64) {
       return res.status(400).json({ error: "Missing imageBase64" });
    }

    const prompt = `
你是一个AI智能名师。请根据提供的错题或试卷图片：
1. 提取题目的文字内容 (如果手写，请高精度精准识别)。
   ⚠️ 核心重要规则：如果图片中包含多道题目（例如一整页试卷、多道独立习题、大题的多个独立问等，比如第1题到第10题），你【千万不能】只提取或分析其中一道题！你必须在 "originalText" 中将识别出来的【所有题目文字】按序号（例：1., 2. 等）全部完整列出，绝不能漏掉任何一题。
2. 判断所属学科（如数学、物理、化学、英语、语文等）。
3. 提供详细的解题步骤（必须清晰易懂，可以直接指导学生）。
   ⚠️ 核心重要规则：如果图片中有多个题目，请在 "solution" 中按段落和章节【依次详细完整解答每一道题】，不要有任何漏答情况。建议使用 Markdown 大标题划分题目，例如：
   ### 第1题解析
   【解析过程】...
   ### 第2题解析
   【解析过程】...
   依此类推，确保与 originalText 中的题目一一对应。
4. 梳理涉及的关键核心知识点（如‘二次函数’，最多三个，如果是多道题可综合最具代表性的主考点）。

请返回符合以下结构的严格JSON格式：
{
  "originalText": "提取的题目完整文字内容（如果有1-10题，必须全部完整列出，不能忽略或截断）",
  "subject": "学科名称",
  "knowledgePoints": ["考点1", "考点2"],
  "solution": "一比一精细解题步骤（如果是多题试卷，必须分大题章节依次写出每道题目的详细解法，不能漏掉任何一道题的解析和答案）"
}
`;
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
            responseMimeType: 'application/json',
            temperature: 0.2
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
    console.error("AI Analysis Error:", error);
    res.status(500).json({ error: error.message || "Failed to analyze image" });
  }
});

// API Route for generating similar questions
app.post("/api/similar", requireAuth, checkAiLimit, async (req, res) => {
  try {
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

// 用户注册
app.post("/api/auth/register", (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password || username.trim() === "" || password.trim() === "") {
      return res.status(400).json({ error: "用户名或密码不能为空" });
    }
    const cleanUsername = username.trim();
    if (cleanUsername.length < 2) {
      return res.status(400).json({ error: "用户名长度不能少于 2 位" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "密码长度不能少于 6 位" });
    }
    
    const checkStmt = db.prepare("SELECT username FROM users WHERE username = ?");
    if (checkStmt.get(cleanUsername)) {
      return res.status(400).json({ error: "该用户名已被注册" });
    }
    
    const hashedPassword = hashPassword(password);
    const insertUser = db.prepare("INSERT INTO users (username, password) VALUES (?, ?)");
    insertUser.run(cleanUsername, hashedPassword);
    
    const token = crypto.randomUUID();
    const insertSession = db.prepare("INSERT INTO sessions (token, username, createdAt) VALUES (?, ?, ?)");
    insertSession.run(token, cleanUsername, Date.now());
    
    res.json({ token, username: cleanUsername, role: 'normal' });
  } catch (error: any) {
    console.error("Register Error:", error);
    res.status(500).json({ error: error.message || "注册失败" });
  }
});

// 用户登录
app.post("/api/auth/login", (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "用户名和密码不能为空" });
    }
    const cleanUsername = username.trim();
    const hashedPassword = hashPassword(password);
    
    const stmt = db.prepare("SELECT username, password, role FROM users WHERE username = ?");
    const user = stmt.get(cleanUsername) as { username: string; password: string; role: string } | undefined;
    if (!user || user.password !== hashedPassword) {
      return res.status(400).json({ error: "用户名或密码错误" });
    }
    
    const token = crypto.randomUUID();
    const insertSession = db.prepare("INSERT INTO sessions (token, username, createdAt) VALUES (?, ?, ?)");
    insertSession.run(token, cleanUsername, Date.now());
    
    res.json({ token, username: cleanUsername, role: user.role });
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

// 修改用户属性 (仅 admin)
app.put("/api/admin/users/:username", requireAdmin, (req, res) => {
  try {
    const oldUsername = req.params.username;
    const { newUsername, password, role } = req.body;

    if (!newUsername || newUsername.trim() === "") {
      return res.status(400).json({ error: "用户名不能为空" });
    }
    const cleanNewUsername = newUsername.trim();
    if (cleanNewUsername.length < 2) {
      return res.status(400).json({ error: "用户名长度不能少于 2 位" });
    }

    if (role && !['normal', 'vip', 'svip', 'admin'].includes(role)) {
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

// 获取当前用户的全部错题
app.get("/api/questions", requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const stmt = db.prepare("SELECT * FROM questions WHERE userId = ? ORDER BY createdAt DESC");
    const rows = stmt.all(req.userId) as any[];
    
    const questions = rows.map(row => ({
      id: row.id,
      imageUrl: row.imageUrl || undefined,
      originalText: row.originalText,
      subject: row.subject,
      knowledgePoints: row.knowledgePoints ? JSON.parse(row.knowledgePoints) : [],
      errorReason: row.errorReason || "",
      solution: row.solution || "",
      createdAt: row.createdAt,
      similarQuestion: row.similarQuestion ? JSON.parse(row.similarQuestion) : undefined
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
    
    const checkStmt = db.prepare("SELECT userId FROM questions WHERE id = ?");
    const existing = checkStmt.get(question.id) as { userId: string } | undefined;
    if (existing && existing.userId !== req.userId) {
      return res.status(403).json({ error: "您没有权限修改该错题" });
    }
    
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO questions (
        id, userId, imageUrl, originalText, subject, knowledgePoints, errorReason, solution, createdAt, similarQuestion
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      question.id,
      req.userId,
      question.imageUrl || null,
      question.originalText,
      question.subject || "其他",
      question.knowledgePoints ? JSON.stringify(question.knowledgePoints) : "[]",
      question.errorReason || "",
      question.solution || "",
      question.createdAt || Date.now(),
      question.similarQuestion ? JSON.stringify(question.similarQuestion) : null
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
    
    const checkStmt = db.prepare("SELECT userId FROM questions WHERE id = ?");
    const existing = checkStmt.get(id) as { userId: string } | undefined;
    if (!existing) {
      return res.status(404).json({ error: "错题不存在" });
    }
    if (existing.userId !== req.userId) {
      return res.status(403).json({ error: "您没有权限删除该错题" });
    }
    
    const stmt = db.prepare("DELETE FROM questions WHERE id = ? AND userId = ?");
    const result = stmt.run(id, req.userId);
    
    if (result.changes === 0) {
      return res.status(400).json({ error: "删除失败" });
    }
    
    res.json({ success: true });
  } catch (error: any) {
    console.error("Delete Question Error:", error);
    res.status(500).json({ error: error.message || "删除错题失败" });
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
