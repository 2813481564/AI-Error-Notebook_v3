import express from "express";
import { db } from "../config/db";
import { AuthenticatedRequest } from "../middleware/auth";
import {
  generateContentWithFallback,
  extractJsonString,
  sanitizeJsonString
} from "../services/aiService";
import { getSetting } from "../services/settingService";
import { stringSimilarity } from "../utils/stringUtils";

const GEOMETRY_PROMPT_TEMPLATE = `
【几何图形数据规范（必须填写 geometry 字段）】
根据题目类型填写 geometry.type：

A) 格点/网格类（题干含"格点"/"网格"/"方格"）: type="grid", gridSize=网格大小
   shapes 坐标: (0,0) 在左下角，Y轴向上，以格点为单位。

B) 坐标系类（题干给出如 A(-4,-1) 等具体坐标）: type="coordinate"
   xRange=[x最小-1, x最大+1], yRange=[y最小-1, y最大+1]
   shapes 坐标直接使用题目中的数学坐标值。

C) 平面几何类（有三角形/圆/四边形等，但无坐标数值）: type="plane"
   shapes 坐标用 0-100 比例值，(0,0) 在左下角，Y轴向上，合理分布在画面中。

D) 立体几何类（有圆柱/圆锥/球/长方体等三维立体图形）: type="solid_3d"
   使用 solids 数组（shapes 填 []），SVG坐标左上为(0,0)，x向右，y向下，画布800×320。
   【极其重要 - 布局与嵌套】：
   - 独立的图形（分别代表图1、图2等）必须使用不同的 cx 坐标水平隔开，绝对不能重叠！
   - **例外（极度重要）**：如果题意是“将圆柱削成一个最大的圆锥”（如图3），你**必须**在同一个 cx 坐标处，同时放一个 'fill:"none"' 的圆柱和一个圆锥，让它们完全重叠，以此完美还原“圆锥在圆柱内部”的几何透视关系！
   圆柱: {"type":"cylinder","cx":150,"cy":60,"rx":60,"ry":20,"h":140,"fill":"#dbeafe","stroke":"#374151","cuts":[]}
     cx/cy:顶部椭圆圆心，rx:水平半轴，ry:垂直半轴，h:高度。
     【极其重要 - 关于圆柱的切割 cuts】：
     - 若为【横向水平切割】（截成n段），切 n-1 刀，增加 2(n-1) 个底面。cuts 填入向下偏移的像素值列表，如 [40, 80, 120]。**【防错警告】：如果横切成 n 段，你的 cuts 数组必须严格包含 n-1 个数值元素，绝不能少切！**
     - 若为【纵向竖直切割】（沿直径切开），切 n 刀成 2n 块，增加 2n 个长方形截面。
     - 【视觉排版要求】：对于纵切，若切成 2n 块（切 n 刀），你**必须在 cuts 中填入 n 个不同 angle 的 vertical 对象**（例如切 4 块填 2 个对象如 {"type":"vertical","angle":0.78} 和 {"type":"vertical","angle":2.35}），系统会自动渲染出完美的 3D 交叉切面！**注意：不要使用 0 和 1.57，它们会与圆柱外轮廓线重合导致图形隐身！**
     - 【数学逻辑极度警告！！！】：在改变题目数字时，**必须保持原题的切割方式和顺序**！如果原题图1是纵切（偶数块），变式题图1也必须是纵切。**【推荐约束】：为了图形美观及符合考纲，纵切建议优先出“切成2块（两半）”或“交叉切成4块”。**如果切多块，题干必须表述为“过底面中心交叉纵切成 x 等份”。如果原题图2是横切，变式题图2也必须是横切（块数任意）。**绝对不允许写出“沿直径纵切成3块”这种违背几何常识的荒谬题目！**
   圆锥: {"type":"cone","cx":150,"cy":230,"rx":70,"ry":23,"h":160,"fill":"#dcfce7","stroke":"#374151"}
     cx/cy:底面椭圆圆心(底面在下)，h:锥高(向上)
   球体: {"type":"sphere","cx":150,"cy":160,"r":80,"fill":"#fef9c3","stroke":"#374151"}
   长方体: {"type":"cuboid","lx":60,"ty":80,"w":120,"h":100,"d":60,"fill":"#e0f2fe","stroke":"#374151"}
   文字标签: {"type":"label_3d","text":"r","x":220,"y":250,"color":"#1e293b"}
     【注意】：文字标签的 y 坐标必须放在图形正下方，绝对不要和图形的底边重合！例如，若圆柱 cy=60, h=140, ry=20，其底边 y=220，那么文字的 y 必须填 250！
   辅助虚线: {"type":"dashed_line_3d","from":[100,150],"to":[200,150],"stroke":"#374151"}

E) 纯计算/代数题，无需图形: type="none", shapes=[]

shapes 元素格式（仅 A/B/C 类使用）：
polygon: {"type":"polygon","points":[[x1,y1],[x2,y2],...],"fill":"#eff6ff","stroke":"#374151"}
line:    {"type":"line","from":[x1,y1],"to":[x2,y2],"stroke":"#374151","dashed":false}
circle:  {"type":"circle","cx":x,"cy":y,"r":radius,"fill":"none","stroke":"#374151"}
point:   {"type":"point","x":x,"y":y,"r":3,"fill":"#374151"}
label:   {"type":"label","text":"A","x":x,"y":y,"color":"#1e293b","anchor":"middle"}
`;

