const fs = require('fs');

let code = fs.readFileSync('src/server/controllers/taskController.ts', 'utf8');

// 1. Add stringSimilarity import
if (!code.includes('import { stringSimilarity }')) {
  code = code.replace(
    'import { enhanceImageForOcr } from "../utils/imageOptimizer";',
    'import { enhanceImageForOcr } from "../utils/imageOptimizer";\nimport { stringSimilarity } from "../utils/stringUtils";'
  );
}

// 2. Find and replace runAiExtract
const runAiExtractStart = code.indexOf('const runAiExtract = async (imageBase64: string, mimeType: string, extractMode: string) => {');
const runAiDiagnoseAllStart = code.indexOf('const runAiDiagnoseAll = async');

if (runAiExtractStart === -1 || runAiDiagnoseAllStart === -1) {
  console.log('Cannot find function bounds in taskController');
  process.exit(1);
}

const beforeRunAiExtract = code.slice(0, runAiExtractStart);
const afterRunAiExtract = code.slice(runAiDiagnoseAllStart);

const newRunAiExtract = `const runAiExtract = async (imageBase64: string, mimeType: string, extractMode: string) => {
  const isSingle = extractMode === 'single';
  
  let prompt = \`\`;
  if (isSingle) {
    prompt += \`
识别我提供的图片中的题目文本、配图信息及手写内容。
【重要指令】：当前为单题提取模式。请不要将图片切分为多道题，只将其中的最核心的一道题完整提取出来，作为一个整体题目返回。
我提供了一张【学生试卷/作业图片】（第一张图）。
\`;
  } else {
    prompt += \`
识别我提供的图片中的所有独立题目。
【大题合并铁律】：对于包含 (1)(2)(3) 等多个小问的综合题、阅读理解题、表格题，绝对禁止将小问拆分为独立题目！你必须将公共题干与所有小问作为一个不可分割的整体，完整保存在一个题目的 originalText 中。
我提供了一张【学生试卷/作业图片】（第一张图）。
\`;
  }
  prompt += \`
【具体输出字段要求】：
请严格以 JSON 数组的形式返回（即使只有一题也要用数组包围），数组中的每个对象代表一道题，包含以下字段：
- subject: [学科名称，如数学/物理/化学等]
- boundingBox: [题目所在区域的矩形框坐标，格式为 {"x": 10, "y": 20, "w": 400, "h": 200}]
- originalText: [本题的高精度完整题干印刷体文字，包含题号。绝对不能写“略”]
- studentAnswer: [本题区域内学生手写作答出的答案或步骤，若无则留空。]
- standardAnswer: [根据参考资料提取的本题标准答案，若无则留空]
- visualContext: [如果你在题目中看到了几何图形、函数图像或实物配图，请在此字段用纯文本极其详细地描述图形的拓扑结构、形状特征、嵌套关系和标注字母。如果没有图，返回空字符串。]

【深度校准与格式规约（极度重要）】：
1. **语义级防错**：如果在数学题中识别出汉字“元”、“兀”等，且上下文是关于圆、面积、体积等几何计算，必须将其纠正为数学符号“\\\\pi”。理清易混淆的“t”与“+”。
2. **表格原生化**：若题目包含表格，绝对禁止使用 Markdown 的 | 语法！必须使用原生的 HTML 标签（<table>, <tr>, <td>）重建表格，并在表格内正常使用 $ 包围 LaTeX 公式。
3. **公式规范**：公式必须用标准的 $ 或 $$ 包围输出为 LaTeX 格式。注意：JSON 字符串中的所有 LaTeX 反斜杠必须双写转义（例如 \\\\pi, \\\\frac），否则会导致 JSON 解析失败！
\`;

  const systemPrompt = "你是一个只输出结构化 JSON 的 OCR 助手。你的整个回复必须是一个合法的 JSON 数组，不要包含 Markdown 代码块标记或任何额外的多余废话。";

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
      temperature: 0.1
    },
    model: getSetting("AI_VISION_MODEL", process.env.AI_VISION_MODEL || 'glm-5v-turbo'),
    systemPrompt
  });

  const text = response.text || '';
  if (!text) throw new Error("AI 未返回提取文本");

  const result = [];
  try {
    const extracted = extractJsonString(text);
    const parsedData = JSON.parse(sanitizeJsonString(extracted));
    const items = Array.isArray(parsedData) ? parsedData : [parsedData];
    
    for (const item of items) {
       if (!item.originalText && !item.studentAnswer) continue;
       result.push({
         subject: item.subject || "数学",
         originalText: item.originalText || "",
         studentAnswer: item.studentAnswer || "",
         standardAnswer: item.standardAnswer || "",
         visualContext: item.visualContext || "",
         boundingBox: item.boundingBox || { x: 0, y: 0, w: 0, h: 0 }
       });
    }
  } catch (e) {
     console.error("Failed to parse extract JSON", e, text);
     result.push({
       subject: "数学",
       originalText: text,
       studentAnswer: "",
       standardAnswer: "",
       visualContext: "",
       boundingBox: { x: 0, y: 0, w: 0, h: 0 }
     });
  }

  // 二阶段逻辑纠错
  const textModel = getSetting("AI_MODEL", process.env.AI_MODEL || 'glm-5.1');
  if (result.length > 0) {
    for (let i = 0; i < result.length; i++) {
      const q = result[i];
      if (q.studentAnswer || q.originalText) {
        try {
          const correctPrompt = \`你是一个极其严谨的 OCR 文本校对专家。你的唯一任务是：基于上下文，修复视觉模型（OCR）在提取【原题干】和【手写作答】时产生的“视觉识别错误”（如小数点漏识别、40%识别成0.4%、+识别成4、2.1识别成21等）。

【严禁触碰的红线】：
1. 绝对不要帮学生修改他们真实的计算错误！如果学生算错了（比如 2.1×1 算成了 2.7），必须原封不动地保留！
2. 绝对不要帮学生把解题步骤补充完整，更不能自己去计算正确答案并覆盖学生的作答！

【双向推导校对策略】：
如果【手写作答】里的数字和【原题干】里的数字“长得很像”但存在细微差异（例如 2.1 和 21），且根据上下文发现【手写作答】里的推导是连贯的，说明是 OCR 漏掉了小数点。此时把【原题干】里的错误数字修正为合理数字。

【原题干（可能有 OCR 错误）】：\${q.originalText}
【手写作答（可能有真实的计算错，也可能有 OCR 错误）】：\${q.studentAnswer}

请仅修复纯粹的 OCR 字符错漏，并严格返回 JSON 对象格式，不要包含 Markdown 标记：
{
  "originalText": "修复 OCR 错误后的题干...",
  "studentAnswer": "修复 OCR 错误后的手写作答（务必保留学生真实的算错或写错）..."
}\`;
          const correctionResponse = await generateContentWithFallback({
            contents: [{ role: 'user', parts: [{ text: correctPrompt }] }],
            config: { temperature: 0.1 },
            model: textModel,
            systemPrompt: "你是一个只输出合法 JSON 对象的校对助手。不得包含任何多余解释或 Markdown 标记。"
          });
          const correctedText = (correctionResponse.text || '').trim();
          try {
            const parsed = JSON.parse(extractJsonString(correctedText));
            // 验证相似度防篡改 (threshold = 0.85)
            if (parsed.originalText && q.originalText) {
               const sim = stringSimilarity(q.originalText, parsed.originalText);
               if (sim >= 0.85) {
                 q.originalText = parsed.originalText;
               } else {
                 console.warn(\`[TaskQueue] 二阶段 originalText 差异过大 (相似度 \${sim.toFixed(2)})，拒绝篡改\`);
               }
            } else if (parsed.originalText && !q.originalText) {
               q.originalText = parsed.originalText;
            }

            if (parsed.studentAnswer && q.studentAnswer) {
               const sim = stringSimilarity(q.studentAnswer, parsed.studentAnswer);
               if (sim >= 0.85) {
                 q.studentAnswer = parsed.studentAnswer;
               } else {
                 console.warn(\`[TaskQueue] 二阶段 studentAnswer 差异过大 (相似度 \${sim.toFixed(2)})，拒绝篡改\`);
               }
            } else if (parsed.studentAnswer && !q.studentAnswer) {
               q.studentAnswer = parsed.studentAnswer;
            }
          } catch (parseError) {
            console.warn("[TaskQueue] 二阶段校对 JSON 解析失败，沿用原文");
          }
        } catch (e) {
          console.warn("[TaskQueue] 二阶段校对失败，跳过", e);
        }
      }
    }
  }

  return result;
};

`;

code = beforeRunAiExtract + newRunAiExtract + afterRunAiExtract;

fs.writeFileSync('src/server/controllers/taskController.ts', code);
console.log('TaskController updated successfully');
