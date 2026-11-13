import React, { useState, useEffect } from 'react';
import { Users, Plus, RefreshCw, Trash2, Pencil, X, Loader2, Search, AlertTriangle, Clock } from 'lucide-react';

const API_PREFIX = '/api';

function getHeaders(): HeadersInit {
  const token = localStorage.getItem('errorbook_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
}

interface Student {
  username: string;
  studentNo: number | null;
  realName: string | null;
  gender: string | null;
  grade: string | null;
  city: string | null;
  subjects: string | null;
  payType: string | null;
  accompanyStart: string | null;
  accompanyEnd: string | null;
  teacherUsername: string | null;
  contactPhone: string | null;
  vipExpireAt: string | null;
}

interface Jiaoxue {
  username: string;
  realName: string | null;
  nickname: string | null;
  studentCount: number;
}

const GRADES = ['小学一年级', '小学二年级', '小学三年级', '小学四年级', '小学五年级', '小学六年级', '初一', '初二', '初三', '高一', '高二', '高三'];
const SUBJECTS = ['数学', '语文', '英语', '物理', '化学', '生物', '历史', '地理', '政治'];
const PAY_TYPES = ['试课用户', '付费用户'];

export default function JiaowuDashboard() {
  const [students, setStudents] = useState<Student[]>([]);
  const [jiaoxues, setJiaoxues] = useState<Jiaoxue[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  // 手机号重复弹窗
  const [dupModal, setDupModal] = useState<string | null>(null);

  // 创建学生表单
  const [showStudentForm, setShowStudentForm] = useState(false);
  const emptyStudent = {
    realName: '', gender: '', grade: '', city: '', subjects: [] as string[],
    payType: '', accompanyStart: '', accompanyEnd: '', contactPhone: '', password: '', teacherUsername: ''
  };
  const [studentForm, setStudentForm] = useState(emptyStudent);

  // 编辑学生表单
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [editForm, setEditForm] = useState({ ...emptyStudent, subjects: [] as string[] });

  // 筛选
  const [filterGrade, setFilterGrade] = useState('');
  const [filterTeacher, setFilterTeacher] = useState('');
  const [filterPayType, setFilterPayType] = useState('');
  const [filterKeyword, setFilterKeyword] = useState('');

  const loadJiaoxues = async () => {
    try {
      const res = await fetch(`${API_PREFIX}/jiaowu/jiaoxues`, { headers: getHeaders() });
      if (res.ok) setJiaoxues(await res.json());
    } catch (e) { /* 忽略 */ }
  };

  const loadStudents = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterGrade) params.set('grade', filterGrade);
      if (filterTeacher) params.set('teacherUsername', filterTeacher);
      if (filterPayType) params.set('payType', filterPayType);
      if (filterKeyword.trim()) params.set('keyword', filterKeyword.trim());
      const qs = params.toString() ? `?${params.toString()}` : '';
      const res = await fetch(`${API_PREFIX}/jiaowu/students${qs}`, { headers: getHeaders() });
      if (!res.ok) throw new Error('获取学生列表失败');
      const data = await res.json();
      setStudents(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setMsg({ type: 'error', text: e.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStudents();
    loadJiaoxues();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterGrade, filterTeacher, filterPayType, filterKeyword]);

  const handleCreateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch(`${API_PREFIX}/jiaowu/students`, {
        method: 'POST', headers: getHeaders(),
        body: JSON.stringify({ ...studentForm, subjects: studentForm.subjects })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '创建失败');
      setMsg({ type: 'success', text: `学生「${data.student?.realName}」创建成功，ID：${data.student?.studentNo ?? '-'}，登录账号：${data.student?.username}，密码：${data.student?.password}` });
      setShowStudentForm(false);
      setStudentForm(emptyStudent);
      loadStudents();
    } catch (e: any) {
      // 手机号重复时用弹窗提醒
      if (e.message && (e.message.includes('已存在') || e.message.includes('重复'))) {
        setDupModal(e.message);
      } else {
        setMsg({ type: 'error', text: e.message });
      }
    } finally {
      setLoading(false);
    }
  };

  const openEdit = (student: Student) => {
    setEditingStudent(student);
    setEditForm({
      realName: student.realName || '',
      gender: student.gender || '',
      grade: student.grade || '',
      city: student.city || '',
      subjects: student.subjects ? student.subjects.split(',') : [],
      payType: student.payType || '',
      accompanyStart: student.accompanyStart || '',
      accompanyEnd: student.accompanyEnd || '',
      contactPhone: student.contactPhone || student.username,
      password: '',
      teacherUsername: student.teacherUsername || ''
    });
  };

  const handleUpdateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch(`${API_PREFIX}/jiaowu/students/${editingStudent.username}`, {
        method: 'PUT', headers: getHeaders(),
        body: JSON.stringify({
          realName: editForm.realName, gender: editForm.gender, grade: editForm.grade, city: editForm.city,
          subjects: editForm.subjects, payType: editForm.payType, accompanyStart: editForm.accompanyStart,
          accompanyEnd: editForm.accompanyEnd, teacherUsername: editForm.teacherUsername, password: editForm.password || undefined
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '更新失败');
      setMsg({ type: 'success', text: data.message || '学生信息已更新' });
      setEditingStudent(null);
      loadStudents();
    } catch (e: any) {
      setMsg({ type: 'error', text: e.message });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteStudent = async (username: string) => {
    if (!window.confirm(`确定删除学生账号 ${username} 吗？此操作不可恢复。`)) return;
    try {
      const res = await fetch(`${API_PREFIX}/jiaowu/students/${username}`, { method: 'DELETE', headers: getHeaders() });
      const text = await res.text();
      const data = text ? JSON.parse(text) : {};
      if (!res.ok) throw new Error(data.error || '删除失败');
      setMsg({ type: 'success', text: '学生账号已删除' });
      loadStudents();
    } catch (e: any) {
      setMsg({ type: 'error', text: e.message });
    }
  };

  // 计算付费到期状态：返回 { text, cls } —— 已过期 / N天内到期 / 正常
  const getExpireStatus = (s: Student): { text: string; cls: string } => {
    const end = s.accompanyEnd;
    if (!end) return { text: '未设置', cls: 'text-slate-400' };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endDate = new Date(end);
    endDate.setHours(0, 0, 0, 0);
    const diffDays = Math.round((endDate.getTime() - today.getTime()) / 86400000);
    if (diffDays < 0) return { text: `已过期 ${Math.abs(diffDays)} 天`, cls: 'text-rose-600 bg-rose-50 border-rose-200' };
    if (diffDays <= 7) return { text: `${diffDays === 0 ? '今天' : `${diffDays} 天后`}到期`, cls: 'text-amber-600 bg-amber-50 border-amber-200' };
    return { text: '', cls: '' };
  };

  const toggleSubject = (sub: string, isEdit = false) => {
    const setter = isEdit ? setEditForm : setStudentForm;
    const cur = isEdit ? editForm : studentForm;
    const updated = cur.subjects.includes(sub) ? cur.subjects.filter(s => s !== sub) : [...cur.subjects, sub];
    if (isEdit) setEditForm({ ...editForm, subjects: updated });
    else setStudentForm({ ...studentForm, subjects: updated });
  };

  const inputCls = "w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40";

  return (
    <div className="space-y-6">
      {msg && (
        <div className={`px-4 py-3 rounded-2xl text-sm font-semibold ${msg.type === 'success' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-rose-50 text-rose-600 border border-rose-100'}`}>{msg.text}</div>
      )}

      {/* 手机号重复弹窗提醒 */}
      {dupModal && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-6 text-center">
            <div className="w-14 h-14 mx-auto mb-4 bg-rose-50 rounded-full flex items-center justify-center"><AlertTriangle className="w-7 h-7 text-rose-500" /></div>
            <h3 className="font-black text-slate-800 mb-2 text-lg">创建失败</h3>
            <p className="text-sm text-slate-500 font-medium mb-6">{dupModal}</p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setDupModal(null)} className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold cursor-pointer transition">我知道了</button>
            </div>
          </div>
        </div>
      )}

      {/* 名下学生数卡片 */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 flex items-center gap-4">
        <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center"><Users className="w-6 h-6 text-blue-600" /></div>
        <div>
          <div className="text-2xl font-black text-slate-800">{students.length}</div>
          <div className="text-xs text-slate-400 font-bold">名下学生数</div>
        </div>
      </div>

      {/* 筛选栏 */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs font-bold text-slate-500 block mb-1">年级筛选</label>
          <select value={filterGrade} onChange={e => setFilterGrade(e.target.value)} className={inputCls + ' w-36'}>
            <option value="">全部年级</option>
            {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-bold text-slate-500 block mb-1">教学老师筛选</label>
          <select value={filterTeacher} onChange={e => setFilterTeacher(e.target.value)} className={inputCls + ' w-36'}>
            <option value="">全部老师</option>
            {jiaoxues.map(j => <option key={j.username} value={j.username}>{j.realName || j.username}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-bold text-slate-500 block mb-1">付费性质</label>
          <select value={filterPayType} onChange={e => setFilterPayType(e.target.value)} className={inputCls + ' w-32'}>
            <option value="">全部性质</option>
            {PAY_TYPES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="relative">
          <label className="text-xs font-bold text-slate-500 block mb-1">搜索</label>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={filterKeyword}
              onChange={e => setFilterKeyword(e.target.value)}
              placeholder="姓名 / 账号 / 科目"
              className={inputCls + ' pl-9 w-44'}
            />
          </div>
        </div>
        <button onClick={loadStudents} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-sm font-bold text-slate-600 flex items-center gap-1.5"><RefreshCw className="w-4 h-4" />刷新</button>
        <button onClick={() => setShowStudentForm(!showStudentForm)} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold flex items-center gap-1.5 ml-auto"><Plus className="w-4 h-4" />创建学生</button>
      </div>

      {/* 创建学生表单 */}
      {showStudentForm && (
        <form onSubmit={handleCreateStudent} className="bg-white p-5 rounded-2xl border border-slate-200 space-y-4">
          <h3 className="font-black text-slate-800 flex items-center gap-2"><Plus className="w-4 h-4 text-blue-600" />创建学生账号</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div><label className="text-xs font-bold text-slate-500 block mb-1">姓名 <span className="text-rose-500">*</span></label>
              <input className={inputCls} value={studentForm.realName} onChange={e => setStudentForm({ ...studentForm, realName: e.target.value })} placeholder="学生姓名" required /></div>
            <div><label className="text-xs font-bold text-slate-500 block mb-1">性别</label>
              <select className={inputCls} value={studentForm.gender} onChange={e => setStudentForm({ ...studentForm, gender: e.target.value })}>
                <option value="">请选择</option><option>男</option><option>女</option>
              </select></div>
            <div><label className="text-xs font-bold text-slate-500 block mb-1">年级</label>
              <select className={inputCls} value={studentForm.grade} onChange={e => setStudentForm({ ...studentForm, grade: e.target.value })}>
                <option value="">请选择</option>{GRADES.map(g => <option key={g}>{g}</option>)}
              </select></div>
            <div><label className="text-xs font-bold text-slate-500 block mb-1">所在城市</label>
              <input className={inputCls} value={studentForm.city} onChange={e => setStudentForm({ ...studentForm, city: e.target.value })} placeholder="如：上海" /></div>
            <div><label className="text-xs font-bold text-slate-500 block mb-1">付费性质 <span className="text-rose-500">*</span></label>
              <select className={inputCls} value={studentForm.payType} onChange={e => setStudentForm({ ...studentForm, payType: e.target.value })} required>
                <option value="">请选择</option>{PAY_TYPES.map(p => <option key={p}>{p}</option>)}
              </select></div>
            <div><label className="text-xs font-bold text-slate-500 block mb-1">所属教学老师</label>
              <select className={inputCls} value={studentForm.teacherUsername} onChange={e => setStudentForm({ ...studentForm, teacherUsername: e.target.value })}>
                <option value="">暂不分配</option>
                {jiaoxues.map(j => <option key={j.username} value={j.username}>{j.realName || j.username}（{j.studentCount}人）</option>)}
              </select></div>
            <div><label className="text-xs font-bold text-slate-500 block mb-1">联系方式（登录账号）<span className="text-rose-500">*</span></label>
              <input className={inputCls} value={studentForm.contactPhone} onChange={e => setStudentForm({ ...studentForm, contactPhone: e.target.value })} placeholder="手机号，即登录账号" required /></div>
            <div><label className="text-xs font-bold text-slate-500 block mb-1">登录密码（默认123456）</label>
              <input className={inputCls} value={studentForm.password} onChange={e => setStudentForm({ ...studentForm, password: e.target.value })} placeholder="留空则默认 123456" /></div>
            <div><label className="text-xs font-bold text-slate-500 block mb-1">伴学开始日期 <span className="text-rose-500">*</span></label>
              <input type="date" className={inputCls} value={studentForm.accompanyStart} onChange={e => setStudentForm({ ...studentForm, accompanyStart: e.target.value })} required /></div>
            <div><label className="text-xs font-bold text-slate-500 block mb-1">伴学结束日期 <span className="text-rose-500">*</span></label>
              <input type="date" className={inputCls} value={studentForm.accompanyEnd} onChange={e => setStudentForm({ ...studentForm, accompanyEnd: e.target.value })} required /></div>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 block mb-2">需要伴学的科目</label>
            <div className="flex flex-wrap gap-2">
              {SUBJECTS.map(sub => (
                <button type="button" key={sub} onClick={() => toggleSubject(sub)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold border transition ${studentForm.subjects.includes(sub) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-500 border-slate-200 hover:border-blue-400'}`}>
                  {sub}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={loading} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold disabled:opacity-50">{loading ? '创建中...' : '确认创建'}</button>
            <button type="button" onClick={() => setShowStudentForm(false)} className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-sm font-bold">取消</button>
          </div>
        </form>
      )}

      {/* 学生列表 */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="py-16 text-center"><Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-2" /><p className="text-xs text-slate-400 font-bold">加载中...</p></div>
        ) : students.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-xs font-bold">暂无学生，点击"创建学生"添加</div>
        ) : (
          <>
            {/* 移动端：卡片列表 */}
            <div className="md:hidden divide-y divide-slate-100">
              {students.map(s => {
                const expireSt = getExpireStatus(s);
                const teacherName = jiaoxues.find(j => j.username === s.teacherUsername)?.realName || s.teacherUsername || '-';
                return (
                  <div key={s.username} className="p-4">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-black text-slate-800 truncate">{s.realName || '-'}</span>
                        {s.gender && <span className="text-xs text-slate-400">{s.gender}</span>}
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${s.payType === '付费用户' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>{s.payType || '-'}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => openEdit(s)} className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition" title="编辑"><Pencil className="w-4 h-4" /></button>
                        <button onClick={() => handleDeleteStudent(s.username)} className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition" title="删除"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                      <div className="flex items-center gap-1.5"><span className="text-slate-400 font-bold shrink-0">ID</span><span className="text-slate-600 font-semibold">{s.studentNo ?? '-'}</span></div>
                      <div className="flex items-center gap-1.5"><span className="text-slate-400 font-bold shrink-0">年级</span><span className="text-slate-600 font-semibold">{s.grade || '-'}</span></div>
                      <div className="col-span-2 flex items-center gap-1.5"><span className="text-slate-400 font-bold shrink-0">科目</span><span className="text-slate-600 font-semibold">{s.subjects || '-'}</span></div>
                      <div className="col-span-2 flex items-center gap-1.5"><span className="text-slate-400 font-bold shrink-0">老师</span><span className="text-slate-600 font-semibold">{teacherName}</span></div>
                      <div className="col-span-2 flex items-start gap-1.5">
                        <span className="text-slate-400 font-bold shrink-0">伴学</span>
                        <div>
                          <div className="text-slate-600 font-semibold">{s.accompanyStart} ~ {s.accompanyEnd}</div>
                          {expireSt.text && (
                            <span className={`inline-flex items-center gap-1 mt-0.5 px-1.5 py-0.5 rounded-full border text-[10px] font-black ${expireSt.cls}`}>
                              {expireSt.text.includes('过期') ? <AlertTriangle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                              {expireSt.text}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="col-span-2 flex items-center gap-1.5"><span className="text-slate-400 font-bold shrink-0">账号</span><span className="text-slate-600 font-semibold break-all">{s.username}</span></div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* PC 端：表格 */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                    <th className="px-4 py-3 font-bold">ID</th>
                    <th className="px-4 py-3 font-bold">姓名</th>
                    <th className="px-4 py-3 font-bold">年级</th>
                    <th className="px-4 py-3 font-bold">科目</th>
                    <th className="px-4 py-3 font-bold">付费性质</th>
                    <th className="px-4 py-3 font-bold">教学老师</th>
                    <th className="px-4 py-3 font-bold">伴学时间</th>
                    <th className="px-4 py-3 font-bold">登录账号</th>
                    <th className="px-4 py-3 font-bold">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map(s => (
                    <tr key={s.username} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="px-4 py-3 font-black text-slate-500">{s.studentNo ?? '-'}</td>
                      <td className="px-4 py-3 font-bold text-slate-700">{s.realName || '-'} <span className="text-slate-400 text-xs ml-1">{s.gender || ''}</span></td>
                      <td className="px-4 py-3 text-slate-500">{s.grade || '-'}</td>
                      <td className="px-4 py-3 text-slate-500">{s.subjects || '-'}</td>
                      <td className="px-4 py-3"><span className={`px-2 py-1 rounded-full text-xs font-bold ${s.payType === '付费用户' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>{s.payType || '-'}</span></td>
                      <td className="px-4 py-3 text-slate-500">{jiaoxues.find(j => j.username === s.teacherUsername)?.realName || s.teacherUsername || '-'}</td>
                      <td className="px-4 py-3">
                        <div className="text-xs text-slate-500">{s.accompanyStart} ~ {s.accompanyEnd}</div>
                        {(() => {
                          const st = getExpireStatus(s);
                          if (!st.text) return null;
                          return (
                            <span className={`inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded-full border text-[10px] font-black ${st.cls}`}>
                              {st.text.includes('过期') ? <AlertTriangle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                              {st.text}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3 text-slate-500">{s.username}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button onClick={() => openEdit(s)} className="text-blue-500 hover:text-blue-700 text-xs font-bold flex items-center gap-1"><Pencil className="w-3.5 h-3.5" />编辑</button>
                          <button onClick={() => handleDeleteStudent(s.username)} className="text-rose-500 hover:text-rose-700 text-xs font-bold flex items-center gap-1"><Trash2 className="w-3.5 h-3.5" />删除</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* 编辑学生模态框 */}
      {editingStudent && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form onSubmit={handleUpdateStudent} className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-2xl w-full p-6 relative max-h-[85vh] overflow-y-auto">
            <button type="button" onClick={() => setEditingStudent(null)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 font-bold cursor-pointer"><X className="w-5 h-5" /></button>
            <h3 className="font-black text-slate-800 flex items-center gap-2 mb-4"><Pencil className="w-4 h-4 text-blue-600" />编辑学生：{editingStudent.realName}</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div><label className="text-xs font-bold text-slate-500 block mb-1">姓名 <span className="text-rose-500">*</span></label>
                <input className={inputCls} value={editForm.realName} onChange={e => setEditForm({ ...editForm, realName: e.target.value })} required /></div>
              <div><label className="text-xs font-bold text-slate-500 block mb-1">性别</label>
                <select className={inputCls} value={editForm.gender} onChange={e => setEditForm({ ...editForm, gender: e.target.value })}>
                  <option value="">请选择</option><option>男</option><option>女</option>
                </select></div>
              <div><label className="text-xs font-bold text-slate-500 block mb-1">年级</label>
                <select className={inputCls} value={editForm.grade} onChange={e => setEditForm({ ...editForm, grade: e.target.value })}>
                  <option value="">请选择</option>{GRADES.map(g => <option key={g}>{g}</option>)}
                </select></div>
              <div><label className="text-xs font-bold text-slate-500 block mb-1">所在城市</label>
                <input className={inputCls} value={editForm.city} onChange={e => setEditForm({ ...editForm, city: e.target.value })} /></div>
              <div><label className="text-xs font-bold text-slate-500 block mb-1">付费性质</label>
                <select className={inputCls} value={editForm.payType} onChange={e => setEditForm({ ...editForm, payType: e.target.value })}>
                  <option value="">请选择</option>{PAY_TYPES.map(p => <option key={p}>{p}</option>)}
                </select></div>
              <div><label className="text-xs font-bold text-slate-500 block mb-1">所属教学老师</label>
                <select className={inputCls} value={editForm.teacherUsername} onChange={e => setEditForm({ ...editForm, teacherUsername: e.target.value })}>
                  <option value="">暂不分配</option>
                  {jiaoxues.map(j => <option key={j.username} value={j.username}>{j.realName || j.username}（{j.studentCount}人）</option>)}
                </select></div>
              <div><label className="text-xs font-bold text-slate-500 block mb-1">伴学开始日期</label>
                <input type="date" className={inputCls} value={editForm.accompanyStart} onChange={e => setEditForm({ ...editForm, accompanyStart: e.target.value })} /></div>
              <div><label className="text-xs font-bold text-slate-500 block mb-1">伴学结束日期</label>
                <input type="date" className={inputCls} value={editForm.accompanyEnd} onChange={e => setEditForm({ ...editForm, accompanyEnd: e.target.value })} /></div>
              <div><label className="text-xs font-bold text-slate-500 block mb-1">重置密码（留空不改）</label>
                <input type="password" className={inputCls} value={editForm.password} onChange={e => setEditForm({ ...editForm, password: e.target.value })} placeholder="至少 6 位" /></div>
            </div>
            <div className="mb-4">
              <label className="text-xs font-bold text-slate-500 block mb-2">需要伴学的科目</label>
              <div className="flex flex-wrap gap-2">
                {SUBJECTS.map(sub => (
                  <button type="button" key={sub} onClick={() => toggleSubject(sub, true)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold border transition ${editForm.subjects.includes(sub) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-500 border-slate-200 hover:border-blue-400'}`}>
                    {sub}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-3">
              <button type="submit" disabled={loading} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold disabled:opacity-50">{loading ? '保存中...' : '保存修改'}</button>
              <button type="button" onClick={() => setEditingStudent(null)} className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-sm font-bold">取消</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
