import React, { useState, useEffect, useRef } from 'react';
import { CheckCircle2, XCircle, Loader2, Eye, Clock, GraduationCap, Upload, MousePointer, Scissors, X, Link2, Lock, Trash2, AlertTriangle } from 'lucide-react';
import FormattedMath from './FormattedMath';

const API_PREFIX = '/api';

function getHeaders(): HeadersInit {
  const token = localStorage.getItem('errorbook_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
}

// 文件转 Base64
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// 选区（百分比坐标）
interface QuadBox {
  id: string;
  p0: { x: number; y: number };
  p1: { x: number; y: number };
  p2: { x: number; y: number };
  p3: { x: number; y: number };
}

// 框选裁剪（独立实现）
function cropBoxes(imageStr: string, boxes: QuadBox[], mimeType: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const results: string[] = [];
        boxes.forEach((box) => {
          const p0 = { x: (box.p0.x / 100) * img.naturalWidth, y: (box.p0.y / 100) * img.naturalHeight };
          const p2 = { x: (box.p2.x / 100) * img.naturalWidth, y: (box.p2.y / 100) * img.naturalHeight };
          const sourceX = Math.min(p0.x, p2.x);
          const sourceY = Math.min(p0.y, p2.y);
          let sourceW = Math.abs(p2.x - p0.x);
          let sourceH = Math.abs(p2.y - p0.y);
          if (sourceW < 1) sourceW = 1;
          if (sourceH < 1) sourceH = 1;
          let destW = Math.round(sourceW);
          let destH = Math.round(sourceH);
          const maxDim = 1600;
          if (destW > maxDim || destH > maxDim) {
            const ratio = Math.min(maxDim / destW, maxDim / destH);
            destW = Math.round(destW * ratio);
            destH = Math.round(destH * ratio);
          }
          const canvasDst = document.createElement('canvas');
          canvasDst.width = destW;
          canvasDst.height = destH;
          const ctxDst = canvasDst.getContext('2d');
          if (!ctxDst) throw new Error('Canvas 2D context not supported');
          ctxDst.imageSmoothingEnabled = true;
          ctxDst.imageSmoothingQuality = 'high';
          ctxDst.drawImage(img, sourceX, sourceY, sourceW, sourceH, 0, 0, destW, destH);
          results.push(canvasDst.toDataURL(mimeType, 0.95));
        });
        resolve(results);
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error('加载原始图片失败，无法进行区域裁剪'));
    img.src = imageStr;
  });
}

interface CorrectTask {
  id: string;
  taskName: string;
  status: string;
  progress: number;
  notebookId: string | null;
  payload: any;
  createdAt: number;
  errorMsg?: string;
}

const REVIEW_STATUS: Record<string, string> = {
  queued: '排队中',
  extracting: 'OCR识别中',
  diagnosing: '错因分析中',
  generating_answer: '解题生成中',
  pending_diagnose_review: '待审查',
  completed: '已归档',
  failed: '已驳回/失败'
};

