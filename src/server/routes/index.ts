import express from "express";
import { requireAuth, requireAdmin, requireJiaowu, requireJiaoxue, requireStudent } from "../middleware/auth";
import { checkAiLimit } from "../middleware/rateLimit";
import * as authCtrl from "../controllers/authController";
import * as aiCtrl from "../controllers/aiController";
import * as qCtrl from "../controllers/questionController";
import * as adminCtrl from "../controllers/adminController";
import * as userCtrl from "../controllers/userController";
import * as taskCtrl from "../controllers/taskController";
import * as roleCtrl from "../controllers/roleController";
import * as jiaowuCtrl from "../controllers/jiaowuController";
import * as jiaoxueCtrl from "../controllers/jiaoxueController";
import * as reportCtrl from "../controllers/reportController";
import feynmanRoutes from "./feynmanRoutes";

const router = express.Router();

// ================= Auth 路由 =================
router.post("/auth/send-code", authCtrl.sendCode);
router.post("/auth/send-reset-code", authCtrl.sendResetCode);
router.post("/auth/register", authCtrl.register);
router.post("/auth/login", authCtrl.login);
router.post("/auth/logout", authCtrl.logout);
router.post("/auth/reset-password", authCtrl.resetPassword);

// ================= User 会员/支付 路由 =================
router.get("/user/info", requireAuth, userCtrl.getUserInfo);
router.post("/user/redeem", requireAuth, userCtrl.redeemCode);
router.post("/user/pay", requireAuth, userCtrl.initiatePayment);
router.post("/user/pay-success", requireAuth, userCtrl.confirmPaymentSuccess);
router.put("/user/profile", requireAuth, userCtrl.updateProfile);
router.put("/user/password", requireAuth, userCtrl.changePassword);

// ================= AI 路由 =================
router.post("/similar", requireAuth, checkAiLimit, aiCtrl.similar);
router.post("/paper/variants", requireAuth, checkAiLimit, aiCtrl.paperVariants);
router.post("/paper/variant/regenerate", requireAuth, checkAiLimit, aiCtrl.paperVariantRegenerate);

// ================= 错题 / 公共题库 / 学生路由 =================
router.get("/questions", requireAuth, qCtrl.getQuestions);
router.get("/questions/unclassified-count", requireAuth, qCtrl.getUnclassifiedQuestionsCount);
router.post("/questions", requireAuth, qCtrl.saveQuestion);
router.delete("/questions/:id", requireAuth, qCtrl.deleteQuestion);
router.put("/questions/:id/mastery", requireAuth, qCtrl.updateQuestionMastery);

router.get("/papers", requireAuth, qCtrl.getPapers);
router.post("/papers", requireAuth, qCtrl.savePaper);
router.delete("/papers/:id", requireAuth, qCtrl.deletePaper);

router.post("/upload-image", requireAuth, qCtrl.uploadImage);

router.get("/notebooks", requireAuth, qCtrl.getNotebooks);
router.post("/notebooks", requireAuth, qCtrl.createNotebook);
router.put("/notebooks/:id", requireAuth, qCtrl.updateNotebook);
router.delete("/notebooks/:id", requireAuth, qCtrl.deleteNotebook);

router.get("/public-questions", requireAuth, qCtrl.getPublicQuestions);
// 公共题库添加和删除限制为老师/管理员角色（在控制器内单独做校验或添加专门的 requireTeacherOrAdmin 拦截）
// 为了与原版逻辑一致，使用 requireAuth，在控制器内部或在此做鉴权，这里我们写在控制器内部校验或直接通过中间件控制
router.post("/public-questions", requireAuth, qCtrl.savePublicQuestion);
router.delete("/public-questions/:id", requireAuth, qCtrl.deletePublicQuestion);

router.get("/students", requireAuth, qCtrl.getStudents);

// ================= 管理员用户管理与兑换码 路由 =================
router.get("/admin/users", requireAdmin, qCtrl.adminGetUsers);
router.post("/admin/users", requireAdmin, qCtrl.adminCreateUser);
router.put("/admin/users/:username", requireAdmin, qCtrl.adminUpdateUser);
router.delete("/admin/users/:username", requireAdmin, qCtrl.adminDeleteUser);
router.get("/admin/users/:username/weekly-stats", requireAdmin, qCtrl.adminGetUserWeeklyStats);

router.post("/admin/generate-code", requireAdmin, adminCtrl.generateCode);
router.get("/admin/redemption-codes", requireAdmin, adminCtrl.getRedemptionCodes);
router.post("/admin/redeem-codes", requireAdmin, adminCtrl.generateCode);
router.get("/admin/redeem-codes", requireAdmin, adminCtrl.getRedemptionCodes);

