import express from "express";
import { db } from "../config/db";
import { generateRedemptionCodes } from "../services/redeemService";

// 1. 生成兑换码
export const generateCode = (req: express.Request, res: express.Response) => {
  try {
    const { count, role, days } = req.body;
    
    const countNum = parseInt(count || "1");
    const daysNum = parseInt(days || "30");
    const targetRole = role || "vip";

    if (countNum <= 0 || countNum > 500) {
      return res.status(400).json({ error: "单次生成数量必须在 1-500 之间" });
    }
    if (daysNum <= 0) {
      return res.status(400).json({ error: "有效天数必须大于 0" });
    }
    if (!["vip", "svip"].includes(targetRole)) {
      return res.status(400).json({ error: "不支持的会员角色类型" });
    }

    const codes = generateRedemptionCodes(countNum, targetRole, daysNum);
    res.json({ success: true, codes });
  } catch (error: any) {
    console.error("Generate Redemption Codes Error:", error);
    res.status(500).json({ error: error.message || "生成兑换码失败" });
  }
};

// 2. 获取所有兑换码列表
export const getRedemptionCodes = (req: express.Request, res: express.Response) => {
  try {
    const codes = db.prepare("SELECT * FROM redemption_codes ORDER BY createdAt DESC").all();
    res.json(codes);
  } catch (error: any) {
    console.error("Get Redemption Codes Error:", error);
    res.status(500).json({ error: error.message || "获取兑换码列表失败" });
  }
};
