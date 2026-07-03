import React, { useEffect, useState, useRef } from 'react';
import { db, ErrorQuestion, DiagnosisStep } from '../lib/db';
import { Search, Book, Clock, ChevronRight, X, Sparkles, Loader2, ArrowLeft, Trash2, Check, PlusCircle, RefreshCw, MoreHorizontal } from 'lucide-react';
import { format } from 'date-fns';
import FormattedMath, { InlineContent, cleanTextForSummary } from './FormattedMath';
import { parseIndividualErrorAnalysis } from '../lib/parser';
import GeometryRenderer from './GeometryRenderer';
import type { GeometryData } from '../types/geometry';
import QuestionDetail from './QuestionDetail';

function timeAgo(timestamp?: number): string {
  if (!timestamp) return '刚刚';
  const diff = Date.now() - timestamp;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days > 0) return `${days}天前`;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours > 0) return `${hours}小时前`;
  const minutes = Math.floor(diff / (1000 * 60));
  if (minutes > 0) return `${minutes}分钟前`;
  return '刚刚';
}

function getSubjectIcon(subject?: string): string {
  if (!subject) return '📚';
  const s = subject.trim();
  if (s.includes('数')) return '📐';
  if (s.includes('英')) return '🔤';
  if (s.includes('语') || s.includes('文')) return '✍️';
  if (s.includes('物')) return '⚛️';
  if (s.includes('化')) return '🧪';
  if (s.includes('生')) return '🧬';
  if (s.includes('历') || s.includes('史')) return '📜';
  if (s.includes('地')) return '🌍';
  if (s.includes('政')) return '⚖️';
  return '📚';
}

function getSubjectBg(subject?: string): string {
  if (!subject) return 'bg-slate-50 border-slate-200/60';
  const s = subject.trim();
  if (s.includes('数')) return 'bg-blue-50 border-blue-150';
  if (s.includes('英')) return 'bg-indigo-50 border-indigo-150';
  if (s.includes('语') || s.includes('文')) return 'bg-amber-50 border-amber-150';
  if (s.includes('物')) return 'bg-purple-50 border-purple-150';
  if (s.includes('化')) return 'bg-emerald-50 border-emerald-150';
  if (s.includes('生')) return 'bg-teal-50 border-teal-150';
  return 'bg-slate-50 border-slate-200/60';
}

const GRADE_OPTIONS = [
  '一年级', '二年级', '三年级', '四年级', '五年级', '六年级',
  '初一', '初二', '初三',
  '高一', '高二', '高三'
];

function getAvailableSubjects(grade: string): string[] {
  const allSubjects = ['语文', '数学', '英语', '物理', '化学', '生物', '历史', '地理', '政治'];
  if (!grade) return allSubjects;

  if (['一年级', '二年级', '三年级', '四年级', '五年级', '六年级'].includes(grade)) {
    return ['语文', '数学', '英语'];
  }

  if (grade === '初一' || grade === '七年级') {
    return ['语文', '数学', '英语', '生物', '历史', '地理', '政治'];
  }

  if (grade === '初二' || grade === '八年级') {
    return ['语文', '数学', '英语', '物理', '生物', '历史', '地理', '政治'];
  }

  return allSubjects;
}

