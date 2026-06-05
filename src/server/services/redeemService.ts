import crypto from "crypto";
import { db } from "../config/db";

// 日期相加辅助函数 (YYYY-MM-DD)
export function addDays(startDateStr: string, days: number): string {
  const date = new Date(startDateStr);
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

// 1. 生成兑换码
export function generateRedemptionCodes(count: number, role: string, days: number): string[] {
  const codes: string[] = [];
  const stmt = db.prepare(`
    INSERT INTO redemption_codes (code, role, status, days, createdAt)
    VALUES (?, ?, 'unused', ?, ?)
  `);

  const insertTx = db.transaction(() => {
    for (let i = 0; i < count; i++) {
      // 生成 16 位大写随机兑换码，格式类似 ABCD-EFGH-IJKL-MNOP
      const rawCode = crypto.randomBytes(8).toString("hex").toUpperCase();
      const code = `${rawCode.substring(0, 4)}-${rawCode.substring(4, 8)}-${rawCode.substring(8, 12)}-${rawCode.substring(12, 16)}`;
      
      stmt.run(code, role, days, Date.now());
      codes.push(code);
    }
  });

  insertTx();
  return codes;
}

// 2. 使用兑换码
export function useRedemptionCode(codeStr: string, username: string): { success: boolean; error?: string; role?: string; vipExpireAt?: string } {
  const cleanCode = codeStr.trim().toUpperCase();
  
  // 查找兑换码
  const codeRecord = db.prepare("SELECT * FROM redemption_codes WHERE code = ?").get(cleanCode) as {
    code: string;
    role: string;
    status: string;
    days: number;
    usedBy: string | null;
  } | undefined;

  if (!codeRecord) {
    return { success: false, error: "兑换码无效，请检查后重试" };
  }

  if (codeRecord.status !== 'unused') {
    return { success: false, error: "该兑换码已被使用" };
  }

  // 查找用户当前会员信息
  const user = db.prepare("SELECT role, vipExpireAt FROM users WHERE username = ?").get(username) as {
    role: string;
    vipExpireAt: string | null;
  } | undefined;

  if (!user) {
    return { success: false, error: "用户不存在" };
  }

  const today = new Date().toISOString().split('T')[0];
  let baseDate = today;

  // 如果用户当前已经是该级别（或更高）的会员，并且会员还没过期，则在此基础上累加天数
  if (user.vipExpireAt && user.vipExpireAt >= today) {
    baseDate = user.vipExpireAt;
  }

  const newVipExpireAt = addDays(baseDate, codeRecord.days);
  const targetRole = codeRecord.role;

  // 更新兑换码状态和用户信息（事务保障）
  const redeemTx = db.transaction(() => {
    db.prepare(`
      UPDATE redemption_codes 
      SET status = 'used', usedBy = ?, usedAt = ? 
      WHERE code = ?
    `).run(username, Date.now(), cleanCode);

    db.prepare(`
      UPDATE users 
      SET role = ?, vipExpireAt = ? 
      WHERE username = ?
    `).run(targetRole, newVipExpireAt, username);
  });

  redeemTx();

  return {
    success: true,
    role: targetRole,
    vipExpireAt: newVipExpireAt
  };
}