export default function ProofreadReview({ defaultStudent }: { defaultStudent?: string }) {
  const [tasks, setTasks] = useState<CorrectTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [needStudentModal, setNeedStudentModal] = useState(false); // 未选择学生弹窗
  const [detailTask, setDetailTask] = useState<CorrectTask | null>(null);
  const [editedReasons, setEditedReasons] = useState<Record<number, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);

  // 框选编辑状态
  const [editImage, setEditImage] = useState<string | null>(null);
  const [editMime, setEditMime] = useState('image/jpeg');
  const [boxes, setBoxes] = useState<QuadBox[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState({ x: 0, y: 0 });
  const [drawCur, setDrawCur] = useState({ x: 0, y: 0 });
  const [recognizing, setRecognizing] = useState(false);
  // 二次编辑：当前选中（锁定）编辑的框 id
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editType, setEditType] = useState<string | null>(null);
  const editStartRef = useRef<{ id: string; type: string; x: number; y: number; startBox: QuadBox | null } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const loadTasks = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_PREFIX}/tasks?status=active`, { headers: getHeaders() });
      if (!res.ok) throw new Error('加载任务失败');
      const text = await res.text();
      if (!text) { setTasks([]); return; }
      const data = JSON.parse(text);
      if (!Array.isArray(data)) { setTasks([]); return; }
      // 作业批改 + AI解题答案均进入待审查统一复查归档
      const correctTasks = data.filter((t: any) => t.uploadMode === 'correct_task' || t.uploadMode === 'quick_answer_direct');
      setTasks(correctTasks);
    } catch (e: any) {
      setMsg({ type: 'error', text: e.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
    const timer = setInterval(loadTasks, 5000);
    return () => clearInterval(timer);
  }, []);

  // 加载已完成并绑定学生的 AI 解题错题（供复用）
  const [boundQuestions, setBoundQuestions] = useState<any[]>([]);
  const [reuseLoading, setReuseLoading] = useState(false);
  const loadBoundQuestions = async () => {
    try {
      const res = await fetch(`${API_PREFIX}/jiaoxue/quick-answer-bound-questions`, { headers: getHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) setBoundQuestions(data);
    } catch (e) {
      console.error("load bound questions failed", e);
    }
  };
  useEffect(() => {
    loadBoundQuestions();
  }, []);

  // 复用 AI 解题错题：加载其原题图片进入框选界面
  const handleReuseQuestion = async (qid: string) => {
    const item = boundQuestions.find((b: any) => b.id === qid);
    if (!item) return;
    setReuseLoading(true);
    setUploadMsg(null);
    try {
      // 优先使用物理图片路径（savedImageUrl），否则回退到标准答案文本兜底
      let imageStr: string | null = null;
      if (item.imageUrl) {
        const resp = await fetch(item.imageUrl);
        const blob = await resp.blob();
        imageStr = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      }
      if (!imageStr) {
        setUploadMsg('该题目缺少原图，无法复用，请直接上传图片');
        return;
      }
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('图片加载失败'));
        img.src = imageStr;
      });
      const maxDim = 1800;
      let width = img.naturalWidth, height = img.naturalHeight;
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 不支持');
      ctx.drawImage(img, 0, 0, width, height);
      setEditImage(canvas.toDataURL('image/jpeg', 0.9));
      setEditMime('image/jpeg');
      setBoxes([]);
      setSelectedBoxId(null);
      setUploadMsg(`已复用 AI 解题题目：${item.originalText?.slice(0, 40) || item.taskName || '未命名'}，请在下方框选要批改的区域`);
    } catch (e: any) {
      setUploadMsg(e.message || '复用图片加载失败');
    } finally {
      setReuseLoading(false);
    }
  };

  // ===== 上传 → 进入框选 =====
  const handleSelectFile = async (file: File) => {
    setUploadMsg(null);
    try {
      const base64 = await fileToBase64(file);
      // 压缩
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('图片加载失败'));
        img.src = base64;
      });
      const maxDim = 1800;
      let width = img.naturalWidth, height = img.naturalHeight;
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 不支持');
      ctx.drawImage(img, 0, 0, width, height);
      setEditImage(canvas.toDataURL('image/jpeg', 0.9));
      setEditMime('image/jpeg');
      setBoxes([]);
      setSelectedBoxId(null);
    } catch (e: any) {
      setUploadMsg(e.message || '图片处理失败');
    }
  };

  // ===== 框选交互（支持二次编辑：拖动角/边改大小、拖动内部移动） =====

  // 命中控制点
  const hitControlPoint = (box: QuadBox, x: number, y: number): string | null => {
    const T = 4;
    const pts: { k: string; px: number; py: number }[] = [
      { k: 'nw', px: box.p0.x, py: box.p0.y },
      { k: 'ne', px: box.p2.x, py: box.p0.y },
      { k: 'sw', px: box.p0.x, py: box.p2.y },
      { k: 'se', px: box.p2.x, py: box.p2.y },
      { k: 'n', px: (box.p0.x + box.p2.x) / 2, py: box.p0.y },
      { k: 's', px: (box.p0.x + box.p2.x) / 2, py: box.p2.y },
      { k: 'e', px: box.p2.x, py: (box.p0.y + box.p2.y) / 2 },
      { k: 'w', px: box.p0.x, py: (box.p0.y + box.p2.y) / 2 }
    ];
    for (const p of pts) {
      if (Math.abs(x - p.px) <= T && Math.abs(y - p.py) <= T) return p.k;
    }
    return null;
  };

  const hitBoxInside = (box: QuadBox, x: number, y: number): boolean => {
    const minX = Math.min(box.p0.x, box.p2.x), maxX = Math.max(box.p0.x, box.p2.x);
    const minY = Math.min(box.p0.y, box.p2.y), maxY = Math.max(box.p0.y, box.p2.y);
    return x >= minX && x <= maxX && y >= minY && y <= maxY;
  };

  const clampBox = (box: QuadBox): QuadBox => {
    let x0 = Math.max(0, Math.min(100, Math.min(box.p0.x, box.p2.x)));
    let y0 = Math.max(0, Math.min(100, Math.min(box.p0.y, box.p2.y)));
    let x1 = Math.max(0, Math.min(100, Math.max(box.p0.x, box.p2.x)));
    let y1 = Math.max(0, Math.min(100, Math.max(box.p0.y, box.p2.y)));
    if (x1 - x0 < 1) x1 = x0 + 1;
    if (y1 - y0 < 1) y1 = y0 + 1;
    return { id: box.id, p0: { x: x0, y: y0 }, p1: { x: x1, y: y0 }, p2: { x: x1, y: y1 }, p3: { x: x0, y: y1 } };
  };

  const startEdit = (id: string, type: string, x: number, y: number) => {
    setSelectedBoxId(id);
    setEditing(true);
    setEditType(type);
    setDrawing(false);
    editStartRef.current = { id, type, x, y, startBox: boxes.find(b => b.id === id) || null };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    if (selectedBoxId) {
      const box = boxes.find(b => b.id === selectedBoxId);
      if (box) {
        const cp = hitControlPoint(box, x, y);
        if (cp) { startEdit(selectedBoxId, cp, x, y); return; }
        if (hitBoxInside(box, x, y)) { startEdit(selectedBoxId, 'move', x, y); return; }
      }
    }
    setDrawing(true);
    setDrawStart({ x, y });
    setDrawCur({ x, y });
  };

  const applyEdit = (box: QuadBox, type: string, x: number, y: number): QuadBox => {
    const st = editStartRef.current;
    if (!st || !st.startBox) return box;
    const b = st.startBox;
    let x0 = b.p0.x, y0 = b.p0.y, x1 = b.p2.x, y1 = b.p2.y;
    switch (type) {
      case 'move': { const dx = x - st.x, dy = y - st.y; x0 += dx; y0 += dy; x1 += dx; y1 += dy; break; }
      case 'nw': x0 = x; y0 = y; break;
      case 'ne': x1 = x; y0 = y; break;
      case 'sw': x0 = x; y1 = y; break;
      case 'se': x1 = x; y1 = y; break;
      case 'n': y0 = y; break;
      case 's': y1 = y; break;
      case 'e': x1 = x; break;
      case 'w': x0 = x; break;
    }
    return clampBox({ id: box.id, p0: { x: x0, y: y0 }, p1: { x: x1, y: y0 }, p2: { x: x1, y: y1 }, p3: { x: x0, y: y1 } });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    if (editing && editType && editStartRef.current) {
      setBoxes(prev => prev.map(b => b.id === editStartRef.current!.id ? applyEdit(b, editType!, x, y) : b));
      return;
    }
    if (drawing) setDrawCur({ x, y });
  };

  const handleMouseUp = () => {
    if (editing) { setEditing(false); setEditType(null); editStartRef.current = null; return; }
    if (!drawing) return;
    setDrawing(false);
    const x = Math.min(drawStart.x, drawCur.x);
    const y = Math.min(drawStart.y, drawCur.y);
    const w = Math.abs(drawCur.x - drawStart.x);
    const h = Math.abs(drawCur.y - drawStart.y);
    if (w > 1.5 && h > 1.5) {
      const newBox: QuadBox = {
        id: 'box_' + Math.random().toString(36).substring(2, 9),
        p0: { x, y }, p1: { x: x + w, y }, p2: { x: x + w, y: y + h }, p3: { x, y: y + h }
      };
      setBoxes(prev => [...prev, newBox]);
      setSelectedBoxId(newBox.id);
    }
  };

  const deleteBox = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setBoxes(prev => prev.filter(b => b.id !== id));
    if (selectedBoxId === id) setSelectedBoxId(null);
  };

  // ===== 触摸框选（手机端支持，含二次编辑） =====
  const getTouchPoint = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!containerRef.current) return null;
    const rect = containerRef.current.getBoundingClientRect();
    const touch = e.touches[0];
    if (!touch) return null;
    return {
      x: Math.max(0, Math.min(100, ((touch.clientX - rect.left) / rect.width) * 100)),
      y: Math.max(0, Math.min(100, ((touch.clientY - rect.top) / rect.height) * 100))
    };
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const p = getTouchPoint(e);
    if (!p) return;
    if (selectedBoxId) {
      const box = boxes.find(b => b.id === selectedBoxId);
      if (box) {
        const cp = hitControlPoint(box, p.x, p.y);
        if (cp) { startEdit(selectedBoxId, cp, p.x, p.y); return; }
        if (hitBoxInside(box, p.x, p.y)) { startEdit(selectedBoxId, 'move', p.x, p.y); return; }
      }
    }
    setDrawing(true);
    setDrawStart(p);
    setDrawCur(p);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const p = getTouchPoint(e);
    if (!p) return;
    if (editing && editType && editStartRef.current) {
      setBoxes(prev => prev.map(b => b.id === editStartRef.current!.id ? applyEdit(b, editType!, p.x, p.y) : b));
      return;
    }
    if (drawing) setDrawCur(p);
  };

  const handleTouchEnd = () => {
    if (editing) { setEditing(false); setEditType(null); editStartRef.current = null; return; }
    if (!drawing) return;
    setDrawing(false);
    const x = Math.min(drawStart.x, drawCur.x);
    const y = Math.min(drawStart.y, drawCur.y);
    const w = Math.abs(drawCur.x - drawStart.x);
    const h = Math.abs(drawCur.y - drawStart.y);
    if (w > 1.5 && h > 1.5) {
      const newBox: QuadBox = {
        id: 'box_' + Math.random().toString(36).substring(2, 9),
        p0: { x, y }, p1: { x: x + w, y }, p2: { x: x + w, y: y + h }, p3: { x, y: y + h }
      };
      setBoxes(prev => [...prev, newBox]);
      setSelectedBoxId(newBox.id);
    }
  };

  // ===== 开始批改：每个切片区域单独创建任务（串行提交，线程池自动排队） =====
  const handleStartCorrect = async () => {
    if (!editImage) return;
    if (boxes.length === 0) {
      setUploadMsg('请先在图片上拖拽框选要批改的题目区域');
      return;
    }
    if (!defaultStudent) {
      setNeedStudentModal(true);
      return;
    }
    setRecognizing(true);
    setUploadMsg(null);
    try {
      const croppedImages = await cropBoxes(editImage, boxes, editMime);
      let success = 0;
      // 逐个切片提交任务（串行：每提交一个就等待返回，线程池内同账号自动串行处理）
      for (let i = 0; i < croppedImages.length; i++) {
        const singleCrop = croppedImages[i];
        try {
          const res = await fetch(`${API_PREFIX}/jiaoxue/correct-task`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({
              taskName: `批改题目${i + 1} ${new Date().toLocaleTimeString()}`,
              imageBase64: singleCrop,
              mimeType: editMime,
              studentUsername: defaultStudent
            })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || '提交失败');
          success++;
        } catch (e: any) {
          console.error(`批改题目${i + 1} 提交失败:`, e.message);
        }
      }
      setUploadMsg(`已提交 ${success} 个批改任务（每个框选区域独立批改，串行处理），完成后自动进入待审查`);
      setEditImage(null);
      setBoxes([]);
      setSelectedBoxId(null);
      loadTasks();
    } catch (e: any) {
      setUploadMsg(e.message || '批改提交失败');
    } finally {
      setRecognizing(false);
    }
  };

  const handleReview = async (task: CorrectTask, approved: boolean) => {
    setSubmitting(true);
    setMsg(null);
    try {
      // 若老师修改了某题的错因，则用修改后的内容覆盖
      const base = Array.isArray(task.payload?.diagnosedQuestions) ? [...task.payload.diagnosedQuestions] : [];
      const finalDiagnosed = base.map((q: any, i: number) => {
        if (editedReasons[i] !== undefined) {
          return { ...q, errorReason: editedReasons[i] };
        }
        return q;
      });
      const res = await fetch(`${API_PREFIX}/jiaoxue/correct-task/${task.id}/review`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          approved,
          diagnosedQuestions: finalDiagnosed,
          studentId: defaultStudent || task.payload?.studentId
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '操作失败');
      setMsg({ type: 'success', text: data.message || (approved ? '已归档到学生错题本' : '已驳回') });
      setDetailTask(null);
      loadTasks();
    } catch (e: any) {
      setMsg({ type: 'error', text: e.message });
    } finally {
      setSubmitting(false);
    }
  };

  const pendingCount = tasks.filter(t => t.status === 'pending_diagnose_review').length;

  // ===== 框选编辑视图 =====
  if (editImage) {
    return (
      <div className="space-y-5">
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 gap-3">
            <div>
              <h3 className="font-black text-slate-800 flex items-center gap-2">
                <MousePointer className="w-4 h-4 text-indigo-600" />框选要批改的题目
              </h3>
              <p className="text-xs text-slate-400 font-medium mt-1">在图片上<b className="text-indigo-600">拖拽/滑动</b>框选要批改的题目，可框选多个；每个区域将<b className="text-indigo-600">单独</b>裁剪并提交为独立批改任务（串行处理）</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-start md:justify-end">
              <button onClick={() => { setEditImage(null); setBoxes([]); setSelectedBoxId(null); }} className="px-3 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition cursor-pointer flex items-center gap-1"><X className="w-3.5 h-3.5" />取消</button>
              <button onClick={handleStartCorrect} disabled={recognizing || boxes.length === 0} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 disabled:opacity-50 transition cursor-pointer">
                {recognizing ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />提交中...</> : <><Scissors className="w-3.5 h-3.5" />开始批改 {boxes.length > 0 ? `(${boxes.length}个区域)` : ''}</>}
              </button>
            </div>
          </div>

          {!defaultStudent && <div className="mb-3 px-4 py-2.5 bg-amber-50 text-amber-600 rounded-xl text-xs font-semibold">请先在顶部选择目标学生</div>}
          {uploadMsg && <div className="mb-3 px-4 py-2.5 bg-rose-50 text-rose-600 rounded-xl text-xs font-semibold">{uploadMsg}</div>}

          {/* 未选择学生弹窗 */}
          {needStudentModal && (
            <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-6 text-center">
                <div className="w-14 h-14 mx-auto mb-4 bg-amber-50 rounded-full flex items-center justify-center"><AlertTriangle className="w-7 h-7 text-amber-500" /></div>
                <h3 className="font-black text-slate-800 mb-2 text-lg">请先选择学生</h3>
                <p className="text-sm text-slate-500 font-medium mb-6">批改后的题目需要归档到学生错题本，请先在顶部选择目标学生后再开始批改。</p>
                <div className="flex gap-3 justify-center">
                  <button onClick={() => setNeedStudentModal(false)} className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold cursor-pointer transition">我知道了</button>
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-col md:flex-row gap-4">
            {/* 图片框选区 */}
            <div className="flex-1 min-w-0">
              <div
                ref={containerRef}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onTouchCancel={handleTouchEnd}
                className="relative border-2 border-dashed border-slate-200 rounded-2xl overflow-hidden select-none cursor-crosshair bg-slate-50 touch-none"
              >
                <img src={editImage} alt="待框选" className="w-full h-auto block" draggable={false} />
                {boxes.map(box => {
                  const idx = boxes.findIndex(b => b.id === box.id) + 1;
                  const isSel = box.id === selectedBoxId;
                  const isGrey = selectedBoxId && !isSel && editing;
                  return (
                    <div key={box.id} className={`absolute border-2 ${isSel ? 'border-indigo-600 bg-indigo-500/15' : isGrey ? 'border-slate-300 bg-slate-300/10 pointer-events-none' : 'border-indigo-400 bg-indigo-400/10 pointer-events-none'}`}
                      style={{ left: `${box.p0.x}%`, top: `${box.p0.y}%`, width: `${box.p2.x - box.p0.x}%`, height: `${box.p2.y - box.p0.y}%` }}>
                      {isSel && (
                        <button onClick={e => deleteBox(box.id, e)} className="absolute -top-3 -right-3 w-6 h-6 bg-rose-500 text-white rounded-full flex items-center justify-center shadow cursor-pointer"><X className="w-3 h-3" /></button>
                      )}
                      <span className={`absolute -top-5 left-0 text-[10px] font-black bg-white px-1.5 rounded shadow-sm ${isSel ? 'text-indigo-600' : 'text-slate-500'}`}>框{idx}</span>
                    </div>
                  );
                })}
                {/* 选中框的 8 个控制点 */}
                {selectedBoxId && (() => {
                  const box = boxes.find(b => b.id === selectedBoxId);
                  if (!box) return null;
                  const controls: { k: string; left: number; top: number; cls: string }[] = [
                    { k: 'nw', left: box.p0.x, top: box.p0.y, cls: 'cursor-nwse-resize' },
                    { k: 'ne', left: box.p2.x, top: box.p0.y, cls: 'cursor-nesw-resize' },
                    { k: 'sw', left: box.p0.x, top: box.p2.y, cls: 'cursor-nesw-resize' },
                    { k: 'se', left: box.p2.x, top: box.p2.y, cls: 'cursor-nwse-resize' },
                    { k: 'n', left: (box.p0.x + box.p2.x) / 2, top: box.p0.y, cls: 'cursor-ns-resize' },
                    { k: 's', left: (box.p0.x + box.p2.x) / 2, top: box.p2.y, cls: 'cursor-ns-resize' },
                    { k: 'e', left: box.p2.x, top: (box.p0.y + box.p2.y) / 2, cls: 'cursor-ew-resize' },
                    { k: 'w', left: box.p0.x, top: (box.p0.y + box.p2.y) / 2, cls: 'cursor-ew-resize' }
                  ];
                  return controls.map(c => (
                    <div key={c.k} className={`absolute w-3 h-3 bg-white border-2 border-indigo-600 rounded-full ${c.cls}`}
                      style={{ left: `calc(${c.left}% - 6px)`, top: `calc(${c.top}% - 6px)` }} />
                  ));
                })()}
                {drawing && (
                  <div className="absolute border-2 border-indigo-400 bg-indigo-400/20"
                    style={{ left: `${Math.min(drawStart.x, drawCur.x)}%`, top: `${Math.min(drawStart.y, drawCur.y)}%`, width: `${Math.abs(drawCur.x - drawStart.x)}%`, height: `${Math.abs(drawCur.y - drawStart.y)}%` }} />
                )}
              </div>
              <div className="mt-3 text-xs text-slate-400 font-bold flex items-center gap-2 flex-wrap">
                <Scissors className="w-3.5 h-3.5" />已框选 {boxes.length} 个区域
                {selectedBoxId ? (
                  <span className="text-emerald-600">（正在编辑框{boxes.findIndex(b => b.id === selectedBoxId) + 1}：拖动角/边改大小，拖动内部移动，其他框已灰化防误触）</span>
                ) : (
                  <span className="text-amber-600">（在图片上拖动框选题目，框选后从右侧列表点选某框可锁定并二次编辑大小）</span>
                )}
              </div>
            </div>

            {/* 框选区域列表 */}
            <div className="w-full md:w-56 shrink-0">
              <div className="bg-slate-50 rounded-2xl border border-slate-200 p-3">
                <div className="text-xs font-black text-slate-700 mb-2 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-indigo-600" />已框选区域
                  <span className="text-[10px] text-slate-400 font-bold ml-auto">{boxes.length} 个</span>
                </div>
                {boxes.length === 0 ? (
                  <p className="text-[11px] text-slate-400 font-bold py-2">暂无框选，请在图片上拖动框选题目</p>
                ) : (
                  <div className="space-y-1.5">
                    {boxes.map((box, i) => {
                      const isSel = box.id === selectedBoxId;
                      return (
                        <div
                          key={box.id}
                          onClick={() => setSelectedBoxId(isSel ? null : box.id)}
                          className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border text-xs font-bold cursor-pointer transition ${isSel ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-400'}`}
                        >
                          <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-black shrink-0 ${isSel ? 'bg-white/20' : 'bg-indigo-50 text-indigo-600'}`}>{i + 1}</span>
                          <span className="flex-1 truncate">框{i + 1}</span>
                          <button
                            onClick={e => { e.stopPropagation(); deleteBox(box.id, e as any); }}
                            title="删除该框"
                            className={`w-6 h-6 rounded-md flex items-center justify-center transition shrink-0 ${isSel ? 'bg-white/20 hover:bg-white/30 text-white' : 'text-slate-400 hover:bg-rose-50 hover:text-rose-600'}`}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
                <p className="text-[10px] text-slate-400 font-medium mt-2 leading-relaxed">点选某框后即可拖动<b className="text-indigo-600">四角/边缘</b>改大小、拖动<b className="text-indigo-600">内部</b>移动位置，其他框自动灰化避免误触。</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ===== 主视图 =====
  return (
    <div className="space-y-5">
      <div className="flex items-start md:items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-black text-slate-800 flex items-center gap-2">
            <GraduationCap className="w-4 h-4 text-indigo-600 shrink-0" />作业批改工作台
          </h3>
          <p className="text-xs text-slate-400 font-medium mt-0.5">上传错题图片后可框选多个题目，每个区域独立批改（串行处理），完成后自动进入待审查</p>
        </div>
        {pendingCount > 0 && (
          <span className="px-3 py-1.5 rounded-full bg-rose-50 text-rose-600 text-xs font-black shrink-0">{pendingCount} 个待审查</span>
        )}
      </div>

      {/* 上传批改区 */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <div className="text-xs text-slate-500 font-medium">
            {defaultStudent ? <span className="font-bold text-emerald-600">将批改给：{defaultStudent}</span> : <span className="text-rose-500 font-bold">请先在顶部选择目标学生，否则无法提交批改</span>}
          </div>
        </div>
        <input type="file" accept="image/*" className="hidden" onChange={e => { if (e.target.files?.[0]) handleSelectFile(e.target.files[0]); }} id="proofread-file" />
        <label
          htmlFor="proofread-file"
          className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 cursor-pointer transition active:scale-[0.98]"
        >
          <Upload className="w-4 h-4" />上传作业题目
        </label>
        <p className="text-[11px] text-slate-400 font-medium mt-2">上传作业/试卷图片后，可手动框选多个题目区域，每个区域独立批改（串行处理），完成后自动进入待审查。</p>

        {/* 复用 AI 解题错题（避免重复上传） */}
        {boundQuestions.length > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <div className="flex items-center gap-1.5 mb-2">
              <Link2 className="w-3.5 h-3.5 text-indigo-500" />
              <span className="text-xs font-black text-slate-600">直接复用 AI 解题错题（已绑定学生，无需重复上传）</span>
            </div>
            <div className="flex gap-2">
              <select
                defaultValue=""
                onChange={e => { if (e.target.value) handleReuseQuestion(e.target.value); e.currentTarget.value = ''; }}
                className="flex-1 min-w-[160px] bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              >
                <option value="">选择一道 AI 解题错题...</option>
                {boundQuestions.map((b: any) => (
                  <option key={b.id} value={b.id}>
                    {b.originalText?.slice(0, 30) || b.taskName || b.id}{b.studentId ? `（${b.studentId}）` : ''}
                  </option>
                ))}
              </select>
              {reuseLoading && <Loader2 className="w-5 h-5 animate-spin text-indigo-600 self-center" />}
            </div>
          </div>
        )}

        {uploadMsg && <div className="mt-3 px-4 py-2.5 bg-blue-50 text-blue-700 rounded-xl text-xs font-semibold">{uploadMsg}</div>}
      </div>

      {msg && (
        <div className={`px-4 py-3 rounded-2xl text-xs font-semibold ${msg.type === 'success' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-rose-50 text-rose-600 border border-rose-100'}`}>
          {msg.text}
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center"><Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-2" /><p className="text-xs text-slate-400 font-bold">加载中...</p></div>
      ) : tasks.length === 0 ? (
        <div className="py-16 text-center text-slate-400 text-xs font-bold bg-white rounded-2xl border border-slate-200">暂无批改任务</div>
      ) : (
        <div className="space-y-3">
          {tasks.map(task => {
            const studentId = task.payload?.studentId;
            const diagnosed = task.payload?.diagnosedQuestions || [];
            const img = task.payload?.savedImageUrl;
            return (
              <div key={task.id} className={`bg-white rounded-2xl border overflow-hidden ${task.status === 'pending_diagnose_review' ? 'border-amber-200' : 'border-slate-200'}`}>
                <div className="flex items-center gap-3 p-4">
                  {img && <img src={img} alt="原题" className="w-12 h-12 rounded-lg object-cover border border-slate-100 shrink-0" />}
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${task.status === 'pending_diagnose_review' ? 'bg-amber-50 text-amber-600' : task.status === 'completed' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'}`}>
                    {task.status === 'pending_diagnose_review' ? <Clock className="w-5 h-5" /> : task.status === 'completed' ? <CheckCircle2 className="w-5 h-5" /> : <Loader2 className="w-5 h-5 animate-spin" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-base font-bold text-slate-800 truncate">{task.taskName}</span>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-black shrink-0 ${task.status === 'pending_diagnose_review' ? 'bg-amber-50 text-amber-600 animate-pulse' : task.status === 'completed' ? 'bg-emerald-50 text-emerald-600' : task.status === 'failed' ? 'bg-rose-50 text-rose-600' : 'bg-blue-50 text-blue-600'}`}>
                        {REVIEW_STATUS[task.status] || task.status}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 font-mono mt-0.5">{task.id} {studentId ? `· 学生: ${studentId}` : ''}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {task.status === 'pending_diagnose_review' && (
                      <button onClick={() => {
                        // 打开审查时初始化错因编辑状态
                        const reasons: Record<number, string> = {};
                        (task.payload?.diagnosedQuestions || []).forEach((q: any, idx: number) => { reasons[idx] = q.errorReason || ''; });
                        setEditedReasons(reasons);
                        setDetailTask(task);
                      }} className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-bold flex items-center gap-1 cursor-pointer transition">
                        <Eye className="w-4 h-4" />审查归档
                      </button>
                    )}
                    {task.status === 'pending_diagnose_review' && <span className="text-xs text-slate-500 font-bold">识别出 {diagnosed.length} 道题</span>}
                  </div>
                </div>
                {!['pending_diagnose_review', 'completed'].includes(task.status) && (
                  <div className="px-4 pb-4">
                    <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-600 rounded-full transition-all" style={{ width: `${Math.max(task.progress || 10, 10)}%` }} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 审查详情模态框（含原图回显 + FormattedMath 渲染） */}
      {detailTask && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-2xl w-full p-6 relative max-h-[85vh] overflow-y-auto">
            <button onClick={() => setDetailTask(null)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 font-bold cursor-pointer">✕</button>
            <h3 className="font-black text-slate-900 mb-1">审查批改结果</h3>
            <p className="text-xs text-slate-400 font-medium mb-4">学生: {detailTask.payload?.studentId} · 共 {detailTask.payload?.diagnosedQuestions?.length || 0} 道题</p>

            {/* 原图回显 */}
            {detailTask.payload?.savedImageUrl && (
              <div className="mb-4">
                <div className="text-xs font-black text-slate-400 mb-2">原题图片（框选区域）</div>
                <img src={detailTask.payload.savedImageUrl} alt="原题" className="max-w-full max-h-64 rounded-2xl border border-slate-200 object-contain bg-white" />
              </div>
            )}

            {(detailTask.payload?.diagnosedQuestions || []).map((q: any, i: number) => (
              <div key={i} className="mb-4 bg-slate-50 rounded-2xl p-4 border border-slate-100">
                <div className="text-xs font-black text-slate-700 mb-2">题目 {i + 1} · {q.subject || '数学'}</div>
                <div className="text-sm text-slate-600 font-medium mb-2"><FormattedMath text={q.originalText || ''} /></div>
                <div className="text-xs font-black text-rose-600 mb-1">错因（可修改）：</div>
                <textarea
                  value={editedReasons[i] ?? q.errorReason ?? ''}
                  onChange={e => setEditedReasons(prev => ({ ...prev, [i]: e.target.value }))}
                  rows={2}
                  className="w-full text-xs text-rose-800 bg-white border border-rose-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-rose-500/40 resize-y"
                  placeholder="AI 分析不到位时可在此修改错因"
                />
                {q.knowledgePoints && <div className="text-xs text-indigo-600 mb-1 mt-2"><span className="font-bold">考点：</span>{Array.isArray(q.knowledgePoints) ? q.knowledgePoints.join('、') : q.knowledgePoints}</div>}
                {q.solution && <div className="text-xs text-emerald-600 font-medium"><span className="font-bold">解析：</span><FormattedMath text={q.solution} /></div>}
              </div>
            ))}

            <div className="flex gap-3 mt-4">
              <button onClick={() => handleReview(detailTask, true)} disabled={submitting} className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer">
                <CheckCircle2 className="w-4 h-4" />{submitting ? '处理中...' : '审查无误，归档到学生错题本'}
              </button>
              <button onClick={() => handleReview(detailTask, false)} disabled={submitting} className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer">
                <XCircle className="w-4 h-4" />驳回该批改
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
