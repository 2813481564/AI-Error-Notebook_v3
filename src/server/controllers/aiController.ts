import express from "express";
import { db } from "../config/db";
import { AuthenticatedRequest } from "../middleware/auth";
import {
  generateContentWithFallback,
  extractJsonString,
  sanitizeJsonString
} from "../services/aiService";
import { getSetting } from "../services/settingService";

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

【几何图形数据规范（必须填写 geometry 字段）】
根据题目类型填写 geometry.type：

A) 格点/网格类（题干含"格点"/"网格"/"方格"）: type="grid", gridSize=网格大小
   shapes 坐标: (0,0) 在左下角，Y轴向上，以格点为单位。

B) 坐标系类（题干给出如 A(-4,-1) 等具体坐标）: type="coordinate"
   xRange=[x最小-1, x最大+1], yRange=[y最小-1, y最大+1]
   shapes 坐标直接使用题目中的数学坐标值。

C) 平面几何类（有三角形/圆/四边形等，但无坐标数值）: type="plane"
   shapes 坐标用 0-100 比例值，(0,0) 在左下角，Y轴向上，合理分布在画面中。

D) 纯计算/代数题，无需图形: type="none", shapes=[]

shapes 元素格式：
polygon: {"type":"polygon","points":[[x1,y1],[x2,y2],...],"fill":"#eff6ff","stroke":"#374151"}
line:    {"type":"line","from":[x1,y1],"to":[x2,y2],"stroke":"#374151","dashed":false}
circle:  {"type":"circle","cx":x,"cy":y,"r":radius,"fill":"none","stroke":"#374151"}
point:   {"type":"point","x":x,"y":y,"r":3,"fill":"#374151"}
label:   {"type":"label","text":"A","x":x,"y":y,"color":"#1e293b","anchor":"middle"}

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
识别我提供的图片中的题目文本及手写内容。
【重要指令】：当前为单题提取模式。请不要将图片切分为多道题，只将其中的最核心的一道题完整提取出来，作为一个整体题目返回。
我提供了一张【学生试卷/作业图片】（第一张图）。
`;
    } else {
      prompt += `
