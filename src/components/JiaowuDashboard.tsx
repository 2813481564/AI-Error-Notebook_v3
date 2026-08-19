import React, { useState, useEffect } from 'react';
import { Users, GraduationCap, Plus, RefreshCw, Trash2, BookOpen, Pencil, X } from 'lucide-react';

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

type Tab = 'overview' | 'students' | 'jiaoxues';

const GRADES = ['小学一年级', '小学二年级', '小学三年级', '小学四年级', '小学五年级', '小学六年级', '初一', '初二', '初三', '高一', '高二', '高三'];
const SUBJECTS = ['数学', '语文', '英语', '物理', '化学', '生物', '历史', '地理', '政治'];
const PAY_TYPES = ['试课用户', '付费用户'];

export default function JiaowuDashboard() {
  const [tab, setTab] = useState<Tab>('overview');
  const [students, setStudents] = useState<Student[]>([]);
  const [jiaoxues, setJiaoxues] = useState<Jiaoxue[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 创建学生表单
  const [showStudentForm, setShowStudentForm] = useState(false);
  const emptyStudent = {
    realName: '', gender: '', grade: '', city: '', subjects: [] as string[],
    payType: '', accompanyStart: '', accompanyEnd: '', contactPhone: '', password: '', teacherUsername: ''
  };
  const [studentForm, setStudentForm] = useState(emptyStudent);

  // 创建教学老师表单
  const [showJiaoxueForm, setShowJiaoxueForm] = useState(false);
  const [jxForm, setJxForm] = useState({ username: '', password: '', realName: '', nickname: '' });

  // 编辑学生表单
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [editForm, setEditForm] = useState({ ...emptyStudent, subjects: [] as string[] });

  // 编辑教学老师表单
  const [editingJiaoxue, setEditingJiaoxue] = useState<Jiaoxue | null>(null);
  const [jxEditForm, setJxEditForm] = useState({ username: '', realName: '', nickname: '', password: '' });

  // 筛选
  const [filterGrade, setFilterGrade] = useState('');
  const [filterTeacher, setFilterTeacher] = useState('');

  const loadStudents = async () => {
    try {
      const params = new URLSearchParams();
      if (filterGrade) params.set('grade', filterGrade);
      if (filterTeacher) params.set('teacherUsername', filterTeacher);
      const qs = params.toString() ? `?${params.toString()}` : '';
      const res = await fetch(`${API_PREFIX}/jiaowu/students${qs}`, { headers: getHeaders() });
      if (!res.ok) throw new Error('获取学生列表失败');
      setStudents(await res.json());
    } catch (e: any) {
      setMsg({ type: 'error', text: e.message });
    }
  };

  const loadJiaoxues = async () => {
    try {
      const res = await fetch(`${API_PREFIX}/jiaowu/jiaoxues`, { headers: getHeaders() });
      if (!res.ok) throw new Error('获取教学老师列表失败');
      setJiaoxues(await res.json());
    } catch (e: any) {
      setMsg({ type: 'error', text: e.message });
    }
  };

  useEffect(() => {
    loadStudents();
    loadJiaoxues();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterGrade, filterTeacher]);

  const handleCreateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch(`${API_PREFIX}/jiaowu/students`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ ...studentForm, subjects: studentForm.subjects })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '创建失败');
      setMsg({ type: 'success', text: `学生「${data.student?.realName}」创建成功，登录账号：${data.student?.username}，密码：${data.student?.password}` });
      setShowStudentForm(false);
      setStudentForm(emptyStudent);
      loadStudents();
    } catch (e: any) {
      setMsg({ type: 'error', text: e.message });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateJiaoxue = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch(`${API_PREFIX}/jiaowu/jiaoxue`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(jxForm)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '创建失败');
      setMsg({ type: 'success', text: data.message || '教学老师创建成功' });
      setShowJiaoxueForm(false);
      setJxForm({ username: '', password: '', realName: '', nickname: '' });
      loadJiaoxues();
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

  const toggleSubject = (sub: string) => {
    setStudentForm(prev => ({
      ...prev,
      subjects: prev.subjects.includes(sub) ? prev.subjects.filter(s => s !== sub) : [...prev.subjects, sub]
    }));
  };

  // 打开编辑表单，回填学生信息
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

  // 保存编辑学生
  const handleUpdateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch(`${API_PREFIX}/jiaowu/students/${editingStudent.username}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({
          realName: editForm.realName,
          gender: editForm.gender,
          grade: editForm.grade,
          city: editForm.city,
          subjects: editForm.subjects,
          payType: editForm.payType,
          accompanyStart: editForm.accompanyStart,
          accompanyEnd: editForm.accompanyEnd,
          teacherUsername: editForm.teacherUsername,
          password: editForm.password || undefined
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

  const toggleEditSubject = (sub: string) => {
    setEditForm(prev => ({
      ...prev,
      subjects: prev.subjects.includes(sub) ? prev.subjects.filter(s => s !== sub) : [...prev.subjects, sub]
    }));
  };

  // 打开教学老师编辑
  const openEditJiaoxue = (j: Jiaoxue) => {
    setEditingJiaoxue(j);
    setJxEditForm({ username: j.username, realName: j.realName || '', nickname: j.nickname || '', password: '' });
  };

  // 保存教学老师编辑
  const handleUpdateJiaoxue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingJiaoxue) return;
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch(`${API_PREFIX}/jiaowu/jiaoxue/${editingJiaoxue.username}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({
          realName: jxEditForm.realName,
          nickname: jxEditForm.nickname,
          password: jxEditForm.password || undefined
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '更新失败');
      setMsg({ type: 'success', text: data.message || '教学老师信息已更新' });
      setEditingJiaoxue(null);
      loadJiaoxues();
    } catch (e: any) {
      setMsg({ type: 'error', text: e.message });
    } finally {
      setLoading(false);
    }
  };

  const inputCls = "w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40";

  const totalStudents = students.length;
  const totalJiaoxues = jiaoxues.length;

  return (
    <div className="space-y-6">
      {msg && (
        <div className={`px-4 py-3 rounded-2xl text-sm font-semibold flex items-center gap-2 ${msg.type === 'success' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-rose-50 text-rose-600 border border-rose-100'}`}>
          {msg.text}
        </div>
      )}

      {/* Tab 切换 */}
      <div className="flex gap-2 bg-white p-1.5 rounded-2xl border border-slate-200 w-fit">
        <button onClick={() => setTab('overview')} className={`px-4 py-2 rounded-xl text-sm font-bold transition ${tab === 'overview' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>教务概览</button>
        <button onClick={() => setTab('students')} className={`px-4 py-2 rounded-xl text-sm font-bold transition ${tab === 'students' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>学生管理</button>
        <button onClick={() => setTab('jiaoxues')} className={`px-4 py-2 rounded-xl text-sm font-bold transition ${tab === 'jiaoxues' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>教学老师管理</button>
      </div>

      {tab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center"><Users className="w-6 h-6 text-blue-600" /></div>
            <div>
              <div className="text-2xl font-black text-slate-800">{totalStudents}</div>
              <div className="text-xs text-slate-400 font-bold">名下学生数</div>
            </div>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-slate-200 flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center"><GraduationCap className="w-6 h-6 text-indigo-600" /></div>
            <div>
              <div className="text-2xl font-black text-slate-800">{totalJiaoxues}</div>
              <div className="text-xs text-slate-400 font-bold">教学老师数</div>
            </div>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-slate-200 flex items-center gap-4">
            <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center"><BookOpen className="w-6 h-6 text-amber-600" /></div>
            <div className="text-xs text-slate-500 font-semibold leading-relaxed">
              教务老师可创建学生账号与教学老师，并可生成学情报表（报表功能将在后续版本开放）。
            </div>
          </div>
        </div>
      )}

      {tab === 'students' && (
        <div className="space-y-4">
          {/* 筛选栏 */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">年级筛选</label>
              <select value={filterGrade} onChange={e => setFilterGrade(e.target.value)} className={inputCls + ' w-40'}>
                <option value="">全部年级</option>
                {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">教学老师筛选</label>
              <select value={filterTeacher} onChange={e => setFilterTeacher(e.target.value)} className={inputCls + ' w-44'}>
                <option value="">全部老师</option>
                {jiaoxues.map(j => <option key={j.username} value={j.username}>{j.realName || j.username}</option>)}
              </select>
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
                <div><label className="text-xs font-bold text-slate-500 block mb-1">付费性质</label>
                  <select className={inputCls} value={studentForm.payType} onChange={e => setStudentForm({ ...studentForm, payType: e.target.value })}>
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
                <button type="submit" disabled={loading} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold disabled:opacity-50">
                  {loading ? '创建中...' : '确认创建'}
                </button>
                <button type="button" onClick={() => setShowStudentForm(false)} className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-sm font-bold">取消</button>
              </div>
            </form>
          )}

          {/* 学生列表 */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
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
                  {students.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400 text-xs font-bold">暂无学生，点击"创建学生"添加</td></tr>}
                  {students.map(s => (
                    <tr key={s.username} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="px-4 py-3 font-bold text-slate-700">{s.realName || '-'} <span className="text-slate-400 text-xs ml-1">{s.gender || ''}</span></td>
                      <td className="px-4 py-3 text-slate-500">{s.grade || '-'}</td>
                      <td className="px-4 py-3 text-slate-500">{s.subjects || '-'}</td>
                      <td className="px-4 py-3"><span className={`px-2 py-1 rounded-full text-xs font-bold ${s.payType === '付费用户' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>{s.payType || '-'}</span></td>
                      <td className="px-4 py-3 text-slate-500">{jiaoxues.find(j => j.username === s.teacherUsername)?.realName || s.teacherUsername || '-'}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{s.accompanyStart} ~ {s.accompanyEnd}</td>
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
          </div>
        </div>
      )}

      {tab === 'jiaoxues' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 flex items-center justify-between">
            <div className="text-sm font-bold text-slate-600">教学老师（{totalJiaoxues} 人）</div>
            <button onClick={() => setShowJiaoxueForm(!showJiaoxueForm)} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold flex items-center gap-1.5"><Plus className="w-4 h-4" />创建教学老师</button>
          </div>

          {showJiaoxueForm && (
            <form onSubmit={handleCreateJiaoxue} className="bg-white p-5 rounded-2xl border border-slate-200 space-y-4">
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
              <div className="flex gap-3">
                <button type="submit" disabled={loading} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold disabled:opacity-50">{loading ? '创建中...' : '确认创建'}</button>
                <button type="button" onClick={() => setShowJiaoxueForm(false)} className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-sm font-bold">取消</button>
              </div>
            </form>
          )}

          {/* 教学老师列表 */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                  <th className="px-4 py-3 font-bold">账号</th>
                  <th className="px-4 py-3 font-bold">姓名</th>
                  <th className="px-4 py-3 font-bold">名下学生数</th>
                  <th className="px-4 py-3 font-bold">操作</th>
                </tr>
              </thead>
              <tbody>
                {jiaoxues.length === 0 && <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-400 text-xs font-bold">暂无教学老师</td></tr>}
                {jiaoxues.map(j => (
                  <tr key={j.username} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="px-4 py-3 text-slate-500">{j.username}</td>
                    <td className="px-4 py-3 font-bold text-slate-700">{j.realName || j.nickname || '-'}</td>
                    <td className="px-4 py-3">
                      <span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-600 text-xs font-bold">{j.studentCount} 人</span>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => openEditJiaoxue(j)} className="text-blue-500 hover:text-blue-700 text-xs font-bold flex items-center gap-1"><Pencil className="w-3.5 h-3.5" />编辑</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
                  <button type="button" key={sub} onClick={() => toggleEditSubject(sub)}
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

      {/* 编辑教学老师模态框 */}
      {editingJiaoxue && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form onSubmit={handleUpdateJiaoxue} className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-6 relative">
            <button type="button" onClick={() => setEditingJiaoxue(null)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 font-bold cursor-pointer"><X className="w-5 h-5" /></button>
            <h3 className="font-black text-slate-800 flex items-center gap-2 mb-4"><Pencil className="w-4 h-4 text-blue-600" />编辑教学老师：{editingJiaoxue.username}</h3>
            <div className="space-y-4 mb-4">
              <div><label className="text-xs font-bold text-slate-500 block mb-1">真实姓名</label>
                <input className={inputCls} value={jxEditForm.realName} onChange={e => setJxEditForm({ ...jxEditForm, realName: e.target.value })} /></div>
              <div><label className="text-xs font-bold text-slate-500 block mb-1">昵称</label>
                <input className={inputCls} value={jxEditForm.nickname} onChange={e => setJxEditForm({ ...jxEditForm, nickname: e.target.value })} /></div>
              <div><label className="text-xs font-bold text-slate-500 block mb-1">重置密码（留空不改）</label>
                <input type="password" className={inputCls} value={jxEditForm.password} onChange={e => setJxEditForm({ ...jxEditForm, password: e.target.value })} placeholder="至少 6 位" /></div>
            </div>
            <div className="flex gap-3">
              <button type="submit" disabled={loading} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold disabled:opacity-50">{loading ? '保存中...' : '保存修改'}</button>
              <button type="button" onClick={() => setEditingJiaoxue(null)} className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-sm font-bold">取消</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
