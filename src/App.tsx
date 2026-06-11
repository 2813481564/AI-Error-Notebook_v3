import React, { useState, ReactNode, useEffect } from 'react';
import { Camera, Database, Home, HelpCircle, HardDrive, Users, BookOpen, Award, CheckCircle2, Sparkles, FileText, Globe, Check, Mail, EyeOff, Eye, Lock, User, Settings, Megaphone } from 'lucide-react';
import Dashboard from './components/Dashboard';
import AddQuestion from './components/AddQuestion';
import QuestionLibrary from './components/QuestionLibrary';
import UserManagement from './components/UserManagement';
import TestPaper from './components/TestPaper';
import VipCenter from './components/VipCenter';
import SystemSettings from './components/SystemSettings';
import AnnouncementManagement from './components/AnnouncementManagement';
import CreatePaperExercise from './components/CreatePaperExercise';
import SavedPapers from './components/SavedPapers';

type View = 'dashboard' | 'add' | 'library' | 'users' | 'paper' | 'vipCenter' | 'settings' | 'announcements' | 'exercise' | 'papers';

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
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#f4f6f9] font-sans text-slate-700 p-4 md:p-6 overflow-y-auto">

        {/* Main Card Container */}
        <div className="w-full max-w-[960px] min-h-[560px] bg-white rounded-[24px] shadow-xl shadow-slate-200/50 flex overflow-hidden border border-slate-100/80">

          {/* Left Intro Pane (Hidden on Mobile) */}
          <div
            className="hidden md:flex w-[42%] flex-col justify-between p-10 bg-[#f0f6ff] relative select-none shrink-0"
            style={{
              backgroundImage: 'radial-gradient(#c7dffc 1.2px, transparent 1.2px)',
              backgroundSize: '16px 16px'
            }}
          >
            {/* Top Logo */}
            <div className="flex items-center gap-3.5 z-10">
              <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-md shadow-blue-100/80">
                {/* Custom SVG Tech Book Logo */}
                <svg viewBox="0 0 100 100" className="w-9 h-9">
                  <defs>
                    <linearGradient id="bookGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#3b82f6" />
                      <stop offset="100%" stopColor="#1d4ed8" />
                    </linearGradient>
                    <linearGradient id="sparkGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#ffffff" />
                      <stop offset="100%" stopColor="#93c5fd" />
                    </linearGradient>
                  </defs>
                  {/* 书脊 */}
                  <path d="M22,25 C22,21.5 25,19 29,19 L32,19 L32,81 L29,81 C25,81 22,78.5 22,75 Z" fill="#1e40af" />
                  {/* 书页立体厚度 */}
                  <path d="M32,19 L72,19 C76,19 78,21.5 78,25 L78,75 C78,78.5 76,81 72,81 L32,81 Z" fill="url(#bookGrad)" />
                  {/* 右上角折角，增加立体感 */}
                  <path d="M72,19 L78,25 L72,25 Z" fill="#1e3a8a" opacity="0.4" />
                  {/* 四角星 AI 智能星光 */}
                  <path d="M52,33 Q52,45 40,45 Q52,45 52,57 Q52,45 64,45 Q52,45 52,33 Z" fill="url(#sparkGrad)" />
                  {/* 小闪光 */}
                  <path d="M68,26 Q68,31 63,31 Q68,31 68,36 Q68,31 73,31 Q68,31 68,26 Z" fill="#60a5fa" />
                  {/* 数据分析底线与圆点 */}
                  <line x1="40" y1="67" x2="62" y2="67" stroke="#93c5fd" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="1 4" />
                  <circle cx="67" cy="67" r="2" fill="#ffffff" />
                </svg>
              </div>
            </div>

            {/* Title & Slogan */}
            <div className="z-10">
              <h1 className="text-[28px] font-extrabold text-slate-800 tracking-tight leading-tight">
                探索智能解析，
              </h1>
              <h1 className="text-[28px] font-extrabold text-slate-800 tracking-tight leading-tight mt-1">
                提升学习效率。
              </h1>
              <p className="text-slate-400 text-xs font-semibold leading-relaxed mt-4">
                加入猫头鹰 AI错题本，<br />体验全新的错题整理模式。
              </p>
            </div>

            {/* Social Proof Card */}
            <div className="bg-white/80 backdrop-blur-md p-4 rounded-[18px] border border-white/50 shadow-sm shadow-blue-100/40 flex items-center gap-3.5 z-10">
              <div className="flex items-center">
                <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-blue-400 to-indigo-500 border-2 border-white flex items-center justify-center text-[9px] font-bold text-white shadow-sm">
                  师
                </div>
                <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-indigo-400 to-purple-500 border-2 border-white flex items-center justify-center text-[9px] font-bold text-white shadow-sm -ml-2.5">
                  生
                </div>
                <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-sky-400 to-blue-500 border-2 border-white flex items-center justify-center text-[9px] font-bold text-white shadow-sm -ml-2.5">
                  创
                </div>
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-slate-700 leading-none">超过 10,000+</span>
                <span className="text-[10px] text-slate-400 font-bold mt-1 leading-none">老师与学生的共同选择</span>
              </div>
            </div>

          </div>

          {/* Right Form Pane */}
          <div className="flex-1 p-8 md:p-12 flex flex-col justify-center bg-white">
            <div className="w-full max-w-[360px] mx-auto space-y-6">

              {/* Form Header */}
              <div>
                <h2 className="text-[26px] font-black text-slate-800 tracking-tight">
                  {isRegisterMode ? '加入我们' : '欢迎登录'}
                </h2>
                <p className="text-xs text-slate-400 mt-1.5 font-bold tracking-wide">
                  {isRegisterMode ? '欢迎注册使用AI错题识别' : '继续您的智能学习之旅。'}
                </p>
              </div>

              {/* Error & Success Messages */}
              {authError && (
                <div className="bg-rose-50 text-rose-600 border border-rose-100 px-4 py-3 rounded-2xl text-xs font-semibold flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping shrink-0"></span>
                  {authError}
                </div>
              )}
              {regSuccess && (
                <div className="bg-emerald-50 text-emerald-600 border border-emerald-100 px-4 py-3 rounded-2xl text-xs font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span className="leading-snug">{regSuccess}</span>
                </div>
              )}

              {/* Form Box */}
              {isRegisterMode ? (
                // ================= 注册表单 =================
                <form onSubmit={handleRegister} className="space-y-4">

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 pl-1 block">
                      QQ 邮箱
                    </label>
                    <div className="flex gap-2">
                      <div className="flex-1 relative flex items-center bg-slate-50 border border-transparent focus-within:border-blue-500 focus-within:bg-white rounded-full px-4.5 py-3 transition-all">
                        <Mail className="w-4.5 h-4.5 text-slate-400 mr-2.5 shrink-0" />
                        <input
                          type="email"
                          placeholder="请输入您的 QQ 邮箱地址"
                          value={regEmail}
                          onChange={e => setRegEmail(e.target.value)}
                          className="w-full bg-transparent border-none outline-none text-sm text-slate-700 placeholder-slate-400/80 font-medium"
                          required
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleSendCode}
                        disabled={sendCodeLoading || countdown > 0}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs px-5 py-3 rounded-full transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0 shadow-sm shadow-blue-500/10"
                      >
                        {countdown > 0 ? `${countdown}s` : '获取验证码'}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 pl-1 block">邮箱验证码</label>
                    <div className="relative flex items-center bg-slate-50 border border-transparent focus-within:border-blue-500 focus-within:bg-white rounded-full px-4.5 py-3 transition-all">
                      <Sparkles className="w-4.5 h-4.5 text-slate-400 mr-2.5 shrink-0" />
                      <input
                        type="text"
                        placeholder="请输入 6 位验证码"
                        value={regCode}
                        onChange={e => setRegCode(e.target.value)}
                        className="w-full bg-transparent border-none outline-none text-sm text-slate-700 placeholder-slate-400/80 font-medium"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 pl-1 block">
                      设置密码
                    </label>
                    <div className="relative flex items-center bg-slate-50 border border-transparent focus-within:border-blue-500 focus-within:bg-white rounded-full px-4.5 py-3 transition-all">
                      <Lock className="w-4.5 h-4.5 text-slate-400 mr-2.5 shrink-0" />
                      <input
                        type={showPassword ? "text" : "password"}
                        placeholder="设置您的账号密码（至少 6 位）"
                        value={regPassword}
                        onChange={e => setRegPassword(e.target.value)}
                        className="w-full bg-transparent border-none outline-none text-sm text-slate-700 placeholder-slate-400/80 font-medium pr-8"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4.5 text-slate-400 hover:text-slate-600 outline-none cursor-pointer"
                      >
                        {showPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={authLoading}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3.5 rounded-full font-extrabold transition shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2 text-sm mt-6 cursor-pointer"
                  >
                    {authLoading ? '正在注册...' : '立即注册'}
                  </button>
                </form>
              ) : (
                // ================= 登录表单 =================
                <form onSubmit={handleAuth} className="space-y-4">

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 pl-1 block">
                      用户名
                    </label>
                    <div className="relative flex items-center bg-slate-50 border border-transparent focus-within:border-blue-500 focus-within:bg-white rounded-full px-4.5 py-3 transition-all">
                      <User className="w-4.5 h-4.5 text-slate-400 mr-2.5 shrink-0" />
                      <input
                        type="text"
                        placeholder="请输入账号"
                        value={authUsername}
                        onChange={e => setAuthUsername(e.target.value)}
                        className="w-full bg-transparent border-none outline-none text-sm text-slate-700 placeholder-slate-400/80 font-medium"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 pl-1 block">
                      密码
                    </label>
                    <div className="relative flex items-center bg-slate-50 border border-transparent focus-within:border-blue-500 focus-within:bg-white rounded-full px-4.5 py-3 transition-all">
                      <Lock className="w-4.5 h-4.5 text-slate-400 mr-2.5 shrink-0" />
                      <input
                        type={showPassword ? "text" : "password"}
                        placeholder="请输入密码"
                        value={authPassword}
                        onChange={e => setAuthPassword(e.target.value)}
                        className="w-full bg-transparent border-none outline-none text-sm text-slate-700 placeholder-slate-400/80 font-medium pr-8"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4.5 text-slate-400 hover:text-slate-600 outline-none cursor-pointer"
                      >
                        {showPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex justify-between items-center text-xs pt-1 select-none">
                    <span />
                    <button
                      type="button"
                      onClick={() => alert("密码重置功能升级中，请联系平台管理员 admin 协助重置密码！")}
                      className="text-slate-400 hover:text-blue-600 font-bold transition-colors cursor-pointer"
                    >
                      忘记密码？
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={authLoading}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3.5 rounded-full font-extrabold transition shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2 text-sm mt-6 cursor-pointer"
                  >
                    {authLoading ? (
                      <>
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                        正在登录...
                      </>
                    ) : (
                      '立即登录'
                    )}
                  </button>
                </form>
              )}

              {/* Bottom Switch Link */}
              <div className="text-center text-xs font-semibold select-none pt-2">
                <span className="text-slate-400">
                  {isRegisterMode ? '已有账号？' : '还没有账号？'}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setIsRegisterMode(!isRegisterMode);
                    setAuthError(null);
                    setRegSuccess(null);
                  }}
                  className="text-blue-600 hover:text-blue-700 font-extrabold ml-1 cursor-pointer transition-colors"
                >
                  {isRegisterMode ? '立即登录' : '立即免费注册'}
                </button>
              </div>

            </div>
          </div>

        </div>

        {/* Brand Footer */}
        <div className="flex flex-col items-center gap-3 mt-8">
          <div className="text-[10px] text-slate-400 font-extrabold tracking-widest uppercase select-none">
            www.baidu.com
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

        <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
          <button
            onClick={() => setCurrentView('dashboard')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${currentView === 'dashboard'
              ? 'bg-blue-50 text-blue-700 shadow-sm'
              : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
              }`}
          >
            <Home className="w-4 h-4" />
            <span>首页</span>
          </button>

          <button
            onClick={() => setCurrentView('library')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${currentView === 'library'
              ? 'bg-blue-50 text-blue-700 shadow-sm'
              : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
              }`}
          >
            <Database className="w-4 h-4" />
            <span>我的错题本</span>
          </button>

          <button
            onClick={() => setCurrentView('add')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${currentView === 'add'
              ? 'bg-blue-50 text-blue-700 shadow-sm'
              : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
              }`}
          >
            <Camera className="w-4 h-4" />
            <span>上传错题</span>
          </button>

          <button
            onClick={() => setCurrentView('exercise')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${currentView === 'exercise'
              ? 'bg-blue-50 text-blue-700 shadow-sm'
              : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
              }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>组卷练习</span>
          </button>

          <button
            onClick={() => setCurrentView('papers')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${currentView === 'papers'
              ? 'bg-blue-50 text-blue-700 shadow-sm'
              : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
              }`}
          >
            <FileText className="w-4 h-4" />
            <span>我的试卷</span>
          </button>



          {role === 'admin' && (
            <button
              onClick={() => setCurrentView('users')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${currentView === 'users'
                ? 'bg-blue-50 text-blue-700 shadow-sm'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                }`}
            >
              <Users className="w-4 h-4" />
              <span>用户管理</span>
            </button>
          )}

          {role === 'admin' && (
            <button
              onClick={() => setCurrentView('settings')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${currentView === 'settings'
                ? 'bg-blue-50 text-blue-700 shadow-sm'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                }`}
            >
              <Settings className="w-4 h-4" />
              <span>系统设置</span>
            </button>
          )}

          {role === 'admin' && (
            <button
              onClick={() => setCurrentView('announcements')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${currentView === 'announcements'
                ? 'bg-blue-50 text-blue-700 shadow-sm'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                }`}
            >
              <Megaphone className="w-4 h-4" />
              <span>公告管理</span>
            </button>
          )}

          <button
            onClick={() => setCurrentView('vipCenter')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${currentView === 'vipCenter'
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
            <p className="text-[10px] tracking-wider font-bold text-slate-400 uppercase mb-1">智能错题本</p>

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
          <div className={`${(currentView === 'users' || currentView === 'settings' || currentView === 'announcements') ? 'max-w-6xl' : 'max-w-4xl'} mx-auto space-y-6 transition-all`}>
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
            {currentView === 'exercise' && (
              <CreatePaperExercise
                onNavigate={setCurrentView}
                onGeneratePaper={(selected) => {
                  setPaperQuestions(selected);
                  setPaperSourceView('exercise');
                  setCurrentView('paper');
                }}
              />
            )}
            {currentView === 'papers' && (
              <SavedPapers
                onNavigate={setCurrentView}
                onOpenPaper={(selected) => {
                  setPaperQuestions(selected);
                  setPaperSourceView('papers');
                  setCurrentView('paper');
                }}
              />
            )}

            {currentView === 'users' && username === 'admin' && <UserManagement onNavigate={setCurrentView} />}
            {currentView === 'settings' && username === 'admin' && <SystemSettings />}
            {currentView === 'announcements' && username === 'admin' && <AnnouncementManagement />}
            {currentView === 'vipCenter' && (
              <VipCenter
                token={token}
                userInfo={userInfo}
                onRefresh={fetchUserInfo}
                onNavigate={setCurrentView}
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
          ) : (
            <div className="relative -top-5">
              <button
                onClick={() => setCurrentView('add')}
                className="w-14 h-14 bg-blue-600 rounded-full flex items-center justify-center text-white shadow-lg shadow-blue-600/30 hover:bg-blue-700 transition-colors"
              >
                <Camera className="w-6 h-6" />
              </button>
            </div>
          )}
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