识别我提供的图片中的所有独立大题或子题（如"20."、"21."、"22."等）。
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
对于每一道独立的题目，请严格按照以下文本格式输出（不同题目之间用 ===题目分割=== 进行隔开，不要包含 Markdown 代码块标记如 \`\`\`）：

===题目分割===
学科: [学科名称，如数学/物理/化学等]
题干: [本题的高精度完整题干印刷体文字，包含题号，绝对不能写“略”]
学生作答: [本题区域内学生手写作答出的答案或步骤，若无则留空]
标准答案: [根据上传的【标准答案参考图片】或【参考答案文本】匹配得到的本题标准参考答案，包含推导过程和最终正确答案，若无则留空]

【注意事项】：
1. 不要输出任何解释性前言或后缀（如“以下是识别内容：”），直接以第一个 ===题目分割=== 开始。
2. 公式必须用标准的 $ 或 $$ 包围输出为 LaTeX 格式。
`;

    const systemPrompt = `你是一个只输出结构化纯文本的 OCR 助手。你的整个回复必须严格按照 ===题目分割=== 的格式输出各字段，不要包含 Markdown 代码块标记（如 \`\`\`）或任何额外的多余废话。`;

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

    text = response.text || '';
    if (!text) throw new Error("Empty response from AI");

    const result: any[] = [];
    const parts = text.split(/===+题目分割===+/);
    for (const part of parts) {
      const trimmedPart = part.trim();
      if (!trimmedPart) continue;

      const subjectMatch = trimmedPart.match(/学科:\s*(.+)/);
      const subject = subjectMatch ? subjectMatch[1].trim() : "数学";

      const qIndex = trimmedPart.indexOf("题干:");
      const aIndex = trimmedPart.indexOf("学生作答:");
      const sIndex = trimmedPart.indexOf("标准答案:");

      let originalText = "";
      let studentAnswer = "";
      let standardAnswer = "";

      if (qIndex !== -1) {
        if (aIndex !== -1) {
          originalText = trimmedPart.substring(qIndex + 3, aIndex).trim();
          if (sIndex !== -1) {
            studentAnswer = trimmedPart.substring(aIndex + 5, sIndex).trim();
            standardAnswer = trimmedPart.substring(sIndex + 5).trim();
          } else {
            studentAnswer = trimmedPart.substring(aIndex + 5).trim();
          }
        } else {
          if (sIndex !== -1) {
            originalText = trimmedPart.substring(qIndex + 3, sIndex).trim();
            standardAnswer = trimmedPart.substring(sIndex + 5).trim();
          } else {
            originalText = trimmedPart.substring(qIndex + 3).trim();
          }
        }
      } else {
        originalText = trimmedPart.replace(/学科:\s*.+/, "").trim();
      }

      if (originalText) {
        result.push({
          subject: subject.substring(0, 10),
          originalText,
          studentAnswer,
          standardAnswer
        });
      }
    }

    if (result.length === 0) {
      result.push({
        subject: "数学",
        originalText: text,
        studentAnswer: "",
        standardAnswer: ""
      });
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

    const { subject, originalText, studentAnswer, standardAnswer, thinkingMode } = req.body;
    if (!originalText) {
      return res.status(400).json({ error: "Missing originalText" });
    }

    let standardAnswerSection = '';
    if (standardAnswer) {
      standardAnswerSection = `- 老师提供的参考标准答案: ${standardAnswer}\n`;
    }
    const prompt = `
你是一个人工智能名师。请根据已录入和校对好的错题信息，进行深度的解答和批改诊断：

【题目信息】
- 学科: ${subject || '未指定'}
- 题干: ${originalText}
${standardAnswerSection}
- 学生作答内容: ${studentAnswer || '（无学生作答）'}

【任务要求】：
1. **核心考点** ("knowledgePoints"): 分析该题考查的核心知识点（例如：“平行线的判定”、“二次函数最值”等），最多列出 3 个，存入数组。
2. **标准解析** ("solution"): 给出该题的名师标准解题推导步骤。如果涉及数学公式，请用标准的 $ 或 $$ 符号包围以保证 LaTeX 完美渲染。
3. **学生作答步骤级诊断** ("errorDiagnosis"):
   - 如果 "学生作答内容" 为空，则 "errorDiagnosis" 必须返回空数组 []。
   - If "学生作答内容" has content, digitize it step-by-step (step number starting from 1). For each step:
     * "stepNumber": step sequence.
     * "stepContent": digitized content (wrapped in $).
     * "status": "correct", "incorrect" or "consequential_error".
     * "comment": comment description (empty for correct).
4. **学生本题所得评分** ("score"):
   - 根据学生的解答步骤与提供的【老师提供的参考标准答案】（如果提供了）的比对程度，评估学生本题的最终得分，只能是 0 到 100 之间的整数（如果学生完全未作答，或者 "学生作答内容" 缺失，则返回 0）。

请返回严格的 JSON 对象格式，不要包含 Markdown 的 \`\`\`json\`\`\` 标记，格式如下：
{
  "knowledgePoints": ["核心考点1", "核心考点2"],
  "solution": "标准详细解答步骤内容...",
  "score": 85,
  "errorDiagnosis": [
    {
      "stepNumber": 1,
      "stepContent": "步骤1内容",
      "status": "correct",
      "comment": ""
    }
  ]
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
        solution: text,
        score: 0,
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

    const { originalText, subject, knowledgePoints } = req.body;

    const prompt = `
你是一位经验丰富的高中数学/物理/化学名师。请根据以下原题信息，出一道【相似度约80%】的同类练习题。

【原题信息】
- 学科: ${subject}
- 题目内容: ${originalText}
- 核心知识点: ${knowledgePoints?.join(', ')}

【命题要求】
1. 核心知识点与原题完全相同。
2. 题型、步骤数量、公式类型与原题保持一致。
3. 修改具体数值/已知条件/情境背景，使题目全新（约20%差异）。
4. 知识点/图形/公式均不超出高中范围。
5. 数学公式必须用标准 $ 或 $$ 包围。

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
   使用 solids 数组（shapes 填 []），SVG坐标系左上为(0,0)，x向右，y向下，画布300×320。
   图形建议居中，控制在 x:30-270, y:20-290 范围内。

   solids 元素格式（请根据题意合理设置尺寸）：
   圆柱: {"type":"cylinder","cx":150,"cy":60,"rx":60,"ry":20,"h":140,"fill":"#dbeafe","stroke":"#374151","cuts":[]}
     - cx/cy: 顶部椭圆圆心，rx: 水平半轴(建议40-70)，ry: 垂直半轴(建议rx*0.3)
     - h: 圆柱高度(像素,向下)，cuts: 水平切割面偏移量列表(如[70]表示顶部向下70px处有切割面)
   圆锥: {"type":"cone","cx":150,"cy":230,"rx":70,"ry":23,"h":160,"fill":"#dcfce7","stroke":"#374151"}
     - cx/cy: 底面椭圆圆心(底面在下)，h: 锥高(像素,向上)
   球体: {"type":"sphere","cx":150,"cy":160,"r":80,"fill":"#fef9c3","stroke":"#374151"}
   长方体: {"type":"cuboid","lx":60,"ty":80,"w":120,"h":100,"d":60,"fill":"#e0f2fe","stroke":"#374151"}
     - lx/ty: 正面左上角，w: 正面宽，h: 正面高，d: 深度(斜向)
   文字标签: {"type":"label_3d","text":"r","x":220,"y":130,"color":"#1e293b"}
   辅助虚线: {"type":"dashed_line_3d","from":[100,150],"to":[200,150],"stroke":"#374151"}

E) 纯计算/代数题，无需图形: type="none", shapes=[]

