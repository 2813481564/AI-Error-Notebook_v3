import React from 'react';
import katex from 'katex';

interface FormattedMathProps {
  text?: string;
  className?: string;
  smallHeadings?: boolean;
}

function parseMarkdownTables(text: string): string {
  const lines = text.split('\n');
  let inTable = false;
  const newLines: string[] = [];
  let tableHtml: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('|') && line.endsWith('|') && line.length > 1) {
      if (!inTable) {
        inTable = true;
        tableHtml.push('<table><tbody>');
      }
      
      // 跳过表格分隔行（如 |:---|---:|）
      const contentWithoutPipes = line.replace(/\|/g, '');
      if (contentWithoutPipes.replace(/[-:\s]/g, '').length === 0) {
        continue;
      }

      const cells = line.slice(1, -1).split('|');
      let rowHtml = '<tr>';
      const isHeader = tableHtml.length === 1;
      const tag = isHeader ? 'th' : 'td';
      
      for (const cell of cells) {
        rowHtml += `<${tag}>${cell.trim()}</${tag}>`;
      }
      rowHtml += '</tr>';
      tableHtml.push(rowHtml);
    } else {
      if (inTable) {
        inTable = false;
        tableHtml.push('</tbody></table>');
        newLines.push(tableHtml.join(''));
        tableHtml = [];
      }
      newLines.push(lines[i]);
    }
  }

  if (inTable) {
    tableHtml.push('</tbody></table>');
    newLines.push(tableHtml.join(''));
  }

  return newLines.join('\n');
}

// 自动识别并拆包如果数据被存成 JSON 数组/对象字符串形式（兼容并修复老脏数据以及非严格的 JS 对象语法如 h: 998）
export function unwrapJsonText(text: string, fieldHint?: 'originalText' | 'studentAnswer' | 'solution' | 'errorAnalysis'): string {
  if (!text || typeof text !== 'string') return '';
  let trimmed = text.trim();
  const mdMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (mdMatch && mdMatch[1]) {
    trimmed = mdMatch[1].trim();
  }
  if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
    let parsed: any = null;
    try {
      parsed = JSON.parse(trimmed);
    } catch (e) {
      try {
        // 当标准 JSON.parse 失败时（如 AI 返回了 h: 998 等非引号 Key 或尾随逗号），使用 JS 兼容语法进行尝试解析
        parsed = new Function("return " + trimmed)();
      } catch (e2) {
        // 忽略完全解析失败的普通文本
      }
    }
    if (parsed) {
      const item = Array.isArray(parsed) ? parsed[0] : parsed;
      if (item && typeof item === 'object') {
        if (fieldHint && item[fieldHint] !== undefined) {
          return String(item[fieldHint]);
        }
        if (item.originalText !== undefined) return String(item.originalText);
        if (item.questionText !== undefined) return String(item.questionText);
        if (item.text !== undefined) return String(item.text);
      }
    }
  }
  return text;
}

