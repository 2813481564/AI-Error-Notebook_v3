import express from "express";
import { db } from "../config/db";
import { AuthenticatedRequest } from "../middleware/auth";
import {
  generateContentWithFallback,
  extractJsonString,
  sanitizeJsonString
} from "../services/aiService";
import { getSetting } from "../services/settingService";

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
      ? "【条件升级模式】：在原考点基础上增加隐蔽条件，或者将直接已知条件转为需要通过多一步计算先求出的间接条件，整体难度提升一星。绝对不允许超纲！绝对不允许引入更高年级的知识点（例如小学题绝对禁止考查初中几何定理）！"
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
5. 【极度重要 - 场景迁移与常识编排】：必须改变原题的**生活应用场景（换一个故事外壳）**。例如更换物品材质（从橡皮泥换成木材、金属、食物等），并根据新材质的物理特性使用合理的动词（如金属对应熔铸，木材对应切削/损耗，橡皮泥对应重塑/体积不变）。同时根据场景自然改变最终的提问方式（如求原体积、损耗体积、剩余体积等），使其读起来像一个全新的故事，绝对不能只改数字！
6. 知识点/图形/公式均不超出原题所述学段水平。
7. 数学公式必须用标准 $ 或 $$ 包围。**注意：JSON 字符串中的所有 LaTeX 反斜杠必须双写转义（例如 \\\\pi, \\\\frac, \\\\text），否则会导致 JSON 解析失败！**
8. 【极度重要】：保持与原题完全一致的年级和学段级别（例如原题如果是小学六年级，生成的同类题也必须是小学六年级水平；原题如果是高一，生成的题也必须是高一水平。若指定了年级为：${grade || '自动识别原题年级'}，请严格按照该年级设计，绝对不能超纲或降纲）。
9. 【数量要求】：你必须生成且只能生成正好 ${numQuestions} 道题目。

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
  "thinkingProcess": "【极为重要】在写题目和解析前，必须在此处打草稿！预先设定好干净的整数/有限小数值（如 r=2, h=3），计算出需要的表面积/体积数值，然后再生成题目！",
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
    "thinkingProcess": "预先设定变量和数值推演草稿...",
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
        fallback = fallback.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/, '').trim();
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
3. 【极度重要 - 场景迁移与常识编排】：必须改变原题的**生活应用场景（换一个故事外壳）**。例如更换物品材质（从橡皮泥换成木材、金属、食物等），并根据新材质的物理特性使用合理的动词（如金属对应熔铸，木材对应切削/损耗，橡皮泥对应重塑/体积不变）。同时根据场景自然改变最终的提问方式（如求原体积、损耗体积、剩余体积等），使其读起来像一个全新的故事，绝对不能只改数字！
4. 【极度重要 - 逆向推导命题法】：为了保证计算结果是干净的有限小数或整数，涉及圆柱、圆锥体积计算时，你必须先在后台预设好合理的半径 r 和高 h，且**强制规定高 h 必须是 3 的倍数**（如 3, 6, 9），以消除圆锥公式中 1/3 导致的无限循环小数。算好题干需要的表面积等数值后，再输出题目。
5. 对变式题目提供标准、严谨、逻辑清晰的详细名师解题步骤。
6. 数学公式必须用标准 $ 或 $$ 包围。**注意：JSON 字符串中的所有 LaTeX 反斜杠必须双写转义（例如 \\\\pi, \\\\frac, \\\\text），否则会导致 JSON 解析失败！**

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
3. 【极度重要 - 场景迁移与常识编排】：必须改变原题的**生活应用场景（换一个故事外壳）**。例如更换物品材质（从橡皮泥换成木材、金属、食物等），并根据新材质的物理特性使用合理的动词（如金属对应熔铸，木材对应切削/损耗，橡皮泥对应重塑/体积不变）。同时根据场景自然改变最终的提问方式（如求原体积、损耗体积、剩余体积等），使其读起来像一个全新的故事，绝对不能只改数字！
4. 【极度重要 - 逆向推导命题法】：为了保证计算结果是干净的有限小数或整数，涉及圆柱、圆锥体积计算时，你必须先在后台预设好合理的半径 r 和高 h，且**强制规定高 h 必须是 3 的倍数**（如 3, 6, 9），以消除圆锥公式中 1/3 导致的无限循环小数。算好题干需要的表面积等数值后，再输出题目。
5. 对变式题目提供标准、严谨、逻辑清晰的详细名师解题步骤。
6. 数学公式必须用标准 $ 或 $$ 包围。**注意：JSON 字符串中的所有 LaTeX 反斜杠必须双写转义（例如 \\\\pi, \\\\frac, \\\\text），否则会导致 JSON 解析失败！**

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



