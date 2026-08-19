import express from "express";
import crypto from "crypto";
import { db } from "../config/db";
import { AuthenticatedRequest } from "../middleware/auth";
import { isBase64Image, saveBase64Image } from "../services/fileService";
import { unwrapJsonString, enqueueTaskForUser } from "./taskController";

// ================= 教学老师工作台（第二阶段） =================

// 创建快速答题任务: POST /api/jiaoxue/quick-answer
// 仅输出标准答案/关键步骤，跳过诊断。返回 taskId，前端轮询占位符。
export const quickAnswer = async (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const { taskName, imageBase64, mimeType } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: "请上传题目图片" });
    }
    if (!isBase64Image(imageBase64)) {
      return res.status(400).json({ error: "图片格式无效" });
    }

    let savedImageUrl: string | null = null;
    try {
      savedImageUrl = saveBase64Image(imageBase64);
    } catch (e) {
      console.warn("快速答题图片落盘失败:", e);
    }

    const taskId = "task_" + Math.random().toString(36).substring(2, 9);
    const timeNow = Date.now();
    const payload = {
      imageBase64,
      mimeType: mimeType || 'image/jpeg',
      extractMode: 'single',
      savedImageUrl
    };

    db.prepare(`
      INSERT INTO background_tasks (
        id, userId, taskName, status, progress, autoRun, uploadMode, notebookId, payload, createdAt, updatedAt, isNotified
      ) VALUES (?, ?, ?, 'queued', 0, 1, 'quick_answer', NULL, ?, ?, ?, 0)
    `).run(taskId, req.userId, taskName || `快速答题 ${new Date().toLocaleString()}`, JSON.stringify(payload), timeNow, timeNow);

    // 加入后台线程池队列（按账号分组）
    enqueueTaskForUser(req.userId!, taskId);

    res.json({ success: true, taskId, message: "快速答题任务已提交，正在排队识别..." });
  } catch (error: any) {
    console.error("Quick Answer Error:", error);
    res.status(500).json({ error: error.message || "快速答题任务创建失败" });
  }
};

// 创建作业批改任务: POST /api/jiaoxue/correct-task
// 携带目标学生，走完整 OCR+诊断，完成后进入待审查，审查后归档到学生错题本。
export const correctTask = async (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const { taskName, imageBase64, mimeType, studentUsername } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: "请上传错题图片" });
    }
    if (!isBase64Image(imageBase64)) {
      return res.status(400).json({ error: "图片格式无效" });
    }
    if (!studentUsername) {
      return res.status(400).json({ error: "请选择目标学生" });
    }

    // 校验目标学生存在且属于当前教学老师名下
    const student = db.prepare(
      "SELECT accountType, teacherUsername FROM users WHERE username = ?"
    ).get(studentUsername) as { accountType: string; teacherUsername: string | null } | undefined;
    if (!student || student.accountType !== 'student') {
      return res.status(404).json({ error: "目标学生不存在" });
    }
    // 需求：教学老师的学生由教务绑定，教学老师只能批改自己名下的学生
    if (student.teacherUsername && student.teacherUsername !== req.userId) {
      return res.status(403).json({ error: "该学生不属于您名下，无法批改" });
    }

    // 获取学生默认错题本（name 为"姓名+的错题本"）
    const studentInfo = db.prepare("SELECT realName FROM users WHERE username = ?").get(studentUsername) as { realName: string | null };
    const notebook = db.prepare(
      "SELECT id FROM notebooks WHERE userId = ? AND type = 'normal' LIMIT 1"
    ).get(studentUsername) as { id: string } | undefined;
    const notebookId = notebook ? notebook.id : null;
    const notebookName = studentInfo.realName ? `${studentInfo.realName}的错题本` : `${studentUsername}的错题本`;

    let savedImageUrl: string | null = null;
    try {
      savedImageUrl = saveBase64Image(imageBase64);
    } catch (e) {
      console.warn("批改图片落盘失败:", e);
    }

    const taskId = "task_" + Math.random().toString(36).substring(2, 9);
    const timeNow = Date.now();
    const payload = {
      imageBase64,
      mimeType: mimeType || 'image/jpeg',
      extractMode: 'single',
      savedImageUrl,
      studentId: studentUsername,
      notebookId,
      notebookName
    };

    db.prepare(`
      INSERT INTO background_tasks (
        id, userId, taskName, status, progress, autoRun, uploadMode, notebookId, payload, createdAt, updatedAt, isNotified
      ) VALUES (?, ?, ?, 'queued', 0, 1, 'correct_task', ?, ?, ?, ?, 0)
    `).run(taskId, req.userId, taskName || `作业批改 ${new Date().toLocaleString()}`, notebookId, JSON.stringify(payload), timeNow, timeNow);

    // 加入后台线程池队列（按账号分组）
    enqueueTaskForUser(req.userId!, taskId);

    res.json({ success: true, taskId, message: "批改任务已提交，处理完成后将自动进入待审查列表" });
  } catch (error: any) {
    console.error("Correct Task Error:", error);
    res.status(500).json({ error: error.message || "批改任务创建失败" });
  }
};

