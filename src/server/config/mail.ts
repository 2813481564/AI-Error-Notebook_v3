import nodemailer from "nodemailer";
import { getSetting } from "../services/settingService";

// 包装 SMTP 发送服务，每次发送时动态读取数据库设置项
export const transporter = {
  sendMail: async (mailOptions: any) => {
    const host = getSetting("SMTP_HOST", process.env.SMTP_HOST || "smtp.qq.com");
    const port = parseInt(getSetting("SMTP_PORT", process.env.SMTP_PORT || "465"));
    const user = getSetting("SMTP_USER", process.env.SMTP_USER || "");
    const pass = getSetting("SMTP_PASS", process.env.SMTP_PASS || "");

    const client = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: {
        user,
        pass
      }
    });

    return client.sendMail(mailOptions);
  }
};

