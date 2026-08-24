import express from "express";
import crypto from "crypto";
import { db } from "../config/db";
import { AuthenticatedRequest } from "../middleware/auth";
import { enqueueTaskForUser } from "./taskController";
import { generateContentWithFallback, extractJsonString, sanitizeJsonString } from "../services/aiService";

// ================= 学情报表（第二阶段） =================

// 周报举一反三习题卷：基于某学生本周错题，调用 AI 生成一份举一反三习题卷
async function generateWorksheetForStudent(studentReport: any): Promise<any[]> {
  const items = studentReport.items || [];
  if (items.length === 0) return [];

  // 汇总题干与考点（取前 5 道错题，避免提示词过长）
  const source = items.slice(0, 5).map((it: any) => ({
    originalText: it.originalText || '',
    subject: it.subject || '数学',
    knowledgePoints: Array.isArray(it.knowledgePoints) ? it.knowledgePoints : []
  }));

  try {
    const prompt = `
你是资深命题老师。请根据以下学生本周的错题（题干与考点），举一反三生成一份习题卷，帮助该学生巩固欠缺知识点。

【学生错题素材】
${JSON.stringify(source, null, 2)}

【要求】
1. 生成 ${Math.min(5, Math.max(3, source.length))} 道同类型、不同数字/情境的变式练习题。
2. 题目难度循序渐进，覆盖上述错题涉及的考点。
3. 每道题输出：题干、考点、标准答案、详细解析。

【输出格式】严格返回 JSON 数组，不要 Markdown 代码块标记：
[
  {
    "no": 1,
    "originalText": "变式题题干（含公式用 $...$ 包裹）",
    "subject": "学科",
    "knowledgePoints": ["考点1", "考点2"],
    "standardAnswer": "标准答案",
    "solution": "分步解析"
  }
]
数学公式用 $ 或 $$ 包裹（LaTeX），JSON 中反斜杠双写转义。
`;
    const response = await generateContentWithFallback({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { temperature: 0.4 }
    });
    const text = response.text || '';
    if (text) {
      const extracted = extractJsonString(text);
      const parsed = JSON.parse(sanitizeJsonString(extracted));
      if (Array.isArray(parsed)) {
        return parsed.map((q: any, i: number) => ({
          no: i + 1,
          originalText: q.originalText || '',
          subject: q.subject || '数学',
          knowledgePoints: Array.isArray(q.knowledgePoints) ? q.knowledgePoints : [],
          standardAnswer: q.standardAnswer || '',
          solution: q.solution || ''
        }));
      }
    }
  } catch (e) {
    console.warn("周报习题卷生成失败:", e);
  }
  return [];
}

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
export const generateReport = async (req: AuthenticatedRequest, res: express.Response) => {
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

    // 为每个学生生成报表（简单学情报表，不自动生成举一反三；举一反三由报表记录进入专属页面手动勾选生成）
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

// 创建报表举一反三任务（教务专属）: POST /api/report/:token/variations
// 每道勾选题生成 1 道变式题，挂后台线程池串行处理（同一用户同时仅 1 个）
export const createReportVariations = async (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const { token } = req.params;
    const { questions, variantMode } = req.body;
    const report = db.prepare("SELECT * FROM study_reports WHERE token = ?").get(token) as any;
    if (!report) {
      return res.status(404).json({ error: "报表不存在" });
    }
    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ error: "请至少勾选一道题" });
    }
    // 难度模式：同考点换壳 / 条件升级 / 逆向陷阱
    const mode = ['同考点换壳', '条件升级', '逆向陷阱'].includes(variantMode) ? variantMode : '同考点换壳';

    // 学生信息（取 grade）
    const created: { taskId: string; questionNo: number }[] = [];
    for (const q of questions) {
      const studentUsername = q.studentUsername;
      if (!studentUsername) continue;
      // 找到学生的 grade（报表 dataJson 里有）
      let grade: string | null = q.grade || null;
      const taskId = "task_" + Math.random().toString(36).substring(2, 9);
      const now = Date.now();
      const payload = {
        reportToken: token,
        studentUsername,
        questionNo: q.no || 0,
        originalText: q.originalText || '',
        subject: q.subject || '数学',
        knowledgePoints: q.knowledgePoints || [],
        grade,
        variantMode: mode
      };
      db.prepare(`
        INSERT INTO background_tasks (id, userId, taskName, status, progress, autoRun, uploadMode, notebookId, payload, createdAt, updatedAt, isNotified)
        VALUES (?, ?, ?, 'queued', 0, 1, 'report_variation', NULL, ?, ?, ?, 0)
      `).run(taskId, req.userId || '', `报表举一反三-题${q.no || ''}`, JSON.stringify(payload), now, now);
      // 加入后台线程池队列（按用户串行）
      enqueueTaskForUser(req.userId || '', taskId);
      created.push({ taskId, questionNo: q.no || 0 });
    }

    res.json({ success: true, message: `已创建 ${created.length} 个举一反三任务`, tasks: created });
  } catch (error: any) {
    console.error("Create Report Variations Error:", error);
    res.status(500).json({ error: error.message || "创建举一反三任务失败" });
  }
};