// 教学老师审查批改结果并归档到学生错题本: POST /api/jiaoxue/correct-task/:taskId/review
export const reviewCorrectTask = async (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const { taskId } = req.params;
    const { approved, diagnosedQuestions, studentId: bodyStudentId } = req.body;

    const task = db.prepare("SELECT * FROM background_tasks WHERE id = ? AND userId = ?").get(taskId, req.userId) as any;
    if (!task) {
      return res.status(404).json({ error: "任务不存在" });
    }
    if (task.uploadMode !== 'correct_task') {
      return res.status(400).json({ error: "该任务不是作业批改任务" });
    }
    if (task.status !== 'pending_diagnose_review') {
      return res.status(400).json({ error: "任务当前状态不是待审查" });
    }

    const taskPayload = JSON.parse(task.payload);
    // 优先使用前端传入的学生（教学工作台下拉框选择），否则用任务创建时绑定的学生
    let studentId = bodyStudentId || taskPayload.studentId;
    if (!studentId) {
      return res.status(400).json({ error: "批改任务缺少目标学生，请先在顶部选择学生" });
    }
    // 校验目标学生属于当前教学老师名下
    const targetStudent = db.prepare(
      "SELECT accountType, teacherUsername FROM users WHERE username = ?"
    ).get(studentId) as { accountType: string; teacherUsername: string | null } | undefined;
    if (!targetStudent || targetStudent.accountType !== 'student') {
      return res.status(404).json({ error: "目标学生不存在" });
    }
    if (targetStudent.teacherUsername && targetStudent.teacherUsername !== req.userId) {
      return res.status(403).json({ error: "该学生不属于您名下" });
    }
    // 若用了下拉框学生但任务没绑，补充其默认错题本
    if (!taskPayload.notebookId && studentId !== taskPayload.studentId) {
      const stu = db.prepare("SELECT realName FROM users WHERE username = ?").get(studentId) as { realName: string | null };
      const nb = db.prepare("SELECT id FROM notebooks WHERE userId = ? AND type = 'normal' LIMIT 1").get(studentId) as { id: string } | undefined;
      taskPayload.notebookId = nb ? nb.id : null;
      taskPayload.notebookName = stu.realName ? `${stu.realName}的错题本` : `${studentId}的错题本`;
    }

    // 若未传审核后的题目，使用任务中已诊断的结果
    const finalDiagnosed = Array.isArray(diagnosedQuestions) && diagnosedQuestions.length > 0
      ? diagnosedQuestions
      : taskPayload.diagnosedQuestions || [];

    if (approved === false) {
      db.prepare("UPDATE background_tasks SET status = 'failed', errorMsg = ?, updatedAt = ?, isNotified = 0 WHERE id = ?")
        .run("老师审查未通过，已驳回", Date.now(), taskId);
      return res.json({ success: true, message: "已驳回该批改结果" });
    }

    if (finalDiagnosed.length === 0) {
      return res.status(400).json({ error: "没有可归档的批改结果" });
    }

    // 归档到学生错题本：studentId = 学生账号，notebookId = 学生默认错题本，userId = 教学老师
    const studentNotebookId = taskPayload.notebookId || null;
    const archived = saveCorrectedToStudent(task.userId, studentId, finalDiagnosed, taskPayload.imageBase64, studentNotebookId);

    db.prepare("UPDATE background_tasks SET status = 'completed', progress = 100, updatedAt = ?, isNotified = 0 WHERE id = ?")
      .run(Date.now(), taskId);

    res.json({ success: true, message: `已审查通过并归档到学生错题本（${archived} 道）` });
  } catch (error: any) {
    console.error("Review Correct Task Error:", error);
    res.status(500).json({ error: error.message || "审查归档失败" });
  }
};