shapes 元素格式（仅 A/B/C 类使用）：
polygon: {"type":"polygon","points":[[x1,y1],[x2,y2],...],"fill":"#eff6ff","stroke":"#374151"}
line:    {"type":"line","from":[x1,y1],"to":[x2,y2],"stroke":"#374151","dashed":false}
circle:  {"type":"circle","cx":x,"cy":y,"r":radius,"fill":"none","stroke":"#374151"}
point:   {"type":"point","x":x,"y":y,"r":3,"fill":"#374151"}
label:   {"type":"label","text":"A","x":x,"y":y,"color":"#1e293b","anchor":"middle"}

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
    ],
    "solids": []
  }
}

立体几何题示例（圆柱切割）：
{
  "questionText": "一个圆柱体...",
  "solution": "...",
  "geometry": {
    "type": "solid_3d",
    "shapes": [],
    "solids": [
      {"type":"cylinder","cx":150,"cy":60,"rx":60,"ry":20,"h":160,"fill":"#dbeafe","stroke":"#374151","cuts":[80]},
      {"type":"label_3d","text":"图1","x":150,"y":250,"color":"#374151"}
    ]
  }
}
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

【几何图形数据规范（仅当题目涉及几何图形时填写 geometry 字段）】
根据题目类型填写 geometry.type：
A) 格点/网格类（题干含"格点"/"网格"/"方格"）: type="grid", gridSize=网格大小
   shapes 坐标: (0,0) 在左下角，Y轴向上，以格点为单位。
B) 坐标系类（题干给出如 A(-4,-1) 等具体坐标）: type="coordinate"
   xRange=[x最小-1, x最大+1], yRange=[y最小-1, y最大+1]
   shapes 坐标直接使用题目中的数学坐标值。
C) 平面几何类（有三角形/圆/四边形等，但无坐标数值）: type="plane"
   shapes 坐标用 0-100 比例值，(0,0) 在左下角，Y轴向上。

shapes 元素格式：
polygon: {"type":"polygon","points":[[x1,y1],[x2,y2],...],"fill":"#eff6ff","stroke":"#374151"}
line:    {"type":"line","from":[x1,y1],"to":[x2,y2],"stroke":"#374151","dashed":false}
circle:  {"type":"circle","cx":x,"cy":y,"r":radius,"fill":"none","stroke":"#374151"}
point:   {"type":"point","x":x,"y":y,"r":3,"fill":"#374151"}
label:   {"type":"label","text":"A","x":x,"y":y,"color":"#1e293b","anchor":"middle"}

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
     - 【视觉排版要求】：对于纵切，若切成 2n 块（切 n 刀），你**必须在 cuts 中填入 n 个不同 angle 的 vertical 对象**（例如切 4 块填 2 个对象如 {"type":"vertical","angle":0.78} 和 {"type":"vertical","angle":2.35}），系统会自动渲染出完美的 3D 交叉切面（就像原题一样）！**注意：不要使用 0 和 1.57，它们会与圆柱外轮廓线重合导致图形隐身！**
     - 【数学逻辑极度警告！！！】：在改变题目数字时，**必须保持原题的切割方式和顺序**！如果原题图1是纵切（偶数块），变式题图1也必须是纵切。**【推荐约束】：为了图形美观及符合考纲，纵切建议优先出“切成2块（两半）”或“交叉切成4块”。**如果切多块，题干必须表述为“过底面中心交叉纵切成 x 等份”。如果原题图2是横切，变式题图2也必须是横切（块数任意）。**绝对不允许写出“沿直径纵切成3块”这种违背几何常识的荒谬题目！**
   圆锥: {"type":"cone","cx":150,"cy":230,"rx":70,"ry":23,"h":160,"fill":"#dcfce7","stroke":"#374151"}
     cx/cy:底面椭圆圆心(底面在下)，h:锥高(向上)
   球体: {"type":"sphere","cx":150,"cy":160,"r":80,"fill":"#fef9c3","stroke":"#374151"}
   长方体: {"type":"cuboid","lx":60,"ty":80,"w":120,"h":100,"d":60,"fill":"#e0f2fe","stroke":"#374151"}
   文字标签: {"type":"label_3d","text":"r","x":220,"y":250,"color":"#1e293b"}
     【注意】：文字标签的 y 坐标必须放在图形正下方，绝对不要和图形的底边重合！例如，若圆柱 cy=60, h=140, ry=20，其底边 y=220，那么文字的 y 必须填 250！
   辅助虚线: {"type":"dashed_line_3d","from":[100,150],"to":[200,150],"stroke":"#374151"}
