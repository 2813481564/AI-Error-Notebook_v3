import express from "express";
import { db } from "../config/db";
import { AuthenticatedRequest } from "../middleware/auth";
import { hashPassword } from "./authController";
import { getSetting } from "../services/settingService";

// ================= 错题管理 =================

// 1. 获取错题列表
export const getQuestions = (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const user = db.prepare("SELECT role FROM users WHERE username = ?").get(req.userId) as { role: string } | undefined;
    if (!user) {
      return res.status(404).json({ error: "用户不存在" });
    }

    const pageParam = req.query.page;
    const limitParam = req.query.limit;

    if (pageParam !== undefined && limitParam !== undefined) {
      const page = parseInt(pageParam as string) || 1;
      const limit = parseInt(limitParam as string) || 10;
      const subject = (req.query.subject as string) || 'all';
      const notebookId = (req.query.notebookId as string) || 'all';
      const masteryStatus = (req.query.masteryStatus as string) || 'all';
      const search = (req.query.search as string) || '';

      const offset = (page - 1) * limit;

      let whereClauses: string[] = [];
      let params: any[] = [];

      // 权限过滤
      if (user.role !== 'admin') {
        whereClauses.push("(q.userId = ? OR q.studentId = ?)");
        params.push(req.userId, req.userId);
      }

      // 学科过滤
      if (subject !== 'all') {
        whereClauses.push("q.subject = ?");
        params.push(subject);
      }

      // 错题本过滤
      if (notebookId === 'unclassified') {
        whereClauses.push("(q.notebookId IS NULL OR q.notebookId = '')");
      } else if (notebookId !== 'all') {
        whereClauses.push("q.notebookId = ?");
        params.push(notebookId);
      }

      // 掌握状态过滤
      if (masteryStatus !== 'all') {
        whereClauses.push("q.masteryStatus = ?");
        params.push(masteryStatus);
      }

      // 搜索文本过滤
      if (search.trim() !== '') {
        whereClauses.push("(q.originalText LIKE ? OR q.knowledgePoints LIKE ?)");
        const searchTerm = `%${search.trim()}%`;
        params.push(searchTerm, searchTerm);
      }

      const whereSql = whereClauses.length > 0 ? "WHERE " + whereClauses.join(" AND ") : "";

      // 查总数
      const countQuery = `
        SELECT COUNT(*) as count 
        FROM questions q
        ${whereSql}
      `;
      const countRow = db.prepare(countQuery).get(...params) as { count: number };
      const total = countRow.count;

      // 查分页数据
      const dataQuery = `
        SELECT q.*, n.name as notebookName 
        FROM questions q
        LEFT JOIN notebooks n ON q.notebookId = n.id
        ${whereSql}
        ORDER BY q.createdAt DESC
        LIMIT ? OFFSET ?
      `;
      const rows = db.prepare(dataQuery).all(...params, limit, offset) as any[];

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
        errorAnalysis: row.errorAnalysis || "",
        paperName: row.paperName || undefined,
        standardAnswer: row.standardAnswer || undefined,
        score: row.score !== null && row.score !== undefined ? row.score : undefined,
        notebookId: row.notebookId || undefined,
        notebookName: row.notebookName || undefined,
        masteryStatus: row.masteryStatus || 'not_mastered'
      }));

      return res.json({
        total,
        page,
        limit,
        questions
      });
    }

    // 保持原本无分页时的兼容逻辑
    let rows: any[];
    if (user.role === 'admin') {
      const stmt = db.prepare(`
        SELECT q.*, n.name as notebookName 
        FROM questions q
        LEFT JOIN notebooks n ON q.notebookId = n.id
        ORDER BY q.createdAt DESC
      `);
      rows = stmt.all() as any[];
    } else {
      const stmt = db.prepare(`
        SELECT q.*, n.name as notebookName 
        FROM questions q
        LEFT JOIN notebooks n ON q.notebookId = n.id
        WHERE q.userId = ? OR q.studentId = ?
        ORDER BY q.createdAt DESC
      `);
      rows = stmt.all(req.userId, req.userId) as any[];
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
      errorAnalysis: row.errorAnalysis || "",
      paperName: row.paperName || undefined,
      standardAnswer: row.standardAnswer || undefined,
      score: row.score !== null && row.score !== undefined ? row.score : undefined,
      notebookId: row.notebookId || undefined,
      notebookName: row.notebookName || undefined,
      masteryStatus: row.masteryStatus || 'not_mastered'
    }));

    res.json(questions);
  } catch (error: any) {
    console.error("Get Questions Error:", error);
    res.status(500).json({ error: error.message || "获取错题失败" });
  }
};

