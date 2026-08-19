import React, { useState, useEffect } from 'react';
import { Users, BookOpen, Trash2, Eye, Loader2 } from 'lucide-react';

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
  grade: string | null;
  subjects: string | null;
  accompanyEnd: string | null;
}

interface NotebookQuestion {
  id: string;
  originalText: string;
  subject: string;
  knowledgePoints: string[];
  errorReason: string;
  solution: string;
  createdAt: number;
  studentAnswer: string;
  masteryStatus: string;
  standardAnswer: string | null;
}

export default function JiaoxueStudentNotebook() {
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<string>('');
  const [questions, setQuestions] = useState<NotebookQuestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [viewQuestion, setViewQuestion] = useState<NotebookQuestion | null>(null);

  const loadStudents = async () => {
    try {
      const res = await fetch(`${API_PREFIX}/jiaoxue/students`, { headers: getHeaders() });
      if (!res.ok) return;
      setStudents(await res.json());
    } catch (e) {
      console.error("load students failed", e);
    }
  };

  const loadNotebook = async (username: string) => {
    if (!username) { setQuestions([]); return; }
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch(`${API_PREFIX}/jiaoxue/student/${username}/notebook`, { headers: getHeaders() });
      const text = await res.text();
      const data = text ? JSON.parse(text) : [];
      if (!res.ok) throw new Error(data.error || '加载错题本失败');
      setQuestions(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setMsg({ type: 'error', text: e.message });
      setQuestions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStudents();
  }, []);

  const handleSelect = (username: string) => {
    setSelectedStudent(username);
    loadNotebook(username);
  };

  const handleDelete = async (questionId: string) => {
    if (!window.confirm('确定删除这道错题吗？')) return;
    try {
      const res = await fetch(`${API_PREFIX}/questions/${questionId}`, { method: 'DELETE', headers: getHeaders() });
      const text = await res.text();
      const data = text ? JSON.parse(text) : {};
      if (!res.ok) throw new Error(data.error || '删除失败');
      setMsg({ type: 'success', text: '错题已删除' });
      loadNotebook(selectedStudent);
    } catch (e: any) {
      setMsg({ type: 'error', text: e.message });
    }
  };

  const handleToggleMastery = async (q: NotebookQuestion) => {
    const next = q.masteryStatus === 'mastered' ? 'not_mastered' : 'mastered';
    try {
      const res = await fetch(`${API_PREFIX}/questions/${q.id}/mastery`, {
        method: 'PUT', headers: getHeaders(), body: JSON.stringify({ masteryStatus: next })
      });
      if (!res.ok) throw new Error('更新失败');
      setQuestions(prev => prev.map(x => x.id === q.id ? { ...x, masteryStatus: next } : x));
    } catch (e: any) {
      setMsg({ type: 'error', text: e.message });
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Users className="w-4 h-4 text-blue-600" />
        <h3 className="font-black text-slate-800">学生错题本管理</h3>
      </div>

      {/* 学生选择 */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4">
        <label className="text-xs font-bold text-slate-500 block mb-2">选择学生</label>
        {students.length === 0 ? (
          <p className="text-xs text-slate-400 font-bold">暂无名下学生，请联系教务老师分配</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {students.map(s => (
              <button
                key={s.username}
                onClick={() => handleSelect(s.username)}
                className={`px-3 py-2 rounded-xl text-xs font-bold border transition ${selectedStudent === s.username ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-400'}`}
              >
                {s.realName || s.username}
                {s.grade ? `（${s.grade}）` : ''}
              </button>
            ))}
          </div>
        )}
      </div>

      {msg && <div className={`px-4 py-3 rounded-2xl text-xs font-semibold ${msg.type === 'success' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>{msg.text}</div>}

      {/* 错题列表 */}
      {selectedStudent && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <BookOpen className="w-4 h-4 text-blue-600" />{students.find(s => s.username === selectedStudent)?.realName || selectedStudent} 的错题本（{questions.length} 道）
            </span>
          </div>
          {loading ? (
            <div className="py-16 text-center"><Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-2" /><p className="text-xs text-slate-400 font-bold">加载中...</p></div>
          ) : questions.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-xs font-bold">该学生暂无错题</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {questions.map(q => (
                <div key={q.id} className="p-4 hover:bg-slate-50/50 transition">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-slate-800 line-clamp-2">{q.originalText}</div>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 text-[10px] font-bold">{q.subject}</span>
                        {Array.isArray(q.knowledgePoints) && q.knowledgePoints.slice(0, 3).map((kp, i) => (
                          <span key={i} className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 text-[10px] font-bold">{kp}</span>
                        ))}
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${q.masteryStatus === 'mastered' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                          {q.masteryStatus === 'mastered' ? '已掌握' : '未掌握'}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => setViewQuestion(q)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition cursor-pointer" title="查看"><Eye className="w-4 h-4" /></button>
                      <button onClick={() => handleToggleMastery(q)} className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition cursor-pointer" title="切换掌握状态">
                        <BookOpen className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(q.id)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer" title="删除"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 错题详情 */}
      {viewQuestion && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-2xl w-full p-6 relative max-h-[85vh] overflow-y-auto">
            <button onClick={() => setViewQuestion(null)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 font-bold cursor-pointer">✕</button>
            <h3 className="font-black text-slate-900 mb-3">错题详情</h3>
            <div className="text-sm text-slate-700 whitespace-pre-wrap mb-3">{viewQuestion.originalText}</div>
            {viewQuestion.studentAnswer && <div className="text-xs text-slate-500 mb-2"><span className="font-bold">学生作答：</span>{viewQuestion.studentAnswer}</div>}
            {viewQuestion.errorReason && <div className="text-xs text-rose-600 mb-2"><span className="font-bold">错因：</span>{viewQuestion.errorReason}</div>}
            {viewQuestion.solution && <div className="text-xs text-emerald-700 whitespace-pre-wrap"><span className="font-bold">解析：</span>{viewQuestion.solution}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