// 1. 分析图片并生成相似题目
export const analyze = async (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const user = db.prepare("SELECT role FROM users WHERE username = ?").get(req.userId) as { role: string } | undefined;
    const allowStudentAi = getSetting("ALLOW_STUDENT_AI", "true") === "true";
    if (!user || (user.role === 'student' && !allowStudentAi)) {
      return res.status(403).json({ error: "权限不足，学生角色无法使用 AI 解析功能" });
    }

    const { imageBase64, mimeType, answerImageBase64, answerMimeType, answerText, subject, originalText, knowledgePoints } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: "Missing imageBase64" });
    }

    const prompt = `
你是一位经验丰富的高中数学/物理/化学名师。请根据以下原题信息，出一道【相似度约80%】的同类练习题。

【原题信息】
- 学科: ${subject || '数学'}
- 题目内容: ${originalText || ''}
- 核心知识点: ${knowledgePoints?.join(', ') || ''}

【命题要求】
1. 核心知识点与原题完全相同。
2. 题型、步骤数量、公式类型与原题保持一致。
3. 修改具体数值/已知条件/情境背景，使题目全新（约20%差异）。
4. 知识点/图形/公式均不超出高中范围。
5. 数学公式必须用标准 $ 或 $$ 包围。

${GEOMETRY_PROMPT_TEMPLATE}

请严格按以下 JSON 格式返回，不要包含 Markdown 代码块标记：
{
  "questionText": "新题目的完整文字（纯文字+LaTeX公式，不包含任何SVG代码）",
  "solution": "详细解题步骤（含LaTeX公式，每步用1. 2. 3.标注）",
  "geometry": {
    "type": "coordinate",
    "xRange": [-6, 2],
    "yRange": [-4, 2],
    "shapes": [
      {"type":"polygon","points":[[-4,-1],[-3,-3],[-1,-2]],"fill":"#eff6ff","stroke":"#374151"},
      {"type":"point","x":-4,"y":-1,"r":3,"fill":"#374151"},
      {"type":"label","text":"A","x":-4.4,"y":-0.7,"color":"#1e293b","anchor":"middle"}
    ]
  }
}
`;

    const systemPrompt = `你是一个严谨的 AI 智能名师助手。你的输出格式有且只有一种：一个合法的 JSON 数组（以 [ 开头，以 ] 结尾）。
你必须遵守以下铁律：
1. 【绝对禁止】将图片中多道独立的题目（如第20题、第21题、第22题）合并为一个数组元素返回。
2. 图片中有几道独立的题目（以题号区分，例如 20、21、22），就必须返回几个独立的数组元素对象。
3. 每个数组元素对象只能包含其对应题目的内容，不能混入其他题目的题干、解析或步骤。
4. 你的整个回复内容只能是纯 JSON 数组文本，不得包含任何 Markdown 标记（如 \`\`\`json）、解释文字或其他内容。`;

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
            ...(answerImageBase64 ? [{
              inlineData: {
                data: answerImageBase64.split(',')[1] || answerImageBase64,
                mimeType: answerMimeType || 'image/jpeg'
              }
            }] : []),
            { text: prompt }
          ]
        }
      ],
      config: {
        temperature: 0.1
      },
      systemPrompt
    });

    const text = response.text;
    if (!text) throw new Error("Empty response from AI");

    const parsedText = extractJsonString(text);
    const data = JSON.parse(sanitizeJsonString(parsedText));
    const result = Array.isArray(data) ? data : [data];
    res.json(result);

  } catch (error: any) {
    console.error("AI Analysis Error:", error);
    res.status(500).json({ error: error.message || "Failed to analyze image" });
  }
};

// 2. 从图片中提取题目文本及手写内容
export const extract = async (req: AuthenticatedRequest, res: express.Response) => {
  let text = 'not_sent_yet';
  try {
    const user = db.prepare("SELECT role FROM users WHERE username = ?").get(req.userId) as { role: string } | undefined;
    const allowStudentAi = getSetting("ALLOW_STUDENT_AI", "true") === "true";
    if (!user || (user.role === 'student' && !allowStudentAi)) {
      return res.status(403).json({ error: "权限不足，学生角色无法使用 AI 解析功能" });
    }

    const { imageBase64, mimeType, answerImageBase64, answerMimeType, answerText, mode } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: "Missing imageBase64" });
    }

    const isSingle = mode === 'single';

    let prompt = ``;
    if (isSingle) {
      prompt += `
识别我提供的图片中的题目文本、配图信息及手写内容。
【重要指令】：当前为单题提取模式。请不要将图片切分为多道题，只将其中的最核心的一道题完整提取出来，作为一个整体题目返回。
我提供了一张【学生试卷/作业图片】（第一张图）。
`;
    } else {
      prompt += `
识别我提供的图片中的所有独立题目。
【大题合并铁律】：对于包含 (1)(2)(3) 等多个小问的综合题、阅读理解题、表格题，绝对禁止将小问拆分为独立题目！你必须将公共题干与所有小问作为一个不可分割的整体，完整保存在一个题目的 originalText 中。
我提供了一张【学生试卷/作业图片】（第一张图）。
`;
    }
    if (answerImageBase64) {
      prompt += `另外，我提供了一张对应的【标准答案参考图片】（第二张图）。请务必对照两张图，将同一道题的题干、学生手写作答以及参考的标准答案进行一一匹配提取。\n`;
    }
    if (answerText) {
      prompt += `另外，我提供了一段参考答案文本如下：\n【完整参考答案文本开始】\n${answerText}\n【完整参考答案文本结束】\n请结合此参考文本，将其中的各题答案切分并匹配到对应题目的标准答案字段中。\n`;
    }
    prompt += `
【具体输出字段要求】：
请严格以 JSON 数组的形式返回（即使只有一题也要用数组包围），数组中的每个对象代表一道题，包含以下字段：
- subject: [学科名称，如数学/物理/化学等]
- boundingBox: [题目所在区域的矩形框坐标，格式为 {"x": 10, "y": 20, "w": 400, "h": 200}]
- originalText: [本题的高精度完整题干印刷体文字，包含题号。绝对不能写“略”]
- studentAnswer: [本题区域内学生手写作答出的答案或步骤，若无则留空。]
- standardAnswer: [根据参考资料提取的本题标准答案，若无则留空]
- visualContext: [如果你在题目中看到了几何图形、函数图像或实物配图，请在此字段用纯文本极其详细地描述图形的拓扑结构、形状特征、嵌套关系和标注字母。如果没有图，返回空字符串。]

【深度校准与格式规约（极度重要）】：
1. **语义级防错**：如果在数学题中识别出汉字“元”、“兀”等，且上下文是关于圆、面积、体积等几何计算，必须将其纠正为数学符号“\\pi”。理清易混淆的“t”与“+”。
2. **表格原生化**：若题目包含表格，绝对禁止使用 Markdown 的 | 语法！必须使用原生的 HTML 标签（<table>, <tr>, <td>）重建表格，并在表格内正常使用 $ 包围 LaTeX 公式。
3. **公式规范**：公式必须用标准的 $ 或 $$ 包围输出为 LaTeX 格式。注意：JSON 字符串中的所有 LaTeX 反斜杠必须双写转义（例如 \\\\pi, \\\\frac），否则会导致 JSON 解析失败！
4. **视觉抗干扰指令**：图片中可能存在老师使用红笔/其他颜色笔打的勾、叉、减分（如-2）或批改写下的正确答案。你必须完全忽略所有的批改痕迹，**仅提取学生原本的原始手写作答内容**！
`;

    const systemPrompt = "你是一个只输出结构化 JSON 的 OCR 助手。你的整个回复必须是一个合法的 JSON 数组，不要包含 Markdown 代码块标记（如 ```json）或任何额外的多余废话。";

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
            ...(answerImageBase64 ? [{
              inlineData: {
                data: answerImageBase64.split(',')[1] || answerImageBase64,
                mimeType: answerMimeType || 'image/jpeg'
              }
            }] : []),
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

    text = response.text || '';
    if (!text) throw new Error("Empty response from AI");

    const result: any[] = [];
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
         visualContext: ""
       });
    }

    // 二阶段逻辑纠错
    const textModel = getSetting("AI_MODEL", process.env.AI_MODEL || 'glm-5.1');
    if (result.length > 0) {
      for (let i = 0; i < result.length; i++) {
        const q = result[i];
        if (q.studentAnswer) {
          try {
            const correctPrompt = `作为一名严谨的数学教师校对员。手写作答中可能因笔画粘连导致数字识别错误（例如 0.6 被误认成 0.5、+被误认成4等），或将圆周率“\\pi”误认成汉字“元”、“兀”。请结合上下文，在不改变学生解题本意的前提下，校正因视觉粘连导致的明显 OCR 字符错误。
【原题干】：${q.originalText}
【手写作答】：${q.studentAnswer}
【参考答案】：${q.standardAnswer || '无'}

请直接返回校正后的【手写作答】纯文本，不要包含任何前缀或额外解释。如果完全无需修正，请直接原样返回原手写作答文本。`;
            const correctionResponse = await generateContentWithFallback({
              contents: [{ role: 'user', parts: [{ text: correctPrompt }] }],
              config: { temperature: 0.1 },
              model: textModel,
              systemPrompt: "你是一个纯文本校对助手。只返回校对后的结果文本，不要 Markdown，不要多余废话。"
            });
            const correctedText = (correctionResponse.text || '').trim();
            if (correctedText && !correctedText.startsWith('无') && !correctedText.startsWith('空')) {
              const similarity = stringSimilarity(q.studentAnswer, correctedText);
              if (similarity > 0.5) {
                q.studentAnswer = correctedText;
              }
            }
          } catch (e) {
            console.warn("AI 二阶段校对失败，跳过", e);
          }
        }
      }
    }

    res.json(result);

  } catch (error: any) {
    console.error("AI Extraction text:", text);
    console.error("AI Extraction Error:", error);
    res.status(500).json({ error: error.message || "Failed to extract image content" });
  }
};

