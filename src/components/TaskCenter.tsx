import React, { useEffect, useState } from 'react';
import { db } from '../lib/db';
import { 
  Clock, CheckCircle2, AlertCircle, XCircle, Trash2, 
  ChevronRight, ArrowRight, Eye, RefreshCw, Plus, Trash, BookOpen
} from 'lucide-react';
import FormattedMath from './FormattedMath';

interface Task {
  id: string;
  userId: string;
  taskName: string;
  status: 'queued' | 'extracting' | 'pending_extract_review' | 'diagnosing' | 'pending_diagnose_review' | 'completed' | 'failed';
  progress: number;
  autoRun: number;
  uploadMode: string;
  notebookId?: string;
  payload?: any;
  createdAt: number;
  updatedAt: number;
  errorMsg?: string;
}

export default function TaskCenter({ onNavigate }: { onNavigate: (v: any) => void }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [notebooks, setNotebooks] = useState<any[]>([]);
  
  // 分页状态
  const [currentPage, setCurrentPage] = useState(1);
  const [totalTasks, setTotalTasks] = useState(0);
  const [taskStats, setTaskStats] = useState({
    running: 0,
    pendingOcr: 0,
    pendingDiag: 0,
    completed: 0
  });
  const pageSize = 10;

  // 审核状态控制
  const [activeReviewTask, setActiveReviewTask] = useState<Task | null>(null);
  const [reviewStep, setReviewStep] = useState<2 | 3 | null>(null);
  const [reviewPayload, setReviewPayload] = useState<any>(null);
  const [selectedNotebook, setSelectedNotebook] = useState<string>('');
  const [expandedSolutions, setExpandedSolutions] = useState<Record<number, boolean>>({});

  const fetchTasks = async (page = 1, showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const res = await db.getPaginatedTasks(page, pageSize);
      setTasks(res.tasks);
      setTotalTasks(res.total);
      setCurrentPage(res.page);
      if (res.stats) {
        setTaskStats(res.stats);
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
    fetchTasks(1, true);
    fetchNotebooks();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchTasks(currentPage, false);
    }, 4000);

    return () => clearInterval(interval);
  }, [currentPage]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('确定要删除这个后台任务吗？')) return;
    try {
      await db.deleteTask(id);
      fetchTasks(currentPage, false);
    } catch (err: any) {
      alert(err.message || '删除任务失败');
    }
  };

  // 展开审核弹窗 (按需异步拉取大字段 payload)
  const startReview = async (task: Task) => {
    setLoading(true);
    try {
      const detail = await db.getTaskDetail(task.id);
      setActiveReviewTask(detail);
      if (detail.status === 'pending_extract_review') {
        setReviewStep(2);
        // 深度拷贝 payload 里的提取题目
        const qList = detail.payload.extractedQuestions 
          ? JSON.parse(JSON.stringify(detail.payload.extractedQuestions))
          : [{ subject: '数学', originalText: '', studentAnswer: '', standardAnswer: '' }];
        setReviewPayload(qList);
      } else if (detail.status === 'pending_diagnose_review') {
        setReviewStep(3);
        const diagnosedList = detail.payload.diagnosedQuestions
          ? JSON.parse(JSON.stringify(detail.payload.diagnosedQuestions))
          : [];
        setReviewPayload(diagnosedList);
        setSelectedNotebook(detail.notebookId || '');
        const expanded: Record<number, boolean> = {};
        diagnosedList.forEach((_, i) => {
          expanded[i] = i === 0;
        });
        setExpandedSolutions(expanded);
      }
    } catch (err: any) {
      alert(err.message || '获取任务详情失败');
    } finally {
      setLoading(false);
    }
  };

  // Step 2 编辑动作
  const handleUpdateExtracted = (idx: number, field: string, val: string) => {
    const next = [...reviewPayload];
    next[idx] = { ...next[idx], [field]: val };
    setReviewPayload(next);
  };

  const handleUpdateErrorReason = (idx: number, val: string) => {
    const next = [...reviewPayload];
    next[idx] = { ...next[idx], errorReason: val };
    setReviewPayload(next);
  };

  const toggleSolutionExpanded = (idx: number) => {
    setExpandedSolutions(prev => ({ ...prev, [idx]: !prev[idx] }));
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
      fetchTasks(currentPage, false);
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
      fetchTasks(currentPage, false);
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

  const renderPageNumbers = () => {
    const totalPages = Math.ceil(totalTasks / pageSize);
    const pages: (number | string)[] = [];
    
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) {
        pages.push('...');
      }
      
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
      
      if (currentPage < totalPages - 2) {
        pages.push('...');
      }
      pages.push(totalPages);
    }
    
    return pages.map((page, idx) => {
      if (page === '...') {
        return (
          <span key={`ell-${idx}`} className="px-2 text-slate-400 font-bold text-xs select-none">
            ...
          </span>
        );
      }
      
      const isSelected = page === currentPage;
      return (
        <button
          key={page}
          onClick={() => fetchTasks(page as number, false)}
          className={`w-9 h-9 rounded-xl text-xs font-black transition-all flex items-center justify-center cursor-pointer ${
            isSelected 
              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/10' 
              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 hover:border-slate-300'
          }`}
        >
          {page}
        </button>
      );
    });
  };

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
          onClick={() => fetchTasks(currentPage, true)}
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
          <span className="text-2xl font-black text-blue-600 mt-1">{taskStats.running}</span>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
          <span className="text-xs font-bold text-slate-400">待文本校对</span>
          <span className="text-2xl font-black text-amber-600 mt-1">{taskStats.pendingOcr}</span>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
          <span className="text-xs font-bold text-slate-400">待归档确认</span>
          <span className="text-2xl font-black text-orange-600 mt-1">{taskStats.pendingDiag}</span>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
          <span className="text-xs font-bold text-slate-400">已自动归档</span>
          <span className="text-2xl font-black text-emerald-600 mt-1">{taskStats.completed}</span>
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

        {/* Pagination */}
        {totalTasks > pageSize && (
          <div className="p-5 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-xs text-slate-500 font-bold">
              显示第 {(currentPage - 1) * pageSize + 1} 到 {Math.min(currentPage * pageSize, totalTasks)} 条，共 {totalTasks} 个后台任务
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => currentPage > 1 && fetchTasks(currentPage - 1, false)}
                disabled={currentPage === 1}
                className={`px-3 py-2 rounded-xl text-xs font-black border transition-all ${
                  currentPage === 1 
                    ? 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed' 
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:border-slate-300 cursor-pointer'
                }`}
              >
                上一页
              </button>
              {renderPageNumbers()}
              <button
                onClick={() => currentPage < Math.ceil(totalTasks / pageSize) && fetchTasks(currentPage + 1, false)}
                disabled={currentPage === Math.ceil(totalTasks / pageSize)}
                className={`px-3 py-2 rounded-xl text-xs font-black border transition-all ${
                  currentPage === Math.ceil(totalTasks / pageSize)
                    ? 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed' 
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:border-slate-300 cursor-pointer'
                }`}
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ================= STEP 2: OCR 文本校对审核 Modal ================= */}
      {reviewStep === 2 && activeReviewTask && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-6xl w-full flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
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
            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                
                {/* Left Column: Task Source Image */}
                <div className="lg:col-span-5 space-y-3 lg:sticky lg:top-0">
                  <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-3">
                    <span className="text-xs font-black text-slate-500 tracking-wider block">对照参考原图</span>
                    {activeReviewTask.payload.imageBase64 ? (
                      <div className="overflow-auto max-h-[60vh] rounded-xl border border-slate-200/60 flex justify-center bg-slate-100 relative group">
                        <img 
                          src={activeReviewTask.payload.imageBase64} 
                          alt="Task Source" 
                          className="w-full h-auto object-contain max-h-none transition-transform duration-200"
                        />
                      </div>
                    ) : (
                      <div className="py-20 text-center text-slate-400 text-xs">无可用对照图片</div>
                    )}
                  </div>
                </div>

                {/* Right Column: Editable Question Cards */}
                <div className="lg:col-span-7 space-y-6">
                  <div className="space-y-6">
                    {reviewPayload && reviewPayload.map((item: any, idx: number) => (
                      <div key={idx} className="bg-slate-50/70 p-5 rounded-2xl border border-slate-200/60 relative space-y-4">
                        <button
                          onClick={() => handleDeleteCard(idx)}
                          className="absolute top-4 right-4 text-slate-400 hover:text-rose-600 transition"
                          title="删除此题"
                        >
                          <Trash className="w-4 h-4" />
                        </button>
                        
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-black text-indigo-600 uppercase tracking-wider">
                            题目 #{idx + 1}
                          </span>
                          <select
                            value={item.subject}
                            onChange={(e) => handleUpdateExtracted(idx, 'subject', e.target.value)}
                            className="bg-white border border-slate-200 rounded-xl px-2.5 py-1 text-xs font-bold text-slate-700 outline-none"
                          >
                            <option value="数学">数学</option>
                            <option value="物理">物理</option>
                            <option value="化学">化学</option>
                            <option value="生物">生物</option>
                            <option value="语文">语文</option>
                            <option value="英语">英语</option>
                          </select>
                        </div>

                        {/* Question Textarea with FormattedMath */}
                        <div className="space-y-1.5">
                          <label className="text-[11px] font-bold text-slate-500">题干正文 (印刷体文字，LaTeX公式使用 $ 符号包围)：</label>
                          {item.originalText && (
                            <div className="w-full p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs leading-relaxed text-slate-700 font-medium">
                              <span className="text-[10px] font-bold text-blue-405 uppercase tracking-wide block mb-1">渲染预览</span>
                              <FormattedMath text={item.originalText} />
                            </div>
                          )}
                          <textarea
                            value={item.originalText}
                            onChange={(e) => handleUpdateExtracted(idx, 'originalText', e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-xl p-3.5 text-xs font-medium text-slate-700 outline-none focus:border-blue-500 h-28 font-mono leading-relaxed"
                            placeholder="请输入识别的题目正文..."
                          />
                        </div>

                        {/* Student Answer Textarea with FormattedMath */}
                        <div className="space-y-1.5">
                          <label className="text-[11px] font-bold text-slate-500">学生作答 (手写提取文本，留空则无需步骤诊断批改)：</label>
                          {item.studentAnswer && (
                            <div className="w-full p-3 bg-rose-50/30 border border-rose-100/50 rounded-xl text-xs leading-relaxed text-slate-700 font-medium">
                              <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wide block mb-1">学生作答实时渲染预览</span>
                              <FormattedMath text={item.studentAnswer} />
                            </div>
                          )}
                          <textarea
                            value={item.studentAnswer}
                            onChange={(e) => handleUpdateExtracted(idx, 'studentAnswer', e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-xl p-3.5 text-xs font-medium text-slate-700 outline-none focus:border-blue-500 h-20"
                            placeholder="请输入手写作答（若无则留空）"
                          />
                        </div>

                        {/* Standard Answer Textarea with FormattedMath */}
                        <div className="space-y-1.5">
                          <label className="text-[11px] font-bold text-slate-500">参考标准答案 (可选，支持 LaTeX)：</label>
                          {item.standardAnswer && (
                            <div className="w-full p-3 bg-emerald-50/30 border border-emerald-100/50 rounded-xl text-xs leading-relaxed text-slate-700 font-medium">
                              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wide block mb-1">标准答案实时预览</span>
                              <FormattedMath text={item.standardAnswer} />
                            </div>
                          )}
                          <textarea
                            value={item.standardAnswer}
                            onChange={(e) => handleUpdateExtracted(idx, 'standardAnswer', e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-xl p-3.5 text-xs font-medium text-slate-700 outline-none focus:border-blue-500 h-20"
                            placeholder="标准答案，支持 LaTeX（若无则留空）"
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Add card button */}
                  <button
                    onClick={handleAddNewCard}
                    className="w-full border border-dashed border-slate-350 hover:border-blue-500 hover:text-blue-600 text-slate-500 py-3.5 rounded-xl transition flex items-center justify-center gap-1.5 text-xs font-bold cursor-pointer bg-white"
                  >
                    <Plus className="w-4 h-4" />
                    手动追加新题目卡片
                  </button>
                </div>

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
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-6xl w-full flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
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
            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                
                {/* Left Column: Task Source Image */}
                <div className="lg:col-span-5 space-y-3 lg:sticky lg:top-0">
                  <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-3">
                    <span className="text-xs font-black text-slate-500 tracking-wider block">对照参考原图</span>
                    {activeReviewTask.payload.imageBase64 ? (
                      <div className="overflow-auto max-h-[60vh] rounded-xl border border-slate-200/60 flex justify-center bg-slate-100 relative group">
                        <img 
                          src={activeReviewTask.payload.imageBase64} 
                          alt="Task Source" 
                          className="w-full h-auto object-contain max-h-none"
                        />
                      </div>
                    ) : (
                      <div className="py-20 text-center text-slate-400 text-xs">无可用对照图片</div>
                    )}
                  </div>
                </div>

                {/* Right Column: Diagnosed Question Cards and Notebook Selector */}
                <div className="lg:col-span-7 space-y-6">
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
                    {reviewPayload && reviewPayload.map((item: any, idx: number) => {
                      const isExcluded = item.errorReason === '不纳入归档';
                      return (
                        <div 
                          key={idx} 
                          className={`bg-slate-50/70 p-5 rounded-2xl border transition-all duration-300 space-y-4 relative ${
                            isExcluded
                              ? 'border-slate-150 bg-slate-50/40 opacity-55'
                              : 'border-slate-200/60'
                          }`}
                        >
                          <div className="flex justify-between items-center pb-2 border-b border-slate-200/40">
                            <span className="text-xs font-black text-indigo-600 uppercase tracking-wider flex items-center gap-2">
                              题目 #{idx + 1} ({item.subject})
                              {isExcluded && (
                                <span className="text-[10px] bg-rose-50 text-rose-650 px-2 py-0.5 rounded-lg border border-rose-100 font-bold">不纳入归档</span>
                              )}
                            </span>
                            {item.score !== undefined && !isExcluded && (
                              <span className={`text-[10px] px-2.5 py-0.5 rounded-lg border font-black ${item.score >= 90
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                  : item.score >= 60
                                    ? 'bg-blue-50 text-blue-700 border-blue-100'
                                    : 'bg-rose-50 text-rose-750 border-rose-100'
                                }`}>
                                AI 评卷得分: {item.score}分
                              </span>
                            )}
                          </div>

                          {/* Question Text */}
                          <div className="space-y-1.5">
                            <h5 className="text-xs font-bold text-slate-505">题干内容</h5>
                            <div className="bg-white p-3.5 border border-slate-100 rounded-xl text-xs font-medium text-slate-900 leading-relaxed">
                              <FormattedMath text={item.originalText || '无题干内容'} />
                            </div>
                          </div>

                          {/* Standard Solution */}
                          {item.solution && (
                            <div className="pt-2 border-t border-slate-200/30">
                              <button
                                type="button"
                                onClick={() => toggleSolutionExpanded(idx)}
                                className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800 transition outline-none cursor-pointer"
                              >
                                <span>{expandedSolutions[idx] ? '▼ 收起本题名师精解' : '▶ 展开本题名师精解'}</span>
                              </button>
                              {expandedSolutions[idx] && (
                                <div className="mt-3 p-4 bg-white border border-slate-150 rounded-2xl text-xs leading-relaxed text-slate-800 font-medium">
                                  <FormattedMath text={item.solution} />
                                </div>
                              )}
                            </div>
                          )}

                          {/* Step Diagnosis */}
                          {item.errorDiagnosis && item.errorDiagnosis.length > 0 && !isExcluded && (
                            <div className="pt-4 border-t border-slate-200/40 space-y-3">
                              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                                <span>📝</span> 手写作答 AI 步骤诊断批改
                              </h4>
                              <div className="grid grid-cols-1 gap-3">
                                {item.errorDiagnosis.map((stepItem: any) => {
                                  let statusColor = "bg-emerald-50/50 border-emerald-100 text-emerald-800";
                                  let statusIcon = "✅";
                                  let statusText = "正确";

                                  if (stepItem.status === 'incorrect') {
                                    statusColor = "bg-rose-50 border-rose-100 text-rose-800";
                                    statusIcon = "❌";
                                    statusText = "首次出现错误";
                                  } else if (stepItem.status === 'consequential_error') {
                                    statusColor = "bg-amber-50/30 border-amber-100 text-amber-800";
                                    statusIcon = "⚠️";
                                    statusText = "受前面错误波及";
                                  }

                                  return (
                                    <div key={stepItem.stepNumber} className={`p-4 border rounded-2xl ${statusColor} space-y-1.5`}>
                                      <div className="flex items-center justify-between text-xs font-extrabold">
                                        <span>步骤 {stepItem.stepNumber} {statusIcon}</span>
                                        <span>{statusText}</span>
                                      </div>
                                      <div className="text-xs font-semibold leading-relaxed">
                                        <FormattedMath text={stepItem.stepContent} />
                                      </div>
                                      {stepItem.comment && (
                                        <div className="text-xs mt-2 pt-2 border-t border-current/10 font-bold opacity-90 text-rose-700">
                                          诊断说明：{stepItem.comment}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Knowledge Points */}
                          {item.knowledgePoints && item.knowledgePoints.length > 0 && !isExcluded && (
                            <div className="flex items-center gap-1.5 flex-wrap pt-2">
                              <span className="text-[10px] font-bold text-slate-400">考点标签:</span>
                              {item.knowledgePoints.map((kp: string, kIdx: number) => (
                                <span key={kIdx} className="bg-indigo-50 border border-indigo-100/50 text-indigo-600 text-[10px] font-extrabold px-2 py-0.5 rounded-md">
                                  #{kp}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Error Reason Dropdown */}
                          <div className="pt-4 border-t border-slate-200/40 flex items-center gap-3">
                            <label className="text-xs font-bold text-slate-450 whitespace-nowrap">归档错误原因：</label>
                            <select
                              value={item.errorReason || '概念不清'}
                              onChange={e => handleUpdateErrorReason(idx, e.target.value)}
                              className="flex-1 p-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-xs font-bold text-slate-700 cursor-pointer"
                            >
                              <option value="概念不清">概念不清</option>
                              <option value="粗心大意">粗心大意</option>
                              <option value="思路错误">思路错误</option>
                              <option value="完全不会">完全不会</option>
                              <option value="其他">其他</option>
                              <option value="不纳入归档">不纳入归档 (学生完全做对 / 无需录入)</option>
                            </select>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

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
