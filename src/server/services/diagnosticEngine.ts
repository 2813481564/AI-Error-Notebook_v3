import { generateContentWithFallback, extractJsonString, sanitizeJsonString } from "./aiService";

export interface DiagnosticInput {
  subject?: string;
  originalText: string;
  studentAnswer?: string;
  visualContext?: string;
  standardAnswer?: string | null;
  gradeConstraint?: string;
  imageBase64?: string;
  thinkingMode?: 'enabled' | 'disabled';
}

export interface DiagnosticResult {
  knowledgePoints: string[];
  examDirection: string;
  errorReason: '【概念/审题】' | '【逻辑/建模】' | '【计算/执行】' | '【规范/表达】' | '【知识盲区/无思路】';
  firstErrorStep: string;
  rootCauseChain: string[];
  triggerSignals: string[];
  improvementAction: string;
  retestPlan: string;
  solution: string;
  score: number;
  errorAnalysis: string;
  thinkingProcess?: string;
}

/**
 * 获取全平台统一的诊断提示词工厂方法
 * 严格包含：【视觉证据终极准绳】、红笔过滤、白卷绿色通道、逐行Diff比对、5-Why根因链、打草稿铁律
 */
export const getUniversalDiagnosticPrompt = (input: DiagnosticInput): { systemPrompt: string; userPrompt: string } => {
  const subject = input.subject || '数学';
  const isMathScience = ['数学', '物理', '化学', '理综', '科学', '算术', '奥数'].some(s => subject.includes(s)) || Boolean(input.imageBase64);

  let standardAnswerSection = '';
  if (input.standardAnswer) {
    standardAnswerSection = `- 老师提供的参考标准答案: ${input.standardAnswer}\n`;
  }

  let visualContextSection = '';
  if (input.visualContext) {
    visualContextSection = `- 题干配图与几何标注说明: ${input.visualContext}\n`;
  }

  const gradeText = input.gradeConstraint || '请智能识别题目所属学段年级（小学至高中），严格遵守年级知识边界，严禁使用超纲解法（如小学题严禁列一元二次方程或微积分）。';

  const systemPrompt = `你是一个严谨的 AI 智能名师批改与诊断助手。你的输出格式有且只有一种：一个严格合法的 JSON 对象。不得包含任何 Markdown 的 \`\`\`json\`\`\` 标记或额外的多余废话。`;

  const userPrompt = `
幕后名师AI错题深度诊断与批改任务。请根据以下错题信息，进行权威、专业的全链路诊断：

【错题基础信息】
- 学科: ${subject}
- 题干高精度文本: ${input.originalText || '未提供'}
${visualContextSection}${standardAnswerSection}- 学生真实手写作答: ${input.studentAnswer || '（无作答或未提取到手写文字）'}
- 年级与学段限制: ${gradeText}

【极简与第一性原理断案铁律（核心准绳）】：
1. **【视觉证据与笔迹终极准绳】**：判断学生做对做错与错误分叉点时，**必须以亲眼看到的图像笔迹或手写作答中的真实写错数据为终极准绳**！系统提取的纯文本 studentAnswer 若存在拼写或算理冲突，以实际答题错误为准，严禁因为题目原本算式成立就自动把错误结果改对！
2. **【过滤红蓝笔批改迹象】**：若图片中存在老师使用红色或蓝色笔打的勾、叉、减分或写下的正确答案，请自动忽略，绝不可将老师的红笔批改混入学生的回答中。
3. **【白卷与知识盲区绿色通道】**：若发现学生作答内容为空白、交白卷、只写了“解/答”或明确写了“不会做”，禁止归因到计算粗心，必须强制在 "errorReason" 中返回字面量 "【知识盲区/无思路】"！同时在 "errorAnalysis" 中跳过纠错指责，直接输出该题的“破局切入点与思路导图”。
4. **【逐行Diff比对精确定位】**：必须逐行对比学生作答步骤与标准推导，在 "firstErrorStep" 中精炼指出第一个错误分叉点（例如“第2步去括号时负负没有得正”；若答对了写“完全正确，无错点”；若交白卷写“未动笔作答”）。
5. **【苏格拉底 5-Why 根因追溯】**：在 "rootCauseChain" 数组中，提供 3 个由表及里的归因剖析（如：Why1表层写错 -> Why2检验习惯缺失 -> Why3算理逻辑漏洞）。杜绝“粗心/马虎”等无效归因！
6. **【落地改进三要素】**：在 "improvementAction" 中给出明确包含“何时、何地、如何做”的可执行行动指引（例如“每次做完全等三角形证明后，用30秒逐项核对顶点字母顺序”）。
7. **【配图几何尺寸必须纳入计算】**：若存在几何配图说明（如间距32cm等），必须将其作为已知物理量纳入计算推演，严禁忽略图上距离。
8. **【打草稿推演铁律】**：为杜绝数学计算幻觉，必须在返回 JSON 对象的首个字段 "thinkingProcess" 中写下你的思维草稿与公式演算步骤。

【JSON 输出结构规范】：
请严格返回如下合法的 JSON 对象格式（严禁包含注释或 Markdown 标记）：
{
  "thinkingProcess": "你的详细数学解导与答卷对照排错草稿...",
  "knowledgePoints": ["核心考点1", "核心考点2"],
  "examDirection": "如：二次函数最值在实际生活中的应用考法",
  "errorReason": "【计算/执行】", // 必须且只能从：【概念/审题】、【逻辑/建模】、【计算/执行】、【规范/表达】、【知识盲区/无思路】 5个中严选其一
  "firstErrorStep": "第2步计算漏乘了常数项",
  "rootCauseChain": [
    "表层错误：将 2.1×(0.6+0.4) 误算为 2.7",
    "中层原因：对乘法分配律化简后的求值没有进行逆向核算",
    "深层认知：习惯于心算跳步，缺乏草稿验算规范"
  ],
  "triggerSignals": ["看到'简便计算'要联想提取公因数", "看到'40%'优先化为0.4"],
  "improvementAction": "每次化简含有百分数和小数的混合运算时，第一步统一化为小数，并在右侧草稿纸列竖式复查",
  "retestPlan": "建议24小时后，限时3分钟重新独立演算本题",
  "solution": "亲和力名师分步骤详细解答，公式必须用 $ 或 $$ 包围...",
  "score": 0, // 0 到 100 之间的整数打分
  "errorAnalysis": "### 🔴 关键错误定位\\n[一句话指出分叉点]\\n\\n### ❌ 你写的是\\n> [原样复现错误作答]\\n\\n### 💡 错在哪？\\n- 正确计算理应是... —— **这才是真理！**\\n- 你误把...当成了...\\n\\n### 🛠️ 名师提升指南\\n[深入指导切入点与学习习惯建议]"
}
`;

  return { systemPrompt, userPrompt };
};

