import express from "express";
import crypto from "crypto";
import { db } from "../config/db";
import { AuthenticatedRequest } from "../middleware/auth";
import { useRedemptionCode, addDays } from "../services/redeemService";
import { getSetting } from "../services/settingService";

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
    const { role, duration } = req.body;
    const username = req.userId;

    if (!username) {
      return res.status(401).json({ error: "未登录，请先登录" });
    }

    if (!role || !duration || !['vip', 'svip'].includes(role) || !['month', 'year'].includes(duration)) {
      return res.status(400).json({ error: "无效的套餐选择参数" });
    }

    // 从 system_settings 获取对应的套餐定价
    const priceKey = `PRICE_${role.toUpperCase()}_${duration.toUpperCase()}`;
    let priceVal = parseFloat(getSetting(priceKey, "0"));
    if (isNaN(priceVal) || priceVal <= 0) {
      // 容错默认值
      if (role === 'vip') {
        priceVal = duration === 'month' ? 19.90 : 199.00;
      } else {
        priceVal = duration === 'month' ? 29.90 : 299.00;
      }
    }

    const amountVal = Math.round(priceVal);
    const days = duration === 'month' ? 30 : 365;
    const orderId = `PAY-${crypto.randomUUID().replace(/-/g, "").substring(0, 16).toUpperCase()}`;

    // 将购买角色与天数存入订单
    db.prepare(`
      INSERT INTO orders (orderId, username, amount, status, createdAt, targetRole, days)
      VALUES (?, ?, ?, 'pending', ?, ?, ?)
    `).run(orderId, username, amountVal, Date.now(), role, days);

    res.json({
      success: true,
      orderId,
      amount: priceVal,
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
      targetRole: string | null;
      days: number | null;
    } | undefined;

    if (!order) {
      return res.status(404).json({ error: "未找到对应的支付订单" });
    }

    if (order.status === 'success') {
      return res.json({ success: true, message: "该订单此前已支付成功" });
    }

    // 获取购买角色与升级天数
    let targetRole = order.targetRole || 'vip';
    let days = order.days || 30;

    // 针对旧历史订单的回退兼容
    if (!order.targetRole || !order.days) {
      if (order.amount === 19 || order.amount === 20) {
        targetRole = 'vip';
        days = 30;
      } else if (order.amount === 99 || order.amount === 199) {
        targetRole = 'vip';
        days = 365;
      } else if (order.amount === 29 || order.amount === 30) {
        targetRole = 'svip';
        days = 30;
      } else if (order.amount === 299) {
        targetRole = 'svip';
        days = 365;
      } else {
        targetRole = 'vip';
        days = order.amount;
      }
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
      if (username === 'admin') {
        db.prepare("UPDATE users SET vipExpireAt = ? WHERE username = ?").run(newVipExpireAt, username);
      } else {
        db.prepare("UPDATE users SET role = ?, vipExpireAt = ? WHERE username = ?").run(targetRole, newVipExpireAt, username);
      }
    });

    payTx();

    res.json({
      success: true,
      message: "模拟支付确认成功，会员已激活！",
      role: username === 'admin' ? 'admin' : targetRole,
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

    const user = db.prepare("SELECT role, accountType, lastAiResetDate, aiUsedToday, vipExpireAt, accompanyEnd, realName, grade, nickname, avatar FROM users WHERE username = ?").get(username) as {
      role: string;
      accountType: string | null;
      lastAiResetDate: string | null;
      aiUsedToday: number;
      vipExpireAt: string | null;
      accompanyEnd: string | null;
      realName: string | null;
      grade: string | null;
      nickname: string | null;
      avatar: string | null;
    } | undefined;

    if (!user) {
      return res.status(404).json({ error: "用户不存在" });
    }

    // 第二阶段：学生账号过期则返回过期标记（前端据此清 token 跳登录）
    if (user.accountType === 'student') {
      const today = new Date().toISOString().split('T')[0];
      const end = user.accompanyEnd || user.vipExpireAt;
      if (!end || today > end) {
        return res.json({
          username,
          accountType: 'student',
          role: user.role,
          expired: true,
          error: "账号伴学时间已过期，无法访问系统"
        });
      }
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
    else if (currentRole === 'vip') limit = parseInt(getSetting("LIMIT_VIP", "100"));
    else if (currentRole === 'svip') limit = parseInt(getSetting("LIMIT_SVIP", "300"));
    else if (currentRole === 'admin') limit = Infinity;
    else limit = parseInt(getSetting("LIMIT_USER", "30"));

    // 计算错题容量上限 (0表示无限制)
    let capacityLimit = 50;
    if (currentRole === 'admin') capacityLimit = 0;
    else if (currentRole === 'svip') capacityLimit = parseInt(getSetting("CAPACITY_SVIP", "0"));
    else if (currentRole === 'vip') capacityLimit = parseInt(getSetting("CAPACITY_VIP", "500"));
    else capacityLimit = parseInt(getSetting("CAPACITY_USER", "50"));

    const countRow = db.prepare(`
      SELECT COUNT(q.id) as count 
      FROM questions q
      LEFT JOIN notebooks n ON q.notebookId = n.id
      WHERE q.userId = ? AND (n.type = 'normal' OR q.notebookId IS NULL OR q.notebookId = '')
    `).get(username) as { count: number } | undefined;
    const questionCount = countRow ? countRow.count : 0;

    // 如果天数变了，使用次数今天重置
    let usedToday = user.aiUsedToday;
    if (user.lastAiResetDate !== today) {
      usedToday = 0;
    }

    res.json({
      username,
      accountType: user.accountType || null,
      role: currentRole,
      vipExpireAt: user.vipExpireAt || null,
      accompanyEnd: user.accompanyEnd || null,
      realName: user.realName || null,
      grade: user.grade || null,
      aiUsedToday: usedToday,
      aiLimit: limit,
      aiRemaining: limit === Infinity ? "无限" : Math.max(0, limit - usedToday),
      capacityLimit,
      questionCount,
      nickname: user.nickname || null,
      avatar: user.avatar || null
    });
  } catch (error: any) {
    console.error("Get User Info Error:", error);
    res.status(500).json({ error: error.message || "获取用户信息失败" });
  }
};

// 获取当前所有启用的公告
export const getActiveAnnouncements = (req: express.Request, res: express.Response) => {
  try {
    const list = db.prepare("SELECT * FROM announcements WHERE status = 'active' ORDER BY sortOrder ASC, createdAt DESC").all();
    res.json(list);
  } catch (error: any) {
    console.error("Get Active Announcements Error:", error);
    res.status(500).json({ error: error.message || "获取公告列表失败" });
  }
};

// 获取私域联系客服与二维码配置
export const getVipContact = (req: express.Request, res: express.Response) => {
  try {
    const wechatQr = getSetting("VIP_WECHAT_QR", "");
    const wechatId = getSetting("VIP_WECHAT_ID", "Admin_VIP_Service");
    const serviceEmail = getSetting("VIP_SERVICE_EMAIL", "admin@qq.com");
    const notes = getSetting("VIP_SERVICE_NOTES", "人工服务在线时间：每日 9:00 - 22:00。非工作时段可留言，我们将在上线后第一时间为您授权。备注说明：加客服微信号请备注“错题本VIP升级”及您的登录邮箱账号。");
    
    // 自定义页面配置
    const vipCardTag = getSetting("VIP_CARD_TAG", "智能错题本会员");
    const vipCardTitle = getSetting("VIP_CARD_TITLE", "解锁更完整的 AI 错题本能力");
    const vipCardDesc = getSetting("VIP_CARD_DESC", "VIP 覆盖日常练习与组卷，SVIP 解锁探索模式 and 费曼学习。支持支付宝自助开通；如需对公或发票，可下滑联系客服协助。");
    const priceVipMonth = getSetting("PRICE_VIP_MONTH", "19.90");
    const priceVipYear = getSetting("PRICE_VIP_YEAR", "199.00");
    const priceSvipMonth = getSetting("PRICE_SVIP_MONTH", "29.90");
    const priceSvipYear = getSetting("PRICE_SVIP_YEAR", "299.00");

    const limitVip = getSetting("LIMIT_VIP", "100");
    const limitSvip = getSetting("LIMIT_SVIP", "300");

    const capacityUser = getSetting("CAPACITY_USER", "50");
    const capacityVip = getSetting("CAPACITY_VIP", "500");
    const capacitySvip = getSetting("CAPACITY_SVIP", "0");

    res.json({
      wechatQr,
      wechatId,
      serviceEmail,
      notes,
      vipCardTag,
      vipCardTitle,
      vipCardDesc,
      priceVipMonth,
      priceVipYear,
      priceSvipMonth,
      priceSvipYear,
      limitVip,
      limitSvip,
      capacityUser,
      capacityVip,
      capacitySvip
    });
  } catch (error: any) {
    console.error("Get Vip Contact Error:", error);
    res.status(500).json({ error: error.message || "获取私域配置失败" });
  }
};


// 5. 修改个人昵称和头像
export const updateProfile = (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const username = req.userId;
    const { nickname, avatar } = req.body;
    if (!username) {
      return res.status(401).json({ error: "未登录，请先登录" });
    }

    db.prepare("UPDATE users SET nickname = ?, avatar = ? WHERE username = ?").run(
      nickname !== undefined ? nickname.trim() : null,
      avatar || null,
      username
    );

    res.json({ success: true, message: "个人资料修改成功" });
  } catch (error: any) {
    console.error("Update Profile Error:", error);
    res.status(500).json({ error: error.message || "修改个人资料失败" });
  }
};

// 6. 修改登录密码
export const changePassword = (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const username = req.userId;
    const { oldPassword, newPassword } = req.body;
    if (!username) {
      return res.status(401).json({ error: "未登录，请先登录" });
    }
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: "旧密码或新密码不能为空" });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: "新密码长度不能少于 6 位" });
    }

    const user = db.prepare("SELECT password FROM users WHERE username = ?").get(username) as { password: string } | undefined;
    if (!user) {
      return res.status(404).json({ error: "用户不存在" });
    }

    const hashPasswordTemp = (pwd: string) => crypto.createHash("sha256").update(pwd).digest("hex");
    if (user.password !== hashPasswordTemp(oldPassword)) {
      return res.status(400).json({ error: "旧密码输入错误" });
    }

    db.prepare("UPDATE users SET password = ? WHERE username = ?").run(hashPasswordTemp(newPassword), username);

    res.json({ success: true, message: "密码修改成功，请牢记您的新密码" });
  } catch (error: any) {
    console.error("Change Password Error:", error);
    res.status(500).json({ error: error.message || "修改密码失败" });
  }
};

