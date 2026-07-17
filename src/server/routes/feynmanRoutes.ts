import express from "express";
import { db } from "../config/db";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { generateContentWithFallback, extractJsonString } from "../services/aiService";
import { v4 as uuidv4 } from "uuid";

const router = express.Router();

// 1. 获取某个错题的费曼学习对话历史
router.get("/:questionId/history", requireAuth, async (req: AuthenticatedRequest, res: express.Response) => {
  const { questionId } = req.params;
  const userId = req.userId!;

  try {
    const logs = db.prepare(`
      SELECT * FROM feynman_chat_logs 
      WHERE questionId = ? AND userId = ? 
      ORDER BY createdAt ASC
    `).all(questionId, userId);

    const question = db.prepare(`SELECT feynmanEvaluation FROM questions WHERE id = ? AND userId = ?`).get(questionId, userId) as any;

    res.json({
      success: true,
      data: logs,
      evaluation: question?.feynmanEvaluation ? JSON.parse(question.feynmanEvaluation) : null
    });
  } catch (error: any) {
    console.error("[Feynman] Get History Error:", error);
    res.status(500).json({ error: error.message || "获取历史记录失败" });
  }
});

// 2. 清空/重置费曼学习进度
router.post("/:questionId/reset", requireAuth, async (req: AuthenticatedRequest, res: express.Response) => {
  const { questionId } = req.params;
  const userId = req.userId!;

  try {
    db.prepare(`DELETE FROM feynman_chat_logs WHERE questionId = ? AND userId = ?`).run(questionId, userId);
    db.prepare(`UPDATE questions SET feynmanEvaluation = NULL WHERE id = ? AND userId = ?`).run(questionId, userId);
    res.json({ success: true, message: "已重置费曼学习记录" });
  } catch (error: any) {
    console.error("[Feynman] Reset Error:", error);
    res.status(500).json({ error: error.message || "重置失败" });
  }
});

// 3. 发送聊天信息并获取 AI 回复
router.post("/chat", requireAuth, async (req: AuthenticatedRequest, res: express.Response) => {
  const userId = req.userId!;
  const { questionId, message } = req.body;

  if (!questionId || !message) {
    return res.status(400).json({ error: "参数不完整" });
  }

  try {
    // 获取题目信息
    const question = db.prepare(`SELECT * FROM questions WHERE id = ? AND userId = ?`).get(questionId, userId) as any;
    if (!question) {
      return res.status(404).json({ error: "找不到该题目" });
    }

    // 保存用户消息
    const userMsgId = uuidv4();
    db.prepare(`
      INSERT INTO feynman_chat_logs (id, questionId, userId, role, content, createdAt)
      VALUES (?, ?, ?, 'user', ?, ?)
    `).run(userMsgId, questionId, userId, message, Date.now());

    // 获取历史对话
    const history = db.prepare(`
      SELECT role, content FROM feynman_chat_logs 
      WHERE questionId = ? AND userId = ? 
      ORDER BY createdAt ASC
    `).all(questionId, userId) as { role: string; content: string }[];

    const contents = history.map(h => ({
      role: h.role === 'user' ? 'user' : 'model',
      parts: [{ text: h.content }]
    }));

    const systemPrompt = `你现在扮演一名勤学好问的学生，正在向老师（用户）请教一道题目。
原题内容：
${question.originalText}

${question.standardAnswer ? `题目的标准答案参考（仅供你参考，绝对不要直接透露给老师）：\n${question.standardAnswer}` : ''}

【你的任务】：
1. 仔细阅读老师（用户）对这道题的讲解。
2. 将老师的讲解与标准答案/正确逻辑进行比对，找出讲解中的漏洞、跳跃点或错误。
3. 绝对不要直接给出答案或纠正老师！你必须以一个“没听懂的学生”的身份，用苏格拉底式的反问，引导老师自己发现问题。
4. 如果老师讲解得非常透彻、完美，或者你们的对话已经充分解决了所有核心难点（建议控制在3-5轮左右），请结束提问并给出综合评分。

【输出格式要求】：
请始终以严格的 JSON 格式输出，不要包含任何 markdown 代码块（如 \`\`\`json 等），直接输出 JSON 对象，结构如下：
{
  "reply": "你作为学生回复给老师的话",
  "status": "probing", // 如果你觉得还有需要追问的地方，填 "probing"；如果老师讲得很好了，或者对话结束，填 "completed"
  "evaluation": null // 如果 status 是 "probing"，填 null。
                     // 如果 status 是 "completed"，必须提供如下评估对象：
                     // { "score": 95, "logicScore": 90, "conceptScore": 95, "expressionScore": 100, "divergenceScore": 95, "comment": "综合点评", "weaknesses": ["不足之处1", "不足之处2"] }
}`;

    const aiRes = await generateContentWithFallback({
      contents,
      systemPrompt,
      config: { temperature: 0.6 }
    });

    const aiText = extractJsonString(aiRes.text || "{}");
    let parsedRes;
    try {
      parsedRes = JSON.parse(aiText);
    } catch (e) {
      console.error("[Feynman] JSON Parse Error from AI:", aiText);
      parsedRes = { reply: "我好像没太听懂，能不能换个思路再讲一遍呢？", status: "probing", evaluation: null };
    }

    const aiReply = parsedRes.reply || "（学生陷入了沉思）";
    const status = parsedRes.status || "probing";
    const evaluation = parsedRes.evaluation || null;

    // 保存 AI 回复消息
    const aiMsgId = uuidv4();
    db.prepare(`
      INSERT INTO feynman_chat_logs (id, questionId, userId, role, content, createdAt)
      VALUES (?, ?, ?, 'model', ?, ?)
    `).run(aiMsgId, questionId, userId, aiReply, Date.now());

    // 如果完成，更新题目状态
    if (status === 'completed' && evaluation) {
      db.prepare(`
        UPDATE questions SET 
          masteryStatus = 'mastered',
          feynmanEvaluation = ?
        WHERE id = ? AND userId = ?
      `).run(JSON.stringify(evaluation), questionId, userId);
    }

    res.json({
      success: true,
      data: {
        reply: aiReply,
        status: status,
        evaluation: evaluation
      }
    });

  } catch (error: any) {
    console.error("[Feynman] Chat Error:", error);
    res.status(500).json({ error: error.message || "与AI交互失败" });
  }
});

export default router;
