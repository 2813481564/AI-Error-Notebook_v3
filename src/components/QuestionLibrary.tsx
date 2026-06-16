import React, { useEffect, useState } from 'react';
import { db, ErrorQuestion, DiagnosisStep } from '../lib/db';
import { Search, Book, Clock, ChevronRight, X, Sparkles, Loader2, ArrowLeft, Trash2, Check, PlusCircle, RefreshCw, MoreHorizontal } from 'lucide-react';
import { format } from 'date-fns';
import FormattedMath, { InlineContent } from './FormattedMath';
import { parseIndividualErrorAnalysis } from '../lib/parser';
import GeometryRenderer from './GeometryRenderer';
import type { GeometryData } from '../types/geometry';

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

export default function QuestionLibrary({
  onNavigate,
  onGeneratePaper,
  userInfo: propUserInfo,
  onRefreshUserInfo
}: {
  onNavigate: (v: any) => void;
  onGeneratePaper?: (questions: ErrorQuestion[]) => void;
  userInfo?: any;
  onRefreshUserInfo?: () => void;
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

  // 当筛选条件或防抖后的搜索内容变化时，且处于错题本内，刷新至第 1 页
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
      notebookId: activeNotebookId
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
  }, [activeNotebookId]);

  const loadUnclassifiedCount = () => {
    db.getUnclassifiedCount().then(count => {
      setUnclassifiedCount(count);
    }).catch(console.error);
  };

  const loadNotebooks = () => {
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

  const loadQuestions = (page = 1) => {
    if (activeNotebookId === null) return;
    setLoadingQuestions(true);
    db.getPaginatedQuestions({
      page,
      limit: pageSize,
      subject: filterSubject,
      notebookId: activeNotebookId,
      masteryStatus: filterMastery,
      search: debouncedSearch
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
      window.alert('请填写错题本名称！');
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
          body: JSON.stringify(nbForm)
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
    const nbName = nbObj ? nbObj.name : '此错题本';
    const count = nbObj ? (nbObj.questionCount || 0) : 0;

    const doubleCheck = window.confirm(
      `⚠️ 警告：错题本【${nbName}】内目前共包含 ${count} 道错题！\n` +
      `您确定要删除此错题本吗？\n\n` +
      `★ 重要提示：若确认删除，该错题本以及内部的所有 ${count} 道错题都将被同步永久删除（物理清空），此操作无法撤销！`
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
      window.alert('错题本及其内部错题已被彻底清理！');
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

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {activeNotebookId === null && (
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center mb-2">
          <div className="flex flex-col gap-1">
            <h2 className="text-2xl font-black text-slate-950 tracking-tight">错题库管理</h2>
            <p className="text-sm text-slate-500 font-medium">按学科、错题本、知识点智能归档</p>
          </div>
          <button
            onClick={() => onNavigate('add')}
            className="text-xs font-bold text-white bg-blue-600 px-5 py-2.5 rounded-xl hover:bg-blue-700 transition-all shadow-md shadow-blue-500/10 cursor-pointer"
          >
            + 录入新错题
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
            {/* 默认未分类错题卡片 */}
            <div
              onClick={() => {
                setActiveNotebookId('unclassified');
                setFilterNotebook('unclassified');
              }}
              className="relative bg-white hover:shadow-lg transition-all rounded-3xl border border-slate-200/80 p-5 flex flex-col justify-between min-h-[140px] cursor-pointer group hover:border-blue-400"
            >
              <div className="flex gap-4 items-start">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center border text-2xl shrink-0 bg-slate-50 border-slate-150 shadow-inner">
                  📓
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-black text-slate-800 group-hover:text-blue-600 transition-colors truncate">
                    未分类错题
                  </h3>
                  <p className="text-xs text-slate-400 font-semibold mt-1 truncate">
                    系统默认归档集
                  </p>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-3 mt-4 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-slate-500 font-extrabold">
                  <Book className="w-3.5 h-3.5 text-slate-400" />
                  <span>共 <span className="text-blue-600 font-black">{unclassifiedCount}</span> 道错题</span>
                </div>
                <div className="flex items-center gap-1 text-[10px] text-slate-400 font-semibold">
                  <Clock className="w-3.5 h-3.5 text-slate-300" />
                  <span>刚刚</span>
                </div>
              </div>
            </div>

            {/* 用户自定义错题本卡片 */}
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

                  {/* 编辑错题本按钮 */}
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
                      title="编辑错题本"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="border-t border-slate-100 pt-3 mt-4 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 font-extrabold">
                      <Book className="w-3.5 h-3.5 text-slate-400" />
                      <span>共 <span className="text-blue-600 font-black">{nbCount}</span> 道错题</span>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-slate-400 font-semibold">
                      <Clock className="w-3.5 h-3.5 text-slate-300" />
                      <span>{timeAgo(nb.createdAt)}</span>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* 新建错题本虚线入口卡片 */}
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
                创建新错题本
              </span>
              <span className="text-[10px] text-slate-400 font-semibold mt-1">
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
            <span>← 返回错题本列表</span>
          </button>

          {/* 错题本概览信息 */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-2">
            <div className="space-y-1">
              <h1 className="text-3xl font-bold text-slate-800 tracking-tight">
                {activeNotebookId === 'unclassified' ? '未分类错题' : (activeNotebook?.name || '未分类错题')}
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
          ) : filtered.length === 0 ? (
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
                {filtered.map((q, index) => {
                  const isSelected = selectedIds.has(q.id);
                  const formattedDate = format(new Date(q.createdAt), 'MM/dd');
                  return (
                    <div
                      key={q.id}
                      className={`relative group bg-white rounded-3xl border transition-all flex flex-col md:flex-row p-5 gap-5 items-stretch ${isSelected ? 'border-blue-500 ring-2 ring-blue-500/10' : 'border-slate-200 hover:shadow-md hover:border-blue-400'
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
                            {q.originalText}
                          </div>
                          <div className="text-xs text-slate-400 font-extrabold shrink-0 pt-0.5 flex items-center gap-1">
                            {formattedDate}
                          </div>
                        </div>

                        {/* 第二行：错因分析 */}
                        {q.errorAnalysis && (() => {
                          const cleanText = q.errorAnalysis.replace(/\n+/g, ' ').trim();
                          const displayText = cleanText.length > 90 ? cleanText.slice(0, 90) + '...' : cleanText;
                          return (
                            <div
                              onClick={() => setSelectedQuestion(q)}
                              className="text-xs text-slate-500 font-medium leading-relaxed mb-3.5 cursor-pointer bg-slate-50/50 p-2 rounded-xl border border-slate-100/40 line-clamp-2 overflow-hidden"
                              style={{
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden'
                              }}
                            >
                              <span className="font-bold text-slate-700 mr-1.5">错因分析:</span>
                              {displayText}
                            </div>
                          );
                        })()}

                        {/* 第三行：标签和操作区域 */}
                        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 mt-auto">
                          {/* 左侧：标签列表与转移下拉菜单 */}
                          <div className="flex flex-wrap items-center gap-2">
                            {/* 知识点标签 */}
                            {q.knowledgePoints.map(p => (
                              <span
                                key={p}
                                className="text-xs bg-slate-50 text-slate-600 border border-slate-200/60 px-2.5 py-1 rounded-xl font-bold transition-all"
                              >
                                {p}
                              </span>
                            ))}

                            {/* 转移错题本胶囊下拉菜单 */}
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
                                title="快速转移所属错题本"
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
                <span>📓</span> {notebookPanel === 'list' ? '管理错题本' : notebookPanel === 'create' ? '新建错题本' : '编辑错题本'}
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

            {/* Panel 1: 错题本列表 */}
            {notebookPanel === 'list' && (
              <div className="space-y-4">
                <button
                  onClick={() => {
                    setNbForm({ name: '', grade: '', subject: '', description: '' });
                    setNotebookPanel('create');
                  }}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1 shadow-sm"
                >
                  + 新建错题本
                </button>
                <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                  {notebooks.length === 0 ? (
                    <div className="text-center py-8 text-xs text-slate-400 font-medium">暂无错题本，请点击上方按钮新建</div>
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
                    className="w-full px-4 py-3 bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-xl outline-none text-xs font-semibold focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-800"
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
                      className="w-full px-3 py-3 bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-xl outline-none text-xs font-semibold focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-700 cursor-pointer"
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
                      className="w-full px-3 py-3 bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-xl outline-none text-xs font-semibold focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-700 cursor-pointer"
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

function QuestionDetail({
  question,
  notebooks,
  isAdmin,
  onBack,
  onDelete,
  onUpdate
}: {
  question: ErrorQuestion,
  notebooks: { id: string; name: string; grade?: string }[],
  isAdmin: boolean,
  onBack: () => void,
  onDelete: () => void,
  onUpdate?: (updated: ErrorQuestion) => void
}) {
  const [similarTabActive, setSimilarTabActive] = useState(false);
  const [similarData, setSimilarData] = useState<any>(question.similarQuestion || null);
  const [generating, setGenerating] = useState(false);

  // 用于支持多道题数量选择与保存状态跟踪
  const [similarCount, setSimilarCount] = useState<number>(1);
  const [savedStatus, setSavedStatus] = useState<Record<number, boolean>>({});

  // 解析题干中包含的子题
  const parsedQs = parseIndividualQuestions(question.originalText);
  const [selectedSubQIndex, setSelectedSubQIndex] = useState<number>(0);

  useEffect(() => {
    setSavedStatus({});
  }, [similarData]);

  useEffect(() => {
    setSelectedSubQIndex(0);
    setSimilarData(question.similarQuestion || null);
  }, [question]);

  const handleSaveSimilarItem = async (item: any, idx: number) => {
    try {
      const newId = "q_similar_" + Math.random().toString(36).substring(2, 9);
      const selectedNbObj = notebooks.find(n => n.id === question.notebookId);
      const newQuestion: ErrorQuestion = {
        id: newId,
        originalText: item.questionText,
        subject: question.subject,
        knowledgePoints: [...question.knowledgePoints, "AI变式题"],
        errorReason: "AI变式题",
        solution: item.solution,
        createdAt: Date.now(),
        notebookId: question.notebookId,
        notebookName: selectedNbObj ? selectedNbObj.name : undefined,
        masteryStatus: "not_mastered",
        status: "audited",
        similarQuestion: item
      };

      await db.saveQuestion(newQuestion);
      setSavedStatus(prev => ({ ...prev, [idx]: true }));
      window.alert(`成功将变式题 ${idx + 1} 保存至错题库！您可以直接在“组卷练习”中进行添加。`);
    } catch (err: any) {
      window.alert(err.message || "保存失败，请重试");
    }
  };

  const isStudent = !isAdmin;

  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState(question.originalText);
  const [editedSubject, setEditedSubject] = useState(question.subject);
  const [editedSolution, setEditedSolution] = useState(question.solution);
  const [editedErrorReason, setEditedErrorReason] = useState(question.errorReason);
  const [editedKp, setEditedKp] = useState(question.knowledgePoints.join(', '));
  const [selectedNotebook, setSelectedNotebook] = useState(question.notebookId || '');
  const [editedStudentAnswer, setEditedStudentAnswer] = useState(question.studentAnswer || '');
  const [editedErrorDiagnosis, setEditedErrorDiagnosis] = useState<DiagnosisStep[]>(question.errorDiagnosis || []);
  const [editedErrorAnalysis, setEditedErrorAnalysis] = useState(question.errorAnalysis || '');
  const [saving, setSaving] = useState(false);


  useEffect(() => {
    setEditedText(question.originalText);
    setEditedSubject(question.subject);
    setEditedSolution(question.solution);
    setEditedErrorReason(question.errorReason);
    setEditedKp(question.knowledgePoints.join(', '));
    setSelectedNotebook(question.notebookId || '');
    setEditedStudentAnswer(question.studentAnswer || '');
    setEditedErrorDiagnosis(question.errorDiagnosis || []);
    setEditedErrorAnalysis(question.errorAnalysis || '');
    setIsEditing(false);
  }, [question]);

  const generateSimilar = async () => {
    if (generating) return;

    setGenerating(true);
    try {
      const token = localStorage.getItem('errorbook_token');
      const selectedNbObj = notebooks.find(n => n.id === question.notebookId);
      const originalGrade = selectedNbObj?.grade;

      let targetText = question.originalText;
      if (parsedQs.length > 1 && selectedSubQIndex >= 0 && selectedSubQIndex < parsedQs.length) {
        targetText = parsedQs[selectedSubQIndex].content;
      }

      const res = await fetch('/api/similar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          originalText: targetText,
          subject: question.subject,
          knowledgePoints: question.knowledgePoints,
          count: similarCount,
          grade: originalGrade
        })
      });

      if (res.status === 401) {
        localStorage.removeItem('errorbook_token');
        localStorage.removeItem('errorbook_username');
        window.location.reload();
        throw new Error('登录已过期，请重新登录');
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSimilarData(data);

      const updatedQuestion = { ...question, similarQuestion: data };
      await db.saveQuestion(updatedQuestion);
      if (onUpdate) {
        onUpdate(updatedQuestion);
      }
    } catch (err: any) {
      console.error(err);
      window.alert(err.message || '生成同类题失败，请重试');
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveAndPush = async (newStatus: 'pending' | 'audited') => {
    setSaving(true);
    try {
      const selectedNbObj = notebooks.find(n => n.id === selectedNotebook);
      const updatedQuestion: ErrorQuestion = {
        ...question,
        originalText: editedText,
        subject: editedSubject,
        solution: editedSolution,
        errorReason: editedErrorReason,
        knowledgePoints: editedKp.split(',').map(s => s.trim()).filter(Boolean),
        notebookId: selectedNotebook || undefined,
        notebookName: selectedNbObj ? selectedNbObj.name : undefined,
        status: newStatus,
        studentAnswer: editedStudentAnswer,
        errorDiagnosis: editedErrorDiagnosis,
        errorAnalysis: editedErrorAnalysis
      };
      await db.saveQuestion(updatedQuestion);
      if (onUpdate) {
        onUpdate(updatedQuestion);
      }
      setIsEditing(false);
      window.alert('修改保存成功！');
    } catch (err: any) {
      window.alert(err.message || '操作失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300 max-w-3xl mx-auto">

      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-2 text-slate-500 hover:text-slate-950 font-bold text-sm transition-colors">
          <ArrowLeft className="w-4 h-4" />
          <span>返回列表</span>
        </button>
        <div className="flex items-center gap-2">
          {!isStudent && (
            <button
              onClick={() => setIsEditing(!isEditing)}
              className={`text-xs font-bold px-4 py-2 rounded-xl transition-all border ${isEditing
                ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
            >
              {isEditing ? '取消修改' : '编辑与审核推送'}
            </button>
          )}
          {!isStudent && (
            <button onClick={onDelete} className="text-rose-500 hover:bg-rose-50 p-2 rounded-xl transition-colors">
              <Trash2 className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
        {question.imageUrl && (
          <div className="w-full bg-slate-50/50 border-b border-slate-100 flex justify-center py-5 px-4">
            <img
              src={question.imageUrl}
              alt="错题原图"
              className="max-h-[380px] w-auto object-contain rounded-xl shadow-sm border border-slate-200/50 animate-in fade-in zoom-in-95 duration-300"
            />
          </div>
        )}

        <div className="p-6 md:p-8 space-y-6">
          {isEditing ? (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1">学科分类</label>
                  <input
                    type="text"
                    value={editedSubject}
                    onChange={e => setEditedSubject(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-semibold text-slate-800"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1">错误原因</label>
                  <select
                    value={editedErrorReason}
                    onChange={e => setEditedErrorReason(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-semibold text-slate-800"
                  >
                    <option value="概念不清">概念不清</option>
                    <option value="粗心大意">粗心大意</option>
                    <option value="思路错误">思路错误</option>
                    <option value="完全不会">完全不会</option>
                    <option value="其他">其他</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1">题目完整文本 (LaTeX 数学公式请保持格式)</label>
                <textarea
                  value={editedText}
                  onChange={e => setEditedText(e.target.value)}
                  rows={6}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-semibold text-slate-800"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1">考查核心知识点 (用英文逗号分隔)</label>
                <input
                  type="text"
                  value={editedKp}
                  onChange={e => setEditedKp(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-semibold text-slate-800"
                  placeholder="如：二次函数, 极值点"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1">名师精解与步骤引导 (LaTeX 数学公式请保持格式)</label>
                <textarea
                  value={editedSolution}
                  onChange={e => setEditedSolution(e.target.value)}
                  rows={8}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-semibold text-slate-800"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1">学生完整手写作答文本（OCR提取结果）</label>
                <textarea
                  value={editedStudentAnswer}
                  onChange={e => setEditedStudentAnswer(e.target.value)}
                  rows={4}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-semibold text-slate-800"
                  placeholder="学生的完整手写作答过程文本"
                />
              </div>

              <div className="space-y-3 pt-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1">AI 错因深度剖析 (包含常见错误与根本原因，数学公式请保持格式)</label></div><textarea value={editedErrorAnalysis} onChange={e => setEditedErrorAnalysis(e.target.value)} rows={5} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-semibold text-slate-800 mb-4" placeholder="请输入本题错因深度剖析..." /><div style={{ display: 'none' }}>
                <div className="space-y-3">
                  {editedErrorDiagnosis.map((step, idx) => (
                    <div key={idx} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                      <div className="flex justify-between items-center text-xs font-bold text-slate-500">
                        <span>步骤 #{step.stepNumber || idx + 1}</span>
                        <button
                          type="button"
                          onClick={() => {
                            const updated = [...editedErrorDiagnosis];
                            updated.splice(idx, 1);
                            updated.forEach((s, i) => s.stepNumber = i + 1);
                            setEditedErrorDiagnosis(updated);
                          }}
                          className="text-rose-500 hover:text-rose-700 text-[10px] font-extrabold cursor-pointer"
                        >
                          删除此步骤
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="sm:col-span-2 space-y-1">
                          <label className="text-[9px] text-slate-400 font-bold uppercase">步骤内容</label>
                          <input
                            type="text"
                            value={step.stepContent}
                            onChange={(e) => {
                              const updated = [...editedErrorDiagnosis];
                              updated[idx].stepContent = e.target.value;
                              setEditedErrorDiagnosis(updated);
                            }}
                            placeholder="步骤内容或公式，如：x + 1 = 2"
                            className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] text-slate-400 font-bold uppercase">步骤状态</label>
                          <select
                            value={step.status}
                            onChange={(e) => {
                              const updated = [...editedErrorDiagnosis];
                              updated[idx].status = e.target.value as any;
                              setEditedErrorDiagnosis(updated);
                            }}
                            className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700"
                          >
                            <option value="correct">✅ 正确</option>
                            <option value="incorrect">❌ 首次错误</option>
                            <option value="consequential_error">⚠️ 连带错误</option>
                          </select>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[9px] text-slate-400 font-bold uppercase">步骤评语 / 诊断分析</label>
                        <input
                          type="text"
                          value={step.comment || ''}
                          onChange={(e) => {
                            const updated = [...editedErrorDiagnosis];
                            updated[idx].comment = e.target.value;
                            setEditedErrorDiagnosis(updated);
                          }}
                          placeholder="如：计算错误，符号写错（非必须，建议在错误行填写）"
                          className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* 修改所属错题本分类 */}
                <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5 space-y-4">
                  <div>
                    <h4 className="text-xs font-black text-blue-900 uppercase tracking-wider flex items-center gap-1.5">
                      <span>📓</span> 调整归属错题本
                    </h4>
                    <p className="text-[10px] text-blue-600/80 mt-0.5 font-medium">选择此题目归属的错题本，以便在错题库中进行分类归纳管理。</p>
                  </div>
                  <select
                    value={selectedNotebook}
                    onChange={e => setSelectedNotebook(e.target.value)}
                    className="w-full p-3 bg-white border border-blue-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold text-slate-850"
                  >
                    <option value="">-- 请选择所属错题本 (选填，留空归为未分类) --</option>
                    {notebooks.map(nb => (
                      <option key={nb.id} value={nb.id}>{nb.name}</option>
                    ))}
                  </select>

                  <div className="flex flex-col sm:flex-row gap-3 pt-2">
                    <button
                      onClick={() => handleSaveAndPush('audited')}
                      disabled={saving}
                      className="flex-1 py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black shadow-lg shadow-blue-500/10 transition cursor-pointer"
                    >
                      {saving ? '正在保存...' : '审核通过并推送'}
                    </button>
                    <button
                      onClick={() => handleSaveAndPush('pending')}
                      disabled={saving}
                      className="flex-1 py-3.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-black shadow-lg shadow-slate-900/10 transition"
                    >
                      仅保存修改
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setEditedErrorDiagnosis([
                      ...editedErrorDiagnosis,
                      {
                        stepNumber: editedErrorDiagnosis.length + 1,
                        stepContent: '',
                        status: 'correct',
                        comment: ''
                      }
                    ]);
                  }}
                  className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 mt-2 cursor-pointer hidden"
                >
                  + 增加批改步骤
                </button>
              </div>
            </div>
          ) : (
            <ReadOnlyDetail
              question={question}
              isStudent={isStudent}
              notebooks={notebooks}
              onUpdate={onUpdate}
            />
          )}
          {false && (
            <>
              <div>
                <div className="flex flex-wrap items-center gap-2.5 mb-4">
                  <span className="bg-blue-50 text-blue-700 px-3 py-1 rounded-xl text-xs font-bold border border-blue-100">{question.subject}</span>
                  <span className="bg-rose-50 text-rose-600 px-3 py-1 rounded-xl text-xs font-bold flex items-center gap-1 border border-rose-100">
                    <TargetIcon className="w-3.5 h-3.5" /> 错误原因: {question.errorReason}
                  </span>
                  {!isStudent && (
                    question.status === 'pending' ? (
                      <span className="bg-amber-50 text-amber-700 px-3 py-1 rounded-xl text-xs font-bold border border-amber-100 animate-pulse">待审核推送</span>
                    ) : (
                      <span className="bg-emerald-50 text-emerald-700 px-3 py-1 rounded-xl text-xs font-bold border border-emerald-100">
                        已推送: {question.studentId || '系统'}
                      </span>
                    )
                  )}
                  <span className="text-xs text-slate-400 font-semibold ml-auto">{format(new Date(question.createdAt), 'yyyy-MM-dd HH:mm')}</span>
                </div>
                <FormattedMath text={question.originalText} className="text-base text-slate-900 font-bold leading-relaxed" />

                <div className="mt-4 flex flex-wrap gap-1.5">
                  {question.knowledgePoints.map(p => (
                    <span key={p} className="text-xs bg-slate-50 text-slate-705 px-3 py-1 rounded-lg border border-slate-100 font-bold"># {p}</span>
                  ))}
                </div>
              </div>

              {/* 学生手写作答与诊断批改 */}
              {(question.studentAnswer || (question.errorDiagnosis && question.errorDiagnosis.length > 0)) && (
                <div className="border-t border-slate-100 pt-6 space-y-4">
                  <div className="flex items-center gap-2 text-rose-600 font-extrabold text-sm">
                    <span className="w-5 h-5 rounded-lg bg-rose-50 flex items-center justify-center border border-rose-100 text-xs">📝</span>
                    <h4>学生手写作答与 AI 诊断批改</h4>
                  </div>

                  {question.errorDiagnosis && question.errorDiagnosis.length > 0 && (
                    <div className="grid grid-cols-1 gap-3">
                      {question.errorDiagnosis.map((step) => {
                        let statusColor = "bg-emerald-50/50 border-emerald-100 text-emerald-800";
                        let statusIcon = "✅";
                        let statusText = "本步正确";

                        if (step.status === 'incorrect') {
                          statusColor = "bg-rose-50 border-rose-100 text-rose-800";
                          statusIcon = "❌";
                          statusText = "本步出错";
                        } else if (step.status === 'consequential_error') {
                          statusColor = "bg-amber-50/30 border-amber-100 text-amber-800";
                          statusIcon = "⚠️";
                          statusText = "受前面错误波及";
                        }

                        return (
                          <div key={step.stepNumber} className={`p-4 border rounded-2xl ${statusColor} space-y-1`}>
                            <div className="flex items-center justify-between text-xs font-extrabold">
                              <span>步骤 {step.stepNumber} {statusIcon}</span>
                              <span>{statusText}</span>
                            </div>
                            <div className="text-sm font-semibold leading-relaxed">
                              <FormattedMath text={step.stepContent} />
                            </div>
                            {step.comment && (
                              <div className="text-xs mt-1.5 pt-1.5 border-t border-current/10 font-bold opacity-90 text-rose-700">
                                错因说明：<InlineContent text={step.comment} />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {question.studentAnswer && (
                    <details className="group border border-slate-200 rounded-2xl overflow-hidden [&_summary::-webkit-details-marker]:hidden bg-slate-50/30">
                      <summary className="cursor-pointer bg-slate-100/50 p-4 font-bold text-slate-700 flex justify-between items-center group-open:border-b border-slate-200 text-xs select-none">
                        查看完整手写作答原始文本提取 (仅供参考)
                        <ChevronRight className="w-5 h-5 text-slate-400 group-open:rotate-90 transition-transform" />
                      </summary>
                      <div className="p-4 bg-white text-xs leading-relaxed font-semibold text-slate-500 whitespace-pre-wrap">
                        {question.studentAnswer}
                      </div>
                    </details>
                  )}
                </div>
              )}

              <div className="border-t border-slate-100 pt-6 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <h4 className="flex items-center gap-2 text-blue-600 font-extrabold text-sm">
                    <Sparkles className="w-4 h-4 text-amber-500 animate-pulse" /> AI 智能辅导名师精解步骤
                  </h4>

                </div>
                <FormattedMath text={question.solution} className="text-slate-805" />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Action / Tabs */}
      {!isEditing && (
        <>
          <div className="flex gap-2 p-1 bg-slate-200/50 rounded-2xl">
            <button
              onClick={() => setSimilarTabActive(false)}
              className={`flex-1 py-3 text-xs font-bold rounded-xl transition-all ${!similarTabActive ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
            >
              原题精解回顾
            </button>
            <button
              onClick={() => setSimilarTabActive(true)}
              className={`flex-1 py-3 text-xs font-bold rounded-xl transition-all flex justify-center items-center gap-2 ${similarTabActive ? 'bg-blue-600 text-white shadow-md shadow-blue-600/10' : 'text-slate-500 hover:text-slate-900'}`}
            >
              <BrainCircuitIcon className="w-4 h-4" /> 关联考点同类题推荐
            </button>
          </div>

          {/* Similar Question Area */}
          {similarTabActive && (
            <div className="bg-white border-2 border-blue-100 rounded-3xl p-6 md:p-8 animate-in slide-in-from-bottom-2 fade-in shadow-sm">
              {generating ? (
                <div className="py-12 flex flex-col items-center justify-center space-y-4">
                  <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                  <p className="text-slate-600 font-bold tracking-wide animate-pulse">AI 正在深度关联题库并分析难度，为您生成相似变式强化练习题...</p>
                </div>
              ) : similarData ? (
                <div className="space-y-6">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-2">
                    <div className="flex items-center gap-2 text-blue-805 font-bold">
                      <span className="w-7 h-7 bg-blue-100 rounded-lg flex items-center justify-center text-xs font-extrabold">练</span>
                      <h4 className="text-sm font-extrabold text-slate-800">高频错点相似强化训练题</h4>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSimilarData(null)}
                      className="text-xs text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> 重新配置与生成
                    </button>
                  </div>

                  <div className="space-y-6">
                    {(Array.isArray(similarData) ? similarData : [similarData]).map((item, idx) => {
                      const isSaved = savedStatus[idx];
                      return (
                        <div key={idx} className="bg-slate-50/40 border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm hover:border-slate-300 transition-colors">
                          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                            <span className="text-xs font-black text-slate-800 bg-slate-200 px-3 py-1 rounded-lg">
                              变式题 {idx + 1}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleSaveSimilarItem(item, idx)}
                              disabled={isSaved}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm ${isSaved
                                ? 'bg-emerald-50 border border-emerald-200 text-emerald-700 cursor-default'
                                : 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer'
                                }`}
                            >
                              {isSaved ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                                  <span>已存入错题库</span>
                                </>
                              ) : (
                                <>
                                  <PlusCircle className="w-3.5 h-3.5 text-white" />
                                  <span>保存至错题库</span>
                                </>
                              )}
                            </button>
                          </div>

                          {item.geometry && item.geometry.type !== 'none' && (
                            <div className="py-2 bg-white rounded-xl p-2 border border-slate-100">
                              <GeometryRenderer geometry={item.geometry} />
                            </div>
                          )}

                          <FormattedMath text={item.questionText} className="text-slate-900 text-sm font-semibold leading-relaxed" />

                          <details className="group border border-slate-200 rounded-xl overflow-hidden [&_summary::-webkit-details-marker]:hidden bg-white shadow-sm">
                            <summary className="cursor-pointer bg-slate-50/70 p-3 font-bold text-slate-700 flex justify-between items-center group-open:border-b border-slate-200 text-xs">
                              精编解答步骤与知识梳理 (点击展开)
                              <ChevronRight className="w-4 h-4 text-slate-400 group-open:rotate-90 transition-transform" />
                            </summary>
                            <div className="p-4 bg-white">
                              <FormattedMath text={item.solution} className="text-slate-805 text-xs leading-relaxed" />
                            </div>
                          </details>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="space-y-6 animate-in fade-in duration-300">
                  <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-5 space-y-4">
                    <div>
                      <h4 className="text-xs font-black text-blue-900 uppercase tracking-wider flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-amber-500 animate-pulse" /> AI 智能同类变式题推荐
                      </h4>
                      <p className="text-[11px] text-blue-700/80 mt-1 font-medium leading-relaxed">
                        系统已自动锁定当前原题的难度水平、考查知识点与所属年级学段，将为您精确定制出高质量的相似变式题，用于针对性强化巩固。
                      </p>
                    </div>

                    {parsedQs.length > 1 && (
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-0.5">选择生成推荐题的子题</label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {parsedQs.map((qItem, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => setSelectedSubQIndex(idx)}
                              className={`p-3 text-left text-xs font-semibold rounded-xl border transition-all ${selectedSubQIndex === idx
                                ? 'bg-blue-50 border-blue-500 text-blue-805 ring-1 ring-blue-500 shadow-sm'
                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                }`}
                            >
                              <div className="font-bold text-slate-800 mb-0.5">{qItem.number || `第 ${idx + 1} 题`}</div>
                              <div className="text-[10px] text-slate-500 truncate">{qItem.content}</div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-0.5">选择生成题目数量</label>
                      <div className="flex gap-2.5">
                        {[1, 2, 3].map(c => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setSimilarCount(c)}
                            className={`flex-1 py-3 text-xs font-bold rounded-xl border transition-all ${similarCount === c
                              ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-600/10'
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                              }`}
                          >
                            {c} 道题
                          </button>
                        ))}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={generateSimilar}
                      className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black shadow-lg shadow-blue-500/10 transition cursor-pointer flex justify-center items-center gap-2"
                    >
                      <BrainCircuitIcon className="w-4 h-4" /> 开始智能生成推荐题
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}


    </div>
  );
}

function TargetIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}

function BrainCircuitIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
      <path d="M9 13a4.5 4.5 0 0 0 3-3" />
      <path d="M17.599 6.5a3 3 0 0 0 .399-5.375" />
      <path d="M15.266 12.5a3 3 0 1 0-2.24-4.5" />
      <path d="M16 16.5a3 3 0 1 1-2.91-4.05" />
      <path d="M18.5 13a4.5 4.5 0 0 1-3 3" />
    </svg>
  );
}

function ReadOnlyDetail({
  question,
  isStudent,
  onToggleMastery,
  notebooks = [],
  onUpdate
}: {
  question: any;
  isStudent: boolean;
  onToggleMastery?: () => void;
  notebooks?: any[];
  onUpdate?: (updated: any) => void;
}) {
  const parsedQs = parseIndividualQuestions(question.originalText);
  const parsedSols = parseIndividualSolutions(question.solution);
  const parsedStudentAnswers = parseIndividualStudentAnswers(question.studentAnswer || '');
  const parsedStdAnswers = parseIndividualStandardAnswers(question.standardAnswer || '');

  if (parsedQs.length <= 1) {
    // 原有单题展示逻辑（向下兼容）
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-2 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3">
          <div className="flex items-center gap-1 text-[11px] font-bold text-indigo-750 bg-indigo-50 border border-indigo-200/60 px-2.5 py-1 rounded-lg">
            <span>📓 归属错题本：</span>
            <select
              value={question.notebookId || ''}
              onChange={async (e) => {
                const targetNbId = e.target.value;
                const targetNb = notebooks.find(n => n.id === targetNbId);
                const updated = {
                  ...question,
                  notebookId: targetNbId || undefined,
                  notebookName: targetNb ? targetNb.name : undefined
                };
                try {
                  await db.saveQuestion(updated);
                  if (onUpdate) {
                    onUpdate(updated);
                  }
                } catch (err: any) {
                  window.alert(err.message || '转移失败');
                }
              }}
              className="bg-transparent border-none outline-none font-bold text-indigo-850 cursor-pointer pl-0.5"
            >
              <option value="">未分类</option>
              {notebooks.map(nb => (
                <option key={nb.id} value={nb.id}>{nb.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <FormattedMath text={question.originalText} className="text-base text-slate-900 font-bold leading-relaxed" />
          {question.similarQuestion?.geometry && question.similarQuestion.geometry.type !== 'none' && (
            <div className="py-2">
              <GeometryRenderer geometry={question.similarQuestion.geometry} />
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-1.5">
            {question.knowledgePoints.map((p: string) => (
              <span key={p} className="text-xs bg-slate-50 text-slate-705 px-3 py-1 rounded-lg border border-slate-100 font-bold"># {p}</span>
            ))}
          </div>
        </div>



        {(question.errorAnalysis) && (
          <div className="border-t border-slate-100 pt-6 space-y-4">
            <div className="flex items-center gap-2 text-rose-600 font-extrabold text-sm">
              <span className="text-rose-600 font-bold">❌</span>
              <h4 className="text-slate-900 font-black text-sm">错因分析</h4>
            </div>

            <div className="p-4 bg-white border border-slate-200/80 rounded-2xl text-xs sm:text-sm leading-relaxed text-slate-700 font-medium whitespace-pre-wrap">
              <FormattedMath text={question.errorAnalysis} />
            </div>

            {false && question.errorDiagnosis && question.errorDiagnosis.length > 0 && (
              <div className="grid grid-cols-1 gap-3">
                {question.errorDiagnosis.map((step: any) => {
                  let statusColor = "bg-emerald-50/50 border-emerald-100 text-emerald-800";
                  let statusIcon = "✅";
                  let statusText = "本步正确";

                  if (step.status === 'incorrect') {
                    statusColor = "bg-rose-50 border-rose-100 text-rose-800";
                    statusIcon = "❌";
                    statusText = "本步出错";
                  } else if (step.status === 'consequential_error') {
                    statusColor = "bg-amber-50/30 border-amber-100 text-amber-800";
                    statusIcon = "⚠️";
                    statusText = "受前面错误波及";
                  }

                  return (
                    <div key={step.stepNumber} className={`p-4 border rounded-2xl ${statusColor} space-y-1`}>
                      <div className="flex items-center justify-between text-xs font-extrabold">
                        <span>步骤 {step.stepNumber} {statusIcon}</span>
                        <span>{statusText}</span>
                      </div>
                      <div className="text-sm font-semibold leading-relaxed">
                        <FormattedMath text={step.stepContent} />
                      </div>
                      {step.comment && (
                        <div className="text-xs mt-1.5 pt-1.5 border-t border-current/10 font-bold opacity-90 text-rose-700">
                          错因说明：<InlineContent text={step.comment} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {question.studentAnswer && (
              <details className="group border border-slate-200 rounded-2xl overflow-hidden [&_summary::-webkit-details-marker]:hidden bg-slate-50/30">
                <summary className="cursor-pointer bg-slate-100/50 p-4 font-bold text-slate-700 flex justify-between items-center group-open:border-b border-slate-200 text-xs select-none">
                  查看完整手写作答原始文本提取 (仅供参考)
                  <ChevronRight className="w-5 h-5 text-slate-400 group-open:rotate-90 transition-transform" />
                </summary>
                <div className="p-4 bg-white text-xs leading-relaxed font-semibold text-slate-500 whitespace-pre-wrap">
                  {question.studentAnswer}
                </div>
              </details>
            )}
          </div>
        )}

        <div className="border-t border-slate-100 pt-6 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h4 className="flex items-center gap-2 text-blue-600 font-extrabold text-sm">
              <Sparkles className="w-4 h-4 text-amber-500 animate-pulse" /> AI 智能辅导名师精解步骤
            </h4>

          </div>
          <FormattedMath text={question.solution} className="text-slate-805" />
        </div>
      </div>
    );
  } else {
    // 多题合并整卷展示逻辑（按单题卡片隔离展示）
    return (
      <div className="space-y-8">
        <div className="flex flex-wrap items-center gap-2 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3">
          <div className="flex items-center gap-1 text-[11px] font-bold text-indigo-750 bg-indigo-50 border border-indigo-200/60 px-2.5 py-1 rounded-lg">
            <span>📓 归属错题本：</span>
            <select
              value={question.notebookId || ''}
              onChange={async (e) => {
                const targetNbId = e.target.value;
                const targetNb = notebooks.find(n => n.id === targetNbId);
                const updated = {
                  ...question,
                  notebookId: targetNbId || undefined,
                  notebookName: targetNb ? targetNb.name : undefined
                };
                try {
                  await db.saveQuestion(updated);
                  if (onUpdate) {
                    onUpdate(updated);
                  }
                } catch (err: any) {
                  window.alert(err.message || '转移失败');
                }
              }}
              className="bg-transparent border-none outline-none font-bold text-indigo-850 cursor-pointer pl-0.5"
            >
              <option value="">未分类</option>
              {notebooks.map(nb => (
                <option key={nb.id} value={nb.id}>{nb.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex items-center justify-between bg-slate-50 p-4 rounded-2xl border border-slate-200/60">
          <h3 className="text-sm font-black text-slate-800 flex items-center gap-1.5">
            <span>📄</span> 本卷共包含 {parsedQs.length} 道题目
          </h3>

        </div>

        <div className="space-y-6">
          {parsedQs.map((qItem, iIdx) => {
            const stdAns = parsedStdAnswers[iIdx]?.content || '';
            const stuAns = parsedStudentAnswers[iIdx]?.content || '';
            const solText = parsedSols[iIdx]?.content || '';

            const parsedErrorAnalyses = parseIndividualErrorAnalysis(question.errorAnalysis || "");
            let subErrorAnalysis = "";
            if (parsedErrorAnalyses.length > 1 && parsedErrorAnalyses[iIdx]) {
              subErrorAnalysis = parsedErrorAnalyses[iIdx].content.replace(parsedErrorAnalyses[iIdx].number || '', '').trim();
            } else if (parsedErrorAnalyses.length === 1 && parsedQs.length > 1 && iIdx === 0) {
              subErrorAnalysis = parsedErrorAnalyses[0].content.replace(parsedErrorAnalyses[0].number || '', '').trim();
            }

            // 过滤出当前题目的步骤诊断
            const questionPrefix = `(第${iIdx + 1}题)`;
            const filteredSteps: any[] = []; const dummyFilteredSteps = (question.errorDiagnosis || []).filter((step: any) => {
              const hasPrefix = step.stepContent.startsWith(questionPrefix);
              if (hasPrefix) return true;
              // 兜底：如果第一题且步骤无任何前缀，也归给第一题
              if (iIdx === 0 && !step.stepContent.includes('(第') && !step.stepContent.includes('题)')) return true;
              return false;
            }).map((step: any, sIdx: number) => {
              const content = step.stepContent.startsWith(questionPrefix)
                ? step.stepContent.replace(questionPrefix, '').trim()
                : step.stepContent;
              return { ...step, stepContent: content, displayStepNumber: sIdx + 1 };
            });

            return (
              <div key={qItem.id} className="bg-slate-50/40 border border-slate-200/80 rounded-3xl p-6 space-y-5 shadow-sm hover:border-slate-300 transition-colors">
                {/* 题号头部 */}
                <div className="flex items-center justify-between pb-3 border-b border-slate-200/60">
                  <span className="text-xs font-black text-slate-900 bg-slate-200 px-3 py-1 rounded-lg">
                    第 {qItem.number} 题
                  </span>
                </div>

                {/* 题干 */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-slate-800 font-extrabold text-xs">
                    <span className="w-5 h-5 rounded-lg bg-blue-50 flex items-center justify-center border border-blue-100 text-[10px]">📖</span>
                    <h4>本题题干</h4>
                  </div>
                  <FormattedMath text={qItem.content} className="text-sm text-slate-905 font-bold leading-relaxed" />
                </div>

                {/* 错因分析 */}
                {subErrorAnalysis && (
                  <div className="border-t border-slate-100 pt-4 space-y-3">
                    <div className="flex items-center gap-2 text-rose-600 font-extrabold text-xs">
                      <span className="text-rose-600 font-bold">❌</span>
                      <h4 className="text-slate-900 font-black text-xs">错因分析</h4>
                    </div>

                    <div className="p-3.5 bg-white border border-slate-200/80 rounded-2xl text-[11px] leading-relaxed text-slate-700 font-medium whitespace-pre-wrap">
                      <FormattedMath text={subErrorAnalysis} />
                    </div>
                  </div>
                )}



                {/* 学生作答与诊断步骤 */}
                {(stuAns || filteredSteps.length > 0) && (
                  <div className="border-t border-slate-100 pt-4 space-y-3">
                    <div className="flex items-center gap-2 text-rose-600 font-extrabold text-xs">
                      <span className="w-5 h-5 rounded-lg bg-rose-50 flex items-center justify-center border border-rose-100 text-[10px]">📝</span>
                      <h4>学生作答与 AI 诊断批改</h4>
                    </div>

                    {filteredSteps.length > 0 && (
                      <div className="grid grid-cols-1 gap-2.5">
                        {filteredSteps.map((step: any) => {
                          let statusColor = "bg-emerald-50/50 border-emerald-100 text-emerald-800";
                          let statusIcon = "✅";
                          let statusText = "本步正确";

                          if (step.status === 'incorrect') {
                            statusColor = "bg-rose-50 border-rose-100 text-rose-800";
                            statusIcon = "❌";
                            statusText = "本步出错";
                          } else if (step.status === 'consequential_error') {
                            statusColor = "bg-amber-50/30 border-amber-100 text-amber-800";
                            statusIcon = "⚠️";
                            statusText = "受前面错误波及";
                          }

                          return (
                            <div key={step.stepNumber} className={`p-3.5 border rounded-2xl ${statusColor} space-y-1`}>
                              <div className="flex items-center justify-between text-[11px] font-extrabold">
                                <span>步骤 {step.displayStepNumber} {statusIcon}</span>
                                <span>{statusText}</span>
                              </div>
                              <div className="text-xs font-semibold leading-relaxed">
                                <FormattedMath text={step.stepContent} />
                              </div>
                              {step.comment && (
                                <div className="text-[10px] mt-1 pt-1 border-t border-current/10 font-bold opacity-90 text-rose-700">
                                  错因说明：<InlineContent text={step.comment} />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {stuAns && (
                      <details className="group border border-slate-200 rounded-2xl overflow-hidden [&_summary::-webkit-details-marker]:hidden bg-slate-50/30">
                        <summary className="cursor-pointer bg-slate-100/50 p-3 font-bold text-slate-700 flex justify-between items-center group-open:border-b border-slate-200 text-[11px] select-none">
                          查看本题手写作答文本
                          <ChevronRight className="w-4 h-4 text-slate-400 group-open:rotate-90 transition-transform" />
                        </summary>
                        <div className="p-3 bg-white text-[11px] leading-relaxed font-semibold text-slate-500 whitespace-pre-wrap">
                          {stuAns}
                        </div>
                      </details>
                    )}
                  </div>
                )}

                {/* 名师解析 */}
                {solText && (
                  <div className="border-t border-slate-100 pt-4 space-y-2">
                    <div className="flex items-center gap-2 text-blue-600 font-extrabold text-xs">
                      <Sparkles className="w-4 h-4 text-amber-500 animate-pulse" />
                      <h4>AI 智能辅导名师精解步骤</h4>
                    </div>
                    <div className="text-xs leading-relaxed text-slate-805">
                      <FormattedMath text={solText} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }
}

export function parseIndividualQuestions(text: string): { id: string; number: string; content: string }[] {
  if (!text) return [];
  const regex = /(?:^|\n)\s*([0-9一二三四五六七八九十]+[.\u3001、\uFF0E\-\s_]|第[0-9一二三四五六七八九十]+[题问小题步]|\([0-9一二三四五六七八九十]+\)|（[0-9一二三四五六七八九十]+）)/g;

  const matches: { index: number; text: string }[] = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    matches.push({ index: match.index, text: match[1].trim() });
  }

  if (matches.length === 0) {
    return [{ id: '1', number: '整道题', content: text.trim() }];
  }

  const result: { id: string; number: string; content: string }[] = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index + (text[matches[i].index] === '\n' ? 1 : 0);
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const fullContent = text.substring(start, end).trim();

    const prefix = matches[i].text;
    result.push({
      id: String(i + 1),
      number: prefix,
      content: fullContent
    });
  }
  return result;
}

export function parseIndividualSolutions(text: string): { number: string; content: string }[] {
  if (!text) return [];
  const regex = /(?:^|\n)\s*(###\s*第?[0-9一二三四五六七八九十]+[题问小题步]解析|第?[0-9一二三四五六七八九十]+[.\u3001、\uFF0E\-\s_]解析?|【解析[0-9一二三四五六七八九十]+】)/g;

  const matches: { index: number; text: string }[] = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    matches.push({ index: match.index, text: match[1].trim() });
  }

  if (matches.length === 0) {
    return [{ number: '完整解析', content: text.trim() }];
  }

  const result: { number: string; content: string }[] = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index + (text[matches[i].index] === '\n' ? 1 : 0);
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const fullContent = text.substring(start, end).trim();
    result.push({
      number: matches[i].text,
      content: fullContent
    });
  }
  return result;
}

export function parseIndividualStudentAnswers(text: string): { number: string; content: string }[] {
  if (!text) return [];
  const regex = /(?:^|\n)\s*(###\s*第?[0-9一二三四五六七八九十]+[题问小题步]学生作答)/g;

  const matches: { index: number; text: string }[] = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    matches.push({ index: match.index, text: match[1].trim() });
  }

  if (matches.length === 0) {
    return [{ number: '学生作答', content: text.trim() }];
  }

  const result: { number: string; content: string }[] = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index + (text[matches[i].index] === '\n' ? 1 : 0);
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const fullContent = text.substring(start, end).replace(matches[i].text, '').trim();
    result.push({
      number: matches[i].text,
      content: fullContent
    });
  }
  return result;
}

export function parseIndividualStandardAnswers(text: string): { number: string; content: string }[] {
  if (!text) return [];
  const regex = /(?:^|\n)\s*(###\s*第?[0-9一二三四五六七八九十]+[题问小题步]标准答案)/g;

  const matches: { index: number; text: string }[] = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    matches.push({ index: match.index, text: match[1].trim() });
  }

  if (matches.length === 0) {
    return [{ number: '标准答案', content: text.trim() }];
  }

  const result: { number: string; content: string }[] = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index + (text[matches[i].index] === '\n' ? 1 : 0);
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const fullContent = text.substring(start, end).replace(matches[i].text, '').trim();
    result.push({
      number: matches[i].text,
      content: fullContent
    });
  }
  return result;
}

