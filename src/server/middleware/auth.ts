import express from "express";
import { db } from "../config/db";

// 鉴权请求接口，继承 express.Request
export interface AuthenticatedRequest extends express.Request {
  userId?: string;
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