// 3. 诊断与解析错题内容
export const diagnose = async (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const user = db.prepare("SELECT role FROM users WHERE username = ?").get(req.userId) as { role: string } | undefined;
    const allowStudentAi = getSetting("ALLOW_STUDENT_AI", "true") === "true";
    if (!user || (user.role === 'student' && !allowStudentAi)) {
      return res.status(403).json({ error: "权限不足，学生角色无法使用 AI 诊断功能" });
    }

    let { subject, originalText, visualContext, studentAnswer, standardAnswer, thinkingMode, grade, notebookId } = req.body;
    if (!originalText) {
      return res.status(400).json({ error: "Missing originalText" });
    }

    if (!grade && notebookId) {
      try {
        const nb = db.prepare("SELECT grade FROM notebooks WHERE id = ?").get(notebookId) as { grade: string | null } | undefined;
        if (nb && nb.grade) {
          grade = nb.grade;
        }
      } catch (dbErr) {
        console.warn("Failed to query notebook grade in diagnose:", dbErr);
      }
    }

    const gradeConstraint = grade 
      ? `本道题所属年级为：${grade}。在给出标准解析和分析错误原因时，必须严格保持与这道题目的实际年级和学段级别（小学/初中/高中）完全一致，绝对不能使用超纲的知识和方法来解析该题（例如：若本题是小学六年级的题目，则严禁使用初中、高中或大学的代数、微积分、方程等超纲知识，必须控制在小学六年级及以下的解题范围内）。`
      : `请智能自动识别这道题目所属的实际年级和学段级别（从小学一年级到高中三年级）。在给出标准解析和分析错误原因时，必须严格保持与这道题目的实际年级和学段级别完全一致，绝对不能使用超纲的知识和方法来解析该题（例如：若本题是小学六年级的题目，则严禁使用初中、高中或大学的代数、微积分、方程等超纲知识，必须控制在小学六年级及以下的解题范围内）。`;

    let standardAnswerSection = '';
    if (standardAnswer) {
      standardAnswerSection = `- 老师提供的参考标准答案: ${standardAnswer}\n`;
    }
    const prompt = `
你是一个人工智能名师。请根据已录入和校对好的错题信息，进行深度的解答和批改诊断：

【题目信息】
- 学科: ${subject || '未指定'}
- 题干纯文本: ${originalText}
- 题干配图/几何拓扑结构描述: ${visualContext || '无图'}
${standardAnswerSection}
- 学生作答内容: ${studentAnswer || '（无学生作答）'}
- 难度与年级限制: ${gradeConstraint}

【任务要求】：
1. **核心考点** ("knowledgePoints"): 分析该题考查的核心知识点（例如：“平行线的判定”、“二次函数最值”等），最多列出 3 个，存入数组。
2. **考察方向** ("examDirection"): 简明扼要地概括题目的主要测试意图或考法（如"函数最值与导数综合"、"数形结合考法"等）。
3. **错因标签** ("errorReason"): 必须**严格且只能**从以下四个阶段的子标签池中挑选 1 个最符合的标签输出（如 "【概念/审题】读题粗心"）：
   - 【概念/审题】：概念模糊、读题粗心、条件遗漏、隐含条件未挖掘
   - 【逻辑/建模】：思路跑偏、公式错用、图形构造错误、无法建立模型
   - 【计算/执行】：计算粗心、符号错误、方程解错、单位换算错误
   - 【规范/表达】：步骤跳跃、格式不规范、字迹潦草
   【极度重要】：如果“学生作答内容”为空，绝对禁止强行挑选上述错误标签！必须强制输出标签："【知识盲区/无思路】完全留白"。
4. **标准解析** ("solution"): 给出该题的名师标准解题推导步骤。如果涉及数学公式，请用标准的 $ 或 $$ 符号包围以保证 LaTeX 完美渲染。
5. **错误原因分析** ("errorAnalysis"):
   - 如果 "学生作答内容" 不为空，请严格遵循以下三段式结构化 Markdown 文本输出（换行请用 \\n）：
     【关键错误定位】：一句话精炼指出核心错误（如“数值代入混乱，符号混用”）。
     \\n你写的是：\\n> [此处原样复现学生写错的那一步解答]
     \\n❌ 错在哪？
     - 第一步：[写出这步正确的计算或逻辑] —— **这才是正确结果！**
     - [用对话语气指出错误] -> 你误把...当成了...！
   - 如果为空，请判定为【知识盲区/无思路】，跳过所有的指责，直接输出该题的解题破局点（切入点）、思维导图提示和所需的关键公式，用温和鼓励的语气指导学生第一步该如何动笔。
   - **【阅卷铁律】：遇到数学计算题时，如果学生给出的最终结果分数没有化简为最简分数（例如写了 55/70 而不是 11/14），必须严格判定为错误（属于【规范/表达】错误），绝对不能因为数值等价就判定为完全掌握！**
6. **学生本题所得评分** ("score"):
   - 根据学生的解答步骤与提供的参考标准答案的比对程度，评估学生本题的最终得分，0 到 100 之间的整数。

请返回严格的 JSON 对象格式，不要包含 Markdown 的 \`\`\`json\`\`\` 标记，格式如下：
{
  "knowledgePoints": ["核心考点1", "核心考点2"],
  "examDirection": "考察方向...",
  "errorReason": "【计算/执行】计算粗心",
  "solution": "标准详细解答步骤内容...",
  "score": 85,
  "errorAnalysis": "【关键错误定位】：公式错用\\n\\n你写的是：\\n> 1+1=3\\n\\n❌ 错在哪？\\n- 应该计算加法：1+1=2 —— **这才是正确结果！**\\n- -> 你误把加法算成了其他数值！"
}
`;

    const systemPrompt = `你是一个严谨的 AI 智能名师批改助手。你的输出格式有且只有一种：一个合法的 JSON 对象（以 { 开头，以 } 结尾）。
你必须遵守以下铁律：
1. 你的整个回复内容只能是纯 JSON 文本，不得包含任何 Markdown 标记（如 \`\`\`json\`\`\`）、解释文字或其他非 JSON 内容。
2. 确保 JSON 的格式、逗号、双引号完全正确，以便程序能直接解析。`;

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
        temperature: 0.2
      },
      systemPrompt,
      thinkingMode: thinkingMode || 'disabled'
    });

    const text = response.text;
    if (!text) throw new Error("Empty response from AI");

    let resultObj = null;
    try {
      const parsedText = extractJsonString(text);
      if (!parsedText) throw new Error("No JSON found in response");
      resultObj = JSON.parse(sanitizeJsonString(parsedText));
    } catch (e) {
      console.warn("Failed to parse AI diagnosis response as JSON. Falling back to default format.", e);
      resultObj = {
        knowledgePoints: ["需手动分析"],
        examDirection: "未提取",
        errorReason: "【逻辑/建模】无法建立模型",
        solution: text,
        score: 0,
        errorAnalysis: "识别异常，请手动分析",
        errorDiagnosis: []
      };
    }
    res.json(resultObj);

  } catch (error: any) {
    console.error("AI Diagnose Error:", error);
    res.status(500).json({ error: error.message || "Failed to diagnose question" });
  }
};

