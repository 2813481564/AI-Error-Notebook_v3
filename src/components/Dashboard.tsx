import { useEffect, useState } from 'react';
import { db, ErrorQuestion } from '../lib/db';
import { Target, BookOpen, BrainCircuit, Sparkles, CheckCircle2, AlertCircle, ArrowRight, ChevronRight, TrendingUp, Database, Camera, Users, Settings, Megaphone, Scissors, Clock, Plus } from 'lucide-react';
import QuestionDetail from './QuestionDetail';
import { InlineContent } from './FormattedMath';

function truncateMathText(text: string, limit: number): string {
  if (text.length <= limit) return text;
  let truncated = text.substring(0, limit);
  const dollarCount = (truncated.match(/\$/g) || []).length;
  if (dollarCount % 2 !== 0) {
    const lastDollarIndex = truncated.lastIndexOf('$');
    if (lastDollarIndex !== -1) {
      truncated = truncated.substring(0, lastDollarIndex);
    }
  }
  return truncated.trim() + '...';
}

export default function Dashboard({ onNavigate, pendingTasksCount = 0 }: { onNavigate: (v: any, params?: any) => void, pendingTasksCount?: number }) {
  const [questions, setQuestions] = useState<ErrorQuestion[]>([]);
  const [notebooks, setNotebooks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // 控制错题详情及创建错题本的状态
  const [selectedQuestion, setSelectedQuestion] = useState<ErrorQuestion | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newNotebookName, setNewNotebookName] = useState('');
  const [newNotebookGrade, setNewNotebookGrade] = useState('初二');
  const [newNotebookSubject, setNewNotebookSubject] = useState('数学');
  const [newNotebookDescription, setNewNotebookDescription] = useState('');

  const handleDeleteQuestion = () => {
    if (!selectedQuestion) return;
    db.deleteQuestion(selectedQuestion.id).then(() => {
      setQuestions(prev => prev.filter(q => q.id !== selectedQuestion.id));
      setSelectedQuestion(null);
    }).catch(err => console.error("删除错题失败", err));
  };

  const handleUpdateQuestion = (updated: ErrorQuestion) => {
    setQuestions(prev => prev.map(q => q.id === updated.id ? updated : q));
    setSelectedQuestion(updated);
  };

  const handleCreateNotebook = () => {
    if (!newNotebookName.trim()) return;
    const token = localStorage.getItem('errorbook_token');
    fetch('/api/notebooks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: JSON.stringify({
        name: newNotebookName.trim(),
        grade: newNotebookGrade,
        subject: newNotebookSubject,
        description: newNotebookDescription.trim() || null,
        type: 'normal'
      })
    })
      .then(res => {
        if (!res.ok) throw new Error('创建失败');
        return res.json();
      })
      .then(data => {
        const newNb = data.notebook || data;
        setNotebooks(prev => [...prev, newNb]);
        setShowCreateModal(false);
        setNewNotebookName('');
        setNewNotebookDescription('');
        setNewNotebookSubject('数学');
        setNewNotebookGrade('初二');
      })
      .catch(err => {
        console.error("创建错题本失败", err);
      });
  };

  const userRole = localStorage.getItem('errorbook_role') || 'student';
  const isStudent = userRole === 'student';

  const menuCards = [
    {
      title: '我的错题本',
      desc: '浏览与多维检索积累的所有错题',
      icon: Database,
      iconBg: 'bg-blue-50 text-blue-600 border border-blue-100/50',
      hoverBorder: 'hover:border-blue-200 hover:shadow-blue-500/5',
      view: 'library',
      show: true,
    },
    {
      title: 'AI变题库',
      desc: '管理举一反三生成的变式题',
      icon: BookOpen,
      iconBg: 'bg-purple-50 text-purple-600 border border-purple-100/50',
      hoverBorder: 'hover:border-purple-200 hover:shadow-purple-500/5',
      view: 'aiVariation',
      show: true,
    },
    {
      title: '上传错题',
      desc: '拍照或粘贴图片',
      icon: Camera,
      iconBg: 'bg-emerald-50 text-emerald-600 border border-emerald-100/50',
      hoverBorder: 'hover:border-emerald-200 hover:shadow-emerald-500/5',
      view: 'add',
      show: true,
    },
    {
      title: '多题拆分',
      desc: '一张图拆多题',
      icon: Scissors,
      iconBg: 'bg-indigo-50 text-indigo-600 border border-indigo-100/50',
      hoverBorder: 'hover:border-indigo-200 hover:shadow-indigo-500/5',
      view: 'add',
      params: { uploadMode: 'multi' },
      show: true,
    },
    {
      title: '用户管理',
      desc: '管理系统内账号与角色权限',
      icon: Users,
      iconBg: 'bg-cyan-50 text-cyan-600 border border-cyan-100/50',
      hoverBorder: 'hover:border-cyan-200 hover:shadow-cyan-500/5',
      view: 'users',
      show: userRole === 'admin',
    },
    {
      title: '系统设置',
      desc: '配置系统全局参数及AI通道',
      icon: Settings,
      iconBg: 'bg-slate-100 text-slate-700 border border-slate-200/50',
      hoverBorder: 'hover:border-slate-300 hover:shadow-slate-500/5',
      view: 'settings',
      show: userRole === 'admin',
    },
    {
      title: '公告管理',
      desc: '发布与编辑系统首页公告',
      icon: Megaphone,
      iconBg: 'bg-teal-50 text-teal-600 border border-teal-100/50',
      hoverBorder: 'hover:border-teal-200 hover:shadow-teal-500/5',
      view: 'announcements',
      show: userRole === 'admin',
    },
  ];

  const visibleCards = menuCards.filter(card => card.show);

  useEffect(() => {
    const token = localStorage.getItem('errorbook_token');

    const fetchQuestions = db.getAllQuestions('normal');
    const fetchNotebooks = fetch('/api/notebooks', {
      headers: {
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      }
    })
      .then(res => res.json())
      .then(data => Array.isArray(data) ? data : []);

    Promise.all([fetchQuestions, fetchNotebooks])
      .then(([qData, nData]) => {
        setQuestions(qData);
        setNotebooks(nData);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  const total = questions.length;

  // 今日任务：今日录入的错题数量
  const todayStart = new Date().setHours(0, 0, 0, 0);
  const todayCount = questions.filter(q => q.createdAt >= todayStart).length;

  // 待审核题目数量 (status === 'pending')
  const pendingCount = questions.filter(q => q.status === 'pending').length;

  // 掌握率：已掌握题目数 / 总数
  const masteredCount = questions.filter(q => q.masteryStatus === 'mastered').length;
  const masteryRate = total > 0 ? Math.round((masteredCount / total) * 100) : 0;

  // 薄弱考点分析：统计每个知识点的总题数及未掌握题数，计算掌握率并排序
  const pointStats: Record<string, { name: string; total: number; unmastered: number }> = {};
  questions.forEach(q => {
    q.knowledgePoints?.forEach(p => {
      if (!p) return;
      const trimP = p.trim();
      if (!trimP) return;
      if (!pointStats[trimP]) {
        pointStats[trimP] = { name: trimP, total: 0, unmastered: 0 };
      }
      pointStats[trimP].total += 1;
      if (q.masteryStatus !== 'mastered') {
        pointStats[trimP].unmastered += 1;
      }
    });
  });

  const weakData = Object.values(pointStats)
    .map(item => {
      const mastered = item.total - item.unmastered;
      const masteryRate = item.total > 0 ? Math.round((mastered / item.total) * 100) : 0;
      return { ...item, masteryRate };
    })
    .sort((a, b) => {
      if (a.masteryRate !== b.masteryRate) {
        return a.masteryRate - b.masteryRate; // 掌握率低优先
      }
      return b.unmastered - a.unmastered; // 未掌握题数多优先
    })
    .slice(0, 5);

  // 典型错题排行：根据得分升序排序，取分数最低的 5 道错题 (如果无得分，按创建时间排前)
  const typicalQuestions = [...questions]
    .filter(q => q.score !== undefined && q.score !== null)
    .sort((a, b) => (a.score || 0) - (b.score || 0))
    .slice(0, 5);

  // 如果打分题目不够，用普通未掌握错题补充
  if (typicalQuestions.length < 5 && questions.length > typicalQuestions.length) {
    const remainingCount = 5 - typicalQuestions.length;
    const additional = questions
      .filter(q => q.masteryStatus !== 'mastered' && !typicalQuestions.some(t => t.id === q.id))
      .slice(0, remainingCount);
    typicalQuestions.push(...additional);
  }

  // 计算最近错题，按创建时间降序取前 4 道
  const recentQuestions = [...questions]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 4);

  if (selectedQuestion) {
    return (
      <QuestionDetail
        question={selectedQuestion}
        notebooks={notebooks}
        isAdmin={userRole === 'admin'}
        onBack={() => setSelectedQuestion(null)}
        onDelete={handleDeleteQuestion}
        onUpdate={handleUpdateQuestion}
      />
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-8">

      {/* Title Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-black text-slate-950 tracking-tight flex items-center gap-2">
            <span>数据看板</span>
            <span className="text-xs bg-blue-100 text-blue-700 font-bold px-2 py-0.5 rounded-full">实时同步</span>
          </h2>
          <p className="text-sm text-slate-500">科学统计您的学习盲区，助力攻克高频失分薄弱点</p>
        </div>
        {!isStudent && (
          <button
            onClick={() => onNavigate('add')}
            className="self-start md:self-auto bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition flex items-center gap-1.5 shadow-sm shadow-blue-600/10 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            上传新错题
          </button>
        )}
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">

        {/* Card 1: 今日任务 */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between min-h-[120px] transition-all hover:shadow-md">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold text-slate-500">今日任务</span>
            <Target className="w-4.5 h-4.5 text-blue-500 shrink-0" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-3xl font-black text-slate-900 tracking-tight">{todayCount}</span>
            <span className="text-xs text-slate-400 font-semibold">道录入</span>
          </div>
        </div>

        {/* Card 2: 错题总数 */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between min-h-[120px] transition-all hover:shadow-md">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold text-slate-500">错题总数</span>
            <BookOpen className="w-4.5 h-4.5 text-indigo-500 shrink-0" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-3xl font-black text-slate-900 tracking-tight">{total}</span>
            <span className="text-xs text-slate-400 font-semibold">道积累</span>
          </div>
        </div>

        {/* Card 3: 待审核 */}
        {/* <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between min-h-[120px] transition-all hover:shadow-md">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold text-slate-500">待审核</span>
            <AlertCircle className="w-4.5 h-4.5 text-rose-500 shrink-0" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-3xl font-black text-slate-900 tracking-tight">{pendingCount}</span>
            <span className="text-xs text-slate-400 font-semibold">道审核</span>
          </div>
        </div> */}

        {/* Card 4: 掌握率 */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between min-h-[120px] transition-all hover:shadow-md">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold text-slate-500">错题掌握率</span>
            <CheckCircle2 className="w-4.5 h-4.5 text-emerald-500 shrink-0" />
          </div>
          <div className="mt-2">
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-black text-slate-900 tracking-tight">{masteryRate}</span>
              <span className="text-sm text-slate-500 font-extrabold">%</span>
            </div>
            {/* Progress bar */}
            <div className="w-full bg-slate-100 h-1.5 rounded-full mt-2 overflow-hidden">
              <div
                className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${masteryRate}%` }}
              />
            </div>
          </div>
        </div>

      </div>

      {/* 快捷功能导航 */}
      <div className="space-y-3">
        <h3 className="text-sm font-extrabold text-slate-500 tracking-wider uppercase pl-1">快捷功能导航</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleCards.map((card, index) => {
            const Icon = card.icon;
            return (
              <div
                key={index}
                onClick={() => onNavigate(card.view, (card as any).params)}
                className={`group flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition-all duration-300 cursor-pointer ${card.hoverBorder} hover:-translate-y-0.5`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`p-2.5 rounded-xl ${card.iconBg} flex items-center justify-center relative shrink-0`}>
                    <Icon className="w-5 h-5" />
                    {card.view === 'tasks' && pendingTasksCount > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center animate-pulse shadow-sm">
                        {pendingTasksCount}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <h4 className="text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors truncate">
                      {card.title}
                    </h4>
                    <p className="text-xs text-slate-400 mt-0.5 font-medium leading-relaxed truncate">
                      {card.desc}
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all shrink-0" />
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Content Sections - Dual Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

        {/* Column Left: Weak Points List (12 cols) */}
        <div className="lg:col-span-12 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2 text-slate-900">
                <BrainCircuit className="w-5 h-5 text-blue-600 shrink-0" />
                <h3 className="text-base font-extrabold tracking-tight">薄弱知识点</h3>
              </div>
              <span className="text-[13px] text-slate-400 font-bold uppercase flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5 text-blue-500" />
                先补掌握率最低的地方
              </span>
            </div>

            {weakData.length > 0 ? (
              <div className="space-y-3.5 mt-4">
                {weakData.map((item, index) => (
                  <div
                    key={index}
                    onClick={() => onNavigate('library', {
                      notebookId: 'all',
                      searchKey: item.name,
                      masteryStatus: 'all'
                    })}
                    className="group flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-100 hover:border-blue-200 hover:bg-slate-50/30 hover:shadow-sm transition-all duration-300 cursor-pointer"
                  >
                    {/* 左侧：知识点名称与统计 */}
                    <div className="flex flex-col min-w-0 pr-4">
                      <span className="text-[16px] font-black text-slate-900 truncate tracking-tight">{item.name}</span>
                      <span className="text-[13px] text-slate-400 mt-1 font-bold tracking-tight">
                        {item.unmastered} 未掌握 / {item.total} 题
                      </span>
                    </div>

                    {/* 右侧：进度条与掌握率 */}
                    <div className="flex items-center gap-4 shrink-0">
                      <div className="w-24 sm:w-36 bg-slate-100 h-1.5 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${item.masteryRate < 30 ? 'bg-rose-500' : item.masteryRate < 60 ? 'bg-amber-500' : 'bg-emerald-500'
                            }`}
                          style={{ width: `${item.masteryRate}%` }}
                        />
                      </div>
                      <span className={`text-[12px] font-black w-8 text-right tracking-tight shrink-0 ${item.masteryRate < 30 ? 'text-rose-600' : item.masteryRate < 60 ? 'text-amber-600' : 'text-emerald-600'
                        }`}>
                        {item.masteryRate}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400 text-center">
                <BrainCircuit className="w-10 h-10 text-slate-200 mb-2.5 animate-pulse" />
                <p className="text-xs font-semibold text-slate-500">暂无薄弱知识点</p>
                <p className="text-[11px] text-slate-400 mt-1 max-w-[240px]">
                  错题本中的错题全部已掌握，或者您还未录入错题
                </p>
              </div>
            )}
          </div>

          {weakData.length > 0 && (
            <div className="mt-4 p-3.5 bg-blue-50/70 border border-blue-100 rounded-xl flex items-center justify-between gap-3">
              <div className="text-sm text-blue-700 leading-relaxed">
                建议针对 <span className="font-extrabold text-blue-900">{weakData[0]?.name}</span> 等最薄弱的知识点进行专项错题重做和变式练习。
              </div>
              <button
                onClick={() => onNavigate('exercise')}
                className="bg-blue-600 text-white hover:bg-blue-700 text-sm font-bold px-4 py-2 rounded-lg shrink-0 transition flex items-center gap-1 cursor-pointer"
              >
                智能组卷
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Column Right: Typical/High-Frequency Error List (5 cols) - HIDE (NOT DELETE) */}
        {/* 
        <div className="lg:col-span-5 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2 text-slate-900">
                <Sparkles className="w-5 h-5 text-amber-500 shrink-0" />
                <h3 className="text-base font-extrabold tracking-tight">典型错题排行 (薄弱度最高)</h3>
              </div>
              <button
                onClick={() => onNavigate('library')}
                className="text-[13px] text-blue-600 hover:text-blue-700 font-bold transition-colors cursor-pointer"
              >
                查看全部
              </button>
            </div>

            {typicalQuestions.length > 0 ? (
              <div className="space-y-3 mt-4">
                {typicalQuestions.map((q, index) => {
                  const cleanText = q.originalText
                    .replace(/[\$\#\*\_]/g, '')
                    .substring(0, 48) + (q.originalText.length > 48 ? '...' : '');

                  return (
                    <div
                      key={q.id}
                      onClick={() => onNavigate('library')}
                      className="group flex items-center justify-between p-3 rounded-xl border border-slate-100 hover:border-slate-200 hover:bg-slate-50/50 transition-all cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0 pr-2">
                        Rank Badge
                        <span className={`w-5.5 h-5.5 rounded-lg flex items-center justify-center text-xs font-black shrink-0 ${index === 0 ? 'bg-amber-100 text-amber-700' :
                          index === 1 ? 'bg-slate-100 text-slate-700' :
                            index === 2 ? 'bg-orange-100 text-orange-700' :
                              'bg-slate-50 text-slate-500'
                          }`}>
                          {index + 1}
                        </span>

                        Question Content Truncate
                        <div className="flex flex-col min-w-0">
                          <span className="text-[13px] text-slate-400 font-bold tracking-tight">{q.subject}</span>
                          <p className="text-xs font-semibold text-slate-700 truncate mt-0.5 group-hover:text-blue-600 transition-colors">
                            {cleanText || '无题目文本内容'}
                          </p>
                        </div>
                      </div>

                      Score Badge
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full shrink-0 ${q.score !== undefined && q.score !== null
                        ? q.score < 60 ? 'bg-rose-50 text-rose-600 border border-rose-100' : 'bg-amber-50 text-amber-600 border border-amber-100'
                        : 'bg-slate-50 text-slate-500 border border-slate-100'
                        }`}>
                        {q.score !== undefined && q.score !== null ? `得分 ${q.score}` : '未批改'}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400 text-center">
                <BookOpen className="w-10 h-10 text-slate-200 mb-2.5" />
                <p className="text-xs font-semibold text-slate-500">暂无错题排行</p>
                <p className="text-[11px] text-slate-400 mt-1 max-w-[200px]">
                  请录入错题并使用 AI 评卷打分后，在此查看失分度排行
                </p>
              </div>
            )}
          </div>
        </div>
        */}

      </div>

      {/* 最近错题 & 我的错题本双栏排版 */}
      <div className="space-y-8 mt-8">

        {/* 左/上侧：最近错题 */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-slate-900">
            <Clock className="w-5 h-5 text-blue-600 shrink-0" />
            <h3 className="text-base font-extrabold tracking-tight">最近错题</h3>
            <span className="text-[13px] text-slate-400 font-bold uppercase">刚录入和练过的题目</span>
          </div>

          {recentQuestions.length > 0 ? (
            <div className="grid grid-cols-1 gap-3">
              {recentQuestions.map((q) => {
                const cleanedText = q.originalText.replace(/[\#\*\_]/g, '');
                const cleanText = truncateMathText(cleanedText, 100);

                // 获取所属错题本名称
                const parentNb = notebooks.find(nb => nb.id === q.notebookId);
                const notebookName = parentNb ? parentNb.name : '未分类错题';

                return (
                  <div
                    key={q.id}
                    onClick={() => setSelectedQuestion(q)}
                    className="group flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition-all duration-300 cursor-pointer hover:-translate-y-0.5"
                  >
                    <div className="flex items-start gap-4 min-w-0 pr-4">
                      <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 border border-blue-100/50 flex items-center justify-center shrink-0 mt-0.5">
                        <BookOpen className="w-4.5 h-4.5" />
                      </div>

                      <div className="flex flex-col min-w-0 space-y-1.5">
                        <div className="flex items-center gap-2">
                          {q.grade && (
                            <span className="text-xs text-slate-400 font-bold">{q.grade}</span>
                          )}
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${q.masteryStatus === 'mastered'
                            ? 'bg-emerald-50 text-emerald-600 border border-emerald-100/60'
                            : 'bg-rose-50 text-rose-600 border border-rose-100/60'
                            }`}>
                            {q.masteryStatus === 'mastered' ? '已掌握' : '待练习'}
                          </span>
                          <span className="text-xs text-slate-500 font-bold bg-slate-50 border border-slate-200/50 px-2 py-0.5 rounded-md">
                            来自: {notebookName}
                          </span>
                        </div>

                        <div className="text-xs font-semibold text-slate-700 leading-relaxed group-hover:text-blue-600 transition-colors line-clamp-2">
                          <InlineContent text={cleanText || '无文本内容'} />
                        </div>

                        {q.knowledgePoints && q.knowledgePoints.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {q.knowledgePoints.slice(0, 3).map((p, idx) => (
                              <span
                                key={idx}
                                className="text-xs font-bold px-2 py-0.5 rounded bg-slate-50 text-slate-500 border border-slate-200/60"
                              >
                                {p}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all shrink-0" />
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 bg-white rounded-2xl border border-slate-200/80 text-slate-400 text-center">
              <BookOpen className="w-10 h-10 text-slate-200 mb-2.5" />
              <p className="text-xs font-semibold text-slate-500">暂无最近错题</p>
              <p className="text-[11px] text-slate-400 mt-1">
                开始在“上传错题”中积累您的第一道错题吧
              </p>
            </div>
          )}
        </div>

        {/* 右/下侧：我的错题本 */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-slate-900">
            <Database className="w-5 h-5 text-blue-600 shrink-0" />
            <h3 className="text-base font-extrabold tracking-tight">我的错题本</h3>
            <span className="text-[12px] text-slate-400 font-bold uppercase">各学科及分类整理</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {notebooks.filter(nb => nb.type !== 'variation').map((nb) => {
              const nbQuestions = questions.filter(q => q.notebookId === nb.id);
              const totalCount = nbQuestions.length;
              const unmasteredCount = nbQuestions.filter(q => q.masteryStatus !== 'mastered').length;
              const timeStr = nb.updatedAt
                ? new Date(nb.updatedAt).toLocaleDateString()
                : '暂无';

              return (
                <div
                  key={nb.id}
                  onClick={() => onNavigate('library', { notebookId: nb.id })}
                  className="group flex flex-col justify-between p-4 bg-white rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition-all duration-300 cursor-pointer hover:-translate-y-0.5"
                >
                  <div>
                    <div className="flex items-start justify-between">
                      <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 border border-blue-100/50 flex items-center justify-center shrink-0">
                        <Database className="w-4.5 h-4.5" />
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all shrink-0" />
                    </div>

                    <h4 className="text-base font-extrabold text-slate-900 mt-2.5 group-hover:text-blue-600 transition-colors truncate">
                      {nb.name}
                    </h4>
                    <p className="text-xs text-slate-400 mt-1 font-bold truncate">
                      {nb.grade || '未设年级'} · {nb.subject || '其他'} · 错题集
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-bold">
                    <div className="flex gap-2">
                      <span>{totalCount} 错题</span>
                      <span className="text-amber-600">{unmasteredCount} 未掌握</span>
                    </div>
                    <span className="text-slate-400">{timeStr}</span>
                  </div>
                </div>
              );
            })}

            {/* 创建新错题本卡片 */}
            <div
              onClick={() => setShowCreateModal(true)}
              className="group flex flex-col items-center justify-center p-4 bg-slate-50/50 hover:bg-slate-50 rounded-2xl border border-dashed border-slate-300 hover:border-blue-400 hover:text-blue-600 transition-all duration-300 cursor-pointer hover:-translate-y-0.5 min-h-[140px]"
            >
              <Plus className="w-6 h-6 text-slate-400 mb-2 group-hover:text-blue-600" />
              <span className="text-xs font-extrabold text-slate-600">创建新错题本</span>
              <span className="text-[13px] text-slate-400 mt-1">按科目或考试整理</span>
            </div>
          </div>
        </div>

      </div>

      {/* 新建错题本对话框 */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl border border-slate-100 shadow-2xl max-w-sm w-full p-6 space-y-5 animate-in fade-in zoom-in-95 duration-200 relative">

            {/* 顶部标题栏 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-800">
                <span className="text-lg">📓</span>
                <span className="text-base font-extrabold text-slate-900">新建错题本</span>
              </div>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setNewNotebookName('');
                  setNewNotebookDescription('');
                }}
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors cursor-pointer"
              >
                <span className="text-base font-bold">✕</span>
              </button>
            </div>

            {/* 表单区域 */}
            <div className="space-y-4">
              {/* 名称 */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">名称</label>
                <input
                  type="text"
                  placeholder="例如：初二"
                  value={newNotebookName}
                  onChange={(e) => setNewNotebookName(e.target.value)}
                  className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2.5 h-[38px] focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-slate-50/50"
                />
              </div>

              {/* 年级 & 学科 并排 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">年级</label>
                  <select
                    value={newNotebookGrade}
                    onChange={(e) => setNewNotebookGrade(e.target.value)}
                    className="w-full text-xs border border-slate-200 rounded-xl px-3 h-[38px] focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-slate-50/50 text-slate-700"
                  >
                    <option value="">选择年级</option>
                    <option value="一年级">一年级</option>
                    <option value="二年级">二年级</option>
                    <option value="三年级">三年级</option>
                    <option value="四年级">四年级</option>
                    <option value="五年级">五年级</option>
                    <option value="六年级">六年级</option>
                    <option value="初一">初一</option>
                    <option value="初二">初二</option>
                    <option value="初三">初三</option>
                    <option value="高一">高一</option>
                    <option value="高二">高二</option>
                    <option value="高三">高三</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">学科</label>
                  <select
                    value={newNotebookSubject}
                    onChange={(e) => setNewNotebookSubject(e.target.value)}
                    className="w-full text-xs border border-slate-200 rounded-xl px-3 h-[38px] focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-slate-50/50 text-slate-700"
                  >
                    <option value="">选择学科</option>
                    <option value="数学">数学</option>
                    <option value="语文">语文</option>
                    <option value="英语">英语</option>
                    <option value="物理">物理</option>
                    <option value="化学">化学</option>
                    <option value="生物">生物</option>
                    <option value="历史">历史</option>
                    <option value="地理">地理</option>
                    <option value="政治">政治</option>
                    <option value="其他">其他</option>
                  </select>
                </div>
              </div>

              {/* 描述（可选） */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">描述 (可选)</label>
                <textarea
                  placeholder="例如：方程、函数、几何证明等重点易错题集合"
                  value={newNotebookDescription}
                  onChange={(e) => setNewNotebookDescription(e.target.value)}
                  rows={3}
                  className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-slate-50/50 resize-none"
                />
              </div>
            </div>

            {/* 底部按钮栏 */}
            <div className="flex items-center justify-between gap-4 pt-2">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setNewNotebookName('');
                  setNewNotebookDescription('');
                }}
                className="w-1/2 py-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold text-slate-600 transition-colors cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={handleCreateNotebook}
                className="w-1/2 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                保存
              </button>
            </div>

          </div>
        </div>
      )}

      {/* 错题详情将不再作为 fixed 模态框，而是由上方的 early return 在 main 区域中渲染 */}

    </div>
  );
}
