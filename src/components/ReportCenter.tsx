import React, { useState, useEffect } from 'react';
import { FileBarChart, Copy, CalendarDays, Loader2, CheckCircle2, ExternalLink, Trash2, Eye, RefreshCw, Sparkles } from 'lucide-react';

const API_PREFIX = '/api';

function getHeaders(): HeadersInit {
  const token = localStorage.getItem('errorbook_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
}

interface ReportRecord {
  token: string;
  reportType: string;
  filters: any;
  link: string;
  createdAt: number;
  expiresAt: number;
  expired: boolean;
  studentCount: number;
  totalQuestions: number;
}

interface Jiaoxue {
  username: string;
  realName: string | null;
  studentCount: number;
}

interface Student {
  username: string;
  realName: string | null;
}

const REPORT_TYPE_LABEL: Record<string, string> = {
  daily: '每日学情',
  weekly: '每周学情',
  monthly: '每月学情'
};

export default function ReportCenter() {
  const [reportForm, setReportForm] = useState({ reportType: 'weekly', grade: '', teacherUsername: '', studentUsername: '', dateStart: '', dateEnd: '' });
  const [jiaoxues, setJiaoxues] = useState<Jiaoxue[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [history, setHistory] = useState<ReportRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [result, setResult] = useState<{ link: string; reportCount: number; totalQuestions: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const [selectedTokens, setSelectedTokens] = useState<string[]>([]);

  const inputCls = "w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40";

  const loadJiaoxues = async () => {
    try {
      const res = await fetch(`${API_PREFIX}/jiaowu/jiaoxues`, { headers: getHeaders() });
      if (res.ok) setJiaoxues(await res.json());
    } catch (e) { /* ignore */ }
  };

  const loadStudents = async (teacherUsername: string) => {
    if (!teacherUsername) { setStudents([]); return; }
    try {
      const res = await fetch(`${API_PREFIX}/jiaowu/students?teacherUsername=${encodeURIComponent(teacherUsername)}`, { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        setStudents(Array.isArray(data) ? data : []);
      }
    } catch (e) { setStudents([]); }
  };

  const loadHistory = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_PREFIX}/jiaowu/reports`, { headers: getHeaders() });
      const text = await res.text();
      const data = text ? JSON.parse(text) : [];
      setHistory(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setMsg({ type: 'error', text: e.message || '加载报表记录失败' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadJiaoxues();
    loadHistory();
  }, []);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenerating(true);
    setMsg(null);
    setResult(null);
    try {
      const res = await fetch(`${API_PREFIX}/jiaowu/reports`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          reportType: reportForm.reportType,
          grade: reportForm.grade || undefined,
          teacherUsername: reportForm.teacherUsername || undefined,
          students: reportForm.studentUsername ? [reportForm.studentUsername] : undefined,
          dateStart: reportForm.dateStart || undefined,
          dateEnd: reportForm.dateEnd || undefined
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '生成报表失败');
      setResult({ link: `${window.location.origin}${data.link}`, reportCount: data.reportCount, totalQuestions: data.totalQuestions });
      setMsg({ type: 'success', text: '报表生成成功' });
      loadHistory();
    } catch (e: any) {
      setMsg({ type: 'error', text: e.message });
    } finally {
      setGenerating(false);
    }
  };

  const copyLink = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) { alert('复制失败，请手动复制'); }
  };

  const handleDelete = async (token: string) => {
    if (!window.confirm('确定删除这条报表记录吗？删除后链接将失效。')) return;
    try {
      const res = await fetch(`${API_PREFIX}/jiaowu/reports/${token}`, { method: 'DELETE', headers: getHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '删除失败');
      setMsg({ type: 'success', text: data.message || '已删除' });
      loadHistory();
    } catch (e: any) {
      setMsg({ type: 'error', text: e.message });
    }
  };

  const handleBatchDelete = async () => {
    if (selectedTokens.length === 0) { alert('请先勾选要删除的报表'); return; }
    if (!window.confirm(`确定删除选中的 ${selectedTokens.length} 条报表记录吗？`)) return;
    try {
      const res = await fetch(`${API_PREFIX}/jiaowu/reports?tokens=${selectedTokens.join(',')}`, { method: 'DELETE', headers: getHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '批量删除失败');
      setMsg({ type: 'success', text: data.message || '已批量删除' });
      setSelectedTokens([]);
      loadHistory();
    } catch (e: any) {
      setMsg({ type: 'error', text: e.message });
    }
  };

  const toggleSelect = (token: string) => {
    setSelectedTokens(prev => prev.includes(token) ? prev.filter(t => t !== token) : [...prev, token]);
  };

  const toggleSelectAll = () => {
    const tokens = history.map(h => h.token);
    setSelectedTokens(prev => prev.length === history.length ? [] : tokens);
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  return (
    <div className="space-y-6">
      {msg && (
        <div className={`px-4 py-3 rounded-2xl text-sm font-semibold ${msg.type === 'success' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-rose-50 text-rose-600 border border-rose-100'}`}>{msg.text}</div>
      )}

      {/* 报表生成 */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h3 className="font-black text-slate-800 flex items-center gap-2 mb-1">
          <FileBarChart className="w-4 h-4 text-blue-600" />生成学情报表
        </h3>
        <p className="text-xs text-slate-400 font-medium mb-4">选择报表类型与筛选条件，生成后以链接形式分享（周报含举一反三习题卷附件）</p>

        <form onSubmit={handleGenerate} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">报表类型 <span className="text-rose-500">*</span></label>
              <select className={inputCls} value={reportForm.reportType} onChange={e => setReportForm({ ...reportForm, reportType: e.target.value })}>
                <option value="daily">每日学情报表</option>
                <option value="weekly">每周学情报表（含举一反三）</option>
                <option value="monthly">每月学情报表</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">教学老师筛选</label>
              <select className={inputCls} value={reportForm.teacherUsername}
                onChange={e => { setReportForm({ ...reportForm, teacherUsername: e.target.value, studentUsername: '' }); loadStudents(e.target.value); }}>
                <option value="">全部老师</option>
                {jiaoxues.map(j => <option key={j.username} value={j.username}>{j.realName || j.username}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">学生筛选</label>
              <select className={inputCls} value={reportForm.studentUsername} onChange={e => setReportForm({ ...reportForm, studentUsername: e.target.value })} disabled={!reportForm.teacherUsername}>
                <option value="">{reportForm.teacherUsername ? '全部学生' : '请先选择老师'}</option>
                {students.map(s => <option key={s.username} value={s.username}>{s.realName || s.username}</option>)}
              </select>
            </div>
          </div>
          <div className={`grid gap-4 ${reportForm.reportType === 'daily' ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 md:grid-cols-2'}`}>
            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">{reportForm.reportType === 'daily' ? '开始日期' : '开始日期（可选）'}</label>
              <input type="date" className={inputCls} value={reportForm.dateStart} onChange={e => setReportForm({ ...reportForm, dateStart: e.target.value })} />
            </div>
            <div className={reportForm.reportType === 'daily' ? 'hidden' : ''}>
              <label className="text-xs font-bold text-slate-500 block mb-1">结束日期（可选）</label>
              <input type="date" className={inputCls} value={reportForm.dateEnd} onChange={e => setReportForm({ ...reportForm, dateEnd: e.target.value })} />
            </div>
          </div>

          <button type="submit" disabled={generating} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold flex items-center gap-1.5 disabled:opacity-50 transition cursor-pointer">
            {generating ? <><Loader2 className="w-4 h-4 animate-spin" />生成中...</> : <><CalendarDays className="w-4 h-4" />生成报表链接</>}
          </button>
        </form>

        {result && (
          <div className="mt-4 bg-emerald-50 border border-emerald-100 rounded-2xl p-4">
            <div className="text-sm font-black text-emerald-700 mb-2 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />报表生成成功（覆盖 {result.reportCount} 名学生，共 {result.totalQuestions} 道错题）
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <input readOnly value={result.link} className="flex-1 min-w-[240px] bg-white border border-emerald-200 rounded-xl px-3 py-2.5 text-xs font-semibold text-slate-700" />
              <button onClick={() => copyLink(result.link)} className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer">
                <Copy className="w-3.5 h-3.5" />{copied ? '已复制' : '复制链接'}
              </button>
              <a href={result.link} target="_blank" rel="noreferrer" className="px-4 py-2.5 bg-white border border-emerald-200 text-emerald-700 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5" />预览
              </a>
            </div>
          </div>
        )}
      </div>

      {/* 报表记录管理 */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-blue-600" />
            <span className="text-sm font-black text-slate-700">报表生成记录（{history.length}）</span>
          </div>
          <div className="flex items-center gap-2">
            {selectedTokens.length > 0 && (
              <button onClick={handleBatchDelete} className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition cursor-pointer">
                删除所选（{selectedTokens.length}）
              </button>
            )}
            <button onClick={loadHistory} className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition cursor-pointer" title="刷新"><RefreshCw className="w-4 h-4" /></button>
          </div>
        </div>

        {loading ? (
          <div className="py-16 text-center"><Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-2" /><p className="text-xs text-slate-400 font-bold">加载中...</p></div>
        ) : history.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-xs font-bold">暂无报表生成记录</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-400 border-b border-slate-100 bg-slate-50/40">
                  <th className="px-4 py-3 font-bold w-10">
                    <input type="checkbox" checked={selectedTokens.length === history.length && history.length > 0} onChange={toggleSelectAll} className="accent-blue-600" />
                  </th>
                  <th className="px-4 py-3 font-bold">类型</th>
                  <th className="px-4 py-3 font-bold">筛选条件</th>
                  <th className="px-4 py-3 font-bold">覆盖</th>
                  <th className="px-4 py-3 font-bold">生成时间</th>
                  <th className="px-4 py-3 font-bold">状态</th>
                  <th className="px-4 py-3 font-bold">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {history.map(h => (
                  <tr key={h.token} className="hover:bg-slate-50/40">
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={selectedTokens.includes(h.token)} onChange={() => toggleSelect(h.token)} className="accent-blue-600" />
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2.5 py-1 rounded-full text-xs font-black bg-blue-50 text-blue-700">{REPORT_TYPE_LABEL[h.reportType] || h.reportType}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {h.filters?.grade || ''}{h.filters?.grade ? ' · ' : ''}{h.filters?.teacherUsername ? '老师:' + h.filters.teacherUsername : ''}
                      {Array.isArray(h.filters?.students) && h.filters.students.length > 0 ? ` · ${h.filters.students.length}学生` : ''}
                      {!h.filters?.grade && !h.filters?.teacherUsername && (!h.filters?.students || h.filters.students.length === 0) ? '全部' : ''}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{h.studentCount}人 / {h.totalQuestions}题</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{formatTime(h.createdAt)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${h.expired ? 'bg-slate-100 text-slate-400' : 'bg-emerald-50 text-emerald-600'}`}>
                        {h.expired ? '已过期' : '有效'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <a href={`${window.location.origin}${h.link}/variations`} target="_blank" rel="noreferrer" className="px-2 py-1 text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg text-xs font-black transition cursor-pointer" title="编辑当前报表举一反三">
                          <Sparkles className="w-3.5 h-3.5 inline mr-0.5" />编辑举一反三
                        </a>
                        <a href={h.link} target="_blank" rel="noreferrer" className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg transition cursor-pointer" title="预览"><ExternalLink className="w-4 h-4" /></a>
                        <button onClick={() => copyLink(window.location.origin + h.link)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition cursor-pointer" title="复制链接"><Copy className="w-4 h-4" /></button>
                        <button onClick={() => handleDelete(h.token)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer" title="删除"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
