import React, { useState, useEffect } from 'react';
import { Loader2, BookOpen, AlertCircle, TrendingUp, Calendar, Printer, XCircle, Sparkles, Tag, AlertOctagon, Lightbulb, Compass } from 'lucide-react';
import FormattedMath from './FormattedMath';

interface ReportItem {
  no: number;
  date: string;
  originalText: string;
  subject: string;
  knowledgePoints: string[];
  errorReason: string;
  errorAnalysis: string;
  standardAnswer?: string | null;
  solution?: string;
  imageUrl?: string | null;
}

interface StudentReport {
  username: string;
  realName: string;
  grade: string | null;
  total: number;
  items: ReportItem[];
  weakPoints: { name: string; count: number }[];
}

interface ReportData {
  reportType: string;
  range: { start: string; end: string };
  generatedAt: number;
  reports: StudentReport[];
}

const REPORT_TYPE_LABEL: Record<string, string> = {
  daily: '今日学情日报',
  weekly: '本周学情周报',
  monthly: '本月学情月报'
};

// 浅色 emoji + 文字 字段标签
const FieldLabel = ({ icon, children, color = 'slate' }: { icon: string; children: React.ReactNode; color?: 'slate' | 'rose' | 'indigo' | 'blue' | 'purple' | 'amber' }) => {
  const colorMap: Record<string, string> = {
    slate: 'text-slate-500',
    rose: 'text-rose-500',
    indigo: 'text-indigo-500',
    blue: 'text-blue-500',
    purple: 'text-purple-500',
    amber: 'text-amber-500'
  };
  return (
    <span className={`text-xs font-bold flex items-center gap-1 ${colorMap[color]}`}>
      <span className="text-sm">{icon}</span>
      <span>{children}</span>
    </span>
  );
};

// 学生头像（首字符）
const StudentAvatar = ({ name }: { name: string }) => {
  const initial = name ? name.slice(0, 1) : '?';
  // 固定一个柔和的渐变色
  return (
    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-orange-300 to-pink-400 text-white flex items-center justify-center text-lg font-black shadow-sm shrink-0">
      {initial}
    </div>
  );
};

// 公式/标签胶囊（浅灰底圆角）
const MathChip = ({ text }: { text: string }) => (
  <span className="inline-block px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 text-sm font-medium">
    <FormattedMath text={text} />
  </span>
);

