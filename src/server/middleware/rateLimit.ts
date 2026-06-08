import express from "express";
import { db } from "../config/db";
import { AuthenticatedRequest } from "./auth";

// 限制 AI 使用次数中间件
export const checkAiLimit = (req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) => {
  const username = req.userId;
  if (!username) {
    return res.status(401).json({ error: "未登录，请先登录" });
  }

  if (username === 'admin') {
    return next();
  }

  try {
    const user = db.prepare("SELECT role, lastAiResetDate, aiUsedToday, vipExpireAt, customAiLimit FROM users WHERE username = ?").get(username) as {
      role: string;
      lastAiResetDate: string | null;
      aiUsedToday: number;
      vipExpireAt: string | null;
      customAiLimit: number | null;
    } | undefined;

    if (!user) {
      return res.status(404).json({ error: "用户不存在" });
    }

    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    let used = user.aiUsedToday;
    let role = user.role;

    // 检查 VIP 过期时间并自动降级为 user
    if ((role === 'vip' || role === 'svip') && user.vipExpireAt) {
      if (today > user.vipExpireAt) {
        db.prepare("UPDATE users SET role = 'user' WHERE username = ?").run(username);
        role = 'user';
        console.log(`用户 ${username} 会员已于 ${user.vipExpireAt} 过期，已自动降级为 user`);
      }
    }

    if (user.lastAiResetDate !== today) {
      db.prepare("UPDATE users SET lastAiResetDate = ?, aiUsedToday = 0 WHERE username = ?").run(today, username);
      used = 0;
    }

    let limit = 30; // 默认普通用户限额
    if (user.customAiLimit !== null && user.customAiLimit !== undefined) {
      limit = user.customAiLimit;
    } else {
      if (role === 'vip') limit = 100;
      else if (role === 'svip') limit = 300;
      else if (role === 'admin') limit = Infinity;
    }

    if (used >= limit) {
      const showLimitStr = limit === Infinity ? "无限" : `${limit}次`;
      return res.status(429).json({ error: `您今日的 AI 额度已用尽（当前等级: ${role.toUpperCase()}，今日已用: ${used}/${showLimitStr}）。如需更多额度，请联系管理员直接授权或激活兑换码。` });
    }

    // 预扣除 AI 使用次数
    db.prepare("UPDATE users SET aiUsedToday = aiUsedToday + 1 WHERE username = ?").run(username);
    next();
  } catch (err) {
    console.error("AI Limit Check Error:", err);
    return res.status(500).json({ error: "服务器限额校验失败" });
  }
};
