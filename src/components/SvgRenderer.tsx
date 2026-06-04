import React from 'react';

interface SvgRendererProps {
  svgCode: string;
  className?: string;
}

/**
 * 安全渲染 AI 生成的 SVG 几何图形。
 *
 * 安全策略：将 SVG 代码转换为 base64 data URI 后通过 <img> 标签加载。
 * 此方式下 SVG 中的 <script>、事件属性（onclick 等）等危险内容完全无法执行，
 * 与 AI 模型类型无关，适用于任意模型的输出。
 */
export default function SvgRenderer({ svgCode, className = '' }: SvgRendererProps) {
  const sanitized = sanitizeSvg(svgCode);

  if (!sanitized) {
    return null;
  }

  // 将净化后的 SVG 转为 base64 data URI
  const base64 = btoa(unescape(encodeURIComponent(sanitized)));
  const dataUri = `data:image/svg+xml;base64,${base64}`;

  return (
    <div
      className={`flex justify-center items-center my-4 p-4 bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto ${className}`}
      id="svg-geometry-figure"
    >
      <img
        src={dataUri}
        alt="AI 生成的几何示意图"
        className="max-w-full h-auto"
        style={{ maxHeight: '280px' }}
        id="svg-geometry-img"
      />
    </div>
  );
}

/**
 * 对 AI 输出的 SVG 做轻量级白名单净化。
 * 移除所有可能执行 JS 的危险内容，保留纯几何绘图标签。
 */
function sanitizeSvg(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';

  let svg = raw.trim();

  // 1. 移除所有 <script>...</script> 块
  svg = svg.replace(/<script[\s\S]*?<\/script>/gi, '');

  // 2. 移除所有事件属性（on开头的属性，如 onclick、onload 等）
  svg = svg.replace(/\s+on[a-z]+\s*=\s*["'][^"']*["']/gi, '');

  // 3. 移除 javascript: 伪协议
  svg = svg.replace(/javascript\s*:/gi, '');

  // 4. 移除 <foreignObject> 标签（可嵌入任意 HTML）
  svg = svg.replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '');

  // 5. 确保 SVG 带有 xmlns 声明（部分 AI 输出会遗漏）
  if (!svg.includes('xmlns=')) {
    svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  }

  return svg;
}