// 2. 保存/更新错题
export const saveQuestion = (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const question = req.body;
    if (!question || !question.id || !question.originalText) {
      return res.status(400).json({ error: "错题数据不完整" });
    }

    // 检查角色权限
    const user = db.prepare("SELECT role, password FROM users WHERE username = ?").get(req.userId) as { role: string, password: string } | undefined;
    if (!user) {
      return res.status(403).json({ error: "用户不存在" });
    }

    const checkStmt = db.prepare("SELECT userId, studentId, status FROM questions WHERE id = ?");
    const existing = checkStmt.get(question.id) as { userId: string, studentId: string | null, status: string } | undefined;
    
    // 如果错题已存在且不属于当前用户，非管理员不可修改
    if (existing && existing.userId !== req.userId && user.role !== 'admin') {
      return res.status(403).json({ error: "您没有权限修改该错题" });
    }

    // 容量上限控制
    if (!existing && user.role !== 'admin') {
      let capacity = 50;
      if (user.role === 'svip') {
        capacity = parseInt(getSetting("CAPACITY_SVIP", "0"));
      } else if (user.role === 'vip') {
        capacity = parseInt(getSetting("CAPACITY_VIP", "500"));
      } else {
        capacity = parseInt(getSetting("CAPACITY_USER", "50"));
      }

      if (capacity > 0) {
        const countRow = db.prepare("SELECT COUNT(*) as count FROM questions WHERE userId = ?").get(req.userId) as { count: number } | undefined;
        const currentCount = countRow ? countRow.count : 0;
        if (currentCount >= capacity) {
          return res.status(403).json({ error: `您的错题保存容量已达上限 (${capacity} 题)，请升级会员或清理已有错题。` });
        }
      }
    }

    const targetUserId = existing ? existing.userId : req.userId;
    const targetStudentId = question.studentId !== undefined ? question.studentId : (existing ? existing.studentId : null);
    // 自注册普通用户录入默认为 audited (自审)，管理员录入默认 pending
    const defaultStatus = user.role !== 'admin' ? 'audited' : 'pending';
    const targetStatus = question.status !== undefined ? question.status : (existing ? existing.status : defaultStatus);

    const stmt = db.prepare(`
      INSERT OR REPLACE INTO questions (
        id, userId, studentId, status, imageUrl, originalText, subject, knowledgePoints, errorReason, solution, createdAt, similarQuestion, studentAnswer, errorDiagnosis, errorAnalysis, paperName, standardAnswer, score, notebookId, masteryStatus
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      question.errorAnalysis || "",
      question.paperName || null,
      question.standardAnswer || null,
      question.score !== undefined ? question.score : null,
      question.notebookId || null,
      question.masteryStatus || 'not_mastered'
    );

    res.json({ success: true });
  } catch (error: any) {
    console.error("Save Question Error:", error);
    res.status(500).json({ error: error.message || "保存错题失败" });
  }
};

// 3. 删除错题
export const deleteQuestion = (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const { id } = req.params;

    // 检查角色权限
    const user = db.prepare("SELECT role, password FROM users WHERE username = ?").get(req.userId) as { role: string, password: string } | undefined;
    if (!user) {
      return res.status(403).json({ error: "用户不存在" });
    }

    const checkStmt = db.prepare("SELECT userId FROM questions WHERE id = ?");
    const existing = checkStmt.get(id) as { userId: string } | undefined;
    if (!existing) {
      return res.status(404).json({ error: "错题不存在" });
    }
    
    // 非管理员 且 非作者，不能删除
    if (existing.userId !== req.userId && user.role !== 'admin') {
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
};

// ================= 公共题库管理 =================

// 4. 获取公共题库列表
export const getPublicQuestions = (req: express.Request, res: express.Response) => {
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
};

// 5. 保存/更新公共题库题目
export const savePublicQuestion = (req: express.Request, res: express.Response) => {
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
};

// 6. 从公共题库中删除题目
export const deletePublicQuestion = (req: express.Request, res: express.Response) => {
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
};

// ================= 学生管理 =================

// 7. 获取所有学生列表
export const getStudents = (req: AuthenticatedRequest, res: express.Response) => {
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
};

// ================= 管理员后台用户管理 =================

// 8. 获取全部用户列表 (仅 admin)
export const adminGetUsers = (req: express.Request, res: express.Response) => {
  try {
    const stmt = db.prepare(`
      SELECT 
        u.username, 
        u.role, 
        u.lastAiResetDate, 
        u.aiUsedToday,
        u.idCardLast6,
        u.phoneLast4,
        u.vipExpireAt,
        u.customAiLimit,
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
};

// 8.5 获取特定用户的周度错题统计数据 (仅 admin)
export const adminGetUserWeeklyStats = (req: express.Request, res: express.Response) => {
  try {
    const { username } = req.params;
    
    // 检查用户是否存在
    const userExists = db.prepare("SELECT username FROM users WHERE username = ?").get(username);
    if (!userExists) {
      return res.status(404).json({ error: "目标用户不存在" });
    }

    // 获取该用户所有的错题
    const stmt = db.prepare(`
      SELECT createdAt, masteryStatus, subject 
      FROM questions 
      WHERE userId = ? 
      ORDER BY createdAt DESC
    `);
    const rows = stmt.all(username) as { createdAt: number, masteryStatus: string, subject: string }[];

    // 自然周计算辅助函数 (周一 00:00:00 至 周日 23:59:59)
    const getMondayDateString = (timestamp: number) => {
      const date = new Date(timestamp);
      const day = date.getDay(); // 0 是周日, 1-6 是周一到周六
      
      const diffToMonday = date.getDate() - (day === 0 ? 6 : day - 1);
      const monday = new Date(date.getTime());
      monday.setDate(diffToMonday);
      monday.setHours(0, 0, 0, 0);
      
      const sunday = new Date(monday.getTime());
      sunday.setDate(monday.getDate() + 6);
      sunday.setHours(23, 59, 59, 999);
      
      const formatDate = (d: Date) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const dateVal = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${dateVal}`;
      };
      
      const mondayStr = formatDate(monday);
      const sundayStr = formatDate(sunday);
      const label = `${mondayStr.replace(/-/g, '.')} ~ ${sundayStr.slice(5).replace(/-/g, '.')}`;
      
      return {
        key: mondayStr,
        label,
        start: monday.getTime(),
        end: sunday.getTime()
      };
    };

    interface WeeklyStatItem {
      weekKey: string;
      weekLabel: string;
      weekStart: number;
      weekEnd: number;
      total: number;
      mastered: number;
      notMastered: number;
      bySubject: Record<string, number>;
    }

    const statsMap = new Map<string, WeeklyStatItem>();

    for (const row of rows) {
      const createdAt = row.createdAt || Date.now();
      const masteryStatus = row.masteryStatus || 'not_mastered';
      const subject = row.subject || '其他';

      const { key, label, start, end } = getMondayDateString(createdAt);
      
      if (!statsMap.has(key)) {
        statsMap.set(key, {
          weekKey: key,
          weekLabel: label,
          weekStart: start,
          weekEnd: end,
          total: 0,
          mastered: 0,
          notMastered: 0,
          bySubject: {}
        });
      }
      
      const stat = statsMap.get(key)!;
      stat.total += 1;
      if (masteryStatus === 'mastered') {
        stat.mastered += 1;
      } else {
        stat.notMastered += 1;
      }
      
      stat.bySubject[subject] = (stat.bySubject[subject] || 0) + 1;
    }

    const result = Array.from(statsMap.values()).sort((a, b) => b.weekStart - a.weekStart);
    res.json(result);
  } catch (error: any) {
    console.error("Admin Get User Weekly Stats Error:", error);
    res.status(500).json({ error: error.message || "获取用户周报统计失败" });
  }
};

// 9. 添加用户 (仅 admin)
export const adminCreateUser = (req: express.Request, res: express.Response) => {
  try {
    const { role, username, password, idCardLast6, phoneLast4 } = req.body;
    if (!role || !['user', 'vip', 'svip'].includes(role)) {
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

    if (role === 'user' && (idCardLast6?.trim() || phoneLast4?.trim())) {
      // 创建免密普通用户
      const cleanIdCard = idCardLast6?.trim();
      const cleanPhone = phoneLast4?.trim();
      if (cleanIdCard && cleanIdCard.length !== 6) {
        return res.status(400).json({ error: "身份证后6位必须是6位" });
      }
      if (cleanPhone && cleanPhone.length !== 4) {
        return res.status(400).json({ error: "手机号后4位必须是4位" });
      }
      const hashedPassword = hashPassword("student_no_password");
      db.prepare(`
        INSERT INTO users (username, password, role, idCardLast6, phoneLast4)
        VALUES (?, ?, 'user', ?, ?)
      `).run(cleanUsername, hashedPassword, cleanIdCard || null, cleanPhone || null);
    } else {
      // 创建有密用户 (包括 user, vip, svip)
      if (!password || password.trim() === "") {
        return res.status(400).json({ error: "登录密码不能为空" });
      }
      if (password.length < 6) {
        return res.status(400).json({ error: "密码长度不能少于 6 位" });
      }
      const emailRegex = /^[a-zA-Z0-9_-]+@[a-zA-Z0-9_-]+(\.[a-zA-Z0-9_-]+)+$/;
      if (!emailRegex.test(cleanUsername)) {
        return res.status(400).json({ error: "账号必须为合法的邮箱格式" });
      }
      const hashedPassword = hashPassword(password);
      db.prepare(`
        INSERT INTO users (username, password, role)
        VALUES (?, ?, ?)
      `).run(cleanUsername, hashedPassword, role);
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error("Admin Create User Error:", error);
    res.status(500).json({ error: error.message || "创建用户失败" });
  }
};

// 10. 修改用户属性 (仅 admin)
export const adminUpdateUser = (req: express.Request, res: express.Response) => {
  try {
    const oldUsername = req.params.username;
    const { newUsername, password, role, idCardLast6, phoneLast4, vipExpireAt, customAiLimit } = req.body;

    if (!newUsername || newUsername.trim() === "") {
      return res.status(400).json({ error: "用户名不能为空" });
    }
    const cleanNewUsername = newUsername.trim();
    if (cleanNewUsername.length < 2) {
      return res.status(400).json({ error: "用户名长度不能少于 2 位" });
    }

    if (role && !['user', 'vip', 'svip', 'admin'].includes(role)) {
      return res.status(400).json({ error: "非法的用户角色等级" });
    }

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

      if (vipExpireAt !== undefined) {
        db.prepare("UPDATE users SET vipExpireAt = ? WHERE username = ?").run(vipExpireAt || null, cleanNewUsername);
      }

      if (customAiLimit !== undefined) {
        const limitVal = customAiLimit === null || customAiLimit === '' || customAiLimit === undefined ? null : parseInt(customAiLimit);
        db.prepare("UPDATE users SET customAiLimit = ? WHERE username = ?").run(limitVal, cleanNewUsername);
      }

      const userObj = db.prepare("SELECT role FROM users WHERE username = ?").get(cleanNewUsername) as { role: string } | undefined;
      if (userObj && userObj.role === 'user') {
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
};

// 11. 删除用户 (仅 admin)
export const adminDeleteUser = (req: express.Request, res: express.Response) => {
  try {
    const { username } = req.params;
    if (username === 'admin') {
      return res.status(400).json({ error: "不能删除系统管理员账号" });
    }

    const deleteTransaction = db.transaction(() => {
      db.prepare("DELETE FROM notebooks WHERE userId = ?").run(username);
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
};

// ================= 错题本管理 =================

// 12. 获取错题本列表
export const getNotebooks = (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const stmt = db.prepare(`
      SELECT n.*, COUNT(q.id) as questionCount 
      FROM notebooks n 
      LEFT JOIN questions q ON n.id = q.notebookId AND (q.userId = ? OR q.studentId = ?)
      WHERE n.userId = ? 
      GROUP BY n.id
      ORDER BY n.createdAt DESC
    `);
    const rows = stmt.all(req.userId, req.userId, req.userId);
    res.json(rows);
  } catch (error: any) {
    console.error("Get Notebooks Error:", error);
    res.status(500).json({ error: error.message || "获取错题本失败" });
  }
};

// 新增：获取未分类错题的总条数
export const getUnclassifiedQuestionsCount = (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const user = db.prepare("SELECT role FROM users WHERE username = ?").get(req.userId) as { role: string } | undefined;
    if (!user) {
      return res.status(404).json({ error: "用户不存在" });
    }

    let stmt;
    if (user.role === 'admin') {
      stmt = db.prepare("SELECT COUNT(*) as count FROM questions WHERE notebookId IS NULL OR notebookId = ''");
      const row = stmt.get() as { count: number };
      res.json({ count: row.count });
    } else {
      stmt = db.prepare("SELECT COUNT(*) as count FROM questions WHERE (notebookId IS NULL OR notebookId = '') AND (userId = ? OR studentId = ?)");
      const row = stmt.get(req.userId, req.userId) as { count: number };
      res.json({ count: row.count });
    }
  } catch (error: any) {
    console.error("Get Unclassified Count Error:", error);
    res.status(500).json({ error: error.message || "获取未分类错题数失败" });
  }
};

// 13. 创建错题本
export const createNotebook = (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const { name, grade, subject, description } = req.body;
    if (!name || name.trim() === "") {
      return res.status(400).json({ error: "错题本名称不能为空" });
    }
    const id = "nb_" + Math.random().toString(36).substring(2, 9);
    const stmt = db.prepare("INSERT INTO notebooks (id, name, userId, createdAt, grade, subject, description) VALUES (?, ?, ?, ?, ?, ?, ?)");
    stmt.run(id, name.trim(), req.userId, Date.now(), grade || null, subject || null, description || null);
    res.json({ success: true, notebook: { id, name: name.trim(), grade, subject, description } });
  } catch (error: any) {
    console.error("Create Notebook Error:", error);
    res.status(500).json({ error: error.message || "创建错题本失败" });
  }
};

// 14. 更新错题本
export const updateNotebook = (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const { id } = req.params;
    const { name, grade, subject, description } = req.body;
    if (!name || name.trim() === "") {
      return res.status(400).json({ error: "错题本名称不能为空" });
    }
    const stmt = db.prepare("UPDATE notebooks SET name = ?, grade = ?, subject = ?, description = ? WHERE id = ? AND userId = ?");
    const result = stmt.run(name.trim(), grade || null, subject || null, description || null, id, req.userId);
    if (result.changes === 0) {
      return res.status(400).json({ error: "更新失败，错题本不存在或不属于您" });
    }
    res.json({ success: true });
  } catch (error: any) {
    console.error("Update Notebook Error:", error);
    res.status(500).json({ error: error.message || "更新错题本失败" });
  }
};

// 15. 删除错题本
export const deleteNotebook = (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const { id } = req.params;
    const deleteTx = db.transaction(() => {
      // 物理级联删除属于该用户的该错题本下的所有错题
      db.prepare("DELETE FROM questions WHERE notebookId = ? AND (userId = ? OR studentId = ?)")
        .run(id, req.userId, req.userId);
      // 删除错题本自身
      db.prepare("DELETE FROM notebooks WHERE id = ? AND userId = ?")
        .run(id, req.userId);
    });
    deleteTx();
    res.json({ success: true });
  } catch (error: any) {
    console.error("Delete Notebook Error:", error);
    res.status(500).json({ error: error.message || "删除错题本失败" });
  }
};

// 16. 快捷修改错题掌握状态
export const updateQuestionMastery = (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const { id } = req.params;
    const { masteryStatus } = req.body;
    if (!id || !masteryStatus) {
      return res.status(400).json({ error: "参数不完整" });
    }

    const checkStmt = db.prepare("SELECT userId FROM questions WHERE id = ?");
    const existing = checkStmt.get(id) as { userId: string } | undefined;
    if (!existing) {
      return res.status(404).json({ error: "错题不存在" });
    }

    const user = db.prepare("SELECT role FROM users WHERE username = ?").get(req.userId) as { role: string } | undefined;
    if (!user) {
      return res.status(403).json({ error: "用户不存在" });
    }

    if (existing.userId !== req.userId && user.role !== 'admin') {
      return res.status(403).json({ error: "无权修改此错题的掌握状态" });
    }

    db.prepare("UPDATE questions SET masteryStatus = ? WHERE id = ?").run(masteryStatus, id);
    res.json({ success: true });
  } catch (error: any) {
    console.error("Update Question Mastery Error:", error);
    res.status(500).json({ error: error.message || "更新掌握状态失败" });
  }
};

// 17. 获取已组试卷列表
export const getPapers = (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const user = db.prepare("SELECT role FROM users WHERE username = ?").get(req.userId) as { role: string } | undefined;
    if (!user) {
      return res.status(404).json({ error: "用户不存在" });
    }

    let rows: any[];
    if (user.role === 'admin') {
      rows = db.prepare("SELECT * FROM papers ORDER BY createdAt DESC").all() as any[];
    } else {
      rows = db.prepare("SELECT * FROM papers WHERE userId = ? ORDER BY createdAt DESC").all(req.userId) as any[];
    }

    const papers = rows.map(row => ({
      id: row.id,
      title: row.title,
      userId: row.userId,
      createdAt: row.createdAt,
      questionIds: JSON.parse(row.questionIds),
      mode: row.mode
    }));

    res.json(papers);
  } catch (error: any) {
    console.error("Get Papers Error:", error);
    res.status(500).json({ error: error.message || "获取试卷列表失败" });
  }
};

// 18. 保存试卷
export const savePaper = (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const { title, questionIds, mode } = req.body;
    if (!title || !questionIds || !Array.isArray(questionIds) || questionIds.length === 0) {
      return res.status(400).json({ error: "试卷数据不完整" });
    }

    const id = "paper_" + Math.random().toString(36).substring(2, 9);
    db.prepare(`
      INSERT INTO papers (id, title, userId, createdAt, questionIds, mode)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, title.trim(), req.userId, Date.now(), JSON.stringify(questionIds), mode || 'original');

    res.json({ success: true, paper: { id, title: title.trim(), createdAt: Date.now() } });
  } catch (error: any) {
    console.error("Save Paper Error:", error);
    res.status(500).json({ error: error.message || "保存试卷失败" });
  }
};

// 19. 删除试卷
export const deletePaper = (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const { id } = req.params;
    const user = db.prepare("SELECT role FROM users WHERE username = ?").get(req.userId) as { role: string } | undefined;
    if (!user) {
      return res.status(404).json({ error: "用户不存在" });
    }

    const existing = db.prepare("SELECT userId FROM papers WHERE id = ?").get(id) as { userId: string } | undefined;
    if (!existing) {
      return res.status(404).json({ error: "试卷不存在" });
    }

    if (existing.userId !== req.userId && user.role !== 'admin') {
      return res.status(403).json({ error: "无权删除此试卷" });
    }

    db.prepare("DELETE FROM papers WHERE id = ?").run(id);
    res.json({ success: true });
  } catch (error: any) {
    console.error("Delete Paper Error:", error);
    res.status(500).json({ error: error.message || "删除试卷失败" });
  }
};
