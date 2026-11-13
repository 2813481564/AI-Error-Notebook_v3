import React, { useState, useEffect } from 'react';
import { GraduationCap, Users, Plus, X, ShieldAlert, RefreshCw } from 'lucide-react';

const API_PREFIX = '/api';

function getHeaders(): HeadersInit {
  const token = localStorage.getItem('errorbook_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
}

interface TeacherItem {
  username: string;
  realName: string | null;
  nickname: string | null;
  accountType: string;
  studentCount?: number;
}

type Tab = 'jiaowu' | 'jiaoxue';

export default function RoleManager() {
  const [tab, setTab] = useState<Tab>('jiaowu');
  const [list, setList] = useState<TeacherItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 创建表单
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ username: '', password: '', realName: '', nickname: '' });
  const [submitting, setSubmitting] = useState(false);

  const loadList = async () => {
    setLoading(true);
    try {
      // 教务老师列表接口 + 教学老师列表接口（带学生数）
      const isJiaowu = tab === 'jiaowu';
      // 管理员查看教务：临时使用 jiaowu 账号列表；教学老师：带学生数
      const res = await fetch(`${API_PREFIX}/admin/roles?type=${tab}`, { headers: getHeaders() });
      if (!res.ok) {
        // 若专用接口不可用，回退到从 jiaowu/jiaoxues 查询
        throw new Error('加载失败');
      }
      const data = await res.json();
      setList(data);
    } catch (e: any) {
      setMsg({ type: 'error', text: e.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMsg(null);
    try {
      const endpoint = tab === 'jiaowu' ? '/admin/jiaowu' : '/admin/jiaoxue';
      const res = await fetch(`${API_PREFIX}${endpoint}`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '创建失败');
      setMsg({ type: 'success', text: data.message || (tab === 'jiaowu' ? '教务老师创建成功' : '教学老师创建成功') });
      setShowForm(false);
      setForm({ username: '', password: '', realName: '', nickname: '' });
      loadList();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls = "w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm font-semibold text-slate-800 transition-all placeholder-slate-400";

  return (
    <div className="space-y-6 font-sans">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600/10 flex items-center justify-center text-indigo-600">
            <GraduationCap className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight">角色管理（第二阶段）</h2>
            <p className="text-xs text-slate-500 font-medium">创建教务老师 / 教学老师账号，创建后 AI 额度无限</p>
          </div>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-xl font-bold text-xs hover:from-indigo-700 hover:to-blue-700 transition-all shadow-md shadow-indigo-500/10 cursor-pointer flex items-center gap-1.5">
          <Plus className="w-4 h-4" />
          创建{tab === 'jiaowu' ? '教务' : '教学'}老师
        </button>
      </div>

      {msg && (
        <div className={`p-4 rounded-2xl text-xs font-semibold flex items-center gap-2 ${msg.type === 'success' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-rose-50 text-rose-600 border border-rose-100'}`}>
          <ShieldAlert className="w-4 h-4" />
          {msg.text}
        </div>
      )}

      {/* Tab 切换 */}
      <div className="flex bg-slate-100 p-1 rounded-2xl w-fit">
        <button onClick={() => { setTab('jiaowu'); setMsg(null); }} className={`px-5 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${tab === 'jiaowu' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
          教务老师
        </button>
        <button onClick={() => { setTab('jiaoxue'); setMsg(null); }} className={`px-5 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${tab === 'jiaoxue' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
          教学老师
        </button>
      </div>

      {/* 创建表单 */}
      {showForm && (
        <form onSubmit={handleCreate} className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4 animate-in fade-in zoom-in-95 duration-200">
          <h3 className="font-black text-slate-900 flex items-center gap-2">
            <Plus className="w-4 h-4 text-indigo-600" />
            创建{tab === 'jiaowu' ? '教务' : '教学'}老师账号
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1">登录账号 <span className="text-rose-500">*</span></label>
              <input type="text" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} placeholder="如：jiaowu001" className={inputCls} required />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1">登录密码 <span className="text-rose-500">*</span></label>
              <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="不少于 6 位" className={inputCls} required />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1">真实姓名</label>
              <input type="text" value={form.realName} onChange={e => setForm({ ...form, realName: e.target.value })} placeholder="选填" className={inputCls} />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1">昵称</label>
              <input type="text" value={form.nickname} onChange={e => setForm({ ...form, nickname: e.target.value })} placeholder="选填" className={inputCls} />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={submitting} className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-xl font-bold text-xs hover:from-indigo-700 hover:to-blue-700 disabled:opacity-50 cursor-pointer">
              {submitting ? '创建中...' : '确认创建'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="px-5 py-2.5 border border-slate-200 text-slate-600 rounded-xl font-bold text-xs hover:bg-slate-50 cursor-pointer">取消</button>
          </div>
        </form>
      )}

      {/* 列表 */}
      <div className="bg-white border border-slate-200/60 rounded-3xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <span className="text-xs font-bold text-slate-700">{tab === 'jiaowu' ? '教务老师' : '教学老师'}列表（{list.length} 个）</span>
          <button onClick={loadList} className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all cursor-pointer" title="刷新"><RefreshCw className="w-4 h-4" /></button>
        </div>
        {loading ? (
          <div className="py-16 text-center"><div className="w-8 h-8 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-2"></div><p className="text-[10px] text-slate-400 font-bold">载入中...</p></div>
        ) : list.length === 0 ? (
          <div className="py-16 text-center text-slate-400 font-bold text-xs">暂无{tab === 'jiaowu' ? '教务' : '教学'}老师，点击右上角创建</div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-6">账号</th>
                <th className="py-3 px-6">姓名</th>
                <th className="py-3 px-6">角色</th>
                {tab === 'jiaoxue' && <th className="py-3 px-6">名下学生数</th>}
              </tr>
            </thead>
            <tbody className="text-sm font-semibold text-slate-700 divide-y divide-slate-100">
              {list.map(item => (
                <tr key={item.username} className="hover:bg-slate-50/40 transition-colors">
                  <td className="py-4 px-6 font-bold text-slate-900">{item.username}</td>
                  <td className="py-4 px-6">{item.realName || item.nickname || '-'}</td>
                  <td className="py-4 px-6">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black ${tab === 'jiaowu' ? 'bg-indigo-50 text-indigo-700 border border-indigo-200/50' : 'bg-blue-50 text-blue-700 border border-blue-200/50'}`}>
                      {tab === 'jiaowu' ? <Users className="w-3.5 h-3.5" /> : <GraduationCap className="w-3.5 h-3.5" />}
                      {tab === 'jiaowu' ? '教务老师' : '教学老师'}
                    </span>
                  </td>
                  {tab === 'jiaoxue' && <td className="py-4 px-6 text-xs"><span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-600 font-bold">{item.studentCount ?? 0} 人</span></td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
