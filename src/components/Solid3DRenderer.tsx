import React from 'react';
import type { GeometryData, Solid3DShape, CylinderSolid, ConeSolid, SphereSolid, CuboidSolid } from '../types/geometry';
const SW = 800; // SVG 宽
const SH = 320; // SVG 高

// ======================== 圆柱渲染 ========================
function RenderCylinder({ s }: { s: CylinderSolid }) {
  const fill = s.fill ?? '#dbeafe';
  const stroke = s.stroke ?? '#374151';
  const sw = 1.5;
  const { cx, cy, rx, ry, h } = s;
  const by = cy + h; // 底部椭圆中心 y

  // 切割面（水平椭圆），从顶部向下偏移
  const cuts = s.cuts ?? [];
  
  // 统计水平切割的数量，用于前端接管等距计算（防御 AI 算错间距）
  const horizontalCutsCount = cuts.filter(c => typeof c === 'number' || (typeof c === 'object' && c.type === 'horizontal')).length;
  const horizontalSpacing = horizontalCutsCount > 0 ? h / (horizontalCutsCount + 1) : 0;
  let currentHorizontalIndex = 0;

  // 收集需要渲染在最顶层的切割线（顶面切线与前面竖线）
  const frontCutLines: React.JSX.Element[] = [];

  return (
    <g>
      {/* 侧面矩形 */}
      <path
        d={`M ${cx - rx} ${cy} L ${cx - rx} ${by} A ${rx} ${ry} 0 0 0 ${cx + rx} ${by} L ${cx + rx} ${cy}`}
        fill={fill}
        stroke={stroke}
        strokeWidth={sw}
      />
      {/* 切割面（水平或竖直） */}
      {cuts.map((cut, i) => {
        if (typeof cut === 'number' || (typeof cut === 'object' && cut.type === 'horizontal')) {
          currentHorizontalIndex++;
          // 强制前端接管间距计算，忽略 AI 给出的错误 offset
          const offset = horizontalSpacing * currentHorizontalIndex;
          const cutY = cy + offset;
          return (
            <ellipse
              key={i}
              cx={cx}
              cy={cutY}
              rx={rx}
              ry={ry}
              fill="none"
              stroke={stroke}
              strokeWidth={1}
              strokeDasharray="5,3"
            />
          );
        } else if (typeof cut === 'object' && cut.type === 'vertical') {
          // 纵向切割面
          const angle = cut.angle ?? (Math.PI / 6 + i * (Math.PI / 4));
          let xA = cx - rx * Math.cos(angle);
          let yA = cy - ry * Math.sin(angle);
          let xB = cx + rx * Math.cos(angle);
          let yB = cy + ry * Math.sin(angle);
          
          // 确保 B 点在前方 (y 值较大)，A 点在后方 (y 值较小)
          if (yA > yB) {
            const tempX = xA; xA = xB; xB = tempX;
            const tempY = yA; yA = yB; yB = tempY;
          }
          // 将可见的实线（顶面、前面）保存到数组，等顶部椭圆画完后再画
          frontCutLines.push(
            <g key={`front-${i}`}>
              {/* 顶部切线 (可见，实线) */}
              <line x1={xA} y1={yA} x2={xB} y2={yB} stroke={stroke} strokeWidth={1} />
              {/* 前方垂直切线 (可见，实线) */}
              <line x1={xB} y1={yB} x2={xB} y2={yB + h} stroke={stroke} strokeWidth={1} />
            </g>
          );
          
          return (
            <g key={`back-${i}`}>
              {/* 底部切线 (不可见，虚线) */}
              <line x1={xA} y1={yA + h} x2={xB} y2={yB + h} stroke={stroke} strokeWidth={1} strokeDasharray="5,3" />
              {/* 后方垂直切线 (不可见，虚线) */}
              <line x1={xA} y1={yA} x2={xA} y2={yA + h} stroke={stroke} strokeWidth={1} strokeDasharray="5,3" />
            </g>
          );
        }
        return null;
      })}
      {/* 底部椭圆（半圆可见）注意这里必须填 none 否则会遮住刚才画的底部切线虚线 */}
      <path
        d={`M ${cx - rx} ${by} A ${rx} ${ry} 0 0 0 ${cx + rx} ${by}`}
        fill="none"
        stroke={stroke}
        strokeWidth={sw}
      />
      <path
        d={`M ${cx - rx} ${by} A ${rx} ${ry} 0 0 1 ${cx + rx} ${by}`}
        fill="none"
        stroke={stroke}
        strokeWidth={sw * 0.6}
        strokeDasharray="4,3"
      />
      {/* 顶部椭圆（完整可见） */}
      <ellipse
        cx={cx}
        cy={cy}
        rx={rx}
        ry={ry}
        fill={fill}
        stroke={stroke}
        strokeWidth={sw}
      />
      {/* 将顶面切线与前面切线渲染在最上层，避免被顶部椭圆遮挡 */}
      {frontCutLines}
    </g>
  );
}