// 4. 生成单题相似推荐题
export const similar = async (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const user = db.prepare("SELECT role FROM users WHERE username = ?").get(req.userId) as { role: string } | undefined;
    const allowStudentAi = getSetting("ALLOW_STUDENT_AI", "true") === "true";
    if (!user || (user.role === 'student' && !allowStudentAi)) {
      return res.status(403).json({ error: "权限不足，学生角色无法生成同类题" });
    }

    const { originalText, subject, knowledgePoints, count, grade, variantMode } = req.body;
    const numQuestions = Math.min(3, Math.max(1, count || 1));

    const modeInstruction = variantMode === '条件升级'
      ? "【条件升级模式】：在原考点基础上增加隐蔽条件，或者将直接已知条件转为需要通过其他定理或计算先求出的间接条件，整体难度提升一星，但不要超纲。"
      : variantMode === '逆向陷阱'
      ? "【逆向陷阱模式】：强制要求采用逆向思维出题（例如给出原题的结果，要求反推原题的某个初始条件）；或者在题目中设置该知识点常见的易错陷阱（如定义域陷阱、单位陷阱、隐含的分类讨论），重点考察学生是否真正理解，而非死记硬背套公式。"
      : "【同考点换壳模式】：保持原始难度和解题路径，仅修改具体的数值、已知条件的描述方式或情境背景，使题目成为一道全新的换壳题。";

    const prompt = `
你是一位经验丰富的高中数学/物理/化学名师。请根据以下原题信息，出 ${numQuestions} 道【相似度约80%】的同类练习题。

【原题信息】
- 学科: ${subject}
- 题目内容: ${originalText}
- 核心知识点: ${knowledgePoints?.join(', ')}

【命题要求】
1. 核心知识点与原题完全相同。
2. 题型、核心公式类型尽量与原题保持一致（除非变式模式要求提升难度或逆向推理）。
3. ${modeInstruction}
4. 【极度重要 - 逆向推导命题法】：为了保证计算结果是干净的有限小数或整数，涉及圆柱、圆锥体积计算时，你必须先在后台预设好合理的半径 r 和高 h，且**强制规定高 h 必须是 3 的倍数**（如 3, 6, 9），以消除圆锥公式中 1/3 导致的无限循环小数。算好题干需要的表面积等数值后，再输出题目。
5. 知识点/图形/公式均不超出原题所述学段水平。
6. 数学公式必须用标准 $ 或 $$ 包围。**注意：JSON 字符串中的所有 LaTeX 反斜杠必须双写转义（例如 \\\\pi, \\\\frac, \\\\text），否则会导致 JSON 解析失败！**
7. 【极度重要】：保持与原题完全一致的年级和学段级别（例如原题如果是小学六年级，生成的同类题也必须是小学六年级水平；原题如果是高一，生成的题也必须是高一水平。若指定了年级为：${grade || '自动识别原题年级'}，请严格按照该年级设计，绝对不能超纲或降纲）。
8. 【数量要求】：你必须生成且只能生成正好 ${numQuestions} 道题目。

【几何图形数据规范（必须填写 geometry 字段）】
根据题目类型填写 geometry.type：

A) 格点/网格类（题干含"格点"/"网格"/"方格"）: type="grid", gridSize=网格大小
   shapes 坐标: (0,0) 在左下角，Y轴向上，以格点为单位。

B) 坐标系类（题干给出如 A(-4,-1) 等具体坐标）: type="coordinate"
   xRange=[x最小-1, x最大+1], yRange=[y最小-1, y最大+1]
   shapes 坐标直接使用题目中的数学坐标值。

C) 平面几何类（有三角形/圆/四边形等，但无坐标数值）: type="plane"
   shapes 坐标用 0-100 比例值，(0,0) 在左下角，Y轴向上。

D) 立体几何类（有圆柱/圆锥/球/长方体等三维立体图形）: type="solid_3d"
   使用 solids 数组（shapes 填 []），SVG坐标左上为(0,0)，x向右，y向下，画布800×320。
   【极其重要 - 布局与嵌套】：
   - 独立的图形（分别代表图1、图2等）必须使用不同的 cx 坐标水平隔开，绝对不能重叠！
   - **例外（极度重要）**：如果题意是“将圆柱削成一个最大的圆锥”（如图3），你**必须**在同一个 cx 坐标处，同时放一个 'fill:"none"' 的圆柱和一个圆锥，让它们完全重叠，以此完美还原“圆锥在圆柱内部”的几何透视关系！
   圆柱: {"type":"cylinder","cx":150,"cy":60,"rx":60,"ry":20,"h":140,"fill":"#dbeafe","stroke":"#374151","cuts":[]}
     cx/cy:顶部椭圆圆心，rx:水平半轴，ry:垂直半轴，h:高度。
     【极其重要 - 关于圆柱的切割 cuts】：
     - 若为【横向水平切割】（截成n段），切 n-1 刀，增加 2(n-1) 个底面。cuts 填入向下偏移的像素值列表，如 [40, 80, 120]。**【防错警告】：如果横切成 n 段，你的 cuts 数组必须严格包含 n-1 个数值元素，绝不能少切！**
     - 若为【纵向竖直切割】（沿直径切开），切 n 刀成 2n 块，增加 2n 个长方形截面。
     - 【视觉排版要求】：对于纵切，若切成 2n 块（切 n 刀），你**必须在 cuts 中填入 n 个不同 angle 的 vertical 对象**（例如切 4 块填 2 个对象如 {"type":"vertical","angle":0.78} 和 {"type":"vertical","angle":2.35}），系统会自动渲染出完美的 3D 交叉切面！**注意：不要使用 0 和 1.57，它们会与圆柱外轮廓线重合导致图形隐身！**
     - 【数学逻辑极度警告！！！】：在改变题目数字时，**必须保持原题的切割方式和顺序**！如果原题图1是纵切（偶数块），变式题图1也必须是纵切。**【推荐约束】：为了图形美观及符合考纲，纵切建议优先出“切成2块（两半）”或“交叉切成4块”。**如果切多块，题干必须表述为“过底面中心交叉纵切成 x 等份”。如果原题图2是横切，变式题图2也必须是横切（块数任意）。**绝对不允许写出“沿直径纵切成3块”这种违背几何常识的荒谬题目！**
   圆锥: {"type":"cone","cx":150,"cy":230,"rx":70,"ry":23,"h":160,"fill":"#dcfce7","stroke":"#374151"}
     cx/cy:底面椭圆圆心(底面在下)，h:锥高(向上)
   球体: {"type":"sphere","cx":150,"cy":160,"r":80,"fill":"#fef9c3","stroke":"#374151"}
   长方体: {"type":"cuboid","lx":60,"ty":80,"w":120,"h":100,"d":60,"fill":"#e0f2fe","stroke":"#374151"}
   文字标签: {"type":"label_3d","text":"r","x":220,"y":250,"color":"#1e293b"}
     【注意】：文字标签的 y 坐标必须放在图形正下方，绝对不要和图形的底边重合！例如，若圆柱 cy=60, h=140, ry=20，其底边 y=220，那么文字的 y 必须填 250！
   辅助虚线: {"type":"dashed_line_3d","from":[100,150],"to":[200,150],"stroke":"#374151"}

E) 纯计算/代数题，无需图形: type="none", shapes=[]

shapes 元素格式（仅 A/B/C 类使用）：
polygon: {"type":"polygon","points":[[x1,y1],[x2,y2],...],"fill":"#eff6ff","stroke":"#374151"}
line:    {"type":"line","from":[x1,y1],"to":[x2,y2],"stroke":"#374151","dashed":false}
circle:  {"type":"circle","cx":x,"cy":y,"r":radius,"fill":"none","stroke":"#374151"}
point:   {"type":"point","x":x,"y":y,"r":3,"fill":"#374151"}
label:   {"type":"label","text":"A","x":x,"y":y,"color":"#1e293b","anchor":"middle"}

${numQuestions === 1 ? `
请严格按以下单个 JSON 对象格式返回，不要包含 Markdown 代码块标记，不要包含其他任何解释性文字：
{
  "questionText": "新题目的完整文字（纯文字+LaTeX公式，不包含任何SVG代码）",
  "solution": "详细解题步骤（含LaTeX公式，每步用1. 2. 3.标注）",
  "geometry": {
    "type": "coordinate",
    "xRange": [-6, 2],
    "yRange": [-4, 2],
    "shapes": [
      {"type":"polygon","points":[[-4,-1],[-3,-3],[-1,-2]],"fill":"#eff6ff","stroke":"#374151"},
      {"type":"point","x":-4,"y":-1,"r":3,"fill":"#374151"},
      {"type":"label","text":"A","x":-4.4,"y":-0.7,"color":"#1e293b","anchor":"middle"}
    ],
    "solids": []
  }
}
` : `
请严格按以下 JSON 数组格式返回，包含 ${numQuestions} 个元素对象，不要包含 Markdown 代码块标记，不要包含其他任何解释性文字：
[
  {
    "questionText": "第1道新题目的完整文字...",
    "solution": "第1道新题的详细解题步骤...",
    "geometry": { ... }
  },
  ...
]
`}
`;

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
        temperature: 0.7
      }
    });

    const text = response.text;
    if (!text) throw new Error("Empty response from AI");

    let data: any;
    try {
      const extracted = extractJsonString(text);
      data = JSON.parse(sanitizeJsonString(extracted));
    } catch {
      let fallback = text.trim();
      if (fallback.startsWith('```')) {
        fallback = fallback.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/,'').trim();
      }
      data = JSON.parse(fallback);
    }
    res.json(data);

  } catch (error: any) {
    console.error("Similar question Error:", error);
    res.status(500).json({ error: error.message });
  }
};