// 自动把未被 $...$ 包裹的 \frac{}{}、\sqrt{}、\times 等裸露数学 LaTeX 符号套上 $...$，确保 KaTeX 完美渲染
function autoWrapBareLatex(text: string): string {
  if (!text) return '';
  text = unwrapJsonText(text);
  text = repairBrokenLatexCommands(text);
  // 先还原 AI 双重转义产生的双反斜杠标点转义命令（\\%→\%，\\&→\&，\\#→\#，\\_→\_ 等），
  // 但严格限定“前面是数字/变量或独立出现”且“未处于 $...$ 公式内部”，避免误伤纯文本反斜杠
  text = text.replace(/\\(?:\\)(?=[%\&#_$,;\:!])/g, '\\');
  const cleaned = text.replace(/(?:\\{1,2})(frac|sqrt|times|div|pm|pi|alpha|beta|theta|angle|triangle|because|therefore|approx|neq|le|ge|cdot|degree|circ\b|%|\&|_)/g, '\\$1');
  return cleaned.split(/(\$\$[\s\S]*?\$\$|\\{1,2}\[[\s\S]*?\\{1,2}\]|\\{1,2}\([\s\S]*?\\{1,2}\)|\\{1,2}begin\{.*?\}[\s\S]*?\\{1,2}end\{.*?\}|\$[^\$\n]*?\$)/g).map((seg, idx) => {
    if (idx % 2 === 1) return seg;
    return seg.replace(/(?:\\+)(frac\{[^{}]*\}\{[^{}]*\}|sqrt(?:\[[^[\]]*\])?\{[^{}]*\}|times|div|pm|pi|alpha|beta|theta|angle|triangle|because|therefore|approx|neq|le|ge|cdot|degree|circ\b|%|\&|_)/g, (m, p1) => '$\\' + p1 + '$');
  }).join('');
}

export default function FormattedMath({ text = '', className = '', smallHeadings = false }: FormattedMathProps) {
  if (!text) return null;
  text = unwrapJsonText(text);

  // 自动修复并包裹“裸露”的分数、根号等公式命令
  const wrappedText = autoWrapBareLatex(text);

  // 先把 Markdown 表格预处理为 HTML 表格，保证正确渲染
  const processedText = parseMarkdownTables(wrappedText);

  // 按块级公式（$$...$$、\[...\]、\begin{...}...\end{...}）与 HTML 表格切分文本
  const rawSegments = processedText.split(/(\$\$\s*[\s\S]*?\s*\$\$|\\{1,2}\[\s*[\s\S]*?\s*\\{1,2}\]|\\{1,2}begin\{.*?\}\s*[\s\S]*?\s*\\{1,2}end\{.*?\}|<table[\s\S]*?<\/table>)/gi);

  // 把连续的公式块合并为一个整体，吞掉中间空白
  const groupedSegments: any[] = [];
  for (let i = 0; i < rawSegments.length; i++) {
    const segment = rawSegments[i];
    
    if (i % 2 === 0) {
      // 文本片段
      groupedSegments.push({ type: 'text', content: segment });
    } else {
      // 分隔片段（公式或表格）
      const trimmed = segment.trim();
      if (/^\s*<table/i.test(trimmed)) {
        groupedSegments.push({ type: 'table', content: segment });
      } else {
        // 块级公式：若仅以空白分隔，尝试与上一个公式组合并
        let merged = false;
        if (groupedSegments.length >= 2) {
          const lastItem = groupedSegments[groupedSegments.length - 1];
          const secondLastItem = groupedSegments[groupedSegments.length - 2];
          
          if (lastItem.type === 'text' && lastItem.content.trim() === '' && secondLastItem.type === 'math') {
            // 该文本仅为空白，合并进上一个公式组
            secondLastItem.items.push(trimmed);
            // 移除空的文本片段
            groupedSegments.pop();
            merged = true;
          }
        }
        
        if (!merged) {
          groupedSegments.push({ type: 'math', items: [trimmed] });
        }
      }
    }
  }

  return (
    <div className={`space-y-4 font-medium text-slate-700 leading-relaxed text-sm xl:text-base ${className}`}>
      {groupedSegments.map((group, index) => {
        if (group.type === 'table') {
          return (
            <div key={index} className="overflow-x-auto my-4 w-full">
              <InlineContent text={group.content} />
            </div>
          );
        }

        if (group.type === 'math') {
          return (
            <div
              key={index}
              className="overflow-x-auto py-4 my-3 bg-slate-50 border border-slate-150/80 rounded-2xl px-5 text-slate-950 flex flex-col items-center justify-center scrollbar-thin font-semibold shadow-inner [&_.katex-display]:!my-1.5"
            >
              {group.items.map((mathItem: string, mIdx: number) => {
                let rawMath = mathItem;
                if (rawMath.startsWith('$$') && rawMath.endsWith('$$')) {
                  rawMath = rawMath.slice(2, -2).trim();
                } else if (/^\\{1,2}\[/.test(rawMath) && /\\{1,2}\]$/.test(rawMath)) {
                  rawMath = rawMath.replace(/^\\{1,2}\[\s*/, '').replace(/\s*\\{1,2}\]$/, '').trim();
                }
                
                try {
                  const sanitizedMath = fixLatexCommands(rawMath);
                  const html = katex.renderToString(sanitizedMath, {
                    displayMode: true,
                    throwOnError: false,
                  });
                  return (
                    <div 
                      key={mIdx} 
                      dangerouslySetInnerHTML={{ __html: html }} 
                      className="w-full flex justify-center"
                    />
                  );
                } catch (e: any) {
                  return (
                    <pre key={mIdx} className="text-rose-500 bg-rose-50/50 p-3 my-1 rounded-2xl text-xs select-all overflow-x-auto border border-rose-100 flex flex-col gap-2 w-full max-w-full">
                      <span className="font-bold text-rose-700 break-words border-b border-rose-200 pb-2">[渲染崩溃原因: {e?.message || String(e)}]</span>
                      <span className="whitespace-pre-wrap">{rawMath}</span>
                    </pre>
                  );
                }
              })}
            </div>
          );
        }

        // 文本片段
        return <NormalSegment key={index} text={group.content} smallHeadings={smallHeadings} />;
      })}
    </div>
  );
}


function NormalSegment({ text, smallHeadings }: { text: string; key?: any; smallHeadings?: boolean }) {
  // 把该文本片段按行拆分
  const paragraphs = text.split(/\r?\n/);

  return (
    <div className="space-y-2">
      {paragraphs.map((para, pIndex) => {
        const trimmed = para.trim();
        if (!trimmed) {
          // 列表或空行之间的间距
          return <div key={pIndex} className="h-1" />;
        }

        let isHeading = false;
        let headingLevel = 0;
        let cleanText = para;

        if (para.startsWith('### ')) {
          isHeading = true;
          headingLevel = 3;
          cleanText = para.slice(4);
        } else if (para.startsWith('## ')) {
          isHeading = true;
          headingLevel = 2;
          cleanText = para.slice(3);
        } else if (para.startsWith('# ')) {
          isHeading = true;
          headingLevel = 1;
          cleanText = para.slice(2);
        }

        const renderContent = () => (
          <InlineContent text={cleanText} />
        );

        if (isHeading) {
          if (headingLevel === 1) {
            return (
              <h1 
                key={pIndex} 
                id={`heading-1-${pIndex}`} 
                className={`${smallHeadings ? 'text-sm font-bold mt-3' : 'text-xl font-extrabold mt-5'} text-slate-950 mb-2.5 tracking-tight border-b border-slate-100 pb-2 flex items-center`}
              >
                {renderContent()}
              </h1>
            );
          }
          if (headingLevel === 2) {
            return (
              <h2 
                key={pIndex} 
                id={`heading-2-${pIndex}`} 
                className={`${smallHeadings ? 'text-xs font-bold mt-2' : 'text-base font-extrabold mt-4'} text-slate-900 mb-2 tracking-tight flex items-center pb-1`}
              >
                {renderContent()}
              </h2>
            );
          }
          return (
            <h3 
              key={pIndex} 
              id={`heading-3-${pIndex}`} 
              className={`${smallHeadings ? 'text-xs font-bold mt-2' : 'text-sm font-extrabold mt-3'} text-slate-800 mb-1 tracking-wider uppercase flex items-center`}
            >
              {renderContent()}
            </h3>
          );
        }

        const listMatch = para.match(/^(\s*)([•\-*]|\d+\.)\s+(.*)/);
        if (listMatch) {
          const indent = listMatch[1].length;
          const marker = listMatch[2];
          const content = listMatch[3];
          return (
            <div 
              key={pIndex} 
              className="flex gap-2 text-slate-700 leading-relaxed py-1.5 items-start" 
              style={{ paddingLeft: `${indent * 12}px` }}
              id={`list-item-${pIndex}`}
            >
              <span className="font-extrabold text-blue-600 select-none shrink-0 pt-0.5">{marker}</span>
              <span className="flex-1"><InlineContent text={content} /></span>
            </div>
          );
        }

        if (para.trim().startsWith('>')) {
          const cleanText = para.trim().replace(/^>\s*/, '');
          return (
            <div 
              key={pIndex} 
              className="border-l-[4px] border-slate-300 bg-slate-50/80 text-slate-600 pl-4 py-2.5 my-2.5 rounded-r-xl font-medium text-[13px] leading-relaxed shadow-sm shadow-slate-100/50"
            >
              <InlineContent text={cleanText} />
            </div>
          );
        }

        return (
          <p key={pIndex} id={`para-${pIndex}`} className="leading-relaxed text-slate-700 font-semibold my-1">
            <InlineContent text={para} />
          </p>
        );
      })}
    </div>
  );
}

function fixLatexCommands(math: string): string {
  return math
    .replace(/\x09(?=imes|ext|au|heta|riangle|o\b|op|an)/g, '\\t')
    .replace(/\f(?=rac)/g, '\\f')
    .replace(/[\b](?=eta|egin|ar)/g, '\\b')
    .replace(/\r(?=ightarrow|ight)/g, '\\r')
    .replace(/\\\\\\\\/g, '\\\\')
    // 专门修复 AI 把 LaTeX 控制空格 `\ ` 误写成 `\\ `（导致 KaTeX 误认为是换行）并紧跟 (单位) 的情况
    // 兼容 \text{(cm}^2\text{)}、(\text{cm}^2)、\text{cm} 等各种奇葩错位语法，且严格限定在行尾（支持被 \end{align*} 等环境包裹）
    .replace(/\\\\(?=(?:[ \t(\[]|\\{1,2}(?:text|mathrm)\s*\{)*[\u4e00-\u9fa5a-zA-Z]{1,6}(?:[)\]}\s\^{23²³]|\\{1,2}(?:text|mathrm)\s*\{)*(?:\\{1,2}end\s*\{[a-zA-Z*]+\}\s*)*$)/g, '\\')
    // 修复 AI 双重转义 LaTeX 标点命令（如 \\, 薄空格, \\; 厚空格, \\_ 下划线），防止 \text 被还原时漏掉它们导致误当做换行
    .replace(/\\\\(?=[a-zA-Z,;:!_])/g, '\\')
    .replace(/\\\\%/g, '\\%')
    .replace(/(?<!\\)%/g, '\\%')
    // 去除 AI 生成的 \boxed 黑框，但必须支持至少一层嵌套括号以防 \dfrac{1}{7} 的括号被误伤吃掉
    .replace(/\\boxed\{((?:[^{}]|\{[^{}]*\})*)\}/g, '$1')
    .replace(/\\text\{\s*(.*?)\s*\}/g, '\\text{$1}');
}

// 修复因 \n 被误转义或解析为换行，导致 \neq、\not、\nu 等 LaTeX 命令被拆成 "换行 + eq" 造成公式断裂的问题
function repairBrokenLatexCommands(text: string): string {
  if (!text) return '';
  return text
    .replace(/(?:\r?\n|\r|\\n|\\\\n)(eq\b|e\b|ot\b|u\b|abla\b|eg\b|atural\b|ewline\b|otin\b|mid\b|exists\b|subseteq\b|supseteq\b|leftarrow\b|rightarrow\b|Leftrightarrow\b|Rightarrow\b|Leftarrow\b|sim\b|cong\b|parallel\b|le\b|ge\b|prec\b|succ\b)/g, '\\n$1')
    .replace(/\\neqeq\b/g, '\\neq');
}

// 安全替换文本中的 \n 与 \\n 转义为换行或空格，同时严格保护 $...$ 公式内部不被替换
function safeReplaceNewlines(text: string, replacement: string): string {
  if (!text) return '';
  const segments = text.split(/(\$\$[\s\S]*?\$\$|\$[^\$\n]*?\$)/g);
  return segments.map((seg, idx) => {
    if (idx % 2 === 1) return seg; // 数学公式内部原样保留，绝对不把 \n 变成换行
    return seg
      .replace(/\\\\n(?!(eq\b|e\b|ot\b|u\b|abla\b|eg\b|atural\b|ewline\b|otin\b|mid\b|exists\b|subseteq\b|supseteq\b|leftarrow\b|rightarrow\b|Leftrightarrow\b|Rightarrow\b|Leftarrow\b|sim\b|cong\b|parallel\b|le\b|ge\b|prec\b|succ\b))/g, replacement)
      .replace(/\\n(?!(eq\b|e\b|ot\b|u\b|abla\b|eg\b|atural\b|ewline\b|otin\b|mid\b|exists\b|subseteq\b|supseteq\b|leftarrow\b|rightarrow\b|Leftrightarrow\b|Rightarrow\b|Leftarrow\b|sim\b|cong\b|parallel\b|le\b|ge\b|prec\b|succ\b))/g, replacement);
  }).join('');
}

// 极简卡片摘要清洗：只处理 \n、\\n、\t、\\t 等转义与空白，不破坏 Markdown 与公式
export function cleanTextForSummary(text: string): string {
  if (!text) return '';
  text = unwrapJsonText(text);
  text = repairBrokenLatexCommands(text);
  let cleaned = safeReplaceNewlines(text, ' ');
  cleaned = cleaned
    .replace(/\r?\n+/g, ' ')
    .replace(/\x09(?=imes|ext|au|heta|riangle|o\b|op|an)/g, '\\t')
    .replace(/\\t(?!(imes|ext|au|heta|riangle|o\b|op|an))/g, ' ')
    .replace(/\x09/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return autoWrapBareLatex(cleaned);
}

export function InlineContent({ text }: { text: string }) {
  if (!text) return null;
  text = unwrapJsonText(text);
  text = repairBrokenLatexCommands(text);
  // 处理 \n、\\n、\t 等转义，同时保护 \times、\text、\neq 等 LaTeX 公式命令不被误伤，并包裹裸露公式
  let unescapedText = safeReplaceNewlines(text, '\n');
  unescapedText = autoWrapBareLatex(unescapedText)
    .replace(/\x09(?=imes|ext|au|heta|riangle|o\b|op|an)/g, '\\t')
    .replace(/\\t(?!(imes|ext|au|heta|riangle|o\b|op|an))/g, ' ')
    .replace(/\x09/g, ' ');
  const processedTextMarkdown = parseMarkdownTables(unescapedText);

  // 若文本含 HTML 结构标签（如 table），拆成 React 节点 
  // 会破坏 HTML，因为 dangerouslySetInnerHTML 片段会被浏览器自动闭合
  // 必须先把行内公式与加粗标记转成 HTML 字符串，再整体渲染
  if (/<(table|tbody|thead|tr|td|th)(>|\s[^>]*>)/i.test(processedTextMarkdown)) {
    let processedHtml = processedTextMarkdown;
    // 把行内公式替换为 KaTeX HTML
    processedHtml = processedHtml.replace(/\$(.*?)\$/g, (match, rawMath) => {
      try {
        const sanitizedMath = fixLatexCommands(rawMath);
        const html = katex.renderToString(sanitizedMath, {
          displayMode: false,
          throwOnError: false,
        });
        return `<span class="inline-block mx-1 font-mono text-slate-950 bg-slate-50/50 border border-slate-200/50 rounded-xl px-2 py-0.5 text-xs font-semibold shadow-sm">${html}</span>`;
      } catch (e) {
        return match;
      }
    });

    // 把加粗标记替换为 <strong>
    processedHtml = processedHtml.replace(/\*\*(.*?)\*\*/g, '<strong class="font-extrabold text-slate-950 tracking-tight">$1</strong>');

    return (
      <span 
        dangerouslySetInnerHTML={{ __html: processedHtml }} 
        className="[&_table]:w-full [&_table]:border-collapse [&_table]:my-3 [&_table]:text-sm [&_td]:border [&_td]:border-slate-300 [&_td]:p-2.5 [&_td]:text-center [&_td]:align-middle [&_th]:border [&_th]:border-slate-300 [&_th]:p-2.5 [&_th]:bg-slate-100 [&_th]:text-center [&_th]:font-bold" 
      />
    );
  }

  // 标准非表格文本路径：使用单趟统一递归词法扫描引擎 (Recursive AST Tokenizer)
  return <>{renderInlineTokens(processedTextMarkdown)}</>;
}

// 单趟递归行内词法分析引擎，彻底终结正则表达式线性切片 (split) 造成的标签割裂与嵌套冲突
function renderInlineTokens(text: string, keyPrefix = 'tok'): React.ReactNode[] {
  if (!text) return [];

  const nodes: React.ReactNode[] = [];
  let remaining = text;
  let counter = 0;

  // 匹配优先度：公式($...$ 或 \(...\)) | Markdown加粗(**或__) | Markdown斜体(*或_) | 换行(<br/>或\n) | 安全HTML格式标签
  const TOKEN_REGEX = /(\$([^\$\n]+?)\$|\\{1,2}\(([\s\S]*?)\\{1,2}\)|\*\*(.*?)\*\*|__(.*?)__|\*(.*?)\*|<br\s*\/?>|\r?\n|<(b|i|u|strong|em)(?:\s+[^>]*)?>(.*?)<\/\7>)/i;

  while (remaining.length > 0) {
    const match = TOKEN_REGEX.exec(remaining);
    if (!match) {
      nodes.push(<React.Fragment key={`${keyPrefix}-${counter++}`}>{remaining}</React.Fragment>);
      break;
    }

    if (match.index > 0) {
      const beforeText = remaining.slice(0, match.index);
      nodes.push(<React.Fragment key={`${keyPrefix}-${counter++}`}>{beforeText}</React.Fragment>);
    }

    const fullMatch = match[0];
    const mathContent1 = match[2];        // $...$
    const mathContent2 = match[3];        // \(...\)
    const boldStar = match[4];            // **...**
    const boldUnderline = match[5];       // __...__
    const italicStar = match[6];          // *...*
    const htmlTag = match[7];             // b|i|u|strong|em
    const htmlContent = match[8];         // <tag>...</tag>

    const mathContent = mathContent1 !== undefined ? mathContent1 : mathContent2;

    if (mathContent !== undefined) {
      const rawMath = mathContent.trim();
      try {
        const sanitizedMath = fixLatexCommands(rawMath);
        const html = katex.renderToString(sanitizedMath, {
          displayMode: false,
          throwOnError: false,
        });
        nodes.push(
          <span 
            key={`${keyPrefix}-${counter++}`} 
            className="inline-block mx-1 font-mono text-slate-950 bg-slate-50/50 hover:bg-slate-50 border border-slate-200/50 rounded-xl px-2 py-0.5 text-xs font-semibold select-all shadow-sm transition-all"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
      } catch (e) {
        nodes.push(
          <span key={`${keyPrefix}-${counter++}`} className="text-rose-500 bg-rose-50/50 px-1.5 py-0.5 border border-rose-100 rounded-lg text-xs font-bold">
            {rawMath}
          </span>
        );
      }
    } else if (boldStar !== undefined || boldUnderline !== undefined) {
      const innerBold = boldStar !== undefined ? boldStar : boldUnderline;
      nodes.push(
        <strong key={`${keyPrefix}-${counter++}`} className="font-extrabold text-slate-950 tracking-tight">
          {renderInlineTokens(innerBold, `${keyPrefix}-${counter}-b`)}
        </strong>
      );
    } else if (italicStar !== undefined) {
      nodes.push(
        <em key={`${keyPrefix}-${counter++}`} className="italic text-slate-800">
          {renderInlineTokens(italicStar, `${keyPrefix}-${counter}-i`)}
        </em>
      );
    } else if (fullMatch.toLowerCase().startsWith('<br') || fullMatch === '\n' || fullMatch === '\r\n') {
      nodes.push(<br key={`${keyPrefix}-${counter++}`} />);
    } else if (htmlTag !== undefined && htmlContent !== undefined) {
      const tagLower = htmlTag.toLowerCase();
      const innerRendered = renderInlineTokens(htmlContent, `${keyPrefix}-${counter}-h`);
      if (tagLower === 'strong' || tagLower === 'b') {
        nodes.push(<strong key={`${keyPrefix}-${counter++}`} className="font-extrabold text-slate-950 tracking-tight">{innerRendered}</strong>);
      } else if (tagLower === 'em' || tagLower === 'i') {
        nodes.push(<em key={`${keyPrefix}-${counter++}`} className="italic text-slate-800">{innerRendered}</em>);
      } else if (tagLower === 'u') {
        nodes.push(<u key={`${keyPrefix}-${counter++}`} className="underline underline-offset-4">{innerRendered}</u>);
      } else {
        nodes.push(<span key={`${keyPrefix}-${counter++}`}>{innerRendered}</span>);
      }
    } else {
      nodes.push(<React.Fragment key={`${keyPrefix}-${counter++}`}>{fullMatch}</React.Fragment>);
    }

    remaining = remaining.slice(match.index + fullMatch.length);
  }

  return nodes;
}