// ======================== 圆锥渲染 ========================
function RenderCone({ s }: { s: ConeSolid }) {
  const fill = s.fill ?? '#dcfce7';
  const stroke = s.stroke ?? '#374151';
  const sw = 1.5;
  const { cx, cy, rx, ry, h } = s;
  const apexY = cy - h; // 顶点 y（向上）

  return (
    <g>
      {/* 侧面（两条边线到顶点） */}
      <path
        d={`M ${cx - rx} ${cy} L ${cx} ${apexY} L ${cx + rx} ${cy}`}
        fill={fill}
        stroke={stroke}
        strokeWidth={sw}
      />
      {/* 底部椭圆正面 */}
      <path
        d={`M ${cx - rx} ${cy} A ${rx} ${ry} 0 0 0 ${cx + rx} ${cy}`}
        fill={fill}
        stroke={stroke}
        strokeWidth={sw}
      />
      {/* 底部椭圆背面（虚线） */}
      <path
        d={`M ${cx - rx} ${cy} A ${rx} ${ry} 0 0 1 ${cx + rx} ${cy}`}
        fill="none"
        stroke={stroke}
        strokeWidth={sw * 0.6}
        strokeDasharray="4,3"
      />
    </g>
  );
}

// ======================== 球体渲染 ========================
function RenderSphere({ s }: { s: SphereSolid }) {
  const fill = s.fill ?? '#fef9c3';
  const stroke = s.stroke ?? '#374151';
  const { cx, cy, r } = s;
  // 赤道椭圆（压缩为 0.3 倍 ry）
  const equatorialRy = r * 0.28;

  return (
    <g>
      {/* 球体主圆 */}
      <circle cx={cx} cy={cy} r={r} fill={fill} stroke={stroke} strokeWidth={1.5} />
      {/* 赤道椭圆（虚线） */}
      <ellipse
        cx={cx}
        cy={cy}
        rx={r}
        ry={equatorialRy}
        fill="none"
        stroke={stroke}
        strokeWidth={1}
        strokeDasharray="4,3"
      />
    </g>
  );
}

// ======================== 长方体渲染（正等轴测） ========================
function RenderCuboid({ s }: { s: CuboidSolid }) {
  const fill = s.fill ?? '#e0f2fe';
  const stroke = s.stroke ?? '#374151';
  const sw = 1.5;
  // 斜向偏移（模拟等轴测视角）
  const dx = s.d * 0.7;  // 水平偏移
  const dy = s.d * 0.4;  // 垂直偏移

  const { lx, ty, w, h } = s;

  // 8个顶点（前面4个 + 后面4个）
  // 前面左下
  const flb = [lx, ty + h];
  // 前面左上
  const flt = [lx, ty];
  // 前面右上
  const frt = [lx + w, ty];
  // 前面右下
  const frb = [lx + w, ty + h];
  // 后面左上
  const blt = [lx + dx, ty - dy];
  // 后面右上
  const brt = [lx + w + dx, ty - dy];
  // 后面右下
  const brb = [lx + w + dx, ty + h - dy];

  const pt = (p: number[]) => `${p[0]},${p[1]}`;

  return (
    <g>
      {/* 右侧面（浅色） */}
      <polygon
        points={`${pt(frt)} ${pt(brt)} ${pt(brb)} ${pt(frb)}`}
        fill={fill}
        stroke={stroke}
        strokeWidth={sw}
        style={{ filter: 'brightness(0.85)' }}
      />
      {/* 正面 */}
      <polygon
        points={`${pt(flb)} ${pt(flt)} ${pt(frt)} ${pt(frb)}`}
        fill={fill}
        stroke={stroke}
        strokeWidth={sw}
      />
      {/* 顶面（浅色偏白） */}
      <polygon
        points={`${pt(flt)} ${pt(blt)} ${pt(brt)} ${pt(frt)}`}
        fill={fill}
        stroke={stroke}
        strokeWidth={sw}
        style={{ filter: 'brightness(1.15)' }}
      />
    </g>
  );
}

// ======================== 单个 3D 图元分发渲染 ========================
const Solid3DShapeComponent: React.FC<{ shape: Solid3DShape }> = ({ shape }) => {
  if (shape.type === 'cylinder') return <RenderCylinder s={shape} />;
  if (shape.type === 'cone') return <RenderCone s={shape} />;
  if (shape.type === 'sphere') return <RenderSphere s={shape} />;
  if (shape.type === 'cuboid') return <RenderCuboid s={shape} />;
  if (shape.type === 'label_3d') {
    return (
      <text
        x={shape.x}
        y={shape.y}
        fontSize={shape.fontSize ?? 12}
        fill={shape.color ?? '#1e293b'}
        textAnchor="middle"
        fontFamily="serif"
        fontWeight="bold"
      >
        {shape.text}
      </text>
    );
  }
  if (shape.type === 'dashed_line_3d') {
    return (
      <line
        x1={shape.from[0]}
        y1={shape.from[1]}
        x2={shape.to[0]}
        y2={shape.to[1]}
        stroke={shape.stroke ?? '#374151'}
        strokeWidth={1}
        strokeDasharray="5,3"
      />
    );
  }
  return null;
}

// ======================== 主组件 ========================
export default function Solid3DRenderer({ geometry }: { geometry: GeometryData }) {
  const solids = geometry.solids ?? [];

  if (solids.length === 0) return null;

  return (
    <div
      className="flex justify-center my-4 p-3 bg-white border border-blue-100 rounded-2xl shadow-sm overflow-x-auto"
      id="solid-3d-figure-container"
    >
      <svg
        width={SW}
        height={SH}
        viewBox={`0 0 ${SW} ${SH}`}
        xmlns="http://www.w3.org/2000/svg"
        style={{ maxWidth: '100%' }}
        id="solid-3d-svg"
      >
        <rect width={SW} height={SH} fill="white" />
        {solids.map((shape, i) => (
          <Solid3DShapeComponent key={i} shape={shape} />
        ))}
      </svg>
    </div>
  );
}
