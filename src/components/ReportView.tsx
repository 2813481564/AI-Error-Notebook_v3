import React, { useState, useEffect } from 'react';
import { Loader2, BookOpen, AlertCircle, Calendar, Printer, XCircle, Sparkles } from 'lucide-react';
import FormattedMath from './FormattedMath';
import { reportPathPrefix } from '../lib/reportPath';

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

interface WorksheetItem {
  no: number;
  originalText: string;
  subject: string;
  knowledgePoints: string[];
  standardAnswer?: string;
  solution?: string;
}

interface ReportData {
  reportType: string;
  range: { start: string; end: string };
  generatedAt: number;
  reports: StudentReport[];
  workSheets?: Record<string, WorksheetItem[]>;
}

const REPORT_TYPE_LABEL: Record<string, string> = {
  daily: '作业日报',
  weekly: '作业周报',
  monthly: '作业月报'
};

// 工具函数：把日期字符串格式化为 "2026 年 7 月 22 日 星期三"
function formatChineseDate(input: string | number): string {
  const d = new Date(input);
  if (isNaN(d.getTime())) return String(input);
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const weekMap = ['日', '一', '二', '三', '四', '五', '六'];
  const w = weekMap[d.getDay()];
  return `${y} 年 ${m} 月 ${day} 日 星期${w}`;
}

