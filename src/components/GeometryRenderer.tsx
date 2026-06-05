import React, { useState, useEffect, useRef } from 'react';
import type { GeometryData, ShapeType } from '../types/geometry';
import Solid3DRenderer from './Solid3DRenderer';

const W = 300;
const H = 240;
const PAD = 30;

type TFn = (lx: number, ly: number) => [number, number];

/** 根据几何类型创建坐标变换函数（逻辑坐标 → SVG像素坐标） */
function makeTransform(geo: GeometryData): TFn {
  if (geo.type === 'grid') {
    const n = geo.gridSize ?? 8;
    const cw = (W - PAD * 2) / n;
    const ch = (H - PAD * 2) / n;
    // (0,0) 在左下角，Y 轴朝上
    return (lx, ly) => [PAD + lx * cw, H - PAD - ly * ch];
  }
  if (geo.type === 'coordinate') {
    const [xMin, xMax] = geo.xRange ?? [-5, 5];
    const [yMin, yMax] = geo.yRange ?? [-5, 5];
    const sx = (W - PAD * 2) / (xMax - xMin);
    const sy = (H - PAD * 2) / (yMax - yMin);
    return (lx, ly) => [PAD + (lx - xMin) * sx, H - PAD - (ly - yMin) * sy];
  }
  // plane: 逻辑坐标 0-100，(0,0) 在左下角
  const sw = (W - PAD * 2) / 100;
  const sh = (H - PAD * 2) / 100;
  return (lx, ly) => [PAD + lx * sw, H - PAD - ly * sh];
}

/** 逆变换函数（SVG像素坐标 → 逻辑坐标） */
function makeInverseTransform(geo: GeometryData): TFn {
  if (geo.type === 'grid') {
    const n = geo.gridSize ?? 8;
    const cw = (W - PAD * 2) / n;
    const ch = (H - PAD * 2) / n;
    return (px, py) => [(px - PAD) / cw, (H - PAD - py) / ch];
  }
  if (geo.type === 'coordinate') {
    const [xMin, xMax] = geo.xRange ?? [-5, 5];
    const [yMin, yMax] = geo.yRange ?? [-5, 5];
    const sx = (W - PAD * 2) / (xMax - xMin);
    const sy = (H - PAD * 2) / (yMax - yMin);
    return (px, py) => [(px - PAD) / sx + xMin, yMax - (py - PAD) / sy];
  }
  const sw = (W - PAD * 2) / 100;
  const sh = (H - PAD * 2) / 100;
  return (px, py) => [(px - PAD) / sw, (H - PAD - py) / sh];
}