export default function ReportView({ token }: { token: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reportType, setReportType] = useState('');
  const [data, setData] = useState<ReportData | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/report/${token}`);
        const text = await res.text();
        const json = text ? JSON.parse(text) : {};
        if (!res.ok) throw new Error(json.error || '加载报表失败');
        setReportType(json.reportType);
        setData(json.data);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const handlePrint = () => window.print();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#faf8f3] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-amber-600 mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-500">正在加载学情报表...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#faf8f3] flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xl max-w-md w-full p-8 text-center">
          <XCircle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
          <h2 className="text-lg font-black text-slate-900 mb-2">无法查看报表</h2>
          <p className="text-sm text-slate-500 font-medium mb-6">{error}</p>
          <a href="/" className="inline-block px-6 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-sm font-bold transition">返回首页</a>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const totalQuestions = data.reports.reduce((s, r) => s + r.total, 0);

  return (
    <div className="min-h-screen bg-[#faf8f3] py-8 px-4 print:bg-white print:py-0">
      <div className="max-w-4xl mx-auto space-y-5">
        {/* 打印按钮 */}
        <div className="flex justify-end print:hidden">
          <button onClick={handlePrint} className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-sm font-bold flex items-center gap-1.5 transition cursor-pointer">
            <Printer className="w-4 h-4" />打印报表
          </button>
        </div>

        {/* 报表大标题 */}
        <div className="text-center py-6">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-100 text-amber-700 text-xs font-black mb-3">
            <Sparkles className="w-3.5 h-3.5" />AI 智能学情分析
          </div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">{REPORT_TYPE_LABEL[reportType] || '学情报表'}</h1>
          <p className="text-xs text-slate-500 font-bold mt-2 flex items-center justify-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" />
            {data.range.start.slice(0, 16)} ~ {data.range.end.slice(0, 16)}
          </p>
        </div>

        {/* 总体概览（米色卡片） */}
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-3xl border border-amber-100 p-5 shadow-sm">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-3xl font-black text-amber-700">{data.reports.length}</div>
              <div className="text-xs font-bold text-amber-600 mt-1">覆盖学生</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-black text-orange-700">{totalQuestions}</div>
              <div className="text-xs font-bold text-orange-600 mt-1">错题总数</div>
            </div>
            <div className="text-center col-span-2 md:col-span-1">
              <div className="text-3xl font-black text-rose-700">{data.reports.reduce((s, r) => s + r.weakPoints.length, 0)}</div>
              <div className="text-xs font-bold text-rose-600 mt-1">欠缺考点</div>
            </div>
          </div>
        </div>

        {/* 各学生报告 */}
        {data.reports.map((student) => (
          <div key={student.username} className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            {/* 学生信息条 */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3 flex-wrap bg-gradient-to-r from-slate-50 to-white">
              <StudentAvatar name={student.realName} />
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-black text-slate-900">{student.realName}</h2>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  {student.grade && <span className="inline-block mr-2 px-2 py-0.5 rounded bg-blue-50 text-blue-600 text-[10px] font-bold">{student.grade}</span>}
                  本次错题 {student.total} 道
                </p>
              </div>
              {student.weakPoints.length > 0 && (
                <div className="flex flex-wrap gap-1.5 max-w-[420px] justify-end">
                  <span className="text-[10px] font-black text-amber-600 self-center mr-1">欠缺知识点</span>
                  {student.weakPoints.slice(0, 5).map((wp, i) => {
                    const colorPalette = ['bg-rose-50 text-rose-600 border-rose-100', 'bg-amber-50 text-amber-700 border-amber-100', 'bg-indigo-50 text-indigo-600 border-indigo-100', 'bg-emerald-50 text-emerald-600 border-emerald-100', 'bg-purple-50 text-purple-600 border-purple-100'];
                    return (
                      <span key={i} className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${colorPalette[i % colorPalette.length]}`}>
                        {wp.name}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 各题展开式卡片 */}
            {student.items.length === 0 ? (
              <div className="py-12 text-center">
                <AlertCircle className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-sm text-slate-400 font-bold">该学生在统计周期内暂无错题数据</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {student.items.map(item => (
                  <div key={item.no} className="px-6 py-5 hover:bg-slate-50/50 transition">
                    {/* 题目标题 */}
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-base font-black text-slate-900">第 · {item.no} · 题</span>
                      {item.subject && (
                        <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[10px] font-black border border-blue-100">
                          {item.subject}
                        </span>
                      )}
                    </div>

                    {/* 原题图片 */}
                    {item.imageUrl && (
                      <div className="mb-3">
                        <div className="text-xs font-black text-slate-400 mb-1.5">原题图片</div>
                        <img src={item.imageUrl} alt={`原题${item.no}`} className="max-w-full max-h-72 rounded-2xl border border-slate-200 object-contain bg-white" />
                      </div>
                    )}

                    {/* 字段：日期 */}
                    <div className="mb-2.5">
                      <FieldLabel icon="📅">日期</FieldLabel>
                      <div className="mt-1.5 ml-1 text-sm font-bold text-slate-700">{item.date}</div>
                    </div>

                    {/* 字段：错题 */}
                    <div className="mb-2.5">
                      <FieldLabel icon="📝">错题</FieldLabel>
                      <div className="mt-1.5 ml-1 text-[15px] leading-relaxed text-slate-800 font-medium">
                        <FormattedMath text={item.originalText || ''} />
                      </div>
                    </div>

                    {/* 字段：考点 */}
                    {Array.isArray(item.knowledgePoints) && item.knowledgePoints.length > 0 && (
                      <div className="mb-2.5">
                        <FieldLabel icon="🎯" color="rose">考点</FieldLabel>
                        <div className="mt-1.5 ml-1 flex flex-wrap gap-1.5">
                          {item.knowledgePoints.map((kp: string, i: number) => {
                            const colorPalette = [
                              'bg-rose-50 text-rose-700 border-rose-200',
                              'bg-amber-50 text-amber-700 border-amber-200',
                              'bg-indigo-50 text-indigo-700 border-indigo-200',
                              'bg-emerald-50 text-emerald-700 border-emerald-200',
                              'bg-sky-50 text-sky-700 border-sky-200'
                            ];
                            return (
                              <span key={i} className={`px-2.5 py-1 rounded-full text-xs font-bold border ${colorPalette[i % colorPalette.length]}`}>
                                {kp}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* 字段：错因 */}
                    {item.errorReason && (
                      <div className="mb-2.5">
                        <FieldLabel icon="❌" color="rose">错因</FieldLabel>
                        <div className="mt-1.5 ml-1 inline-block px-3 py-1.5 rounded-lg bg-rose-50 border border-rose-100 text-sm text-rose-800 font-medium">
                          <FormattedMath text={item.errorReason} />
                        </div>
                      </div>
                    )}

                    {/* 字段：解析（分步骤） */}
                    {item.solution && (
                      <div className="mb-2.5">
                        <FieldLabel icon="📐" color="blue">解析</FieldLabel>
                        <div className="mt-1.5 ml-1 text-sm text-slate-700 leading-relaxed">
                          <FormattedMath text={item.solution} />
                        </div>
                      </div>
                    )}

                    {/* 字段：建议 */}
                    {(item.errorAnalysis || (!item.solution && !item.errorAnalysis)) && (
                      <div>
                        <FieldLabel icon="💡" color="amber">建议</FieldLabel>
                        <div className="mt-1.5 ml-1 text-sm text-slate-700 leading-relaxed">
                          <FormattedMath text={item.errorAnalysis || '请参考上方解析与诊断' } />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* 报表页脚 */}
        <div className="text-center py-6 print:hidden">
          <div className="inline-flex items-center gap-1.5 text-xs text-slate-500 font-bold">
            <BookOpen className="w-3.5 h-3.5" />
            AI 智能错题本 · 学情报表 · 生成于 {new Date(data.generatedAt).toLocaleString()}
          </div>
        </div>
      </div>
    </div>
  );
}
