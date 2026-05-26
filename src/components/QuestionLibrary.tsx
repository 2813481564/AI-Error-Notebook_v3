import { useEffect, useState } from 'react';
import { db, ErrorQuestion } from '../lib/db';
import { Search, Book, Clock, ChevronRight, X, Sparkles, Loader2, ArrowLeft, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import FormattedMath from './FormattedMath';

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
  
  const [selectedQuestion, setSelectedQuestion] = useState<ErrorQuestion | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadQuestions();
  }, []);

  const loadQuestions = () => {
    db.getAllQuestions().then(data => {
      // Sort by newest first
      setQuestions(data.sort((a,b) => b.createdAt - a.createdAt));
    }).catch(console.error);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这道错题吗？')) return;
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
    if (search && !q.originalText.includes(search) && !q.knowledgePoints.some(p => p.includes(search))) return false;
    return true;
  });

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center mb-2">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-black text-slate-950 tracking-tight">错题库管理</h2>
          <p className="text-sm text-slate-500 font-medium">按学科、知识点、错误原因智能归档</p>
        </div>
        <button 
          onClick={() => onNavigate('add')} 
          className="text-xs font-bold text-white bg-blue-600 px-5 py-2.5 rounded-xl hover:bg-blue-700 transition-all shadow-md shadow-blue-500/10"
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
                    <span className="bg-blue-50 text-blue-700 text-[10px] font-extrabold px-2.5 py-1 rounded-lg border border-blue-100">{q.subject}</span>
                    <span className="text-[10px] text-slate-400 font-bold flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {format(new Date(q.createdAt), 'yyyy-MM-dd')}
                    </span>
                  </div>
                  <p className="text-slate-800 font-bold line-clamp-2 leading-relaxed mb-4 text-sm">{q.originalText}</p>
                </div>
                
                <div className="flex items-center justify-between border-t border-slate-100 pt-4 mt-auto">
                  <div className="flex gap-1.5 flex-wrap">
                    {q.knowledgePoints.slice(0,2).map(p => (
                      <span key={p} className="text-[10px] bg-slate-50 text-slate-500 px-2 py-0.5 rounded border border-slate-100 font-bold"># {p}</span>
                    ))}
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-blue-600 group-hover:translate-x-1 transition-all" />
                </div>
              </button>

              {/* Checkbox Overlay */}
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
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="col-span-full py-20 flex flex-col items-center justify-center text-slate-400 bg-white border border-slate-200 rounded-2xl text-center">
             <Book className="w-12 h-12 mb-3 text-slate-200" />
             <p className="font-semibold">未检索到任何错题记录</p>
             <p className="text-xs text-slate-400 mt-1">您可以尝试更换搜索关键词，或点击右上角录题</p>
          </div>
        )}
      </div>
    </div>
  );
}

function QuestionDetail({ 
  question, 
  onBack, 
  onDelete,
  onUpdate
}: { 
  question: ErrorQuestion, 
  onBack: () => void, 
  onDelete: () => void,
  onUpdate?: (updated: ErrorQuestion) => void
}) {
  const [similarTabActive, setSimilarTabActive] = useState(false);
  const [similarData, setSimilarData] = useState<{questionText: string, solution: string} | null>(question.similarQuestion || null);
  const [generating, setGenerating] = useState(false);

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
      alert('生成同类题失败，请重试');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300 max-w-3xl mx-auto">
      
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-2 text-slate-500 hover:text-slate-950 font-bold text-sm transition-colors">
          <ArrowLeft className="w-4 h-4" />
          <span>返回列表</span>
        </button>
        <button onClick={onDelete} className="text-rose-500 hover:bg-rose-50 p-2 rounded-xl transition-colors">
          <Trash2 className="w-5 h-5" />
        </button>
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
            <div>
               <div className="flex flex-wrap items-center gap-2.5 mb-4">
                 <span className="bg-blue-50 text-blue-700 px-3 py-1 rounded-xl text-xs font-bold border border-blue-100">{question.subject}</span>
                 <span className="bg-rose-50 text-rose-600 px-3 py-1 rounded-xl text-xs font-bold flex items-center gap-1 border border-rose-100">
                    <TargetIcon className="w-3.5 h-3.5" /> 错误原因: {question.errorReason}
                 </span>
                 <span className="text-xs text-slate-400 font-semibold ml-auto">{format(new Date(question.createdAt), 'yyyy-MM-dd HH:mm')}</span>
               </div>
               <FormattedMath text={question.originalText} className="text-base text-slate-900 font-bold leading-relaxed" />
               
               <div className="mt-4 flex flex-wrap gap-1.5">
                 {question.knowledgePoints.map(p => (
                   <span key={p} className="text-xs bg-slate-50 text-slate-705 px-3 py-1 rounded-lg border border-slate-100 font-bold"># {p}</span>
                 ))}
               </div>
            </div>

            <div className="border-t border-slate-100 pt-6">
              <h4 className="flex items-center gap-2 text-blue-600 font-extrabold mb-4 text-sm">
                <Sparkles className="w-4 h-4 text-amber-500 animate-pulse" /> AI 智能辅导名师精解步骤
              </h4>
              <FormattedMath text={question.solution} className="text-slate-805" />
            </div>
         </div>
      </div>

      {/* Action / Tabs */}
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
                <div className="flex items-center gap-2 text-blue-800 font-bold mb-4">
                  <span className="w-8 h-8 bg-blue-100 rounded-xl flex items-center justify-center text-xs">练</span>
                  <h4 className="text-sm font-extrabold">高频错点相似强化训练题</h4>
                </div>
                <FormattedMath text={similarData.questionText} className="text-slate-900 text-sm font-semibold leading-relaxed" />
                
                <details className="group border border-slate-200 rounded-2xl overflow-hidden [&_summary::-webkit-details-marker]:hidden bg-slate-50/50">
                  <summary className="cursor-pointer bg-slate-55 p-4 font-bold text-slate-700 flex justify-between items-center group-open:border-b border-slate-200 text-xs">
                    精编解答步骤与知识梳理 (点击展开)
                    <ChevronRight className="w-5 h-5 text-slate-400 group-open:rotate-90 transition-transform" />
                  </summary>
                  <div className="p-4 bg-white">
                    <FormattedMath text={similarData.solution} className="text-slate-800" />
                  </div>
                </details>
             </div>
           ) : null}
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
