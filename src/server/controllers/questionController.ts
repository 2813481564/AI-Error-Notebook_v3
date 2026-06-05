import express from "express";
import { db } from "../config/db";
import { AuthenticatedRequest } from "../middleware/auth";
import { hashPassword } from "./authController";

// ================= 错题管理 =================

// 1. 获取错题列表
export const getQuestions = (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const user = db.prepare("SELECT role FROM users WHERE username = ?").get(req.userId) as { role: string } | undefined;
    let rows: any[];
    
    if (!user) {
      return res.status(404).json({ error: "用户不存在" });
    }

    if (user.role === 'admin' || user.role === 'teacher') {
      // 教师或管理员可以查看系统所有错题
      const stmt = db.prepare("SELECT * FROM questions ORDER BY createdAt DESC");
      rows = stmt.all() as any[];
    } else {
      // 普通学生/VIP/SVIP 只能查看自己录入的（userId = 自己）或者被指派给自己的（studentId = 自己）
      const stmt = db.prepare("SELECT * FROM questions WHERE userId = ? OR studentId = ? ORDER BY createdAt DESC");
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
      paperName: row.paperName || undefined,
      standardAnswer: row.standardAnswer || undefined,
      score: row.score !== null && row.score !== undefined ? row.score : undefined
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

    // 免密学生限制权限，必须由老师录入
    if (user.role === 'student' && user.password === hashPassword("student_no_password")) {
      return res.status(403).json({ error: "权限不足，免密学生角色无法录入或编辑错题" });
    }

    const checkStmt = db.prepare("SELECT userId, studentId, status FROM questions WHERE id = ?");
    const existing = checkStmt.get(question.id) as { userId: string, studentId: string | null, status: string } | undefined;
    
    // 如果错题已存在且不属于当前用户，非管理员和教师不可修改
    if (existing && existing.userId !== req.userId && user.role !== 'admin' && user.role !== 'teacher') {
      return res.status(403).json({ error: "您没有权限修改该错题" });
    }

    const targetUserId = existing ? existing.userId : req.userId;
    const targetStudentId = question.studentId !== undefined ? question.studentId : (existing ? existing.studentId : null);
    // 自注册学生录入默认为 audited (自审)，老师录入可保留 pending/audited
    const defaultStatus = (user.role !== 'admin' && user.role !== 'teacher') ? 'audited' : 'pending';
    const targetStatus = question.status !== undefined ? question.status : (existing ? existing.status : defaultStatus);

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

    // 免密学生限制权限
    if (user.role === 'student' && user.password === hashPassword("student_no_password")) {
      return res.status(403).json({ error: "权限不足，免密学生角色无法删除错题" });
    }

    const checkStmt = db.prepare("SELECT userId FROM questions WHERE id = ?");
    const existing = checkStmt.get(id) as { userId: string } | undefined;
    if (!existing) {
      return res.status(404).json({ error: "错题不存在" });
    }
    
    // 非管理员/教师 且 非作者，不能删除
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

// 9. 添加用户 (仅 admin)
export const adminCreateUser = (req: express.Request, res: express.Response) => {
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
};

// 10. 修改用户属性 (仅 admin)
export const adminUpdateUser = (req: express.Request, res: express.Response) => {
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
};

// 11. 删除用户 (仅 admin)
export const adminDeleteUser = (req: express.Request, res: express.Response) => {
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
};