// 工具函数：把 ISO/可解析日期格式化为 2026-07-22
function formatShortDate(input: string | number): string {
  const d = new Date(input);
  if (isNaN(d.getTime())) return String(input);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// 文档字段标签：与内容同字号，橙黑色加粗，冒号结尾
const DocField = ({ label, color = '#d97706', size = '16px' }: { label: string; color?: string; size?: string }) => (
  <span style={{ color, fontWeight: 700, fontSize: size }} className="whitespace-nowrap">
    {label}：
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
        const res = await fetch(`${reportPathPrefix}/api/report/${token}`);
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
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-blue-700 mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-500">正在加载学情报表...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xl max-w-md w-full p-8 text-center">
          <XCircle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
          <h2 className="text-lg font-black text-slate-900 mb-2">无法查看报表</h2>
          <p className="text-sm text-slate-500 font-medium mb-6">{error}</p>
          <a href={`${reportPathPrefix}/`} className="inline-block px-6 py-2.5 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-sm font-bold transition">返回首页</a>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const totalQuestions = data.reports.reduce((s, r) => s + r.total, 0);

  // 标题主日期：取范围 start 的日期
  const titleDate = data.range?.start ? formatChineseDate(data.range.start) : '';

  return (
    <div className="min-h-screen bg-white py-8 px-4 print:bg-white print:py-0">
      <div className="max-w-4xl mx-auto">
        {/* 顶部操作条（不打印） */}
        <div className="flex justify-end mb-5 print:hidden">
          <button onClick={handlePrint} className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-sm font-bold flex items-center gap-1.5 transition cursor-pointer">
            <Printer className="w-4 h-4" />打印报表
          </button>
        </div>

        {/* ===== 文档主体（带左侧深蓝装饰条） ===== */}
        <div
          className="relative bg-white mx-auto"
          style={{
            border: '1px solid #e2e8f0',
            boxShadow: '0 10px 30px -10px rgba(30, 41, 59, 0.15)',
            maxWidth: 900
          }}
        >
          {/* 贯穿整页的左侧深蓝装饰条 */}
          <div
            className="absolute top-0 bottom-0 left-0 hidden md:block"
            style={{ width: 22, background: '#1e3a5f' }}
          />
          {/* 主体内容区 */}
          <div className="px-6 md:px-16 py-10 md:py-14">
            {/* ===== 文档大标题块：深蓝底白字 ===== */}
            <div
              className="mx-auto mb-10 text-center"
              style={{
                background: '#1e3a5f',
                color: '#ffffff',
                padding: '36px 24px 28px 24px',
                maxWidth: 640
              }}
            >
              <h1
                className="font-black tracking-widest"
                style={{
                  fontSize: 44,
                  letterSpacing: '0.35em',
                  fontFamily: 'serif',
                  marginBottom: 18
                }}
              >
                作业日报
              </h1>
              <p
                className="text-base font-medium"
                style={{ color: '#cfd8e3', letterSpacing: '0.15em' }}
              >
                {titleDate}
              </p>
            </div>

            {/* ===== 概览条（横排小字） ===== */}
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-slate-600 mb-10 pb-6 border-b border-dashed border-slate-200">
              <span>覆盖学生 <span className="font-black text-slate-800">{data.reports.length}</span> 人</span>
              <span className="text-slate-300">|</span>
              <span>错题总数 <span className="font-black text-slate-800">{totalQuestions}</span> 道</span>
              <span className="text-slate-300">|</span>
              <span>周期 <span className="font-bold text-slate-700">{formatShortDate(data.range.start)} ~ {formatShortDate(data.range.end)}</span></span>
            </div>

            {/* ===== 各学生报告 ===== */}
            {data.reports.map((student) => (
              <div key={student.username} className="mb-12 last:mb-0">
                {/* 学生名行 */}
                <div className="mb-5 flex items-baseline gap-3 flex-wrap">
                  <h2
                    className="font-black"
                    style={{ color: '#1e3a5f', fontSize: 22, fontFamily: 'serif' }}
                  >
                    {student.realName}学情报告
                  </h2>
                  {student.grade && (
                    <span className="text-xs text-slate-500 font-bold">（{student.grade}）</span>
                  )}
                  <span className="text-xs text-slate-500">本次错题 <span className="font-black text-rose-600">{student.total}</span> 道</span>
                </div>

                {student.items.length === 0 ? (
                  <div className="py-10 text-center text-slate-400 text-sm">
                    <AlertCircle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    该生在统计周期内暂无错题数据
                  </div>
                ) : (
                  <div className="space-y-9">
                    {student.items.map((item) => (
                      <div key={item.no} className="leading-relaxed">
                        {/* 题目标题：第·1·题 */}
                        <h3
                          className="font-black mb-3"
                          style={{ color: '#d97706', fontSize: 18 }}
                        >
                          第{item.no}题
                          {item.subject && (
                            <span
                              className="ml-2 text-xs font-bold"
                              style={{ color: '#64748b' }}
                            >
                              （{item.subject}）
                            </span>
                          )}
                        </h3>

                        {/* 字段：日期（标签+内容同行） */}
                        <div className="flex items-start gap-2 mb-2 ml-3">
                          <DocField label="日期" size="16px" />
                          <span className="text-[16px] text-slate-700 font-medium">
                            {item.date ? formatShortDate(item.date) : '-'}
                          </span>
                        </div>

                        {/* 字段：错题（标签+内容同行，不换行） */}
                        <div className="flex items-start gap-2 mb-2 ml-3">
                          <DocField label="错题" color="#c2410c" size="16px" />
                          <span className="text-[16px] text-slate-800">
                            <FormattedMath text={item.originalText || ''} />
                          </span>
                        </div>

                        {/* 字段：考点（标签+内容同行，不换行） */}
                        {Array.isArray(item.knowledgePoints) && item.knowledgePoints.length > 0 && (
                          <div className="flex items-start gap-2 mb-2 ml-3">
                            <DocField label="考点" color="#c2410c" size="16px" />
                            <span className="text-[16px] text-slate-700">
                              <FormattedMath text={item.knowledgePoints.join('、')} />
                            </span>
                          </div>
                        )}

                        {/* 字段：错因（标签+内容同行，不换行） */}
                        {item.errorReason && (
                          <div className="flex items-start gap-2 mb-2 ml-3">
                            <DocField label="错因" color="#c2410c" size="16px" />
                            <span className="text-[16px] text-slate-700">
                              <FormattedMath text={item.errorReason} />
                            </span>
                          </div>
                        )}

                        {/* 字段：建议（用单次 FormattedMath 整体渲染，避免按句拆分破坏 Markdown 结构） */}
                        {(item.errorAnalysis || (!item.solution && !item.errorAnalysis)) && (
                          <div className="flex items-start gap-2 mb-2 ml-3">
                            <DocField label="建议" color="#c2410c" size="16px" />
                            <div className="flex-1 min-w-0 text-[16px] text-slate-700 leading-relaxed [&_h1]:text-[16px] [&_h1]:font-bold [&_h1]:mt-2 [&_h2]:text-[16px] [&_h2]:font-bold [&_h2]:mt-1 [&_h3]:text-[14px] [&_h3]:font-bold [&_blockquote]:my-1 [&_blockquote]:py-1 [&_blockquote]:px-2 [&_blockquote]:text-[15px] [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5">
                              <FormattedMath text={item.errorAnalysis || '请参考解析与诊断'} smallHeadings />
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* 欠缺知识点（放在该学生末尾） */}
                {student.weakPoints.length > 0 && (
                  <div className="mt-6 ml-3 pt-4 border-t border-dashed border-slate-200 flex items-start gap-2">
                    <DocField label="欠缺考点" size="16px" />
                    <span className="text-[16px] text-slate-700">
                      <FormattedMath text={student.weakPoints.map(w => w.name).join('、')} />
                    </span>
                  </div>
                )}
              </div>
            ))}

            {/* ===== 举一反三试卷入口 ===== */}
            {data.workSheets && Object.values(data.workSheets).some(ws => Array.isArray(ws) && ws.length > 0) && (
              <div className="mt-12 pt-6 border-t border-slate-200 flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-700">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-black text-slate-900">本报表的举一反三试卷</div>
                    <p className="text-xs text-slate-500 font-medium">根据本报表错题生成巩固变式题</p>
                  </div>
                </div>
                <a
                  href={`${reportPathPrefix}/report/${token}/variations`}
                  className="px-5 py-2.5 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-sm font-bold flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />进入举一反三
                </a>
              </div>
            )}

            {/* ===== 报表页脚 ===== */}
            <div className="mt-12 pt-6 border-t border-slate-200 text-center text-xs text-slate-400 print:hidden">
              <span className="inline-flex items-center gap-1.5 font-bold">
                <BookOpen className="w-3.5 h-3.5" />
                AI 智能错题本学情报表 生成于 {new Date(data.generatedAt).toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
