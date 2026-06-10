import express from "express";
import { db } from "../config/db";
import { generateRedemptionCodes } from "../services/redeemService";
import { getSettings } from "../services/settingService";

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

// 3. 获取所有系统设置
export const getSystemSettings = (req: express.Request, res: express.Response) => {
  try {
    const settings = getSettings();
    res.json({ success: true, settings });
  } catch (error: any) {
    console.error("Get System Settings Error:", error);
    res.status(500).json({ error: error.message || "获取系统设置失败" });
  }
};

// 4. 保存系统设置
export const saveSystemSettings = (req: express.Request, res: express.Response) => {
  try {
    const { settings } = req.body;
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ error: "无效的设置数据" });
    }
    
    // 使用事务保障原子性
    const tx = db.transaction(() => {
      for (const [key, value] of Object.entries(settings)) {
        db.prepare("INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)").run(key, String(value));
      }
    });
    tx();
    
    res.json({ success: true, message: "系统设置已更新" });
  } catch (error: any) {
    console.error("Save System Settings Error:", error);
    res.status(500).json({ error: error.message || "保存系统设置失败" });
  }
};

// 5. 获取所有公告列表
export const getAnnouncements = (req: express.Request, res: express.Response) => {
  try {
    const list = db.prepare("SELECT * FROM announcements ORDER BY sortOrder ASC, createdAt DESC").all();
    res.json(list);
  } catch (error: any) {
    console.error("Get Announcements Error:", error);
    res.status(500).json({ error: error.message || "获取公告列表失败" });
  }
};

// 6. 新增或更新公告
export const saveAnnouncement = (req: express.Request, res: express.Response) => {
  try {
    const { id, title, imageUrl, linkUrl, sortOrder, status } = req.body;
    if (!title || !imageUrl) {
      return res.status(400).json({ error: "标题和图片地址不能为空" });
    }

    const sortOrderNum = parseInt(sortOrder || "0");
    const statusVal = status || "active";

    if (id) {
      // 更新
      db.prepare(`
        UPDATE announcements 
        SET title = ?, imageUrl = ?, linkUrl = ?, sortOrder = ?, status = ? 
        WHERE id = ?
      `).run(title, imageUrl, linkUrl || null, sortOrderNum, statusVal, id);
      
      const updated = db.prepare("SELECT * FROM announcements WHERE id = ?").get(id);
      res.json({ success: true, announcement: updated });
    } else {
      // 新增
      const result = db.prepare(`
        INSERT INTO announcements (title, imageUrl, linkUrl, sortOrder, status, createdAt)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(title, imageUrl, linkUrl || null, sortOrderNum, statusVal, Date.now());
      
      const inserted = db.prepare("SELECT * FROM announcements WHERE id = ?").get(result.lastInsertRowid);
      res.json({ success: true, announcement: inserted });
    }
  } catch (error: any) {
    console.error("Save Announcement Error:", error);
    res.status(500).json({ error: error.message || "保存公告失败" });
  }
};

// 7. 删除公告
export const deleteAnnouncement = (req: express.Request, res: express.Response) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: "公告ID不能为空" });
    }
    
    db.prepare("DELETE FROM announcements WHERE id = ?").run(id);
    res.json({ success: true });
  } catch (error: any) {
    console.error("Delete Announcement Error:", error);
    res.status(500).json({ error: error.message || "删除公告失败" });
  }
};

// 8. 保存私域客服与收款二维码配置
export const saveVipContact = (req: express.Request, res: express.Response) => {
  try {
    const { wechatQr, wechatId, serviceEmail, notes } = req.body;
    
    const tx = db.transaction(() => {
      db.prepare("INSERT OR REPLACE INTO system_settings (key, value) VALUES ('VIP_WECHAT_QR', ?)").run(wechatQr || "");
      db.prepare("INSERT OR REPLACE INTO system_settings (key, value) VALUES ('VIP_WECHAT_ID', ?)").run(wechatId || "");
      db.prepare("INSERT OR REPLACE INTO system_settings (key, value) VALUES ('VIP_SERVICE_EMAIL', ?)").run(serviceEmail || "");
      db.prepare("INSERT OR REPLACE INTO system_settings (key, value) VALUES ('VIP_SERVICE_NOTES', ?)").run(notes || "");
    });
    tx();
    
    res.json({ success: true, message: "私域配置保存成功" });
  } catch (error: any) {
    console.error("Save Vip Contact Error:", error);
    res.status(500).json({ error: error.message || "保存私域配置失败" });
  }
};

