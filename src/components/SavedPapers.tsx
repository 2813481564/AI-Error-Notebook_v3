import React, { useState, useEffect } from 'react';
import { db, SavedPaper, ErrorQuestion } from '../lib/db';
import { FileText, Calendar, Layers, Trash2, Eye, Loader2, Sparkles, PlusCircle } from 'lucide-react';
import { format } from 'date-fns';

interface SavedPapersProps {
  onNavigate: (view: any) => void;
  onOpenPaper: (questions: any[]) => void;
}

export default function SavedPapers({ onNavigate, onOpenPaper }: SavedPapersProps) {
  const [papers, setPapers] = useState<SavedPaper[]>([]);
  const [questions, setQuestions] = useState<ErrorQuestion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const savedPapers = await db.getAllPapers();
      const allQuestions = await db.getAllQuestions();
      setPapers(savedPapers);
      setQuestions(allQuestions);
    } catch (err) {
      console.error('获取试卷数据失败:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, title: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`确定要删除试卷【${title}】吗？此操作无法撤销。`)) return;

    try {
      await db.deletePaper(id);
      setPapers(prev => prev.filter(p => p.id !== id));
    } catch (err: any) {
      alert(err.message || '删除失败，请重试');
    }
  };

  const handleOpen = (paper: SavedPaper) => {
    // 根据试卷存储的 questionIds 匹配完整的错题数据
    const resolvedQuestions = paper.questionIds
      .map(id => questions.find(q => q.id === id))
      .filter(Boolean) as ErrorQuestion[];

    if (resolvedQuestions.length === 0) {
      alert('⚠️ 该试卷包含的所有题目均已从错题库中被删除，无法打开试卷！');
      return;
    }

    if (resolvedQuestions.length < paper.questionIds.length) {
      const deletedCount = paper.questionIds.length - resolvedQuestions.length;
      const confirmOpen = window.confirm(
        `提示：此试卷中包含的 ${deletedCount} 道错题已在主错题库中被物理删除。\n` +
        `是否继续加载剩余的 ${resolvedQuestions.length} 道题？`
      );
      if (!confirmOpen) return;
    }

    onOpenPaper(resolvedQuestions);
  };

  if (loading) {
    return (
      <div className="min-h-[400px] flex flex-col items-center justify-center space-y-4 bg-white rounded-3xl border border-slate-100 shadow-sm">
        <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
        <p className="text-slate-500 font-bold text-xs animate-pulse">正在为您载入已组试卷归档...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* 头部导航 */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center mb-2">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-black text-slate-950 tracking-tight">我的试卷库</h2>
          <p className="text-sm text-slate-500 font-medium">管理与重新打印您组建的历史巩固练习卷</p>
        </div>
        <button 
          onClick={() => onNavigate('exercise')} 
          className="text-xs font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2.5 rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all shadow-md shadow-blue-500/10 cursor-pointer flex items-center gap-1.5"
        >
          <PlusCircle className="w-4 h-4" />
          <span>新建组卷练习</span>
        </button>
      </div>

      {/* 试卷卡片网格 */}
      {papers.length === 0 ? (
        <div className="bg-white rounded-3xl p-16 text-center border border-slate-200/60 shadow-sm flex flex-col items-center justify-center space-y-4">
          <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center border border-slate-100">
            <FileText className="w-8 h-8 text-slate-350" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-black text-slate-800">暂无已存试卷</h3>
            <p className="text-slate-400 font-semibold text-xs max-w-sm">
              您还没有保存过任何试卷。可在“我的错题本”或“智能组卷”中选取题目后，在试卷预览页点击右上角的“保存试卷”。
            </p>
          </div>
          <button
            onClick={() => onNavigate('exercise')}
            className="px-5 py-2.5 bg-slate-900 hover:bg-black text-white rounded-xl text-xs font-black transition cursor-pointer shadow-sm"
          >
            立即去智能组卷
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {papers.map(paper => {
            // 检查是否有丢失的错题
            const activeCount = paper.questionIds.filter(id => questions.some(q => q.id === id)).length;
            const hasDeleted = activeCount < paper.questionIds.length;
            const isVariant = paper.mode === 'variant';

            return (
              <div
                key={paper.id}
                onClick={() => handleOpen(paper)}
                className="bg-white hover:shadow-lg transition-all rounded-3xl border border-slate-200 p-6 flex flex-col justify-between min-h-[200px] cursor-pointer group hover:border-blue-400"
              >
                <div className="space-y-3">
                  {/* 卡片头部 */}
                  <div className="flex items-center justify-between">
                    {isVariant ? (
                      <span className="text-[9px] bg-amber-50 text-amber-700 font-extrabold px-2.5 py-1 rounded-lg border border-amber-100 flex items-center gap-0.5">
                        <Sparkles className="w-2.5 h-2.5 text-amber-500 animate-pulse" />
                        <span>AI 变式版</span>
                      </span>
                    ) : (
                      <span className="text-[9px] bg-blue-50 text-blue-700 font-extrabold px-2.5 py-1 rounded-lg border border-blue-100 flex items-center gap-0.5">
                        <Layers className="w-2.5 h-2.5 text-blue-500" />
                        <span>原错题版</span>
                      </span>
                    )}
                    
                    {hasDeleted && (
                      <span className="text-[9px] bg-rose-50 text-rose-600 border border-rose-100 px-2 py-0.5 rounded font-extrabold" title="包含的某些原错题已被物理删除">
                        ⚠️ 部分题已删
                      </span>
                    )}
                  </div>

                  {/* 试卷标题 */}
                  <h3 className="text-sm font-black text-slate-800 group-hover:text-blue-600 transition-colors line-clamp-2 leading-snug">
                    {paper.title}
                  </h3>
                </div>

                {/* 卡片底部 */}
                <div className="border-t border-slate-100 pt-4 mt-6 flex flex-col space-y-3">
                  <div className="flex items-center justify-between text-[10px] text-slate-450 font-bold">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {format(new Date(paper.createdAt), 'yyyy-MM-dd HH:mm')}
                    </span>
                    <span>共 {paper.questionIds.length} 道题</span>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpen(paper);
                      }}
                      className="flex-1 py-2 bg-slate-50 hover:bg-blue-50 border border-slate-200/60 hover:border-blue-200 text-slate-700 hover:text-blue-700 rounded-xl text-[10px] font-black transition flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>查看试卷</span>
                    </button>
                    <button
                      onClick={(e) => handleDelete(paper.id, paper.title, e)}
                      className="px-3 py-2 bg-slate-50 hover:bg-rose-50 border border-slate-200/60 hover:border-rose-200 text-slate-400 hover:text-rose-600 rounded-xl transition flex items-center justify-center cursor-pointer"
                      title="删除试卷"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}