E) 纯计算/代数题，无需图形: type="none", shapes=[]

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

【几何图形数据规范（仅当题目涉及几何图形时填写 geometry 字段）】
根据题目类型填写 geometry.type：
A) 格点/网格类（题干含"格点"/"网格"/"方格"）: type="grid", gridSize=网格大小
   shapes 坐标: (0,0) 在左下角，Y轴向上，以格点为单位。
B) 坐标系类（题干给出如 A(-4,-1) 等具体坐标）: type="coordinate"
   xRange=[x最小-1, x最大+1], yRange=[y最小-1, y最大+1]
   shapes 坐标直接使用题目中的数学坐标值。
C) 平面几何类（有三角形/圆/四边形等，但无坐标数值）: type="plane"
   shapes 坐标用 0-100 比例值，(0,0) 在左下角，Y轴向上。

shapes 元素格式：
polygon: {"type":"polygon","points":[[x1,y1],[x2,y2],...],"fill":"#eff6ff","stroke":"#374151"}
line:    {"type":"line","from":[x1,y1],"to":[x2,y2],"stroke":"#374151","dashed":false}
circle:  {"type":"circle","cx":x,"cy":y,"r":radius,"fill":"none","stroke":"#374151"}
point:   {"type":"point","x":x,"y":y,"r":3,"fill":"#374151"}
label:   {"type":"label","text":"A","x":x,"y":y,"color":"#1e293b","anchor":"middle"}

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
     - 【视觉排版要求】：对于纵切，若切成 2n 块（切 n 刀），你**必须在 cuts 中填入 n 个不同 angle 的 vertical 对象**（例如切 4 块填 2 个对象如 {"type":"vertical","angle":0.78} 和 {"type":"vertical","angle":2.35}），系统会自动渲染出完美的 3D 交叉切面（就像原题一样）！**注意：不要使用 0 和 1.57，它们会与圆柱外轮廓线重合导致图形隐身！**
     - 【数学逻辑极度警告！！！】：在改变题目数字时，**必须保持原题的切割方式和顺序**！如果原题图1是纵切（偶数块），变式题图1也必须是纵切。**【推荐约束】：为了图形美观及符合考纲，纵切建议优先出“切成2块（两半）”或“交叉切成4块”。**如果切多块，题干必须表述为“过底面中心交叉纵切成 x 等份”。如果原题图2是横切，变式题图2也必须是横切（块数任意）。**绝对不允许写出“沿直径纵切成3块”这种违背几何常识的荒谬题目！**
   圆锥: {"type":"cone","cx":150,"cy":230,"rx":70,"ry":23,"h":160,"fill":"#dcfce7","stroke":"#374151"}
     cx/cy:底面椭圆圆心(底面在下)，h:锥高(向上)
   球体: {"type":"sphere","cx":150,"cy":160,"r":80,"fill":"#fef9c3","stroke":"#374151"}
   长方体: {"type":"cuboid","lx":60,"ty":80,"w":120,"h":100,"d":60,"fill":"#e0f2fe","stroke":"#374151"}
   文字标签: {"type":"label_3d","text":"r","x":220,"y":250,"color":"#1e293b"}
     【注意】：文字标签的 y 坐标必须放在图形正下方，绝对不要和图形的底边重合！例如，若圆柱 cy=60, h=140, ry=20，其底边 y=220，那么文字的 y 必须填 250！
   辅助虚线: {"type":"dashed_line_3d","from":[100,150],"to":[200,150],"stroke":"#374151"}
E) 纯计算/代数题，无需图形: type="none", shapes=[]

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
