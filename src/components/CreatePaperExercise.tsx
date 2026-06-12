import { useState, useEffect } from 'react';
import { db, ErrorQuestion } from '../lib/db';
import { Sparkles, ListChecks, Search, BookOpen, Check, HelpCircle, Loader2, AlertCircle } from 'lucide-react';
import FormattedMath from './FormattedMath';

interface CreatePaperExerciseProps {
  onNavigate: (view: any) => void;
  onGeneratePaper: (questions: any[]) => void;
}

export default function CreatePaperExercise({ onNavigate, onGeneratePaper }: CreatePaperExerciseProps) {
  const [questions, setQuestions] = useState<ErrorQuestion[]>([]);
  const [notebooks, setNotebooks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'smart' | 'manual'>('smart');

  // 智能组卷表单状态
  const [smartSubject, setSmartSubject] = useState('all');
  const [smartNotebook, setSmartNotebook] = useState('all');
  const [smartMastery, setSmartMastery] = useState('all');
  const [smartCount, setSmartCount] = useState(10);
  const [selectedKps, setSelectedKps] = useState<Set<string>>(new Set());
  const [kpSearch, setKpSearch] = useState('');

  // 手动组卷表单状态
  const [manualSearch, setManualSearch] = useState('');
  const [manualSubject, setManualSubject] = useState('all');
  const [manualNotebook, setManualNotebook] = useState('all');
  const [manualMastery, setManualMastery] = useState('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // 加载错题
      const qs = await db.getAllQuestions();
      setQuestions(qs);

      // 加载错题本
      const token = localStorage.getItem('errorbook_token');
      const res = await fetch('/api/notebooks', {
        headers: {
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        }
      });
      const data = await res.json();
      if (Array.isArray(data)) {
        setNotebooks(data);
      }
    } catch (err) {
      console.error('加载数据失败:', err);
    } finally {
      setLoading(false);
    }
  };

  // 提取所有不同的学科和知识点
  const subjects = Array.from(new Set(questions.map(q => q.subject))).filter(Boolean);
  const allKps = Array.from(new Set(questions.flatMap(q => q.knowledgePoints || []))).filter(Boolean) as string[];

  // 知识点过滤（支持搜索）
  const filteredKps = allKps.filter(kp => 
    kp.toLowerCase().includes(kpSearch.toLowerCase())
  );

  // 智能组卷：开始生成
  const handleSmartGenerate = () => {
    // 过滤匹配的题目
    let pool = questions.filter(q => {
      if (smartSubject !== 'all' && q.subject !== smartSubject) return false;
      if (smartNotebook === 'unclassified') {
        if (q.notebookId) return false;
      } else if (smartNotebook !== 'all' && q.notebookId !== smartNotebook) {
        return false;
      }
      if (smartMastery === 'not_mastered' && q.masteryStatus === 'mastered') return false;
      if (smartMastery === 'mastered' && q.masteryStatus !== 'mastered') return false;
      if (selectedKps.size > 0) {
        // 错题必须包含所选知识点中的至少一个
        const hasKp = q.knowledgePoints.some(kp => selectedKps.has(kp));
        if (!hasKp) return false;
      }
      return true;
    });

    if (pool.length === 0) {
      alert('没有找到符合条件的错题，请调整筛选条件后重试！');
      return;
    }

    // 随机打乱
    pool = [...pool].sort(() => 0.5 - Math.random());

    // 截取数量
    const selected = pool.slice(0, Math.min(smartCount, pool.length));
    onGeneratePaper(selected);
  };

  // 手动组卷：过滤出的题目
  const filteredQuestions = questions.filter(q => {
    if (manualSubject !== 'all' && q.subject !== manualSubject) return false;
    if (manualNotebook === 'unclassified') {
      if (q.notebookId) return false;
    } else if (manualNotebook !== 'all' && q.notebookId !== manualNotebook) {
      return false;
    }
    if (manualMastery === 'not_mastered' && q.masteryStatus === 'mastered') return false;
    if (manualMastery === 'mastered' && q.masteryStatus !== 'mastered') return false;
    if (manualSearch) {
      const s = manualSearch.toLowerCase();
      const matchText = q.originalText.toLowerCase().includes(s);
      const matchKp = q.knowledgePoints.some(kp => kp.toLowerCase().includes(s));
      if (!matchText && !matchKp) return false;
    }
    return true;
  });

  // 手动组卷：切换选中
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
    if (selectedIds.size === filteredQuestions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredQuestions.map(q => q.id)));
    }
  };

  // 手动组卷：开始生成
  const handleManualGenerate = () => {
    if (selectedIds.size === 0) {
      alert('请先勾选需要组卷的错题！');
      return;
    }
    const selected = questions.filter(q => selectedIds.has(q.id));
    onGeneratePaper(selected);
  };

  // 切换知识点选中状态
  const toggleKp = (kp: string) => {
    const next = new Set(selectedKps);
    if (next.has(kp)) {
      next.delete(kp);
    } else {
      next.add(kp);
    }
    setSelectedKps(next);
  };

  if (loading) {
    return (
      <div className="min-h-[400px] flex flex-col items-center justify-center space-y-4 bg-white rounded-3xl border border-slate-100 shadow-sm">
        <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
        <p className="text-slate-500 font-bold text-xs animate-pulse">正在为您载入错题库与组卷数据...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* 头部导航/标题 */}
      <div className="flex flex-col gap-1.5">
        <h2 className="text-2xl font-black text-slate-950 tracking-tight">智能组卷练习</h2>
        <p className="text-sm text-slate-500 font-medium">定制个性化巩固试卷，精准击破薄弱考点</p>
      </div>

      {/* Tab 切换栏 */}
      <div className="flex bg-slate-100 p-1 rounded-2xl max-w-sm border border-slate-200/40">
        <button
          onClick={() => setActiveTab('smart')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'smart'
              ? 'bg-white text-blue-600 shadow-sm'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>智能一键组卷</span>
        </button>
        <button
          onClick={() => setActiveTab('manual')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'manual'
              ? 'bg-white text-blue-600 shadow-sm'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <ListChecks className="w-4 h-4" />
          <span>手动精选组卷</span>
        </button>
      </div>

      {/* 主体面板 */}
      {activeTab === 'smart' ? (
        // ======================== 智能一键组卷 ========================
        <div className="bg-white rounded-3xl p-6 md:p-8 border border-slate-200/60 shadow-sm space-y-6">
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* 学科筛选 */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                <span>目标学科分类</span>
              </label>
              <select
                value={smartSubject}
                onChange={e => setSmartSubject(e.target.value)}
                className="w-full py-3 px-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none text-xs font-extrabold text-slate-700 transition-all cursor-pointer"
              >
                <option value="all">不限学科</option>
                {subjects.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {/* 错题本筛选 */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                <span>归属错题本</span>
              </label>
              <select
                value={smartNotebook}
                onChange={e => setSmartNotebook(e.target.value)}
                className="w-full py-3 px-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none text-xs font-extrabold text-slate-700 transition-all cursor-pointer"
              >
                <option value="all">不限错题本</option>
                <option value="unclassified">未分类错题</option>
                {notebooks.map(nb => (
                  <option key={nb.id} value={nb.id}>{nb.name}</option>
                ))}
              </select>
            </div>

            {/* 掌握状态 */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                <span>错题掌握程度</span>
              </label>
              <select
                value={smartMastery}
                onChange={e => setSmartMastery(e.target.value)}
                className="w-full py-3 px-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none text-xs font-extrabold text-slate-700 transition-all cursor-pointer"
              >
                <option value="all">不限掌握状态</option>
                <option value="not_mastered">未掌握（推荐强化）</option>
                <option value="mastered">已掌握</option>
              </select>
            </div>
          </div>

          {/* 选题数量 */}
          <div className="space-y-3 pt-2">
            <label className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
              <span>抽题数量</span>
            </label>
            <div className="flex flex-wrap items-center gap-3">
              {[5, 10, 15, 20].map(n => (
                <button
                  key={n}
                  onClick={() => setSmartCount(n)}
                  className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                    smartCount === n
                      ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-500/10'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {n} 道题
                </button>
              ))}
              <div className="relative flex items-center bg-slate-50 border border-slate-200 focus-within:border-blue-500 focus-within:bg-white rounded-xl px-3 py-1.5 transition-all">
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={smartCount}
                  onChange={e => setSmartCount(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-16 bg-transparent border-none outline-none text-xs text-center font-extrabold text-slate-700"
                />
                <span className="text-[10px] text-slate-400 font-bold ml-1">自定义</span>
              </div>
            </div>
          </div>

          {/* 考点/知识点多选 */}
          <div className="space-y-3 pt-2">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
              <label className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
                <span>按考点知识点精细化组卷 (可选)</span>
              </label>
              {allKps.length > 0 && (
                <div className="relative w-full sm:w-48">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="搜索考点标签..."
                    value={kpSearch}
                    onChange={e => setKpSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg outline-none text-[11px] font-bold text-slate-700 focus:bg-white focus:border-blue-500 transition-all"
                  />
                </div>
              )}
            </div>

            {allKps.length === 0 ? (
              <div className="bg-slate-50 p-5 rounded-2xl text-center text-xs text-slate-400 font-medium border border-dashed border-slate-200">
                当前错题库中暂无解析出的知识点考点。您可以通过上传带有解析的错题来积累。
              </div>
            ) : (
              <div className="border border-slate-200/60 rounded-2xl p-4 bg-slate-50/50 max-h-48 overflow-y-auto">
                {filteredKps.length === 0 ? (
                  <p className="text-center text-xs text-slate-400 font-bold py-4">未找到匹配的知识点标签</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {filteredKps.map(kp => {
                      const isActive = selectedKps.has(kp);
                      return (
                        <button
                          key={kp}
                          onClick={() => toggleKp(kp)}
                          className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all cursor-pointer flex items-center gap-1 ${
                            isActive
                              ? 'bg-blue-50 border-blue-200 text-blue-700 shadow-sm'
                              : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                          }`}
                        >
                          {isActive && <Check className="w-3 h-3 text-blue-600 shrink-0" />}
                          <span>{kp}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            {selectedKps.size > 0 && (
              <div className="flex items-center gap-2 text-[10px]">
                <span className="text-slate-400 font-bold">已选考点：</span>
                <span className="text-blue-600 font-extrabold">{selectedKps.size} 个</span>
                <button
                  onClick={() => setSelectedKps(new Set())}
                  className="text-slate-400 hover:text-rose-600 font-bold underline ml-1 cursor-pointer"
                >
                  清除已选
                </button>
              </div>
            )}
          </div>

          {/* 生成试卷动作 */}
          <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-xs text-slate-500 font-bold">
              <HelpCircle className="w-4.5 h-4.5 text-slate-400" />
              <span>系统将根据所选条件，在数据库中匹配最契合您的题目，并生成巩固测验卷。</span>
            </div>
            
            <button
              onClick={handleSmartGenerate}
              className="w-full sm:w-auto px-8 py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-2xl font-black text-xs transition-all shadow-lg shadow-blue-500/25 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-white animate-pulse" />
              <span>⚡ 开始智能一键组卷</span>
            </button>
          </div>

        </div>
      ) : (
        // ======================== 手动精选组卷 ========================
        <div className="space-y-4">
          
          {/* 筛选过滤工具条 */}
          <div className="bg-white rounded-3xl p-5 border border-slate-200/60 shadow-sm flex flex-col lg:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="搜索题目、知识点、考点..."
                value={manualSearch}
                onChange={e => setManualSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-xs font-semibold text-slate-800 focus:bg-white transition-all"
              />
            </div>
            
            <div className="flex flex-wrap gap-2">
              <select
                value={manualSubject}
                onChange={e => setManualSubject(e.target.value)}
                className="py-2.5 px-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs font-bold text-slate-700 cursor-pointer flex-1 sm:flex-initial"
              >
                <option value="all">所有学科</option>
                {subjects.map(s => <option key={s} value={s}>{s}</option>)}
              </select>

              <select
                value={manualNotebook}
                onChange={e => setManualNotebook(e.target.value)}
                className="py-2.5 px-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs font-bold text-slate-700 cursor-pointer flex-1 sm:flex-initial"
              >
                <option value="all">所有错题本</option>
                <option value="unclassified">未分类错题</option>
                {notebooks.map(nb => (
                  <option key={nb.id} value={nb.id}>{nb.name}</option>
                ))}
              </select>

              <select
                value={manualMastery}
                onChange={e => setManualMastery(e.target.value as any)}
                className="py-2.5 px-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs font-bold text-slate-700 cursor-pointer flex-1 sm:flex-initial"
              >
                <option value="all">所有掌握状态</option>
                <option value="not_mastered">未掌握</option>
                <option value="mastered">已掌握</option>
              </select>

              <button
                onClick={handleSelectAll}
                className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl text-slate-700 text-xs font-bold transition cursor-pointer"
              >
                {selectedIds.size === filteredQuestions.length ? "取消全选" : "全选当前"}
              </button>
            </div>
          </div>

          {/* 题目列表卡片网格 */}
          {filteredQuestions.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center border border-slate-200/60 shadow-sm flex flex-col items-center justify-center space-y-3">
              <AlertCircle className="w-10 h-10 text-slate-300" />
              <p className="text-slate-500 font-bold text-xs">没有找到符合条件的错题，请尝试更换筛选条件</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-20">
              {filteredQuestions.map(q => {
                const isSelected = selectedIds.has(q.id);
                return (
                  <div
                    key={q.id}
                    onClick={() => toggleSelect(q.id)}
                    className={`bg-white p-5 rounded-2xl border text-left hover:shadow-md transition-all flex flex-col justify-between cursor-pointer relative group ${
                      isSelected 
                        ? 'border-blue-500 ring-2 ring-blue-500/10' 
                        : 'border-slate-200 hover:border-blue-400'
                    }`}
                  >
                    <div>
                      {/* 卡片头部 */}
                      <div className="flex items-center justify-between mb-3.5 pr-8">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="bg-blue-50 text-blue-700 text-[9px] font-extrabold px-2.5 py-0.5 rounded-lg border border-blue-100">{q.subject}</span>
                          {q.notebookName && (
                            <span className="bg-indigo-50 text-indigo-700 text-[9px] font-extrabold px-2.5 py-0.5 rounded-lg border border-indigo-200/50">📓 {q.notebookName}</span>
                          )}
                          {q.errorReason === 'AI变式题' && (
                            <span className="bg-amber-50 text-amber-750 text-[9px] font-extrabold px-2.5 py-0.5 rounded-lg border border-amber-200 flex items-center gap-0.5">
                              <span>✨</span> AI变式题
                            </span>
                          )}
                        </div>
                        <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded border ${
                          q.masteryStatus === 'mastered' 
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                            : 'bg-rose-50 text-rose-600 border-rose-200'
                        }`}>
                          {q.masteryStatus === 'mastered' ? '✓ 已掌握' : '✗ 未掌握'}
                        </span>
                      </div>
                      {/* 题目内容预览 */}
                      <FormattedMath 
                        text={q.originalText} 
                        className="text-slate-800 font-bold line-clamp-3 leading-relaxed mb-4 text-xs" 
                      />
                    </div>

                    {/* 卡片底部知识点 */}
                    <div className="flex flex-wrap gap-1 border-t border-slate-100 pt-3 mt-auto">
                      {q.knowledgePoints.slice(0, 3).map(kp => (
                        <span key={kp} className="text-[9px] bg-slate-50 text-slate-500 px-2 py-0.5 rounded border border-slate-100 font-bold"># {kp}</span>
                      ))}
                    </div>

                    {/* 复选框 */}
                    <div className="absolute right-4 top-4.5">
                      <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
                        isSelected 
                          ? 'bg-blue-600 border-blue-600 text-white shadow-sm' 
                          : 'bg-white border-slate-300 group-hover:border-blue-400'
                      }`}>
                        {isSelected && <Check className="w-3.5 h-3.5" />}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* 底部悬浮条 */}
          {selectedIds.size > 0 && (
            <div className="no-print fixed bottom-6 left-1/2 -translate-x-1/2 max-w-lg w-[calc(100%-2rem)] bg-slate-900/90 backdrop-blur-md border border-slate-800 text-white px-5 py-4 rounded-3xl shadow-2xl flex items-center justify-between gap-4 z-40 animate-in slide-in-from-bottom-5 duration-300">
              <div className="flex items-center gap-3">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse"></span>
                <p className="text-xs font-extrabold">已挑选 <span className="text-blue-400 font-black text-sm">{selectedIds.size}</span> 道错题进行组卷</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="px-4 py-2 border border-slate-700 text-slate-300 hover:text-white rounded-xl text-[10px] font-bold transition cursor-pointer"
                >
                  清空
                </button>
                <button
                  onClick={handleManualGenerate}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[10px] font-black transition shadow-md shadow-blue-600/20 cursor-pointer"
                >
                  生成试卷 ({selectedIds.size})
                </button>
              </div>
            </div>
          )}

        </div>
      )}

    </div>
  );
}
