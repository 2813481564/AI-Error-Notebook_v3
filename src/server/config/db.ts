import Database from "better-sqlite3";
import path from "path";
import crypto from "crypto";

// 初始化 SQLite 数据库
export const db = new Database(path.join(process.cwd(), "questions.db"));
db.pragma("journal_mode = WAL");

// 初始化表结构
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    username TEXT PRIMARY KEY,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    lastAiResetDate TEXT,
    aiUsedToday INTEGER NOT NULL DEFAULT 0,
    idCardLast6 TEXT,
    phoneLast4 TEXT,
    vipExpireAt TEXT,
    customAiLimit INTEGER DEFAULT NULL
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

  CREATE TABLE IF NOT EXISTS redemption_codes (
    code TEXT PRIMARY KEY,
    role TEXT NOT NULL,
    status TEXT DEFAULT 'unused',
    usedBy TEXT,
    days INTEGER DEFAULT 30,
    createdAt INTEGER NOT NULL,
    usedAt INTEGER
  );

  CREATE TABLE IF NOT EXISTS orders (
    orderId TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    amount INTEGER NOT NULL,
    status TEXT DEFAULT 'pending',
    createdAt INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS notebooks (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    userId TEXT NOT NULL,
    createdAt INTEGER NOT NULL
  );
  
  CREATE INDEX IF NOT EXISTS idx_notebooks_userId ON notebooks(userId);

  CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ai_setting_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL,
    apiBaseUrl TEXT,
    apiKey TEXT,
    geminiApiKey TEXT,
    model TEXT,
    visionModel TEXT,
    geminiModel TEXT,
    remark TEXT,
    createdAt INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    imageUrl TEXT NOT NULL,
    linkUrl TEXT,
    sortOrder INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active',
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

  const hasPaperName = tableInfo.some(col => col.name === 'paperName');
  if (!hasPaperName) {
    console.log("正在升级 questions 表以支持试卷/作业批次名称字段...");
    db.exec("ALTER TABLE questions ADD COLUMN paperName TEXT");
  }

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

  const hasNotebookId = tableInfo.some(col => col.name === 'notebookId');
  if (!hasNotebookId) {
    console.log("正在升级 questions 表以支持 notebookId 字段...");
    db.exec("ALTER TABLE questions ADD COLUMN notebookId TEXT");
    db.exec("CREATE INDEX IF NOT EXISTS idx_questions_notebookId ON questions(notebookId)");
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
    db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'");
  }

  try {
    db.exec("UPDATE users SET role = 'user' WHERE role IN ('student', 'teacher', 'normal')");
    console.log("用户角色成功重构迁移 (student/teacher/normal -> user)！");
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

  const hasVipExpireAt = tableInfo.some(col => col.name === 'vipExpireAt');
  if (!hasVipExpireAt) {
    console.log("正在升级 users 表以支持 vipExpireAt 字段...");
    db.exec("ALTER TABLE users ADD COLUMN vipExpireAt TEXT");
  }

  const hasCustomLimit = tableInfo.some(col => col.name === 'customAiLimit');
  if (!hasCustomLimit) {
    console.log("正在升级 users 表以支持 customAiLimit 自定义额度字段...");
    db.exec("ALTER TABLE users ADD COLUMN customAiLimit INTEGER DEFAULT NULL");
  }

  console.log("users 表升级检查完成！");
} catch (err) {
  console.error("users 数据库迁移检查失败:", err);
}

// 数据库迁移逻辑：检测 redemption_codes 表是否缺少 days 字段
try {
  const tableInfo = db.pragma("table_info(redemption_codes)") as any[];
  if (tableInfo.length > 0) {
    const hasDays = tableInfo.some(col => col.name === 'days');
    if (!hasDays) {
      console.log("正在升级 redemption_codes 表以支持 days 字段...");
      db.exec("ALTER TABLE redemption_codes ADD COLUMN days INTEGER DEFAULT 30");
    }
  }
} catch (err) {
  console.error("redemption_codes 数据库迁移检查失败:", err);
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

// 自动配置初始系统设置
try {
  const stmt = db.prepare("INSERT OR IGNORE INTO system_settings (key, value) VALUES (?, ?)");
  stmt.run("AI_PROVIDER", process.env.AI_PROVIDER || "gemini");
  stmt.run("AI_API_BASE_URL", process.env.AI_API_BASE_URL || "");
  stmt.run("AI_API_KEY", process.env.AI_API_KEY || "");
  stmt.run("GEMINI_API_KEY", process.env.GEMINI_API_KEY || "");
  stmt.run("AI_MODEL", process.env.AI_MODEL || "glm-5.1");
  stmt.run("AI_VISION_MODEL", process.env.AI_VISION_MODEL || "glm-5v-turbo");
  stmt.run("GEMINI_MODEL", process.env.GEMINI_MODEL || "gemma-4-31b-it");
  stmt.run("SMTP_HOST", process.env.SMTP_HOST || "smtp.qq.com");
  stmt.run("SMTP_PORT", process.env.SMTP_PORT || "465");
  stmt.run("SMTP_USER", process.env.SMTP_USER || "");
  stmt.run("SMTP_PASS", process.env.SMTP_PASS || "");
  stmt.run("LIMIT_USER", "30");
  stmt.run("LIMIT_VIP", "100");
  stmt.run("LIMIT_SVIP", "300");
  stmt.run("ALLOW_STUDENT_AI", "true");
  console.log("system_settings 数据库表初始化完成！");
} catch (err) {
  console.error("初始化 system_settings 失败:", err);
}
