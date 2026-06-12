import React, { useState, useEffect, useRef } from 'react';
import { X, BookOpen, Download, AlertCircle, CheckCircle, TrendingUp, Users, Zap } from 'lucide-react';
import { toPng } from 'html-to-image';

interface WeeklyStatItem {
  weekKey: string;
  weekLabel: string;
  weekStart: number;
  weekEnd: number;
  total: number;
  mastered: number;
  notMastered: number;
  bySubject: Record<string, number>;
}

interface WeeklyReportModalProps {
  username: string;
  onClose: () => void;
}

export default function WeeklyReportModal({ username, onClose }: WeeklyReportModalProps) {
  const [weeklyStats, setWeeklyStats] = useState<WeeklyStatItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedWeekIdx, setSelectedWeekIdx] = useState(0);
  const [exporting, setExporting] = useState(false);
  const reportCardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      setError(null);
      try {
        const token = localStorage.getItem('errorbook_token');
        const res = await fetch(`/api/admin/users/${username}/weekly-stats`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || '获取用户周报统计失败');
        }
        const data = await res.json();
        setWeeklyStats(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, [username]);

  const handleExport = async () => {
    if (!reportCardRef.current || exporting) return;
    setExporting(true);
    try {
      const currentWeek = weeklyStats[selectedWeekIdx];
      const dataUrl = await toPng(reportCardRef.current, {
        quality: 0.98,
        pixelRatio: 2,
        backgroundColor: '#f8fafc',
        style: {
          transform: 'scale(1)',
          borderRadius: '24px'
        }
      });
      const link = document.createElement('a');
      link.download = `${username}_错题周报_${currentWeek.weekKey}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err: any) {
      console.error('Export Error:', err);
      alert('导出图片失败：' + err.message);
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-2xl max-w-sm w-full text-center">
          <div className="w-10 h-10 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm font-bold text-slate-500">正在生成周报数据空间...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-2xl max-w-sm w-full relative">
          <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition-colors cursor-pointer">
            <X className="w-5 h-5" />
          </button>
          <div className="mb-4 text-rose-500 flex justify-center">
            <AlertCircle className="w-12 h-12" />
          </div>
          <p className="text-center font-bold text-slate-800 text-sm mb-4">{error}</p>
          <button onClick={onClose} className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer">
            关闭
          </button>
        </div>
      </div>
    );
  }

  if (weeklyStats.length === 0) {
    return (
      <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-2xl max-w-md w-full relative text-center">
          <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition-colors cursor-pointer">
            <X className="w-5 h-5" />
          </button>
          <div className="w-12 h-12 bg-amber-50 text-amber-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h3 className="text-base font-black text-slate-900 mb-2">生成失败</h3>
          <p className="text-xs text-slate-500 font-medium leading-relaxed mb-6">
            用户 <span className="font-bold text-slate-800">"{username}"</span> 暂未在系统中录入任何错题数据，无法生成错题周报。
          </p>
          <button onClick={onClose} className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer">
            返回列表
          </button>
        </div>
      </div>
    );
  }

  const currentWeek = weeklyStats[selectedWeekIdx];
  const masteryRate = currentWeek.total > 0 ? Math.round((currentWeek.mastered / currentWeek.total) * 100) : 0;

  // 计算学科占比
  const sortedSubjects = Object.entries(currentWeek.bySubject)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));
  
  const colors = [
    { bg: 'bg-gradient-to-r from-blue-500 to-cyan-400', dot: 'bg-blue-500' },
    { bg: 'bg-gradient-to-r from-purple-500 to-indigo-500', dot: 'bg-purple-500' },
    { bg: 'bg-gradient-to-r from-pink-550 to-rose-400', dot: 'bg-pink-550' },
    { bg: 'bg-gradient-to-r from-amber-500 to-orange-400', dot: 'bg-amber-500' },
    { bg: 'bg-gradient-to-r from-emerald-500 to-teal-400', dot: 'bg-emerald-500' }
  ];

  let accumulatedPercent = 0;
  const subjectShares = sortedSubjects.map((subj, idx) => {
    let pct = currentWeek.total > 0 ? Math.round((subj.count / currentWeek.total) * 100) : 0;
    if (idx === sortedSubjects.length - 1) {
      pct = 100 - accumulatedPercent;
    } else {
      accumulatedPercent += pct;
    }
    const colorTheme = colors[idx % colors.length];
    return {
      name: subj.name,
      count: subj.count,
      percentage: pct,
      color: colorTheme.bg,
      dot: colorTheme.dot
    };
  });

  const weakSubject = sortedSubjects.length > 0 ? sortedSubjects[0].name : '';

  // AI 建议
  let aiSuggestion = '';
  if (masteryRate >= 80) {
    aiSuggestion = `本周攻克率极高，学习态度与方法非常优秀！大部分错题均已得到有效解决，建议继续保持这种高效的学习节奏，稳步向前迈进。`;
  } else if (masteryRate >= 60) {
    aiSuggestion = `本周错题大部分已攻克，表现良好。当前"${weakSubject}"科目错题占比较大，请注意针对该科目的薄弱考点多加练习，消灭顽固的知识盲区。`;
  } else if (masteryRate >= 30) {
    aiSuggestion = `本周新增了较多错题，目前仅掌握了部分。错题是通往高分的阶梯，建议下周每天抽出 15 分钟专注复习“待攻克”题目，逐步夯实基础。`;
  } else {
    aiSuggestion = `本周在学习中遇到了一些难关，错题攻克进度稍慢。不要灰心，建议优先分析"${weakSubject}"的错题解析，结合 AI 诊断步骤从最基础的概念开始逐个击破。`;
  }

  return (
    <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-2xl w-full p-6 relative animate-in fade-in zoom-in-95 duration-200 my-8">
        
        {/* 控制按钮与周选择器 */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 mb-6">
          <div className="space-y-1">
            <h3 className="text-base font-black text-slate-900 flex items-center gap-1.5">
              <BookOpen className="w-4 h-4 text-indigo-600" />
              <span>错题周报生成器</span>
            </h3>
            <p className="text-[10px] text-slate-400 font-bold">请选择目标周并点击“导出图片”保存报告</p>
          </div>
          
          <div className="flex items-center gap-3">
            <select
              value={selectedWeekIdx}
              onChange={(e) => setSelectedWeekIdx(parseInt(e.target.value))}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-xs font-bold text-slate-700 transition-all cursor-pointer"
            >
              {weeklyStats.map((week, idx) => (
                <option key={week.weekKey} value={idx}>
                  {week.weekLabel} ({week.total}道错题)
                </option>
              ))}
            </select>
            
            <button
              onClick={handleExport}
              disabled={exporting}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shadow-md shadow-indigo-500/10 cursor-pointer disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{exporting ? '正在生成...' : '导出图片'}</span>
            </button>
            
            <button 
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-xl transition-all cursor-pointer"
              title="关闭弹窗"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 报告卡片 DOM 区 */}
        <div className="overflow-x-auto pb-4">
          <div 
            ref={reportCardRef} 
            className="w-[500px] mx-auto bg-gradient-to-br from-indigo-50/60 to-purple-50/60 p-6 rounded-[24px] border border-slate-200/80 shadow-sm font-sans flex flex-col gap-5 select-none"
          >
            {/* 卡片头部 */}
            <div className="flex items-start justify-between border-b border-indigo-100/50 pb-4">
              <div>
                <span className="inline-block px-2.5 py-0.5 rounded-full text-[9px] font-black bg-indigo-600 text-white tracking-wider mb-2">
                  AI WEEKLY REPORT
                </span>
                <h4 className="text-lg font-black text-slate-800 tracking-tight">AI 智能错题本 · 错题周报</h4>
                <p className="text-[10px] text-slate-500 font-bold mt-1">
                  统计周期：{currentWeek.weekLabel}
                </p>
              </div>
              <div className="text-right">
                <span className="text-xs font-black text-slate-900 block">{username}</span>
                <span className="inline-block mt-1.5 px-2 py-0.5 rounded-md text-[9px] font-bold bg-white text-indigo-600 border border-indigo-100 shadow-sm shadow-indigo-500/5 uppercase">
                  学生报告
                </span>
              </div>
            </div>

            {/* 三大指标网格 */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white p-3.5 rounded-2xl border border-indigo-100/30 shadow-sm shadow-indigo-100/10 flex flex-col justify-between h-20 relative overflow-hidden">
                <div className="w-6 h-6 rounded-lg bg-blue-50 flex items-center justify-center text-blue-500">
                  <BookOpen className="w-3.5 h-3.5" />
                </div>
                <div className="z-10">
                  <span className="text-[9px] font-bold text-slate-400 block uppercase">本周录入错题</span>
                  <span className="text-lg font-black text-slate-800 leading-none mt-1 inline-block">{currentWeek.total} <span className="text-[10px] font-semibold text-slate-400">道</span></span>
                </div>
                <div className="absolute right-0 bottom-0 translate-x-2 translate-y-2 opacity-5">
                  <BookOpen className="w-14 h-14" />
                </div>
              </div>

              <div className="bg-white p-3.5 rounded-2xl border border-indigo-100/30 shadow-sm shadow-indigo-100/10 flex flex-col justify-between h-20 relative overflow-hidden">
                <div className="w-6 h-6 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-500">
                  <CheckCircle className="w-3.5 h-3.5" />
                </div>
                <div className="z-10">
                  <span className="text-[9px] font-bold text-slate-400 block uppercase">本周已掌握</span>
                  <span className="text-lg font-black text-emerald-600 leading-none mt-1 inline-block">{currentWeek.mastered} <span className="text-[10px] font-semibold text-slate-400">道</span></span>
                </div>
                <div className="absolute right-0 bottom-0 translate-x-2 translate-y-2 opacity-5">
                  <CheckCircle className="w-14 h-14" />
                </div>
              </div>

              <div className="bg-white p-3.5 rounded-2xl border border-indigo-100/30 shadow-sm shadow-indigo-100/10 flex flex-col justify-between h-20 relative overflow-hidden">
                <div className="w-6 h-6 rounded-lg bg-amber-50 flex items-center justify-center text-amber-500">
                  <AlertCircle className="w-3.5 h-3.5" />
                </div>
                <div className="z-10">
                  <span className="text-[9px] font-bold text-slate-400 block uppercase">待攻克错题</span>
                  <span className="text-lg font-black text-amber-600 leading-none mt-1 inline-block">{currentWeek.notMastered} <span className="text-[10px] font-semibold text-slate-400">道</span></span>
                </div>
                <div className="absolute right-0 bottom-0 translate-x-2 translate-y-2 opacity-5">
                  <AlertCircle className="w-14 h-14" />
                </div>
              </div>
            </div>

            {/* 攻克率环形图 */}
            <div className="bg-white p-4 rounded-2xl border border-indigo-100/30 shadow-sm shadow-indigo-100/10 flex items-center justify-between">
              <div className="space-y-1.5 max-w-[240px]">
                <h5 className="text-xs font-black text-slate-800 flex items-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5 text-indigo-500" />
                  <span>错题攻克效率</span>
                </h5>
                <p className="text-[10px] text-slate-400 leading-relaxed font-semibold">
                  掌握率是指通过重新练习并标记为“已掌握”的错题比例。攻克率越高，说明薄弱考点复盘效果越佳。
                </p>
              </div>
              
              <div className="relative flex items-center justify-center w-20 h-20 mr-2 flex-shrink-0">
                <svg className="w-full h-full transform -rotate-90">
                  <circle
                    cx="40"
                    cy="40"
                    r="34"
                    stroke="#f1f5f9"
                    strokeWidth="7"
                    fill="transparent"
                  />
                  <circle
                    cx="40"
                    cy="40"
                    r="34"
                    stroke="url(#weeklyProgressGrad)"
                    strokeWidth="7"
                    fill="transparent"
                    strokeDasharray="213.6"
                    strokeDashoffset={213.6 - (213.6 * masteryRate) / 100}
                    strokeLinecap="round"
                    className="transition-all duration-500"
                  />
                  <defs>
                    <linearGradient id="weeklyProgressGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#4f46e5" />
                      <stop offset="100%" stopColor="#ec4899" />
                    </linearGradient>
                  </defs>
                </svg>
                <div className="absolute flex flex-col items-center justify-center">
                  <span className="text-sm font-black text-slate-800 leading-none">{masteryRate}%</span>
                  <span className="text-[8px] font-bold text-slate-400 mt-0.5 scale-90">攻克率</span>
                </div>
              </div>
            </div>

            {/* 学科分布胶囊条 */}
            <div className="bg-white p-4 rounded-2xl border border-indigo-100/30 shadow-sm shadow-indigo-100/10">
              <h5 className="text-xs font-black text-slate-800 mb-3.5 flex items-center gap-1">
                <BookOpen className="w-3.5 h-3.5 text-indigo-500" />
                <span>错题学科分布占比</span>
              </h5>
              
              {subjectShares.length === 0 ? (
                <p className="text-[10px] text-slate-400 font-bold text-center py-2">暂无科目统计数据</p>
              ) : (
                <>
                  <div className="w-full h-3.5 bg-slate-100 rounded-full overflow-hidden flex shadow-inner">
                    {subjectShares.map((item, idx) => (
                      <div 
                        key={idx}
                        style={{ width: `${item.percentage}%` }}
                        className={`${item.color} h-full transition-all`}
                      />
                    ))}
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 mt-4">
                    {subjectShares.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${item.dot}`} />
                        <span className="text-[10px] text-slate-650 font-bold truncate max-w-[100px]">{item.name}</span>
                        <span className="text-[9px] text-slate-400 font-semibold">{item.count}道 ({item.percentage}%)</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* AI 鼓励寄语 */}
            <div className="bg-gradient-to-r from-indigo-500/10 to-purple-500/10 p-4 rounded-2xl border border-indigo-100/40 relative overflow-hidden">
              <div className="absolute top-0 right-0 translate-x-2 -translate-y-2 text-indigo-500/10 scale-150">
                <Users className="w-16 h-16" />
              </div>
              <h5 className="text-xs font-black text-indigo-700 mb-1">AI 提分诊断寄语</h5>
              <p className="text-[10px] text-slate-600 leading-relaxed font-semibold italic pl-1">
                “ {aiSuggestion} ”
              </p>
            </div>

            {/* 报告页脚 */}
            <div className="flex items-center justify-between border-t border-indigo-100/50 pt-4 mt-1">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-600/10">
                  <Zap className="w-4 h-4" />
                </div>
                <div>
                  <h6 className="text-[10px] font-black text-slate-800 leading-none">AI 智能错题 analysis 系统</h6>
                  <p className="text-[8px] text-slate-400 mt-1 scale-90 -translate-x-1 font-bold">高效梳理·突破难关</p>
                </div>
              </div>
              
              <div className="flex items-center gap-2 bg-white px-2 py-1 rounded-lg border border-slate-100 shadow-sm">
                <div className="flex flex-col text-right justify-center">
                  <span className="text-[7px] text-slate-400 leading-none scale-90 font-bold">扫码查看云错题</span>
                  <span className="text-[7px] text-indigo-600 font-black scale-90 mt-0.5">LEARNING BOOK</span>
                </div>
                <div className="w-6 h-6 border-2 border-indigo-600/30 p-0.5 rounded flex flex-wrap justify-between items-between flex-shrink-0">
                  <span className="w-2 h-2 bg-indigo-600 rounded-xs" />
                  <span className="w-2 h-2 bg-indigo-600 rounded-xs" />
                  <span className="w-2 h-2 bg-indigo-600 rounded-xs" />
                  <span className="w-1 h-1 bg-indigo-600 rounded-xs" />
                </div>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
