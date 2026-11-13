import React, { useState, useEffect } from 'react';
import { GraduationCap, Plus, RefreshCw, Pencil, X, Loader2, Users, Search } from 'lucide-react';

const API_PREFIX = '/api';

function getHeaders(): HeadersInit {
  const token = localStorage.getItem('errorbook_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
}

interface Jiaoxue {
  username: string;
  realName: string | null;
  nickname: string | null;
  subjects: string | null;
  studentCount: number;
}

const SUBJECTS = ['数学', '语文', '英语', '物理', '化学', '生物', '历史', '地理', '政治'];

export default function TeacherManager() {
  const [jiaoxues, setJiaoxues] = useState<Jiaoxue[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [jxForm, setJxForm] = useState({ username: '', password: '', realName: '', nickname: '', subjects: [] as string[] });
  const [editing, setEditing] = useState<Jiaoxue | null>(null);
  const [editForm, setEditForm] = useState({ username: '', realName: '', nickname: '', subjects: [] as string[], password: '' });
  const [submitting, setSubmitting] = useState(false);
  // 搜索：searchType 类型 + 输入框 + 点击"搜索"后才应用的 appKeyword
  const [searchType, setSearchType] = useState<'name' | 'username' | 'subject'>('name');
  const [keyword, setKeyword] = useState('');
  const [appKeyword, setAppKeyword] = useState('');

  const inputCls = "w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40";

  const loadJiaoxues = async (kw?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      const useKw = kw !== undefined ? kw : appKeyword;
      if (useKw.trim()) {
        if (searchType === 'username') params.set('username', useKw.trim());
        else if (searchType === 'subject') params.set('subject', useKw.trim());
        else params.set('keyword', useKw.trim());
      }
      const qs = params.toString() ? `?${params.toString()}` : '';
      const res = await fetch(`${API_PREFIX}/jiaowu/jiaoxues${qs}`, { headers: getHeaders() });
      if (res.ok) setJiaoxues(await res.json());
    } catch (e: any) {
      setMsg({ type: 'error', text: e.message });
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    setAppKeyword(keyword.trim());
    loadJiaoxues(keyword.trim());
  };

  const handleResetSearch = () => {
    setKeyword('');
    setAppKeyword('');
    loadJiaoxues('');
  };

  useEffect(() => { loadJiaoxues(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMsg(null);
    try {
      const res = await fetch(`${API_PREFIX}/jiaowu/jiaoxue`, {
        method: 'POST', headers: getHeaders(), body: JSON.stringify(jxForm)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '创建失败');
      setMsg({ type: 'success', text: data.message || '教学老师创建成功' });
      setShowForm(false);
      setJxForm({ username: '', password: '', realName: '', nickname: '', subjects: [] });
      loadJiaoxues();
    } catch (e: any) {
      setMsg({ type: 'error', text: e.message });
    } finally {
      setSubmitting(false);
    }
  };

  const toggleCreateSubject = (sub: string) => {
    const updated = jxForm.subjects.includes(sub) ? jxForm.subjects.filter(s => s !== sub) : [...jxForm.subjects, sub];
    setJxForm({ ...jxForm, subjects: updated });
  };

  const openEdit = (j: Jiaoxue) => {
    setEditing(j);
    setEditForm({
      username: j.username,
      realName: j.realName || '',
      nickname: j.nickname || '',
      subjects: j.subjects ? j.subjects.split(',').filter(Boolean) : [],
      password: ''
    });
  };

  const toggleEditSubject = (sub: string) => {
    const updated = editForm.subjects.includes(sub) ? editForm.subjects.filter(s => s !== sub) : [...editForm.subjects, sub];
    setEditForm({ ...editForm, subjects: updated });
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setSubmitting(true);
    setMsg(null);
    try {
      const res = await fetch(`${API_PREFIX}/jiaowu/jiaoxue/${editing.username}`, {
        method: 'PUT', headers: getHeaders(),
        body: JSON.stringify({ realName: editForm.realName, nickname: editForm.nickname, subjects: editForm.subjects, password: editForm.password || undefined })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '更新失败');
      setMsg({ type: 'success', text: data.message || '教学老师信息已更新' });
      setEditing(null);
      loadJiaoxues();
    } catch (e: any) {
      setMsg({ type: 'error', text: e.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {msg && (
        <div className={`px-4 py-3 rounded-2xl text-sm font-semibold ${msg.type === 'success' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-rose-50 text-rose-600 border border-rose-100'}`}>{msg.text}</div>
      )}

      {/* 教学老师数卡片 */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 flex items-center gap-4">
        <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center"><GraduationCap className="w-6 h-6 text-indigo-600" /></div>
        <div>
          <div className="text-2xl font-black text-slate-800">{jiaoxues.length}</div>
          <div className="text-xs text-slate-400 font-bold">教学老师数</div>
        </div>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-slate-200 flex flex-col md:flex-row items-stretch md:items-center gap-3">
        <div className="text-sm font-bold text-slate-600 shrink-0">教学老师（{jiaoxues.length} 人）</div>
        <div className="flex items-stretch gap-2 flex-1 md:max-w-lg">
          <select
            value={searchType}
            onChange={e => setSearchType(e.target.value as 'name' | 'username' | 'subject')}
            className="px-2 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40 shrink-0"
            title="搜索类型"
          >
            <option value="name">按名字</option>
            <option value="username">按账号</option>
            <option value="subject">按科目</option>
          </select>
          <div className="relative flex-1 min-w-[120px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
              placeholder={searchType === 'name' ? '输入老师姓名...' : searchType === 'username' ? '输入登录账号...' : '输入科目，如：数学'}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            />
          </div>
          <button onClick={handleSearch} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold flex items-center gap-1.5 shrink-0"><Search className="w-3.5 h-3.5" />搜索</button>
          {appKeyword && <button onClick={handleResetSearch} className="px-3 py-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl text-sm font-bold shrink-0">重置</button>}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <button onClick={() => loadJiaoxues()} className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition cursor-pointer" title="刷新"><RefreshCw className="w-4 h-4" /></button>
          <button onClick={() => setShowForm(!showForm)} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold flex items-center gap-1.5 transition cursor-pointer"><Plus className="w-4 h-4" />创建教学老师</button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white p-5 rounded-2xl border border-slate-200 space-y-4">
          <h3 className="font-black text-slate-800 flex items-center gap-2"><Plus className="w-4 h-4 text-blue-600" />创建教学老师</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className="text-xs font-bold text-slate-500 block mb-1">登录账号 <span className="text-rose-500">*</span></label>
              <input className={inputCls} value={jxForm.username} onChange={e => setJxForm({ ...jxForm, username: e.target.value })} required /></div>
            <div><label className="text-xs font-bold text-slate-500 block mb-1">登录密码 <span className="text-rose-500">*</span></label>
              <input type="password" className={inputCls} value={jxForm.password} onChange={e => setJxForm({ ...jxForm, password: e.target.value })} required /></div>
            <div><label className="text-xs font-bold text-slate-500 block mb-1">真实姓名</label>
              <input className={inputCls} value={jxForm.realName} onChange={e => setJxForm({ ...jxForm, realName: e.target.value })} /></div>
            <div><label className="text-xs font-bold text-slate-500 block mb-1">昵称</label>
              <input className={inputCls} value={jxForm.nickname} onChange={e => setJxForm({ ...jxForm, nickname: e.target.value })} /></div>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 block mb-2">任教科目</label>
            <div className="flex flex-wrap gap-2">
              {SUBJECTS.map(sub => (
                <button type="button" key={sub} onClick={() => toggleCreateSubject(sub)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold border transition ${jxForm.subjects.includes(sub) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-400'}`}>
                  {sub}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={submitting} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold disabled:opacity-50">{submitting ? '创建中...' : '确认创建'}</button>
            <button type="button" onClick={() => setShowForm(false)} className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-sm font-bold">取消</button>
          </div>
        </form>
      )}

      {/* 列表 */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="py-16 text-center"><Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-2" /><p className="text-xs text-slate-400 font-bold">加载中...</p></div>
        ) : jiaoxues.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-xs font-bold">暂无教学老师</div>
        ) : (
          <>
            {/* 移动端：卡片列表 */}
            <div className="md:hidden divide-y divide-slate-100">
              {jiaoxues.map(j => (
                <div key={j.username} className="p-4">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-black text-slate-800 truncate">{j.realName || j.nickname || '-'}</span>
                      <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-600 text-[11px] font-bold shrink-0">{j.studentCount} 人</span>
                    </div>
                    <button onClick={() => openEdit(j)} className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition shrink-0" title="编辑"><Pencil className="w-4 h-4" /></button>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs mb-2"><span className="text-slate-400 font-bold shrink-0">账号</span><span className="text-slate-600 font-semibold break-all">{j.username}</span></div>
                  <div className="flex items-start gap-1.5">
                    <span className="text-slate-400 font-bold shrink-0 text-xs mt-0.5">科目</span>
                    {j.subjects ? (
                      <div className="flex flex-wrap gap-1">
                        {j.subjects.split(',').filter(Boolean).map(s => <span key={s} className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 text-[11px] font-bold">{s}</span>)}
                      </div>
                    ) : <span className="text-slate-300 text-xs">-</span>}
                  </div>
                </div>
              ))}
            </div>

            {/* PC 端：表格 */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                    <th className="px-4 py-3 font-bold">账号</th>
                    <th className="px-4 py-3 font-bold">姓名</th>
                    <th className="px-4 py-3 font-bold">任教科目</th>
                    <th className="px-4 py-3 font-bold">名下学生数</th>
                    <th className="px-4 py-3 font-bold">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {jiaoxues.map(j => (
                    <tr key={j.username} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="px-4 py-3 text-slate-500">{j.username}</td>
                      <td className="px-4 py-3 font-bold text-slate-700">{j.realName || j.nickname || '-'}</td>
                      <td className="px-4 py-3">
                        {j.subjects ? (
                          <div className="flex flex-wrap gap-1">
                            {j.subjects.split(',').filter(Boolean).map(s => <span key={s} className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 text-[11px] font-bold">{s}</span>)}
                          </div>
                        ) : <span className="text-slate-300">-</span>}
                      </td>
                      <td className="px-4 py-3"><span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-600 text-xs font-bold">{j.studentCount} 人</span></td>
                      <td className="px-4 py-3">
                        <button onClick={() => openEdit(j)} className="text-blue-500 hover:text-blue-700 text-xs font-bold flex items-center gap-1"><Pencil className="w-3.5 h-3.5" />编辑</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* 编辑教学老师模态框 */}
      {editing && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form onSubmit={handleUpdate} className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-6 relative">
            <button type="button" onClick={() => setEditing(null)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 font-bold cursor-pointer"><X className="w-5 h-5" /></button>
            <h3 className="font-black text-slate-800 flex items-center gap-2 mb-4"><Pencil className="w-4 h-4 text-blue-600" />编辑教学老师：{editing.username}</h3>
            <div className="space-y-4 mb-4">
              <div><label className="text-xs font-bold text-slate-500 block mb-1">真实姓名</label>
                <input className={inputCls} value={editForm.realName} onChange={e => setEditForm({ ...editForm, realName: e.target.value })} /></div>
              <div><label className="text-xs font-bold text-slate-500 block mb-1">昵称</label>
                <input className={inputCls} value={editForm.nickname} onChange={e => setEditForm({ ...editForm, nickname: e.target.value })} /></div>
              <div>
                <label className="text-xs font-bold text-slate-500 block mb-2">任教科目</label>
                <div className="flex flex-wrap gap-2">
                  {SUBJECTS.map(sub => (
                    <button type="button" key={sub} onClick={() => toggleEditSubject(sub)}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold border transition ${editForm.subjects.includes(sub) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-400'}`}>
                      {sub}
                    </button>
                  ))}
                </div>
              </div>
              <div><label className="text-xs font-bold text-slate-500 block mb-1">重置密码（留空不改）</label>
                <input type="password" className={inputCls} value={editForm.password} onChange={e => setEditForm({ ...editForm, password: e.target.value })} placeholder="至少 6 位" /></div>
            </div>
            <div className="flex gap-3">
              <button type="submit" disabled={submitting} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold disabled:opacity-50">{submitting ? '保存中...' : '保存修改'}</button>
              <button type="button" onClick={() => setEditing(null)} className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-sm font-bold">取消</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
