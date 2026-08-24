import React, { useState, useEffect } from 'react';
import { Zap, GraduationCap, BookOpen, Users } from 'lucide-react';
import QuickAnswerList from './QuickAnswerList';
import ProofreadReview from './ProofreadReview';
import JiaoxueStudentNotebook from './JiaoxueStudentNotebook';

type Tab = 'quick' | 'proofread' | 'notebook';

const API_PREFIX = '/api';

function getHeaders(): HeadersInit {
  const token = localStorage.getItem('errorbook_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
}

export default function JiaoxueWorkbench({ initialTab }: { initialTab?: Tab } = {}) {
  // 一次性使用：读取后清空 localStorage 避免后续进入仍受污染
  const [tab, setTab] = useState<Tab>(() => {
    const fromProp = initialTab;
    const fromStorage = typeof window !== 'undefined' ? localStorage.getItem('errorbook_jiaoxue_initialTab') as Tab | null : null;
    const tab2 = fromProp || fromStorage || 'quick';
    if (typeof window !== 'undefined' && fromStorage) localStorage.removeItem('errorbook_jiaoxue_initialTab');
    return tab2 as Tab;
  });
  const [students, setStudents] = useState<{ username: string; realName: string | null; grade: string | null }[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<string>('');

  // 加载教学老师名下学生
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_PREFIX}/jiaoxue/students`, { headers: getHeaders() });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            setStudents(data);
            // 默认选中第一个学生
            if (data.length > 0 && !selectedStudent) {
              setSelectedStudent(data[0].username);
            }
          }
        }
      } catch (e) {
        console.error("load students failed", e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-5">
      {/* 顶部：全局学生下拉框（可选） */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-blue-600" />
          <span className="text-sm font-bold text-slate-700">当前操作学生</span>
          <span className="text-[10px] text-slate-400 font-bold">（可选，用于批改上传与审查归档）</span>
        </div>
        <select
          value={selectedStudent}
          onChange={e => setSelectedStudent(e.target.value)}
          className="flex-1 min-w-[200px] max-w-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
        >
          <option value="">未选择学生</option>
          {students.map(s => (
            <option key={s.username} value={s.username}>{s.realName || s.username}{s.grade ? `（${s.grade}）` : ''}</option>
          ))}
        </select>
      </div>

      {/* Tab 切换 */}
      <div className="flex gap-2 bg-white p-1.5 rounded-2xl border border-slate-200 w-fit">
        <button onClick={() => setTab('quick')} className={`px-4 py-2 rounded-xl text-sm font-bold transition flex items-center gap-1.5 ${tab === 'quick' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>
          <Zap className="w-4 h-4" />快速答题
        </button>
        <button onClick={() => setTab('proofread')} className={`px-4 py-2 rounded-xl text-sm font-bold transition flex items-center gap-1.5 ${tab === 'proofread' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>
          <GraduationCap className="w-4 h-4" />作业批改
        </button>
        <button onClick={() => setTab('notebook')} className={`px-4 py-2 rounded-xl text-sm font-bold transition flex items-center gap-1.5 ${tab === 'notebook' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>
          <BookOpen className="w-4 h-4" />学生错题本
        </button>
      </div>

      {tab === 'quick' && <QuickAnswerList />}
      {tab === 'proofread' && <ProofreadReview defaultStudent={selectedStudent || undefined} />}
      {tab === 'notebook' && <JiaoxueStudentNotebook />}
    </div>
  );
}
