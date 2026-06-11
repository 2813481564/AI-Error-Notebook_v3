import { useEffect, useState } from 'react';
import { db, ErrorQuestion, DiagnosisStep } from '../lib/db';
import { Search, Book, Clock, ChevronRight, X, Sparkles, Loader2, ArrowLeft, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import FormattedMath from './FormattedMath';
import GeometryRenderer from './GeometryRenderer';
import type { GeometryData } from '../types/geometry';

export default function QuestionLibrary({ 
  onNavigate,
  onGeneratePaper
}: { 
  onNavigate: (v: any) => void;
  onGeneratePaper?: (questions: ErrorQuestion[]) => void;
}) {
  const [questions, setQuestions] = useState<ErrorQuestion[]>([]);
  const [search, setSearch] = useState('');
  const [filterSubject, setFilterSubject] = useState<string>('all');
  const [filterNotebook, setFilterNotebook] = useState<string>('all');
  const [filterMastery, setFilterMastery] = useState<'all' | 'not_mastered' | 'mastered'>('all');
  const [notebooks, setNotebooks] = useState<any[]>([]);
  const [showNotebookModal, setShowNotebookModal] = useState<boolean>(false);
  const [notebookPanel, setNotebookPanel] = useState<'list' | 'create' | 'edit'>('list');
  const [editingNotebook, setEditingNotebook] = useState<any | null>(null);
  const [nbForm, setNbForm] = useState({ name: '', grade: '', subject: '', description: '' });
  const [activeNotebookId, setActiveNotebookId] = useState<string | null>(null);
  
  const [selectedQuestion, setSelectedQuestion] = useState<ErrorQuestion | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  const userRole = localStorage.getItem('errorbook_role') || 'user';
  const isAdmin = userRole === 'admin';
  const isStudent = !isAdmin;

  useEffect(() => {
    loadQuestions();
    loadNotebooks();
  }, []);

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
        loadQuestions();
      }
      setNotebookPanel('list');
    } catch (err: any) {
      window.alert(err.message || '操作失败');
    }
  };

  const handleToggleMastery = async (id: string, current: 'not_mastered' | 'mastered' | undefined, e: React.MouseEvent) => {
    e.stopPropagation();
    const nextStatus = current === 'mastered' ? 'not_mastered' : 'mastered';
    try {
      await db.updateQuestionMastery(id, nextStatus);
      loadQuestions();
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
    const count = questions.filter(q => q.notebookId === id).length;
    
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
      loadQuestions();
      window.alert('错题本及其内部错题已被彻底清理！');
    } catch (err: any) {
      window.alert(err.message);
    }
  };

  const loadQuestions = () => {
    db.getAllQuestions().then(data => {
      setQuestions(data.sort((a, b) => b.createdAt - a.createdAt));
    }).catch(console.error);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('确定要删除这道错题吗？')) return;
    await db.deleteQuestion(id);
    setSelectedQuestion(null);
    loadQuestions();
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

  if (selectedQuestion) {
    return <QuestionDetail 
      question={selectedQuestion} 
      notebooks={notebooks}
      isAdmin={isAdmin}
      onBack={() => setSelectedQuestion(null)} 
      onDelete={() => handleDelete(selectedQuestion.id)}
      onUpdate={(updated) => {
        setSelectedQuestion(updated);
        loadQuestions();
      }}
    />;
  }

  const subjects = Array.from(new Set(questions.map(q => q.subject)));
  const filtered = questions.filter(q => {
    if (filterSubject !== 'all' && q.subject !== filterSubject) return false;
    if (filterNotebook === 'unclassified') {
      if (q.notebookId) return false;
    } else if (filterNotebook !== 'all' && q.notebookId !== filterNotebook) {
      return false;
    }
    if (filterMastery === 'not_mastered' && q.masteryStatus === 'mastered') return false;
    if (filterMastery === 'mastered' && q.masteryStatus !== 'mastered') return false;
    if (search && !q.originalText.includes(search) && !q.knowledgePoints.some(p => p.includes(search))) return false;
    return true;
  });

  const activeNotebook = notebooks.find(n => n.id === filterNotebook);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
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

      {/* Selected Items floating indicator bar */}
      {selectedIds.size > 0 && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-blue-50 border border-blue-200/80 p-4 rounded-2xl shadow-sm gap-3 animate-in slide-in-from-top-2 duration-300">
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse"></span>
            <p className="text-xs font-bold text-blue-900">已选中 {selectedIds.size} 道错题</p>
            <button 
              onClick={handleSelectAll} 
              className="text-xs font-bold text-blue-600 hover:text-blue-800 underline transition-colors cursor-pointer"
            >
              {selectedIds.size === filtered.length ? "取消全选" : "选择全部已过滤题"}
            </button>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <button
              onClick={() => setSelectedIds(new Set())}
              className="flex-1 sm:flex-initial px-4 py-2 border border-slate-200 text-slate-600 bg-white rounded-xl text-xs font-bold hover:bg-slate-50 transition-colors cursor-pointer"
            >
              清空选择
            </button>
            <button
              onClick={handleGeneratePaperClick}
              className="flex-1 sm:flex-initial px-5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl text-xs font-extrabold hover:from-blue-700 hover:to-indigo-700 transition-colors shadow-md shadow-blue-500/10 cursor-pointer"
            >
              生成复习试卷
            </button>
          </div>
        </div>
      )}

      {activeNotebookId === null ? (
        <div className="space-y-6">
          <div className="flex justify-between items-center bg-slate-50 border border-slate-200/80 rounded-2xl p-4">
            <div className="flex flex-col">
              <span className="text-xs text-slate-500 font-bold">请选择错题本以查看错题</span>
              <span className="text-[10px] text-slate-400 mt-0.5">创建个性的专属分类，分学科、年级和考点阶段进行系统复习。</span>
            </div>
            <button
              onClick={() => {
                setNotebookPanel('list');
                setShowNotebookModal(true);
              }}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-black transition flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <span>⚙️ 管理错题本</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {/* 默认未分类错题卡片 */}
            {(() => {
              const unclassifiedCount = questions.filter(q => !q.notebookId).length;
              return (
                <div 
                  onClick={() => {
                    setActiveNotebookId('unclassified');
                    setFilterNotebook('unclassified');
                  }}
                  className="bg-white hover:shadow-lg transition-all rounded-3xl border border-slate-200 p-6 flex flex-col justify-between min-h-[180px] cursor-pointer group hover:border-slate-355"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs bg-slate-100 text-slate-600 font-extrabold px-2.5 py-1 rounded-lg border border-slate-200">
                        📁 默认系统本
                      </span>
                      <span className="text-2xl">📓</span>
                    </div>
                    <h3 className="text-base font-black text-slate-800 group-hover:text-blue-600 transition-colors">
                      未分类错题
                    </h3>
                    <p className="text-xs text-slate-400 font-semibold leading-relaxed line-clamp-2">
                      所有未绑定具体错题本的零散错题，均会默认收录在此，方便进行后期归类。
                    </p>
                  </div>
                  <div className="border-t border-slate-100 pt-4 mt-4 flex items-center justify-between">
                    <span className="text-xs text-slate-500 font-extrabold">
                      共收录 <span className="text-blue-600 font-black text-sm">{unclassifiedCount}</span> 道错题
                    </span>
                    <span className="text-[10px] text-blue-600 font-black flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      进入管理 →
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* 用户自定义错题本卡片 */}
            {notebooks.map(nb => {
              const nbCount = questions.filter(q => q.notebookId === nb.id).length;
              return (
                <div 
                  key={nb.id}
                  onClick={() => {
                    setActiveNotebookId(nb.id);
                    setFilterNotebook(nb.id);
                  }}
                  className="bg-white hover:shadow-lg transition-all rounded-3xl border border-slate-200 p-6 flex flex-col justify-between min-h-[180px] cursor-pointer group hover:border-blue-400"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        {nb.grade && (
                          <span className="text-[9px] bg-indigo-50 text-indigo-700 font-extrabold px-2 py-0.5 rounded border border-indigo-100">
                            {nb.grade}
                          </span>
                        )}
                        {nb.subject && (
                          <span className="text-[9px] bg-blue-50 text-blue-700 font-extrabold px-2 py-0.5 rounded border border-blue-100">
                            {nb.subject}
                          </span>
                        )}
                      </div>
                      <span className="text-2xl">📘</span>
                    </div>
                    <h3 className="text-base font-black text-slate-800 group-hover:text-blue-600 transition-colors truncate">
                      {nb.name}
                    </h3>
                    <p className="text-xs text-slate-400 font-semibold leading-relaxed line-clamp-2">
                      {nb.description || '暂无描述信息...'}
                    </p>
                  </div>
                  <div className="border-t border-slate-100 pt-4 mt-4 flex items-center justify-between">
                    <span className="text-xs text-slate-500 font-extrabold">
                      共收录 <span className="text-blue-600 font-black text-sm">{nbCount}</span> 道错题
                    </span>
                    <div className="flex items-center gap-2">
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
                        className="text-[10px] font-black text-blue-600 hover:text-blue-800 cursor-pointer"
                      >
                        编辑
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteNotebook(nb.id);
                        }}
                        className="text-[10px] font-black text-rose-600 hover:text-rose-800 cursor-pointer"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <button
            onClick={() => {
              setActiveNotebookId(null);
              setFilterNotebook('all');
            }}
            className="flex items-center gap-1.5 text-xs font-black text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/80 px-4 py-2.5 rounded-xl transition-all self-start cursor-pointer shadow-sm border border-slate-200"
          >
            <span>← 返回错题本列表</span>
          </button>

          {/* Filter and Search */}
          <div className="flex flex-col xl:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="text"
                placeholder="搜索题目、知识点、考点..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm font-semibold text-slate-800"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <select 
                value={filterSubject}
                onChange={e => setFilterSubject(e.target.value)}
                className="py-3 px-4 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold text-slate-700 flex-1 sm:flex-initial"
              >
                <option value="all">所有学科分类</option>
                {subjects.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select 
                value={filterNotebook}
                onChange={e => {
                  const val = e.target.value;
                  setFilterNotebook(val);
                  if (val === 'all') {
                    setActiveNotebookId(null);
                  } else {
                    setActiveNotebookId(val);
                  }
                }}
                className="py-3 px-4 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold text-slate-700 flex-1 sm:flex-initial"
              >
                <option value="all">所有错题本</option>
                <option value="unclassified">未分类错题</option>
                {notebooks.map(nb => (
                  <option key={nb.id} value={nb.id}>{nb.name}</option>
                ))}
              </select>
              <select 
                value={filterMastery}
                onChange={e => setFilterMastery(e.target.value as any)}
                className="py-3 px-4 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold text-slate-700 flex-1 sm:flex-initial"
              >
                <option value="all">所有掌握状态</option>
                <option value="not_mastered">未掌握</option>
                <option value="mastered">已掌握</option>
              </select>
              <button
                onClick={() => {
                  setNotebookPanel('list');
                  setShowNotebookModal(true);
                }}
                className="py-3 px-4 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl text-slate-700 text-sm font-bold transition flex items-center gap-1 cursor-pointer shrink-0"
              >
                ⚙️ 管理错题本
              </button>
            </div>
          </div>

          {activeNotebook && (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                  <span>📘</span> {activeNotebook.name}
                </h3>
                <div className="flex gap-2">
                  {activeNotebook.grade && (
                    <span className="text-[10px] bg-white text-slate-650 font-bold px-2 py-0.5 rounded border border-slate-200 shadow-sm">
                      🏫 {activeNotebook.grade}
                    </span>
                  )}
                  {activeNotebook.subject && (
                    <span className="text-[10px] bg-white text-slate-650 font-bold px-2 py-0.5 rounded border border-slate-200 shadow-sm">
                      📚 {activeNotebook.subject}
                    </span>
                  )}
                </div>
              </div>
              {activeNotebook.description && (
                <p className="text-xs text-slate-500 font-medium leading-relaxed mt-1">{activeNotebook.description}</p>
              )}
            </div>
          )}

          {/* List */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map(q => {
              const isSelected = selectedIds.has(q.id);
              return (
                <div key={q.id} className="relative group">
                  <button 
                    onClick={() => setSelectedQuestion(q)}
                    className={`w-full bg-white p-5 rounded-2xl border text-left hover:shadow-md transition-all flex flex-col justify-between h-full ${
                      isSelected ? 'border-blue-500 ring-2 ring-blue-500/10' : 'border-slate-200 hover:border-blue-400'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-3.5 pr-8">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="bg-blue-50 text-blue-700 text-[10px] font-extrabold px-2.5 py-1 rounded-lg border border-blue-100">{q.subject}</span>
                          {q.notebookName ? (
                            <span className="bg-indigo-50 text-indigo-700 text-[10px] font-extrabold px-2.5 py-1 rounded-lg border border-indigo-200/50">📓 {q.notebookName}</span>
                          ) : (
                            <span className="bg-slate-50 text-slate-500 text-[10px] font-extrabold px-2.5 py-1 rounded-lg border border-slate-200">未分类</span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400 font-bold flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {format(new Date(q.createdAt), 'yyyy-MM-dd')}
                        </span>
                      </div>
                      <p className="text-slate-800 font-bold line-clamp-2 leading-relaxed mb-4 text-sm">{q.originalText}</p>
                    </div>
                    
                    <div className="flex items-center justify-between border-t border-slate-100 pt-4 mt-auto">
                      <div className="flex gap-1.5 flex-wrap items-center">
                        {q.knowledgePoints.slice(0,2).map(p => (
                          <span key={p} className="text-[10px] bg-slate-50 text-slate-500 px-2 py-0.5 rounded border border-slate-100 font-bold"># {p}</span>
                        ))}
                        <button
                          onClick={(e) => handleToggleMastery(q.id, q.masteryStatus, e)}
                          className={`text-[9px] font-extrabold px-2 py-0.5 rounded transition-all flex items-center gap-0.5 cursor-pointer border ${
                            q.masteryStatus === 'mastered' 
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-250 hover:bg-emerald-105' 
                              : 'bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-105'
                          }`}
                          title="点击一键切换掌握状态"
                        >
                          {q.masteryStatus === 'mastered' ? '✓ 已掌握' : '✗ 未掌握'}
                        </button>
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
                              setQuestions(prev => prev.map(item => item.id === q.id ? updated : item));
                            } catch (err: any) {
                              window.alert(err.message || '转移失败');
                            }
                          }}
                          className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 outline-none cursor-pointer"
                          title="快速转移所属错题本"
                        >
                          <option value="">未分类</option>
                          {notebooks.map(nb => (
                            <option key={nb.id} value={nb.id}>{nb.name}</option>
                          ))}
                        </select>
                      </div>
                      <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-blue-600 group-hover:translate-x-1 transition-all" />
                    </div>
                  </button>

                  {!isStudent && (
                    <div className="absolute right-4 top-4.5 z-10">
                      <input 
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          e.stopPropagation();
                          toggleSelect(q.id);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-4.5 h-4.5 text-blue-600 bg-slate-50 border-slate-300 rounded focus:ring-blue-500 cursor-pointer"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
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
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500">错题本名称 <span className="text-rose-500">*</span></label>
                  <input
                    type="text"
                    value={nbForm.name}
                    onChange={e => setNbForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="例如：高一数学重难点本"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none text-xs font-semibold focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500">适用年级</label>
                    <input
                      type="text"
                      value={nbForm.grade}
                      onChange={e => setNbForm(prev => ({ ...prev, grade: e.target.value }))}
                      placeholder="例如：高三"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none text-xs font-semibold focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500">所属学科</label>
                    <input
                      type="text"
                      value={nbForm.subject}
                      onChange={e => setNbForm(prev => ({ ...prev, subject: e.target.value }))}
                      placeholder="例如：数学"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none text-xs font-semibold focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500">备注描述</label>
                  <textarea
                    rows={2}
                    value={nbForm.description}
                    onChange={e => setNbForm(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="填写此错题本的收录规则与目的..."
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none text-xs font-semibold focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => setNotebookPanel('list')}
                    className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
                  >
                    返回列表
                  </button>
                  <button
                    onClick={handleSaveNotebookSubmit}
                    className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-sm shadow-blue-500/10"
                  >
                    保存提交
                  </button>
                </div>
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
  notebooks: { id: string; name: string }[],
  isAdmin: boolean,
  onBack: () => void, 
  onDelete: () => void,
  onUpdate?: (updated: ErrorQuestion) => void
}) {
  const [similarTabActive, setSimilarTabActive] = useState(false);
  const [similarData, setSimilarData] = useState<{questionText: string, solution: string, geometry?: GeometryData} | null>(question.similarQuestion || null);
  const [generating, setGenerating] = useState(false);
  
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
  const [saving, setSaving] = useState(false);
  const [savingToPublic, setSavingToPublic] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [modalType, setModalType] = useState<'original' | 'variant'>('original');
  const [parsedQuestions, setParsedQuestions] = useState<{ id: string; number: string; content: string }[]>([]);
  const [selectedModalIds, setSelectedModalIds] = useState<Set<string>>(new Set());

  const openSaveModal = (type: 'original' | 'variant') => {
    setModalType(type);
    const sourceText = type === 'original' ? question.originalText : (similarData?.questionText || '');
    const list = parseIndividualQuestions(sourceText);
    setParsedQuestions(list);
    setSelectedModalIds(new Set(list.map(item => item.id)));
    setShowSaveModal(true);
  };

  const getCorrespondingSolution = (qIndex: number, type: 'original' | 'variant'): string => {
    const sourceSolution = type === 'original' ? question.solution : (similarData?.solution || '');
    const solutions = parseIndividualSolutions(sourceSolution);
    if (solutions.length === 1) {
      return solutions[0].content;
    }
    if (qIndex < solutions.length) {
      return solutions[qIndex].content;
    }
    return sourceSolution;
  };

  const handleConfirmSaveToPublic = async () => {
    if (selectedModalIds.size === 0) {
      window.alert('请选择至少一道题目进行保存！');
      return;
    }
    setSavingToPublic(true);
    try {
      const selectedItems = parsedQuestions.filter(item => selectedModalIds.has(item.id));
      for (const item of selectedItems) {
        const itemIdx = parsedQuestions.indexOf(item);
        const matchedSolution = getCorrespondingSolution(itemIdx, modalType);
        
        const uuid = (typeof window !== 'undefined' && window.crypto && typeof window.crypto.randomUUID === 'function')
          ? window.crypto.randomUUID() 
          : Math.random().toString(36).substring(2) + Date.now().toString(36);
          
        await db.savePublicQuestion({
          id: uuid,
          originalText: item.content,
          subject: question.subject,
          knowledgePoints: question.knowledgePoints,
          errorReason: question.errorReason,
          solution: matchedSolution,
          createdAt: Date.now()
        });
      }
      window.alert(`已成功将选中的 ${selectedModalIds.size} 道题目保存至公共题库！`);
      setShowSaveModal(false);
    } catch (err: any) {
      window.alert(err.message || '保存失败');
    } finally {
      setSavingToPublic(false);
    }
  };

  useEffect(() => {
    setEditedText(question.originalText);
    setEditedSubject(question.subject);
    setEditedSolution(question.solution);
    setEditedErrorReason(question.errorReason);
    setEditedKp(question.knowledgePoints.join(', '));
    setSelectedNotebook(question.notebookId || '');
    setEditedStudentAnswer(question.studentAnswer || '');
    setEditedErrorDiagnosis(question.errorDiagnosis || []);
    setIsEditing(false);
  }, [question]);

  const generateSimilar = async () => {
    setSimilarTabActive(true);
    if (similarData || generating) return;
    
    setGenerating(true);
    try {
      const token = localStorage.getItem('errorbook_token');
      const res = await fetch('/api/similar', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          originalText: question.originalText,
          subject: question.subject,
          knowledgePoints: question.knowledgePoints
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
    } catch (err) {
      console.error(err);
      window.alert('生成同类题失败，请重试');
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
        errorDiagnosis: editedErrorDiagnosis
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
              className={`text-xs font-bold px-4 py-2 rounded-xl transition-all border ${
                isEditing 
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
                 <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1">学生答题步骤数字化批改诊断 (LaTeX 数学公式请保持格式)</label>
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
                   className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 mt-2 cursor-pointer"
                 >
                   + 增加批改步骤
                 </button>
               </div>
             </div>
            ) : (
              <ReadOnlyDetail 
                question={question} 
                isStudent={isStudent} 
                openSaveModal={openSaveModal} 
                savingToPublic={savingToPublic} 
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
                                 错因说明：{step.comment}
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
                    {!isStudent && (
                      <button
                        onClick={() => openSaveModal('original')}
                        disabled={savingToPublic}
                        className="text-[11px] font-bold text-blue-600 bg-blue-50 border border-blue-100 hover:bg-blue-105 px-3 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1"
                      >
                        <span>📥 保存原题到公共题库</span>
                      </button>
                    )}
                  </div>
                  <FormattedMath text={question.solution} className="text-slate-805" />
                </div>
             </>
           )}
         </div>
      </div>

      {/* Action / Tabs */}
      {!isStudent && !isEditing && (
        <>
          <div className="flex gap-2 p-1 bg-slate-200/50 rounded-2xl">
            <button 
               onClick={() => setSimilarTabActive(false)}
               className={`flex-1 py-3 text-xs font-bold rounded-xl transition-all ${!similarTabActive ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
            >
              原题精解回顾
            </button>
            <button 
               onClick={generateSimilar}
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
                   <p className="text-slate-600 font-bold tracking-wide animate-pulse">AI 正在深度关联题库，为您生成相似巩固练习题...</p>
                 </div>
               ) : similarData ? (
                 <div className="space-y-6">
                     <div className="flex items-center justify-between mb-4">
                       <div className="flex items-center gap-2 text-blue-800 font-bold">
                         <span className="w-8 h-8 bg-blue-100 rounded-xl flex items-center justify-center text-xs">练</span>
                         <h4 className="text-sm font-extrabold">高频错点相似强化训练题</h4>
                       </div>
                       {!isStudent && (
                         <button
                           onClick={() => openSaveModal('variant')}
                           disabled={savingToPublic}
                           className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-100 hover:bg-amber-105 px-3 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1"
                         >
                           <span>📥 保存此变式题到公共题库</span>
                         </button>
                       )}
                     </div>
                     {similarData.geometry && similarData.geometry.type !== 'none' && (
                       <div className="py-2">
                         <GeometryRenderer geometry={similarData.geometry} />
                       </div>
                     )}
                    <FormattedMath text={similarData.questionText} className="text-slate-900 text-sm font-semibold leading-relaxed" />
                    
                    <details className="group border border-slate-200 rounded-2xl overflow-hidden [&_summary::-webkit-details-marker]:hidden bg-slate-50/50">
                      <summary className="cursor-pointer bg-slate-55 p-4 font-bold text-slate-700 flex justify-between items-center group-open:border-b border-slate-200 text-xs">
                        精编解答步骤与知识梳理 (点击展开)
                        <ChevronRight className="w-5 h-5 text-slate-400 group-open:rotate-90 transition-transform" />
                      </summary>
                      <div className="p-4 bg-white">
                        <FormattedMath text={similarData.solution} className="text-slate-805" />
                      </div>
                    </details>
                 </div>
               ) : null}
            </div>
          )}
        </>
      )}

      {/* Save to Public Library Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-2xl w-full p-6 relative animate-in zoom-in-95 duration-200 max-h-[85vh] flex flex-col">
            <button 
              onClick={() => setShowSaveModal(false)} 
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 font-bold text-lg outline-none cursor-pointer"
            >
              ✕
            </button>
            <div className="mb-4 flex items-center gap-2 text-blue-600 font-bold shrink-0">
              <Sparkles className="w-5 h-5 text-amber-500 animate-pulse" />
              <h3 className="text-lg text-slate-900 font-extrabold">选择入库题目（共检测到 {parsedQuestions.length} 道题目）</h3>
            </div>
            
            <p className="text-xs text-slate-500 mb-4 shrink-0 font-medium">
              系统检测到本题可能包含多道子题，请勾选您需要单独保存到公共题库的题目。每道勾选的题目将作为独立习题入库。
            </p>

            <div className="flex-1 overflow-y-auto space-y-3 pr-2 mb-6">
              {parsedQuestions.map(item => {
                const isSelected = selectedModalIds.has(item.id);
                return (
                  <div 
                    key={item.id}
                    onClick={() => {
                      const next = new Set(selectedModalIds);
                      if (next.has(item.id)) {
                        next.delete(item.id);
                      } else {
                        next.add(item.id);
                      }
                      setSelectedModalIds(next);
                    }}
                    className={`p-4 rounded-xl border text-left cursor-pointer transition-all hover:bg-slate-50 flex gap-3 items-start ${
                      isSelected ? 'border-blue-500 bg-blue-50/20' : 'border-slate-200'
                    }`}
                  >
                    <input 
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}} // handled by parent div onClick
                      className="mt-1 text-blue-600 focus:ring-blue-500 cursor-pointer shrink-0"
                    />
                    <div className="space-y-1">
                      <span className="text-[10px] font-extrabold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 uppercase">
                        题目 {item.number}
                      </span>
                      <div className="text-slate-800 text-sm font-semibold leading-relaxed">
                        <FormattedMath text={item.content} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex gap-3 justify-end shrink-0 pt-4 border-t border-slate-100">
              <button
                onClick={() => setShowSaveModal(false)}
                className="px-5 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-50 transition-colors cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={handleConfirmSaveToPublic}
                disabled={savingToPublic || selectedModalIds.size === 0}
                className="px-6 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-extrabold hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-md shadow-blue-500/10 cursor-pointer"
              >
                {savingToPublic ? '正在保存...' : `确认保存这 ${selectedModalIds.size} 道题`}
              </button>
            </div>
          </div>
        </div>
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
  openSaveModal,
  savingToPublic,
  onToggleMastery,
  notebooks = [],
  onUpdate
}: {
  question: any;
  isStudent: boolean;
  openSaveModal: (type: 'original' | 'variant') => void;
  savingToPublic: boolean;
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
          <div className="mt-4 flex flex-wrap gap-1.5">
            {question.knowledgePoints.map((p: string) => (
              <span key={p} className="text-xs bg-slate-50 text-slate-705 px-3 py-1 rounded-lg border border-slate-100 font-bold"># {p}</span>
            ))}
          </div>
        </div>



        {(question.studentAnswer || (question.errorDiagnosis && question.errorDiagnosis.length > 0)) && (
          <div className="border-t border-slate-100 pt-6 space-y-4">
            <div className="flex items-center gap-2 text-rose-600 font-extrabold text-sm">
              <span className="w-5 h-5 rounded-lg bg-rose-50 flex items-center justify-center border border-rose-100 text-xs">📝</span>
              <h4>学生手写作答与 AI 诊断批改</h4>
            </div>

            {question.errorDiagnosis && question.errorDiagnosis.length > 0 && (
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
                          错因说明：{step.comment}
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
            {!isStudent && (
              <button
                onClick={() => openSaveModal('original')}
                disabled={savingToPublic}
                className="text-[11px] font-bold text-blue-600 bg-blue-50 border border-blue-100 hover:bg-blue-105 px-3 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1"
              >
                <span>📥 保存原题到公共题库</span>
              </button>
            )}
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
          {!isStudent && (
            <button
              onClick={() => openSaveModal('original')}
              disabled={savingToPublic}
              className="text-[11px] font-bold text-blue-600 bg-white border border-blue-200 hover:bg-blue-50 px-3 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1 shadow-sm"
            >
              <span>📥 批量保存题目到公共题库</span>
            </button>
          )}
        </div>

        <div className="space-y-6">
          {parsedQs.map((qItem, iIdx) => {
            const stdAns = parsedStdAnswers[iIdx]?.content || '';
            const stuAns = parsedStudentAnswers[iIdx]?.content || '';
            const solText = parsedSols[iIdx]?.content || '';

            // 过滤出当前题目的步骤诊断
            const questionPrefix = `(第${iIdx + 1}题)`;
            const filteredSteps = (question.errorDiagnosis || []).filter((step: any) => {
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
                                  错因说明：{step.comment}
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
    const end = i + 1 < matches.length ? matches[i+1].index : text.length;
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
    const end = i + 1 < matches.length ? matches[i+1].index : text.length;
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
    const end = i + 1 < matches.length ? matches[i+1].index : text.length;
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
    const end = i + 1 < matches.length ? matches[i+1].index : text.length;
    const fullContent = text.substring(start, end).replace(matches[i].text, '').trim();
    result.push({
      number: matches[i].text,
      content: fullContent
    });
  }
  return result;
}