// 5. 批量生成试卷题目变式
export const paperVariants = async (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const user = db.prepare("SELECT role FROM users WHERE username = ?").get(req.userId) as { role: string } | undefined;
    const allowStudentAi = getSetting("ALLOW_STUDENT_AI", "true") === "true";
    if (!user || (user.role === 'student' && !allowStudentAi)) {
      return res.status(403).json({ error: "权限不足，学生角色无法生成试卷变式" });
    }

    const { questions } = req.body;
    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ error: "组卷题目数据不能为空" });
    }

    const prompt = `
请作为金牌备考辅导名师。输入是一个错题列表 JSON。
请你为输入的每一道错题，分别精心命制一道【1:1 相似变式强化练习题】。

命题要求：
1. 考察的核心知识点和难度水平必须与原题完全保持一致。
2. 改变题目的情境背景、具体数值或者提问角度，确保题目是全新的。
3. 【极度重要 - 逆向推导命题法】：为了保证计算结果是干净的有限小数或整数，涉及圆柱、圆锥体积计算时，你必须先在后台预设好合理的半径 r 和高 h，且**强制规定高 h 必须是 3 的倍数**（如 3, 6, 9），以消除圆锥公式中 1/3 导致的无限循环小数。算好题干需要的表面积等数值后，再输出题目。
4. 对变式题目提供标准、严谨、逻辑清晰的详细名师解题步骤。
5. 数学公式必须用标准 $ 或 $$ 包围。**注意：JSON 字符串中的所有 LaTeX 反斜杠必须双写转义（例如 \\\\pi, \\\\frac, \\\\text），否则会导致 JSON 解析失败！**

${GEOMETRY_PROMPT_TEMPLATE}

输入错题列表：
${JSON.stringify(questions.map((q: any, idx: number) => ({ index: idx + 1, text: q.originalText, subject: q.subject, knowledgePoints: q.knowledgePoints })))}

请务必返回以下格式的严格 JSON 数组，不要包含任何 Markdown 格式的 \`\`\`json 标记：
[
  {
    "index": 1,
    "subject": "题目科目",
    "originalText": "原题题干文本",
    "variantText": "新题目的完整文字（纯文字+LaTeX公式，不包含任何SVG代码）",
    "solution": "详细解题步骤（含LaTeX公式）",
    "geometry": {
      "type": "coordinate",
      "xRange": [-6, 2],
      "yRange": [-4, 2],
      "shapes": [],
      "solids": []
    }
  }
]
`;
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
        temperature: 0.3
      }
    });

    const text = response.text;
    if (!text) throw new Error("Empty response from AI");
    
    console.log("================ AI Variants Raw Output ================");
    console.log(text);
    console.log("========================================================");

    let parsedText = text.trim();
    const jsonMatch = parsedText.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (jsonMatch) {
      parsedText = jsonMatch[0];
    } else {
      if (parsedText.startsWith('```json')) {
        parsedText = parsedText.replace(/```json/i, '').replace(/```/g, '').trim();
      }
    }

    const data = JSON.parse(parsedText);
    res.json(data);

  } catch (error: any) {
    console.error("Batch Paper Variants Error:", error);
    res.status(500).json({ error: error.message || "批量生成变式失败" });
  }
};

