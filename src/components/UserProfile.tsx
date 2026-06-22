import React, { useState, useEffect } from 'react';
import { User, Brain, BookOpen, Award, Sparkles, Smile, Flame, GraduationCap, Bot, Camera, Save, CheckCircle2, Crown, Loader2, ArrowRight, Check, HelpCircle } from 'lucide-react';

export const PRESET_AVATARS = [
  { id: 'preset_1', bg: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', iconName: 'user', label: '默认用户' },
  { id: 'preset_2', bg: 'linear-gradient(135deg, #a855f7, #6d28d9)', iconName: 'brain', label: '智慧大脑' },
  { id: 'preset_3', bg: 'linear-gradient(135deg, #10b981, #047857)', iconName: 'book', label: '好学书本' },
  { id: 'preset_4', bg: 'linear-gradient(135deg, #f59e0b, #d97706)', iconName: 'award', label: '荣耀奖章' },
  { id: 'preset_5', bg: 'linear-gradient(135deg, #ec4899, #be185d)', iconName: 'sparkles', label: '闪耀星光' },
  { id: 'preset_6', bg: 'linear-gradient(135deg, #06b6d4, #0891b2)', iconName: 'smile', label: '阳光微笑' },
  { id: 'preset_7', bg: 'linear-gradient(135deg, #f43f5e, #be123c)', iconName: 'flame', label: '热情火焰' },
  { id: 'preset_8', bg: 'linear-gradient(135deg, #6366f1, #4338ca)', iconName: 'graduation', label: '学业有成' },
  { id: 'preset_9', bg: 'linear-gradient(135deg, #14b8a6, #0f766e)', iconName: 'bot', label: 'AI智能助教' },
];

export function renderPresetIcon(name: string, className = "w-1/2 h-1/2 text-white") {
  switch (name) {
    case 'user': return <User className={className} />;
    case 'brain': return <Brain className={className} />;
    case 'book': return <BookOpen className={className} />;
    case 'award': return <Award className={className} />;
    case 'sparkles': return <Sparkles className={className} />;
    case 'smile': return <Smile className={className} />;
    case 'flame': return <Flame className={className} />;
    case 'graduation': return <GraduationCap className={className} />;
    case 'bot': return <Bot className={className} />;
    default: return <User className={className} />;
  }
}

interface UserAvatarProps {
  avatar: string | null;
  username: string | null;
  className?: string;
  onClick?: () => void;
}

export function UserAvatar({ avatar, username, className = "w-10 h-10", onClick }: UserAvatarProps) {
  const baseClass = `${className} rounded-full overflow-hidden flex items-center justify-center shadow-sm select-none shrink-0 ${onClick ? 'cursor-pointer hover:opacity-90 active:scale-95 transition-all' : ''}`;

  if (avatar && (avatar.startsWith('http://') || avatar.startsWith('https://') || avatar.startsWith('data:'))) {
    return (
      <img
        src={avatar}
        alt="avatar"
        className={`${className} rounded-full object-cover border border-slate-200 shadow-sm shrink-0 ${onClick ? 'cursor-pointer hover:opacity-90 active:scale-95 transition-all' : ''}`}
        onClick={onClick}
      />
    );
  }

  const preset = PRESET_AVATARS.find(p => p.id === avatar);
  if (preset) {
    return (
      <div
        style={{ background: preset.bg }}
        className={baseClass}
        onClick={onClick}
      >
        {renderPresetIcon(preset.iconName)}
      </div>
    );
  }

  // 默认兜底：灰色背景+首字符
  const initial = username ? username.trim().charAt(0).toUpperCase() : '?';
  return (
    <div
      className={`${className} rounded-full bg-slate-200 text-slate-500 flex items-center justify-center font-bold border border-slate-350 shrink-0 ${onClick ? 'cursor-pointer hover:opacity-90 active:scale-95 transition-all' : ''}`}
      onClick={onClick}
    >
      <span className="text-[40%]">{initial}</span>
    </div>
  );
}

interface UserProfileProps {
  token: string | null;
  userInfo: {
    username: string;
    role: string;
    vipExpireAt: string | null;
    aiUsedToday: number;
    aiLimit: number;
    aiRemaining: string | number;
    capacityLimit?: number;
    questionCount?: number;
    nickname: string | null;
    avatar: string | null;
  } | null;
  onRefreshUserInfo: () => void;
  onNavigate: (view: any) => void;
  onShowSqlTip?: () => void;
}

export default function UserProfile({ token, userInfo, onRefreshUserInfo, onNavigate, onShowSqlTip }: UserProfileProps) {
  const [nickname, setNickname] = useState('');
  const [avatar, setAvatar] = useState<string | null>(null);
  const [customUrl, setCustomUrl] = useState('');
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // 当外部 userInfo 载入后同步到本地 state
  useEffect(() => {
    if (userInfo) {
      setNickname(userInfo.nickname || '');
      setAvatar(userInfo.avatar || 'preset_1');
      if (userInfo.avatar && (userInfo.avatar.startsWith('http://') || userInfo.avatar.startsWith('https://'))) {
        setCustomUrl(userInfo.avatar);
      } else {
        setCustomUrl('');
      }
    }
  }, [userInfo]);

  if (!userInfo) {
    return (
      <div className="py-20 flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
        <p className="text-xs font-semibold text-slate-400">正在载入个人资料数据...</p>
      </div>
    );
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccessMsg(null);

    // 头像优先使用 customUrl (若有输入)，否则使用 preset
    const finalAvatar = customUrl.trim() !== '' ? customUrl.trim() : avatar;

    try {
      const res = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          nickname: nickname.trim(),
          avatar: finalAvatar
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '保存资料失败');
      }

      setSuccessMsg('资料修改成功！');
      onRefreshUserInfo(); // 刷新父组件全局信息
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const selectPresetAvatar = (id: string) => {
    setAvatar(id);
    setCustomUrl(''); // 清空自定义 URL
    setShowAvatarModal(false);
  };

  const handleCustomUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (customUrl.trim() !== '') {
      setAvatar(customUrl.trim());
      setShowAvatarModal(false);
    }
  };

  // 角色翻译与色调匹配
  const getRoleBadge = (role: string) => {
    const normalized = role.toLowerCase();
    if (normalized === 'admin') {
      return { label: '超级管理员', style: 'bg-rose-100 text-rose-700 border-rose-200' };
    } else if (normalized === 'svip') {
      return { label: '钻石会员 (SVIP)', style: 'bg-indigo-100 text-indigo-700 border-indigo-200' };
    } else if (normalized === 'vip') {
      return { label: '黄金会员 (VIP)', style: 'bg-blue-100 text-blue-700 border-blue-200' };
    } else if (normalized === 'teacher') {
      return { label: '授课教师', style: 'bg-teal-100 text-teal-700 border-teal-200' };
    }
    return { label: '普通用户 (免费版)', style: 'bg-slate-100 text-slate-600 border-slate-200' };
  };

  const badge = getRoleBadge(userInfo.role);

  // 计算进度百分比
  const getProgressPercentage = (used: number, limit: number) => {
    if (limit === Infinity || limit === 0) return 0;
    return Math.min(100, (used / limit) * 100);
  };

  // AI 额度显示
  const aiLimitText = userInfo.aiLimit === Infinity 
    ? '无限使用' 
    : `${userInfo.aiUsedToday} / ${userInfo.aiLimit}`;
  
  // 错题容量显示
  const capacityLimitVal = userInfo.capacityLimit || 0;
  const questionCountVal = userInfo.questionCount || 0;
  const capacityText = capacityLimitVal === 0 
    ? `${questionCountVal} / 无限制` 
    : `${questionCountVal} / ${capacityLimitVal}`;

  return (
    <div className="space-y-6 w-full pb-12">
      {/* 顶部标题与简述 */}
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">账号设置</h1>
        <p className="text-xs text-slate-400 font-semibold">管理您的个人展示信息、昵称头像以及查看会员使用额度</p>
      </div>

      {/* 消息提示 */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl text-rose-600 text-xs font-semibold flex items-center gap-2 shadow-sm animate-in fade-in slide-in-from-top-1">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping"></span>
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl text-emerald-700 text-xs font-semibold flex items-center gap-2 shadow-sm animate-in fade-in slide-in-from-top-1">
          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* 两大板块容器 */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        
        {/* 左侧：账号设置面板 */}
        <div className="bg-white border border-slate-200/60 rounded-3xl p-6 md:p-8 shadow-sm md:col-span-7 space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-base font-extrabold text-slate-800">账号基础资料</h2>
            <p className="text-xs text-slate-400 mt-0.5">更改您的昵称和头像，让它们更加个性化</p>
          </div>

          <form onSubmit={handleSave} className="space-y-6">
            
            {/* 头像区域 */}
            <div className="flex flex-col sm:flex-row items-center gap-5 bg-slate-50/50 p-4 border border-slate-100 rounded-2xl">
              <div className="relative group">
                <UserAvatar 
                  avatar={customUrl.trim() !== '' ? customUrl.trim() : avatar} 
                  username={userInfo.username} 
                  className="w-20 h-20 text-3xl"
                  onClick={() => setShowAvatarModal(true)}
                />
                <button
                  type="button"
                  onClick={() => setShowAvatarModal(true)}
                  className="absolute bottom-0 right-0 w-6 h-6 bg-blue-600 hover:bg-blue-700 text-white rounded-full flex items-center justify-center shadow-md border border-white transition-all scale-100 active:scale-90"
                >
                  <Camera className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="text-center sm:text-left space-y-1">
                <h3 className="text-xs font-bold text-slate-600">展示头像</h3>
                <p className="text-[11px] text-slate-400">点击头像或右下角相机按钮更换预设卡通头像</p>
                <button
                  type="button"
                  onClick={() => setShowAvatarModal(true)}
                  className="mt-1.5 px-3 py-1 bg-white border border-slate-200 text-slate-500 hover:text-slate-700 hover:border-slate-350 rounded-lg text-[10px] font-bold shadow-sm transition-all"
                >
                  更换展示头像
                </button>
              </div>
            </div>

            {/* 用户名/昵称输入区 */}
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 pl-0.5 block">账户账号 (不可更改)</label>
                <div className="bg-slate-50 border border-slate-100 text-slate-400 px-4 py-2.5 rounded-xl text-sm font-semibold select-none">
                  {userInfo.username}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 pl-0.5 block">个性昵称</label>
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="设置一个昵称"
                  maxLength={20}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:border-blue-500 bg-white transition-colors"
                />
              </div>
            </div>

            {/* 保存按钮 */}
            <div className="pt-2 border-t border-slate-100 flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-1.5 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black shadow-md shadow-blue-500/10 transition-all cursor-pointer disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>正在保存...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    <span>保存资料</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* 右侧：会员中心与额度信息卡片 */}
        <div className="bg-white border border-slate-200/60 rounded-3xl p-6 md:p-8 shadow-sm md:col-span-5 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <h2 className="text-base font-extrabold text-slate-800">会员中心与权益</h2>
            <span className={`px-2.5 py-0.5 rounded-lg border text-[10px] font-bold ${badge.style}`}>
              {badge.label}
            </span>
          </div>

          <div className="space-y-5">
            {/* 详细指标清单 */}
            <div className="space-y-3.5 text-xs">
              <div className="flex justify-between items-center py-1">
                <span className="text-slate-400 font-medium">账号:</span>
                <span className="font-bold text-slate-700">{userInfo.username}</span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-slate-400 font-medium">身份:</span>
                <span className="font-bold text-blue-600 flex items-center gap-1">
                  <Crown className="w-3.5 h-3.5 text-yellow-500" />
                  {userInfo.role.toUpperCase()}
                </span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-slate-400 font-medium">会员过期时间:</span>
                <span className="font-bold text-slate-700">
                  {userInfo.vipExpireAt ? userInfo.vipExpireAt : '永久 / 未开通'}
                </span>
              </div>
            </div>

            {/* 进度条 1：AI 学习额度 */}
            <div className="space-y-2 pt-3 border-t border-slate-100">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500 font-bold">今日 AI 解析额度</span>
                <span className="font-extrabold text-slate-700">{aiLimitText}</span>
              </div>
              <div className="relative h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                <div 
                  style={{ width: `${getProgressPercentage(userInfo.aiUsedToday, userInfo.aiLimit)}%` }}
                  className="bg-blue-600 h-full rounded-full transition-all duration-500"
                />
              </div>
            </div>

            {/* 进度条 2：错题本容量额度 */}
            <div className="space-y-2 pt-1">
              <div className="flex justify-between items-center text-xs">
                <div className="flex items-center gap-1">
                  <span className="text-slate-500 font-bold">当前错题保存容量</span>
                  {onShowSqlTip && (
                    <button
                      type="button"
                      onClick={onShowSqlTip}
                      title="查看容量同步说明"
                      className="text-slate-400 hover:text-slate-655 transition-colors cursor-pointer"
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <span className="font-extrabold text-slate-700">{capacityText}</span>
              </div>
              <div className="relative h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                <div 
                  style={{ width: `${getProgressPercentage(questionCountVal, capacityLimitVal)}%` }}
                  className="bg-indigo-600 h-full rounded-full transition-all duration-500"
                />
              </div>
            </div>
            
            <p className="text-[10px] text-slate-400 leading-relaxed pt-2">
              提示：每日 AI 解析配额会在零点自动重置。普通账户错题本配额有限，升级 SVIP 可解锁“无限制容量”、“探索模式”及“费曼学习法”。
            </p>

            {/* 升级会员大按钮 */}
            <div className="pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => onNavigate('vipCenter')}
                className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-2xl text-xs font-black shadow-md shadow-blue-500/15 transition-all cursor-pointer active:scale-[0.98]"
              >
                <Crown className="w-4 h-4 text-yellow-300" />
                <span>立即升级会员 / 获取更多额度</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

      </div>

      {/* 头像更换模态框弹窗 */}
      {showAvatarModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-2xl max-w-md w-full p-6 relative animate-in fade-in zoom-in-95 duration-200">
            <button
              onClick={() => setShowAvatarModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-650 font-bold text-lg outline-none cursor-pointer"
            >
              ✕
            </button>
            
            <div className="mb-4">
              <h3 className="text-base font-extrabold text-slate-800">更换展示头像</h3>
              <p className="text-[11px] text-slate-450 mt-0.5">选择一个内置的卡通徽章，或填写自定义图片 URL</p>
            </div>

            {/* 预设卡通头像列表 */}
            <div className="grid grid-cols-3 gap-3.5 py-2">
              {PRESET_AVATARS.map((p) => {
                const isSelected = avatar === p.id && customUrl.trim() === '';
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => selectPresetAvatar(p.id)}
                    style={{ background: p.bg }}
                    className="aspect-square rounded-2xl flex flex-col items-center justify-center relative shadow-sm border-2 border-transparent hover:scale-105 active:scale-95 transition-all text-white group"
                  >
                    {renderPresetIcon(p.iconName, "w-8 h-8")}
                    <span className="text-[9px] font-bold mt-1 text-white/90 group-hover:text-white">{p.label}</span>
                    {isSelected && (
                      <div className="absolute top-1 right-1 w-4 h-4 bg-emerald-500 text-white rounded-full flex items-center justify-center border border-white shadow-sm">
                        <Check className="w-2.5 h-2.5" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* 自定义图片 URL */}
            <div className="mt-4 pt-4 border-t border-slate-100">
              <form onSubmit={handleCustomUrlSubmit} className="space-y-2">
                <label className="text-[10px] font-bold text-slate-500 block">使用自定义头像 URL 地址</label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={customUrl}
                    onChange={(e) => setCustomUrl(e.target.value)}
                    placeholder="输入 https://... 图片地址"
                    className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:border-blue-500"
                  />
                  <button
                    type="submit"
                    className="bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs px-4 py-2 rounded-xl transition-all shadow-sm active:scale-95 shrink-0"
                  >
                    确定
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
