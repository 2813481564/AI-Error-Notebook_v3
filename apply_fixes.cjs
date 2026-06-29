const fs = require('fs');
const path = require('path');

const targetPath = path.resolve(__dirname, 'src/server/controllers/aiController.ts');
let content = fs.readFileSync(targetPath, 'utf8');

// 1. GEOMETRY_PROMPT_TEMPLATE
const geoTemplate = `const GEOMETRY_PROMPT_TEMPLATE = \`
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
\`;
`;
content = content.replace('import { getSetting } from "../services/settingService";', 'import { getSetting } from "../services/settingService";\nimport { stringSimilarity } from "../utils/stringUtils";\n\n' + geoTemplate);

const analyzeGeoRegex = /【几何图形数据规范（必须填写 geometry 字段）】[\s\S]*?anchor":"middle"\}/;
content = content.replace(analyzeGeoRegex, '${GEOMETRY_PROMPT_TEMPLATE}');

const similarGeoRegex = /【几何图形数据规范（必须填写 geometry 字段）】[\s\S]*?anchor":"middle"\}/;
content = content.replace(similarGeoRegex, '${GEOMETRY_PROMPT_TEMPLATE}');

const paperGeoRegex = /【几何图形数据规范（仅当题目涉及几何图形时填写 geometry 字段）】[\s\S]*?type="none", shapes=\[\]/;
content = content.replace(paperGeoRegex, '${GEOMETRY_PROMPT_TEMPLATE}');
content = content.replace(paperGeoRegex, '${GEOMETRY_PROMPT_TEMPLATE}'); // There are two paper... functions

// 2. Extract
const extractStart = content.indexOf("    let prompt = ``;");
const extractEnd = content.indexOf("    // 二阶段逻辑纠错");
const newExtract = `    let prompt = \`\`;
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
    if (answerImageBase64) {
      prompt += \`另外，我提供了一张对应的【标准答案参考图片】（第二张图）。请务必对照两张图，将同一道题的题干、学生手写作答以及参考的标准答案进行一一匹配提取。\\n\`;
    }
    if (answerText) {
      prompt += \`另外，我提供了一段参考答案文本如下：\\n【完整参考答案文本开始】\\n\${answerText}\\n【完整参考答案文本结束】\\n请结合此参考文本，将其中的各题答案切分并匹配到对应题目的标准答案字段中。\\n\`;
    }
    prompt += \`
【具体输出字段要求】：
请严格以 JSON 数组的形式返回（即使只有一题也要用数组包围），数组中的每个对象代表一道题，包含以下字段：
- subject: [学科名称，如数学/物理/化学等]
- originalText: [本题的高精度完整题干印刷体文字，包含题号。绝对不能写“略”]
- studentAnswer: [本题区域内学生手写作答出的答案或步骤，若无则留空。]
- standardAnswer: [根据参考资料提取的本题标准答案，若无则留空]
- visualContext: [如果你在题目中看到了几何图形、函数图像或实物配图，请在此字段用纯文本极其详细地描述图形的拓扑结构、形状特征、嵌套关系和标注字母。如果没有图，返回空字符串。]

【深度校准与格式规约（极度重要）】：
1. **语义级防错**：如果在数学题中识别出汉字“元”、“兀”等，且上下文是关于圆、面积、体积等几何计算，必须将其纠正为数学符号“\\\\pi”。理清易混淆的“t”与“+”。
2. **表格原生化**：若题目包含表格，绝对禁止使用 Markdown 的 | 语法！必须使用原生的 HTML 标签（<table>, <tr>, <td>）重建表格，并在表格内正常使用 $ 包围 LaTeX 公式。
3. **公式规范**：公式必须用标准的 $ 或 $$ 包围输出为 LaTeX 格式。注意：JSON 字符串中的所有 LaTeX 反斜杠必须双写转义（例如 \\\\\\\\pi, \\\\\\\\frac），否则会导致 JSON 解析失败！
\`;

    const systemPrompt = \`你是一个只输出结构化 JSON 的 OCR 助手。你的整个回复必须是一个合法的 JSON 数组，不要包含 Markdown 代码块标记（如 \`\`\`json）或任何额外的多余废话。\`;

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
           visualContext: item.visualContext || ""
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

`;
content = content.substring(0, extractStart) + newExtract + content.substring(extractEnd);

// Levenshtein & diagnose fixes
content = content.replace(
  "【原题干】：${q.originalText}\n【手写作答】：${q.studentAnswer}",
  "【原题干】：${q.originalText}\n【图形上下文】：${q.visualContext || '无'}\n【手写作答】：${q.studentAnswer}"
);
content = content.replace(
  /const correctPrompt = `作为一名严谨的数学教师校对员。[\s\S]*?因视觉粘连导致的明显 OCR 字符错误。/g,
  "const correctPrompt = `作为一名严谨的数学教师校对员。手写作答中可能因笔画粘连导致数字识别错误（例如 0.6 被误认成 0.5、+被误认成4等），或将圆周率“\\\\pi”误认成汉字“元”、“兀”。请结合上下文，在不改变学生解题本意的前提下，校正因视觉粘连导致的明显 OCR 字符错误。"
);

content = content.replace(
  "q.studentAnswer = correctedText;",
  "const similarity = stringSimilarity(q.studentAnswer, correctedText);\n              if (similarity > 0.5) {\n                q.studentAnswer = correctedText;\n              }"
);

// Diagnose
content = content.replace(
  "let { subject, originalText, studentAnswer, standardAnswer, thinkingMode, grade, notebookId } = req.body;",
  "let { subject, originalText, visualContext, studentAnswer, standardAnswer, thinkingMode, grade, notebookId } = req.body;"
);
content = content.replace(
  "- 题干: ${originalText}",
  "- 题干纯文本: ${originalText}\n- 题干配图/几何拓扑结构描述: ${visualContext || '无图'}"
);
content = content.replace(
  "如果未提供学生作答内容，则根据考点推测最易犯的错误标签输出。",
  "【极度重要】：如果“学生作答内容”为空，绝对禁止强行挑选上述错误标签！必须强制输出标签：\"【知识盲区/无思路】完全留白\"。"
);
content = content.replace(
  "- 如果为空，请结合本题考点分析最容易掉入的【常见错误陷阱】及【根本原因】。",
  "- 如果为空，请判定为【知识盲区/无思路】，跳过所有的指责，直接输出该题的解题破局点（切入点）、思维导图提示和所需的关键公式，用温和鼓励的语气指导学生第一步该如何动笔。"
);

const appendContent = fs.readFileSync(path.resolve(__dirname, 'src/server/controllers/processAllTemplate.ts'), 'utf8');
content += "\n" + appendContent;

fs.writeFileSync(targetPath, content, 'utf8');
