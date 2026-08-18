import React, { useState, ReactNode, useEffect, useRef } from 'react';
import { Camera, Database, Home, HelpCircle, HardDrive, Users, BookOpen, Award, CheckCircle2, Sparkles, FileText, Globe, Check, Mail, EyeOff, Eye, Lock, User, Settings, Megaphone, Clock, LogOut, GraduationCap } from 'lucide-react';
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
import TaskCenter from './components/TaskCenter';
import UserProfile, { UserAvatar } from './components/UserProfile';
import AIVariationLibrary from './components/AIVariationLibrary';
import JiaowuDashboard from './components/JiaowuDashboard';
import RoleManager from './components/RoleManager';
import { db } from './lib/db';
import logo from '../logo.png';

type View = 'dashboard' | 'add' | 'library' | 'users' | 'paper' | 'vipCenter' | 'settings' | 'announcements' | 'exercise' | 'papers' | 'tasks' | 'profile' | 'aiVariation' | 'jiaowu' | 'roles';

const API_PREFIX = '/api';

export default function App() {
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [showSqlTip, setShowSqlTip] = useState(false);
  const [paperQuestions, setPaperQuestions] = useState<any[]>([]);
  const [paperOptions, setPaperOptions] = useState<{ customImages?: Record<string, string>, hiddenImages?: Record<string, boolean> }>({});
  const [paperSourceView, setPaperSourceView] = useState<View>('library');
  const [libraryNotebookId, setLibraryNotebookId] = useState<string | null>(null);
  const [librarySearchKey, setLibrarySearchKey] = useState<string | null>(null);
  const [libraryMasteryStatus, setLibraryMasteryStatus] = useState<'all' | 'not_mastered' | 'mastered' | null>(null);
  const [addUploadMode, setAddUploadMode] = useState<'single' | 'multi' | 'crossPage'>('single');

  const handleNavigate = (view: View, params?: {
    notebookId?: string | null;
    uploadMode?: 'single' | 'multi' | 'crossPage';
    searchKey?: string | null;
    masteryStatus?: 'all' | 'not_mastered' | 'mastered' | null;
  }) => {
    if (view === 'library' || view === 'aiVariation') {
      setLibraryNotebookId(params?.notebookId !== undefined ? params.notebookId : null);
      setLibrarySearchKey(params?.searchKey || null);
      setLibraryMasteryStatus(params?.masteryStatus || null);
    }
    if (view === 'add') {
      setAddUploadMode(params?.uploadMode || 'single');
    }
    setCurrentView(view);
  };

  const [token, setToken] = useState<string | null>(localStorage.getItem('errorbook_token'));
  const [username, setUsername] = useState<string | null>(localStorage.getItem('errorbook_username'));
  const [role, setRole] = useState<string | null>(localStorage.getItem('errorbook_role'));
  const [accountType, setAccountType] = useState<string | null>(localStorage.getItem('errorbook_accountType'));

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

  // 找回密码/重置密码状态
  const [isForgotMode, setIsForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotCode, setForgotCode] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState<string | null>(null);
  const [sendForgotCodeLoading, setSendForgotCodeLoading] = useState(false);
  const [forgotCountdown, setForgotCountdown] = useState(0);

  // 会员信息状态
  const [userInfo, setUserInfo] = useState<{
    role: string;
    vipExpireAt: string | null;
    aiUsedToday: number;
    aiLimit: number;
    aiRemaining: string | number;
    capacityLimit?: number;
    questionCount?: number;
  } | null>(null);

  // 定时器用于验证码与重置码倒计时
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  useEffect(() => {
    if (forgotCountdown > 0) {
      const timer = setTimeout(() => setForgotCountdown(forgotCountdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [forgotCountdown]);

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
        // 第二阶段：同步 accountType
        if (data.accountType) {
          localStorage.setItem('errorbook_accountType', data.accountType);
          setAccountType(data.accountType);
        }
        // 学生过期兜底：清 token 跳登录
        if (data.accountType === 'student' && data.expired) {
          localStorage.removeItem('errorbook_token');
          localStorage.removeItem('errorbook_username');
          localStorage.removeItem('errorbook_role');
          localStorage.removeItem('errorbook_accountType');
          setToken(null);
          setUsername(null);
          setRole(null);
          setAccountType(null);
        }
      } else if (res.status === 403) {
        // 伴学过期，强制下线
        localStorage.removeItem('errorbook_token');
        localStorage.removeItem('errorbook_username');
        localStorage.removeItem('errorbook_role');
        localStorage.removeItem('errorbook_accountType');
        setToken(null);
        setUsername(null);
        setRole(null);
        setAccountType(null);
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

  interface TaskNotification {
    id: string;
    taskId: string;
    taskName: string;
    status: string;
    type: 'success' | 'warning' | 'info' | 'error';
    title: string;
    message: string;
    alertKey: string;
  }

  const [pendingTasksCount, setPendingTasksCount] = useState(0);
  const [notifications, setNotifications] = useState<TaskNotification[]>([]);
  const notifiedTaskKeys = useRef<Set<string>>(new Set());

  // 当 Token 或 Username 变更时加载已读记录
  useEffect(() => {
    notifiedTaskKeys.current.clear();
    setNotifications([]);
  }, [token, username]);

  const handleDismissNotification = (id: string, alertKey: string) => {
    setNotifications(prev => prev.filter(item => item.id !== id));
  };

  useEffect(() => {
    if (!token) return;
    const updateTasksCount = () => {
      fetch('/api/tasks', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) {
            const count = data.filter(t => t.status !== 'completed' && t.status !== 'failed').length;
            setPendingTasksCount(count);

            // 全局通知提醒逻辑
            data.forEach(task => {
              if (['pending_extract_review', 'pending_diagnose_review', 'completed', 'failed'].includes(task.status)) {
                const alertKey = `${task.id}_${task.status}`;
                // 仅当后端标记为未通知，且前端此轮没有处理过该状态时
                if (task.isNotified === 0 && !notifiedTaskKeys.current.has(alertKey)) {
                  let type: 'success' | 'warning' | 'info' | 'error' = 'info';
                  let title = '';
                  let message = '';
                  let shouldShow = true;

                  if (task.status === 'pending_extract_review') {
                    type = 'warning';
                    title = '🔍 错题文本待校对';
                    message = `任务《${task.taskName}》OCR识别完成，请核对文字。`;
                  } else if (task.status === 'pending_diagnose_review') {
                    type = 'info';
                    title = '📝 诊断结果待归档';
                    message = `任务《${task.taskName}》智能解析已生成，请确认并归档错题本。`;
                  } else if (task.status === 'completed') {
                    type = 'success';
                    title = '✅ 错题录入成功';
                    message = `任务《${task.taskName}》已全自动诊断完成并归档入库。`;
                  } else if (task.status === 'failed') {
                    type = 'error';
                    title = '❌ 录题任务失败';
                    message = `任务《${task.taskName}》处理失败：${task.errorMsg || '未知错误'}`;
                  }

                  if (shouldShow) {
                    const newNotification: TaskNotification = {
                      id: `${task.id}_${task.status}_${Date.now()}`,
                      taskId: task.id,
                      taskName: task.taskName,
                      status: task.status,
                      type,
                      title,
                      message,
                      alertKey
                    };
                    setNotifications(prev => [...prev, newNotification]);
                    notifiedTaskKeys.current.add(alertKey);

                    // 立即标记后端为已发送通知
                    db.setTaskNotified(task.id).catch(err => console.error("Error setting task notified status:", err));
                  }
                }
              }
            });
          }
        })
        .catch(err => console.error("Error fetching tasks count & notifications:", err));
    };

    updateTasksCount();
    const timer = setInterval(updateTasksCount, 6000); // 缩短为 6 秒以提供更及时的反馈
    return () => clearInterval(timer);
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
      const res = await fetch(`${API_PREFIX}/auth/login`, {
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
      if (data.accountType) {
        localStorage.setItem('errorbook_accountType', data.accountType);
      }
      setToken(data.token);
      setUsername(data.username);
      setRole(data.role || 'student');
      setAccountType(data.accountType || null);
      // 登录成功后按角色路由到对应工作台
      if (data.accountType === 'jiaowu') setCurrentView('jiaowu');
      else if (data.accountType === 'jiaoxue') setCurrentView('dashboard');
      else if (data.accountType === 'student') setCurrentView('dashboard');
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
      await fetch(`${API_PREFIX}/auth/logout`, {
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
    localStorage.removeItem('errorbook_accountType');
    setToken(null);
    setUsername(null);
    setRole(null);
    setAccountType(null);
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
      const res = await fetch(`${API_PREFIX}/auth/send-code`, {
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
      const res = await fetch(`${API_PREFIX}/auth/register`, {
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

  // 发送找回密码验证码
  const handleSendForgotCode = async () => {
    if (!forgotEmail.trim()) {
      setAuthError('请先输入QQ邮箱');
      return;
    }
    setSendForgotCodeLoading(true);
    setAuthError(null);
    setForgotSuccess(null);
    try {
      const res = await fetch(`${API_PREFIX}/auth/send-reset-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail.trim() })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '重置码发送失败');
      }
      setForgotSuccess('重置验证码发送成功！若未收到请检查垃圾箱或控制台日志。');
      setForgotCountdown(60);
    } catch (err: any) {
      setAuthError(err.message);
    } finally {
      setSendForgotCodeLoading(false);
    }
  };

  // 重置密码提交
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim() || !forgotCode.trim() || !forgotNewPassword.trim()) {
      setAuthError('请完整填写所有重置字段');
      return;
    }
    setAuthLoading(true);
    setAuthError(null);
    setForgotSuccess(null);
    try {
      const res = await fetch(`${API_PREFIX}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: forgotEmail.trim(),
          code: forgotCode.trim(),
          newPassword: forgotNewPassword.trim()
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '重置密码失败');
      }
      setForgotSuccess(data.message || '密码重置成功，请使用新密码登录');
      setTimeout(() => {
        setIsForgotMode(false);
        setForgotEmail('');
        setForgotCode('');
        setForgotNewPassword('');
        setForgotSuccess(null);
      }, 2000);
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
        <div className="w-full max-w-[1200px] min-h-[560px] bg-white rounded-[24px] shadow-xl shadow-slate-200/50 flex overflow-hidden border border-slate-100/80">

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
              <img src={logo} alt="数学满分" className="w-9 h-9 object-contain" />
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
                欢迎使用数学满分平台，<br />体验全新的错题整理模式。
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
            <div className="w-full max-w-[450px] mx-auto space-y-6">

              {/* Form Header */}
              <div>
                <h2 className="text-[26px] font-black text-slate-800 tracking-tight">
                  {isForgotMode ? '找回密码' : isRegisterMode ? '加入我们' : '欢迎登录'}
                </h2>
                <p className="text-xs text-slate-400 mt-1.5 font-bold tracking-wide">
                  {isForgotMode ? '通过已注册邮箱验证码安全重置您的登录密码。' : isRegisterMode ? '欢迎注册使用AI错题识别' : '继续您的智能学习之旅。'}
                </p>
              </div>

              {/* Error & Success Messages */}
              {authError && (
                <div className="bg-rose-50 text-rose-600 border border-rose-100 px-4 py-3 rounded-2xl text-xs font-semibold flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping shrink-0"></span>
                  {authError}
                </div>
              )}
              {regSuccess && !isForgotMode && (
                <div className="bg-emerald-50 text-emerald-600 border border-emerald-100 px-4 py-3 rounded-2xl text-xs font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span className="leading-snug">{regSuccess}</span>
                </div>
              )}
              {forgotSuccess && isForgotMode && (
                <div className="bg-emerald-50 text-emerald-600 border border-emerald-100 px-4 py-3 rounded-2xl text-xs font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span className="leading-snug">{forgotSuccess}</span>
                </div>
              )}

              {/* Form Box */}
              {isForgotMode ? (
                // ================= 找回/重置密码表单 =================
                <form onSubmit={handleResetPassword} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 pl-1 block">
                      已注册的 QQ 邮箱
                    </label>
                    <div className="flex gap-3">
                      <div className="flex-1 relative flex items-center bg-slate-50 border border-transparent focus-within:border-blue-500 focus-within:bg-white rounded-full px-4 py-3 transition-all min-w-0">
                        <Mail className="w-4.5 h-4.5 text-slate-400 mr-2.5 shrink-0" />
                        <input
                          type="email"
                          placeholder="请输入 QQ 邮箱"
                          value={forgotEmail}
                          onChange={e => setForgotEmail(e.target.value)}
                          className="w-full bg-transparent border-none outline-none text-sm text-slate-700 placeholder-slate-400/80 font-medium min-w-0"
                          required
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleSendForgotCode}
                        disabled={sendForgotCodeLoading || forgotCountdown > 0}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-4 py-3 rounded-full transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0 shadow-sm shadow-blue-500/10 whitespace-nowrap"
                      >
                        {forgotCountdown > 0 ? `${forgotCountdown}s` : '获取重置码'}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 pl-1 block">重置验证码</label>
                    <div className="relative flex items-center bg-slate-50 border border-transparent focus-within:border-blue-500 focus-within:bg-white rounded-full px-4.5 py-3 transition-all">
                      <Sparkles className="w-4.5 h-4.5 text-slate-400 mr-2.5 shrink-0" />
                      <input
                        type="text"
                        placeholder="请输入 6 位验证码"
                        value={forgotCode}
                        onChange={e => setForgotCode(e.target.value)}
                        className="w-full bg-transparent border-none outline-none text-sm text-slate-700 placeholder-slate-400/80 font-medium"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 pl-1 block">
                      设定新密码
                    </label>
                    <div className="relative flex items-center bg-slate-50 border border-transparent focus-within:border-blue-500 focus-within:bg-white rounded-full px-4.5 py-3 transition-all">
                      <Lock className="w-4.5 h-4.5 text-slate-400 mr-2.5 shrink-0" />
                      <input
                        type={showPassword ? "text" : "password"}
                        placeholder="设置新登录密码（至少 6 位）"
                        value={forgotNewPassword}
                        onChange={e => setForgotNewPassword(e.target.value)}
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
                    {authLoading ? '正在重置...' : '立即重置密码'}
                  </button>
                </form>
              ) : isRegisterMode ? (
                // ================= 注册表单 =================
                <form onSubmit={handleRegister} className="space-y-4">

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 pl-1 block">
                      QQ 邮箱
                    </label>
                    <div className="flex gap-3">
                      <div className="flex-1 relative flex items-center bg-slate-50 border border-transparent focus-within:border-blue-500 focus-within:bg-white rounded-full px-4 py-3 transition-all min-w-0">
                        <Mail className="w-4.5 h-4.5 text-slate-400 mr-2.5 shrink-0" />
                        <input
                          type="email"
                          placeholder="请输入 QQ 邮箱"
                          value={regEmail}
                          onChange={e => setRegEmail(e.target.value)}
                          className="w-full bg-transparent border-none outline-none text-sm text-slate-700 placeholder-slate-400/80 font-medium min-w-0"
                          required
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleSendCode}
                        disabled={sendCodeLoading || countdown > 0}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-4 py-3 rounded-full transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0 shadow-sm shadow-blue-500/10 whitespace-nowrap"
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
                      onClick={() => {
                        setIsForgotMode(true);
                        setAuthError(null);
                        setForgotSuccess(null);
                      }}
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
                {isForgotMode ? (
                  <>
                    <span className="text-slate-400">想起密码了？</span>
                    <button
                      type="button"
                      onClick={() => {
                        setIsForgotMode(false);
                        setIsRegisterMode(false);
                        setAuthError(null);
                        setForgotSuccess(null);
                      }}
                      className="text-blue-600 hover:text-blue-700 font-extrabold ml-1 cursor-pointer transition-colors"
                    >
                      立即登录
                    </button>
                  </>
                ) : (
                  <>
                    <span className="text-slate-400">
                      {isRegisterMode ? '已有账号？' : '还没有账号？'}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setIsRegisterMode(!isRegisterMode);
                        setIsForgotMode(false);
                        setAuthError(null);
                        setRegSuccess(null);
                        setForgotSuccess(null);
                      }}
                      className="text-blue-600 hover:text-blue-700 font-extrabold ml-1 cursor-pointer transition-colors"
                    >
                      {isRegisterMode ? '立即登录' : '立即免费注册'}
                    </button>
                  </>
                )}
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
      <aside className="no-print w-64 bg-white border-r border-slate-200 hidden md:flex flex-col shrink-0">
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-md shadow-blue-600/20">
              <span className="text-white font-bold text-xs">AI</span>
            </div>
            <h1 className="text-lg font-extrabold tracking-tight text-slate-900">智能错题本</h1>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
          {/* ===== 第二阶段：教务/教学/学生 专属菜单（accountType 分流） ===== */}
          {accountType === 'jiaowu' && (
            <>
              <SidebarItem
                active={currentView === 'dashboard'}
                onClick={() => setCurrentView('dashboard')}
                icon={<Home className="w-4 h-4 ml-1" />}
                label="首页"
              />
              <SidebarItem
                active={currentView === 'jiaowu'}
                onClick={() => setCurrentView('jiaowu')}
                icon={<Users className="w-4 h-4 ml-1" />}
                label="学生管理"
              />
            </>
          )}

          {/* 首页（非 jiaowu 角色共用） */}
          {accountType !== 'jiaowu' && (
            <button
              onClick={() => setCurrentView('dashboard')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all relative ${currentView === 'dashboard'
                ? 'bg-blue-50 text-blue-700 shadow-sm'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                }`}
            >
              {currentView === 'dashboard' && (
                <span className="absolute left-0 top-2.5 bottom-2.5 w-1 bg-blue-600 rounded-r-full" />
              )}
              <Home className="w-4 h-4 ml-1" />
              <span>首页</span>
            </button>
          )}

          {/* 我的错题本（jiaowu 不显示，jiaoxue/student 可显示） */}
          {accountType !== 'jiaowu' && (
            <button
              onClick={() => handleNavigate('library')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all relative ${currentView === 'library'
                ? 'bg-blue-50 text-blue-700 shadow-sm'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                }`}
            >
              {currentView === 'library' && (
                <span className="absolute left-0 top-2.5 bottom-2.5 w-1 bg-blue-600 rounded-r-full" />
              )}
              <Database className="w-4 h-4 ml-1" />
              <span>我的错题本</span>
            </button>
          )}

          {accountType !== 'jiaowu' && (
            <button
              onClick={() => handleNavigate('aiVariation')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all relative ${currentView === 'aiVariation'
                ? 'bg-blue-50 text-blue-700 shadow-sm'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                }`}
            >
              {currentView === 'aiVariation' && (
                <span className="absolute left-0 top-2.5 bottom-2.5 w-1 bg-blue-600 rounded-r-full" />
              )}
              <BookOpen className="w-4 h-4 ml-1" />
              <span>AI变题库</span>
            </button>
          )}

          {role === 'admin' && (
            <button
              onClick={() => setCurrentView('tasks')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-semibold transition-all relative ${currentView === 'tasks'
                ? 'bg-blue-50 text-blue-700 shadow-sm'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                }`}
            >
              {currentView === 'tasks' && (
                <span className="absolute left-0 top-2.5 bottom-2.5 w-1 bg-blue-600 rounded-r-full" />
              )}
              <div className="flex items-center gap-3 ml-1">
                <Clock className="w-4 h-4" />
                <span>后台任务</span>
              </div>
              {pendingTasksCount > 0 && (
                <span className="bg-rose-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full shrink-0 mr-1">
                  {pendingTasksCount}
                </span>
              )}
            </button>
          )}

          {accountType !== 'jiaowu' && accountType !== 'jiaoxue' && (
            <button
              onClick={() => setCurrentView('exercise')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all relative ${currentView === 'exercise'
                ? 'bg-blue-50 text-blue-700 shadow-sm'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                }`}
            >
              {currentView === 'exercise' && (
                <span className="absolute left-0 top-2.5 bottom-2.5 w-1 bg-blue-600 rounded-r-full" />
              )}
              <Sparkles className="w-4 h-4 ml-1" />
              <span>组卷练习</span>
            </button>
          )}

          {accountType !== 'jiaowu' && accountType !== 'jiaoxue' && (
            <button
              onClick={() => setCurrentView('papers')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all relative ${currentView === 'papers'
                ? 'bg-blue-50 text-blue-700 shadow-sm'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                }`}
            >
              {currentView === 'papers' && (
                <span className="absolute left-0 top-2.5 bottom-2.5 w-1 bg-blue-600 rounded-r-full" />
              )}
              <FileText className="w-4 h-4 ml-1" />
              <span>我的试卷</span>
            </button>
          )}

          {role === 'admin' && (
            <button
              onClick={() => setCurrentView('users')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all relative ${currentView === 'users'
                ? 'bg-blue-50 text-blue-700 shadow-sm'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                }`}
            >
              {currentView === 'users' && (
                <span className="absolute left-0 top-2.5 bottom-2.5 w-1 bg-blue-600 rounded-r-full" />
              )}
              <Users className="w-4 h-4 ml-1" />
              <span>用户管理</span>
            </button>
          )}

          {role === 'admin' && (
            <button
              onClick={() => setCurrentView('roles')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all relative ${currentView === 'roles'
                ? 'bg-blue-50 text-blue-700 shadow-sm'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                }`}
            >
              {currentView === 'roles' && (
                <span className="absolute left-0 top-2.5 bottom-2.5 w-1 bg-blue-600 rounded-r-full" />
              )}
              <GraduationCap className="w-4 h-4 ml-1" />
              <span>角色管理</span>
            </button>
          )}

          {role === 'admin' && (
            <button
              onClick={() => setCurrentView('settings')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all relative ${currentView === 'settings'
                ? 'bg-blue-50 text-blue-700 shadow-sm'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                }`}
            >
              {currentView === 'settings' && (
                <span className="absolute left-0 top-2.5 bottom-2.5 w-1 bg-blue-600 rounded-r-full" />
              )}
              <Settings className="w-4 h-4 ml-1" />
              <span>系统设置</span>
            </button>
          )}

          {role === 'admin' && (
            <button
              onClick={() => setCurrentView('announcements')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all relative ${currentView === 'announcements'
                ? 'bg-blue-50 text-blue-700 shadow-sm'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                }`}
            >
              {currentView === 'announcements' && (
                <span className="absolute left-0 top-2.5 bottom-2.5 w-1 bg-blue-600 rounded-r-full" />
              )}
              <Megaphone className="w-4 h-4 ml-1" />
              <span>公告管理</span>
            </button>
          )}
        </nav>

        {/* 侧边栏底部操作区 (参照图1设计) */}
        <div className="mt-auto border-t border-slate-100 bg-white space-y-1">
          {/* 新建错题按钮（jiaowu 不显示，教务无上传错题功能） */}
          {accountType !== 'jiaowu' && (
            <div className="p-3">
              <button
                onClick={() => setCurrentView('add')}
                className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-500/10 transition-all cursor-pointer hover:shadow-lg hover:shadow-blue-500/15 active:scale-[0.98]"
              >
                <Camera className="w-4 h-4" />
                <span>上传错题</span>
              </button>
            </div>
          )}

          {/* 会员和设置二级项 */}
          <div className="px-3 pb-2 space-y-0.5">
            {/* 会员（jiaowu/jiaoxue 不显示会员入口） */}
            {accountType !== 'jiaowu' && accountType !== 'jiaoxue' && (
              <button
                onClick={() => setCurrentView('vipCenter')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-bold transition-all relative ${currentView === 'vipCenter'
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                  }`}
              >
                {currentView === 'vipCenter' && (
                  <span className="absolute left-0 top-2 bottom-2 w-1 bg-blue-600 rounded-r-full" />
                )}
                <Award className="w-4 h-4 ml-1" />
                <span>会员</span>
              </button>
            )}

            <button
              onClick={() => setCurrentView('profile')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-bold transition-all relative ${currentView === 'profile'
                ? 'bg-blue-50 text-blue-700'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                }`}
            >
              {currentView === 'profile' && (
                <span className="absolute left-0 top-2 bottom-2 w-1 bg-blue-600 rounded-r-full" />
              )}
              <Settings className="w-4 h-4 ml-1" />
              <span>设置</span>
            </button>
          </div>

          {/* 分割线 */}
          <div className="border-t border-slate-100 my-1 mx-4" />

          {/* 用户基础卡片与注销 */}
          <div className="px-4 py-3 flex items-center justify-between gap-3">
            <div
              onClick={() => setCurrentView('profile')}
              className="flex items-center gap-2.5 cursor-pointer hover:opacity-85 transition-opacity overflow-hidden flex-1"
            >
              <UserAvatar
                avatar={userInfo?.avatar || null}
                username={username}
                className="w-9 h-9 text-xs"
              />
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-xs font-bold text-slate-700 truncate">
                  {userInfo?.nickname || username || '未登录'}
                </span>
                <span className="text-[9px] text-slate-400 font-bold truncate uppercase tracking-wider">
                  {userInfo?.role || 'STUDENT'}
                </span>
              </div>
            </div>

            <button
              onClick={handleLogout}
              title="退出登录"
              className="w-8 h-8 rounded-xl border border-slate-150 bg-white hover:bg-slate-50 hover:border-slate-355 text-slate-450 hover:text-slate-700 flex items-center justify-center transition-all cursor-pointer active:scale-90 shadow-sm shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Container */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">

        {/* Mobile Header (Hidden on Desktop) */}
        <header className="no-print md:hidden flex h-16 bg-white border-b border-slate-200 items-center justify-between px-5 sticky top-0 z-25 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-[10px]">AI</span>
            </div>
            <h1 className="text-md font-extrabold tracking-tight text-slate-900">智能错题本</h1>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowSqlTip(true)}
              className="text-[0.625rem] bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-full px-3 py-1.5 font-bold transition-colors flex items-center gap-1"
            >
              <HardDrive className="w-3 h-3" />
              存储说明
            </button>
            <button
              onClick={handleLogout}
              className="text-[0.625rem] bg-rose-50 text-rose-600 rounded-full px-3 py-1.5 font-bold hover:bg-rose-100 transition-colors"
            >
              退出
            </button>
          </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 h-full overflow-y-auto p-4 md:p-8 pb-24 md:pb-8">
          <div className="w-full space-y-6 transition-all">
            {currentView === 'jiaowu' && <JiaowuDashboard />}
            {currentView === 'dashboard' && <Dashboard onNavigate={handleNavigate} pendingTasksCount={pendingTasksCount} />}
            {currentView === 'add' && <AddQuestion onNavigate={handleNavigate} initialUploadMode={addUploadMode} />}
            {currentView === 'tasks' && <TaskCenter onNavigate={handleNavigate} />}
            {currentView === 'library' && (
              <QuestionLibrary
                onNavigate={handleNavigate}
                userInfo={userInfo}
                onRefreshUserInfo={fetchUserInfo}
                initialNotebookId={libraryNotebookId}
                initialSearchKey={librarySearchKey}
                initialMasteryStatus={libraryMasteryStatus}
                onGeneratePaper={(selected) => {
                  setPaperQuestions(selected);
                  setPaperSourceView('library');
                  setCurrentView('paper');
                }}
              />
            )}
            {currentView === 'aiVariation' && (
              <AIVariationLibrary
                onNavigate={handleNavigate}
                userInfo={userInfo}
                onRefreshUserInfo={fetchUserInfo}
                initialNotebookId={libraryNotebookId}
                initialSearchKey={librarySearchKey}
                initialMasteryStatus={libraryMasteryStatus}
                onGeneratePaper={(selected) => {
                  setPaperQuestions(selected);
                  setPaperSourceView('aiVariation');
                  setCurrentView('paper');
                }}
              />
            )}
            {currentView === 'exercise' && (
              <CreatePaperExercise
                onNavigate={handleNavigate}
                onGeneratePaper={(selected) => {
                  setPaperQuestions(selected);
                  setPaperSourceView('exercise');
                  setCurrentView('paper');
                }}
              />
            )}
            {currentView === 'papers' && (
              <SavedPapers
                onNavigate={handleNavigate}
                onOpenPaper={(selected, options) => {
                  setPaperQuestions(selected);
                  setPaperOptions(options || {});
                  setPaperSourceView('papers');
                  setCurrentView('paper');
                }}
              />
            )}

            {currentView === 'users' && username === 'admin' && <UserManagement onNavigate={handleNavigate} />}
            {currentView === 'roles' && username === 'admin' && <RoleManager />}
            {currentView === 'settings' && username === 'admin' && <SystemSettings />}
            {currentView === 'announcements' && username === 'admin' && <AnnouncementManagement />}
            {currentView === 'vipCenter' && (
              <VipCenter
                token={token}
                userInfo={userInfo}
                onRefresh={fetchUserInfo}
                onNavigate={handleNavigate}
              />
            )}
            {currentView === 'profile' && (
              <UserProfile
                token={token}
                userInfo={userInfo}
                onRefreshUserInfo={fetchUserInfo}
                onNavigate={handleNavigate}
                onShowSqlTip={() => setShowSqlTip(true)}
              />
            )}
            {currentView === 'paper' && (
              <TestPaper
                questions={paperQuestions}
                initialCroppedImages={paperOptions.customImages}
                initialHiddenImages={paperOptions.hiddenImages}
                onBack={() => setCurrentView(paperSourceView)}
              />
            )}
          </div>
        </main>

        {/* Mobile Navigation - Only Bottom */}
        <nav className="no-print md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex items-center justify-around pb-safe z-20">
          <NavItem
            icon={<Home className="w-5 h-5" />} label="首页"
            active={currentView === 'dashboard'}
            onClick={() => setCurrentView('dashboard')}
          />
          <NavItem
            icon={<Database className="w-5 h-5" />} label="错题库"
            active={currentView === 'library'}
            onClick={() => handleNavigate('library')}
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
            onClick={() => handleNavigate('library')}
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
        <div className="no-print fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-6 relative animate-in fade-in zoom-in-95 duration-200">
            <button
              onClick={() => setShowSqlTip(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 font-bold text-lg outline-none"
            >
              ✕
            </button>
            <div className="mb-4 flex items-center gap-2 text-blue-600 font-bold">
              <Globe className="w-5 h-5" />
              <h3 className="text-lg">智能错题本云同步说明</h3>
            </div>

            <div className="space-y-4 text-slate-600 text-sm leading-relaxed">
              <p>
                您的错题本现已全面升级，支持<strong>云端账号同步与安全保存</strong>服务。
              </p>
              <p>
                <strong>安全与隔离设计：</strong>
              </p>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <strong>账号数据隔离：</strong> 每个用户都拥有独立的账号空间，不同用户的数据完全独立、互不干扰。
                </li>
                <li>
                  <strong>安全密码加密：</strong> 所有账号密码都经过安全加密处理，切实保障您的账号安全。
                </li>
                <li>
                  <strong>多端实时同步：</strong> 只要在不同的设备上登录同一个账号，您的错题数据即可完美同步。
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

      {/* 全局持久任务通知悬浮容器 */}
      <div className="no-print fixed top-6 right-6 z-[9999] flex flex-col gap-3 max-w-sm w-full pointer-events-none">
        {notifications.map((n) => (
          <div
            key={n.id}
            className={`pointer-events-auto w-full bg-white/95 backdrop-blur-md border rounded-2xl p-4 shadow-xl flex gap-3 transform translate-x-0 transition-all duration-300 animate-in slide-in-from-right duration-350 ${n.type === 'success' ? 'border-emerald-200 bg-emerald-50/20' :
              n.type === 'warning' ? 'border-amber-200 bg-amber-50/20' :
                n.type === 'error' ? 'border-rose-250 bg-rose-50/20' :
                  'border-blue-200 bg-blue-50/20'
              }`}
          >
            {/* Status Icons */}
            <div className="shrink-0 pt-0.5">
              {n.type === 'success' && <span className="text-xl">✅</span>}
              {n.type === 'warning' && <span className="text-xl">🔍</span>}
              {n.type === 'error' && <span className="text-xl">❌</span>}
              {n.type === 'info' && <span className="text-xl">📝</span>}
            </div>

            <div className="flex-1 space-y-1">
              <h4 className="text-xs font-black text-slate-800 leading-tight flex items-center justify-between">
                <span>{n.title}</span>
              </h4>
              <p className="text-[0.6875rem] text-slate-500 font-semibold leading-relaxed">
                {n.message}
              </p>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-2">
                {['pending_extract_review', 'pending_diagnose_review', 'failed'].includes(n.status) ? (
                  <button
                    onClick={() => {
                      setCurrentView('tasks');
                      handleDismissNotification(n.id, n.alertKey);
                    }}
                    className={`text-[0.625rem] font-black px-2.5 py-1 rounded-lg transition-all cursor-pointer ${n.type === 'warning' ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-sm' :
                      n.type === 'info' ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm' :
                        'bg-slate-800 hover:bg-slate-900 text-white'
                      }`}
                  >
                    {n.status === 'pending_extract_review' ? '立即校对' : n.status === 'pending_diagnose_review' ? '立即归档' : '去排查'}
                  </button>
                ) : n.status === 'completed' ? (
                  <button
                    onClick={() => {
                      handleNavigate('library');
                      handleDismissNotification(n.id, n.alertKey);
                    }}
                    className="text-[0.625rem] font-black px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-all cursor-pointer shadow-sm"
                  >
                    查看错题
                  </button>
                ) : null}

                <button
                  onClick={() => handleDismissNotification(n.id, n.alertKey)}
                  className="text-[0.625rem] font-bold text-slate-400 hover:text-slate-650 px-2 py-1 rounded-lg border border-slate-200 bg-white transition cursor-pointer"
                >
                  关闭
                </button>
              </div>
            </div>

            {/* Top right close icon */}
            <button
              onClick={() => handleDismissNotification(n.id, n.alertKey)}
              className="text-slate-350 hover:text-slate-500 shrink-0 self-start text-xs font-black cursor-pointer"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

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
      <span className="text-[0.625rem] font-medium">{label}</span>
    </button>
  );
}

// 第二阶段：侧边栏菜单项（用于教务/教学/学生专属菜单）
function SidebarItem({ icon, label, active, onClick }: { icon: ReactNode, label: string, active: boolean, onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all relative ${active
        ? 'bg-blue-50 text-blue-700 shadow-sm'
        : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
        }`}
    >
      {active && (
        <span className="absolute left-0 top-2.5 bottom-2.5 w-1 bg-blue-600 rounded-r-full" />
      )}
      {icon}
      <span>{label}</span>
    </button>
  );
}