// 将批改后的错题写入学生错题本
function saveCorrectedToStudent(
  teacherUserId: string,
  studentId: string,
  diagnosedQuestions: any[],
  imageBase64: string,
  notebookId: string | null
): number {
  const activeQuestions = diagnosedQuestions.filter((q: any) => q.errorReason !== '不纳入归档');
  if (activeQuestions.length === 0) return 0;

  let finalImageUrl: string | null = imageBase64 || null;
  if (finalImageUrl && isBase64Image(finalImageUrl)) {
    try {
      finalImageUrl = saveBase64Image(finalImageUrl);
    } catch (e) {
      console.warn("批改归档图片落盘失败:", e);
    }
  }

  const stmt = db.prepare(`
    INSERT INTO questions (
      id, userId, studentId, status, imageUrl, originalText, subject, knowledgePoints, errorReason, solution, createdAt, studentAnswer, errorDiagnosis, errorAnalysis, notebookId, score, masteryStatus, standardAnswer, examDirection
    ) VALUES (?, ?, ?, 'audited', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (let i = 0; i < activeQuestions.length; i++) {
    const q = activeQuestions[i];
    const id = crypto.randomUUID ? crypto.randomUUID() : (Date.now() + Math.random()).toString();
    stmt.run(
      id,
      teacherUserId,                          // userId = 教学老师
      studentId,                              // studentId = 学生账号
      finalImageUrl,
      unwrapJsonString(q.originalText, 'originalText'),
      q.subject || '数学',
      JSON.stringify(q.knowledgePoints || []),
      q.errorReason || '概念不清',
      q.solution || '',
      Date.now() + i,
      unwrapJsonString(q.studentAnswer || '', 'studentAnswer'),
      JSON.stringify(q.errorDiagnosis || []),
      q.errorAnalysis || '',
      notebookId || null,
      q.score !== undefined ? q.score : null,
      q.masteryStatus || 'not_mastered',
      q.standardAnswer || null,
      q.examDirection || null
    );
  }
  return activeQuestions.length;
}

// 教学老师查询自己名下的学生: GET /api/jiaoxue/students
export const getMyStudents = (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const rows = db.prepare(`
      SELECT username, realName, grade, subjects, accompanyEnd
      FROM users
      WHERE accountType = 'student' AND teacherUsername = ?
      ORDER BY username ASC
    `).all(req.userId) as any[];
    res.json(rows);
  } catch (error: any) {
    console.error("Get My Students Error:", error);
    res.status(500).json({ error: error.message || "获取名下学生失败" });
  }
};

// 教学老师编辑名下学生信息: PUT /api/jiaoxue/student/:username
export const updateMyStudent = (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const { username } = req.params;
    const student = db.prepare(
      "SELECT accountType, teacherUsername FROM users WHERE username = ?"
    ).get(username) as { accountType: string; teacherUsername: string | null } | undefined;
    if (!student || student.accountType !== 'student') {
      return res.status(404).json({ error: "学生不存在" });
    }
    // 只能编辑自己名下的学生
    if (student.teacherUsername && student.teacherUsername !== req.userId) {
      return res.status(403).json({ error: "该学生不属于您名下，无法编辑" });
    }

    const { realName, gender, grade, city, subjects, payType, accompanyStart, accompanyEnd } = req.body;
    if (accompanyStart && accompanyEnd && accompanyEnd < accompanyStart) {
      return res.status(400).json({ error: "伴学结束时间不能早于开始时间" });
    }
    const subjectsStr = Array.isArray(subjects) ? subjects.join(",") : subjects;

    db.prepare(`
      UPDATE users SET
        realName = COALESCE(?, realName),
        gender = COALESCE(?, gender),
        grade = COALESCE(?, grade),
        city = COALESCE(?, city),
        subjects = COALESCE(?, subjects),
        payType = COALESCE(?, payType),
        accompanyStart = COALESCE(?, accompanyStart),
        accompanyEnd = COALESCE(?, accompanyEnd),
        vipExpireAt = COALESCE(?, vipExpireAt)
      WHERE username = ?
    `).run(
      realName?.trim() || null,
      gender || null,
      grade || null,
      city?.trim() || null,
      subjectsStr ?? null,
      payType || null,
      accompanyStart || null,
      accompanyEnd || null,
      accompanyEnd || null,
      username
    );
    res.json({ success: true, message: "学生信息已更新" });
  } catch (error: any) {
    console.error("Jiaoxue Update Student Error:", error);
    res.status(500).json({ error: error.message || "更新学生信息失败" });
  }
};

// 教学老师浏览所有老师上传的题目列表: GET /api/jiaoxue/all-questions
// 同时返回：① questions 表的正式题目；② background_tasks 中的快速答题占位任务（无论是否识别完成）
// 每个快速答题任务带原题图片（裁剪后的选区图），详情可回显
export const getAllTeacherQuestions = (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const pageParam = req.query.page;
    const limitParam = req.query.limit;
    const page = parseInt(pageParam as string) || 1;
    const limit = parseInt(limitParam as string) || 20;

    // 搜索关键词
    const search = (req.query.search as string) || '';

    // ===== ① 正式题目（questions 表，已审核，教学老师上传） =====
    let whereSql = "WHERE q.status = 'audited' AND EXISTS (SELECT 1 FROM users u WHERE u.username = q.userId AND u.accountType = 'jiaoxue')";
    const qParams: any[] = [];

    const subject = (req.query.subject as string) || 'all';
    if (subject !== 'all') {
      whereSql += " AND q.subject = ?";
      qParams.push(subject);
    }
    if (search.trim() !== '') {
      whereSql += " AND (q.originalText LIKE ? OR q.knowledgePoints LIKE ?)";
      const term = `%${search.trim()}%`;
      qParams.push(term, term);
    }

    const formalRows = db.prepare(`
      SELECT q.*, u.realName as teacherRealName, u.nickname as teacherNickname
      FROM questions q
      LEFT JOIN users u ON u.username = q.userId
      ${whereSql}
    `).all(...qParams) as any[];

    const formalQuestions = formalRows.map(row => ({
      id: row.id,
      kind: 'question',
      isQuickTask: false,
      userId: row.userId,
      studentId: row.studentId || undefined,
      status: row.status || 'pending',
      imageUrl: row.imageUrl || undefined,
      originalText: row.originalText,
      subject: row.subject,
      knowledgePoints: row.knowledgePoints ? JSON.parse(row.knowledgePoints) : [],
      examDirection: row.examDirection || undefined,
      errorReason: row.errorReason || "",
      solution: row.solution || "",
      createdAt: row.createdAt,
      similarQuestion: row.similarQuestion ? JSON.parse(row.similarQuestion) : undefined,
      studentAnswer: row.studentAnswer || "",
      errorDiagnosis: row.errorDiagnosis ? JSON.parse(row.errorDiagnosis) : [],
      errorAnalysis: row.errorAnalysis || "",
      standardAnswer: row.standardAnswer || undefined,
      score: row.score !== null && row.score !== undefined ? row.score : undefined,
      notebookId: row.notebookId || undefined,
      masteryStatus: row.masteryStatus || 'not_mastered',
      teacherName: row.teacherRealName || row.teacherNickname || row.userId
    }));

    // ===== ② 快速答题占位任务（background_tasks，uploadMode='quick_answer'，教学老师创建） =====
    // 无论识别是否完成都展示为占位卡片
    let taskWhere = "WHERE t.uploadMode = 'quick_answer' AND EXISTS (SELECT 1 FROM users u WHERE u.username = t.userId AND u.accountType = 'jiaoxue')";
    const tParams: any[] = [];
    if (search.trim() !== '') {
      // 搜索：快速答题任务无题干字段，按任务名或识别结果文本搜索
      taskWhere += " AND (t.taskName LIKE ? OR t.payload LIKE ?)";
      const term = `%${search.trim()}%`;
      tParams.push(term, term);
    }

    const taskRows = db.prepare(`
      SELECT t.id, t.userId, t.taskName, t.status, t.createdAt, t.updatedAt, t.errorMsg, t.payload, u.realName as teacherRealName, u.nickname as teacherNickname
      FROM background_tasks t
      LEFT JOIN users u ON u.username = t.userId
      ${taskWhere}
      ORDER BY t.createdAt DESC
    `).all(...tParams) as any[];

    const quickTasks = taskRows.map(row => {
      let p: any = {};
      try { p = row.payload ? JSON.parse(row.payload) : {}; } catch (e) { p = {}; }
      // 从识别结果提取题干与答案
      const qa = Array.isArray(p.quickAnswers) ? p.quickAnswers[0] : undefined;
      return {
        id: row.id,
        kind: 'quick_task',
        isQuickTask: true,
        userId: row.userId,
        status: row.status || 'queued',
        // 原题图片：裁剪后的选区图（用于详情回显）
        imageUrl: p.savedImageUrl || undefined,
        originalText: (qa && qa.originalText) || p.extractedText || "",
        subject: (qa && qa.subject) || "",
        knowledgePoints: [],
        errorReason: "",
        solution: "",
        createdAt: row.createdAt,
        studentAnswer: "",
        errorDiagnosis: [],
        errorAnalysis: "",
        standardAnswer: (qa && qa.standardAnswer) || undefined,
        quickAnswers: p.quickAnswers || undefined,
        score: undefined,
        masteryStatus: "",
        teacherName: row.teacherRealName || row.teacherNickname || row.userId,
        errorMsg: row.errorMsg || undefined
      };
    });

    // ===== 合并 + 排序（按时间倒序）+ 分页 =====
    const merged = [...quickTasks, ...formalQuestions].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const total = merged.length;
    const offset = (page - 1) * limit;
    const pageItems = merged.slice(offset, offset + limit);

    res.json({ total, page, limit, questions: pageItems });
  } catch (error: any) {
    console.error("Get All Teacher Questions Error:", error);
    res.status(500).json({ error: error.message || "获取题目列表失败" });
  }
};

// 教学老师查看学生错题本: GET /api/jiaoxue/student/:username/notebook
export const getStudentNotebook = (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const { username } = req.params;
    // 校验学生属于当前教学老师名下
    const student = db.prepare(
      "SELECT accountType, teacherUsername FROM users WHERE username = ?"
    ).get(username) as { accountType: string; teacherUsername: string | null } | undefined;
    if (!student || student.accountType !== 'student') {
      return res.status(404).json({ error: "学生不存在" });
    }
    if (student.teacherUsername && student.teacherUsername !== req.userId) {
      return res.status(403).json({ error: "该学生不属于您名下" });
    }

    // 查询该学生的错题（studentId = 学生账号）
    const questions = db.prepare(`
      SELECT * FROM questions WHERE studentId = ? ORDER BY createdAt DESC
    `).all(username) as any[];

    const mapped = questions.map(q => ({
      id: q.id,
      userId: q.userId,
      studentId: q.studentId || undefined,
      status: q.status || 'pending',
      imageUrl: q.imageUrl || undefined,
      originalText: q.originalText,
      subject: q.subject,
      knowledgePoints: q.knowledgePoints ? JSON.parse(q.knowledgePoints) : [],
      errorReason: q.errorReason || '',
      solution: q.solution || '',
      createdAt: q.createdAt,
      studentAnswer: q.studentAnswer || '',
      errorAnalysis: q.errorAnalysis || '',
      notebookId: q.notebookId || undefined,
      masteryStatus: q.masteryStatus || 'not_mastered',
      standardAnswer: q.standardAnswer || null,
      score: q.score || null,
      examDirection: q.examDirection || null
    }));

    res.json(mapped);
  } catch (error: any) {
    console.error("Get Student Notebook Error:", error);
    res.status(500).json({ error: error.message || "获取学生错题本失败" });
  }
};
