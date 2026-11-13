import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, Loader2, Clock, CheckCircle2, XCircle, Trash2, Copy, Camera, MousePointer, Scissors, X, Plus, Lock, AlertTriangle } from 'lucide-react';
import { copyToClipboard } from '../lib/clipboard';

const API_PREFIX = '/api';

function getHeaders(): HeadersInit {
  const token = localStorage.getItem('errorbook_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
}

interface QuickTask {
  id: string;
  status: string;      // 排队/抽取中/生成答案/已完成/失败
  taskName: string;
  progress: number;
  thumbnail?: string;
  errorMsg?: string;
  quickAnswers?: { originalText: string; subject: string; standardAnswer: string; keySteps: string }[];
}

// 选区（百分比坐标）
interface QuadBox {
  id: string;
  p0: { x: number; y: number };
  p1: { x: number; y: number };
  p2: { x: number; y: number };
  p3: { x: number; y: number };
}

// ===== 选框裁剪（独立实现，不依赖 AddQuestion 页面） =====
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

// 文件转 Base64
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const statusMeta: Record<string, { label: string; color: string; icon: React.ReactNode; animate?: boolean }> = {
  queued: { label: '排队中', color: 'bg-slate-100 text-slate-500', icon: <Clock className="w-3.5 h-3.5" />, animate: true },
  extracting: { label: 'OCR识别中', color: 'bg-blue-50 text-blue-600', icon: <Loader2 className="w-3.5 h-3.5 animate-spin" /> },
  generating_answer: { label: '生成答案中', color: 'bg-indigo-50 text-indigo-600', icon: <Loader2 className="w-3.5 h-3.5 animate-spin" /> },
  pending_diagnose_review: { label: '待复查', color: 'bg-amber-50 text-amber-600', icon: <Clock className="w-3.5 h-3.5" />, animate: true },
  completed: { label: '已完成', color: 'bg-emerald-50 text-emerald-600', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  failed: { label: '失败', color: 'bg-rose-50 text-rose-600', icon: <XCircle className="w-3.5 h-3.5" /> }
};

export default function QuickAnswerList({ defaultStudent }: { defaultStudent?: string }) {
  const [tasks, setTasks] = useState<QuickTask[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [needStudentModal, setNeedStudentModal] = useState(false); // 未选择学生弹窗
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollTimers = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

  // ===== 框选编辑状态 =====
  const [editImage, setEditImage] = useState<string | null>(null);   // 待框选的图片 base64
  const [editMime, setEditMime] = useState('image/jpeg');
  const [boxes, setBoxes] = useState<QuadBox[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState({ x: 0, y: 0 });
  const [drawCur, setDrawCur] = useState({ x: 0, y: 0 });
  const [recognizing, setRecognizing] = useState(false);
  // 二次编辑：当前选中（锁定）编辑的框 id，选中后该框可拖动调整大小/位置，其它框变灰
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);
  // 当前正在拖动的编辑类型：'move'（移动）或控制点方向 nw/ne/sw/se/n/s/e/w
  const [editing, setEditing] = useState(false);
  const [editType, setEditType] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 轮询单任务状态
  const pollTask = useCallback((taskId: string) => {
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`${API_PREFIX}/tasks/${taskId}`, { headers: getHeaders() });
        if (!res.ok) { clearInterval(timer); return; }
        const text = await res.text();
        if (!text) { clearInterval(timer); pollTimers.current.delete(taskId); return; }
        const data: any = JSON.parse(text);
        const p: any = data.payload || {};
        setTasks(prev => prev.map(t => t.id === taskId ? {
          ...t,
          status: data.status,
          progress: data.progress,
          errorMsg: data.errorMsg,
          quickAnswers: p.quickAnswers || t.quickAnswers
        } : t));
        if (['completed', 'failed', 'pending_diagnose_review'].includes(data.status)) {
          clearInterval(timer);
          pollTimers.current.delete(taskId);
        }
      } catch (e) {
        clearInterval(timer);
        pollTimers.current.delete(taskId);
      }
    }, 2000);
    pollTimers.current.set(taskId, timer);
  }, []);

  // 加载全部快速答题任务（含历史）
  const loadActiveTasks = useCallback(async () => {
    try {
      const res = await fetch(`${API_PREFIX}/tasks`, { headers: getHeaders() });
      if (!res.ok) return;
      const text = await res.text();
      if (!text) return;
      const data = JSON.parse(text);
      const arr = Array.isArray(data) ? data : (Array.isArray(data.tasks) ? data.tasks : []);
      const quickTasks: QuickTask[] = arr
        .filter((t: any) => t.uploadMode === 'quick_answer' || t.uploadMode === 'quick_answer_direct')
        .map((t: any): QuickTask => {
          const p: any = t.payload || {};
          return {
            id: t.id,
            status: t.status,
            taskName: t.taskName,
            progress: t.progress,
            thumbnail: p.savedImageUrl || undefined,
            errorMsg: t.errorMsg,
            quickAnswers: p.quickAnswers
          };
        });
      quickTasks.forEach(nt => {
        if (['queued', 'extracting', 'generating_answer'].includes(nt.status) && !pollTimers.current.has(nt.id)) {
          pollTask(nt.id);
        }
      });
      setTasks(prev => {
        const map = new Map<string, QuickTask>(prev.map(t => [t.id, t]));
        quickTasks.forEach((nt: QuickTask) => {
          const old: QuickTask | undefined = map.get(nt.id);
          map.set(nt.id, {
            ...nt,
            quickAnswers: nt.quickAnswers || old?.quickAnswers
          });
        });
        return Array.from(map.values());
      });
    } catch (e) {
      console.error("load active quick tasks failed", e);
    }
  }, [pollTask]);

  useEffect(() => {
    loadActiveTasks();
    return () => {
      pollTimers.current.forEach(t => clearInterval(t));
      pollTimers.current.clear();
    };
  }, [loadActiveTasks]);

  // ===== 上传 → 进入框选 =====
  const handleSelectFile = async (file: File) => {
    setErr(null);
    try {
      const base64 = await fileToBase64(file);
      // 压缩到合理尺寸
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
      const compressed = canvas.toDataURL('image/jpeg', 0.9);
      setEditImage(compressed);
      setEditMime('image/jpeg');
      setBoxes([]);
      setSelectedBoxId(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (e: any) {
      setErr(e.message || '图片处理失败');
    }
  };

  // ===== 框选交互（支持二次编辑：拖动角/边改大小、拖动内部移动） =====

  // 根据点击坐标判断命中的控制点方向，命中返回方向，否则返回 null
  const hitControlPoint = (box: QuadBox, x: number, y: number): string | null => {
    const T = 4; // 命中容差（百分比）
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

  // 判断点是否在框内部（用于移动）
  const hitBoxInside = (box: QuadBox, x: number, y: number): boolean => {
    const minX = Math.min(box.p0.x, box.p2.x);
    const maxX = Math.max(box.p0.x, box.p2.x);
    const minY = Math.min(box.p0.y, box.p2.y);
    const maxY = Math.max(box.p0.y, box.p2.y);
    return x >= minX && x <= maxX && y >= minY && y <= maxY;
  };

  const clampBox = (box: QuadBox): QuadBox => {
    let x0 = Math.max(0, Math.min(100, Math.min(box.p0.x, box.p2.x)));
    let y0 = Math.max(0, Math.min(100, Math.min(box.p0.y, box.p2.y)));
    let x1 = Math.max(0, Math.min(100, Math.max(box.p0.x, box.p2.x)));
    let y1 = Math.max(0, Math.min(100, Math.max(box.p0.y, box.p2.y)));
    if (x1 - x0 < 1) x1 = x0 + 1;
    if (y1 - y0 < 1) y1 = y0 + 1;
    return {
      id: box.id,
      p0: { x: x0, y: y0 },
      p1: { x: x1, y: y0 },
      p2: { x: x1, y: y1 },
      p3: { x: x0, y: y1 }
    };
  };

  const startEdit = (id: string, type: string, x: number, y: number) => {
    setSelectedBoxId(id);
    setEditing(true);
    setEditType(type);
    setDrawing(false);
    editStartRef.current = { id, type, x, y, startBox: boxes.find(b => b.id === id) || null };
  };
  // 记录编辑起始状态（用于移动时的偏移计算）
  const editStartRef = useRef<{ id: string; type: string; x: number; y: number; startBox: QuadBox | null } | null>(null);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    // 优先判断是否命中已选中框的控制点（二次编辑大小）
    if (selectedBoxId) {
      const box = boxes.find(b => b.id === selectedBoxId);
      if (box) {
        const cp = hitControlPoint(box, x, y);
        if (cp) {
          startEdit(selectedBoxId, cp, x, y);
          return;
        }
        if (hitBoxInside(box, x, y)) {
          startEdit(selectedBoxId, 'move', x, y);
          return;
        }
      }
    }

    // 否则：开始画新框
    setDrawing(true);
    setDrawStart({ x, y });
    setDrawCur({ x, y });
  };

  // 根据编辑类型更新框坐标
  const applyEdit = (box: QuadBox, type: string, x: number, y: number): QuadBox => {
    const st = editStartRef.current;
    if (!st || !st.startBox) return box;
    const b = st.startBox;
    let x0 = b.p0.x, y0 = b.p0.y, x1 = b.p2.x, y1 = b.p2.y;
    switch (type) {
      case 'move': {
        const dx = x - st.x, dy = y - st.y;
        x0 += dx; y0 += dy; x1 += dx; y1 += dy;
        break;
      }
      case 'nw': x0 = x; y0 = y; break;
      case 'ne': x1 = x; y0 = y; break;
      case 'sw': x0 = x; y1 = y; break;
      case 'se': x1 = x; y1 = y; break;
      case 'n': y0 = y; break;
      case 's': y1 = y; break;
      case 'e': x1 = x; break;
      case 'w': x0 = x; break;
    }
    return clampBox({
      id: box.id,
      p0: { x: x0, y: y0 },
      p1: { x: x1, y: y0 },
      p2: { x: x1, y: y1 },
      p3: { x: x0, y: y1 }
    });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));

    // 编辑已选中的框
    if (editing && editType && editStartRef.current) {
      setBoxes(prev => prev.map(b => b.id === editStartRef.current!.id ? applyEdit(b, editType!, x, y) : b));
      return;
    }
    // 绘制新框
    if (drawing) {
      setDrawCur({ x, y });
    }
  };

  const handleMouseUp = () => {
    if (editing) {
      setEditing(false);
      setEditType(null);
      editStartRef.current = null;
      return;
    }
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
      // 新建后自动选中，便于立即二次编辑
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
    // 命中已选中框控制点/内部 → 编辑；否则画新框
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
    if (drawing) {
      setDrawCur(p);
    }
  };

  const handleTouchEnd = () => {
    if (editing) {
      setEditing(false);
      setEditType(null);
      editStartRef.current = null;
      return;
    }
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

  // ===== 开始识别：每个框选区域单独创建任务 =====
  const handleRecognize = async () => {
    if (!editImage) return;
    if (boxes.length === 0) {
      setErr('请先在图片上拖拽框选题目区域');
      return;
    }
    // 必须选择学生，否则弹窗提示（解析出的题目需要判给学生并进入待审查）
    if (!defaultStudent) {
      setNeedStudentModal(true);
      return;
    }
    setRecognizing(true);
    setErr(null);
    try {
      // 每个框选区域裁剪成独立图片
      const croppedImages = await cropBoxes(editImage, boxes, editMime);
      const batchResults: { taskId: string; index: number }[] = [];
      // 逐个区域提交任务（每个区域一个独立任务，发送裁剪后的单张图给 AI）
      for (let i = 0; i < croppedImages.length; i++) {
        const singleCrop = croppedImages[i];
        try {
          const res = await fetch(`${API_PREFIX}/jiaoxue/quick-answer-direct`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({
              taskName: `题目${i + 1} ${new Date().toLocaleTimeString()}`,
              imageBase64: singleCrop,
              mimeType: editMime,
              studentUsername: defaultStudent || null
            })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || '提交失败');
          batchResults.push({ taskId: data.taskId, index: i });
        } catch (e: any) {
          console.error(`题目${i + 1} 提交失败:`, e.message);
        }
      }
      if (batchResults.length > 0) {
        // 插入占位符并轮询
        batchResults.forEach(r => {
          const newTask: QuickTask = {
            id: r.taskId,
            status: 'queued',
            taskName: `题目${r.index + 1} ${new Date().toLocaleTimeString()}`,
            progress: 0
          };
          setTasks(prev => [newTask, ...prev]);
          pollTask(r.taskId);
        });
        setMsg(`已提交 ${batchResults.length} 个识别任务，每个框选区域独立识别`);
      }
      // 清空框选，进入结果查看
      setEditImage(null);
      setBoxes([]);
      setSelectedBoxId(null);
    } catch (e: any) {
      setErr(e.message || '识别提交失败');
    } finally {
      setRecognizing(false);
    }
  };

  const handleDelete = async (taskId: string) => {
    try {
      await fetch(`${API_PREFIX}/tasks/${taskId}`, { method: 'DELETE', headers: getHeaders() });
      setTasks(prev => prev.filter(t => t.id !== taskId));
    } catch (e) {
      console.error("delete task failed", e);
    }
  };

  const copyAnswer = async (text: string) => {
    const ok = await copyToClipboard(text);
    if (ok) setMsg('答案已复制到剪贴板');
  };

  // ===== 框选编辑视图 =====
  if (editImage) {
    return (
      <div className="space-y-5">
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 gap-3">
            <div>
              <h3 className="font-black text-slate-800 flex items-center gap-2">
                <MousePointer className="w-4 h-4 text-blue-600" />框选题目区域
              </h3>
              <p className="text-xs text-slate-400 font-medium mt-1">在图片上<b className="text-blue-600">拖拽/滑动</b>框选每道题，可框选多个区域；每个区域将<b className="text-indigo-600">单独</b>裁剪并独立识别答案</p>
              {defaultStudent ? (
                <p className="text-xs text-emerald-600 font-bold mt-1.5 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />已绑定学生：{defaultStudent}，识别完成后可直接在作业批改中复用
                </p>
              ) : (
                <p className="text-xs text-amber-600 font-bold mt-1.5 flex items-center gap-1">
                  <XCircle className="w-3.5 h-3.5" />未绑定学生：如需后续在作业批改中直接选择本题目，请返回顶部先选择学生
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-start md:justify-end">
              <button onClick={() => { setEditImage(null); setBoxes([]); setSelectedBoxId(null); }} className="px-3 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition cursor-pointer flex items-center gap-1"><X className="w-3.5 h-3.5" />取消</button>
              <button onClick={handleRecognize} disabled={recognizing || boxes.length === 0} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 disabled:opacity-50 transition cursor-pointer">
                {recognizing ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />识别中...</> : <><Scissors className="w-3.5 h-3.5" />开始识别 {boxes.length > 0 ? `(${boxes.length}个区域)` : ''}</>}
              </button>
            </div>
          </div>

          {err && <div className="mb-3 px-4 py-2.5 bg-rose-50 text-rose-600 rounded-xl text-xs font-semibold">{err}</div>}

          {/* 未选择学生弹窗 */}
          {needStudentModal && (
            <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-6 text-center">
                <div className="w-14 h-14 mx-auto mb-4 bg-amber-50 rounded-full flex items-center justify-center"><AlertTriangle className="w-7 h-7 text-amber-500" /></div>
                <h3 className="font-black text-slate-800 mb-2 text-lg">请先选择学生</h3>
                <p className="text-sm text-slate-500 font-medium mb-6">AI解题解析出的题目需要判给学生并在复查通过后进入学生错题本，请先在顶部选择目标学生后再开始识别。</p>
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
                {/* 已框选区域 */}
                {boxes.map(box => {
                  const idx = boxes.findIndex(b => b.id === box.id) + 1;
                  const isSel = box.id === selectedBoxId;
                  const isGrey = selectedBoxId && !isSel && editing; // 编辑其他框时，未选中框变灰防误触
                  return (
                    <div key={box.id}
                      className={`absolute border-2 ${isSel ? 'border-blue-600 bg-blue-500/15' : isGrey ? 'border-slate-300 bg-slate-300/10 pointer-events-none' : 'border-blue-400 bg-blue-400/10 pointer-events-none'}`}
                      style={{ left: `${box.p0.x}%`, top: `${box.p0.y}%`, width: `${box.p2.x - box.p0.x}%`, height: `${box.p2.y - box.p0.y}%` }}>
                      {isSel && (
                        <button onClick={e => deleteBox(box.id, e)} className="absolute -top-3 -right-3 w-6 h-6 bg-rose-500 text-white rounded-full flex items-center justify-center shadow cursor-pointer" title="删除选区">
                          <X className="w-3 h-3" />
                        </button>
                      )}
                      <span className={`absolute -top-5 left-0 text-[10px] font-black bg-white px-1.5 rounded shadow-sm ${isSel ? 'text-blue-600' : 'text-slate-500'}`}>
                        框{idx}
                      </span>
                    </div>
                  );
                })}
                {/* 选中框的 8 个控制点（拖动改大小） */}
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
                    <div key={c.k} className={`absolute w-3 h-3 bg-white border-2 border-blue-600 rounded-full ${c.cls}`}
                      style={{ left: `calc(${c.left}% - 6px)`, top: `calc(${c.top}% - 6px)` }} />
                  ));
                })()}
                {/* 正在绘制的选区 */}
                {drawing && (
                  <div className="absolute border-2 border-indigo-400 bg-indigo-400/20"
                    style={{ left: `${Math.min(drawStart.x, drawCur.x)}%`, top: `${Math.min(drawStart.y, drawCur.y)}%`, width: `${Math.abs(drawCur.x - drawStart.x)}%`, height: `${Math.abs(drawCur.y - drawStart.y)}%` }} />
                )}
              </div>
              <div className="mt-3 text-xs text-slate-400 font-bold flex items-center gap-2 flex-wrap">
                <Plus className="w-3.5 h-3.5" />已框选 {boxes.length} 个区域
                {selectedBoxId ? (
                  <span className="text-emerald-600">（正在编辑框{boxes.findIndex(b => b.id === selectedBoxId) + 1}：拖动角/边改大小，拖动内部移动，其他框已灰化防误触）</span>
                ) : (
                  <span className="text-amber-600">（在图片上拖动框选题目，框选后从右侧列表点选某框可锁定并二次编辑大小）</span>
                )}
              </div>
            </div>

            {/* 框选区域列表（点击条目锁定/选中该框，便于二次编辑） */}
            <div className="w-full md:w-56 shrink-0">
              <div className="bg-slate-50 rounded-2xl border border-slate-200 p-3">
                <div className="text-xs font-black text-slate-700 mb-2 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-blue-600" />已框选区域
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
                          className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border text-xs font-bold cursor-pointer transition ${isSel ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-400'}`}
                        >
                          <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-black shrink-0 ${isSel ? 'bg-white/20' : 'bg-blue-50 text-blue-600'}`}>{i + 1}</span>
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
                <p className="text-[10px] text-slate-400 font-medium mt-2 leading-relaxed">点选某框后即可拖动<b className="text-blue-600">四角/边缘</b>改大小、拖动<b className="text-blue-600">内部</b>移动位置，其他框自动灰化避免误触。</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ===== 上传 + 任务列表视图 =====
  return (
    <div className="space-y-5">
      {/* 上传区 */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <h3 className="font-black text-slate-800 flex items-center gap-2 mb-1">
          <Camera className="w-4 h-4 text-blue-600" />AI解题（上传原题，框选后立即获取答案）
        </h3>
        <p className="text-xs text-slate-400 font-medium mb-2">上传试卷/题目图片后，可手动框选多个题目区域，系统将<b className="text-indigo-600">每个框选区域拆分为独立任务</b>分别识别答案，互不影响、可同时进行。</p>
        {defaultStudent ? (
          <p className="text-xs text-emerald-600 font-bold mb-4 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />当前绑定学生：{defaultStudent}，识别后可到「作业批改」下拉直接复用本题目
          </p>
        ) : (
          <p className="text-xs text-amber-600 font-bold mb-4 flex items-center gap-1">
            <XCircle className="w-3.5 h-3.5" />尚未选择学生：如需后续在作业批改中直接选用，请先在顶部选择学生
          </p>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={e => { if (e.target.files?.[0]) handleSelectFile(e.target.files[0]); }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition cursor-pointer"
        >
          <Upload className="w-4 h-4" />上传题目图片
        </button>
      </div>

      {err && <div className="px-4 py-3 bg-rose-50 text-rose-600 border border-rose-100 rounded-2xl text-xs font-semibold">{err}</div>}
      {msg && <div className="px-4 py-3 bg-blue-50 text-blue-700 border border-blue-100 rounded-2xl text-xs font-semibold">{msg}</div>}

      {/* 任务列表 */}
      <div className="space-y-3">
        {tasks.length === 0 && (
          <div className="py-12 text-center text-slate-400 text-xs font-bold bg-white rounded-2xl border border-slate-200">
            暂无识别任务，上传图片并框选题目后这里会显示每个区域的识别进度
          </div>
        )}
        {tasks.map(task => {
          const meta = statusMeta[task.status] || statusMeta.queued;
          return (
            <div key={task.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="flex items-center gap-3 p-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-800 truncate">{task.taskName}</span>
                    <span className={`px-2 py-1 rounded-full text-[10px] font-black flex items-center gap-1 shrink-0 ${meta.color} ${meta.animate ? 'animate-pulse' : ''}`}>
                      {meta.icon}{meta.label}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono mt-0.5">{task.id}</div>
                  {task.status === 'failed' && <div className="text-[11px] text-rose-500 font-semibold mt-1">{task.errorMsg || '处理失败'}</div>}
                  {task.status === 'pending_diagnose_review' && (
                    <div className="text-[11px] text-amber-600 font-bold mt-1 flex items-center gap-1"><Clock className="w-3 h-3" />已生成解题答案，请在「作业批改」页复查归档到学生错题本</div>
                  )}
                  {!['completed', 'failed', 'pending_diagnose_review'].includes(task.status) && (
                    <div className="w-full h-1.5 bg-slate-100 rounded-full mt-2 overflow-hidden">
                      <div className="h-full bg-blue-600 rounded-full transition-all duration-500" style={{ width: `${Math.max(task.progress || 5, 5)}%` }} />
                    </div>
                  )}
                </div>
                <button onClick={() => handleDelete(task.id)} className="text-slate-300 hover:text-rose-500 p-1.5 rounded-lg hover:bg-rose-50 transition cursor-pointer shrink-0" title="删除任务">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {task.status === 'completed' && task.quickAnswers && task.quickAnswers.length > 0 && (
                <div className="border-t border-slate-100 px-4 py-3 space-y-3 bg-slate-50/50">
                  {task.quickAnswers.map((qa, i) => (
                    <div key={i} className="space-y-2">
                      <div className="text-xs font-bold text-slate-600">题目 {i + 1}：{qa.originalText.slice(0, 80)}{qa.originalText.length > 80 ? '...' : ''}</div>
                      <div className="bg-white rounded-xl p-3 border border-slate-200">
                        <div className="text-[10px] font-black text-emerald-600 mb-1 flex items-center justify-between">
                          <span>标准答案</span>
                          <button onClick={() => copyAnswer(qa.standardAnswer)} className="flex items-center gap-1 text-slate-400 hover:text-blue-600"><Copy className="w-3 h-3" />复制</button>
                        </div>
                        <div className="text-xs text-slate-700 font-medium whitespace-pre-wrap">{qa.standardAnswer || '（无）'}</div>
                      </div>
                      {qa.keySteps && (
                        <div className="bg-white rounded-xl p-3 border border-slate-200">
                          <div className="text-[10px] font-black text-indigo-600 mb-1">关键解题步骤</div>
                          <div className="text-xs text-slate-700 font-medium whitespace-pre-wrap">{qa.keySteps}</div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
