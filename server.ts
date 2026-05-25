import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

// Need to increase body limit for base64 images
app.use(express.json({ limit: '50mb' }));

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Robust helper function with automatic fallback to gemini-3.5-flash in case of quota or rate-limiting errors
async function generateContentWithFallback(params: {
  contents: any[];
  config?: any;
  model?: string;
}) {
  const primaryModel = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
  const modelToUse = params.model || primaryModel;

  try {
    console.log(`[AI Request] Using model: ${modelToUse}`);
    return await ai.models.generateContent({
      ...params,
      model: modelToUse,
    });
  } catch (error: any) {
    const errorStr = (error.message || error.toString() || "").toLowerCase();
    const isQuotaError = errorStr.includes("429") || 
                         errorStr.includes("quota") || 
                         errorStr.includes("limit") || 
                         errorStr.includes("resource_exhausted") || 
                         errorStr.includes("rate_limit");

    if (isQuotaError && modelToUse !== 'gemini-3.5-flash') {
      console.warn(`[AI Warning] Model ${modelToUse} failed due to quota/rate limit: ${error.message || error.toString()}. Automatically retrying with highly available 'gemini-3.5-flash'...`);
      try {
        return await ai.models.generateContent({
          ...params,
          model: 'gemini-3.5-flash',
        });
      } catch (fallbackError: any) {
        console.error("[AI Error] Fallback to gemini-3.5-flash also failed:", fallbackError);
        throw fallbackError;
      }
    }
    throw error;
  }
}

// API Route for analyzing an image
app.post("/api/analyze", async (req, res) => {
  try {
    const { imageBase64, mimeType } = req.body;
    if (!imageBase64) {
       return res.status(400).json({ error: "Missing imageBase64" });
    }

    const prompt = `
你是一个AI智能名师。请根据提供的错题或试卷图片：
1. 提取题目的文字内容 (如果手写，请高精度精准识别)。
   ⚠️ 核心重要规则：如果图片中包含多道题目（例如一整页试卷、多道独立习题、大题的多个独立问等，比如第1题到第10题），你【千万不能】只提取或分析其中一道题！你必须在 "originalText" 中将识别出来的【所有题目文字】按序号（例：1., 2. 等）全部完整列出，绝不能漏掉任何一题。
2. 判断所属学科（如数学、物理、化学、英语、语文等）。
3. 提供详细的解题步骤（必须清晰易懂，可以直接指导学生）。
   ⚠️ 核心重要规则：如果图片中有多个题目，请在 "solution" 中按段落和章节【依次详细完整解答每一道题】，不要有任何漏答情况。建议使用 Markdown 大标题划分题目，例如：
   ### 第1题解析
   【解析过程】...
   ### 第2题解析
   【解析过程】...
   依此类推，确保与 originalText 中的题目一一对应。
4. 梳理涉及的关键核心知识点（如‘二次函数’，最多三个，如果是多道题可综合最具代表性的主考点）。

请返回符合以下结构的严格JSON格式：
{
  "originalText": "提取的题目完整文字内容（如果有1-10题，必须全部完整列出，不能忽略或截断）",
  "subject": "学科名称",
  "knowledgePoints": ["考点1", "考点2"],
  "solution": "一比一精细解题步骤（如果是多题试卷，必须分大题章节依次写出每道题目的详细解法，不能漏掉任何一道题的解析和答案）"
}
`;
    // We send base64 data to Gemini using the fallback-safe wrapper
    const response = await generateContentWithFallback({
        contents: [
            {
                role: 'user',
                parts: [
                    {
                        inlineData: {
                            data: imageBase64.split(',')[1] || imageBase64,
                            mimeType: mimeType || 'image/jpeg'
                        }
                    },
                    { text: prompt }
                ]
            }
        ],
        config: {
            responseMimeType: 'application/json',
            temperature: 0.2
        }
    });

    const text = response.text;
    if (!text) throw new Error("Empty response from AI");
    
    let parsedText = text;
    if (parsedText.startsWith('```json')) {
      parsedText = parsedText.replace(/```json/i, '').replace(/```/g, '').trim();
    }
    const data = JSON.parse(parsedText);
    res.json(data);

  } catch (error: any) {
    console.error("AI Analysis Error:", error);
    res.status(500).json({ error: error.message || "Failed to analyze image" });
  }
});

// API Route for generating similar questions
app.post("/api/similar", async (req, res) => {
  try {
    const { originalText, subject, knowledgePoints } = req.body;
    
    const prompt = `
请作为AI导师，根据以下信息出一道相似的练习题，帮助学生巩固查漏补缺：
- 学科: ${subject}
- 题目内容: ${originalText}
- 核心知识点: ${knowledgePoints?.join(', ')}

请返回严格的JSON格式：
{
  "questionText": "新题目的完整文字",
  "solution": "新题目的详细解题步骤"
}
`;

    // We generate similar content using the fallback-safe wrapper
    const response = await generateContentWithFallback({
        contents: [
            {
                role: 'user',
                parts: [
                    { text: prompt }
                ]
            }
        ],
        config: {
            responseMimeType: 'application/json',
            temperature: 0.7
        }
    });

    const text = response.text;
    if (!text) throw new Error("Empty response from AI");
    
    let parsedText = text;
    if (parsedText.startsWith('```json')) {
      parsedText = parsedText.replace(/```json/i, '').replace(/```/g, '').trim();
    }
    const data = JSON.parse(parsedText);
    res.json(data);

  } catch (error: any) {
    console.error("Similar question Error:", error);
    res.status(500).json({ error: error.message });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(console.error);
