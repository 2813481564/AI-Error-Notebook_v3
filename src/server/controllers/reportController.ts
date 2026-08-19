import express from "express";
import crypto from "crypto";
import { db } from "../config/db";
import { AuthenticatedRequest } from "../middleware/auth";

// ================= 学情报表（第二阶段） =================

// 读取报表周期配置
function readReportConfig(): { dailyMode: string; weeklyMode: string; monthlyMode: string; expiryDays: number } {
  const stmt = db.prepare("SELECT key, value FROM system_settings WHERE key IN ('REPORT_DAILY_MODE','REPORT_WEEKLY_MODE','REPORT_MONTHLY_MODE','REPORT_LINK_EXPIRY_DAYS')");
  const rows = stmt.all() as { key: string; value: string }[];
  const map: Record<string, string> = {};
  rows.forEach(r => { map[r.key] = r.value; });
  return {
    dailyMode: map['REPORT_DAILY_MODE'] || 'yesterday',
    weeklyMode: map['REPORT_WEEKLY_MODE'] || 'calendar',
    monthlyMode: map['REPORT_MONTHLY_MODE'] || 'calendar',
    expiryDays: parseInt(map['REPORT_LINK_EXPIRY_DAYS'] || '7', 10)
  };
}

// 计算统计时间范围
function computeRange(reportType: string, config: { dailyMode: string; weeklyMode: string; monthlyMode: string }): { start: string; end: string } {
  const today = new Date();
  const toDateStr = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const fmt = (d: Date) => `${toDateStr(d)} 23:59:59`;

  if (reportType === 'daily') {
    // 昨日
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    return { start: `${toDateStr(yesterday)} 00:00:00`, end: fmt(yesterday) };
  }
  if (reportType === 'weekly') {
    if (config.weeklyMode === 'rolling') {
      // 滚动 7 天
      const start = new Date(today);
      start.setDate(today.getDate() - 6);
      return { start: `${toDateStr(start)} 00:00:00`, end: fmt(today) };
    }
    // 自然周（周一 ~ 周日）
    const day = today.getDay() || 7; // 周日=7
    const monday = new Date(today);
    monday.setDate(today.getDate() - (day - 1));
    return { start: `${toDateStr(monday)} 00:00:00`, end: fmt(today) };
  }
  // monthly
  if (config.monthlyMode === 'rolling') {
    const start = new Date(today);
    start.setDate(today.getDate() - 29);
    return { start: `${toDateStr(start)} 00:00:00`, end: fmt(today) };
  }
  // 自然月（1 号 ~ 今天）
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  return { start: `${toDateStr(first)} 00:00:00`, end: fmt(today) };
}

// 根据筛选条件获取学生列表
function getTargetStudents(filters: { grade?: string; teacherUsername?: string; students?: string[] }): string[] {
  let sql = "SELECT username FROM users WHERE accountType = 'student'";
  const params: any[] = [];
  if (filters.grade) { sql += " AND grade = ?"; params.push(filters.grade); }
  if (filters.teacherUsername) { sql += " AND teacherUsername = ?"; params.push(filters.teacherUsername); }
  const rows = db.prepare(sql).all(...params) as { username: string }[];
  let usernames = rows.map(r => r.username);
  // 若明确指定了学生，取交集（或直接使用指定学生）
  if (Array.isArray(filters.students) && filters.students.length > 0) {
    usernames = filters.students;
  }
  return usernames;
}

// 生成单个学生的学情数据（错题清单 + 6 字段）
function buildStudentReport(studentUsername: string, reportType: string, range: { start: string; end: string }) {
  const student = db.prepare("SELECT realName, grade FROM users WHERE username = ?").get(studentUsername) as { realName: string | null; grade: string | null } | undefined;
  // 错题：createdAt 在范围内，且 studentId = 学生 或 userId = 学生
  const startTs = new Date(range.start).getTime();
  const endTs = new Date(range.end).getTime();
  const questions = db.prepare(`
    SELECT * FROM questions
    WHERE (studentId = ? OR userId = ?)
      AND createdAt >= ? AND createdAt <= ?
      AND status = 'audited'
    ORDER BY createdAt ASC
  `).all(studentUsername, studentUsername, startTs, endTs) as any[];

  const items = questions.map((q, idx) => ({
    no: idx + 1,
    date: new Date(q.createdAt).toISOString().split('T')[0],
    originalText: q.originalText || '',
    subject: q.subject || '',
    knowledgePoints: q.knowledgePoints ? JSON.parse(q.knowledgePoints) : [],
    errorReason: q.errorReason || '',
    errorAnalysis: q.errorAnalysis || '',
    standardAnswer: q.standardAnswer || null,
    solution: q.solution || '',
    imageUrl: q.imageUrl || null
  }));

  // 汇总欠缺知识点
  const pointCount: Record<string, number> = {};
  items.forEach(it => {
    (it.knowledgePoints || []).forEach((kp: string) => {
      pointCount[kp] = (pointCount[kp] || 0) + 1;
    });
  });
  const weakPoints = Object.entries(pointCount).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));

  return {
    username: studentUsername,
    realName: student?.realName || studentUsername,
    grade: student?.grade || null,
    total: items.length,
    items,
    weakPoints
  };
}