// 6. 自检纠错重新生成单题变式
export const paperVariantRegenerate = async (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const user = db.prepare("SELECT role FROM users WHERE username = ?").get(req.userId) as { role: string } | undefined;
    const allowStudentAi = getSetting("ALLOW_STUDENT_AI", "true") === "true";
    if (!user || (user.role === 'student' && !allowStudentAi)) {
      return res.status(403).json({ error: "权限不足，学生角色无法生成变式" });
    }

    const { originalQuestion, currentVariant } = req.body;
    if (!originalQuestion || !currentVariant) {
      return res.status(400).json({ error: "缺失原题或当前变式数据" });
    }

    const prompt = `
你是一位金牌备考辅导名师，也是一位严谨的逻辑审查专家。
用户对之前为错题生成的一道【变式强化题】不满意，认为其存在逻辑瑕疵（例如：题干写了切4块，但几何图形 cuts 数组漏了切割刀数导致图文不符；或者预设数据没法整除导致计算结果无限小数等）。

请你作为智能自检系统，审视原题与当前瑕疵题的关联，**自行寻找可能存在的瑕疵并纠正**，然后重新为该原题命制一道完美的【1:1 相似变式强化题】。

【原题信息】：
题干文本：${originalQuestion.text || originalQuestion.originalText}
学科：${originalQuestion.subject}

【当前有瑕疵的变式题干参考】：
${currentVariant.text}

请完全抛弃旧的有瑕疵的数据，严格按照以下命题与几何规则，重新输出一个完美无暇的单一 JSON 对象（不要输出数组！）。

命题要求：
1. 考察的核心知识点和难度水平必须与原题完全保持一致。
2. 改变题目的情境背景、具体数值或者提问角度，确保题目是全新的。
3. 【极度重要 - 逆向推导命题法】：为了保证计算结果是干净的有限小数或整数，涉及圆柱、圆锥体积计算时，你必须先在后台预设好合理的半径 r 和高 h，且**强制规定高 h 必须是 3 的倍数**（如 3, 6, 9），以消除圆锥公式中 1/3 导致的无限循环小数。算好题干需要的表面积等数值后，再输出题目。
4. 对变式题目提供标准、严谨、逻辑清晰的详细名师解题步骤。
5. 数学公式必须用标准 $ 或 $$ 包围。**注意：JSON 字符串中的所有 LaTeX 反斜杠必须双写转义（例如 \\\\pi, \\\\frac, \\\\text），否则会导致 JSON 解析失败！**

${GEOMETRY_PROMPT_TEMPLATE}

请务必返回以下格式的严格 JSON 对象（一个对象，不是数组！），不要包含任何 Markdown 格式的 \`\`\`json 标记：
{
  "subject": "题目科目",
  "variantText": "新题目的完整文字（纯文字+LaTeX公式，不包含任何SVG代码）",
  "solution": "详细解题步骤（含LaTeX公式）",
  "geometry": {
    "type": "coordinate",
    "xRange": [-6, 2],
    "yRange": [-4, 2],
    "shapes": [],
    "solids": []
  }
}
`;

    const response = await generateContentWithFallback({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { temperature: 0.4 }
    });

    const text = response.text;
    if (!text) throw new Error("Empty response from AI");
    
    console.log("================ AI Variant Regenerate Output ================");
    console.log(text);
    console.log("========================================================");

    let parsedText = text.trim();
    const jsonMatch = parsedText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsedText = jsonMatch[0];
    } else {
      if (parsedText.startsWith('```json')) {
        parsedText = parsedText.replace(/```json/i, '').replace(/```/g, '').trim();
      }
    }

    const data = JSON.parse(parsedText);
    res.json(data);

  } catch (error: any) {
    console.error("Regenerate Variant Error:", error);
    res.status(500).json({ error: error.message || "重新生成变式失败" });
  }
};