/** 渲染格点网格背景 */
function GridBackground({ n, t }: { n: number; t: TFn }) {
  const lines: React.ReactNode[] = [];
  for (let i = 0; i <= n; i++) {
    const [x1, y1] = t(i, 0);
    const [x2, y2] = t(i, n);
    lines.push(<line key={`v${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#e5e7eb" strokeWidth={0.8} />);
    const [x3, y3] = t(0, i);
    const [x4, y4] = t(n, i);
    lines.push(<line key={`h${i}`} x1={x3} y1={y3} x2={x4} y2={y4} stroke="#e5e7eb" strokeWidth={0.8} />);
  }
  return <>{lines}</>;
}

/** 渲染坐标轴（带刻度、箭头） */
function CoordAxes({ geo, t }: { geo: GeometryData; t: TFn }) {
  const [xMin, xMax] = geo.xRange ?? [-5, 5];
  const [yMin, yMax] = geo.yRange ?? [-5, 5];
  const [ox, oy] = t(0, 0);
  const [axEnd] = t(xMax, 0);
  const [axStart] = t(xMin, 0);
  const [, ayEnd] = t(0, yMax);
  const [, ayStart] = t(0, yMin);

  const xTicks: React.ReactNode[] = [];
  for (let v = Math.ceil(xMin); v <= Math.floor(xMax); v++) {
    if (v === 0) continue;
    const [sx] = t(v, 0);
    xTicks.push(
      <g key={`xt${v}`}>
        <line x1={sx} y1={oy - 3} x2={sx} y2={oy + 3} stroke="#9ca3af" strokeWidth={0.8} />
        <text x={sx} y={oy + 13} fontSize="9" textAnchor="middle" fill="#9ca3af">{v}</text>
      </g>
    );
  }
  const yTicks: React.ReactNode[] = [];
  for (let v = Math.ceil(yMin); v <= Math.floor(yMax); v++) {
    if (v === 0) continue;
    const [, sy] = t(0, v);
    yTicks.push(
      <g key={`yt${v}`}>
        <line x1={ox - 3} y1={sy} x2={ox + 3} y2={sy} stroke="#9ca3af" strokeWidth={0.8} />
        <text x={ox - 6} y={sy + 3} fontSize="9" textAnchor="end" fill="#9ca3af">{v}</text>
      </g>
    );
  }

  return (
    <>
      {/* X 轴 */}
      <line x1={axStart} y1={oy} x2={axEnd} y2={oy} stroke="#6b7280" strokeWidth={1.2} />
      <polygon points={`${axEnd + 7},${oy} ${axEnd},${oy - 3} ${axEnd},${oy + 3}`} fill="#6b7280" />
      <text x={axEnd + 10} y={oy + 4} fontSize="11" fill="#6b7280" fontStyle="italic">x</text>
      {/* Y 轴 */}
      <line x1={ox} y1={ayStart} x2={ox} y2={ayEnd} stroke="#6b7280" strokeWidth={1.2} />
      <polygon points={`${ox},${ayEnd - 7} ${ox - 3},${ayEnd} ${ox + 3},${ayEnd}`} fill="#6b7280" />
      <text x={ox + 4} y={ayEnd - 6} fontSize="11" fill="#6b7280" fontStyle="italic">y</text>
      {/* 原点 */}
      <text x={ox - 12} y={oy + 12} fontSize="10" fill="#6b7280">O</text>
      {xTicks}
      {yTicks}
    </>
  );
}

/** 渲染单个图形元素 */
const SingleGeometryShape: React.FC<{ shape: ShapeType; t: TFn }> = ({ shape, t }) => {
  const stroke = (shape as any).stroke ?? '#374151';
  const strokeWidth = (shape as any).strokeWidth ?? 1.5;

  if (shape.type === 'polygon') {
    const pts = shape.points.map(([lx, ly]) => t(lx, ly).join(',')).join(' ');
    const dashArr = shape.dashed ? '5,3' : undefined;
    return (
      <polygon
        points={pts}
        fill={shape.fill ?? '#eff6ff'}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeDasharray={dashArr}
      />
    );
  }

  if (shape.type === 'line') {
    const [x1, y1] = t(...shape.from);
    const [x2, y2] = t(...shape.to);
    return (
      <line
        x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeDasharray={shape.dashed ? '5,3' : undefined}
      />
    );
  }

  if (shape.type === 'circle') {
    const [cx, cy] = t(shape.cx, shape.cy);
    const [rx0] = t(0, 0);
    const [rx1] = t(shape.r, 0);
    const svgR = Math.abs(rx1 - rx0);
    return (
      <circle cx={cx} cy={cy} r={svgR} fill={shape.fill ?? 'none'} stroke={stroke} strokeWidth={strokeWidth} />
    );
  }

  if (shape.type === 'point') {
    const [cx, cy] = t(shape.x, shape.y);
    return <circle cx={cx} cy={cy} r={shape.r ?? 3} fill={shape.fill ?? '#374151'} />;
  }

  if (shape.type === 'label') {
    const [sx, sy] = t(shape.x, shape.y);
    return (
      <text
        x={sx} y={sy}
        fontSize={shape.fontSize ?? 12}
        fill={shape.color ?? '#1e293b'}
        textAnchor={shape.anchor ?? 'middle'}
        fontFamily="serif"
        fontWeight="bold"
      >
        {shape.text}
      </text>
    );
  }

  if (shape.type === 'arc') {
    const [cx, cy] = t(shape.cx, shape.cy);
    const [rx0] = t(0, 0);
    const [rx1] = t(shape.r, 0);
    const svgR = Math.abs(rx1 - rx0);
    const a1 = (shape.startAngle * Math.PI) / 180;
    const a2 = (shape.endAngle * Math.PI) / 180;
    const x1 = cx + svgR * Math.cos(a1);
    const y1 = cy - svgR * Math.sin(a1); // SVG Y轴翻转
    const x2 = cx + svgR * Math.cos(a2);
    const y2 = cy - svgR * Math.sin(a2);
    const largeArc = Math.abs(shape.endAngle - shape.startAngle) > 180 ? 1 : 0;
    return (
      <path
        d={`M ${x1} ${y1} A ${svgR} ${svgR} 0 ${largeArc} 0 ${x2} ${y2}`}
        fill="none"
        stroke={shape.stroke ?? '#374151'}
        strokeWidth={1}
      />
    );
  }

  return null;
}

type DragTarget = 
  | { type: 'point', lx: number, ly: number }
  | { type: 'label', shapeIndex: number, lx: number, ly: number };

/** 提取所有可交互锚点 */
function extractHandles(shapes: ShapeType[]): DragTarget[] {
  const handles: DragTarget[] = [];
  const pointsMap = new Map<string, { lx: number, ly: number }>();

  shapes.forEach((s, idx) => {
    if (s.type === 'label') {
      handles.push({ type: 'label', shapeIndex: idx, lx: s.x, ly: s.y });
    } else if (s.type === 'point') {
      pointsMap.set(`${s.x.toFixed(4)},${s.y.toFixed(4)}`, { lx: s.x, ly: s.y });
    } else if (s.type === 'polygon') {
      s.points.forEach(([x, y]) => {
        pointsMap.set(`${x.toFixed(4)},${y.toFixed(4)}`, { lx: x, ly: y });
      });
    } else if (s.type === 'line') {
      pointsMap.set(`${s.from[0].toFixed(4)},${s.from[1].toFixed(4)}`, { lx: s.from[0], ly: s.from[1] });
      pointsMap.set(`${s.to[0].toFixed(4)},${s.to[1].toFixed(4)}`, { lx: s.to[0], ly: s.to[1] });
    } else if (s.type === 'circle' || s.type === 'arc') {
      pointsMap.set(`${s.cx.toFixed(4)},${s.cy.toFixed(4)}`, { lx: s.cx, ly: s.cy });
    }
  });

  pointsMap.forEach(v => {
    handles.push({ type: 'point', lx: v.lx, ly: v.ly });
  });

  return handles;
}

/** 几何图形渲染主组件（支持拖拽微调） */
export default function GeometryRenderer({ geometry }: { geometry: GeometryData }) {
  const [localGeo, setLocalGeo] = useState<GeometryData>(geometry);
  const [dragging, setDragging] = useState<DragTarget | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // 当外部数据重置时更新
  useEffect(() => {
    setLocalGeo(geometry);
  }, [geometry]);

  if (!localGeo || localGeo.type === 'none') return null;

  // 三维立体几何：转发给专用渲染器
  if (localGeo.type === 'solid_3d') {
    return <Solid3DRenderer geometry={localGeo} />;
  }

  const t = makeTransform(localGeo);
  const invT = makeInverseTransform(localGeo);
  const handles = extractHandles(localGeo.shapes || []);

  const handlePointerDown = (e: React.PointerEvent<SVGCircleElement>, target: DragTarget) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    setDragging(target);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging || !svgRef.current) return;
    
    // 获取当前鼠标在 SVG 像素坐标系下的位置
    const pt = svgRef.current.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svgRef.current.getScreenCTM();
    if (!ctm) return;
    const svgP = pt.matrixTransform(ctm.inverse());
    
    // 转换为逻辑坐标
    const [newLx, newLy] = invT(svgP.x, svgP.y);

    const deltaX = newLx - dragging.lx;
    const deltaY = newLy - dragging.ly;

    if (Math.abs(deltaX) < 1e-5 && Math.abs(deltaY) < 1e-5) return;

    setLocalGeo(prev => {
      const nextShapes = JSON.parse(JSON.stringify(prev.shapes)) as ShapeType[];
      
      if (dragging.type === 'label') {
        // 单独移动标签
        const lbl = nextShapes[dragging.shapeIndex] as any;
        lbl.x += deltaX;
        lbl.y += deltaY;
      } else {
        // 同步移动所有关联形状
        const isMatch = (x: number, y: number) => {
          return Math.abs(x - dragging.lx) < 0.001 && Math.abs(y - dragging.ly) < 0.001;
        };

        nextShapes.forEach(s => {
          if (s.type === 'point' && isMatch(s.x, s.y)) {
            s.x += deltaX; s.y += deltaY;
          } else if (s.type === 'polygon') {
            s.points.forEach(pt => {
              if (isMatch(pt[0], pt[1])) {
                pt[0] += deltaX; pt[1] += deltaY;
              }
            });
          } else if (s.type === 'line') {
            if (isMatch(s.from[0], s.from[1])) {
              s.from[0] += deltaX; s.from[1] += deltaY;
            }
            if (isMatch(s.to[0], s.to[1])) {
              s.to[0] += deltaX; s.to[1] += deltaY;
            }
          } else if (s.type === 'circle' || s.type === 'arc') {
            if (isMatch(s.cx, s.cy)) {
              s.cx += deltaX; s.cy += deltaY;
            }
          }
        });
      }
      return { ...prev, shapes: nextShapes };
    });

    setDragging({ ...dragging, lx: newLx, ly: newLy });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (dragging) {
      (e.target as Element).releasePointerCapture(e.pointerId);
      setDragging(null);
    }
  };

  return (
    <div
      className="flex justify-center my-4 p-3 bg-white border border-blue-100 rounded-2xl shadow-sm overflow-x-auto relative group"
      id="geometry-figure-container"
    >
      <div className="absolute top-2 right-2 text-[10px] text-blue-500 bg-blue-50 px-2 py-1 rounded font-bold opacity-0 group-hover:opacity-100 transition-opacity no-print pointer-events-none">
        可鼠标拖拽图形节点微调
      </div>
      <svg
        ref={svgRef}
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        xmlns="http://www.w3.org/2000/svg"
        style={{ maxWidth: '100%', touchAction: 'none' }}
        id="geometry-svg"
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <rect width={W} height={H} fill="white" />

        {localGeo.type === 'grid' && (
          <GridBackground n={localGeo.gridSize ?? 8} t={t} />
        )}

        {localGeo.type === 'coordinate' && (
          <CoordAxes geo={localGeo} t={t} />
        )}

        {(localGeo.shapes ?? []).map((shape, i) => (
          <SingleGeometryShape key={i} shape={shape} t={t} />
        ))}

        {/* 交互控制点层（打印时隐藏） */}
        <g className="no-print">
          {handles.map((h, i) => {
            const [px, py] = t(h.lx, h.ly);
            // 标签交互圈可以稍微变色以区分
            const strokeColor = h.type === 'label' ? '#10b981' : '#3b82f6';
            return (
              <circle
                key={`handle-${i}`}
                cx={px}
                cy={py}
                r={12}
                fill="transparent"
                stroke={strokeColor}
                strokeWidth={1.5}
                strokeDasharray="2,2"
                className="opacity-0 hover:opacity-50 transition-opacity cursor-move"
                onPointerDown={(e) => handlePointerDown(e, h)}
              />
            );
          })}
        </g>
      </svg>
    </div>
  );
}
