import express from "express";
import { db } from "../config/db";
import { AuthenticatedRequest } from "../middleware/auth";
import { hashPassword } from "./authController";

// 学生默认密码
const DEFAULT_STUDENT_PASSWORD = "123456";

function accountExists(username: string): boolean {
  return !!db.prepare("SELECT username FROM users WHERE username = ?").get(username);
}

// 自动创建以学生姓名命名的错题本
function ensureStudentNotebook(username: string, realName: string): string {
  // 若已存在以该学生为主人的默认错题本，直接复用
  const existing = db.prepare(
    "SELECT id FROM notebooks WHERE userId = ? AND type = 'normal' AND name = ? LIMIT 1"
  ).get(username, realName + "的错题本") as { id: string } | undefined;
  if (existing) return existing.id;

  const id = "nb_" + Math.random().toString(36).substring(2, 9);
  db.prepare(`
    INSERT INTO notebooks (id, name, userId, createdAt, grade, type)
    VALUES (?, ?, ?, ?, ?, 'normal')
  `).run(id, realName + "的错题本", username, Date.now(), null);
  return id;
}

// 教务创建学生账号: POST /api/jiaowu/students
export const createStudent = (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const {
      realName,       // 姓名
      gender,         // 性别
      grade,          // 年级
      city,           // 所在城市
      subjects,       // 需要伴学的科目（逗号分隔或数组）
      payType,        // 付费性质：试课用户/付费用户
      accompanyStart, // 伴学开始（YYYY-MM-DD）
      accompanyEnd,   // 伴学结束（YYYY-MM-DD）
      contactPhone,   // 联系方式（手机号 = 登录账号）
      password,       // 登录密码（可自定义，默认 123456）
      teacherUsername // 所属教学老师
    } = req.body;

    if (!realName || realName.trim() === "") {
      return res.status(400).json({ error: "姓名不能为空" });
    }
    if (!contactPhone || contactPhone.trim() === "") {
      return res.status(400).json({ error: "联系方式（登录账号）不能为空" });
    }
    const cleanPhone = contactPhone.trim();
    if (accountExists(cleanPhone)) {
      return res.status(400).json({ error: "该手机号账号已存在" });
    }
    if (!accompanyStart || !accompanyEnd) {
      return res.status(400).json({ error: "伴学开始/结束时间不能为空" });
    }
    // 校验伴学时间
    if (accompanyEnd < accompanyStart) {
      return res.status(400).json({ error: "伴学结束时间不能早于开始时间" });
    }

    // 校验所属教学老师
    if (teacherUsername?.trim()) {
      const t = db.prepare("SELECT accountType FROM users WHERE username = ?").get(teacherUsername.trim());
      if (!t || (t as any).accountType !== 'jiaoxue') {
        return res.status(400).json({ error: "所属教学老师不存在或非教学角色" });
      }
    }

    const finalPassword = password && password.trim() !== "" ? password.trim() : DEFAULT_STUDENT_PASSWORD;
    if (finalPassword.length < 6) {
      return res.status(400).json({ error: "密码长度不能少于 6 位" });
    }
    const subjectsStr = Array.isArray(subjects) ? subjects.join(",") : (subjects || "");

    // 创建学生账号（accountType='student'，role='vip'，额度无限 customAiLimit=-1，VIP 过期=伴学结束）
    const tx = db.transaction(() => {
      db.prepare(`
        INSERT INTO users (
          username, password, role, accountType,
          realName, gender, grade, city, subjects, payType,
          accompanyStart, accompanyEnd, teacherUsername, contactPhone,
          vipExpireAt, customAiLimit
        )
        VALUES (?, ?, 'vip', 'student', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, -1)
      `).run(
        cleanPhone, hashPassword(finalPassword),
        realName.trim(), gender?.trim() || null, grade?.trim() || null, city?.trim() || null,
        subjectsStr || null, payType?.trim() || null,
        accompanyStart, accompanyEnd, teacherUsername?.trim() || null, cleanPhone,
        accompanyEnd
      );

      // 自动创建以姓名命名的错题本
      ensureStudentNotebook(cleanPhone, realName.trim());
    });
    tx();

    res.json({
      success: true,
      message: "学生账号创建成功",
      student: {
        username: cleanPhone,
        realName: realName.trim(),
        password: finalPassword,
        accompanyEnd,
        teacherUsername: teacherUsername?.trim() || null
      }
    });
  } catch (error: any) {
    console.error("Jiaowu Create Student Error:", error);
    res.status(500).json({ error: error.message || "创建学生账号失败" });
  }
};

