import express from "express";
import { requireAuth, requireAdmin } from "../middleware/auth";
import { checkAiLimit } from "../middleware/rateLimit";
import * as authCtrl from "../controllers/authController";
import * as aiCtrl from "../controllers/aiController";
import * as qCtrl from "../controllers/questionController";
import * as adminCtrl from "../controllers/adminController";
import * as userCtrl from "../controllers/userController";

const router = express.Router();

// ================= Auth 路由 =================
router.post("/auth/send-code", authCtrl.sendCode);
router.post("/auth/register", authCtrl.register);
router.post("/auth/login", authCtrl.login);
router.post("/auth/logout", authCtrl.logout);

// ================= User 会员/支付 路由 =================
router.get("/user/info", requireAuth, userCtrl.getUserInfo);
router.post("/user/redeem", requireAuth, userCtrl.redeemCode);
router.post("/user/pay", requireAuth, userCtrl.initiatePayment);
router.post("/user/pay-success", requireAuth, userCtrl.confirmPaymentSuccess);

// ================= AI 路由 =================
router.post("/analyze", requireAuth, checkAiLimit, aiCtrl.analyze);
router.post("/extract", requireAuth, checkAiLimit, aiCtrl.extract);
router.post("/diagnose", requireAuth, checkAiLimit, aiCtrl.diagnose);
router.post("/similar", requireAuth, checkAiLimit, aiCtrl.similar);
router.post("/paper/variants", requireAuth, checkAiLimit, aiCtrl.paperVariants);
router.post("/paper/variant/regenerate", requireAuth, checkAiLimit, aiCtrl.paperVariantRegenerate);

// ================= 错题 / 公共题库 / 学生路由 =================
router.get("/questions", requireAuth, qCtrl.getQuestions);
router.post("/questions", requireAuth, qCtrl.saveQuestion);
router.delete("/questions/:id", requireAuth, qCtrl.deleteQuestion);

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

router.post("/admin/generate-code", requireAdmin, adminCtrl.generateCode);
router.get("/admin/redemption-codes", requireAdmin, adminCtrl.getRedemptionCodes);
router.post("/admin/redeem-codes", requireAdmin, adminCtrl.generateCode);
router.get("/admin/redeem-codes", requireAdmin, adminCtrl.getRedemptionCodes);

router.get("/admin/settings", requireAdmin, adminCtrl.getSystemSettings);
router.post("/admin/settings", requireAdmin, adminCtrl.saveSystemSettings);
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

export default router;
