import React, { useState, ReactNode } from 'react';
import { Camera, Database, Home, HelpCircle, HardDrive, Users, BookOpen } from 'lucide-react';
import Dashboard from './components/Dashboard';
import AddQuestion from './components/AddQuestion';
import QuestionLibrary from './components/QuestionLibrary';
import UserManagement from './components/UserManagement';
import TestPaper from './components/TestPaper';
import PublicQuestionLibrary from './components/PublicQuestionLibrary';

type View = 'dashboard' | 'add' | 'library' | 'users' | 'paper' | 'publicLibrary';

export default function App() {
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [showSqlTip, setShowSqlTip] = useState(false);
  const [paperQuestions, setPaperQuestions] = useState<any[]>([]);
  const [paperSourceView, setPaperSourceView] = useState<View>('library');

  const [token, setToken] = useState<string | null>(localStorage.getItem('errorbook_token'));
  const [username, setUsername] = useState<string | null>(localStorage.getItem('errorbook_username'));
  const [role, setRole] = useState<string | null>(localStorage.getItem('errorbook_role'));
  
  const [loginRole, setLoginRole] = useState<'student' | 'teacher'>('student');
  const [loginType, setLoginType] = useState<'idCard' | 'phone'>('idCard');
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [idCardLast6, setIdCardLast6] = useState('');
  const [phoneLast4, setPhoneLast4] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authUsername.trim()) {
      setAuthError('姓名或账号不能为空');
      return;
    }
    if (loginRole === 'student') {
      if (loginType === 'idCard' && !idCardLast6.trim()) {
        setAuthError('身份证后6位不能为空');
        return;
      }
      if (loginType === 'phone' && !phoneLast4.trim()) {
        setAuthError('手机号后4位不能为空');
        return;
      }
    } else {
      if (!authPassword.trim()) {
        setAuthError('密码不能为空');
        return;
      }
    }

    setAuthLoading(true);
    setAuthError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          username: authUsername.trim(), 
          password: loginRole === 'teacher' ? authPassword.trim() : undefined,
          loginRole,
          loginType: loginRole === 'student' ? loginType : undefined,
          idCardLast6: (loginRole === 'student' && loginType === 'idCard') ? idCardLast6.trim() : undefined,
          phoneLast4: (loginRole === 'student' && loginType === 'phone') ? phoneLast4.trim() : undefined
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '登录失败');
      }
      localStorage.setItem('errorbook_token', data.token);
      localStorage.setItem('errorbook_username', data.username);
      localStorage.setItem('errorbook_role', data.role || 'student');
      setToken(data.token);
      setUsername(data.username);
      setRole(data.role || 'student');
      setAuthUsername('');
      setAuthPassword('');
      setIdCardLast6('');
      setPhoneLast4('');
    } catch (err: any) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
    } catch (e) {
      console.error(e);
    }
    localStorage.removeItem('errorbook_token');
    localStorage.removeItem('errorbook_username');
    localStorage.removeItem('errorbook_role');
    setToken(null);
    setUsername(null);
    setRole(null);
    window.location.reload();
  };

  // 全局登录拦截
  if (!token) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-tr from-slate-900 via-blue-900 to-indigo-950 p-4 font-sans text-slate-800">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-600/20 via-transparent to-transparent pointer-events-none"></div>
        <div className="w-full max-w-md bg-white/95 backdrop-blur-lg rounded-3xl border border-white/20 p-8 shadow-2xl animate-in fade-in zoom-in-95 duration-300 relative overflow-hidden">
          
          {/* Decorative Top Accent */}
          <div className="h-1.5 w-full bg-gradient-to-r from-blue-500 to-indigo-600 absolute top-0 left-0"></div>
          
          <div className="flex flex-col items-center mb-6">
            <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/30 mb-4 animate-bounce duration-1000">
              <span className="text-white font-extrabold text-sm tracking-widest">AI</span>
            </div>
            <h2 className="text-2xl font-black text-slate-955 tracking-tight text-center">智能错题本</h2>
            <p className="text-xs text-slate-500 mt-1.5 font-medium text-center">
              登录以访问您个人的物理错题库
            </p>
          </div>

          {/* 角色选择 Tab */}
          <div className="flex bg-slate-100 p-1 rounded-2xl mb-6">
            <button
              type="button"
              onClick={() => {
                setLoginRole('student');
                setAuthError(null);
              }}
              className={`flex-1 py-2 text-center rounded-xl text-xs font-bold transition-all cursor-pointer ${
                loginRole === 'student'
                  ? 'bg-white text-blue-600 shadow-sm font-black'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              学生登录
            </button>
            <button
              type="button"
              onClick={() => {
                setLoginRole('teacher');
                setAuthError(null);
              }}
              className={`flex-1 py-2 text-center rounded-xl text-xs font-bold transition-all cursor-pointer ${
                loginRole === 'teacher'
                  ? 'bg-white text-blue-600 shadow-sm font-black'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              老师 / 管理员登录
            </button>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            {authError && (
              <div className="bg-rose-50 text-rose-600 border border-rose-100 p-3.5 rounded-xl text-xs font-semibold flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping"></span>
                {authError}
              </div>
            )}

            {loginRole === 'student' ? (
              <>
                {/* 学生验证方式切换 */}
                <div className="flex gap-4 mb-2 pl-1 justify-center">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 cursor-pointer">
                    <input
                      type="radio"
                      name="loginType"
                      checked={loginType === 'idCard'}
                      onChange={() => setLoginType('idCard')}
                      className="text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    <span>姓名 + 身份证后6位</span>
                  </label>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 cursor-pointer">
                    <input
                      type="radio"
                      name="loginType"
                      checked={loginType === 'phone'}
                      onChange={() => setLoginType('phone')}
                      className="text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    <span>姓名 + 手机号后4位</span>
                  </label>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">学生姓名</label>
                  <input 
                    type="text"
                    placeholder="请输入真实姓名"
                    value={authUsername}
                    onChange={e => setAuthUsername(e.target.value)}
                    className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm font-semibold text-slate-800 transition-all placeholder-slate-400"
                    required
                  />
                </div>

                {loginType === 'idCard' ? (
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">身份证后6位</label>
                    <input 
                      type="text"
                      placeholder="请输入身份证最后6位（含英文字母）"
                      value={idCardLast6}
                      onChange={e => setIdCardLast6(e.target.value)}
                      className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm font-semibold text-slate-800 transition-all placeholder-slate-400"
                      maxLength={6}
                      required
                    />
                  </div>
                ) : (
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">手机号后4位</label>
                    <input 
                      type="text"
                      placeholder="请输入绑定的手机号后4位"
                      value={phoneLast4}
                      onChange={e => setPhoneLast4(e.target.value)}
                      className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm font-semibold text-slate-800 transition-all placeholder-slate-400"
                      maxLength={4}
                      required
                    />
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">账号 / 邮箱</label>
                  <input 
                    type="text"
                    placeholder="邮箱或管理员账号（如: admin）"
                    value={authUsername}
                    onChange={e => setAuthUsername(e.target.value)}
                    className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm font-semibold text-slate-800 transition-all placeholder-slate-400"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">密码</label>
                  <input 
                    type="password"
                    placeholder="请输入登录密码"
                    value={authPassword}
                    onChange={e => setAuthPassword(e.target.value)}
                    className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm font-semibold text-slate-800 transition-all placeholder-slate-400"
                    required
                  />
                </div>
              </>
            )}

            <button 
              type="submit"
              disabled={authLoading}
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-3.5 rounded-xl font-bold hover:from-blue-700 hover:to-indigo-700 transition shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2 text-sm mt-6 cursor-pointer"
            >
              {authLoading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  正在处理...
                </>
              ) : (
                '安全登录'
              )}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full bg-slate-50 font-sans text-slate-800 overflow-hidden">
      
      {/* Sidebar Navigation - Desktop */}
      <aside className="w-64 bg-white border-r border-slate-200 hidden md:flex flex-col shrink-0">
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-md shadow-blue-600/20">
              <span className="text-white font-bold text-xs">AI</span>
            </div>
            <h1 className="text-lg font-extrabold tracking-tight text-slate-900">智能错题本</h1>
          </div>
        </div>
        
        <nav className="flex-1 p-4 space-y-1.5">
          <button
            onClick={() => setCurrentView('dashboard')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              currentView === 'dashboard' 
                ? 'bg-blue-50 text-blue-700 shadow-sm' 
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
            }`}
          >
            <Home className="w-4 h-4" />
            <span>首页统计</span>
          </button>
          
          {role !== 'student' && (
            <button
              onClick={() => setCurrentView('add')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                currentView === 'add' 
                  ? 'bg-blue-50 text-blue-700 shadow-sm' 
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
              }`}
            >
              <Camera className="w-4 h-4" />
              <span>拍照录题</span>
            </button>
          )}
          
          <button
            onClick={() => setCurrentView('library')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              currentView === 'library' 
                ? 'bg-blue-50 text-blue-700 shadow-sm' 
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
            }`}
          >
            <Database className="w-4 h-4" />
            <span>错题库管理</span>
          </button>

          <button
            onClick={() => setCurrentView('publicLibrary')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              currentView === 'publicLibrary' 
                ? 'bg-blue-50 text-blue-700 shadow-sm' 
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>公共题库</span>
          </button>
          
          {role === 'admin' && (
            <button
              onClick={() => setCurrentView('users')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                currentView === 'users' 
                  ? 'bg-blue-50 text-blue-700 shadow-sm' 
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>用户管理</span>
            </button>
          )}
        </nav>

        {/* SQLite Storage Status & Link */}
        <div className="p-4 border-t border-slate-100 space-y-3">
          <button 
            onClick={() => setShowSqlTip(true)}
            className="w-full text-left p-3.5 bg-slate-900 rounded-2xl text-white hover:bg-black transition-colors relative group overflow-hidden"
          >
            <div className="absolute right-3 top-3.5 text-white/40 group-hover:text-white transition-colors">
              <HelpCircle className="w-4 h-4" />
            </div>
            <p className="text-[10px] tracking-wider font-bold text-slate-400 uppercase mb-1">SQLite 数据库</p>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <p className="text-xs font-semibold">存储状态: 已连接 (多用户隔离)</p>
            </div>
            <div className="mt-2.5 pt-2.5 border-t border-white/10 flex flex-col gap-0.5">
              <p className="text-[10px] text-slate-400">当前登录用户:</p>
              <p className="text-xs font-bold text-blue-400 truncate">{username}</p>
            </div>
          </button>
          
          <button
            onClick={handleLogout}
            className="w-full bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200/50 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm shadow-rose-500/5 cursor-pointer"
          >
            <span>退出登录</span>
          </button>
        </div>
      </aside>

      {/* Main Container */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        
        {/* Mobile Header (Hidden on Desktop) */}
        <header className="md:hidden flex h-16 bg-white border-b border-slate-200 items-center justify-between px-5 sticky top-0 z-25 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-[10px]">AI</span>
            </div>
            <h1 className="text-md font-extrabold tracking-tight text-slate-900">智能错题本</h1>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => setShowSqlTip(true)}
              className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-full px-3 py-1.5 font-bold transition-colors flex items-center gap-1"
            >
              <HardDrive className="w-3 h-3" />
              存储说明
            </button>
            <button 
              onClick={handleLogout}
              className="text-[10px] bg-rose-50 text-rose-600 rounded-full px-3 py-1.5 font-bold hover:bg-rose-100 transition-colors"
            >
              退出
            </button>
          </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 h-full overflow-y-auto p-4 md:p-8 pb-24 md:pb-8">
          <div className="max-w-4xl mx-auto space-y-6">
            {currentView === 'dashboard' && <Dashboard onNavigate={setCurrentView} />}
            {currentView === 'add' && <AddQuestion onNavigate={setCurrentView} />}
            {currentView === 'library' && (
              <QuestionLibrary 
                onNavigate={setCurrentView} 
                onGeneratePaper={(selected) => {
                  setPaperQuestions(selected);
                  setPaperSourceView('library');
                  setCurrentView('paper');
                }} 
              />
            )}
            {currentView === 'publicLibrary' && (
              <PublicQuestionLibrary 
                onNavigate={setCurrentView}
                onGeneratePaper={(selected) => {
                  setPaperQuestions(selected);
                  setPaperSourceView('publicLibrary');
                  setCurrentView('paper');
                }}
              />
            )}
            {currentView === 'users' && username === 'admin' && <UserManagement onNavigate={setCurrentView} />}
            {currentView === 'paper' && (
              <TestPaper 
                questions={paperQuestions} 
                onBack={() => setCurrentView(paperSourceView)} 
              />
            )}
          </div>
        </main>

        {/* Mobile Navigation - Only Bottom */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex items-center justify-around pb-safe z-20">
          <NavItem 
            icon={<Home className="w-5 h-5" />} label="首页" 
            active={currentView === 'dashboard'} 
            onClick={() => setCurrentView('dashboard')} 
          />
          {role === 'admin' ? (
            <NavItem 
              icon={<Users className="w-5 h-5" />} label="用户管理" 
              active={currentView === 'users'} 
              onClick={() => setCurrentView('users')} 
            />
          ) : role !== 'student' ? (
            <div className="relative -top-5">
              <button 
                onClick={() => setCurrentView('add')}
                className="w-14 h-14 bg-blue-600 rounded-full flex items-center justify-center text-white shadow-lg shadow-blue-600/30 hover:bg-blue-700 transition-colors"
              >
                 <Camera className="w-6 h-6" />
              </button>
            </div>
          ) : null}
          <NavItem 
            icon={<Database className="w-5 h-5" />} label="错题库" 
            active={currentView === 'library'} 
            onClick={() => setCurrentView('library')} 
          />
          <NavItem 
            icon={<BookOpen className="w-5 h-5" />} label="公共题库" 
            active={currentView === 'publicLibrary'} 
            onClick={() => setCurrentView('publicLibrary')} 
          />
        </nav>
      </div>

      {/* SQLite Instruction Modal */}
      {showSqlTip && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-6 relative animate-in fade-in zoom-in-95 duration-200">
            <button 
              onClick={() => setShowSqlTip(false)} 
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 font-bold text-lg outline-none"
            >
              ✕
            </button>
            <div className="mb-4 flex items-center gap-2 text-blue-600 font-bold">
              <HardDrive className="w-5 h-5" />
              <h3 className="text-lg">多用户 SQLite 存储信息</h3>
            </div>
            
            <div className="space-y-4 text-slate-600 text-sm leading-relaxed">
              <p>
                您的错题数据已经由前端的 <strong>IndexedDB (浏览器本地存储)</strong> 成功迁移至服务端的 <strong>SQLite 物理数据库 (questions.db)</strong> 中。
              </p>
              <p>
                <strong>安全与隔离设计：</strong>
              </p>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  所有用户的密码都经过高强度密码哈希算法保护，确保密码安全。
                </li>
                <li>
                  数据绑定独立账号归属（<code>userId</code>），不同用户间数据从物理层面绝对隔离。
                </li>
                <li>
                  只要在一台支持互联网访问的多终端设备上登录相同账号，错题即可完美同步。
                </li>
              </ul>
            </div>

            <button 
              onClick={() => setShowSqlTip(false)}
              className="mt-6 w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-colors cursor-pointer"
            >
              我知道了
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

function NavItem({ icon, label, active, onClick }: { icon: ReactNode, label: string, active: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`flex flex-col items-center justify-center w-full py-3 ${active ? 'text-blue-600' : 'text-slate-500 hover:text-slate-950'}`}
    >
      <div className="w-5 h-5 mb-1">{icon}</div>
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  );
}