router.get("/admin/settings", requireAdmin, adminCtrl.getSystemSettings);
router.post("/admin/settings", requireAdmin, adminCtrl.saveSystemSettings);
router.post("/admin/settings/test-ai", requireAdmin, adminCtrl.testAiConnection);
router.get("/admin/settings/ai-history", requireAdmin, adminCtrl.getAiSettingHistory);
router.delete("/admin/settings/ai-history/:id", requireAdmin, adminCtrl.deleteAiSettingHistory);
router.post("/admin/settings/ai-history/restore", requireAdmin, adminCtrl.restoreAiSettingHistory);

// ================= 公告与私域配置 路由 =================
router.get("/announcements", requireAuth, userCtrl.getActiveAnnouncements);
router.get("/vip/contact", requireAuth, userCtrl.getVipContact);

router.get("/admin/announcements", requireAdmin, adminCtrl.getAnnouncements);
router.post("/admin/announcements", requireAdmin, adminCtrl.saveAnnouncement);
router.delete("/admin/announcements/:id", requireAdmin, adminCtrl.deleteAnnouncement);
router.post("/admin/vip/contact", requireAdmin, adminCtrl.saveVipContact);

// ================= 后台任务路由 =================
router.post("/tasks", requireAuth, checkAiLimit, taskCtrl.createTask);
router.get("/tasks", requireAuth, taskCtrl.getTasks);
router.get("/tasks/:id", requireAuth, taskCtrl.getTaskById);
router.post("/tasks/:id/review", requireAuth, checkAiLimit, taskCtrl.submitReview);
router.delete("/tasks/:id", requireAuth, taskCtrl.deleteTask);
router.post("/tasks/:id/notified", requireAuth, taskCtrl.updateTaskNotified);

// ================= 费曼学习 路由 =================
router.use("/feynman", feynmanRoutes);

// ================= 第二阶段：角色与学生账号管理 路由 =================
// 管理员创建教务/教学老师
router.post("/admin/jiaowu", requireAdmin, roleCtrl.adminCreateJiaowu);
router.post("/admin/jiaoxue", requireAdmin, roleCtrl.adminCreateJiaoxue);
router.get("/admin/roles", requireAdmin, roleCtrl.adminGetRoles);
// 教务创建教学老师
router.post("/jiaowu/jiaoxue", requireJiaowu, roleCtrl.jiaowuCreateJiaoxue);
router.put("/jiaowu/jiaoxue/:username", requireJiaowu, jiaowuCtrl.updateJiaoxue);
// 教务学生管理
router.post("/jiaowu/students", requireJiaowu, jiaowuCtrl.createStudent);
router.get("/jiaowu/students", requireJiaowu, jiaowuCtrl.getStudents);
router.get("/jiaowu/students/:username", requireJiaowu, jiaowuCtrl.getStudentDetail);
router.get("/jiaowu/jiaoxues", requireJiaowu, jiaowuCtrl.getJiaoxues);
router.put("/jiaowu/students/:username/renew", requireJiaowu, jiaowuCtrl.renewStudent);
router.put("/jiaowu/students/:username", requireJiaowu, jiaowuCtrl.updateStudent);
router.delete("/jiaowu/students/:username", requireJiaowu, jiaowuCtrl.deleteStudent);

// ================= 第二阶段：教学老师工作台 路由 =================
// 快速答题
router.post("/jiaoxue/quick-answer", requireJiaoxue, jiaoxueCtrl.quickAnswer);
// 作业批改
router.post("/jiaoxue/correct-task", requireJiaoxue, jiaoxueCtrl.correctTask);
router.post("/jiaoxue/correct-task/:taskId/review", requireJiaoxue, jiaoxueCtrl.reviewCorrectTask);
// 学生错题本管理
router.get("/jiaoxue/students", requireJiaoxue, jiaoxueCtrl.getMyStudents);
router.get("/jiaoxue/student/:username/notebook", requireJiaoxue, jiaoxueCtrl.getStudentNotebook);
router.put("/jiaoxue/student/:username", requireJiaoxue, jiaoxueCtrl.updateMyStudent);
// 题目列表（所有老师上传的题目）
router.get("/jiaoxue/all-questions", requireJiaoxue, jiaoxueCtrl.getAllTeacherQuestions);

// ================= 第二阶段：学情报表 路由 =================
// 教务生成报表（日/周/月）
router.post("/jiaowu/reports", requireJiaowu, reportCtrl.generateReport);
// 免登录报表查询（链接访问）
router.get("/report/:token", reportCtrl.getReport);
// 管理员报表周期配置
router.get("/admin/report-config", requireAdmin, reportCtrl.getReportConfig);
router.post("/admin/report-config", requireAdmin, reportCtrl.saveReportConfig);

export default router;
