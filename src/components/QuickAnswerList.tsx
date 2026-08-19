import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, Loader2, Clock, CheckCircle2, XCircle, Trash2, Copy, Camera, MousePointer, Scissors, X, Plus } from 'lucide-react';

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
  status: string;      // queued/extracting/generating_answer/completed/failed
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
  completed: { label: '已完成', color: 'bg-emerald-50 text-emerald-600', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  failed: { label: '失败', color: 'bg-rose-50 text-rose-600', icon: <XCircle className="w-3.5 h-3.5" /> }
};

export default function QuickAnswerList() {
  const [tasks, setTasks] = useState<QuickTask[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
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
        if (['completed', 'failed'].includes(data.status)) {
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
        .filter((t: any) => t.uploadMode === 'quick_answer')
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
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (e: any) {
      setErr(e.message || '图片处理失败');
    }
  };

  // ===== 框选交互 =====
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setDrawing(true);
    setDrawStart({ x, y });
    setDrawCur({ x, y });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!drawing || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    setDrawCur({ x, y });
  };

  const handleMouseUp = () => {
    if (!drawing) return;
    setDrawing(false);
    const x = Math.min(drawStart.x, drawCur.x);
    const y = Math.min(drawStart.y, drawCur.y);
    const w = Math.abs(drawCur.x - drawStart.x);
    const h = Math.abs(drawCur.y - drawStart.y);
    if (w > 1.5 && h > 1.5) {
      setBoxes(prev => [...prev, {
        id: 'box_' + Math.random().toString(36).substring(2, 9),
        p0: { x, y }, p1: { x: x + w, y }, p2: { x: x + w, y: y + h }, p3: { x, y: y + h }
      }]);
    }
  };

  const deleteBox = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setBoxes(prev => prev.filter(b => b.id !== id));
  };

  // ===== 开始识别：每个框选区域单独创建任务 =====
  const handleRecognize = async () => {
    if (!editImage) return;
    if (boxes.length === 0) {
      setErr('请先在图片上拖拽框选题目区域');
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
          const res = await fetch(`${API_PREFIX}/jiaoxue/quick-answer`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({
              taskName: `题目${i + 1} ${new Date().toLocaleTimeString()}`,
              imageBase64: singleCrop,
              mimeType: editMime
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

  const copyAnswer = (text: string) => {
    navigator.clipboard.writeText(text).then(() => setMsg('答案已复制到剪贴板'));
  };

  // ===== 框选编辑视图 =====
  if (editImage) {
    return (
      <div className="space-y-5">
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-black text-slate-800 flex items-center gap-2">
                <MousePointer className="w-4 h-4 text-blue-600" />框选题目区域
              </h3>
              <p className="text-xs text-slate-400 font-medium mt-1">在图片上<b className="text-blue-600">拖拽鼠标</b>框选每道题，可框选多个区域；每个区域将<b className="text-indigo-600">单独</b>裁剪并独立识别答案</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => { setEditImage(null); setBoxes([]); }} className="px-3 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition cursor-pointer flex items-center gap-1"><X className="w-3.5 h-3.5" />取消</button>
              <button onClick={handleRecognize} disabled={recognizing || boxes.length === 0} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 disabled:opacity-50 transition cursor-pointer">
                {recognizing ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />识别中...</> : <><Scissors className="w-3.5 h-3.5" />开始识别 {boxes.length > 0 ? `(${boxes.length}个区域)` : ''}</>}
              </button>
            </div>
          </div>

          {err && <div className="mb-3 px-4 py-2.5 bg-rose-50 text-rose-600 rounded-xl text-xs font-semibold">{err}</div>}

          <div
            ref={containerRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            className="relative border-2 border-dashed border-slate-200 rounded-2xl overflow-hidden select-none cursor-crosshair bg-slate-50"
          >
            <img src={editImage} alt="待框选" className="w-full h-auto block" draggable={false} />
            {/* 已框选区域 */}
            {boxes.map(box => (
              <div key={box.id}
                className="absolute border-2 border-blue-500 bg-blue-500/15"
                style={{ left: `${box.p0.x}%`, top: `${box.p0.y}%`, width: `${box.p2.x - box.p0.x}%`, height: `${box.p2.y - box.p0.y}%` }}>
                <button onClick={e => deleteBox(box.id, e)} className="absolute -top-3 -right-3 w-6 h-6 bg-rose-500 text-white rounded-full flex items-center justify-center shadow cursor-pointer" title="删除选区">
                  <X className="w-3 h-3" />
                </button>
                <span className="absolute -top-5 left-0 text-[10px] font-black text-blue-600 bg-white px-1.5 rounded shadow-sm">
                  {boxes.findIndex(b => b.id === box.id) + 1}
                </span>
              </div>
            ))}
            {/* 正在绘制的选区 */}
            {drawing && (
              <div className="absolute border-2 border-indigo-400 bg-indigo-400/20"
                style={{ left: `${Math.min(drawStart.x, drawCur.x)}%`, top: `${Math.min(drawStart.y, drawCur.y)}%`, width: `${Math.abs(drawCur.x - drawStart.x)}%`, height: `${Math.abs(drawCur.y - drawStart.y)}%` }} />
            )}
          </div>

          <div className="mt-4 text-xs text-slate-400 font-bold flex items-center gap-2">
            <Plus className="w-3.5 h-3.5" />已框选 {boxes.length} 个区域，确认无误后点击"开始识别"
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
          <Camera className="w-4 h-4 text-blue-600" />快速答题（上传原题，框选后立即获取答案）
        </h3>
        <p className="text-xs text-slate-400 font-medium mb-4">上传试卷/题目图片后，可手动框选多个题目区域，系统将<b className="text-indigo-600">每个框选区域拆分为独立任务</b>分别识别答案，互不影响、可同时进行。</p>
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
                  {!['completed', 'failed'].includes(task.status) && (
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
