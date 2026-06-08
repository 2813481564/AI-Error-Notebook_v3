import express from "express";
import crypto from "crypto";
import { db } from "../config/db";
import { transporter } from "../config/mail";

// 密码哈希辅助函数
export function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password).digest("hex");
}

// 1. 发送邮箱验证码
export const sendCode = async (req: express.Request, res: express.Response) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: "邮箱不能为空" });
    }

    // 校验是否为合法 QQ 邮箱
    const qqEmailRegex = /^[a-zA-Z0-9_-]+@qq\.com$/i;
    if (!qqEmailRegex.test(email)) {
      return res.status(400).json({ error: "仅支持使用 QQ 邮箱注册" });
    }

    // 检查邮箱是否已被注册
    const userExist = db.prepare("SELECT username FROM users WHERE username = ?").get(email);
    if (userExist) {
      return res.status(400).json({ error: "该邮箱已被注册，请直接登录" });
    }

    // 生成 6 位随机验证码
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const createdAt = Date.now();

    // 插入或更新验证码记录
    db.prepare(`
      INSERT OR REPLACE INTO verification_codes (email, code, createdAt)
      VALUES (?, ?, ?)
    `).run(email, code, createdAt);

    // 检查环境变量是否配置了邮箱服务
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS || process.env.SMTP_PASS === "your-smtp-auth-code") {
      console.log(`[开发测试模式] 验证码发送至: ${email}，验证码为: ${code}`);
      return res.json({
        success: true,
        message: "验证码已生成（开发测试模式，验证码已打印在控制台）",
        devCode: code
      });
    }

    // 邮件内容
    const mailOptions = {
      from: `"智能错题识别系统" <${process.env.SMTP_USER}>`,
      to: email,
      subject: "【智能错题识别】注册验证码",
      html: `
        <div style="padding: 24px; font-family: sans-serif; color: #333; max-width: 600px; margin: auto; border: 1px solid #eee; border-radius: 12px;">
          <h2 style="color: #2563eb; font-size: 20px; font-weight: bold; margin-bottom: 16px;">智能错题识别系统</h2>
          <p style="font-size: 14px; line-height: 1.6; color: #555;">您好，您正在使用 QQ 邮箱注册智能错题识别账号。</p>
          <p style="font-size: 14px; line-height: 1.6; color: #555;">您的注册验证码为：</p>
          <div style="background-color: #f3f4f6; padding: 16px; text-align: center; border-radius: 8px; margin: 20px 0;">
            <span style="font-size: 24px; font-weight: 800; color: #1e293b; letter-spacing: 4px;">${code}</span>
          </div>
          <p style="font-size: 12px; color: #9ca3af; margin-top: 24px; border-top: 1px solid #f3f4f6; padding-top: 16px;">
            提示：此验证码有效时间为 10 分钟。如果不是您本人的操作，请忽略此邮件。
          </p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    res.json({ success: true, message: "验证码已发送至您的 QQ 邮箱" });
  } catch (error: any) {
    console.error("Send Code Error:", error);
    res.status(500).json({ error: error.message || "验证码发送失败，请稍后重试" });
  }
};

// 2. 用户注册
export const register = (req: express.Request, res: express.Response) => {
  try {
    const { username, password, code } = req.body;
    if (!username || !password || !code || username.trim() === "" || password.trim() === "" || code.trim() === "") {
      return res.status(400).json({ error: "邮箱、密码和验证码均不能为空" });
    }
    const cleanUsername = username.trim();
    if (cleanUsername.length < 2) {
      return res.status(400).json({ error: "用户名长度不能少于 2 位" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "密码长度不能少于 6 位" });
    }

    // 限制只能通过 QQ 邮箱注册
    const qqEmailRegex = /^[a-zA-Z0-9_-]+@qq\.com$/i;
    if (!qqEmailRegex.test(cleanUsername)) {
      return res.status(400).json({ error: "注册账号必须为有效的 QQ 邮箱（如: 123456@qq.com）" });
    }

    // 校验验证码
    const codeRecord = db.prepare("SELECT code, createdAt FROM verification_codes WHERE email = ?").get(cleanUsername) as { code: string, createdAt: number } | undefined;
    if (!codeRecord) {
      return res.status(400).json({ error: "尚未获取验证码或验证码已失效" });
    }

    if (codeRecord.code !== code.trim()) {
      return res.status(400).json({ error: "验证码错误，请重新输入" });
    }

    if (Date.now() - codeRecord.createdAt > 10 * 60 * 1000) {
      return res.status(400).json({ error: "验证码已过期，请重新获取" });
    }

    // 验证成功，删除验证码记录
    db.prepare("DELETE FROM verification_codes WHERE email = ?").run(cleanUsername);

    const checkStmt = db.prepare("SELECT username FROM users WHERE username = ?");
    if (checkStmt.get(cleanUsername)) {
      return res.status(400).json({ error: "该用户名已被注册" });
    }

    const hashedPassword = hashPassword(password);
    const insertUser = db.prepare("INSERT INTO users (username, password, role) VALUES (?, ?, 'user')");
    insertUser.run(cleanUsername, hashedPassword);

    const token = crypto.randomUUID();
    const insertSession = db.prepare("INSERT INTO sessions (token, username, createdAt) VALUES (?, ?, ?)");
    insertSession.run(token, cleanUsername, Date.now());

    res.json({ token, username: cleanUsername, role: 'user' });
  } catch (error: any) {
    console.error("Register Error:", error);
    res.status(500).json({ error: error.message || "注册失败" });
  }
};

// 3. 用户登录
export const login = (req: express.Request, res: express.Response) => {
  try {
    const { username, password, loginRole, loginType, idCardLast6, phoneLast4 } = req.body;
    if (!username || username.trim() === "") {
      return res.status(400).json({ error: "姓名或账号不能为空" });
    }
    const cleanUsername = username.trim();

    if (loginRole === 'student') {
      // 学生登录：免密，支持姓名+身份证后6位，或姓名+手机后4位
      if (loginType === 'idCard') {
        if (!idCardLast6 || idCardLast6.trim() === "") {
          return res.status(400).json({ error: "身份证后6位不能为空" });
        }
        const user = db.prepare("SELECT username, role FROM users WHERE username = ? AND idCardLast6 = ? AND role = 'user'").get(cleanUsername, idCardLast6.trim()) as { username: string, role: string } | undefined;
        if (!user) {
          return res.status(400).json({ error: "姓名或身份证后6位错误" });
        }

        const token = crypto.randomUUID();
        db.prepare("INSERT INTO sessions (token, username, createdAt) VALUES (?, ?, ?)").run(token, user.username, Date.now());
        return res.json({ token, username: user.username, role: user.role });
      } else if (loginType === 'phone') {
        if (!phoneLast4 || phoneLast4.trim() === "") {
          return res.status(400).json({ error: "手机号后4位不能为空" });
        }
        const user = db.prepare("SELECT username, role FROM users WHERE username = ? AND phoneLast4 = ? AND role = 'user'").get(cleanUsername, phoneLast4.trim()) as { username: string, role: string } | undefined;
        if (!user) {
          return res.status(400).json({ error: "姓名或手机号后4位错误" });
        }

        const token = crypto.randomUUID();
        db.prepare("INSERT INTO sessions (token, username, createdAt) VALUES (?, ?, ?)").run(token, user.username, Date.now());
        return res.json({ token, username: user.username, role: user.role });
      } else {
        return res.status(400).json({ error: "请选择学生登录验证方式" });
      }
    } else {
      // 老师/管理员登录：邮箱/账号+密码
      if (!password) {
        return res.status(400).json({ error: "密码不能为空" });
      }
      const hashedPassword = hashPassword(password);
      const user = db.prepare("SELECT username, password, role FROM users WHERE username = ?").get(cleanUsername) as { username: string; password: string; role: string } | undefined;
      if (!user || user.password !== hashedPassword) {
        return res.status(400).json({ error: "用户名或密码错误" });
      }
      if (user.role === 'user' && user.password === hashPassword("student_no_password")) {
        return res.status(400).json({ error: "此账号为免密登录普通角色，请选择免密登录方式" });
      }

      const token = crypto.randomUUID();
      db.prepare("INSERT INTO sessions (token, username, createdAt) VALUES (?, ?, ?)").run(token, user.username, Date.now());
      return res.json({ token, username: user.username, role: user.role });
    }
  } catch (error: any) {
    console.error("Login Error:", error);
    res.status(500).json({ error: error.message || "登录失败" });
  }
};

// 4. 用户注销
export const logout = (req: express.Request, res: express.Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
    }
    res.json({ success: true });
  } catch (error: any) {
    console.error("Logout Error:", error);
    res.status(500).json({ error: error.message || "注销失败" });
  }
};
