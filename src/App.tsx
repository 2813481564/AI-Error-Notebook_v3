import React, { useState, ReactNode, useEffect } from 'react';
import { Camera, Database, Home, HelpCircle, HardDrive, Users, BookOpen, Award, CheckCircle2, Sparkles, FileText, Globe, Check, Mail, EyeOff, Eye, Lock } from 'lucide-react';
import Dashboard from './components/Dashboard';
import AddQuestion from './components/AddQuestion';
import QuestionLibrary from './components/QuestionLibrary';
import UserManagement from './components/UserManagement';
import TestPaper from './components/TestPaper';
import PublicQuestionLibrary from './components/PublicQuestionLibrary';
import VipCenter from './components/VipCenter';

type View = 'dashboard' | 'add' | 'library' | 'users' | 'paper' | 'publicLibrary' | 'vipCenter';

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

  // 注册与验证码状态
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [regEmail, setRegEmail] = useState('');
  const [regCode, setRegCode] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regSuccess, setRegSuccess] = useState<string | null>(null);
  const [sendCodeLoading, setSendCodeLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [showPassword, setShowPassword] = useState(false);

  // 会员信息状态
  const [userInfo, setUserInfo] = useState<{
    role: string;
    vipExpireAt: string | null;
    aiUsedToday: number;
    aiLimit: number;
    aiRemaining: string | number;
  } | null>(null);

  // 定时器用于验证码倒计时
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  // 拉取个人会员及额度信息
  const fetchUserInfo = async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/user/info', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUserInfo(data);
        localStorage.setItem('errorbook_role', data.role);
        setRole(data.role);
      }
    } catch (e) {
      console.error("Failed to fetch user info:", e);
    }
  };

  useEffect(() => {
    if (token) {
      fetchUserInfo();
    }
  }, [token]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authUsername.trim() || !authPassword.trim()) {
      setAuthError('请完整输入账号/邮箱和密码');
      return;
    }

    setAuthLoading(true);
    setAuthError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          username: authUsername.trim(), 
          password: authPassword.trim(),
          loginRole: 'teacher'
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

  // 发送邮箱验证码
  const handleSendCode = async () => {
    if (!regEmail.trim()) {
      setAuthError('请先输入QQ邮箱');
      return;
    }
    setSendCodeLoading(true);
    setAuthError(null);
    setRegSuccess(null);
    try {
      const res = await fetch('/api/auth/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: regEmail.trim() })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '验证码发送失败');
      }
      setRegSuccess('验证码发送成功，若未收到请检查垃圾箱，或查看后台终端控制台 [DEV] 输出');
      setCountdown(60);
    } catch (err: any) {
      setAuthError(err.message);
    } finally {
      setSendCodeLoading(false);
    }
  };

  // 用户注册
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regEmail.trim() || !regCode.trim() || !regPassword.trim()) {
      setAuthError('请完整填写所有注册字段');
      return;
    }
    setAuthLoading(true);
    setAuthError(null);
    setRegSuccess(null);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: regEmail.trim(),
          password: regPassword.trim(),
          code: regCode.trim()
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '注册失败');
      }
      
      // 注册成功直接自动登录
      localStorage.setItem('errorbook_token', data.token);
      localStorage.setItem('errorbook_username', data.username);
      localStorage.setItem('errorbook_role', data.role || 'student');
      setToken(data.token);
      setUsername(data.username);
      setRole(data.role || 'student');
      // 重置注册框状态
      setIsRegisterMode(false);
      setRegEmail('');
      setRegCode('');
      setRegPassword('');
    } catch (err: any) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen w-full flex bg-[#faf9f6] font-sans text-slate-700 overflow-y-auto">
        
        {/* Left Intro Pane (Hidden on Mobile) */}
        <div className="hidden lg:flex w-[55%] flex-col justify-between p-16 bg-gradient-to-tr from-[#fbf9f5] via-[#f8f5ee] to-[#ebe5d7] border-r border-[#e9e5dd] relative overflow-hidden select-none">
          <div className="absolute top-[-20%] left-[-20%] w-[80%] h-[80%] rounded-full bg-gradient-to-br from-[#c4a578]/10 to-transparent blur-[120px] pointer-events-none"></div>
          
          {/* Header Logo */}
          <div className="flex items-center gap-3.5 z-10">
            <div className="w-11 h-11 bg-gradient-to-br from-[#d4b588] to-[#c4a578] rounded-2xl flex items-center justify-center shadow-lg shadow-[#c4a578]/25 text-white font-extrabold text-lg">
              AI
            </div>
            <div className="flex flex-col">
              <h2 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-1.5">
                爱错题
                <span className="text-[10px] font-black bg-[#c4a578]/10 text-[#c4a578] px-2 py-0.5 rounded-lg border border-[#c4a578]/20">AI 错题本</span>
              </h2>
            </div>
          </div>

          {/* Slogans & Features */}
          <div className="my-auto max-w-lg z-10">
            <div className="space-y-3 mb-10">
              <h1 className="text-3xl font-extrabold text-slate-850 tracking-tight leading-tight">
                拍照即录入，爱错题智能分析
              </h1>
              <p className="text-slate-450 text-sm font-semibold tracking-wide">
                让每一道错题都变成掌握的起点
              </p>
            </div>

            {/* Feature Cards */}
            <div className="space-y-4">
              {/* Card 1 */}
              <div className="flex items-start gap-4.5 bg-white/70 backdrop-blur-md p-5 rounded-2xl border border-white/80 shadow-sm shadow-[#c4a578]/5 transition hover:translate-y-[-2px] hover:shadow-md duration-300">
                <div className="p-3.5 bg-[#c4a578]/10 rounded-xl text-[#c4a578] shrink-0">
                  <Camera className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-800 text-[14px]">拍照识别</h4>
                  <p className="text-xs text-slate-450 mt-1 font-medium leading-relaxed">拍照或上传题目照片，AI 自动切题、提取并解析</p>
                </div>
              </div>

              {/* Card 2 */}
              <div className="flex items-start gap-4.5 bg-white/70 backdrop-blur-md p-5 rounded-2xl border border-white/80 shadow-sm shadow-[#c4a578]/5 transition hover:translate-y-[-2px] hover:shadow-md duration-300">
                <div className="p-3.5 bg-[#c4a578]/10 rounded-xl text-[#c4a578] shrink-0">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-800 text-[14px]">AI 智能解析</h4>
                  <p className="text-xs text-slate-450 mt-1 font-medium leading-relaxed">提供详细的解题步骤、多维错因归纳与关联知识点</p>
                </div>
              </div>

              {/* Card 3 */}
              <div className="flex items-start gap-4.5 bg-white/70 backdrop-blur-md p-5 rounded-2xl border border-white/80 shadow-sm shadow-[#c4a578]/5 transition hover:translate-y-[-2px] hover:shadow-md duration-300">
                <div className="p-3.5 bg-[#c4a578]/10 rounded-xl text-[#c4a578] shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-800 text-[14px]">智能组卷</h4>
                  <p className="text-xs text-slate-450 mt-1 font-medium leading-relaxed">自由挑选错题一键生成巩固试卷，导出高品质 PDF</p>
                </div>
              </div>

              {/* Card 4 */}
              <div className="flex items-start gap-4.5 bg-white/70 backdrop-blur-md p-5 rounded-2xl border border-white/80 shadow-sm shadow-[#c4a578]/5 transition hover:translate-y-[-2px] hover:shadow-md duration-300">
                <div className="p-3.5 bg-[#c4a578]/10 rounded-xl text-[#c4a578] shrink-0">
                  <Globe className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-800 text-[14px]">公共题库</h4>
                  <p className="text-xs text-slate-450 mt-1 font-medium leading-relaxed">精选共享海量题目，和大家一起讨论解题思路</p>
                </div>
              </div>
            </div>

            {/* Checklists */}
            <div className="mt-10 flex flex-wrap gap-x-6 gap-y-3 text-[11px] font-bold text-slate-500">
              <div className="flex items-center gap-1.5">
                <Check className="w-4 h-4 text-emerald-600" />
                支持数学公式与几何图形
              </div>
              <div className="flex items-center gap-1.5">
                <Check className="w-4 h-4 text-emerald-600" />
                多错题本分类管理
              </div>
              <div className="flex items-center gap-1.5">
                <Check className="w-4 h-4 text-emerald-600" />
                掌握度智能追踪
              </div>
              <div className="flex items-center gap-1.5">
                <Check className="w-4 h-4 text-emerald-600" />
                全平台数据同步
              </div>
            </div>
          </div>

          {/* Footer note */}
          <div className="text-xs text-slate-400 font-bold tracking-wide flex items-center gap-1.5 z-10">
            <span className="w-1.5 h-1.5 rounded-full bg-[#c4a578] animate-pulse"></span>
            已帮助数千名学生高效管理错题
          </div>
        </div>

        {/* Right Form Pane */}
        <div className="flex-1 flex flex-col justify-center items-center p-8 bg-[#faf9f6] md:bg-white">
          <div className="w-full max-w-[360px] space-y-6">
            
            {/* Logo and Slogan */}
            <div className="flex flex-col items-center">
              <div className="w-16 h-16 bg-[#c4a578] rounded-2xl flex items-center justify-center shadow-lg shadow-[#c4a578]/25 text-white font-extrabold text-2xl mb-4 select-none">
                AI
              </div>
              <h2 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-1 select-none">
                爱错题 <span className="text-xs font-semibold text-slate-400 font-mono">AI 错题本</span>
              </h2>
              <p className="text-xs text-slate-450 mt-1.5 font-bold tracking-wide select-none">
                {isRegisterMode ? '欢迎注册使用爱错题' : '欢迎回到爱错题'}
              </p>
            </div>

            {/* Switch Tabs */}
            <div className="flex bg-[#f3f1ec] p-1 rounded-2xl">
              <button
                type="button"
                onClick={() => {
                  setIsRegisterMode(false);
                  setAuthError(null);
                  setRegSuccess(null);
                }}
                className={`flex-1 py-2 text-center rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  !isRegisterMode
                    ? 'bg-[#c4a578] text-white shadow-sm font-black'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                登录
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsRegisterMode(true);
                  setAuthError(null);
                  setRegSuccess(null);
                }}
                className={`flex-1 py-2 text-center rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  isRegisterMode
                    ? 'bg-[#c4a578] text-white shadow-sm font-black'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                注册
              </button>
            </div>

            {/* Forms Container */}
            {isRegisterMode ? (
              // ================= 注册表单 =================
              <form onSubmit={handleRegister} className="space-y-4">
                {authError && (
                  <div className="bg-rose-50 text-rose-600 border border-rose-100 p-3.5 rounded-xl text-xs font-semibold flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping shrink-0"></span>
                    {authError}
                  </div>
                )}
                {regSuccess && (
                  <div className="bg-emerald-50 text-emerald-600 border border-emerald-100 p-3.5 rounded-xl text-xs font-semibold flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span className="leading-snug">{regSuccess}</span>
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1 flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-slate-400" />
                    QQ 邮箱
                  </label>
                  <div className="flex gap-2">
                    <input 
                      type="email"
                      placeholder="请输入您的 QQ 邮箱地址"
                      value={regEmail}
                      onChange={e => setRegEmail(e.target.value)}
                      className="flex-1 p-3 bg-[#f5f3ef] border border-[#e9e5dd] rounded-xl focus:ring-2 focus:ring-[#c4a578] focus:border-transparent outline-none text-sm font-semibold text-slate-800 transition-all placeholder-slate-400/80"
                      required
                    />
                    <button
                      type="button"
                      onClick={handleSendCode}
                      disabled={sendCodeLoading || countdown > 0}
                      className="bg-[#c4a578] hover:bg-[#b29368] text-white font-bold text-xs px-4 py-2 rounded-xl transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                    >
                      {countdown > 0 ? `${countdown}s` : '获取验证码'}
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1">邮箱验证码</label>
                  <input 
                    type="text"
                    placeholder="请输入 6 位验证码"
                    value={regCode}
                    onChange={e => setRegCode(e.target.value)}
                    className="w-full p-3 bg-[#f5f3ef] border border-[#e9e5dd] rounded-xl focus:ring-2 focus:ring-[#c4a578] focus:border-transparent outline-none text-sm font-semibold text-slate-800 transition-all placeholder-slate-400/80"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-slate-400" />
                    设置密码
                  </label>
                  <div className="relative">
                    <input 
                      type={showPassword ? "text" : "password"}
                      placeholder="设置您的账号密码（至少 6 位）"
                      value={regPassword}
                      onChange={e => setRegPassword(e.target.value)}
                      className="w-full p-3 bg-[#f5f3ef] border border-[#e9e5dd] rounded-xl focus:ring-2 focus:ring-[#c4a578] focus:border-transparent outline-none text-sm font-semibold text-slate-800 transition-all placeholder-slate-400/80 pr-10"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 outline-none cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button 
                  type="submit"
                  disabled={authLoading}
                  className="w-full bg-[#c4a578] hover:bg-[#b29368] text-white py-3 rounded-xl font-bold transition shadow-lg shadow-[#c4a578]/25 flex items-center justify-center gap-2 text-sm mt-6 cursor-pointer"
                >
                  {authLoading ? '正在注册...' : '立即注册'}
                </button>
              </form>
            ) : (
              // ================= 登录表单 =================
              <form onSubmit={handleAuth} className="space-y-4">
                {authError && (
                  <div className="bg-rose-50 text-rose-600 border border-rose-100 p-3.5 rounded-xl text-xs font-semibold flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping shrink-0"></span>
                    {authError}
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1 flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-slate-400" />
                    账号 / 注册邮箱
                  </label>
                  <input 
                    type="text"
                    placeholder="请输入邮箱或管理员账号（如: admin）"
                    value={authUsername}
                    onChange={e => setAuthUsername(e.target.value)}
                    className="w-full p-3 bg-[#f5f3ef] border border-[#e9e5dd] rounded-xl focus:ring-2 focus:ring-[#c4a578] focus:border-transparent outline-none text-sm font-semibold text-slate-800 transition-all placeholder-slate-400/80"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-slate-400" />
                    密码
                  </label>
                  <div className="relative">
                    <input 
                      type={showPassword ? "text" : "password"}
                      placeholder="请输入密码"
                      value={authPassword}
                      onChange={e => setAuthPassword(e.target.value)}
                      className="w-full p-3 bg-[#f5f3ef] border border-[#e9e5dd] rounded-xl focus:ring-2 focus:ring-[#c4a578] focus:border-transparent outline-none text-sm font-semibold text-slate-800 transition-all placeholder-slate-400/80 pr-10"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 outline-none cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex justify-between items-center text-xs pt-1 select-none">
                  <span />
                  <button
                    type="button"
                    onClick={() => alert("密码重置功能升级中，请联系平台管理员 admin 协助重置密码！")}
                    className="text-slate-400 hover:text-[#c4a578] font-bold transition-colors cursor-pointer"
                  >
                    忘记密码？
                  </button>
                </div>

                <button 
                  type="submit"
                  disabled={authLoading}
                  className="w-full bg-[#c4a578] hover:bg-[#b29368] text-white py-3 rounded-xl font-bold transition shadow-lg shadow-[#c4a578]/25 flex items-center justify-center gap-2 text-sm mt-6 cursor-pointer"
                >
                  {authLoading ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                      正在登录...
                    </>
                  ) : (
                    '安全登录'
                  )}
                </button>
              </form>
            )}

            {/* Brand Footer */}
            <div className="text-center text-[10px] text-slate-350 font-extrabold tracking-widest pt-4 select-none">
              ai-cuoti.com
            </div>

          </div>
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

          {role !== 'student' && (
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
          )}
          
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

          <button
            onClick={() => setCurrentView('vipCenter')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              currentView === 'vipCenter' 
                ? 'bg-blue-50 text-blue-700 shadow-sm' 
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
            }`}
          >
            <Award className="w-4 h-4" />
            <span>会员中心</span>
          </button>
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
            <div className="mt-2.5 pt-2.5 border-t border-white/10 flex flex-col gap-0.5 text-[10px]">
              <div className="flex justify-between">
                <span className="text-slate-400">账号:</span>
                <span className="font-bold text-blue-400 truncate max-w-[120px]">{username}</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-slate-400">身份:</span>
                <span className="font-bold text-yellow-400">{role?.toUpperCase()}</span>
              </div>
              {userInfo?.vipExpireAt && (
                <div className="flex justify-between mt-1">
                  <span className="text-slate-400">过期:</span>
                  <span className="font-semibold text-slate-300">{userInfo.vipExpireAt}</span>
                </div>
              )}
              <div className="flex justify-between mt-1">
                <span className="text-slate-400">今日AI:</span>
                <span className="font-bold text-slate-200">{userInfo?.aiRemaining === "无限" ? "无限制" : `${userInfo?.aiUsedToday || 0} / ${userInfo?.aiLimit || 30}`}</span>
              </div>
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
            {currentView === 'publicLibrary' && role !== 'student' && (
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
            {currentView === 'vipCenter' && (
              <VipCenter 
                token={token}
                userInfo={userInfo}
                onRefresh={fetchUserInfo}
              />
            )}
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
            icon={<Award className="w-5 h-5" />} label="会员中心" 
            active={currentView === 'vipCenter'} 
            onClick={() => setCurrentView('vipCenter')} 
          />
          {role !== 'student' && (
            <NavItem 
              icon={<BookOpen className="w-5 h-5" />} label="公共题库" 
              active={currentView === 'publicLibrary'} 
              onClick={() => setCurrentView('publicLibrary')} 
            />
          )}
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


