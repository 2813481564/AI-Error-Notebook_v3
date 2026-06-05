import express from "express";
import crypto from "crypto";
import { db } from "../config/db";
import { AuthenticatedRequest } from "../middleware/auth";
import { useRedemptionCode, addDays } from "../services/redeemService";

// 1. 兑换码激活会员
export const redeemCode = (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const { code } = req.body;
    const username = req.userId;

    if (!code || code.trim() === "") {
      return res.status(400).json({ error: "兑换码不能为空" });
    }
    if (!username) {
      return res.status(401).json({ error: "未登录，请先登录" });
    }

    const result = useRedemptionCode(code, username);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({
      success: true,
      message: "会员兑换激活成功！",
      role: result.role,
      vipExpireAt: result.vipExpireAt
    });
  } catch (error: any) {
    console.error("Redeem Code Error:", error);
    res.status(500).json({ error: error.message || "兑换码使用失败" });
  }
};

// 2. 发起模拟支付
export const initiatePayment = (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const { amount } = req.body;
    const username = req.userId;

    if (!username) {
      return res.status(401).json({ error: "未登录，请先登录" });
    }

    const amountVal = parseInt(amount);
    if (isNaN(amountVal) || amountVal <= 0) {
      return res.status(400).json({ error: "无效的支付金额" });
    }

    const orderId = `PAY-${crypto.randomUUID().replace(/-/g, "").substring(0, 16).toUpperCase()}`;

    db.prepare(`
      INSERT INTO orders (orderId, username, amount, status, createdAt)
      VALUES (?, ?, ?, 'pending', ?)
    `).run(orderId, username, amountVal, Date.now());

    res.json({
      success: true,
      orderId,
      amount: amountVal,
      qrUrl: `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=MockPaymentForOrder-${orderId}`
    });
  } catch (error: any) {
    console.error("Initiate Payment Error:", error);
    res.status(500).json({ error: error.message || "发起模拟支付失败" });
  }
};

// 3. 模拟支付成功回调
export const confirmPaymentSuccess = (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const { orderId } = req.body;
    const username = req.userId;

    if (!username) {
      return res.status(401).json({ error: "未登录，请先登录" });
    }
    if (!orderId) {
      return res.status(400).json({ error: "订单ID不能为空" });
    }

    const order = db.prepare("SELECT * FROM orders WHERE orderId = ? AND username = ?").get(orderId, username) as {
      orderId: string;
      username: string;
      amount: number;
      status: string;
    } | undefined;

    if (!order) {
      return res.status(404).json({ error: "未找到对应的支付订单" });
    }

    if (order.status === 'success') {
      return res.json({ success: true, message: "该订单此前已支付成功" });
    }

    // 根据金额计算要奖励的套餐天数及身份
    // 规定金额映射：
    // ¥19 -> 30 天 VIP
    // ¥99 -> 365 天 VIP
    // ¥199 -> 365 天 SVIP
    let targetRole = 'vip';
    let days = 30;

    if (order.amount === 19) {
      targetRole = 'vip';
      days = 30;
    } else if (order.amount === 99) {
      targetRole = 'vip';
      days = 365;
    } else if (order.amount === 199) {
      targetRole = 'svip';
      days = 365;
    } else {
      // 任意其他金额，按 1 元/天的机制计算
      targetRole = 'vip';
      days = order.amount;
    }

    // 获取当前用户过期时间
    const user = db.prepare("SELECT role, vipExpireAt FROM users WHERE username = ?").get(username) as {
      role: string;
      vipExpireAt: string | null;
    } | undefined;

    if (!user) {
      return res.status(404).json({ error: "用户不存在" });
    }

    const today = new Date().toISOString().split('T')[0];
    let baseDate = today;

    // 如果用户当前已经是该级别（或更高）的会员，并且会员还没过期，则在此基础上累加天数
    if (user.vipExpireAt && user.vipExpireAt >= today) {
      baseDate = user.vipExpireAt;
    }

    const newVipExpireAt = addDays(baseDate, days);

    // 数据库事务保障
    const payTx = db.transaction(() => {
      db.prepare("UPDATE orders SET status = 'success' WHERE orderId = ?").run(orderId);
      db.prepare("UPDATE users SET role = ?, vipExpireAt = ? WHERE username = ?").run(targetRole, newVipExpireAt, username);
    });

    payTx();

    res.json({
      success: true,
      message: "模拟支付确认成功，会员已激活！",
      role: targetRole,
      vipExpireAt: newVipExpireAt
    });
  } catch (error: any) {
    console.error("Confirm Payment Success Error:", error);
    res.status(500).json({ error: error.message || "模拟支付回调失败" });
  }
};

// 4. 获取用户个人中心面板数据 (级别、到期日期、AI 额度)
export const getUserInfo = (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const username = req.userId;
    if (!username) {
      return res.status(401).json({ error: "未登录，请先登录" });
    }

    const user = db.prepare("SELECT role, lastAiResetDate, aiUsedToday, vipExpireAt FROM users WHERE username = ?").get(username) as {
      role: string;
      lastAiResetDate: string | null;
      aiUsedToday: number;
      vipExpireAt: string | null;
    } | undefined;

    if (!user) {
      return res.status(404).json({ error: "用户不存在" });
    }

    // 检查是否过期，自动修正
    const today = new Date().toISOString().split('T')[0];
    let currentRole = user.role;
    if ((currentRole === 'vip' || currentRole === 'svip') && user.vipExpireAt) {
      if (today > user.vipExpireAt) {
        db.prepare("UPDATE users SET role = 'student' WHERE username = ?").run(username);
        currentRole = 'student';
      }
    }

    // 计算限额
    let limit = 30;
    if (currentRole === 'teacher') limit = 5000;
    else if (currentRole === 'vip') limit = 100;
    else if (currentRole === 'svip') limit = 300;
    else if (currentRole === 'admin') limit = Infinity;

    // 如果天数变了，使用次数今天重置
    let usedToday = user.aiUsedToday;
    if (user.lastAiResetDate !== today) {
      usedToday = 0;
    }

    res.json({
      username,
      role: currentRole,
      vipExpireAt: user.vipExpireAt || null,
      aiUsedToday: usedToday,
      aiLimit: limit,
      aiRemaining: limit === Infinity ? "无限" : Math.max(0, limit - usedToday)
    });
  } catch (error: any) {
    console.error("Get User Info Error:", error);
    res.status(500).json({ error: error.message || "获取用户信息失败" });
  }
};