// 教务查询名下学生列表: GET /api/jiaowu/students?grade=&teacherUsername=
export const getStudents = (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const { grade, teacherUsername } = req.query;
    let sql = `
      SELECT username, realName, gender, grade, city, subjects, payType,
             accompanyStart, accompanyEnd, teacherUsername, contactPhone, vipExpireAt
      FROM users
      WHERE accountType = 'student'
    `;
    const params: any[] = [];
    if (grade) {
      sql += " AND grade = ?";
      params.push(grade);
    }
    if (teacherUsername) {
      sql += " AND teacherUsername = ?";
      params.push(teacherUsername);
    }
    sql += " ORDER BY username ASC";
    const students = db.prepare(sql).all(...params);
    res.json(students);
  } catch (error: any) {
    console.error("Jiaowu Get Students Error:", error);
    res.status(500).json({ error: error.message || "获取学生列表失败" });
  }
};

// 教务查询教学老师列表（带名下学生数）: GET /api/jiaowu/jiaoxues
export const getJiaoxues = (req: express.Request, res: express.Response) => {
  try {
    const rows = db.prepare(`
      SELECT
        j.username, j.realName, j.nickname,
        (SELECT COUNT(*) FROM users s WHERE s.teacherUsername = j.username AND s.accountType = 'student') as studentCount
      FROM users j
      WHERE j.accountType = 'jiaoxue'
      ORDER BY j.username ASC
    `).all() as any[];
    res.json(rows);
  } catch (error: any) {
    console.error("Jiaowu Get Jiaoxues Error:", error);
    res.status(500).json({ error: error.message || "获取教学老师列表失败" });
  }
};

// 教务编辑教学老师信息: PUT /api/jiaowu/jiaoxue/:username
export const updateJiaoxue = (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const { username } = req.params;
    const teacher = db.prepare("SELECT accountType FROM users WHERE username = ?").get(username) as { accountType: string } | undefined;
    if (!teacher || teacher.accountType !== 'jiaoxue') {
      return res.status(404).json({ error: "教学老师不存在" });
    }
    const { realName, nickname, password } = req.body;
    db.prepare(`
      UPDATE users SET
        realName = COALESCE(?, realName),
        nickname = COALESCE(?, nickname)
      WHERE username = ?
    `).run(
      realName?.trim() || null,
      nickname?.trim() || null,
      username
    );
    // 可选重置密码
    if (password && password.trim() !== "") {
      if (password.trim().length < 6) {
        return res.status(400).json({ error: "密码长度不能少于 6 位" });
      }
      db.prepare("UPDATE users SET password = ? WHERE username = ?").run(hashPassword(password.trim()), username);
    }
    res.json({ success: true, message: "教学老师信息已更新" });
  } catch (error: any) {
    console.error("Jiaowu Update Jiaoxue Error:", error);
    res.status(500).json({ error: error.message || "更新教学老师失败" });
  }
};

// 教务续期/更新学生伴学时间: PUT /api/jiaowu/students/:username/renew
export const renewStudent = (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const { username } = req.params;
    const { accompanyEnd } = req.body;
    if (!accompanyEnd) {
      return res.status(400).json({ error: "新的伴学结束时间不能为空" });
    }
    const student = db.prepare("SELECT accountType FROM users WHERE username = ?").get(username) as { accountType: string } | undefined;
    if (!student || student.accountType !== 'student') {
      return res.status(404).json({ error: "学生账号不存在" });
    }
    db.prepare("UPDATE users SET accompanyEnd = ?, vipExpireAt = ? WHERE username = ?").run(accompanyEnd, accompanyEnd, username);
    res.json({ success: true, message: "伴学时间已更新" });
  } catch (error: any) {
    console.error("Jiaowu Renew Student Error:", error);
    res.status(500).json({ error: error.message || "更新伴学时间失败" });
  }
};

