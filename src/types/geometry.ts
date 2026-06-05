/**
 * 几何图形结构化数据类型定义
 * AI 返回此结构，前端 GeometryRenderer 组件负责精确绘制。
 */

export type GeometryType = 'grid' | 'coordinate' | 'plane' | 'solid_3d' | 'none';

export type ShapeType =
  | PolygonShape
  | LineShape
  | CircleShape
  | PointShape
  | LabelShape
  | ArcShape;

/** 多边形（三角形、四边形等） */
export interface PolygonShape {
  type: 'polygon';
  points: [number, number][];
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  dashed?: boolean;
}

/** 线段 */
export interface LineShape {
  type: 'line';
  from: [number, number];
  to: [number, number];
  stroke?: string;
  strokeWidth?: number;
  dashed?: boolean;
}

/** 圆 */
export interface CircleShape {
  type: 'circle';
  cx: number;
  cy: number;
  r: number;
  fill?: string;
  stroke?: string;
}

/** 点（实心圆点） */
export interface PointShape {
  type: 'point';
  x: number;
  y: number;
  r?: number;
  fill?: string;
}

/** 文字标签 */
export interface LabelShape {
  type: 'label';
  text: string;
  x: number;
  y: number;
  fontSize?: number;
  color?: string;
  anchor?: 'start' | 'middle' | 'end';
}

/** 角度弧线（用于标注角） */
export interface ArcShape {
  type: 'arc';
  cx: number;
  cy: number;
  r: number;
  startAngle: number; // 角度（0=右，逆时针）
  endAngle: number;
  stroke?: string;
}

// ==================== 三维立体几何类型 ====================

/** 圆柱体（可含水平切割面） */
export interface CylinderSolid {
  type: 'cylinder';
  cx: number;       // 顶部椭圆圆心 x（SVG 坐标，0-300）
  cy: number;       // 顶部椭圆圆心 y（SVG 坐标，0-360）
  rx: number;       // 椭圆半长轴（水平）
  ry: number;       // 椭圆半短轴（垂直，表示透视压缩）
  h: number;        // 圆柱高度（像素）
  fill?: string;
  stroke?: string;
  /** 切割面列表：数字代表横向切割偏量，对象代表其他切割方式 */
  cuts?: (number | { type: 'horizontal', offset: number } | { type: 'vertical', angle?: number })[];
}

/** 圆锥体 */
export interface ConeSolid {
  type: 'cone';
  cx: number;       // 底部椭圆圆心 x
  cy: number;       // 底部椭圆圆心 y（底面中心）
  rx: number;       // 底部椭圆半长轴
  ry: number;       // 底部椭圆半短轴
  h: number;        // 锥高（像素，向上）
  fill?: string;
  stroke?: string;
}

/** 球体 */
export interface SphereSolid {
  type: 'sphere';
  cx: number;
  cy: number;
  r: number;
  fill?: string;
  stroke?: string;
}

/** 长方体（正等轴测图） */
export interface CuboidSolid {
  type: 'cuboid';
  lx: number;   // 左前底角 x
  ty: number;   // 顶面最高点 y
  w: number;    // 宽度（像素，正面宽）
  h: number;    // 高度（像素，正面高）
  d: number;    // 深度（像素，斜向延伸长度）
  fill?: string;
  stroke?: string;
}

/** 3D 文字标签 */
export interface Label3DSolid {
  type: 'label_3d';
  text: string;
  x: number;
  y: number;
  color?: string;
  fontSize?: number;
}

/** 3D 辅助虚线 */
export interface DashedLine3DSolid {
  type: 'dashed_line_3d';
  from: [number, number];
  to: [number, number];
  stroke?: string;
}

export type Solid3DShape =
  | CylinderSolid
  | ConeSolid
  | SphereSolid
  | CuboidSolid
  | Label3DSolid
  | DashedLine3DSolid;

/** 整体几何数据结构 */
export interface GeometryData {
  /** 类型：grid=格点网格 | coordinate=坐标系 | plane=平面几何 | solid_3d=三维立体 | none=无图形 */
  type: GeometryType;
  /** grid 类型专用：网格大小（如 8 表示 8×8） */
  gridSize?: number;
  /** coordinate 类型专用：x 轴范围 [min, max] */
  xRange?: [number, number];
  /** coordinate 类型专用：y 轴范围 [min, max] */
  yRange?: [number, number];
  /** 2D 图形元素列表（grid/coordinate/plane 类型使用） */
  shapes: ShapeType[];
  /** 3D 立体图形元素列表（solid_3d 类型使用） */
  solids?: Solid3DShape[];
}
