import express from "express";
import { db } from "../config/db";

// 鉴权请求接口，继承 express.Request
export interface AuthenticatedRequest extends express.Request {
  userId?: string;
  accountType?: string;
}

// 判断学生账号是否在伴学有效期内（未过期返回 true）
function isStudentActive(accountType: string, accompanyEnd: string | null, vipExpireAt: string | null): boolean {
  if (accountType !== 'student') return true;
  const today = new Date().toISOString().split('T')[0];
  // 优先用伴学结束日期，其次 vipExpireAt
  const end = accompanyEnd || vipExpireAt;
  if (!end) return false; // 学生账号必须有结束时间
  return today <= end;
}

// 登录校验中间件
export const requireAuth = (req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) => {
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

    // 第二阶段：学生账号时效校验（含已登录但过期的情况，防止绕过前端）
    const user = db.prepare(
      "SELECT accountType, accompanyEnd, vipExpireAt FROM users WHERE username = ?"
    ).get(row.username) as { accountType: string | null; accompanyEnd: string | null; vipExpireAt: string | null } | undefined;
    if (user && user.accountType === 'student' && !isStudentActive('student', user.accompanyEnd, user.vipExpireAt)) {
      // 清除该用户所有会话，强制下线
      db.prepare("DELETE FROM sessions WHERE username = ?").run(row.username);
      return res.status(403).json({ error: "账号伴学时间已过期，无法访问系统，请联系教务老师续期" });
    }
    req.accountType = user?.accountType || undefined;
    next();
  } catch (err) {
    console.error("Auth Middleware Error:", err);
    return res.status(500).json({ error: "服务器内部鉴权错误" });
  }
};

// 系统管理员拦截器
export const requireAdmin = (req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) => {
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

// ============ 第二阶段：新角色中间件（独立实现，不混入旧逻辑） ============

// 读取当前用户的 accountType（已鉴权后）
function getAccountType(username: string): string | null {
  const row = db.prepare("SELECT accountType FROM users WHERE username = ?").get(username) as { accountType: string | null } | undefined;
  return row ? row.accountType : null;
}

// 教务老师（jiaowu）专属。管理员亦可访问。
export const requireJiaowu = (req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) => {
  requireAuth(req, res, () => {
    try {
      if (!req.userId) return res.status(401).json({ error: "未登录" });
      const user = db.prepare("SELECT role, accountType FROM users WHERE username = ?").get(req.userId) as { role: string; accountType: string | null } | undefined;
      if (!user) return res.status(404).json({ error: "用户不存在" });
      if (user.role === 'admin' || user.accountType === 'jiaowu') return next();
      return res.status(403).json({ error: "权限不足，仅教务老师可访问" });
    } catch (err) {
      return res.status(500).json({ error: "服务器内部鉴权错误" });
    }
  });
};

// 教学老师（jiaoxue）专属。管理员/教务亦可访问（教务可查看学生数据）。
export const requireJiaoxue = (req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) => {
  requireAuth(req, res, () => {
    try {
      if (!req.userId) return res.status(401).json({ error: "未登录" });
      const user = db.prepare("SELECT role, accountType FROM users WHERE username = ?").get(req.userId) as { role: string; accountType: string | null } | undefined;
      if (!user) return res.status(404).json({ error: "用户不存在" });
      if (user.role === 'admin' || user.accountType === 'jiaowu' || user.accountType === 'jiaoxue') return next();
      return res.status(403).json({ error: "权限不足，仅教学老师可访问" });
    } catch (err) {
      return res.status(500).json({ error: "服务器内部鉴权错误" });
    }
  });
};

// 学生（student）专属
export const requireStudent = (req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) => {
  requireAuth(req, res, () => {
    try {
      if (!req.userId) return res.status(401).json({ error: "未登录" });
      const at = getAccountType(req.userId);
      if (at === 'student') return next();
      return res.status(403).json({ error: "权限不足，仅学生账号可访问" });
    } catch (err) {
      return res.status(500).json({ error: "服务器内部鉴权错误" });
    }
  });
};
