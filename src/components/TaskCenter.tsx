import React, { useEffect, useState } from 'react';
import { db } from '../lib/db';
import { 
  Clock, CheckCircle2, AlertCircle, XCircle, Trash2, 
  ChevronRight, ArrowRight, Eye, RefreshCw, Plus, Trash, BookOpen
} from 'lucide-react';

interface Task {
  id: string;
  userId: string;
  taskName: string;
  status: 'queued' | 'extracting' | 'pending_extract_review' | 'diagnosing' | 'pending_diagnose_review' | 'completed' | 'failed';
  progress: number;
  autoRun: number;
  uploadMode: string;
  notebookId?: string;
  payload: any;
  createdAt: number;
  updatedAt: number;
  errorMsg?: string;
}

export default function TaskCenter({ onNavigate }: { onNavigate: (v: any) => void }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [notebooks, setNotebooks] = useState<any[]>([]);
  
  // 审核状态控制
  const [activeReviewTask, setActiveReviewTask] = useState<Task | null>(null);
  const [reviewStep, setReviewStep] = useState<2 | 3 | null>(null);
  const [reviewPayload, setReviewPayload] = useState<any>(null);
  const [selectedNotebook, setSelectedNotebook] = useState<string>('');

  const fetchTasks = async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const data = await db.getTasks();
      if (Array.isArray(data)) {
        setTasks(data);
      }
    } catch (err) {
      console.error('获取后台任务失败:', err);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const fetchNotebooks = () => {
    const token = localStorage.getItem('errorbook_token');
    fetch('/api/notebooks', {
      headers: {
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      }
    })
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setNotebooks(data);
        }
      })
      .catch(console.error);
  };

  // 轮询机制
  useEffect(() => {
    fetchTasks(true);
    fetchNotebooks();

    const interval = setInterval(() => {
      fetchTasks(false);
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('确定要删除这个后台任务吗？')) return;
    try {
      await db.deleteTask(id);
      fetchTasks(false);
    } catch (err: any) {
      alert(err.message || '删除任务失败');
    }
  };

  // 展开审核弹窗
  const startReview = (task: Task) => {
    setActiveReviewTask(task);
    if (task.status === 'pending_extract_review') {
      setReviewStep(2);
      // 深度拷贝 payload 里的提取题目
      const qList = task.payload.extractedQuestions 
        ? JSON.parse(JSON.stringify(task.payload.extractedQuestions))
        : [{ subject: '数学', originalText: '', studentAnswer: '', standardAnswer: '' }];
      setReviewPayload(qList);
    } else if (task.status === 'pending_diagnose_review') {
      setReviewStep(3);
      const diagnosedList = task.payload.diagnosedQuestions
        ? JSON.parse(JSON.stringify(task.payload.diagnosedQuestions))
        : [];
      setReviewPayload(diagnosedList);
      setSelectedNotebook(task.notebookId || '');
    }
  };

  // Step 2 编辑动作
  const handleUpdateExtracted = (idx: number, field: string, val: string) => {
    const next = [...reviewPayload];
    next[idx] = { ...next[idx], [field]: val };
    setReviewPayload(next);
  };

  const handleAddNewCard = () => {
    setReviewPayload(prev => [
      ...prev,
      { subject: '数学', originalText: '请输入题干内容...', studentAnswer: '' }
    ]);
  };

  const handleDeleteCard = (idx: number) => {
    setReviewPayload(prev => prev.filter((_, i) => i !== idx));
  };

  // 提交 Step 2 审核
  const submitOcrReview = async () => {
    if (!activeReviewTask || !reviewPayload) return;
    try {
      await db.submitTaskReview(activeReviewTask.id, {
        step: 2,
        payload: { extractedQuestions: reviewPayload }
      });
      alert('校对已提交！后台正开始智能诊断与分析。');
      setActiveReviewTask(null);
      setReviewStep(null);
      setReviewPayload(null);
      fetchTasks(false);
    } catch (err: any) {
      alert(err.message || '提交校对失败');
    }
  };

  // 提交 Step 3 归档
  const submitDiagnoseReview = async () => {
    if (!activeReviewTask || !reviewPayload) return;
    try {
      await db.submitTaskReview(activeReviewTask.id, {
        step: 3,
        payload: { 
          notebookId: selectedNotebook || undefined,
          diagnosedQuestions: reviewPayload 
        }
      });
      alert('错题归档成功，已存入您的错题本！');
      setActiveReviewTask(null);
      setReviewStep(null);
      setReviewPayload(null);
      fetchTasks(false);
    } catch (err: any) {
      alert(err.message || '归档失败');
    }
  };

  // 状态显示标签和样式
  const getStatusInfo = (status: Task['status']) => {
    switch (status) {
      case 'queued':
        return { label: '排队中', color: 'text-slate-500 bg-slate-100 border-slate-200' };
      case 'extracting':
        return { label: '识别中', color: 'text-blue-600 bg-blue-50 border-blue-100' };
      case 'pending_extract_review':
        return { label: '待校对', color: 'text-amber-600 bg-amber-50 border-amber-100' };
      case 'diagnosing':
        return { label: '诊断中', color: 'text-indigo-600 bg-indigo-50 border-indigo-100' };
      case 'pending_diagnose_review':
        return { label: '待归档', color: 'text-orange-600 bg-orange-50 border-orange-100' };
      case 'completed':
        return { label: '已完成', color: 'text-emerald-600 bg-emerald-50 border-emerald-100' };
      case 'failed':
        return { label: '已失败', color: 'text-rose-600 bg-rose-50 border-rose-100' };
      default:
        return { label: '未知', color: 'text-slate-500 bg-slate-100 border-slate-200' };
    }
  };

  // 概览卡片统计
  const statPendingOcr = tasks.filter(t => t.status === 'pending_extract_review').length;
  const statPendingDiag = tasks.filter(t => t.status === 'pending_diagnose_review').length;
  const statRunning = tasks.filter(t => ['queued', 'extracting', 'diagnosing'].includes(t.status)).length;
  const statCompleted = tasks.filter(t => t.status === 'completed').length;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-4xl mx-auto pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-950 tracking-tight flex items-center gap-2">
            <span>后台任务中心</span>
            <span className="text-xs bg-indigo-100 text-indigo-700 font-bold px-2.5 py-0.5 rounded-full">异步处理</span>
          </h2>
          <p className="text-sm text-slate-500 mt-1">查看错题后台异步识别和诊断进度，并进行人工校对流转</p>
        </div>
        <button
          onClick={() => fetchTasks(true)}
          className="p-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition text-slate-600 hover:text-slate-900 cursor-pointer"
          title="强制刷新"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Stats Board */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
          <span className="text-xs font-bold text-slate-400">进行中</span>
          <span className="text-2xl font-black text-blue-600 mt-1">{statRunning}</span>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
          <span className="text-xs font-bold text-slate-400">待文本校对</span>
          <span className="text-2xl font-black text-amber-600 mt-1">{statPendingOcr}</span>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
          <span className="text-xs font-bold text-slate-400">待归档确认</span>
          <span className="text-2xl font-black text-orange-600 mt-1">{statPendingDiag}</span>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
          <span className="text-xs font-bold text-slate-400">已自动归档</span>
          <span className="text-2xl font-black text-emerald-600 mt-1">{statCompleted}</span>
        </div>
      </div>

      {/* Task List */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center text-slate-400">
            <RefreshCw className="w-8 h-8 animate-spin text-blue-500 mb-2" />
            <span className="text-xs font-semibold">加载任务列表中...</span>
          </div>
        ) : tasks.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center text-slate-400 text-center">
            <Clock className="w-12 h-12 text-slate-200 mb-2.5" />
            <p className="text-sm font-bold text-slate-600">暂无后台任务</p>
            <p className="text-xs text-slate-400 mt-1 max-w-[280px]">
              您可以在“上传错题”中开启后台排队，在此追踪智能录入进程
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {tasks.map(task => {
              const statusInfo = getStatusInfo(task.status);
              const formattedTime = new Date(task.createdAt).toLocaleString();
              const isProcessing = ['queued', 'extracting', 'diagnosing'].includes(task.status);

              return (
                <div 
                  key={task.id} 
                  className={`p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors hover:bg-slate-50/50 ${
                    task.status.startsWith('pending') ? 'bg-amber-50/10' : ''
                  }`}
                >
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${statusInfo.color}`}>
                        {statusInfo.label}
                      </span>
                      <h4 className="text-sm font-bold text-slate-800 truncate">
                        {task.taskName}
                      </h4>
                      <span className="text-[10px] text-slate-400 font-medium">
                        {task.uploadMode === 'crossPage' ? '跨页合并' : task.uploadMode === 'multi' ? '单图多题' : '单图单题'}
                      </span>
                    </div>

                    <div className="flex items-center gap-4 text-xs text-slate-400 font-semibold">
                      <span>创建时间: {formattedTime}</span>
                      <span>模式: {task.autoRun === 1 ? '全自动(免审核)' : '逐步审核'}</span>
                    </div>

                    {/* Progress Bar */}
                    <div className="flex items-center gap-3 max-w-md pt-1">
                      <div className="flex-1 bg-slate-100 h-1.5 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all duration-500 ${
                            task.status === 'failed' ? 'bg-rose-500' :
                            task.status === 'completed' ? 'bg-emerald-500' :
                            'bg-blue-500'
                          }`}
                          style={{ width: `${task.progress}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-extrabold text-slate-500">{task.progress}%</span>
                    </div>

                    {task.errorMsg && (
                      <p className="text-xs text-rose-500 font-semibold bg-rose-50/50 border border-rose-100/50 rounded-lg p-2 mt-1">
                        错误原因: {task.errorMsg}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                    {task.status === 'pending_extract_review' && (
                      <button
                        onClick={() => startReview(task)}
                        className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition flex items-center gap-1 cursor-pointer"
                      >
                        去校对
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {task.status === 'pending_diagnose_review' && (
                      <button
                        onClick={() => startReview(task)}
                        className="bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition flex items-center gap-1 cursor-pointer"
                      >
                        去归档
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {isProcessing && (
                      <div className="flex items-center gap-1.5 text-xs text-slate-400 font-bold pr-2">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-500" />
                        运行中
                      </div>
                    )}

                    <button
                      onClick={(e) => handleDelete(task.id, e)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                      title="删除任务"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ================= STEP 2: OCR 文本校对审核 Modal ================= */}
      {reviewStep === 2 && activeReviewTask && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-3xl w-full flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black text-slate-900">第 1 步：核对识别出的题干与手写</h3>
                <p className="text-xs text-slate-400 mt-1">请仔细校对并修改不正确的文本，公式请尽量使用 $ 包围的 LaTeX</p>
              </div>
              <button 
                onClick={() => { setReviewStep(null); setActiveReviewTask(null); }}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Task Image Preview */}
              {activeReviewTask.payload.imageBase64 && (
                <div className="border border-slate-200 rounded-2xl overflow-hidden bg-slate-50 max-h-[220px] flex justify-center">
                  <img 
                    src={activeReviewTask.payload.imageBase64} 
                    alt="Task Source" 
                    className="object-contain max-h-full"
                  />
                </div>
              )}

              {/* Questions Edit list */}
              <div className="space-y-6">
                {reviewPayload && reviewPayload.map((item: any, idx: number) => (
                  <div key={idx} className="bg-slate-50/70 p-5 rounded-2xl border border-slate-200/60 relative">
                    <button
                      onClick={() => handleDeleteCard(idx)}
                      className="absolute top-4 right-4 text-slate-400 hover:text-rose-600 transition"
                      title="删除此题"
                    >
                      <Trash className="w-4 h-4" />
                    </button>
                    
                    <span className="text-xs font-black text-indigo-600 uppercase tracking-wider pl-1">
                      题目 #{idx + 1}
                    </span>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-500">学科</label>
                        <select
                          value={item.subject}
                          onChange={(e) => handleUpdateExtracted(idx, 'subject', e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 outline-none"
                        >
                          <option value="数学">数学</option>
                          <option value="物理">物理</option>
                          <option value="化学">化学</option>
                          <option value="生物">生物</option>
                          <option value="语文">语文</option>
                          <option value="英语">英语</option>
                        </select>
                      </div>
                    </div>

                    <div className="space-y-1.5 mt-4">
                      <label className="text-xs font-bold text-slate-500">题干正文 (支持 LaTeX)</label>
                      <textarea
                        value={item.originalText}
                        onChange={(e) => handleUpdateExtracted(idx, 'originalText', e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs font-medium text-slate-700 outline-none focus:border-blue-500 h-24"
                        placeholder="请输入识别的题目正文..."
                      />
                    </div>

                    <div className="space-y-1.5 mt-4">
                      <label className="text-xs font-bold text-slate-500">学生作答 (可选)</label>
                      <textarea
                        value={item.studentAnswer}
                        onChange={(e) => handleUpdateExtracted(idx, 'studentAnswer', e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs font-medium text-slate-700 outline-none focus:border-blue-500 h-16"
                        placeholder="请输入手写作答（若无则留空）"
                      />
                    </div>

                    <div className="space-y-1.5 mt-4">
                      <label className="text-xs font-bold text-slate-500">参考标准答案 (可选)</label>
                      <textarea
                        value={item.standardAnswer}
                        onChange={(e) => handleUpdateExtracted(idx, 'standardAnswer', e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs font-medium text-slate-700 outline-none focus:border-blue-500 h-16"
                        placeholder="标准答案，支持 LaTeX（若无则留空）"
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Add card button */}
              <button
                onClick={handleAddNewCard}
                className="w-full border border-dashed border-slate-300 hover:border-blue-500 hover:text-blue-600 text-slate-500 py-3 rounded-xl transition flex items-center justify-center gap-1 text-xs font-bold cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                手动追加新题目卡片
              </button>
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-slate-100 flex items-center justify-between">
              <button
                onClick={() => { setReviewStep(null); setActiveReviewTask(null); }}
                className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-50 transition cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={submitOcrReview}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-5 py-2.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-sm shadow-blue-500/10"
              >
                确认并提交后台开始智能诊断
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= STEP 3: 诊断结果与归档确认 Modal ================= */}
      {reviewStep === 3 && activeReviewTask && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-3xl w-full flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black text-slate-900">第 2 步：核对诊断结果并选择归档</h3>
                <p className="text-xs text-slate-400 mt-1">确认 AI 给出的解析诊断步骤、分数与核心考点，选择归档错题本</p>
              </div>
              <button 
                onClick={() => { setReviewStep(null); setActiveReviewTask(null); }}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Select Notebook Container */}
              <div className="bg-blue-50/50 border border-blue-100/80 p-4.5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-2 text-slate-800">
                  <BookOpen className="w-5 h-5 text-blue-600 shrink-0" />
                  <span className="text-xs font-bold">归档错题本选择 (必选)</span>
                </div>
                <select
                  value={selectedNotebook}
                  onChange={(e) => setSelectedNotebook(e.target.value)}
                  className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold text-slate-700 outline-none focus:border-blue-500 min-w-[200px]"
                >
                  <option value="">-- 请选择要归档的错题本 --</option>
                  {notebooks.map(nb => (
                    <option key={nb.id} value={nb.id}>{nb.name}</option>
                  ))}
                </select>
              </div>

              {/* diagnosed list */}
              <div className="space-y-6">
                {reviewPayload && reviewPayload.map((item: any, idx: number) => (
                  <div key={idx} className="bg-slate-50/50 p-5 rounded-2xl border border-slate-200/60 space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-black text-indigo-600 uppercase tracking-wider">
                        题目 #{idx + 1} ({item.subject})
                      </span>
                      <span className="text-xs font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
                        估分: {item.score}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <h5 className="text-xs font-bold text-slate-500">题干内容</h5>
                      <p className="bg-white p-3 border border-slate-100 rounded-xl text-xs font-medium text-slate-700 leading-relaxed whitespace-pre-wrap">
                        {item.originalText}
                      </p>
                    </div>

                    <div className="space-y-1">
                      <h5 className="text-xs font-bold text-slate-500">AI 标准解析步骤</h5>
                      <p className="bg-white p-3 border border-slate-100 rounded-xl text-xs font-medium text-slate-700 leading-relaxed whitespace-pre-wrap">
                        {item.solution}
                      </p>
                    </div>

                    {item.knowledgePoints && item.knowledgePoints.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-bold text-slate-400">考点标签:</span>
                        {item.knowledgePoints.map((kp: string, kIdx: number) => (
                          <span key={kIdx} className="bg-indigo-50 border border-indigo-100/50 text-indigo-600 text-[10px] font-extrabold px-2 py-0.5 rounded-md">
                            {kp}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-slate-100 flex items-center justify-between">
              <button
                onClick={() => { setReviewStep(null); setActiveReviewTask(null); }}
                className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-50 transition cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={submitDiagnoseReview}
                disabled={!selectedNotebook}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold px-5 py-2.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-sm shadow-emerald-500/10"
              >
                确认并保存归档至错题本
                <CheckCircle2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