// 7. 全自动编排管线 (SSE 流式推送)
export const processAllStream = async (req: AuthenticatedRequest, res: express.Response) => {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendEvent = (event: string, data: any) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const user = db.prepare("SELECT role FROM users WHERE username = ?").get(req.userId) as { role: string } | undefined;
    const allowStudentAi = getSetting("ALLOW_STUDENT_AI", "true") === "true";
    if (!user || (user.role === 'student' && !allowStudentAi)) {
      sendEvent('error', { message: "权限不足，学生角色无法使用 AI 解析功能" });
      res.end();
      return;
    }

    let { imageBase64, mimeType, answerImageBase64, answerMimeType, answerText, mode, notebookId, grade, thinkingMode } = req.body;
    if (!imageBase64) {
      sendEvent('error', { message: "Missing imageBase64" });
      res.end();
      return;
    }

    const isSingle = mode === 'single';

    // ========== 阶段 1: 提取 (Extract) ==========
    sendEvent('status', { phase: 'extract', status: 'start', message: '正在提取题目与作答...' });
    
    let extractPrompt = ``;
    if (isSingle) {
      extractPrompt += `
识别我提供的图片中的题目文本、配图信息及手写内容。
【重要指令】：当前为单题提取模式。请不要将图片切分为多道题，只将其中的最核心的一道题完整提取出来，作为一个整体题目返回。
我提供了一张【学生试卷/作业图片】（第一张图）。
`;
    } else {
      extractPrompt += `
识别我提供的图片中的所有独立题目。
【大题合并铁律】：对于包含 (1)(2)(3) 等多个小问的综合题、阅读理解题、表格题，绝对禁止将小问拆分为独立题目！你必须将公共题干与所有小问作为一个不可分割的整体，完整保存在一个题目的 originalText 中。
我提供了一张【学生试卷/作业图片】（第一张图）。
`;
    }
    if (answerImageBase64) {
      extractPrompt += `另外，我提供了一张对应的【标准答案参考图片】（第二张图）。请务必对照两张图，将同一道题的题干、学生手写作答以及参考的标准答案进行一一匹配提取。\\n`;
    }
    if (answerText) {
      extractPrompt += `另外，我提供了一段参考答案文本如下：\\n【完整参考答案文本开始】\\n${answerText}\\n【完整参考答案文本结束】\\n请结合此参考文本，将其中的各题答案切分并匹配到对应题目的标准答案字段中。\\n`;
    }
    extractPrompt += `
【具体输出字段要求】：
请严格以 JSON 数组的形式返回（即使只有一题也要用数组包围），数组中的每个对象代表一道题，包含以下字段：
- subject: [学科名称，如数学/物理/化学等]
- boundingBox: [题目所在区域的矩形框坐标，格式为 {"x": 10, "y": 20, "w": 400, "h": 200}]
- originalText: [本题的高精度完整题干印刷体文字，包含题号。绝对不能写“略”]
- studentAnswer: [本题区域内学生手写作答出的答案或步骤，若无则留空。]
- standardAnswer: [根据参考资料提取的本题标准答案，若无则留空]
- visualContext: [如果你在题目中看到了几何图形、函数图像或实物配图，请在此字段用纯文本极其详细地描述图形的拓扑结构、形状特征、嵌套关系和标注字母。如果没有图，返回空字符串。]

【深度校准与格式规约（极度重要）】：
1. **语义级防错**：如果在数学题中识别出汉字“元”、“兀”等，且上下文是关于圆、面积、体积等几何计算，必须将其纠正为数学符号“\\pi”。理清易混淆的“t”与“+”。
2. **表格原生化**：若题目包含表格，绝对禁止使用 Markdown 的 | 语法！必须使用原生的 HTML 标签（<table>, <tr>, <td>）重建表格，并在表格内正常使用 $ 包围 LaTeX 公式。
3. **公式规范**：公式必须用标准的 $ 或 $$ 包围输出为 LaTeX 格式。注意：JSON 字符串中的所有 LaTeX 反斜杠必须双写转义（例如 \\pi, \\frac），否则会导致 JSON 解析失败！
4. **视觉抗干扰指令**：图片中可能存在老师使用红笔/其他颜色笔打的勾、叉、减分（如-2）或批改写下的正确答案。你必须完全忽略所有的批改痕迹，**仅提取学生原本的原始手写作答内容**！
`;

    const extractSystemPrompt = `你是一个只输出结构化 JSON 的 OCR 助手。你的整个回复必须是一个合法的 JSON 数组，不要包含 Markdown 代码块标记或额外废话。`;

    const extractResponse = await generateContentWithFallback({
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { data: imageBase64.split(',')[1] || imageBase64, mimeType: mimeType || 'image/jpeg' } },
            ...(answerImageBase64 ? [{ inlineData: { data: answerImageBase64.split(',')[1] || answerImageBase64, mimeType: answerMimeType || 'image/jpeg' } }] : []),
            { text: extractPrompt }
          ]
        }
      ],
      config: { temperature: 0.1 },
      model: getSetting("AI_VISION_MODEL", process.env.AI_VISION_MODEL || 'glm-5v-turbo'),
      systemPrompt: extractSystemPrompt
    });

    let extractResult: any[] = [];
    try {
      const extractedStr = extractJsonString(extractResponse.text || '');
      const parsedData = JSON.parse(sanitizeJsonString(extractedStr));
      const items = Array.isArray(parsedData) ? parsedData : [parsedData];
      for (const item of items) {
         if (!item.originalText && !item.studentAnswer) continue;
         extractResult.push({
           subject: item.subject || "数学",
           originalText: item.originalText || "",
           studentAnswer: item.studentAnswer || "",
           standardAnswer: item.standardAnswer || "",
           visualContext: item.visualContext || "",
           boundingBox: item.boundingBox || { x: 0, y: 0, w: 0, h: 0 }
         });
      }
    } catch (e) {
       console.error("Failed to parse extract JSON", e);
       extractResult.push({
         subject: "数学", originalText: extractResponse.text, studentAnswer: "", standardAnswer: "", visualContext: "", boundingBox: {x:0, y:0, w:0, h:0}
       });
    }

    const textModel = getSetting("AI_MODEL", process.env.AI_MODEL || 'glm-5.1');
    if (extractResult.length > 0) {
      for (let i = 0; i < extractResult.length; i++) {
        const q = extractResult[i];
        if (q.studentAnswer || q.originalText) {
          try {
            const correctPrompt = `作为一名严谨的数学教师校对员。OCR 识别中可能因笔画粘连导致数字或字母识别错误（例如 0.6 被误认成 0.5、0错认成O、1错认成l、+被误认成4等），或将圆周率“\\pi”误认成汉字“元”、“兀”。请结合上下文，在不改变原意的前提下，校正因视觉粘连导致的明显 OCR 字符错误。
【图形上下文】：${q.visualContext || '无'}
【需要校对的题干】：${q.originalText || '无'}
【需要校对的手写作答】：${q.studentAnswer || '无'}
【参考答案】：${q.standardAnswer || '无'}
请严格以 JSON 格式返回校正后的结果，包含 "correctedOriginalText" 和 "correctedStudentAnswer" 两个字段，不要包含任何额外废话。如果某项完全无需修正，请直接原样返回。`;
            const correctionRes = await generateContentWithFallback({
              contents: [{ role: 'user', parts: [{ text: correctPrompt }] }],
              config: { temperature: 0.1 },
              model: textModel,
              systemPrompt: "你是一个纯文本校对助手。只返回包含 correctedOriginalText 和 correctedStudentAnswer 的合法 JSON 对象。"
            });
            const dJsonStr = extractJsonString(correctionRes.text || '');
            const parsed = JSON.parse(sanitizeJsonString(dJsonStr));
            
            if (parsed.correctedOriginalText && q.originalText && parsed.correctedOriginalText !== '无' && parsed.correctedOriginalText !== '空') {
              if (stringSimilarity(q.originalText, parsed.correctedOriginalText) > 0.85) {
                q.originalText = parsed.correctedOriginalText;
              }
            }
            if (parsed.correctedStudentAnswer && q.studentAnswer && parsed.correctedStudentAnswer !== '无' && parsed.correctedStudentAnswer !== '空') {
              if (stringSimilarity(q.studentAnswer, parsed.correctedStudentAnswer) > 0.85) {
                q.studentAnswer = parsed.correctedStudentAnswer;
              }
            }
          } catch (e) {
            console.error("双向校验报错（可忽略）", e);
          }
        }
      }
    }

    sendEvent('status', { phase: 'extract', status: 'done', data: extractResult });

    // ========== 阶段 2: 诊断与变式 ==========
    if (!grade && notebookId) {
      try {
        const nb = db.prepare("SELECT grade FROM notebooks WHERE id = ?").get(notebookId) as { grade: string | null } | undefined;
        if (nb && nb.grade) grade = nb.grade;
      } catch (dbErr) {}
    }
    const gradeConstraint = grade 
      ? `本道题所属年级为：${grade}。在给出标准解析和分析错误原因时，必须严格保持与这道题目的实际年级和学段级别完全一致，绝对不能超纲。`
      : `请智能自动识别这道题目所属的实际年级。在给出标准解析和分析错误原因时，必须严格保持完全一致，绝对不能超纲。`;

    const finalResults = [];
    
    for (let i = 0; i < extractResult.length; i++) {
      const q = extractResult[i];
      
      // ---------- 诊断 ----------
      sendEvent('status', { phase: 'diagnose', index: i, status: 'start', message: `正在诊断第 ${i+1} 题...` });
      
      const diagPrompt = `
你是一个人工智能名师。请根据已录入和校对好的错题信息，进行深度的解答和批改诊断：
【题目信息】
- 学科: ${q.subject || '未指定'}
- 题干纯文本: ${q.originalText}
- 题干配图/几何拓扑结构描述: ${q.visualContext || '无图'}
${q.standardAnswer ? `- 老师提供的参考标准答案: ${q.standardAnswer}\\n` : ''}
- 学生作答内容: ${q.studentAnswer || '（无学生作答）'}
- 难度与年级限制: ${gradeConstraint}

【任务要求】：
1. **核心考点**: 分析该题考查的核心知识点，最多 3 个，存入数组。
2. **考察方向**: 简明扼要地概括题目的主要测试意图。
3. **错因标签**: 严格从四个阶段挑选 1 个标签（【概念/审题】、【逻辑/建模】、【计算/执行】、【规范/表达】）。
   【极度重要】：如果“学生作答内容”为空，绝对禁止强行挑选上述错误标签！必须强制输出标签："【知识盲区/无思路】完全留白"。
4. **标准解析**: 给出名师标准解题步骤。公式用 $。
5. **错误原因分析**:
   - 如果 "学生作答内容" 不为空，请遵循三段式结构输出：
     【关键错误定位】：一句话指出错误。\\n你写的是：\\n> [原样复现]\\n❌ 错在哪？\\n- 第一步：[正确的逻辑] —— **这才是正确结果！**\\n- -> 你误把...当成了...！
   - 如果为空，请判定为【知识盲区/无思路】，跳过指责，直接输出解题破局点、思维导图提示和关键公式，温和鼓励学生。
   - **【阅卷铁律】：如果学生结果为未化简的分数（如 55/70），必须严格判定为错误，绝对不能因为数值等价判定为全对！**
6. **学生本题所得评分**: 0 到 100 整数。

返回 JSON 对象格式，不含 markdown 代码块。
`;
      let diagnoseResult = null;
      try {
        const diagRes = await generateContentWithFallback({
          contents: [{ role: 'user', parts: [{ text: diagPrompt }] }],
          config: { temperature: 0.2 },
          systemPrompt: "你是一个严谨的 AI 智能名师批改助手。整个回复内容只能是纯 JSON 文本。",
          thinkingMode: thinkingMode || 'disabled'
        });
        const dJsonStr = extractJsonString(diagRes.text || '');
        diagnoseResult = JSON.parse(sanitizeJsonString(dJsonStr));
      } catch (e) {
        diagnoseResult = { knowledgePoints: ["手动分析"], examDirection: "", errorReason: "识别异常", solution: "解析失败", score: 0, errorAnalysis: "无法分析" };
      }
      sendEvent('status', { phase: 'diagnose', index: i, status: 'done', data: diagnoseResult });

      // ---------- 相似题 ----------
      sendEvent('status', { phase: 'similar', index: i, status: 'start', message: `正在生成第 ${i+1} 题的相似题...` });
      
      const simPrompt = `
你是一个金牌备考辅导名师。你需要为以下这道错题生成 1 道相似的变式强化题。
【原题信息】
- 学科: ${q.subject || '未指定'}
- 年级限制: ${grade || '自动识别'}
- 题目内容: ${q.originalText || ''}
- 核心知识点: ${diagnoseResult?.knowledgePoints?.join(', ') || ''}

【命题要求】
1. 核心知识点与原题完全相同。
2. 题型、步骤数量、公式类型与原题保持一致。
3. 修改具体数值/已知条件/情境背景，使题目全新。
4. 不超出要求范围。公式必须用标准 $ 或 $$ 包围。

${GEOMETRY_PROMPT_TEMPLATE}

请返回以下 JSON 格式：
{
  "questionText": "新题目的完整文字",
  "solution": "详细解题步骤",
  "geometry": { "type": "none", "shapes": [] }
}
`;
      let similarResult = null;
      try {
        const simRes = await generateContentWithFallback({
          contents: [{ role: 'user', parts: [{ text: simPrompt }] }],
          config: { temperature: 0.7 }
        });
        const sJsonStr = extractJsonString(simRes.text || '');
        similarResult = JSON.parse(sanitizeJsonString(sJsonStr));
        similarResult = Array.isArray(similarResult) ? similarResult[0] : similarResult;
      } catch (e) {
        similarResult = { questionText: "生成失败", solution: "", geometry: { type: "none", shapes: [] } };
      }
      sendEvent('status', { phase: 'similar', index: i, status: 'done', data: similarResult });

      finalResults.push({
        extract: q,
        diagnose: diagnoseResult,
        similar: similarResult
      });
    }

    sendEvent('complete', { message: '全部处理完成', results: finalResults });
    res.end();
  } catch (error: any) {
    console.error("AI Process All Error:", error);
    sendEvent('error', { message: error.message || "管线执行失败" });
    res.end();
  }
};
