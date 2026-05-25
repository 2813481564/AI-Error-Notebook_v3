import React from 'react';
import katex from 'katex';

interface FormattedMathProps {
  text?: string;
  className?: string;
}

export default function FormattedMath({ text = '', className = '' }: FormattedMathProps) {
  if (!text) return null;

  // Split text by block math blocks ($$.*?$$)
  const segments = text.split(/(\$\$\s*[\s\S]*?\s*\$\$)/gs);

  return (
    <div className={`space-y-4 font-medium text-slate-700 leading-relaxed text-sm xl:text-base ${className}`}>
      {segments.map((segment, index) => {
        // Checking if it's block math
        if (segment.startsWith('$$') && segment.endsWith('$$')) {
          const rawMath = segment.slice(2, -2).trim();
          try {
            // Unescape occasionally double-escaped backend slashes like \\times or \\div
            const sanitizedMath = rawMath
              .replace(/\\\\/g, '\\')
              .replace(/\\text\{\s*(.*?)\s*\}/g, '\\text{$1}');

            const html = katex.renderToString(sanitizedMath, {
              displayMode: true,
              throwOnError: false,
            });
            return (
              <div 
                key={index} 
                className="overflow-x-auto py-4 my-3 bg-slate-50 border border-slate-150/80 rounded-2xl px-5 text-slate-950 flex justify-center scrollbar-thin font-semibold shadow-inner"
                dangerouslySetInnerHTML={{ __html: html }}
                id={`math-block-${index}`}
              />
            );
          } catch (e) {
            return (
              <pre key={index} className="text-rose-500 bg-rose-50/50 p-3 rounded-2xl text-xs select-all overflow-x-auto border border-rose-100">
                {rawMath}
              </pre>
            );
          }
        }

        // It's a text segment (may contain headings, nested lists, bold tags, and inline math)
        return <NormalSegment key={index} text={segment} />;
      })}
    </div>
  );
}

function NormalSegment({ text }: { text: string; key?: any }) {
  // Split this text segment into separate lines
  const paragraphs = text.split(/\r?\n/);

  return (
    <div className="space-y-2">
      {paragraphs.map((para, pIndex) => {
        const trimmed = para.trim();
        if (!trimmed) {
          // Double lists spacer or empty line spacing
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
                className="text-xl font-extrabold text-slate-950 mt-5 mb-2.5 tracking-tight border-b border-slate-100 pb-2 flex items-center"
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
                className="text-base font-extrabold text-slate-900 mt-4 mb-2 tracking-tight flex items-center pb-1"
              >
                {renderContent()}
              </h2>
            );
          }
          return (
            <h3 
              key={pIndex} 
              id={`heading-3-${pIndex}`} 
              className="text-sm font-extrabold text-slate-800 mt-3 mb-1 tracking-wider uppercase flex items-center"
            >
              {renderContent()}
            </h3>
          );
        }

        // Check if paragraph starts with markdown list symbols or bold numbered items e.g., "1. " or "• "
        const listMatch = para.match(/^(\s*)([•\-*]|\d+\.)\s+(.*)/);
        if (listMatch) {
          const indent = listMatch[1].length;
          const marker = listMatch[2];
          const content = listMatch[3];
          return (
            <div 
              key={pIndex} 
              className="flex gap-2 text-slate-700 leading-relaxed py-1 items-start" 
              style={{ paddingLeft: `${indent * 12}px` }}
              id={`list-item-${pIndex}`}
            >
              <span className="font-extrabold text-blue-600 select-none shrink-0 pt-0.5">{marker}</span>
              <span className="flex-1"><InlineContent text={content} /></span>
            </div>
          );
        }

        return (
          <p key={pIndex} id={`para-${pIndex}`} className="leading-relaxed text-slate-700 font-semibold">
            <InlineContent text={para} />
          </p>
        );
      })}
    </div>
  );
}

function InlineContent({ text }: { text: string }) {
  // Parse inline math $...$
  const inlineMathSegments = text.split(/(\$.*?\$)/g);

  return (
    <>
      {inlineMathSegments.map((seg, sIdx) => {
        if (seg.startsWith('$') && seg.endsWith('$')) {
          const rawMath = seg.slice(1, -1).trim();
          try {
            // Unescape occasionally double-escaped backend slashes like \\times or \\div
            const sanitizedMath = rawMath
              .replace(/\\\\/g, '\\')
              .replace(/\\text\{\s*(.*?)\s*\}/g, '\\text{$1}');

            const html = katex.renderToString(sanitizedMath, {
              displayMode: false,
              throwOnError: false,
            });
            return (
              <span 
                key={sIdx} 
                className="inline-block mx-1 font-mono text-slate-950 bg-slate-50/50 hover:bg-slate-50 border border-slate-200/50 rounded-xl px-2 py-0.5 text-xs font-semibold select-all shadow-sm transition-all"
                dangerouslySetInnerHTML={{ __html: html }}
                id={`math-inline-${sIdx}`}
              />
            );
          } catch (e) {
            return (
              <span key={sIdx} className="text-rose-500 bg-rose-50/50 px-1.5 py-0.5 border border-rose-100 rounded-lg text-xs font-bold">
                {rawMath}
              </span>
            );
          }
        }

        // Render regular text segment with safe bold patterns (**text**)
        return <BoldTextRenderer key={sIdx} text={seg} />;
      })}
    </>
  );
}

function BoldTextRenderer({ text }: { text: string; key?: any }) {
  const parts = text.split(/(\*\*.*?\*\*)/g);

  return (
    <>
      {parts.map((part, pIdx) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          const cleanPart = part.slice(2, -2);
          return (
            <strong key={pIdx} className="font-extrabold text-slate-950 tracking-tight" id={`bold-text-${pIdx}`}>
              {cleanPart}
            </strong>
          );
        }
        return part;
      })}
    </>
  );
}
