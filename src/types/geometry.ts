/**
 * 几何图形结构化数据类型定义
 * AI 返回此结构，前端 GeometryRenderer 组件负责精确绘制。
 */

export type GeometryType = 'grid' | 'coordinate' | 'plane' | 'none';

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

/** 整体几何数据结构 */
export interface GeometryData {
  /** 类型：grid=格点网格 | coordinate=坐标系 | plane=平面几何 | none=无图形 */
  type: GeometryType;
  /** grid 类型专用：网格大小（如 8 表示 8×8） */
  gridSize?: number;
  /** coordinate 类型专用：x 轴范围 [min, max] */
  xRange?: [number, number];
  /** coordinate 类型专用：y 轴范围 [min, max] */
  yRange?: [number, number];
  /** 所有图形元素 */
  shapes: ShapeType[];
}
