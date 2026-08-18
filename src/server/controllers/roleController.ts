import express from "express";
import { db } from "../config/db";
import { AuthenticatedRequest } from "../middleware/auth";
import { hashPassword } from "./authController";

// 校验创建老师/教务的通用字段
function validateTeacherInput(username: string, password: string, realName?: string) {
  if (!username || username.trim() === "") return "账号不能为空";
  if (username.trim().length < 2) return "账号长度不能少于 2 位";
  if (!password || password.trim() === "") return "登录密码不能为空";
  if (password.length < 6) return "密码长度不能少于 6 位";
  return null;
}

// 检查账号是否存在
function accountExists(username: string): boolean {
  return !!db.prepare("SELECT username FROM users WHERE username = ?").get(username.trim());
}

// 管理员查询教务/教学老师列表: GET /api/admin/roles?type=jiaowu|jiaoxue
export const adminGetRoles = (req: express.Request, res: express.Response) => {
  try {
    const type = req.query.type as string;
    if (type === 'jiaowu') {
      const rows = db.prepare(`
        SELECT j.username, j.realName, j.nickname
        FROM users j
        WHERE j.accountType = 'jiaowu'
        ORDER BY j.username ASC
      `).all();
      return res.json(rows);
    }
    if (type === 'jiaoxue') {
      const rows = db.prepare(`
        SELECT
          j.username, j.realName, j.nickname,
          (SELECT COUNT(*) FROM users s WHERE s.teacherUsername = j.username AND s.accountType = 'student') as studentCount
        FROM users j
        WHERE j.accountType = 'jiaoxue'
        ORDER BY j.username ASC
      `).all();
      return res.json(rows);
    }
    return res.status(400).json({ error: "type 参数必须为 jiaowu 或 jiaoxue" });
  } catch (error: any) {
    console.error("Admin Get Roles Error:", error);
    res.status(500).json({ error: error.message || "获取角色列表失败" });
  }
};

// 创建教务老师（管理员专属）: POST /api/admin/jiaowu
export const adminCreateJiaowu = (req: express.Request, res: express.Response) => {
  try {
    const { username, password, realName, nickname } = req.body;
    const err = validateTeacherInput(username, password, realName);
    if (err) return res.status(400).json({ error: err });
    const cleanUsername = username.trim();
    if (accountExists(cleanUsername)) {
      return res.status(400).json({ error: "该账号已存在" });
    }
    db.prepare(`
      INSERT INTO users (username, password, role, accountType, realName, nickname, customAiLimit)
      VALUES (?, ?, 'user', 'jiaowu', ?, ?, -1)
    `).run(cleanUsername, hashPassword(password), realName?.trim() || null, nickname?.trim() || null);
    res.json({ success: true, message: "教务老师创建成功（AI 额度无限）" });
  } catch (error: any) {
    console.error("Admin Create Jiaowu Error:", error);
    res.status(500).json({ error: error.message || "创建教务老师失败" });
  }
};

// 创建教学老师（管理员专属）: POST /api/admin/jiaoxue
export const adminCreateJiaoxue = (req: express.Request, res: express.Response) => {
  try {
    const { username, password, realName, nickname, teacherUsername } = req.body;
    const err = validateTeacherInput(username, password, realName);
    if (err) return res.status(400).json({ error: err });
    const cleanUsername = username.trim();
    if (accountExists(cleanUsername)) {
      return res.status(400).json({ error: "该账号已存在" });
    }
    // 若指定了所属教务，校验其存在
    if (teacherUsername?.trim()) {
      const t = db.prepare("SELECT accountType FROM users WHERE username = ?").get(teacherUsername.trim());
      if (!t || (t as any).accountType !== 'jiaowu') {
        return res.status(400).json({ error: "所属教务老师不存在或非教务角色" });
      }
    }
    db.prepare(`
      INSERT INTO users (username, password, role, accountType, realName, nickname, customAiLimit)
      VALUES (?, ?, 'user', 'jiaoxue', ?, ?, -1)
    `).run(cleanUsername, hashPassword(password), realName?.trim() || null, nickname?.trim() || null);
    res.json({ success: true, message: "教学老师创建成功（AI 额度无限）" });
  } catch (error: any) {
    console.error("Admin Create Jiaoxue Error:", error);
    res.status(500).json({ error: error.message || "创建教学老师失败" });
  }
};

// 教务创建教学老师: POST /api/jiaowu/jiaoxue
export const jiaowuCreateJiaoxue = (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const { username, password, realName, nickname } = req.body;
    const err = validateTeacherInput(username, password, realName);
    if (err) return res.status(400).json({ error: err });
    const cleanUsername = username.trim();
    if (accountExists(cleanUsername)) {
      return res.status(400).json({ error: "该账号已存在" });
    }
    db.prepare(`
      INSERT INTO users (username, password, role, accountType, realName, nickname, customAiLimit)
      VALUES (?, ?, 'user', 'jiaoxue', ?, ?, -1)
    `).run(cleanUsername, hashPassword(password), realName?.trim() || null, nickname?.trim() || null);
    res.json({ success: true, message: "教学老师创建成功（AI 额度无限）" });
  } catch (error: any) {
    console.error("Jiaowu Create Jiaoxue Error:", error);
    res.status(500).json({ error: error.message || "创建教学老师失败" });
  }
};