// 教务编辑学生信息（通用编辑）: PUT /api/jiaowu/students/:username
export const updateStudent = (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const { username } = req.params;
    const student = db.prepare("SELECT accountType FROM users WHERE username = ?").get(username) as { accountType: string } | undefined;
    if (!student || student.accountType !== 'student') {
      return res.status(404).json({ error: "学生账号不存在" });
    }

    const {
      realName, gender, grade, city, subjects, payType,
      accompanyStart, accompanyEnd, teacherUsername, password
    } = req.body;

    // 校验伴学时间
    if (accompanyStart && accompanyEnd && accompanyEnd < accompanyStart) {
      return res.status(400).json({ error: "伴学结束时间不能早于开始时间" });
    }

    // 校验所属教学老师（若变更）
    if (teacherUsername !== undefined && teacherUsername && teacherUsername !== "") {
      const t = db.prepare("SELECT accountType FROM users WHERE username = ?").get(teacherUsername);
      if (!t || (t as any).accountType !== 'jiaoxue') {
        return res.status(400).json({ error: "所属教学老师不存在或非教学角色" });
      }
    }

    const subjectsStr = Array.isArray(subjects) ? subjects.join(",") : subjects;

    db.prepare(`
      UPDATE users SET
        realName = COALESCE(?, realName),
        gender = COALESCE(?, gender),
        grade = COALESCE(?, grade),
        city = COALESCE(?, city),
        subjects = COALESCE(?, subjects),
        payType = COALESCE(?, payType),
        accompanyStart = COALESCE(?, accompanyStart),
        accompanyEnd = COALESCE(?, accompanyEnd),
        vipExpireAt = COALESCE(?, vipExpireAt),
        teacherUsername = COALESCE(?, teacherUsername)
      WHERE username = ?
    `).run(
      realName?.trim() || null,
      gender || null,
      grade || null,
      city?.trim() || null,
      subjectsStr ?? null,
      payType || null,
      accompanyStart || null,
      accompanyEnd || null,
      accompanyEnd || null,
      teacherUsername?.trim() || null,
      username
    );

    // 可选：重置密码
    if (password && password.trim() !== "") {
      if (password.trim().length < 6) {
        return res.status(400).json({ error: "密码长度不能少于 6 位" });
      }
      db.prepare("UPDATE users SET password = ? WHERE username = ?").run(hashPassword(password.trim()), username);
    }

    // 若伴学结束时间变更，同步更新错题本（无操作，仅记录）
    res.json({ success: true, message: "学生信息已更新" });
  } catch (error: any) {
    console.error("Jiaowu Update Student Error:", error);
    res.status(500).json({ error: error.message || "更新学生信息失败" });
  }
};

// 教务获取单个学生详情（用于编辑回填）: GET /api/jiaowu/students/:username
export const getStudentDetail = (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const { username } = req.params;
    const student = db.prepare(`
      SELECT username, realName, gender, grade, city, subjects, payType,
             accompanyStart, accompanyEnd, teacherUsername, contactPhone, vipExpireAt
      FROM users WHERE accountType = 'student' AND username = ?
    `).get(username) as any;
    if (!student) {
      return res.status(404).json({ error: "学生账号不存在" });
    }
    res.json(student);
  } catch (error: any) {
    console.error("Jiaowu Get Student Detail Error:", error);
    res.status(500).json({ error: error.message || "获取学生详情失败" });
  }
};

// 教务删除学生账号: DELETE /api/jiaowu/students/:username
export const deleteStudent = (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const { username } = req.params;
    const student = db.prepare("SELECT accountType FROM users WHERE username = ?").get(username) as { accountType: string } | undefined;
    if (!student || student.accountType !== 'student') {
      return res.status(404).json({ error: "学生账号不存在" });
    }
    db.prepare("DELETE FROM users WHERE username = ?").run(username);
    res.json({ success: true, message: "学生账号已删除" });
  } catch (error: any) {
    console.error("Jiaowu Delete Student Error:", error);
    res.status(500).json({ error: error.message || "删除学生账号失败" });
  }
};