// 教务生成报表: POST /api/jiaowu/reports
export const generateReport = (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const { reportType, grade, teacherUsername, students, dateStart, dateEnd } = req.body;
    if (!['daily', 'weekly', 'monthly'].includes(reportType)) {
      return res.status(400).json({ error: "报表类型必须为 daily/weekly/monthly" });
    }
    if ((!grade && !teacherUsername && (!students || students.length === 0))) {
      return res.status(400).json({ error: "请至少指定年级、老师或学生之一" });
    }

    const config = readReportConfig();
    let range = computeRange(reportType, config);
    // 若前端传了日期范围，则覆盖默认周期
    if (dateStart && dateEnd) {
      range = {
        start: `${dateStart} 00:00:00`,
        end: `${dateEnd} 23:59:59`
      };
    }
    const targetStudents = getTargetStudents({ grade, teacherUsername, students });

    // 为每个学生生成报表
    const reports = targetStudents.map(username => buildStudentReport(username, reportType, range));

    // 生成 token（加密）并存储
    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = Date.now() + config.expiryDays * 24 * 3600 * 1000;
    const dataJson = JSON.stringify({
      reportType,
      range,
      generatedAt: Date.now(),
      reports
    });

    db.prepare(`
      INSERT INTO study_reports (token, ownerUsername, reportType, filters, dataJson, expiresAt, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      token,
      req.userId || '',
      reportType,
      JSON.stringify({ grade, teacherUsername, students }),
      dataJson,
      expiresAt,
      Date.now()
    );

    // 生成链接（前端用 window.location.origin 拼绝对地址）
    const link = `/report/${token}`;
    res.json({
      success: true,
      token,
      link,
      expiresAt,
      range,
      reportCount: reports.length,
      totalQuestions: reports.reduce((s, r) => s + r.total, 0)
    });
  } catch (error: any) {
    console.error("Generate Report Error:", error);
    res.status(500).json({ error: error.message || "生成报表失败" });
  }
};

// 免登录查询报表: GET /api/report/:token
export const getReport = (req: express.Request, res: express.Response) => {
  try {
    const { token } = req.params;
    const row = db.prepare("SELECT * FROM study_reports WHERE token = ?").get(token) as any;
    if (!row) {
      return res.status(404).json({ error: "报表不存在或链接已失效" });
    }
    if (Date.now() > row.expiresAt) {
      return res.status(401).json({ error: "报表链接已过期，请联系教务老师重新生成" });
    }
    const data = JSON.parse(row.dataJson);
    res.json({
      token,
      reportType: row.reportType,
      filters: JSON.parse(row.filters || '{}'),
      data
    });
  } catch (error: any) {
    console.error("Get Report Error:", error);
    res.status(500).json({ error: error.message || "获取报表失败" });
  }
};

// 管理员获取/保存报表周期配置
export const getReportConfig = (req: express.Request, res: express.Response) => {
  try {
    res.json(getReportConfigInternal());
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

function getReportConfigInternal() {
  const config = readReportConfig();
  return {
    dailyMode: config.dailyMode,
    weeklyMode: config.weeklyMode,
    monthlyMode: config.monthlyMode,
    expiryDays: config.expiryDays
  };
}

export const saveReportConfig = (req: express.Request, res: express.Response) => {
  try {
    const { dailyMode, weeklyMode, monthlyMode, expiryDays } = req.body;
    const stmt = db.prepare("INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)");
    if (dailyMode) stmt.run('REPORT_DAILY_MODE', dailyMode);
    if (weeklyMode) stmt.run('REPORT_WEEKLY_MODE', weeklyMode);
    if (monthlyMode) stmt.run('REPORT_MONTHLY_MODE', monthlyMode);
    if (expiryDays) stmt.run('REPORT_LINK_EXPIRY_DAYS', String(expiryDays));
    res.json({ success: true, message: "报表周期配置已保存", config: getReportConfigInternal() });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "保存报表配置失败" });
  }
};