// 查询报表错题及举一反三任务（免登录）: GET /api/report/:token/variations
export const getReportVariations = (req: express.Request, res: express.Response) => {
  try {
    const { token } = req.params;
    const report = db.prepare("SELECT * FROM study_reports WHERE token = ?").get(token) as any;
    if (!report) {
      return res.status(404).json({ error: "报表不存在" });
    }
    if (Date.now() > report.expiresAt) {
      return res.status(401).json({ error: "报表链接已过期" });
    }
    const data = JSON.parse(report.dataJson || '{}');

    // 各题的举一反三任务（report_variation，reportToken 匹配）
    const tasks = db.prepare(`
      SELECT id, userId, taskName, status, progress, errorMsg, payload, createdAt
      FROM background_tasks
      WHERE uploadMode = 'report_variation' AND payload LIKE ?
      ORDER BY createdAt ASC
    `).all(`%"reportToken":"${token}"%`) as any[];

    const taskMap: Record<string, any[]> = {};
    tasks.forEach(t => {
      let p: any = {};
      try { p = JSON.parse(t.payload || '{}'); } catch (e) { p = {}; }
      const key = `${p.studentUsername || ''}_${p.questionNo || 0}`;
      if (!taskMap[key]) taskMap[key] = [];
      taskMap[key].push({
        id: t.id,
        status: t.status,
        progress: t.progress,
        errorMsg: t.errorMsg,
        variation: p.variation || null
      });
    });

    // 报表错题 + 关联任务
    const reportsWithVariations = (data.reports || []).map((studentReport: any) => ({
      ...studentReport,
      items: (studentReport.items || []).map((item: any) => {
        const key = `${studentReport.username}_${item.no}`;
        return {
          ...item,
          variationTasks: taskMap[key] || []
        };
      })
    }));

    res.json({
      token,
      reportType: report.reportType,
      range: data.range,
      generatedAt: data.generatedAt,
      reports: reportsWithVariations
    });
  } catch (error: any) {
    console.error("Get Report Variations Error:", error);
    res.status(500).json({ error: error.message || "获取举一反三数据失败" });
  }
};

// 教务查询本人报表生成记录: GET /api/jiaowu/reports
export const getReportHistory = (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const rows = db.prepare(`
      SELECT token, reportType, filters, createdAt, expiresAt
      FROM study_reports
      WHERE ownerUsername = ?
      ORDER BY createdAt DESC
    `).all(req.userId || '') as any[];

    const history = rows.map(row => {
      let filters: any = {};
      try { filters = JSON.parse(row.filters || '{}'); } catch (e) { filters = {}; }
      const data: any = (() => { try { return JSON.parse((db.prepare("SELECT dataJson FROM study_reports WHERE token = ?").get(row.token) as any).dataJson || '{}'); } catch (e) { return {}; } })();
      return {
        token: row.token,
        reportType: row.reportType,
        filters,
        link: `/report/${row.token}`,
        createdAt: row.createdAt,
        expiresAt: row.expiresAt,
        expired: Date.now() > row.expiresAt,
        studentCount: data.reports ? data.reports.length : 0,
        totalQuestions: data.reports ? data.reports.reduce((s: number, r: any) => s + (r.total || 0), 0) : 0
      };
    });

    res.json(history);
  } catch (error: any) {
    console.error("Get Report History Error:", error);
    res.status(500).json({ error: error.message || "获取报表记录失败" });
  }
};

// 删除单条报表记录: DELETE /api/jiaowu/reports/:token
export const deleteReport = (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const { token } = req.params;
    const row = db.prepare("SELECT * FROM study_reports WHERE token = ?").get(token) as any;
    if (!row) {
      return res.status(404).json({ error: "报表记录不存在" });
    }
    // 仅本人可删
    if (row.ownerUsername !== req.userId) {
      return res.status(403).json({ error: "无权删除他人报表" });
    }
    db.prepare("DELETE FROM study_reports WHERE token = ?").run(token);
    res.json({ success: true, message: "报表记录已删除" });
  } catch (error: any) {
    console.error("Delete Report Error:", error);
    res.status(500).json({ error: error.message || "删除报表失败" });
  }
};

// 批量删除报表记录: DELETE /api/jiaowu/reports?tokens=a,b,c
export const batchDeleteReports = (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const tokensParam = req.query.tokens as string;
    if (!tokensParam) {
      return res.status(400).json({ error: "请指定要删除的报表 token" });
    }
    const tokens = tokensParam.split(',').map(t => t.trim()).filter(Boolean);
    if (tokens.length === 0) {
      return res.status(400).json({ error: "请指定要删除的报表 token" });
    }
    const placeholders = tokens.map(() => '?').join(',');
    // 先校验所有权
    const rows = db.prepare(`SELECT token, ownerUsername FROM study_reports WHERE token IN (${placeholders})`).all(...tokens) as any[];
    const owned = rows.filter(r => r.ownerUsername === req.userId).map(r => r.token);
    if (owned.length > 0) {
      const ownedPlaceholders = owned.map(() => '?').join(',');
      db.prepare(`DELETE FROM study_reports WHERE token IN (${ownedPlaceholders})`).run(...owned);
    }
    res.json({ success: true, message: `已删除 ${owned.length} 条报表记录` });
  } catch (error: any) {
    console.error("Batch Delete Reports Error:", error);
    res.status(500).json({ error: error.message || "批量删除失败" });
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
