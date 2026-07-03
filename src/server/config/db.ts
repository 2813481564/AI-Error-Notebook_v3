import Database from "better-sqlite3";
import path from "path";
import crypto from "crypto";
import { isBase64Image, saveBase64Image } from "../services/fileService";

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
    customAiLimit INTEGER DEFAULT NULL,
    nickname TEXT,
    avatar TEXT
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
    score INTEGER,
    notebookId TEXT,
    masteryStatus TEXT DEFAULT 'not_mastered',
    errorAnalysis TEXT,
    examDirection TEXT
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

  CREATE TABLE IF NOT EXISTS question_standard_cache (
    hashKey TEXT PRIMARY KEY,
    originalText TEXT NOT NULL,
    subject TEXT NOT NULL,
    knowledgePoints TEXT,
    examDirection TEXT,
    solution TEXT NOT NULL,
    createdAt INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_cache_subject ON question_standard_cache(subject);

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
    createdAt INTEGER NOT NULL,
    grade TEXT,
    subject TEXT,
    description TEXT,
    type TEXT DEFAULT 'normal'
  );
  
  CREATE INDEX IF NOT EXISTS idx_notebooks_userId ON notebooks(userId);

  CREATE TABLE IF NOT EXISTS papers (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    userId TEXT NOT NULL,
    createdAt INTEGER NOT NULL,
    questionIds TEXT NOT NULL,
    mode TEXT NOT NULL DEFAULT 'original',
    customImages TEXT,
    hiddenImages TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_papers_userId ON papers(userId);

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

  CREATE TABLE IF NOT EXISTS background_tasks (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    taskName TEXT NOT NULL,
    status TEXT NOT NULL,
    progress INTEGER DEFAULT 0,
    autoRun INTEGER DEFAULT 1,
    uploadMode TEXT NOT NULL,
    notebookId TEXT,
    payload TEXT,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL,
    errorMsg TEXT,
    isNotified INTEGER DEFAULT 0
  );
  
  CREATE INDEX IF NOT EXISTS idx_background_tasks_userId ON background_tasks(userId);
  CREATE INDEX IF NOT EXISTS idx_background_tasks_user_created ON background_tasks(userId, createdAt DESC);
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

  const hasErrorAnalysis = tableInfo.some(col => col.name === 'errorAnalysis');
  if (!hasErrorAnalysis) {
    console.log("正在升级 questions 表以支持综合错因分析字段...");
    db.exec("ALTER TABLE questions ADD COLUMN errorAnalysis TEXT");
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

  const hasMasteryStatus = tableInfo.some(col => col.name === 'masteryStatus');
  if (!hasMasteryStatus) {
    console.log("正在升级 questions 表以支持 masteryStatus 字段...");
    db.exec("ALTER TABLE questions ADD COLUMN masteryStatus TEXT DEFAULT 'not_mastered'");
  }

  const hasExamDirection = tableInfo.some(col => col.name === 'examDirection');
  if (!hasExamDirection) {
    console.log("正在升级 questions 表以支持 examDirection 考察方向字段...");
    db.exec("ALTER TABLE questions ADD COLUMN examDirection TEXT");
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

  const hasNickname = tableInfo.some(col => col.name === 'nickname');
  if (!hasNickname) {
    console.log("正在升级 users 表以支持 nickname 字段...");
    db.exec("ALTER TABLE users ADD COLUMN nickname TEXT");
  }

  const hasAvatar = tableInfo.some(col => col.name === 'avatar');
  if (!hasAvatar) {
    console.log("正在升级 users 表以支持 avatar 字段...");
    db.exec("ALTER TABLE users ADD COLUMN avatar TEXT");
  }

  console.log("users 表升级检查完成！");
} catch (err) {
  console.error("users 数据库迁移检查失败:", err);
}

// 数据库迁移逻辑：检测 notebooks 表是否缺少 grade, subject, description 字段
try {
  const tableInfo = db.pragma("table_info(notebooks)") as any[];
  if (tableInfo.length > 0) {
    const hasGrade = tableInfo.some(col => col.name === 'grade');
    if (!hasGrade) {
      console.log("正在升级 notebooks 表以支持 grade 字段...");
      db.exec("ALTER TABLE notebooks ADD COLUMN grade TEXT");
    }
    const hasSubject = tableInfo.some(col => col.name === 'subject');
    if (!hasSubject) {
      console.log("正在升级 notebooks 表以支持 subject 字段...");
      db.exec("ALTER TABLE notebooks ADD COLUMN subject TEXT");
    }
    const hasDescription = tableInfo.some(col => col.name === 'description');
    if (!hasDescription) {
      console.log("正在升级 notebooks 表以支持 description 字段...");
      db.exec("ALTER TABLE notebooks ADD COLUMN description TEXT");
    }
    // 5. 检查并添加 notebooks 表的 type 字段 (用于隔离 AI变题库)
    try {
      const tableInfo = db.prepare("PRAGMA table_info(notebooks)").all() as any[];
      const hasType = tableInfo.some(col => col.name === 'type');
      if (!hasType) {
        console.log("正在升级 notebooks 表以支持 type 字段...");
        db.prepare("ALTER TABLE notebooks ADD COLUMN type TEXT DEFAULT 'normal'").run();
        console.log("notebooks 表升级完成！");
      }
    } catch (error) {
      console.error("检查/升级 notebooks 表出错:", error);
    }

    // 6. 数据迁移：将旧的孤立错题和 AI变题 自动归档
    try {
      const users = db.prepare("SELECT username FROM users").all() as { username: string }[];
      
      let migratedNormalCount = 0;
      let migratedVariationCount = 0;

      for (const user of users) {
        const userId = user.username;
        
        // 处理该用户的AI变式题 (不论原来在哪个本子里，强制移动到专属变题本)
        const varQuestions = db.prepare(`
          SELECT id FROM questions 
          WHERE userId = ? 
          AND (knowledgePoints LIKE '%AI变式题%' OR examDirection LIKE '%变式强化题%')
        `).all(userId) as { id: string }[];
        
        if (varQuestions.length > 0) {
          let varNotebook = db.prepare(`SELECT id FROM notebooks WHERE userId = ? AND type = 'variation' LIMIT 1`).get(userId) as { id: string } | undefined;
          if (!varNotebook) {
            const newNbId = "nb_auto_var_" + Math.random().toString(36).substring(2, 9);
            db.prepare(`
              INSERT INTO notebooks (id, name, userId, createdAt, type) 
              VALUES (?, '公共题库', ?, ?, 'variation')
            `).run(newNbId, userId, Date.now());
            varNotebook = { id: newNbId };
          }
          
          for (const q of varQuestions) {
            db.prepare(`UPDATE questions SET notebookId = ? WHERE id = ?`).run(varNotebook.id, q.id);
            migratedVariationCount++;
          }
        }

        // 处理该用户的常规错题 (没有本子且不是AI变式题)
        const normalQuestions = db.prepare(`
          SELECT id FROM questions 
          WHERE userId = ? 
          AND (notebookId IS NULL OR notebookId = '')
          AND (knowledgePoints NOT LIKE '%AI变式题%' AND (examDirection IS NULL OR examDirection NOT LIKE '%变式强化题%'))
        `).all(userId) as { id: string }[];

        if (normalQuestions.length > 0) {
          let normalNotebook = db.prepare(`SELECT id FROM notebooks WHERE userId = ? AND type = 'normal' LIMIT 1`).get(userId) as { id: string } | undefined;
          if (!normalNotebook) {
            const newNbId = "nb_auto_norm_" + Math.random().toString(36).substring(2, 9);
            db.prepare(`
              INSERT INTO notebooks (id, name, userId, createdAt, type) 
              VALUES (?, '默认错题本', ?, ?, 'normal')
            `).run(newNbId, userId, Date.now());
            normalNotebook = { id: newNbId };
          }

          for (const q of normalQuestions) {
            db.prepare(`UPDATE questions SET notebookId = ? WHERE id = ?`).run(normalNotebook.id, q.id);
            migratedNormalCount++;
          }
        }
      }
      
      if (migratedVariationCount > 0 || migratedNormalCount > 0) {
        console.log(`数据自动归档迁移完成: 迁移了 ${migratedVariationCount} 道AI变式题，${migratedNormalCount} 道未分类错题。`);
      }
    } catch (error) {
      console.error("执行数据归档迁移出错:", error);
    }
  }
} catch (err) {
  console.error("notebooks 数据库迁移检查失败:", err);
}

// 数据库迁移逻辑：检测 papers 表是否缺少 customImages 和 hiddenImages 字段
try {
  const tableInfo = db.pragma("table_info(papers)") as any[];
  if (tableInfo.length > 0) {
    const hasCustomImages = tableInfo.some(col => col.name === 'customImages');
    if (!hasCustomImages) {
      console.log("正在升级 papers 表以支持 customImages 字段...");
      db.exec("ALTER TABLE papers ADD COLUMN customImages TEXT");
    }
    const hasHiddenImages = tableInfo.some(col => col.name === 'hiddenImages');
    if (!hasHiddenImages) {
      console.log("正在升级 papers 表以支持 hiddenImages 字段...");
      db.exec("ALTER TABLE papers ADD COLUMN hiddenImages TEXT");
    }
  }
} catch (err) {
  console.error("papers 数据库迁移检查失败:", err);
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

// 数据库迁移逻辑：检测 orders 表是否缺少 targetRole, days 字段
try {
  const tableInfo = db.pragma("table_info(orders)") as any[];
  if (tableInfo.length > 0) {
    const hasTargetRole = tableInfo.some(col => col.name === 'targetRole');
    if (!hasTargetRole) {
      console.log("正在升级 orders 表以支持 targetRole 字段...");
      db.exec("ALTER TABLE orders ADD COLUMN targetRole TEXT");
    }
    const hasDays = tableInfo.some(col => col.name === 'days');
    if (!hasDays) {
      console.log("正在升级 orders 表以支持 days 字段...");
      db.exec("ALTER TABLE orders ADD COLUMN days INTEGER");
    }
  }
} catch (err) {
  console.error("orders 数据库迁移检查失败:", err);
}

// 数据库迁移逻辑：检测 background_tasks 表是否缺少 isNotified 字段
try {
  const tableInfo = db.pragma("table_info(background_tasks)") as any[];
  if (tableInfo.length > 0) {
    const hasIsNotified = tableInfo.some(col => col.name === 'isNotified');
    if (!hasIsNotified) {
      console.log("正在升级 background_tasks 表以支持 isNotified 字段...");
      db.exec("ALTER TABLE background_tasks ADD COLUMN isNotified INTEGER DEFAULT 0");
    }
  }
} catch (err) {
  console.error("background_tasks 数据库迁移检查失败:", err);
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
  stmt.run("CAPACITY_USER", "50");
  stmt.run("CAPACITY_VIP", "500");
  stmt.run("CAPACITY_SVIP", "0");

  // 初始化 VIP 客服配置默认值及自定义页面文案价格等
  stmt.run("VIP_CARD_TAG", "智能错题本会员");
  stmt.run("VIP_CARD_TITLE", "解锁更完整的 AI 错题本能力");
  stmt.run("VIP_CARD_DESC", "VIP 覆盖日常练习与组卷，SVIP 解锁探索模式和费曼学习。支持支付宝自助开通；如需对公或发票，可下滑联系客服协助。");
  stmt.run("PRICE_VIP_MONTH", "19.90");
  stmt.run("PRICE_VIP_YEAR", "199.00");
  stmt.run("PRICE_SVIP_MONTH", "29.90");
  stmt.run("PRICE_SVIP_YEAR", "299.00");
  console.log("system_settings 数据库表初始化完成！");
} catch (err) {
  console.error("初始化 system_settings 失败:", err);
}

// ==================== 历史 Base64 图片数据自动迁移 ====================
// 在服务启动时自动扫描数据库中所有历史 Base64 图片，落盘为物理文件并更新记录
// 此迁移仅会处理 imageUrl 以 'data:image/' 开头的老数据，幂等且安全
try {
  const base64Rows = db.prepare(`
    SELECT id, imageUrl FROM questions
    WHERE imageUrl IS NOT NULL AND imageUrl LIKE 'data:image/%'
  `).all() as { id: string; imageUrl: string }[];

  if (base64Rows.length > 0) {
    console.log(`[DB Migration] 检测到 ${base64Rows.length} 条历史 Base64 图片记录，开始自动迁移...`);
    const updateStmt = db.prepare("UPDATE questions SET imageUrl = ? WHERE id = ?");
    let successCount = 0;
    let failCount = 0;

    for (const row of base64Rows) {
      try {
        if (isBase64Image(row.imageUrl)) {
          const fileUrl = saveBase64Image(row.imageUrl);
          updateStmt.run(fileUrl, row.id);
          successCount++;
        }
      } catch (err) {
        console.warn(`[DB Migration] 题目 ${row.id} 图片迁移失败，跳过:`, err);
        failCount++;
      }
    }
    console.log(`[DB Migration] 历史图片迁移完成！成功: ${successCount} 条，失败/跳过: ${failCount} 条。数据库已完成瘦身。`);
  } else {
    console.log("[DB Migration] 未发现历史 Base64 图片记录，无需迁移。");
  }
} catch (migrateErr) {
  console.error("[DB Migration] 历史图片迁移执行失败:", migrateErr);
}

// ==================== 旧路径自动升级（/uploads/ -> /notebook/uploads/） ====================
// 为配合子路径部署，将原有的本地 /uploads/ 前缀全部迁移为 /notebook/uploads/ 前缀，避免 Nginx 转发到 5566 端口
try {
  const oldPathRows = db.prepare(`
    SELECT id, imageUrl FROM questions
    WHERE imageUrl IS NOT NULL AND imageUrl LIKE '/uploads/%'
  `).all() as { id: string; imageUrl: string }[];

  if (oldPathRows.length > 0) {
    console.log(`[DB Migration] 检测到 ${oldPathRows.length} 条旧版 /uploads/ 路径，开始自动升级前缀...`);
    const updatePathStmt = db.prepare("UPDATE questions SET imageUrl = ? WHERE id = ?");
    let count = 0;

    for (const row of oldPathRows) {
      const newUrl = row.imageUrl.replace(/^\/uploads\//, "/notebook/uploads/");
      updatePathStmt.run(newUrl, row.id);
      count++;
    }
    console.log(`[DB Migration] 路径前缀升级完成！成功将 ${count} 条路径前缀修改为 /notebook/uploads/`);
  }
} catch (pathMigrateErr) {
  console.error("[DB Migration] 路径前缀升级执行失败:", pathMigrateErr);
}
