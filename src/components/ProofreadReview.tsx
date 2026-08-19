import React, { useState, useEffect, useRef } from 'react';
import { CheckCircle2, XCircle, Loader2, Eye, Clock, GraduationCap, Upload } from 'lucide-react';

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

// 压缩图片
function compressImage(base64: string, maxDim = 1600): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(base64);
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => resolve(base64);
    img.src = base64;
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
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadTasks = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_PREFIX}/tasks?status=active`, { headers: getHeaders() });
      if (!res.ok) throw new Error('加载任务失败');
      const text = await res.text();
      if (!text) { setTasks([]); return; }
      const data = JSON.parse(text);
      if (!Array.isArray(data)) { setTasks([]); return; }
      // 只保留作业批改任务
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
    // 轮询刷新待审查数量
    const timer = setInterval(loadTasks, 5000);
    return () => clearInterval(timer);
  }, []);

  const handleReview = async (task: CorrectTask, approved: boolean) => {
    setSubmitting(true);
    setMsg(null);
    try {
      const res = await fetch(`${API_PREFIX}/jiaoxue/correct-task/${task.id}/review`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          approved,
          diagnosedQuestions: task.payload?.diagnosedQuestions,
          // 用教学工作台顶部的学生下拉框选中学生归档（若任务未绑定学生）
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

  // 上传批改任务（使用顶部下拉框选中的学生）
  const handleUpload = async (file: File) => {
    setUploading(true);
    setUploadMsg(null);
    try {
      if (!defaultStudent) {
        throw new Error('请先在顶部选择目标学生');
      }
      const rawBase64 = await fileToBase64(file);
      const imageBase64 = await compressImage(rawBase64);
      const res = await fetch(`${API_PREFIX}/jiaoxue/correct-task`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          taskName: `作业批改 ${new Date().toLocaleTimeString()}`,
          imageBase64,
          mimeType: 'image/jpeg',
          studentUsername: defaultStudent
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '提交失败');
      setUploadMsg(`批改任务已提交（任务号：${data.taskId}），处理完成后自动进入待审查`);
      loadTasks();
    } catch (e: any) {
      setUploadMsg(e.message || '提交失败');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-black text-slate-800 flex items-center gap-2">
            <GraduationCap className="w-4 h-4 text-indigo-600" />作业批改工作台
          </h3>
          <p className="text-xs text-slate-400 font-medium mt-0.5">上传错题后自动识别并分析错因，完成后进入待审查，确认后归档到学生错题本</p>
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
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => { if (e.target.files?.[0]) handleUpload(e.target.files[0]); }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || !defaultStudent}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 disabled:opacity-50 cursor-pointer transition"
          >
            {uploading ? <><Loader2 className="w-4 h-4 animate-spin" />上传中...</> : <><Upload className="w-4 h-4" />上传错题进行批改</>}
          </button>
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
            return (
              <div key={task.id} className={`bg-white rounded-2xl border overflow-hidden ${task.status === 'pending_diagnose_review' ? 'border-amber-200' : 'border-slate-200'}`}>
                <div className="flex items-center gap-3 p-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${task.status === 'pending_diagnose_review' ? 'bg-amber-50 text-amber-600' : task.status === 'completed' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'}`}>
                    {task.status === 'pending_diagnose_review' ? <Clock className="w-5 h-5" /> : task.status === 'completed' ? <CheckCircle2 className="w-5 h-5" /> : <Loader2 className="w-5 h-5 animate-spin" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-slate-800 truncate">{task.taskName}</span>
                      <span className={`px-2 py-1 rounded-full text-[10px] font-black shrink-0 ${task.status === 'pending_diagnose_review' ? 'bg-amber-50 text-amber-600 animate-pulse' : task.status === 'completed' ? 'bg-emerald-50 text-emerald-600' : task.status === 'failed' ? 'bg-rose-50 text-rose-600' : 'bg-blue-50 text-blue-600'}`}>
                        {REVIEW_STATUS[task.status] || task.status}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">{task.id} {studentId ? `· 学生: ${studentId}` : ''}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {task.status === 'pending_diagnose_review' && (
                      <button onClick={() => setDetailTask(task)} className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer transition">
                        <Eye className="w-3.5 h-3.5" />审查归档
                      </button>
                    )}
                    {task.status === 'pending_diagnose_review' && <span className="text-[10px] text-slate-400 font-bold">识别出 {diagnosed.length} 道题</span>}
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

      {/* 审查详情模态框 */}
      {detailTask && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-2xl w-full p-6 relative max-h-[85vh] overflow-y-auto">
            <button onClick={() => setDetailTask(null)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 font-bold cursor-pointer">✕</button>
            <h3 className="font-black text-slate-900 mb-1">审查批改结果</h3>
            <p className="text-xs text-slate-400 font-medium mb-4">学生: {detailTask.payload?.studentId} · 共 {detailTask.payload?.diagnosedQuestions?.length || 0} 道题</p>

            {(detailTask.payload?.diagnosedQuestions || []).map((q: any, i: number) => (
              <div key={i} className="mb-4 bg-slate-50 rounded-2xl p-4 border border-slate-100">
                <div className="text-xs font-black text-slate-700 mb-2">题目 {i + 1} · {q.subject || '数学'}</div>
                <div className="text-xs text-slate-600 whitespace-pre-wrap mb-2">{q.originalText}</div>
                {q.studentAnswer && <div className="text-xs text-slate-500 mb-1"><span className="font-bold">学生作答：</span>{q.studentAnswer}</div>}
                {q.errorReason && <div className="text-xs text-rose-600 mb-1"><span className="font-bold">错因：</span>{q.errorReason}</div>}
                {q.knowledgePoints && <div className="text-xs text-indigo-600 mb-1"><span className="font-bold">考点：</span>{Array.isArray(q.knowledgePoints) ? q.knowledgePoints.join('、') : q.knowledgePoints}</div>}
                {q.solution && <div className="text-xs text-emerald-600 whitespace-pre-wrap"><span className="font-bold">解析：</span>{q.solution}</div>}
              </div>
            ))}

            <div className="flex gap-3 mt-4">
              <button
                onClick={() => handleReview(detailTask, true)}
                disabled={submitting}
                className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />{submitting ? '处理中...' : '审查无误，归档到学生错题本'}
              </button>
              <button
                onClick={() => handleReview(detailTask, false)}
                disabled={submitting}
                className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                <XCircle className="w-4 h-4" />驳回该批改
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
