import React, { useState, useEffect } from 'react';
import { BookOpen, ArrowLeft, Loader2, Search, Filter, Copy, CheckCircle2 } from 'lucide-react';
import FormattedMath, { InlineContent, cleanTextForSummary } from './FormattedMath';
import { copyToClipboard } from '../lib/clipboard';

const API_PREFIX = '/api';

function getHeaders(): HeadersInit {
  const token = localStorage.getItem('errorbook_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
}

interface TeacherQuestion {
  id: string;
  userId: string;
  studentId?: string;
  kind?: string;
  isQuickTask?: boolean;
  sourceType?: 'quick_answer' | 'correct_task' | 'normal';
  originalText: string;
  subject: string;
  knowledgePoints: string[];
  errorReason: string;
  solution: string;
  createdAt: number;
  studentAnswer: string;
  errorDiagnosis: any[];
  errorAnalysis: string;
  standardAnswer?: string;
  score?: number;
  masteryStatus: string;
  teacherName: string;
  imageUrl?: string;
  quickAnswers?: { originalText: string; subject: string; standardAnswer: string; keySteps: string }[];
  errorMsg?: string;
}

// 题目类型标签（卡片/详情通用）
const SOURCE_LABEL: Record<string, { label: string; color: string }> = {
  quick_answer: { label: '⚡ 快速识别', color: 'bg-indigo-50 text-indigo-700 border border-indigo-100' },
  correct_task: { label: '📋 作业批改', color: 'bg-purple-50 text-purple-700 border border-purple-100' },
  normal: { label: '📤 普通上传', color: 'bg-slate-50 text-slate-600 border border-slate-200' }
};

// 快速答题任务状态显示
const QUICK_STATUS: Record<string, { label: string; color: string }> = {
  queued: { label: '排队识别中', color: 'bg-slate-100 text-slate-500' },
  extracting: { label: '识别中', color: 'bg-blue-50 text-blue-600' },
  generating_answer: { label: '生成答案中', color: 'bg-indigo-50 text-indigo-600' },
  completed: { label: '已识别', color: 'bg-emerald-50 text-emerald-600' },
  failed: { label: '识别失败', color: 'bg-rose-50 text-rose-600' }
};

interface ListResponse {
  total: number;
  page: number;
  limit: number;
  questions: TeacherQuestion[];
}

const SUBJECTS = ['数学', '语文', '英语', '物理', '化学', '生物', '历史', '地理', '政治'];
const PAGE_SIZE = 15;

function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function TeacherQuestionList() {
  const [questions, setQuestions] = useState<TeacherQuestion[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [subject, setSubject] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<TeacherQuestion | null>(null);
  const [copied, setCopied] = useState(false);

  const loadQuestions = async (p = page, sub = subject, kw = search) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(p));
      params.set('limit', String(PAGE_SIZE));
      if (sub !== 'all') params.set('subject', sub);
      if (kw.trim()) params.set('search', kw.trim());
      const res = await fetch(`${API_PREFIX}/jiaoxue/all-questions?${params.toString()}`, { headers: getHeaders() });
      const text = await res.text();
      const data = text ? JSON.parse(text) : {};
      if (!res.ok) throw new Error(data.error || '加载失败');
      setQuestions(data.questions || []);
      setTotal(data.total || 0);
    } catch (e: any) {
      console.error("load teacher questions failed", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQuestions(page, subject, search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, subject]);

  const handleSearch = () => {
    setPage(1);
    loadQuestions(1, subject, search);
  };

  const handleDelete = async (q: TeacherQuestion, e: React.MouseEvent) => {
    e.stopPropagation();
    const label = q.originalText ? q.originalText.slice(0, 30) : (q.isQuickTask ? '该快速答题任务' : '该题目');
    if (!window.confirm(`确定删除「${label}」吗？此操作不可恢复。`)) return;
    try {
      // 快速答题占位卡片 → 删除后台任务；正式题目 → 删除错题
      const endpoint = q.isQuickTask ? `/tasks/${q.id}` : `/questions/${q.id}`;
      const res = await fetch(`${API_PREFIX}${endpoint}`, { method: 'DELETE', headers: getHeaders() });
      const text = await res.text();
      const data = text ? JSON.parse(text) : {};
      if (!res.ok) throw new Error(data.error || '删除失败');
      // 若删除的是当前详情页的题，返回列表
      if (detail?.id === q.id) setDetail(null);
      loadQuestions();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const copyAnswer = async (text: string) => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // ===== 详情视图 =====
  if (detail) {
    return (
      <div className="space-y-5 max-w-4xl">
        <button onClick={() => setDetail(null)} className="flex items-center gap-1.5 text-slate-500 hover:text-blue-600 text-sm font-bold transition cursor-pointer">
          <ArrowLeft className="w-4 h-4" />返回题目列表
        </button>

        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          {/* 头部 */}
          <div className="p-6 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-black">{detail.subject || (detail.isQuickTask ? '快速答题' : '数学')}</span>
              {detail.sourceType && SOURCE_LABEL[detail.sourceType] && (
                <span className={`px-2.5 py-1 rounded-full text-xs font-black ${SOURCE_LABEL[detail.sourceType].color}`}>{SOURCE_LABEL[detail.sourceType].label}</span>
              )}
              {detail.isQuickTask && (
                <span className={`px-2.5 py-1 rounded-full text-xs font-black ${(QUICK_STATUS[detail.status] || QUICK_STATUS.queued).color}`}>
                  {(QUICK_STATUS[detail.status] || QUICK_STATUS.queued).label}
                </span>
              )}
              {!detail.isQuickTask && detail.masteryStatus && detail.sourceType !== 'correct_task' && (
                <span className={`px-2.5 py-1 rounded-full text-xs font-black ${detail.masteryStatus === 'mastered' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                  {detail.masteryStatus === 'mastered' ? '已掌握' : '未掌握'}
                </span>
              )}
              {detail.score !== undefined && detail.score !== null && detail.sourceType !== 'correct_task' && (
                <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-black">得分 {detail.score}</span>
              )}
            </div>

            {/* 回显原题图片 */}
            {detail.imageUrl && (
              <div className="mb-4">
                <div className="text-xs font-black text-slate-400 mb-2">{detail.isQuickTask ? '原题图片（快速答题框选区域）' : '原题图片'}</div>
                <img src={detail.imageUrl} alt="原题" className="max-w-full max-h-96 rounded-2xl border border-slate-200 object-contain bg-white" />
              </div>
            )}

            {detail.originalText ? (
              <div className="text-xl font-black text-slate-900 leading-relaxed"><FormattedMath text={detail.originalText} /></div>
            ) : (
              <p className="text-sm text-slate-400 font-medium">该快速答题任务{detail.status === 'failed' ? '识别失败' : '识别中'}，可查看上方原题图片</p>
            )}
            <div className="flex items-center gap-3 mt-4 text-xs text-slate-400 font-medium">
              <span>上传老师：{detail.teacherName}</span>
              <span>·</span>
              <span>{formatDate(detail.createdAt)}</span>
            </div>
          </div>

          <div className="p-6 space-y-5">
            {/* 快速答题结果展示 */}
            {detail.isQuickTask && detail.status === 'completed' && detail.quickAnswers && detail.quickAnswers.length > 0 && (
              <div className="space-y-3">
                {detail.quickAnswers.map((qa, i) => (
                  <div key={i} className="bg-emerald-50/60 rounded-2xl p-4 border border-emerald-100">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="text-xs font-black text-emerald-600">标准答案</div>
                      <button onClick={() => copyAnswer(qa.standardAnswer)} className="flex items-center gap-1 text-xs font-bold text-slate-400 hover:text-emerald-600 transition cursor-pointer">
                        {copied ? <><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />已复制</> : <><Copy className="w-3.5 h-3.5" />复制</>}
                      </button>
                    </div>
                    <div className="text-sm text-emerald-800 font-medium"><FormattedMath text={qa.standardAnswer || '（无）'} /></div>
                    {qa.keySteps && <div className="mt-2 text-xs font-black text-indigo-600 mb-1">关键解题步骤</div>}
                    {qa.keySteps && <div className="text-sm text-slate-700 font-medium"><FormattedMath text={qa.keySteps} /></div>}
                  </div>
                ))}
              </div>
            )}
            {/* 考点 */}
            {Array.isArray(detail.knowledgePoints) && detail.knowledgePoints.length > 0 && (
              <div>
                <div className="text-xs font-black text-slate-500 mb-2">考点 / 知识点</div>
                <div className="flex flex-wrap gap-2">
                  {detail.knowledgePoints.map((kp, i) => (
                    <span key={i} className="px-3 py-1.5 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold border border-indigo-100">{kp}</span>
                  ))}
                </div>
              </div>
            )}

            {/* 错因 */}
            {detail.errorReason && (
              <div className="bg-rose-50/60 rounded-2xl p-4 border border-rose-100">
                <div className="text-xs font-black text-rose-600 mb-1.5">错因分析</div>
                <div className="text-sm text-rose-800 font-medium"><FormattedMath text={detail.errorReason} /></div>
              </div>
            )}

            {/* 解析 */}
            {detail.solution && (
              <div className="bg-blue-50/60 rounded-2xl p-4 border border-blue-100">
                <div className="text-xs font-black text-blue-600 mb-1.5">解题解析</div>
                <div className="text-sm text-blue-900 font-medium"><FormattedMath text={detail.solution} /></div>
              </div>
            )}

            {/* 详细诊断 */}
            {Array.isArray(detail.errorDiagnosis) && detail.errorDiagnosis.length > 0 && (
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                <div className="text-xs font-black text-slate-500 mb-2">详细诊断</div>
                {detail.errorDiagnosis.map((d: any, i: number) => (
                  <div key={i} className="text-sm text-slate-700 font-medium mb-1.5">
                    <FormattedMath text={typeof d === 'string' ? d : (d.point || d.suggestion || JSON.stringify(d))} />
                  </div>
                ))}
              </div>
            )}

            {/* 深层分析 */}
            {detail.errorAnalysis && (
              <div className="bg-purple-50/60 rounded-2xl p-4 border border-purple-100">
                <div className="text-xs font-black text-purple-600 mb-1.5">学习建议</div>
                <div className="text-sm text-purple-800 font-medium"><FormattedMath text={detail.errorAnalysis} /></div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ===== 列表视图 =====
  return (
    <div className="space-y-5">
      {/* 头部 */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-600/10 flex items-center justify-center text-blue-600">
          <BookOpen className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight">题目列表</h2>
          <p className="text-xs text-slate-500 font-medium">所有老师上传的题目（{total} 道），点击查看解析详情</p>
        </div>
      </div>

      {/* 筛选栏 */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="搜索题干或知识点..."
            className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          />
          <button onClick={handleSearch} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold transition cursor-pointer">搜索</button>
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <select value={subject} onChange={e => setSubject(e.target.value)} className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/40">
            <option value="all">全部科目</option>
            {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* 题目列表 */}
      {loading ? (
        <div className="py-16 text-center"><Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-2" /><p className="text-xs text-slate-400 font-bold">加载中...</p></div>
      ) : questions.length === 0 ? (
        <div className="py-16 text-center text-slate-400 text-xs font-bold bg-white rounded-2xl border border-slate-200">暂无题目</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {questions.map(q => {
            const quickMeta = q.isQuickTask ? (QUICK_STATUS[q.status] || QUICK_STATUS.queued) : null;
            return (
              <div
                key={q.id}
                onClick={() => setDetail(q)}
                className="bg-white rounded-2xl border border-slate-200 p-5 text-left hover:border-blue-300 hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-black">{q.subject || (q.isQuickTask ? '快速答题' : '数学')}</span>
                    {q.sourceType && SOURCE_LABEL[q.sourceType] && (
                      <span className={`px-2.5 py-1 rounded-full text-xs font-black ${SOURCE_LABEL[q.sourceType].color}`}>{SOURCE_LABEL[q.sourceType].label}</span>
                    )}
                    {q.isQuickTask && quickMeta && (
                      <span className={`px-2 py-1 rounded-full text-[10px] font-black ${quickMeta.color}`}>{quickMeta.label}</span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400 font-medium">{formatDate(q.createdAt)}</span>
                </div>

                {/* 快速答题占位卡片：显示原题图片缩略图 */}
                {q.isQuickTask ? (
                  <div className="flex gap-3 items-start">
                    {q.imageUrl && (
                      <img src={q.imageUrl} alt="原题" className="w-20 h-20 rounded-xl object-cover border border-slate-100 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      {q.originalText ? (
                        <p className="text-sm font-bold text-slate-800 line-clamp-3 group-hover:text-blue-700 transition"><InlineContent text={cleanTextForSummary(q.originalText)} /></p>
                      ) : (
                        <p className="text-sm text-slate-400 font-medium line-clamp-2">快速答题任务（识别{q.status === 'failed' ? '失败' : '中'}，点击查看原题图片）</p>
                      )}
                      {q.status === 'failed' && q.errorMsg && <p className="text-[11px] text-rose-500 font-semibold mt-1 line-clamp-1">{q.errorMsg}</p>}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm font-bold text-slate-800 line-clamp-3 mb-3 group-hover:text-blue-700 transition"><InlineContent text={cleanTextForSummary(q.originalText)} /></p>
                )}

                {!q.isQuickTask && Array.isArray(q.knowledgePoints) && q.knowledgePoints.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {q.knowledgePoints.slice(0, 3).map((kp, i) => (
                      <span key={i} className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 text-[10px] font-bold">{kp}</span>
                    ))}
                    {q.knowledgePoints.length > 3 && <span className="text-[10px] text-slate-400 font-bold self-center">+{q.knowledgePoints.length - 3}</span>}
                  </div>
                )}

                <div className="flex items-center justify-between pt-3 border-t border-slate-100 mt-3">
                  <span className="text-[11px] text-slate-400 font-medium">{q.teacherName}</span>
                  <div className="flex items-center gap-2">
                    <button onClick={e => handleDelete(q, e)} className="text-xs font-bold text-rose-400 hover:text-rose-600 transition cursor-pointer">删除</button>
                    <span className="text-xs font-black text-blue-600 group-hover:translate-x-0.5 transition">查看解析 →</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-600 disabled:opacity-40 hover:bg-slate-50 transition cursor-pointer">上一页</button>
          <span className="px-4 py-2 text-sm font-bold text-slate-500">第 {page} / {totalPages} 页</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-600 disabled:opacity-40 hover:bg-slate-50 transition cursor-pointer">下一页</button>
        </div>
      )}
    </div>
  );
}