/**
 * 执行深度错因诊断引擎（全平台唯一真理入口）
 */
export const executeDeepDiagnosis = async (input: DiagnosticInput): Promise<DiagnosticResult> => {
  const { systemPrompt, userPrompt } = getUniversalDiagnosticPrompt(input);

  const subject = input.subject || '数学';
  const isMathScience = ['数学', '物理', '化学', '理综', '科学', '算术', '奥数'].some(s => subject.includes(s)) || Boolean(input.imageBase64);
  const finalThinkingMode: 'enabled' | 'disabled' = (input.thinkingMode === 'enabled' || input.thinkingMode === 'disabled')
    ? input.thinkingMode
    : (isMathScience ? 'enabled' : 'disabled');

  const parts: any[] = [];
  if (input.imageBase64) {
    parts.push({
      inlineData: {
        data: input.imageBase64.split(',')[1] || input.imageBase64,
        mimeType: 'image/jpeg'
      }
    });
  }
  parts.push({ text: userPrompt });

  try {
    const response = await generateContentWithFallback({
      contents: [{ role: 'user', parts }],
      config: { temperature: 0.15 },
      systemPrompt,
      thinkingMode: finalThinkingMode
    });

    const rawText = response.text || '';
    if (!rawText) {
      throw new Error("AI 诊断引擎未返回有效文本");
    }

    const jsonStr = extractJsonString(rawText);
    const sanitizedStr = sanitizeJsonString(jsonStr);
    const parsed = JSON.parse(sanitizedStr);

    return {
      knowledgePoints: Array.isArray(parsed.knowledgePoints) ? parsed.knowledgePoints : ["知识点解析中"],
      examDirection: parsed.examDirection || "基础考法考察",
      errorReason: ['【概念/审题】', '【逻辑/建模】', '【计算/执行】', '【规范/表达】', '【知识盲区/无思路】'].includes(parsed.errorReason)
        ? parsed.errorReason
        : '【概念/审题】',
      firstErrorStep: parsed.firstErrorStep || "未能确定特定分叉点",
      rootCauseChain: Array.isArray(parsed.rootCauseChain) ? parsed.rootCauseChain : ["建议向任课老师请教具体归因"],
      triggerSignals: Array.isArray(parsed.triggerSignals) ? parsed.triggerSignals : [],
      improvementAction: parsed.improvementAction || "建议独立把题目重新抄写并演算一遍",
      retestPlan: parsed.retestPlan || "建议次日进行同类题巩固训练",
      solution: parsed.solution || "暂无标准解析",
      score: typeof parsed.score === 'number' ? Math.min(100, Math.max(0, parsed.score)) : 0,
      errorAnalysis: parsed.errorAnalysis || "### 🔴 关键错误定位\n请参考详细标准解答与视频讲解。",
      thinkingProcess: parsed.thinkingProcess || undefined
    };
  } catch (error) {
    console.error("[DiagnosticEngine] 诊断执行发生异常，降级返回:", error);
    return {
      knowledgePoints: ["需人工协助诊断"],
      examDirection: "常规考点",
      errorReason: '【概念/审题】',
      firstErrorStep: "系统识别轻微波动",
      rootCauseChain: ["分析超时，建议结合解题步骤自行比对"],
      triggerSignals: [],
      improvementAction: "认真对照标准答案检查具体步骤",
      retestPlan: "稍后重新尝试 AI 分析",
      solution: "见参考解答",
      score: 0,
      errorAnalysis: "### 🔴 关键错误定位\n识别暂时遇到波动，请重试或参考标准答案核对。"
    };
  }
};