export default function AIVariationLibrary({
  onNavigate,
  onGeneratePaper,
  userInfo: propUserInfo,
  onRefreshUserInfo,
  initialNotebookId,
  initialSearchKey,
  initialMasteryStatus
}: {
  onNavigate: (v: any, params?: any) => void;
  onGeneratePaper?: (questions: ErrorQuestion[]) => void;
  userInfo?: any;
  onRefreshUserInfo?: () => void;
  initialNotebookId?: string | null;
  initialSearchKey?: string | null;
  initialMasteryStatus?: 'all' | 'not_mastered' | 'mastered' | null;
}) {
  const [questions, setQuestions] = useState<ErrorQuestion[]>([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterSubject, setFilterSubject] = useState<string>('all');
  const [filterNotebook, setFilterNotebook] = useState<string>('all');
  const [filterMastery, setFilterMastery] = useState<'all' | 'not_mastered' | 'mastered'>('all');
  const [notebooks, setNotebooks] = useState<any[]>([]);
  const [showNotebookModal, setShowNotebookModal] = useState<boolean>(false);
  const [notebookPanel, setNotebookPanel] = useState<'list' | 'create' | 'edit'>('list');
  const [editingNotebook, setEditingNotebook] = useState<any | null>(null);
  const [nbForm, setNbForm] = useState({ name: '', grade: '', subject: '', description: '' });
  const [activeNotebookId, setActiveNotebookId] = useState<string | null>(null);
  const [stats, setStats] = useState({ total: 0, mastered: 0, unmastered: 0 });
  const [activeDimension, setActiveDimension] = useState<'timeline' | 'knowledge' | 'error_count'>('timeline');

  // 后台进行中的任务
  const [activeTasks, setActiveTasks] = useState<any[]>([]);
  const prevActiveTaskIds = useRef<string[]>([]);

  // 响应 initialNotebookId 变化
  useEffect(() => {
    if (initialNotebookId) {
      setActiveNotebookId(initialNotebookId);
      setFilterNotebook(initialNotebookId);
    } else {
      setActiveNotebookId(null);
      setFilterNotebook('all');
    }
  }, [initialNotebookId]);

  // 响应 initialSearchKey 与 initialMasteryStatus 变化
  useEffect(() => {
    setSearch(initialSearchKey || '');
    setFilterMastery(initialMasteryStatus || 'all');
  }, [initialSearchKey, initialMasteryStatus]);

  // 获取正在进行中的任务
  const loadActiveTasks = async () => {
    try {
      const token = localStorage.getItem('errorbook_token');
      const res = await fetch('/api/tasks?status=active', {
        headers: {
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        }
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          const parsedData = data.map(task => {
            let payloadObj = task.payload;
            if (typeof payloadObj === 'string' && payloadObj.trim()) {
              try {
                payloadObj = JSON.parse(payloadObj);
              } catch (e) { }
            }
            if (typeof payloadObj === 'string' && payloadObj.trim()) {
              try {
                payloadObj = JSON.parse(payloadObj);
              } catch (e) { }
            }
            return {
              ...task,
              payload: payloadObj || {}
            };
          });
          console.log("加载活跃任务返回结果：", parsedData);
          setActiveTasks(parsedData);
        }
      }
    } catch (err) {
      console.error("加载进行中任务失败:", err);
    }
  };

  // 删除进行中或卡住的任务
  const handleDeleteTask = async (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('您确定要取消并删除这个正在处理的任务吗？')) return;
    try {
      const token = localStorage.getItem('errorbook_token');
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'DELETE',
        headers: {
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        }
      });
      if (res.ok) {
        loadActiveTasks();
      } else {
        const data = await res.json();
        alert(data.error || '删除任务失败');
      }
    } catch (err: any) {
      alert(err.message || '网络错误，删除任务失败');
    }
  };

  // 进入变题本后，开启轮询
  useEffect(() => {
    if (activeNotebookId === null) {
      setActiveTasks([]);
      return;
    }

    loadActiveTasks();

    const interval = setInterval(() => {
      loadActiveTasks();
    }, 5000);

    return () => clearInterval(interval);
  }, [activeNotebookId]);

  // 轮询对比：如果进行中任务减少，说明有任务执行完，触发数据重载
  useEffect(() => {
    const currentIds = activeTasks.map(t => t.id);
    const hasCompleted = prevActiveTaskIds.current.some(id => !currentIds.includes(id));
    if (hasCompleted && activeNotebookId !== null) {
      loadQuestions(1);
      updateNotebookStats();
      loadNotebooks();
    }
    prevActiveTaskIds.current = currentIds;
  }, [activeTasks, activeNotebookId]);

  const [selectedQuestion, setSelectedQuestion] = useState<ErrorQuestion | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // 分页状态
  const [currentPage, setCurrentPage] = useState(1);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [unclassifiedCount, setUnclassifiedCount] = useState(0);
  const pageSize = 10;

  const [localUserInfo, setLocalUserInfo] = useState<any>(null);
  const userInfo = propUserInfo || localUserInfo;

  const fetchUserInfo = () => {
    if (onRefreshUserInfo) {
      onRefreshUserInfo();
      return;
    }
    const token = localStorage.getItem('errorbook_token');
    if (!token) return;
    fetch('/api/user/info', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => {
        if (res.status === 401) {
          localStorage.removeItem('errorbook_token');
          localStorage.removeItem('errorbook_username');
          window.location.reload();
        }
        return res.json();
      })
      .then(data => {
        if (data && !data.error) {
          setLocalUserInfo(data);
        }
      })
      .catch(console.error);
  };

  const userRole = localStorage.getItem('errorbook_role') || 'user';
  const isAdmin = userRole === 'admin';
  const isStudent = !isAdmin;

  // 搜索框防抖
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(handler);
  }, [search]);

  useEffect(() => {
    loadNotebooks();
    loadUnclassifiedCount();
    fetchUserInfo();
  }, []);

  // 当筛选条件或防抖后的搜索内容变化时，且处于变题本内，刷新至第 1 页
  useEffect(() => {
    if (activeNotebookId !== null) {
      loadQuestions(1);
    }
  }, [activeNotebookId, filterSubject, filterMastery, debouncedSearch]);

  const updateNotebookStats = () => {
    if (activeNotebookId === null) return;
    db.getPaginatedQuestions({
      page: 1,
      limit: 100000,
      notebookId: activeNotebookId,
      search: debouncedSearch,
      notebookType: 'variation'
    }).then(res => {
      const total = res.questions.length;
      const mastered = res.questions.filter(q => q.masteryStatus === 'mastered').length;
      const unmastered = total - mastered;
      setStats({ total, mastered, unmastered });
    }).catch(err => {
      console.error('获取错题统计失败:', err);
    });
  };

  useEffect(() => {
    if (activeNotebookId !== null) {
      updateNotebookStats();
    }
  }, [activeNotebookId, debouncedSearch]);

  const loadUnclassifiedCount = () => {
    db.getUnclassifiedCount().then(count => {
      setUnclassifiedCount(count);
    }).catch(console.error);
  };

  const loadNotebooks = () => {
    const token = localStorage.getItem('errorbook_token');
    fetch('/api/notebooks?type=variation', {
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

  const loadQuestions = (page = 1) => {
    if (activeNotebookId === null) return;
    setLoadingQuestions(true);
    db.getPaginatedQuestions({
      page,
      limit: pageSize,
      subject: filterSubject,
      notebookId: activeNotebookId,
      masteryStatus: filterMastery,
      search: debouncedSearch,
      notebookType: 'variation'
    }).then(res => {
      setQuestions(res.questions);
      setTotalQuestions(res.total);
      setCurrentPage(res.page);
    }).catch(err => {
      console.error('获取分页错题失败:', err);
    }).finally(() => {
      setLoadingQuestions(false);
    });
  };

  const handleBackToNotebooks = () => {
    setActiveNotebookId(null);
    setFilterNotebook('all');
    setQuestions([]);
    setTotalQuestions(0);
    setCurrentPage(1);
    loadNotebooks();
    loadUnclassifiedCount();
  };

  const handleSaveNotebookSubmit = async () => {
    if (!nbForm.name || !nbForm.name.trim()) {
      window.alert('请填写变题本名称！');
      return;
    }
    try {
      const token = localStorage.getItem('errorbook_token');
      if (notebookPanel === 'create') {
        const res = await fetch('/api/notebooks', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify({ ...nbForm, type: 'variation' })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '创建失败');
        setNotebooks(prev => [data.notebook || data, ...prev]);
        loadUnclassifiedCount();
      } else if (notebookPanel === 'edit' && editingNotebook) {
        const res = await fetch(`/api/notebooks/${editingNotebook.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify(nbForm)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '修改失败');
        setNotebooks(prev => prev.map(n => n.id === editingNotebook.id ? { ...n, ...nbForm } : n));
        if (activeNotebookId !== null) {
          loadQuestions(currentPage);
        }
      }
      setNotebookPanel('list');
      setShowNotebookModal(false);
    } catch (err: any) {
      window.alert(err.message || '操作失败');
    }
  };

  const handleToggleMastery = async (id: string, current: 'not_mastered' | 'mastered' | undefined, e: React.MouseEvent) => {
    e.stopPropagation();
    const nextStatus = current === 'mastered' ? 'not_mastered' : 'mastered';
    try {
      await db.updateQuestionMastery(id, nextStatus);
      loadQuestions(currentPage);
      updateNotebookStats();
      if (selectedQuestion && selectedQuestion.id === id) {
        setSelectedQuestion(prev => prev ? { ...prev, masteryStatus: nextStatus } : null);
      }
    } catch (err: any) {
      window.alert(err.message || '更新掌握状态失败');
    }
  };

  const handleDeleteNotebook = async (id: string) => {
    const nbObj = notebooks.find(n => n.id === id);
    const nbName = nbObj ? nbObj.name : '此变题本';
    const count = nbObj ? (nbObj.questionCount || 0) : 0;

    const doubleCheck = window.confirm(
      `⚠️ 警告：变题本【${nbName}】内目前共包含 ${count} 道错题！\n` +
      `您确定要删除此变题本吗？\n\n` +
      `★ 重要提示：若确认删除，该变题本以及内部的所有 ${count} 道错题都将被同步永久删除（物理清空），此操作无法撤销！`
    );
    if (!doubleCheck) return;

    try {
      const token = localStorage.getItem('errorbook_token');
      const res = await fetch(`/api/notebooks/${id}`, {
        method: 'DELETE',
        headers: {
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '删除失败');

      setNotebooks(prev => prev.filter(n => n.id !== id));
      if (filterNotebook === id) {
        setFilterNotebook('all');
      }
      if (activeNotebookId === id) {
        setActiveNotebookId(null);
      }
      loadUnclassifiedCount();
      window.alert('变题本及其内部错题已被彻底清理！');
    } catch (err: any) {
      window.alert(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('确定要删除这道错题吗？')) return;
    await db.deleteQuestion(id);
    setSelectedQuestion(null);
    loadQuestions(currentPage);
    loadNotebooks();
    loadUnclassifiedCount();
    updateNotebookStats();
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const handleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(q => q.id)));
    }
  };

  const handleGeneratePaperClick = () => {
    if (selectedIds.size === 0) return;
    const selectedQuestions = questions.filter(q => selectedIds.has(q.id));
    if (onGeneratePaper) {
      onGeneratePaper(selectedQuestions);
    }
  };

  const renderPageNumbers = () => {
    const totalPages = Math.ceil(totalQuestions / pageSize);
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
          <span key={`ell-${idx}`} className="px-2 text-slate-450 font-bold text-xs select-none">
            ...
          </span>
        );
      }

      const isSelected = page === currentPage;
      return (
        <button
          key={page}
          onClick={() => loadQuestions(page as number)}
          className={`w-9 h-9 rounded-xl text-xs font-black transition-all flex items-center justify-center cursor-pointer ${isSelected
            ? 'bg-blue-600 text-white shadow-md shadow-blue-500/10'
            : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-55 hover:border-slate-350'
            }`}
        >
          {page}
        </button>
      );
    });
  };

  if (selectedQuestion) {
    return <QuestionDetail
      question={selectedQuestion}
      notebooks={notebooks}
      isAdmin={isAdmin}
      onBack={() => setSelectedQuestion(null)}
      onDelete={() => handleDelete(selectedQuestion.id)}
      onUpdate={(updated) => {
        setSelectedQuestion(updated);
        loadQuestions(currentPage);
        loadNotebooks();
        loadUnclassifiedCount();
        updateNotebookStats();
      }}
    />;
  }

  const subjects = ['数学', '英语', '语文', '物理', '化学', '生物', '历史', '地理', '政治'];
  const filtered = questions;

  const activeNotebook = notebooks.find(n => n.id === filterNotebook);

  const currentNotebookTasks = activeTasks.filter(task => {
    if (activeNotebookId === 'all') {
      return true;
    }
    if (activeNotebookId === 'unclassified') {
      return !task.notebookId || task.notebookId === 'unclassified';
    }
    return task.notebookId === activeNotebookId;
  });

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {activeNotebookId === null && (
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center mb-2">
          <div className="flex flex-col gap-1">
            <h2 className="text-2xl font-black text-slate-950 tracking-tight">AI变题库</h2>
            <p className="text-sm text-slate-500 font-medium">专门管理和存储举一反三变式题</p>
          </div>
          <button
            onClick={() => onNavigate('add')}
            className="text-xs font-bold text-white bg-blue-600 px-5 py-2.5 rounded-xl hover:bg-blue-700 transition-all shadow-md shadow-blue-500/10 cursor-pointer"
          >
            上传错题
          </button>
        </div>
      )}


      {activeNotebookId === null ? (
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* AI 学习额度状态栏 */}
          {userInfo && (
            <div className="bg-white border border-slate-200/85 rounded-2xl px-5 py-4 flex flex-col md:flex-row items-stretch md:items-center justify-between text-xs font-bold text-slate-700 gap-4 shadow-sm">
              <div className="flex items-center gap-2 shrink-0">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse"></span>
                <span>当前身份：</span>
                <span className="px-2.5 py-1 bg-blue-50 text-blue-600 rounded-lg border border-blue-100 font-black text-[10px]">
                  {userInfo.role === 'admin' ? '管理员' : userInfo.role === 'svip' ? 'SVIP会员' : userInfo.role === 'vip' ? 'VIP会员' : userInfo.role === 'teacher' ? '教师版' : '普通用户'}
                </span>
              </div>

              <div className="flex-1 flex items-center gap-3 min-w-0">
                <span className="shrink-0 text-slate-500">AI 学习额度</span>
                <div className="relative bg-slate-100 h-2 rounded-full flex-1 overflow-hidden">
                  <div
                    className="bg-blue-600 h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${(userInfo.aiRemaining === "无限" || userInfo.aiLimit === Infinity) ? 0 : Math.min(100, ((userInfo.aiUsedToday || 0) / (userInfo.aiLimit || 30)) * 100)}%`
                    }}
                  />
                </div>
                <span className="shrink-0 font-black text-slate-700 text-[11px]">
                  {(userInfo.aiRemaining === "无限" || userInfo.aiLimit === Infinity) ? "无限制" : `${userInfo.aiUsedToday || 0} / ${userInfo.aiLimit || 30}`}
                </span>
              </div>

              <div className="shrink-0 text-slate-400 text-[11px] font-semibold flex items-center gap-2 md:border-l md:border-slate-100 md:pl-4">
                <span>错题容量</span>
                <span className="font-extrabold text-slate-700 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-100">
                  {userInfo.capacityLimit === 0 ? `${userInfo.questionCount || 0} / 无限制` : `${userInfo.questionCount || 0} / ${userInfo.capacityLimit || 50}`}
                </span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {/* 用户自定义变题本卡片 */}
            {notebooks.map(nb => {
              const nbCount = nb.questionCount || 0;
              return (
                <div
                  key={nb.id}
                  onClick={() => {
                    setActiveNotebookId(nb.id);
                    setFilterNotebook(nb.id);
                  }}
                  className="relative bg-white hover:shadow-lg transition-all rounded-3xl border border-slate-200/80 p-5 flex flex-col justify-between min-h-[140px] cursor-pointer group hover:border-blue-400"
                >
                  <div className="flex gap-4 items-start">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border text-2xl shrink-0 shadow-inner ${getSubjectBg(nb.subject)}`}>
                      {getSubjectIcon(nb.subject)}
                    </div>
                    <div className="min-w-0 flex-1 pr-6">
                      <h3 className="text-base font-black text-slate-800 group-hover:text-blue-600 transition-colors truncate">
                        {nb.name}
                      </h3>
                      <p className="text-xs text-slate-400 font-semibold mt-1 truncate">
                        {nb.subject || '通用'}{nb.grade ? ` · ${nb.grade}` : ''}错题集
                      </p>
                    </div>
                  </div>

                  {/* 编辑变题本按钮 */}
                  <div className="absolute top-4 right-4">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingNotebook(nb);
                        setNbForm({
                          name: nb.name || '',
                          grade: nb.grade || '',
                          subject: nb.subject || '',
                          description: nb.description || ''
                        });
                        setNotebookPanel('edit');
                        setShowNotebookModal(true);
                      }}
                      className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
                      title="编辑变题本"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="border-t border-slate-100 pt-3 mt-4 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 font-extrabold">
                      <Book className="w-3.5 h-3.5 text-slate-400" />
                      <span>共 <span className="text-blue-600 font-black">{nbCount}</span> 题</span>
                      <span className="text-slate-300 mx-0.5">|</span>
                      <span className="text-amber-500"><span className="font-black">{nb.unmasteredCount || 0}</span> 未掌握</span>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-slate-400 font-semibold">
                      <Clock className="w-3.5 h-3.5 text-slate-300" />
                      <span>{timeAgo(nb.createdAt)}</span>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* 新建变题本虚线入口卡片 */}
            <div
              onClick={() => {
                setNotebookPanel('create');
                setNbForm({ name: '', grade: '', subject: '', description: '' });
                setShowNotebookModal(true);
              }}
              className="border-2 border-dashed border-slate-200/85 hover:border-blue-400 bg-white hover:bg-blue-50/10 cursor-pointer rounded-3xl p-5 flex flex-col items-center justify-center min-h-[140px] text-center transition-all group shadow-sm hover:shadow-md"
            >
              <PlusCircle className="w-8 h-8 text-slate-400 group-hover:text-blue-500 transition-colors mb-2 stroke-[1.5]" />
              <span className="text-sm font-black text-slate-700 group-hover:text-blue-600 transition-colors">
                创建新变题本
              </span>
              <span className="text-[12px] text-slate-400 font-semibold mt-1">
                按科目或考试整理
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <button
            onClick={handleBackToNotebooks}
            className="flex items-center gap-1.5 text-base font-extrabold text-slate-500 hover:text-slate-900 transition-all self-start cursor-pointer"
          >
            <span>← 返回错变本列表</span>
          </button>

          {/* 变题本概览信息 */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-2">
            <div className="space-y-1">
              <h1 className="text-3xl font-bold text-slate-800 tracking-tight">
                {activeNotebookId === 'all' ? '全部错题' : activeNotebookId === 'unclassified' ? '未分类错题' : (activeNotebook?.name || '未分类错题')}
              </h1>
              <div className="text-sm text-slate-400 font-medium">
                {stats.total} 道错题 · {stats.unmastered} 道未掌握
              </div>
            </div>

            {/* 右上角维度选项卡 */}
            {false && (
              <div className="flex bg-[#f3f0ea] p-1 rounded-xl border border-slate-200/45 shrink-0 self-start md:self-auto shadow-sm">
                <button
                  onClick={() => setActiveDimension('timeline')}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeDimension === 'timeline'
                    ? 'bg-[#f8f5ee] text-[#b38235] shadow-sm'
                    : 'text-slate-500 hover:text-slate-850'
                    }`}
                >
                  📋 时间线
                </button>
                <button
                  onClick={() => setActiveDimension('knowledge')}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeDimension === 'knowledge'
                    ? 'bg-[#f8f5ee] text-[#b38235] shadow-sm'
                    : 'text-slate-500 hover:text-slate-855'
                    }`}
                >
                  🏷️ 知识点
                </button>
                <button
                  onClick={() => setActiveDimension('error_count')}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeDimension === 'error_count'
                    ? 'bg-[#f8f5ee] text-[#b38235] shadow-sm'
                    : 'text-slate-500 hover:text-slate-855'
                    }`}
                >
                  📊 错误次数
                </button>
              </div>
            )}
          </div>

          {/* Filter and Tab section */}
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 border-b border-slate-200/60 pb-4">
            {/* 左侧掌握状态 Tab */}
            <div className="flex bg-slate-100/70 p-1 rounded-2xl gap-1 self-start">
              <button
                onClick={() => setFilterMastery('all')}
                className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${filterMastery === 'all'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/10'
                  : 'text-slate-500 hover:text-slate-800'
                  }`}
              >
                <span>全部</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-black ${filterMastery === 'all'
                  ? 'bg-blue-700/30 text-white'
                  : 'bg-slate-200 text-slate-500'
                  }`}>
                  {stats.total}
                </span>
              </button>
              {!initialSearchKey && (
                <>
                  <button
                    onClick={() => setFilterMastery('not_mastered')}
                    className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${filterMastery === 'not_mastered'
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-500/10'
                      : 'text-slate-500 hover:text-slate-800'
                      }`}
                  >
                    <span>未掌握</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-black ${filterMastery === 'not_mastered'
                      ? 'bg-blue-700/30 text-white'
                      : 'bg-slate-200 text-slate-500'
                      }`}>
                      {stats.unmastered}
                    </span>
                  </button>
                  <button
                    onClick={() => setFilterMastery('mastered')}
                    className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${filterMastery === 'mastered'
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-500/10'
                      : 'text-slate-500 hover:text-slate-800'
                      }`}
                  >
                    <span>已掌握</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-black ${filterMastery === 'mastered'
                      ? 'bg-blue-700/30 text-white'
                      : 'bg-slate-200 text-slate-500'
                      }`}>
                      {stats.mastered}
                    </span>
                  </button>
                </>
              )}
            </div>

            {/* 右侧搜索与过滤 */}
            <div className="flex flex-wrap items-center gap-2 lg:justify-end flex-1">
              <div className="relative flex-1 max-w-xs min-w-[150px]">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="搜索题目、知识点..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-xs font-semibold text-slate-700 placeholder-slate-400"
                />
              </div>

            </div>
          </div>

          {/* List */}
          {loadingQuestions ? (
            <div className="min-h-[300px] flex flex-col items-center justify-center space-y-4 bg-white rounded-3xl border border-slate-100 shadow-sm">
              <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
              <p className="text-slate-500 font-bold text-xs animate-pulse">正在加载错题数据，请稍候...</p>
            </div>
          ) : (filtered.length === 0 && currentNotebookTasks.length === 0) ? (
            <div className="bg-white rounded-3xl p-16 text-center border border-slate-200/60 shadow-sm flex flex-col items-center justify-center space-y-4">
              <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center border border-slate-100">
                <Book className="w-8 h-8 text-slate-350" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-black text-slate-800">暂无符合条件的错题</h3>
                <p className="text-slate-400 font-semibold text-xs max-w-sm mx-auto">
                  在此筛选条件下，我们没有找到任何错题记录。您可以更换筛选条件、清除搜索框或去“录入新错题”。
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-col gap-4">
                {currentPage === 1 && currentNotebookTasks.map((task) => {
                  const taskImg = task.payload?.imageBase64;
                  const formattedDate = format(new Date(task.createdAt), 'MM/dd');
                  return (
                    <div
                      key={task.id}
                      className="relative group bg-slate-50/50 rounded-3xl border border-dashed border-slate-250 transition-all flex flex-col md:flex-row p-5 gap-5 items-center opacity-85 hover:border-blue-400 hover:opacity-100"
                    >
                      {/* 左侧缩略图 */}
                      <div className="w-24 h-24 md:w-28 md:h-28 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden shrink-0 shadow-inner">
                        {taskImg ? (
                          <img src={taskImg} alt="录入缩略图" className="w-full h-full object-cover rounded-2xl filter brightness-95 grayscale-[20%]" />
                        ) : (
                          <div className="text-2xl text-slate-300">📝</div>
                        )}
                      </div>

                      {/* 右侧主内容区：正在进行中提示 */}
                      <div className="flex-1 flex flex-col md:flex-row justify-between items-start md:items-center w-full gap-4">
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center gap-2 text-slate-700 font-extrabold text-sm md:text-base">
                            <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                            <span>错题AI正在分析中...</span>
                            <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded font-black border border-blue-100 uppercase tracking-wider scale-95 origin-left">
                              {task.status === 'queued' ? '排队中' : task.status === 'extracting' ? '文本提取' : '智能批改'}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 font-semibold">
                            图片已保存，分析完成后自动更新
                          </p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0 self-end md:self-auto">
                          <span className="text-xs text-slate-400 font-extrabold">{formattedDate}</span>
                          <button
                            onClick={(e) => handleDeleteTask(task.id, e)}
                            className="p-1.5 text-slate-450 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition cursor-pointer"
                            title="取消并删除任务"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {filtered.map((q, index) => {
                  const isSelected = selectedIds.has(q.id);
                  const isPending = q.status === 'pending';
                  const isAIVariant = q.originalText.includes('【AI变式生成中...】');
                  const isTimeout = isPending && isAIVariant && (Date.now() - q.createdAt > 10 * 60 * 1000); // 10分钟超时
                  const formattedDate = format(new Date(q.createdAt), 'MM/dd');

                  if (isPending && isAIVariant) {
                    if (isTimeout) {
                      // 超时/失效卡片
                      return (
                        <div key={q.id} className="relative group bg-rose-50/30 rounded-3xl border border-rose-200 p-5 gap-5 flex items-stretch shadow-sm">
                          <div className="w-24 h-24 md:w-28 md:h-28 rounded-2xl bg-white border border-rose-100 flex flex-col items-center justify-center shrink-0">
                            <span className="text-3xl mb-1">❌</span>
                            <span className="text-[10px] font-bold text-rose-500">生成失败</span>
                          </div>
                          <div className="flex-1 flex flex-col justify-center min-w-0">
                            <h4 className="text-sm md:text-base font-black text-rose-700 mb-2 flex items-center gap-2">
                              ⚠️ 变式题生成失败或已超时
                            </h4>
                            <p className="text-xs text-rose-500/80 font-bold leading-relaxed mb-4">
                              该任务等待已超过 10 分钟，可能由于您的网络波动、意外刷新页面或 AI 接口断开导致本地数据进程丢失。这只是一个占位符残余，请直接删除。
                            </p>
                            <div className="mt-auto">
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDelete(q.id); }}
                                className="flex items-center gap-1.5 px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-rose-500/20 cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                                <span>删除失效任务残余</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    } else {
                      // 极致加载骨架屏卡片 (Wow UX)
                      return (
                        <div key={q.id} className="relative group bg-white rounded-3xl border border-blue-200 ring-2 ring-blue-500/10 p-5 gap-5 flex flex-col md:flex-row items-stretch shadow-md overflow-hidden">
                          {/* 光效扫描线动画 */}
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-blue-50/30 to-transparent -translate-x-full animate-[shimmer_2s_infinite]" />
                          
                          {/* 左侧封面 */}
                          <div className="w-24 h-24 md:w-28 md:h-28 rounded-2xl bg-blue-50/50 border border-blue-100 flex flex-col items-center justify-center shrink-0 relative z-10">
                            <Sparkles className="w-8 h-8 text-blue-500 animate-pulse mb-2" />
                            <span className="text-[10px] font-black tracking-widest uppercase text-blue-600">AI 命题中</span>
                          </div>

                          {/* 右侧骨架屏区 */}
                          <div className="flex-1 flex flex-col min-w-0 relative z-10 space-y-4 pt-1">
                            <div className="flex items-center gap-3">
                              <span className="inline-flex items-center gap-1.5 bg-blue-100/50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-lg text-xs font-black shadow-sm">
                                <Loader2 className="w-3.5 h-3.5 animate-spin" /> 正在智能生成
                              </span>
                              <div className="h-4 bg-slate-100 rounded-md w-1/3 animate-pulse"></div>
                            </div>
                            
                            <div className="space-y-2.5">
                              <div className="h-3 bg-slate-50 rounded w-full animate-pulse"></div>
                              <div className="h-3 bg-slate-50 rounded w-5/6 animate-pulse"></div>
                              <div className="h-3 bg-slate-50 rounded w-4/6 animate-pulse"></div>
                            </div>

                            <div className="mt-auto border-t border-slate-50 pt-3 flex items-center gap-2">
                              <div className="h-6 bg-blue-50 rounded-lg w-20 animate-pulse"></div>
                              <div className="h-6 bg-slate-50 rounded-lg w-16 animate-pulse"></div>
                              <div className="h-6 bg-slate-50 rounded-lg w-24 animate-pulse"></div>
                            </div>
                          </div>
                        </div>
                      );
                    }
                  }

                  return (
                    <div
                      key={q.id}
                      className={`relative group bg-white rounded-3xl border transition-all flex flex-col md:flex-row p-5 gap-5 items-stretch ${
                        isPending ? 'border-amber-400 ring-2 ring-amber-400/20 bg-amber-50/30 shadow-md' :
                        isSelected ? 'border-blue-500 ring-2 ring-blue-500/10' : 'border-slate-200 hover:shadow-md hover:border-blue-400'
                      }`}
                    >
                      {/* 卡片左侧：缩略图/原图 */}
                      <div
                        onClick={() => setSelectedQuestion(q)}
                        className="w-24 h-24 md:w-28 md:h-28 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center overflow-hidden shrink-0 cursor-pointer shadow-inner"
                      >
                        {q.imageUrl ? (
                          <img src={q.imageUrl} alt="缩略图" className="w-full h-full object-cover rounded-2xl hover:scale-105 transition duration-300" />
                        ) : (
                          <div className="flex flex-col items-center justify-center text-slate-350">
                            <span className="text-3xl mb-1">{getSubjectIcon(q.subject)}</span>
                            <span className="text-[10px] font-bold">{q.subject}</span>
                          </div>
                        )}
                      </div>

                      {/* 卡片右侧：主内容区 */}
                      <div className="flex-1 flex flex-col justify-between min-w-0">
                        {/* 第一行：序号、题干与日期 */}
                        <div className="flex justify-between items-start gap-4 mb-2">
                          <div
                            onClick={() => setSelectedQuestion(q)}
                            className="text-slate-800 font-bold text-sm md:text-base leading-relaxed line-clamp-2 cursor-pointer flex-1"
                          >
                            <span className="mr-1.5">{index + 1 + (currentPage - 1) * pageSize}.</span>
                            <InlineContent text={cleanTextForSummary(q.originalText)} />
                          </div>
                          <div className="text-xs text-slate-400 font-extrabold shrink-0 pt-0.5 flex items-center gap-1">
                            {formattedDate}
                          </div>
                        </div>

                        {/* 第二行：错因分析 */}
                        {q.errorAnalysis && (() => {
                          const cleanText = cleanTextForSummary(q.errorAnalysis);
                          return (
                            <div
                              onClick={() => setSelectedQuestion(q)}
                              className="text-xs text-slate-500 font-medium leading-relaxed mb-3.5 cursor-pointer bg-slate-50/50 p-2 rounded-xl border border-slate-100/40"
                            >
                              <div
                                className="line-clamp-2 overflow-hidden"
                                style={{
                                  display: '-webkit-box',
                                  WebkitLineClamp: 2,
                                  WebkitBoxOrient: 'vertical',
                                  overflow: 'hidden'
                                }}
                              >
                                <span className="font-bold text-slate-700 mr-1.5">错因分析:</span>
                                <InlineContent text={cleanText} />
                              </div>
                            </div>
                          );
                        })()}

                        {/* 第三行：标签和操作区域 */}
                        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 mt-auto">
                          {/* 左侧：标签列表与转移下拉菜单 */}
                          <div className="flex flex-wrap items-center gap-2">
                            {/* 考察方向标签 */}
                            {q.examDirection && (
                              <span className="text-xs bg-blue-50 text-blue-600 border border-blue-200/60 px-2.5 py-1 rounded-xl font-bold transition-all">
                                🎯 {q.examDirection}
                              </span>
                            )}
                            {/* 错因标签 */}
                            {q.errorReason && q.errorReason !== 'AI变式题' && (
                              <span className={`text-xs px-2.5 py-1 rounded-xl border font-bold ${q.errorReason.includes('完全掌握') ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
                                  q.errorReason.includes('概念/审题') ? 'bg-orange-100 text-orange-700 border-orange-200' :
                                    q.errorReason.includes('逻辑/建模') ? 'bg-pink-100 text-pink-700 border-pink-200' :
                                      q.errorReason.includes('计算/执行') ? 'bg-yellow-100 text-yellow-800 border-yellow-200' :
                                        q.errorReason.includes('规范/表达') ? 'bg-teal-100 text-teal-700 border-teal-200' :
                                          'bg-rose-50 text-rose-600 border-rose-100'
                                }`}>
                                {q.errorReason.includes('完全掌握') ? '✅' : '⚠️'} {q.errorReason}
                              </span>
                            )}
                            {/* 知识点标签 */}
                            {q.knowledgePoints.map((p: string) => (
                              <span
                                key={p}
                                className="text-xs bg-purple-50 text-purple-600 border border-purple-200/60 px-2.5 py-1 rounded-xl font-bold transition-all"
                              >
                                📖 {p}
                              </span>
                            ))}

                            {/* 转移变题本胶囊下拉菜单 */}
                            <div className="relative flex items-center text-xs font-extrabold px-3 py-1 rounded-xl bg-blue-50/60 text-blue-600 border border-blue-150 hover:bg-blue-100/80 transition cursor-pointer">
                              <span>📂 转移:</span>
                              <select
                                value={q.notebookId || ''}
                                onClick={(e) => e.stopPropagation()}
                                onChange={async (e) => {
                                  e.stopPropagation();
                                  const targetNbId = e.target.value;
                                  const targetNb = notebooks.find(n => n.id === targetNbId);
                                  const updated = {
                                    ...q,
                                    notebookId: targetNbId || undefined,
                                    notebookName: targetNb ? targetNb.name : undefined
                                  };
                                  try {
                                    await db.saveQuestion(updated);
                                    loadQuestions(currentPage);
                                    loadNotebooks();
                                    loadUnclassifiedCount();
                                    updateNotebookStats();
                                  } catch (err: any) {
                                    window.alert(err.message || '转移失败');
                                  }
                                }}
                                className="ml-1 bg-transparent text-blue-600 border-none outline-none cursor-pointer pr-1 font-bold text-xs"
                                title="快速转移所属变题本"
                              >
                                <option value="">未分类</option>
                                {notebooks.map(nb => (
                                  <option key={nb.id} value={nb.id}>{nb.name}</option>
                                ))}
                              </select>
                            </div>
                          </div>

                          {/* 右侧：已/未掌握状态胶囊 & 删除按钮 */}
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={(e) => handleToggleMastery(q.id, q.masteryStatus, e)}
                              className={`text-xs font-bold px-3 py-1 rounded-full transition-all flex items-center gap-1 cursor-pointer border ${q.masteryStatus === 'mastered'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                : 'bg-rose-50/70 text-rose-600 border-rose-200/60 hover:bg-rose-100/80'
                                }`}
                              title="点击一键切换掌握状态"
                            >
                              {q.masteryStatus === 'mastered' ? '已掌握' : '未掌握'}
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(q.id);
                              }}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              title="删除此错题"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>


                    </div>
                  );
                })}
              </div>

              {/* 美观的分页组件 */}
              {totalQuestions > pageSize && (
                <div className="flex flex-col sm:flex-row items-center justify-between border-t border-slate-100 pt-6 mt-4 gap-4">
                  <div className="text-xs text-slate-500 font-bold">
                    显示第 {(currentPage - 1) * pageSize + 1} 到 {Math.min(currentPage * pageSize, totalQuestions)} 条，共 {totalQuestions} 条错题
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => currentPage > 1 && loadQuestions(currentPage - 1)}
                      disabled={currentPage === 1}
                      className={`px-3 py-2 rounded-xl text-xs font-black border transition-all ${currentPage === 1
                        ? 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-55 hover:border-slate-300 cursor-pointer'
                        }`}
                    >
                      上一页
                    </button>
                    {renderPageNumbers()}
                    <button
                      onClick={() => currentPage < Math.ceil(totalQuestions / pageSize) && loadQuestions(currentPage + 1)}
                      disabled={currentPage === Math.ceil(totalQuestions / pageSize)}
                      className={`px-3 py-2 rounded-xl text-xs font-black border transition-all ${currentPage === Math.ceil(totalQuestions / pageSize)
                        ? 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-55 hover:border-slate-300 cursor-pointer'
                        }`}
                    >
                      下一页
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {showNotebookModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 border border-slate-100 animate-in zoom-in-95 duration-200">

            {/* 头部导航/标题 */}
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-1.5">
                <span>📓</span> {notebookPanel === 'list' ? '管理变题本' : notebookPanel === 'create' ? '新建变题本' : '编辑变题本'}
              </h3>
              <button
                onClick={() => {
                  setShowNotebookModal(false);
                  setNotebookPanel('list');
                }}
                className="w-8 h-8 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Panel 1: 变题本列表 */}
            {notebookPanel === 'list' && (
              <div className="space-y-4">
                <button
                  onClick={() => {
                    setNbForm({ name: '', grade: '', subject: '', description: '' });
                    setNotebookPanel('create');
                  }}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1 shadow-sm"
                >
                  + 新建变题本
                </button>
                <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                  {notebooks.length === 0 ? (
                    <div className="text-center py-8 text-xs text-slate-400 font-medium">暂无变题本，请点击上方按钮新建</div>
                  ) : (
                    notebooks.map(nb => {
                      const count = questions.filter(q => q.notebookId === nb.id).length;
                      return (
                        <div key={nb.id} className="flex justify-between items-center p-3 bg-slate-50 hover:bg-slate-100/80 rounded-xl border border-slate-150 transition">
                          <div className="flex flex-col truncate max-w-[220px]">
                            <span className="text-xs font-bold text-slate-700 truncate">{nb.name}</span>
                            <span className="text-[9px] text-slate-400 font-semibold mt-0.5 truncate">
                              {nb.grade || nb.subject ? `${[nb.grade, nb.subject].filter(Boolean).join(' | ')} • ` : ''}${count} 道错题
                            </span>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <button
                              onClick={() => {
                                setEditingNotebook(nb);
                                setNbForm({
                                  name: nb.name || '',
                                  grade: nb.grade || '',
                                  subject: nb.subject || '',
                                  description: nb.description || ''
                                });
                                setNotebookPanel('edit');
                              }}
                              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg text-[10px] font-bold transition cursor-pointer"
                            >
                              编辑
                            </button>
                            <button
                              onClick={() => handleDeleteNotebook(nb.id)}
                              className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg text-[10px] font-bold transition cursor-pointer"
                            >
                              删除
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* Panel 2 & 3: 新增/修改表单 */}
            {(notebookPanel === 'create' || notebookPanel === 'edit') && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600 mb-1 block">名称</label>
                  <input
                    type="text"
                    value={nbForm.name}
                    onChange={e => setNbForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="例如：初二"
                    className="w-full px-4 py-3 h-[42px] bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-xl outline-none text-xs font-semibold focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-800"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-600 mb-1 block">年级</label>
                    <select
                      value={nbForm.grade}
                      onChange={e => {
                        const selectedGrade = e.target.value;
                        setNbForm(prev => {
                          const available = getAvailableSubjects(selectedGrade);
                          const newSubject = available.includes(prev.subject) ? prev.subject : (available[0] || '');
                          return {
                            ...prev,
                            grade: selectedGrade,
                            subject: newSubject
                          };
                        });
                      }}
                      className="w-full px-3 h-[42px] bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-xl outline-none text-xs font-semibold focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-700 cursor-pointer"
                    >
                      <option value="">选择年级</option>
                      {GRADE_OPTIONS.map(g => (
                        <option key={g} value={g}>{g}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-600 mb-1 block">学科</label>
                    <select
                      value={nbForm.subject}
                      onChange={e => setNbForm(prev => ({ ...prev, subject: e.target.value }))}
                      className="w-full px-3 h-[42px] bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-xl outline-none text-xs font-semibold focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-700 cursor-pointer"
                    >
                      <option value="">选择学科</option>
                      {getAvailableSubjects(nbForm.grade).map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600 mb-1 block">描述（可选）</label>
                  <textarea
                    rows={3}
                    value={nbForm.description}
                    onChange={e => setNbForm(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="例如：方程、函数、几何证明等重点易错题集合"
                    className="w-full px-4 py-3 bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-xl outline-none text-xs font-semibold focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-none text-slate-800"
                  />
                </div>

                {notebookPanel === 'create' ? (
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => {
                        setShowNotebookModal(false);
                        setNotebookPanel('list');
                      }}
                      className="flex-1 py-3 bg-slate-100 hover:bg-slate-200/80 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer text-center"
                    >
                      取消
                    </button>
                    <button
                      onClick={handleSaveNotebookSubmit}
                      className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-extrabold transition-all cursor-pointer shadow-md shadow-blue-500/10 text-center"
                    >
                      保存
                    </button>
                  </div>
                ) : (
                  <div className="flex justify-between items-center pt-2 gap-3">
                    <button
                      onClick={async () => {
                        if (editingNotebook) {
                          await handleDeleteNotebook(editingNotebook.id);
                          setShowNotebookModal(false);
                          setNotebookPanel('list');
                        }
                      }}
                      className="py-3 px-5 text-[#ef4444] bg-[#fef2f2] border border-[#fecaca] hover:bg-[#fee2e2] rounded-xl text-xs font-bold transition-all cursor-pointer text-center"
                    >
                      删除
                    </button>
                    <div className="flex gap-2 flex-1 justify-end">
                      <button
                        onClick={() => {
                          setShowNotebookModal(false);
                          setNotebookPanel('list');
                        }}
                        className="py-3 px-5 bg-slate-100 hover:bg-slate-200/80 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer text-center min-w-[80px]"
                      >
                        取消
                      </button>
                      <button
                        onClick={handleSaveNotebookSubmit}
                        className="py-3 px-6 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-extrabold transition-all cursor-pointer shadow-md shadow-blue-500/10 text-center min-w-[90px]"
                      >
                        保存
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
}


