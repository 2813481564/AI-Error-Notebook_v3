import { useEffect, useState } from 'react';
import { db, ErrorQuestion } from '../lib/db';
import { Search, BookOpen, Clock, Trash2, CheckSquare, Square, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import FormattedMath from './FormattedMath';

export default function PublicQuestionLibrary({ 
  onNavigate,
  onGeneratePaper
}: { 
  onNavigate: (v: any) => void;
  onGeneratePaper?: (questions: ErrorQuestion[]) => void;
}) {
  const [questions, setQuestions] = useState<ErrorQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterSubject, setFilterSubject] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const userRole = localStorage.getItem('errorbook_role') || 'student';
  const isStudent = userRole === 'student';

  useEffect(() => {
    loadPublicQuestions();
  }, []);

  const loadPublicQuestions = () => {
    setLoading(true);
    db.getAllPublicQuestions()
      .then(data => {
        // Sort by newest first
        setQuestions(data.sort((a, b) => b.createdAt - a.createdAt));
      })
      .catch(err => {
        console.error("加载公共题库失败:", err);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('确定要从公共题库中移除这道题吗？')) return;
    try {
      await db.deletePublicQuestion(id);
      const next = new Set(selectedIds);
      next.delete(id);
      setSelectedIds(next);
      loadPublicQuestions();
    } catch (err: any) {
      alert(err.message || '删除失败');
    }
  };

  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
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

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`确定要从公共题库中批量删除选中的 ${selectedIds.size} 道题吗？`)) return;
    setLoading(true);
    try {
      const idsToDelete = Array.from(selectedIds);
      for (const id of idsToDelete) {
        await db.deletePublicQuestion(id);
      }
      setSelectedIds(new Set());
      alert('批量删除成功！');
      loadPublicQuestions();
    } catch (err: any) {
      alert(err.message || '部分题目删除失败');
      loadPublicQuestions();
    } finally {
      setLoading(false);
    }
  };

  const handleGeneratePaperClick = () => {
    if (selectedIds.size === 0) return;
    const selectedQuestions = questions.filter(q => selectedIds.has(q.id));
    if (onGeneratePaper) {
      onGeneratePaper(selectedQuestions);
    }
  };

  const subjects = Array.from(new Set(questions.map(q => q.subject)));
  const filtered = questions.filter(q => {
    if (filterSubject !== 'all' && q.subject !== filterSubject) return false;
    if (search) {
      const cleanSearch = search.toLowerCase();
      const textMatch = q.originalText.toLowerCase().includes(cleanSearch);
      const kpMatch = q.knowledgePoints.some(p => p.toLowerCase().includes(cleanSearch));
      if (!textMatch && !kpMatch) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center mb-2">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-black text-slate-950 tracking-tight">公共题库管理</h2>
          <p className="text-sm text-slate-500 font-medium">查看并检索老师/管理员收录的精品题库，支持勾选批量组卷打印</p>
        </div>
      </div>

      {/* Selected Items floating indicator bar */}
      {selectedIds.size > 0 && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-blue-50 border border-blue-200/80 p-4 rounded-2xl shadow-sm gap-3 animate-in slide-in-from-top-2 duration-300">
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse"></span>
            <p className="text-xs font-bold text-blue-900">已选中 {selectedIds.size} 道公共习题</p>
            <button 
              onClick={handleSelectAll} 
              className="text-xs font-bold text-blue-600 hover:text-blue-800 underline transition-colors cursor-pointer"
            >
              {selectedIds.size === filtered.length ? "取消全选" : "选择全部已过滤题"}
            </button>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            {!isStudent && (
              <button
                onClick={handleBatchDelete}
                className="flex-1 sm:flex-initial px-4 py-2 bg-rose-50 border border-rose-200 text-rose-600 rounded-xl text-xs font-bold hover:bg-rose-100 transition-colors cursor-pointer"
              >
                批量删除
              </button>
            )}
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

      {/* Filter and Search */}
      <div className="flex flex-col sm:flex-row gap-3">
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
         <select 
           value={filterSubject}
           onChange={e => setFilterSubject(e.target.value)}
           className="py-3 px-4 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold text-slate-700"
         >
           <option value="all">所有学科分类</option>
           {subjects.map(s => <option key={s} value={s}>{s}</option>)}
         </select>
      </div>

      {/* List */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center space-y-3">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-500 text-xs font-bold animate-pulse">正在为您载入公共题库数据...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(q => {
            const isSelected = selectedIds.has(q.id);
            return (
              <div 
                key={q.id} 
                onClick={(e) => toggleSelect(q.id, e)}
                className={`w-full bg-white p-5 rounded-2xl border text-left hover:shadow-md transition-all flex flex-col justify-between min-h-[160px] cursor-pointer relative group ${
                  isSelected ? 'border-blue-500 ring-2 ring-blue-500/10' : 'border-slate-200 hover:border-blue-400'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-3.5 pr-8">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="bg-blue-50 text-blue-700 text-[10px] font-extrabold px-2.5 py-1 rounded-lg border border-blue-100">{q.subject}</span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-bold flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {format(new Date(q.createdAt), 'yyyy-MM-dd')}
                    </span>
                  </div>
                  
                  {/* LaTeX Math Formula */}
                  <div className="text-slate-800 font-bold line-clamp-3 leading-relaxed mb-4 text-sm">
                    <FormattedMath text={q.originalText} />
                  </div>
                </div>
                
                <div className="flex items-center justify-between border-t border-slate-100 pt-4 mt-auto">
                  <div className="flex gap-1.5 flex-wrap">
                    {q.knowledgePoints.slice(0, 3).map(p => (
                      <span key={p} className="text-[10px] bg-slate-50 text-slate-500 px-2 py-0.5 rounded border border-slate-100 font-bold"># {p}</span>
                    ))}
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {!isStudent && (
                      <button 
                        onClick={(e) => handleDelete(q.id, e)} 
                        className="text-slate-300 hover:text-rose-500 p-1.5 rounded-lg hover:bg-rose-50 transition-colors"
                        title="从题库中删除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Selection Checkbox Overlay */}
                <div className="absolute right-4 top-4.5 z-10">
                  {isSelected ? (
                    <CheckSquare className="w-5 h-5 text-blue-600 transition-transform scale-110" />
                  ) : (
                    <Square className="w-5 h-5 text-slate-300 group-hover:text-blue-500 transition-colors" />
                  )}
                </div>
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div className="col-span-full py-20 flex flex-col items-center justify-center text-slate-400 bg-white border border-slate-200 rounded-2xl text-center">
               <BookOpen className="w-12 h-12 mb-3 text-slate-200" />
               <p className="font-semibold">公共题库中未检索到任何题目</p>
               <p className="text-xs text-slate-400 mt-1">管理员和老师可在“错题库管理”详情中选择题目保存入库</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
