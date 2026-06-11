import { useEffect, useState } from 'react';
import { db, ErrorQuestion } from '../lib/db';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Target, BookOpen, BrainCircuit, Sparkles, CheckCircle2, AlertCircle, ArrowRight, TrendingUp } from 'lucide-react';

export default function Dashboard({ onNavigate }: { onNavigate: (v: any) => void }) {
  const [questions, setQuestions] = useState<ErrorQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  
  const userRole = localStorage.getItem('errorbook_role') || 'student';
  const isStudent = userRole === 'student';

  useEffect(() => {
    db.getAllQuestions()
      .then((data) => {
        setQuestions(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  const total = questions.length;
  
  // 今日任务：今日录入的错题数量
  const todayStart = new Date().setHours(0, 0, 0, 0);
  const todayCount = questions.filter(q => q.createdAt >= todayStart).length;
  
  // 待审核题目数量 (status === 'pending')
  const pendingCount = questions.filter(q => q.status === 'pending').length;

  // 掌握率：已掌握题目数 / 总数
  const masteredCount = questions.filter(q => q.masteryStatus === 'mastered').length;
  const masteryRate = total > 0 ? Math.round((masteredCount / total) * 100) : 0;

  // 薄弱考点分析：统计未掌握错题的知识点
  const unmasteredQuestions = questions.filter(q => q.masteryStatus !== 'mastered');
  const points: Record<string, number> = {};
  unmasteredQuestions.forEach(q => {
    q.knowledgePoints?.forEach(p => {
      points[p] = (points[p] || 0) + 1;
    });
  });
  
  const weakData = Object.keys(points)
    .sort((a, b) => points[b] - points[a])
    .slice(0, 5)
    .map(name => ({ name, 未掌握数: points[name] }));

  // 典型错题排行：根据得分升序排序，取分数最低的 5 道错题 (如果无得分，按创建时间排前)
  const typicalQuestions = [...questions]
    .filter(q => q.score !== undefined && q.score !== null)
    .sort((a, b) => (a.score || 0) - (b.score || 0))
    .slice(0, 5);

  // 如果打分题目不够，用普通未掌握错题补充
  if (typicalQuestions.length < 5 && questions.length > typicalQuestions.length) {
    const remainingCount = 5 - typicalQuestions.length;
    const additional = questions
      .filter(q => q.masteryStatus !== 'mastered' && !typicalQuestions.some(t => t.id === q.id))
      .slice(0, remainingCount);
    typicalQuestions.push(...additional);
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-8">
      
      {/* Title Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-black text-slate-950 tracking-tight flex items-center gap-2">
            <span>数据看板</span>
            <span className="text-xs bg-blue-100 text-blue-700 font-bold px-2 py-0.5 rounded-full">实时同步</span>
          </h2>
          <p className="text-sm text-slate-500">科学统计您的学习盲区，助力攻克高频失分薄弱点</p>
        </div>
        {!isStudent && (
          <button
            onClick={() => onNavigate('add')}
            className="self-start md:self-auto bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition flex items-center gap-1.5 shadow-sm shadow-blue-600/10 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            上传新错题
          </button>
        )}
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Card 1: 今日任务 */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between min-h-[120px] transition-all hover:shadow-md">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold text-slate-500">今日任务</span>
            <Target className="w-4.5 h-4.5 text-blue-500 shrink-0" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-3xl font-black text-slate-900 tracking-tight">{todayCount}</span>
            <span className="text-xs text-slate-400 font-semibold">道录入</span>
          </div>
        </div>

        {/* Card 2: 错题总数 */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between min-h-[120px] transition-all hover:shadow-md">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold text-slate-500">错题总数</span>
            <BookOpen className="w-4.5 h-4.5 text-indigo-500 shrink-0" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-3xl font-black text-slate-900 tracking-tight">{total}</span>
            <span className="text-xs text-slate-400 font-semibold">道积累</span>
          </div>
        </div>

        {/* Card 3: 待审核 */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between min-h-[120px] transition-all hover:shadow-md">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold text-slate-500">待审核</span>
            <AlertCircle className="w-4.5 h-4.5 text-rose-500 shrink-0" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-3xl font-black text-slate-900 tracking-tight">{pendingCount}</span>
            <span className="text-xs text-slate-400 font-semibold">道审核</span>
          </div>
        </div>

        {/* Card 4: 掌握率 */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between min-h-[120px] transition-all hover:shadow-md">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold text-slate-500">错题掌握率</span>
            <CheckCircle2 className="w-4.5 h-4.5 text-emerald-500 shrink-0" />
          </div>
          <div className="mt-2">
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-black text-slate-900 tracking-tight">{masteryRate}</span>
              <span className="text-sm text-slate-500 font-extrabold">%</span>
            </div>
            {/* Progress bar */}
            <div className="w-full bg-slate-100 h-1.5 rounded-full mt-2 overflow-hidden">
              <div 
                className="bg-emerald-500 h-full rounded-full transition-all duration-500" 
                style={{ width: `${masteryRate}%` }}
              />
            </div>
          </div>
        </div>

      </div>

      {/* Main Content Sections - Dual Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* Column Left: Weak Points Chart (7 cols) */}
        <div className="lg:col-span-7 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2 text-slate-900">
                <BrainCircuit className="w-5 h-5 text-blue-600 shrink-0" />
                <h3 className="text-base font-extrabold tracking-tight">薄弱考点分析 (未掌握)</h3>
              </div>
              <span className="text-[10px] text-slate-400 font-bold uppercase flex items-center gap-1">
                <TrendingUp className="w-3 h-3 text-slate-400" />
                知识盲区
              </span>
            </div>
            
            {weakData.length > 0 ? (
              <div className="h-64 w-full mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weakData} layout="vertical" margin={{ top: 0, right: 10, left: 10, bottom: 0 }}>
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: '#475569', fontSize: 11, fontWeight: 600 }} width={140} />
                    <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)' }} />
                    <Bar dataKey="未掌握数" fill="#3b82f6" radius={[0, 8, 8, 0]} barSize={16} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400 text-center">
                <BrainCircuit className="w-10 h-10 text-slate-200 mb-2.5 animate-pulse" />
                <p className="text-xs font-semibold text-slate-500">暂无薄弱考点</p>
                <p className="text-[11px] text-slate-400 mt-1 max-w-[240px]">
                  错题本中的错题全部已掌握，或者您还未录入错题
                </p>
              </div>
            )}
          </div>

          {weakData.length > 0 && (
            <div className="mt-4 p-3.5 bg-blue-50/70 border border-blue-100 rounded-xl flex items-center justify-between gap-3">
              <div className="text-xs text-blue-700 leading-relaxed">
                建议针对 <span className="font-bold text-blue-900">{weakData[0]?.name}</span> 等最薄弱的知识点进行专项错题重做和变式练习。
              </div>
              <button 
                onClick={() => onNavigate('exercise')}
                className="bg-blue-600 text-white hover:bg-blue-700 text-xs font-bold px-3 py-1.5 rounded-lg shrink-0 transition flex items-center gap-1 cursor-pointer"
              >
                智能组卷
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>

        {/* Column Right: Typical/High-Frequency Error List (5 cols) */}
        <div className="lg:col-span-5 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2 text-slate-900">
                <Sparkles className="w-5 h-5 text-amber-500 shrink-0" />
                <h3 className="text-base font-extrabold tracking-tight">典型错题排行 (薄弱度最高)</h3>
              </div>
              <button 
                onClick={() => onNavigate('library')}
                className="text-[11px] text-blue-600 hover:text-blue-700 font-bold transition-colors cursor-pointer"
              >
                查看全部
              </button>
            </div>

            {typicalQuestions.length > 0 ? (
              <div className="space-y-3 mt-4">
                {typicalQuestions.map((q, index) => {
                  // 提取文本，去掉 LaTeX 的多余符号
                  const cleanText = q.originalText
                    .replace(/[\$\#\*\_]/g, '')
                    .substring(0, 48) + (q.originalText.length > 48 ? '...' : '');

                  return (
                    <div 
                      key={q.id}
                      onClick={() => onNavigate('library')}
                      className="group flex items-center justify-between p-3 rounded-xl border border-slate-100 hover:border-slate-200 hover:bg-slate-50/50 transition-all cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0 pr-2">
                        {/* Rank Badge */}
                        <span className={`w-5.5 h-5.5 rounded-lg flex items-center justify-center text-xs font-black shrink-0 ${
                          index === 0 ? 'bg-amber-100 text-amber-700' :
                          index === 1 ? 'bg-slate-100 text-slate-700' :
                          index === 2 ? 'bg-orange-100 text-orange-700' :
                          'bg-slate-50 text-slate-500'
                        }`}>
                          {index + 1}
                        </span>
                        
                        {/* Question Content Truncate */}
                        <div className="flex flex-col min-w-0">
                          <span className="text-[11px] text-slate-400 font-bold tracking-tight">{q.subject}</span>
                          <p className="text-xs font-semibold text-slate-700 truncate mt-0.5 group-hover:text-blue-600 transition-colors">
                            {cleanText || '无题目文本内容'}
                          </p>
                        </div>
                      </div>

                      {/* Score Badge */}
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full shrink-0 ${
                        q.score !== undefined && q.score !== null
                          ? q.score < 60 ? 'bg-rose-50 text-rose-600 border border-rose-100' : 'bg-amber-50 text-amber-600 border border-amber-100'
                          : 'bg-slate-50 text-slate-500 border border-slate-100'
                      }`}>
                        {q.score !== undefined && q.score !== null ? `得分 ${q.score}` : '未批改'}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400 text-center">
                <BookOpen className="w-10 h-10 text-slate-200 mb-2.5" />
                <p className="text-xs font-semibold text-slate-500">暂无错题排行</p>
                <p className="text-[11px] text-slate-400 mt-1 max-w-[200px]">
                  请录入错题并使用 AI 评卷打分后，在此查看失分度排行
                </p>
              </div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
