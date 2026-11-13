import React, { useState, useEffect } from 'react';
import { Loader2, BookOpen, Sparkles, XCircle, CheckCircle2, Clock, Printer, Zap, FileBarChart, Eye, X, Share2 } from 'lucide-react';
import FormattedMath from './FormattedMath';
import GeometryRenderer from './GeometryRenderer';
import { reportPathPrefix } from '../lib/reportPath';
import { copyToClipboard } from '../lib/clipboard';
import type { GeometryData } from '../types/geometry';

const API_PREFIX = `${reportPathPrefix}/api`;

function getHeaders(): HeadersInit {
  const token = localStorage.getItem('errorbook_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
}

interface VariationTask {
  id: string;
  status: string;
  progress: number;
  errorMsg?: string;
  variation?: {
    originalText?: string;
    subject?: string;
    knowledgePoints?: string[];
    standardAnswer?: string;
    solution?: string;
    questionText?: string;
    geometry?: GeometryData | null;
  } | null;
}

interface ReportItem {
  no: number;
  originalText: string;
  subject: string;
  knowledgePoints: string[];
  date?: string;
  imageUrl?: string | null;
  errorReason?: string | null;
  errorAnalysis?: string | null;
  solution?: string | null;
  standardAnswer?: string | null;
  variationTasks?: VariationTask[];
}

interface StudentReport {
  username: string;
  realName: string;
  grade: string | null;
  items: ReportItem[];
}

const TASK_STATUS: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  queued: { label: '排队中', color: 'bg-slate-100 text-slate-500', icon: <Clock className="w-3.5 h-3.5" /> },
  generating_variation: { label: '生成中', color: 'bg-blue-50 text-blue-600', icon: <Loader2 className="w-3.5 h-3.5 animate-spin" /> },
  completed: { label: '已完成', color: 'bg-emerald-50 text-emerald-600', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  failed: { label: '失败', color: 'bg-rose-50 text-rose-600', icon: <XCircle className="w-3.5 h-3.5" /> }
};

export default function ReportVariations({ token }: { token: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{ reportType: string; range: any; generatedAt: number; reports: StudentReport[] } | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [variantMode, setVariantMode] = useState<'同考点换壳' | '条件升级' | '逆向陷阱'>('同考点换壳');
  const [generating, setGenerating] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [originalModal, setOriginalModal] = useState<{ student: StudentReport; item: ReportItem } | null>(null);
  const [copied, setCopied] = useState(false);

  // 是否具备编辑权限：仅教务老师（或管理员）可发起/编辑举一反三；
  // 其余情况（未登录、学生账号等）一律为只读分享视图，只能查看已生成的举一反三内容
  const hasEditAccess = !!localStorage.getItem('errorbook_token') &&
    (localStorage.getItem('errorbook_role') === 'admin' || localStorage.getItem('errorbook_accountType') === 'jiaowu');
  const isShareView = !hasEditAccess;

  // silent=true 时静默更新数据（轮询/后台刷新），不切换 loading 全屏，避免打断浏览导致页面置顶
  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`${API_PREFIX}/report/${token}/variations`);
      const text = await res.text();
      const json = text ? JSON.parse(text) : {};
      if (!res.ok) throw new Error(json.error || '加载失败');
      setData(json);
    } catch (e: any) {
      if (!silent) setError(e.message);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // 轮询任务状态（静默更新，避免整页 loading 导致滚动位置丢失）
    const timer = setInterval(() => load(true), 5000);
    return () => clearInterval(timer);
  }, [token]);

  const allItems: { studentUsername: string; studentName: string; item: ReportItem; student: StudentReport }[] = [];
  (data?.reports || []).forEach(st => {
    (st.items || []).forEach(item => {
      allItems.push({ studentUsername: st.username, studentName: st.realName || st.username, item, student: st });
    });
  });

  const selectedCount = Object.values(selected).filter(Boolean).length;

  const toggleSelect = (key: string) => {
    setSelected(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleGenerate = async () => {
    const selectedKeys = Object.entries(selected).filter(([, v]) => v).map(([k]) => k);
    if (selectedKeys.length === 0) { alert('请先勾选要举一反三的题目'); return; }
    setGenerating(true);
    setMsg(null);
    try {
      // 构造勾选题目数据
      const questions = selectedKeys.map(key => {
        const found = allItems.find(x => `${x.studentUsername}_${x.item.no}` === key);
        return found ? {
          studentUsername: found.studentUsername,
          no: found.item.no,
          originalText: found.item.originalText,
          subject: found.item.subject,
          knowledgePoints: found.item.knowledgePoints
        } : null;
      }).filter(Boolean);

      const res = await fetch(`${API_PREFIX}/report/${token}/variations`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ questions, variantMode })
      });
      const rj = await res.json();
      if (!res.ok) throw new Error(rj.error || '创建失败');
      setMsg({ type: 'success', text: rj.message || `已创建 ${rj.tasks?.length || 0} 个举一反三任务` });
      setSelected({});
      load(true);
    } catch (e: any) {
      setMsg({ type: 'error', text: e.message });
    } finally {
      setGenerating(false);
    }
  };

  const handlePrint = () => window.print();

  const handleShare = async () => {
    const ok = await copyToClipboard(window.location.href);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } else {
      alert('复制失败，请手动复制');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#faf8f3] flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-amber-600 mx-auto mb-3" /><p className="text-sm font-bold text-slate-500">加载中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#faf8f3] flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xl max-w-md w-full p-8 text-center">
          <XCircle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
          <h2 className="text-lg font-black text-slate-900 mb-2">无法访问</h2>
          <p className="text-sm text-slate-500 font-medium mb-6">{error}</p>
          <a href={`${reportPathPrefix}/`} className="inline-block px-6 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-sm font-bold transition">返回</a>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="min-h-screen bg-[#faf8f3] py-8 px-4 print:bg-white print:py-0">
      <div className="max-w-4xl mx-auto space-y-5">
        {/* 顶部 */}
        <div className="flex justify-end gap-2 print:hidden">
          {hasEditAccess && (
            <button onClick={handleShare} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold flex items-center gap-1.5 transition cursor-pointer">
              <Share2 className="w-4 h-4" />{copied ? '已复制' : '分享'}
            </button>
          )}
          <button onClick={handlePrint} className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-sm font-bold flex items-center gap-1.5 transition cursor-pointer"><Printer className="w-4 h-4" />打印</button>
        </div>

        <div className="text-center py-4">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-100 text-amber-700 text-xs font-black mb-3"><Sparkles className="w-3.5 h-3.5" />举一反三 · 巩固练习</div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">错题举一反三</h1>
          <p className="text-xs text-slate-500 font-bold mt-2">{isShareView ? '完成以下变式题，巩固欠缺知识点' : '勾选错题生成同类型变式题，巩固欠缺知识点'}</p>
        </div>

        {/* 提示 */}
        {isShareView && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-xs font-semibold text-amber-700">
            这是老师为你整理的举一反三巩固练习，请完成以下变式题。
          </div>
        )}
        {msg && (
          <div className={`px-4 py-3 rounded-2xl text-sm font-semibold ${msg.type === 'success' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-rose-50 text-rose-600 border border-rose-100'}`}>{msg.text}</div>
        )}

        {/* 错题列表 */}
        {isShareView && allItems.length > 0 && !allItems.some(({ item }) => (item.variationTasks || []).some(t => t.status === 'completed' && t.variation)) ? (
          /* 分享只读模式：尚无任何已生成的举一反三内容 */
          <div className="py-16 text-center bg-white rounded-3xl border border-slate-200">
            <Sparkles className="w-10 h-10 mx-auto mb-3 text-amber-400" />
            <p className="text-sm font-black text-slate-700">老师还没有生成举一反三内容</p>
            <p className="text-xs text-slate-400 font-medium mt-1">请等待老师生成后再来查看</p>
          </div>
        ) : allItems.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-xs font-bold bg-white rounded-3xl border border-slate-200">该报表暂无错题</div>
        ) : (
          <div className="space-y-4">
            {allItems.map(({ studentUsername, studentName, item, student }) => {
              const key = `${studentUsername}_${item.no}`;
              const tasks = item.variationTasks || [];
              const latestTask = tasks[tasks.length - 1];
              const isSelected = !!selected[key];
              // 分享只读模式：仅展示已生成（completed 且有结果）的变式题，未生成的题不展示；
              // 编辑模式：保留所有题以便教务老师勾选原题去生成举一反三
              const visibleTasks = isShareView ? tasks.filter(t => t.status === 'completed' && t.variation) : tasks;
              if (isShareView && visibleTasks.length === 0) return null;
              return (
                <div key={key} className={`bg-white rounded-3xl border shadow-sm overflow-hidden ${isSelected ? 'border-amber-400 ring-1 ring-amber-200' : 'border-slate-200'}`}>
                  {/* 题目标题行 */}
                  <div className="px-6 py-3 border-b border-slate-100 flex items-center gap-3">
                    {hasEditAccess ? (
                      <label className="flex items-center gap-3 cursor-pointer flex-1 min-w-0">
                        <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(key)} className="w-4 h-4 accent-amber-600 shrink-0" />
                        <span className="text-sm font-black text-slate-900 shrink-0">第 · {item.no} · 题</span>
                        {item.subject && <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[10px] font-black shrink-0">{item.subject}</span>}
                        <span className="text-[10px] text-slate-400 font-medium truncate">{studentName}</span>
                      </label>
                    ) : (
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <span className="text-sm font-black text-slate-900 shrink-0">第 · {item.no} · 题</span>
                        {item.subject && <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[10px] font-black shrink-0">{item.subject}</span>}
                        <span className="text-[10px] text-slate-400 font-medium truncate">{studentName}</span>
                      </div>
                    )}
                    {hasEditAccess && latestTask && TASK_STATUS[latestTask.status] && (
                      <span className={`px-2 py-1 rounded-full text-[10px] font-black flex items-center gap-1 shrink-0 ${TASK_STATUS[latestTask.status].color}`}>
                        {TASK_STATUS[latestTask.status].icon}{TASK_STATUS[latestTask.status].label}
                      </span>
                    )}
                    {hasEditAccess && latestTask && latestTask.status === 'completed' && (
                      <button
                        type="button"
                        onClick={() => setOriginalModal({ student, item })}
                        className="px-2.5 py-1 rounded-lg text-[10px] font-black bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 flex items-center gap-1 shrink-0 transition-colors"
                        title="查看该题的举一反三对应的原题详情"
                      >
                        <Eye className="w-3.5 h-3.5" />查看原题
                      </button>
                    )}
                  </div>

                  {/* 题干（仅教务编辑模式显示；分享给学生时不显示原题。打印时不显示原题目） */}
                  {hasEditAccess && (
                    <div className="px-6 py-4 print:hidden">
                      <div className="text-sm text-slate-800 font-medium leading-relaxed"><FormattedMath text={item.originalText || ''} /></div>
                      {Array.isArray(item.knowledgePoints) && item.knowledgePoints.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {item.knowledgePoints.map((kp: string, i: number) => (
                            <span key={i} className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 text-[10px] font-bold border border-indigo-100">{kp}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 举一反三结果 */}
                  {visibleTasks.length > 0 && (
                    <div className="px-6 pb-5">
                      {visibleTasks.map(t => {
                        const meta = TASK_STATUS[t.status] || TASK_STATUS.queued;
                        return (
                          <div key={t.id} className="bg-amber-50/60 rounded-2xl border border-amber-100 p-4 mt-2">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-black text-amber-700 flex items-center gap-1.5"><Zap className="w-3.5 h-3.5" />变式题</span>
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black flex items-center gap-1 ${meta.color}`}>{meta.icon}{meta.label}</span>
                            </div>
                            {t.status === 'failed' && <p className="text-xs text-rose-600 font-semibold">{t.errorMsg || '生成失败'}</p>}
                            {!['completed', 'failed'].includes(t.status) && (
                              <div className="w-full h-1.5 bg-slate-200 rounded-full mt-1 overflow-hidden">
                                <div className="h-full bg-amber-600 rounded-full transition-all" style={{ width: `${Math.max(t.progress || 10, 10)}%` }} />
                              </div>
                            )}
                            {t.status === 'completed' && t.variation && (
                              <div className="space-y-2">
                                {t.variation.geometry && t.variation.geometry.type !== 'none' && (
                                  <div className="py-2 bg-white rounded-xl p-2 border border-slate-100">
                                    <GeometryRenderer geometry={t.variation.geometry} />
                                  </div>
                                )}
                                <div className="text-sm font-bold text-slate-800 leading-relaxed"><FormattedMath text={t.variation.questionText || ''} /></div>
                                {Array.isArray(t.variation.knowledgePoints) && t.variation.knowledgePoints.length > 0 && (
                                  <div className="flex flex-wrap gap-1.5">
                                    {t.variation.knowledgePoints.map((kp: string, i: number) => (
                                      <span key={i} className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 text-[10px] font-bold border border-indigo-100">{kp}</span>
                                    ))}
                                  </div>
                                )}
                                {t.variation.standardAnswer && <div className="text-xs text-emerald-700"><span className="font-black">答案：</span><FormattedMath text={t.variation.standardAnswer} /></div>}
                                {t.variation.solution && <div className="text-xs text-slate-600 print:hidden"><span className="font-black text-slate-500">解析：</span><FormattedMath text={t.variation.solution} /></div>}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* 难度选择 + 生成按钮（仅教务/管理员可见） */}
        {hasEditAccess && allItems.length > 0 && (
          <div className="sticky bottom-4 bg-white/90 backdrop-blur rounded-2xl border border-slate-200 shadow-lg p-3 flex items-center gap-3 flex-wrap justify-center print:hidden">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-slate-500">变式难度</span>
              <div className="flex gap-1.5">
                {(['同考点换壳', '条件升级', '逆向陷阱'] as const).map(mode => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setVariantMode(mode)}
                    className={`px-3 py-1.5 text-[11px] font-bold rounded-xl border transition-all ${variantMode === mode
                      ? 'bg-amber-600 border-amber-600 text-white shadow-sm'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={handleGenerate}
              disabled={generating || selectedCount === 0}
              className="px-8 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-full text-sm font-black shadow-md shadow-amber-600/20 flex items-center gap-2 disabled:opacity-50 transition cursor-pointer"
            >
              {generating ? <><Loader2 className="w-4 h-4 animate-spin" />创建中...</> : <><Sparkles className="w-4 h-4" />生成所选 {selectedCount > 0 ? `(${selectedCount}道)` : ''} 的举一反三</>}
            </button>
          </div>
        )}
      </div>

      {/* 查看原题弹窗 */}
      {originalModal && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setOriginalModal(null)}
        >
          <div
            className="bg-white rounded-3xl w-full max-w-3xl max-h-[88vh] overflow-hidden flex flex-col shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            {/* 弹窗头部 */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-7 h-7 bg-indigo-100 text-indigo-700 rounded-lg flex items-center justify-center text-xs font-black shrink-0"><BookOpen className="w-3.5 h-3.5" /></span>
                <h3 className="text-base font-black text-slate-900 truncate">举一反三对应原题详情</h3>
              </div>
              <button
                type="button"
                onClick={() => setOriginalModal(null)}
                className="w-8 h-8 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700 transition shrink-0"
                aria-label="关闭"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 弹窗主体 */}
            <div className="px-6 py-5 overflow-y-auto space-y-5">
              {/* 元信息 */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-black">第 · {originalModal.item.no} · 题</span>
                {originalModal.item.subject && <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-bold">{originalModal.item.subject}</span>}
                <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold">{originalModal.student.realName || originalModal.student.username}</span>
                {originalModal.item.date && <span className="px-2 py-0.5 rounded-full bg-slate-50 text-slate-500 font-bold">{originalModal.item.date}</span>}
                {originalModal.item.errorReason && (
                  <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 font-bold">{originalModal.item.errorReason}</span>
                )}
              </div>

              {/* 原图（如有） */}
              {originalModal.item.imageUrl && (
                <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3 flex justify-center">
                  <img src={originalModal.item.imageUrl} alt="原题图" className="max-h-[300px] w-auto object-contain rounded-lg" />
                </div>
              )}

              {/* 题干 */}
              <div className="bg-slate-50/50 border border-slate-100 rounded-2xl p-4">
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">原题题干</div>
                <div className="text-sm text-slate-800 font-medium leading-relaxed">
                  <FormattedMath text={originalModal.item.originalText || ''} />
                </div>
                {Array.isArray(originalModal.item.knowledgePoints) && originalModal.item.knowledgePoints.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {originalModal.item.knowledgePoints.map((kp: string, i: number) => (
                      <span key={i} className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 text-[10px] font-bold border border-indigo-100">{kp}</span>
                    ))}
                  </div>
                )}
              </div>

              {/* 标准答案 */}
              {originalModal.item.standardAnswer && (
                <div className="bg-emerald-50/40 border border-emerald-100 rounded-2xl p-4">
                  <div className="text-[10px] font-black text-emerald-600 uppercase tracking-wider mb-2">原题标准答案</div>
                  <div className="text-sm text-emerald-800 leading-relaxed">
                    <FormattedMath text={originalModal.item.standardAnswer} />
                  </div>
                </div>
              )}

              {/* 解析 */}
              {originalModal.item.solution && (
                <div className="bg-blue-50/40 border border-blue-100 rounded-2xl p-4">
                  <div className="text-[10px] font-black text-blue-600 uppercase tracking-wider mb-2">原题解题过程</div>
                  <div className="text-sm text-slate-700 leading-relaxed">
                    <FormattedMath text={originalModal.item.solution} />
                  </div>
                </div>
              )}

              {/* 错因分析 */}
              {originalModal.item.errorAnalysis && (
                <div className="bg-rose-50/40 border border-rose-100 rounded-2xl p-4">
                  <div className="text-[10px] font-black text-rose-600 uppercase tracking-wider mb-2">原题错因分析</div>
                  <div className="text-sm text-slate-700 leading-relaxed">
                    <FormattedMath text={originalModal.item.errorAnalysis} />
                  </div>
                </div>
              )}
            </div>

            {/* 弹窗底部 */}
            <div className="px-6 py-3 border-t border-slate-100 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setOriginalModal(null)}
                className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
