import { useEffect, useState } from 'react';
import { db, ErrorQuestion } from '../lib/db';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Target, BookOpen, BrainCircuit, Sparkles } from 'lucide-react';

export default function Dashboard({ onNavigate }: { onNavigate: (v: any) => void }) {
  const [questions, setQuestions] = useState<ErrorQuestion[]>([]);

  useEffect(() => {
    db.getAllQuestions().then(setQuestions).catch(console.error);
  }, []);

  const total = questions.length;
  const thisWeek = questions.filter(q => q.createdAt > Date.now() - 7 * 24 * 60 * 60 * 1000).length;
  
  // Calculate weak points
  const points: Record<string, number> = {};
  questions.forEach(q => {
    q.knowledgePoints?.forEach(p => {
      points[p] = (points[p] || 0) + 1;
    });
  });
  
  const weakData = Object.keys(points)
    .sort((a, b) => points[b] - points[a])
    .slice(0, 5)
    .map(name => ({ name, 错误次数: points[name] }));

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Title Header */}
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-black text-slate-950 tracking-tight">今日概览</h2>
        <p className="text-sm text-slate-500">自动分析错题薄弱环节，科学巩固知识要点</p>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between min-h-[140px] transition-all hover:shadow-md">
           <div className="flex items-center gap-2 text-blue-600 mb-2">
             <BookOpen className="w-5 h-5 shrink-0" />
             <span className="text-sm font-bold text-slate-500">总错题数</span>
           </div>
           <span className="text-4xl font-extrabold text-slate-900 tracking-tight">{total}</span>
        </div>
        
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between min-h-[140px] transition-all hover:shadow-md">
           <div className="flex items-center gap-2 text-rose-500 mb-2">
             <Target className="w-5 h-5 shrink-0" />
             <span className="text-sm font-bold text-slate-500">本周新增</span>
           </div>
           <span className="text-4xl font-extrabold text-slate-900 tracking-tight">{thisWeek}</span>
        </div>
        
        <div className="col-span-2 md:col-span-1 bg-slate-900 p-6 rounded-2xl text-white flex flex-col justify-between min-h-[140px] shadow-lg shadow-slate-900/10">
           <div>
             <h3 className="font-bold text-white tracking-wide text-sm flex items-center gap-2">
               <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
               智能同类题推荐
             </h3>
             <p className="text-xs text-slate-400 mt-1 leading-relaxed">基于智能算法，为您定制强化提分计划</p>
           </div>
           <button 
             onClick={() => onNavigate('library')}
             className="mt-4 bg-white text-slate-900 text-xs font-bold py-2 px-4 rounded-xl self-start hover:bg-slate-100 transition-colors uppercase tracking-wider"
           >
             立即练习 →
           </button>
        </div>
      </div>

      {/* Weak Points Chart */}
      <div className="bg-white p-6 md:p-8 rounded-2xl border border-slate-200/80 shadow-sm">
        <div className="flex items-center gap-2 mb-6 text-slate-900">
           <BrainCircuit className="w-5 h-5 text-blue-600 shrink-0" />
           <h2 className="text-lg font-extrabold tracking-tight">知识点分析周报</h2>
        </div>
        
        {weakData.length > 0 ? (
          <div className="space-y-6">
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weakData} layout="vertical" margin={{ top: 0, right: 10, left: 20, bottom: 0 }}>
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: '#475569', fontSize: 12, fontWeight: 600 }} width={80} />
                  <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)' }} />
                  <Bar dataKey="错误次数" fill="#2563eb" radius={[0, 8, 8, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            
            <div className="p-4 bg-blue-50/70 border border-blue-100 rounded-2xl flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
              <div>
                <p className="text-xs text-blue-800 font-extrabold mb-0.5">AI 指导建议</p>
                <p className="text-xs text-blue-700 leading-relaxed">
                  本周您共有 <span className="font-bold text-blue-900">{weakData.length}</span> 个高频易错知识点。建议针对高频错题点击「同类题推荐」，做专项突破。
                </p>
              </div>
              <button 
                onClick={() => onNavigate('library')}
                className="bg-blue-600 text-white hover:bg-blue-700 text-xs font-bold px-4 py-2 rounded-xl shrink-0 transition"
              >
                专项提升
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400 text-center">
            <BrainCircuit className="w-12 h-12 text-slate-200 mb-3" />
            <p className="font-medium">暂无错题数据记录</p>
            <p className="text-xs mt-1 text-slate-400">一键「拍照录题」后，AI 将自动分析提取周报</p>
            <button 
              onClick={() => onNavigate('add')}
              className="mt-4 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2.5 px-6 rounded-xl transition"
            >
              拍照录入首道错题
            </button>
          </div>
        )}
      </div>

    </div>
  );
}
