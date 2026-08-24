import React, { useState, useEffect, useRef } from 'react';
import { CheckCircle2, XCircle, Loader2, Eye, Clock, GraduationCap, Upload, MousePointer, Scissors, X } from 'lucide-react';
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
  pending_diagnose_review: '待审查',
  completed: '已归档',
  failed: '已驳回/失败'
};

export default function ProofreadReview({ defaultStudent }: { defaultStudent?: string }) {
  const [tasks, setTasks] = useState<CorrectTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
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
      const correctTasks = data.filter((t: any) => t.uploadMode === 'correct_task');
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
    } catch (e: any) {
      setUploadMsg(e.message || '图片处理失败');
    }
  };

  // ===== 框选交互 =====
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setDrawing(true);
    setDrawStart({ x: ((e.clientX - rect.left) / rect.width) * 100, y: ((e.clientY - rect.top) / rect.height) * 100 });
    setDrawCur({ x: ((e.clientX - rect.left) / rect.width) * 100, y: ((e.clientY - rect.top) / rect.height) * 100 });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!drawing || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setDrawCur({
      x: Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)),
      y: Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100))
    });
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

  // ===== 开始批改：每个切片区域单独创建任务（串行提交，线程池自动排队） =====
  const handleStartCorrect = async () => {
    if (!editImage) return;
    if (boxes.length === 0) {
      setUploadMsg('请先在图片上拖拽框选要批改的题目区域');
      return;
    }
    if (!defaultStudent) {
      setUploadMsg('请先在顶部选择目标学生');
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
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-black text-slate-800 flex items-center gap-2">
                <MousePointer className="w-4 h-4 text-indigo-600" />框选要批改的题目
              </h3>
              <p className="text-xs text-slate-400 font-medium mt-1">在图片上<b className="text-indigo-600">拖拽鼠标</b>框选要批改的题目，可框选多个；每个区域将<b className="text-indigo-600">单独</b>裁剪并提交为独立批改任务（串行处理）</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => { setEditImage(null); setBoxes([]); }} className="px-3 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition cursor-pointer flex items-center gap-1"><X className="w-3.5 h-3.5" />取消</button>
              <button onClick={handleStartCorrect} disabled={recognizing || boxes.length === 0 || !defaultStudent} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 disabled:opacity-50 transition cursor-pointer">
                {recognizing ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />提交中...</> : <><Scissors className="w-3.5 h-3.5" />开始批改 {boxes.length > 0 ? `(${boxes.length}个区域)` : ''}</>}
              </button>
            </div>
          </div>

          {!defaultStudent && <div className="mb-3 px-4 py-2.5 bg-amber-50 text-amber-600 rounded-xl text-xs font-semibold">请先在顶部选择目标学生</div>}
          {uploadMsg && <div className="mb-3 px-4 py-2.5 bg-rose-50 text-rose-600 rounded-xl text-xs font-semibold">{uploadMsg}</div>}

          <div
            ref={containerRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            className="relative border-2 border-dashed border-slate-200 rounded-2xl overflow-hidden select-none cursor-crosshair bg-slate-50"
          >
            <img src={editImage} alt="待框选" className="w-full h-auto block" draggable={false} />
            {boxes.map(box => (
              <div key={box.id} className="absolute border-2 border-indigo-500 bg-indigo-500/15"
                style={{ left: `${box.p0.x}%`, top: `${box.p0.y}%`, width: `${box.p2.x - box.p0.x}%`, height: `${box.p2.y - box.p0.y}%` }}>
                <button onClick={e => deleteBox(box.id, e)} className="absolute -top-3 -right-3 w-6 h-6 bg-rose-500 text-white rounded-full flex items-center justify-center shadow cursor-pointer"><X className="w-3 h-3" /></button>
                <span className="absolute -top-5 left-0 text-[10px] font-black text-indigo-600 bg-white px-1.5 rounded shadow-sm">{boxes.findIndex(b => b.id === box.id) + 1}</span>
              </div>
            ))}
            {drawing && (
              <div className="absolute border-2 border-indigo-400 bg-indigo-400/20"
                style={{ left: `${Math.min(drawStart.x, drawCur.x)}%`, top: `${Math.min(drawStart.y, drawCur.y)}%`, width: `${Math.abs(drawCur.x - drawStart.x)}%`, height: `${Math.abs(drawCur.y - drawStart.y)}%` }} />
            )}
          </div>

          <div className="mt-4 text-xs text-slate-400 font-bold flex items-center gap-2">
            <Scissors className="w-3.5 h-3.5" />已框选 {boxes.length} 个区域，确认后点击"开始批改"
          </div>
        </div>
      </div>
    );
  }

  // ===== 主视图 =====
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-black text-slate-800 flex items-center gap-2">
            <GraduationCap className="w-4 h-4 text-indigo-600" />作业批改工作台
          </h3>
          <p className="text-xs text-slate-400 font-medium mt-0.5">上传错题图片后可框选多个题目，每个区域独立批改（串行处理），完成后自动进入待审查</p>
        </div>
        {pendingCount > 0 && (
          <span className="px-3 py-1.5 rounded-full bg-rose-50 text-rose-600 text-xs font-black">{pendingCount} 个待审查</span>
        )}
      </div>

      {/* 上传批改区 */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-xs text-slate-500 font-medium">
            {defaultStudent ? <span className="font-bold text-slate-700">将批改给：{defaultStudent}</span> : <span className="text-rose-500 font-bold">请先在顶部选择目标学生</span>}
          </div>
          <input type="file" accept="image/*" className="hidden" onChange={e => { if (e.target.files?.[0]) handleSelectFile(e.target.files[0]); }} id="proofread-file" />
          <label htmlFor="proofread-file" className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition">
            <Upload className="w-4 h-4" />上传错题进行批改
          </label>
        </div>
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
