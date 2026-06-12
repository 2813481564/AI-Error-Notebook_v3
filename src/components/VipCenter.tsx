import React, { useState, useEffect } from 'react';
import { Crown, Zap, Sparkles, BookOpen, Award, ArrowRight, Check, X, QrCode, Mail, Copy, CheckCircle2, Star, ShieldAlert } from 'lucide-react';

interface VipCenterProps {
  token: string | null;
  userInfo: {
    role: string;
    vipExpireAt: string | null;
    aiUsedToday: number;
    aiLimit: number;
    aiRemaining: string | number;
  } | null;
  onRefresh: () => void;
  onNavigate: (view: any) => void;
}

interface VipContact {
  wechatQr: string;
  wechatId: string;
  serviceEmail: string;
  notes: string;
  vipCardTag?: string;
  vipCardTitle?: string;
  vipCardDesc?: string;
  priceVipMonth?: string;
  priceVipYear?: string;
  priceSvipMonth?: string;
  priceSvipYear?: string;
  limitVip?: string;
  limitSvip?: string;
}

export default function VipCenter({ token, userInfo, onRefresh, onNavigate }: VipCenterProps) {
  const [redeemCode, setRedeemCode] = useState('');
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [redeemSuccess, setRedeemSuccess] = useState<string | null>(null);
  const [redeemLoading, setRedeemLoading] = useState(false);

  // 私域联系方式状态
  const [contact, setContact] = useState<VipContact>({
    wechatQr: '',
    wechatId: 'Admin_VIP_Service',
    serviceEmail: 'admin@qq.com',
    notes: '人工服务在线时间：每日 9:00 - 22:00。加微信号请备注“错题本VIP升级”。',
  });

  // 模拟支付状态
  const [showPayModal, setShowPayModal] = useState(false);
  const [payAmount, setPayAmount] = useState(0);
  const [payRole, setPayRole] = useState<'vip' | 'svip'>('vip');
  const [payDuration, setPayDuration] = useState<'month' | 'year'>('month');
  const [orderId, setOrderId] = useState('');
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [payLoading, setPayLoading] = useState(false);
  const [payModalError, setPayModalError] = useState<string | null>(null);

  // 轮播公告状态
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [currentAnnIndex, setCurrentAnnIndex] = useState(0);

  // 获取公告列表
  useEffect(() => {
    const fetchAnnouncements = async () => {
      try {
        const res = await fetch('/api/announcements');
        if (res.ok) {
          const list = await res.json();
          setAnnouncements(list.filter((ann: any) => ann.status === 'active'));
        }
      } catch (err) {
        console.error('Failed to fetch announcements:', err);
      }
    };
    fetchAnnouncements();
  }, []);

  // 轮播公告自动切换
  useEffect(() => {
    if (announcements.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentAnnIndex(prev => (prev + 1) % announcements.length);
    }, 4500);
    return () => clearInterval(timer);
  }, [announcements]);

  // 获取私域联系方式
  useEffect(() => {
    const fetchVipData = async () => {
      try {
        const headers = { 'Authorization': `Bearer ${token}` };
        const contactRes = await fetch('/api/vip/contact', { headers });
        if (contactRes.ok) {
          const contactData = await contactRes.json();
          setContact(contactData);
        }
      } catch (err) {
        console.error('Failed to fetch VipCenter data:', err);
      }
    };

    fetchVipData();
  }, [token]);

  // 兑换激活码
  const handleRedeem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!redeemCode.trim()) return;

    setRedeemLoading(true);
    setRedeemError(null);
    setRedeemSuccess(null);

    try {
      const res = await fetch('/api/user/redeem', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ code: redeemCode.trim() })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '激活失败');
      }
      setRedeemSuccess(`成功激活 ${data.role.toUpperCase()} 会员！有效期至：${data.vipExpireAt}`);
      setRedeemCode('');
      onRefresh();
    } catch (err: any) {
      setRedeemError(err.message);
    } finally {
      setRedeemLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(contact.wechatId);
    alert('微信号已复制成功！请在微信中搜索添加。');
  };

  // 发起模拟支付
  const handleInitiatePay = async (role: 'vip' | 'svip', duration: 'month' | 'year') => {
    alert('当前支付功能未开放，请联系下方客服');
    document.getElementById('contact-support')?.scrollIntoView({ behavior: 'smooth' });
  };

  // 获取当前等级显示
  const getRoleDisplay = () => {
    const role = userInfo?.role.toLowerCase();
    if (role === 'admin') return '管理员';
    if (role === 'svip') return 'SVIP钻石会员';
    if (role === 'vip') return 'VIP黄金会员';
    return '免费版';
  };

  return (
    <div className="space-y-6 font-sans text-slate-700 pb-8 animate-in fade-in duration-500">

      {/* 轮播公告 Banner */}
      {announcements.length > 0 && (
        <div className="relative w-full h-[120px] md:h-[150px] overflow-hidden rounded-3xl border border-slate-200/80 shadow-sm bg-gradient-to-r from-indigo-900 to-indigo-950 group">
          {announcements.map((ann, idx) => (
            <a
              key={ann.id}
              href={ann.linkUrl || '#'}
              target={ann.linkUrl ? '_blank' : '_self'}
              rel="noopener noreferrer"
              className={`absolute inset-0 w-full h-full flex items-center justify-between transition-all duration-700 ease-in-out cursor-pointer ${idx === currentAnnIndex
                ? 'opacity-100 translate-x-0 pointer-events-auto'
                : 'opacity-0 translate-x-full pointer-events-none'
                }`}
            >
              {/* 背景图 */}
              {ann.imageUrl ? (
                <img
                  src={ann.imageUrl}
                  alt={ann.title}
                  className="absolute inset-0 w-full h-full object-cover opacity-80 group-hover:scale-102 transition-transform duration-700"
                />
              ) : null}

              {/* 蒙层与内容 */}
              <div className="absolute inset-0 bg-gradient-to-r from-slate-950/90 via-slate-955/40 to-transparent p-6 md:p-8 flex flex-col justify-center text-white z-10">
                <span className="bg-indigo-650/90 text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full w-max border border-indigo-500/30 tracking-wider mb-2">
                  系统公告
                </span>
                <h3 className="text-sm md:text-lg font-black tracking-tight drop-shadow-sm line-clamp-1 max-w-lg">
                  {ann.title}
                </h3>
              </div>

              {/* 跳转指示 */}
              {ann.linkUrl && (
                <div className="absolute right-6 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 backdrop-blur-sm text-white w-8 h-8 rounded-full flex items-center justify-center transition-all z-20">
                  <ArrowRight className="w-4 h-4" />
                </div>
              )}
            </a>
          ))}

          {/* 指示器 Dots */}
          {announcements.length > 1 && (
            <div className="absolute bottom-3 right-6 flex gap-1.5 z-20">
              {announcements.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentAnnIndex(idx)}
                  className={`w-1.5 h-1.5 rounded-full transition-all cursor-pointer ${idx === currentAnnIndex ? 'bg-white w-3.5' : 'bg-white/40'
                    }`}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* 1. 顶部身份与宣传横栏 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* 左卡片：解锁完整的 AI 错题本能力 */}
        <div className="lg:col-span-2 bg-white rounded-3xl p-8 border border-slate-200/80 shadow-sm flex flex-col justify-between min-h-[260px]">
          <div className="space-y-4">
            <span className="inline-flex items-center gap-1 text-[11px] font-black uppercase text-amber-700 bg-amber-50 px-3 py-1 rounded-full border border-amber-100/50">
              <Crown className="w-3.5 h-3.5 fill-amber-500 text-amber-600" />
              {contact.vipCardTag || '智能错题本会员'}
            </span>
            <h2 className="text-3xl font-black text-slate-900 tracking-tight leading-tight">
              {contact.vipCardTitle || '解锁更完整的 AI 错题本能力'}
            </h2>
            <p className="text-xs text-slate-400 font-semibold leading-relaxed max-w-xl">
              {contact.vipCardDesc || 'VIP 覆盖日常练习与组卷，SVIP 解锁探索模式和费曼学习。支持支付宝自助开通；如需对公或发票，可下滑联系客服协助。'}
            </p>
          </div>
          <div className="flex flex-wrap gap-3 mt-6">
            <button
              onClick={() => document.getElementById('pricing-packages')?.scrollIntoView({ behavior: 'smooth' })}
              className="bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold px-5 py-3 rounded-xl transition flex items-center gap-1.5 shadow-sm shadow-amber-700/10 cursor-pointer"
            >
              选购会员套餐
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => document.getElementById('contact-support')?.scrollIntoView({ behavior: 'smooth' })}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-5 py-3 rounded-xl transition flex items-center gap-1.5 cursor-pointer"
            >
              联系客服
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onNavigate('dashboard')}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-5 py-3 rounded-xl transition flex items-center gap-1.5 cursor-pointer"
            >
              返回设置
            </button>
          </div>
        </div>

        {/* 右卡片：当前身份与限额指标 */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="bg-slate-100 text-slate-700 text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider">
                {userInfo?.role.toLowerCase() === 'student' ? '免费版' : getRoleDisplay()}
              </span>
              <span className="text-[10px] text-slate-400 font-bold">
                {userInfo?.role.toLowerCase() === 'student' ? '长期有效' : `有效期至 ${userInfo?.vipExpireAt || '长期有效'}`}
              </span>
            </div>

            {/* 3个核心额度指标 */}
            <div className="grid grid-cols-1 gap-3 mt-5">

              {/* AI 学习额度 */}
              <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-100 rounded-2xl">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 bg-amber-50 rounded-lg flex items-center justify-center text-amber-600">
                    <Zap className="w-4 h-4 fill-amber-500" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-slate-400 font-bold">AI 学习额度</span>
                    <span className="text-xs font-bold text-slate-700 mt-0.5">
                      {userInfo?.aiLimit === Infinity ? '无限制' : `${userInfo?.aiUsedToday || 0} / ${userInfo?.aiLimit || 30}次`}
                    </span>
                  </div>
                </div>
              </div>

              {/* 错题容量 */}
              <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-100 rounded-2xl">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 bg-indigo-50 rounded-lg flex items-center justify-center text-indigo-650">
                    <BookOpen className="w-4 h-4" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-slate-400 font-bold">错题容量</span>
                    <span className="text-xs font-bold text-slate-700 mt-0.5">
                      {userInfo?.role.toLowerCase() === 'svip' || userInfo?.role.toLowerCase() === 'admin' ? '无限' : userInfo?.role.toLowerCase() === 'vip' ? '500 题' : '50 题'}
                    </span>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>

      </div>

      {/* 2. 权益对比看板 */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="space-y-1">
            <span className="inline-flex items-center gap-1 text-[11px] font-black uppercase text-blue-700 bg-blue-50 px-3 py-1 rounded-full border border-blue-100/50">
              权益对比
            </span>
            <h3 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2 mt-1">
              VIP / SVIP 10 项权益一眼看懂
            </h3>
          </div>
          <button
            onClick={() => document.getElementById('contact-support')?.scrollIntoView({ behavior: 'smooth' })}
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-4 py-2.5 rounded-xl transition flex items-center gap-1 cursor-pointer"
          >
            联系客服
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* 权益表格 */}
        <div className="overflow-x-auto border border-slate-100 rounded-2xl">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="p-4 text-xs font-bold text-slate-500 w-1/3">权益</th>
                <th className="p-4 text-xs font-black text-blue-700 bg-blue-50/50 text-center w-1/3">
                  <div className="flex items-center justify-center gap-1">
                    <Crown className="w-4 h-4 fill-blue-500 text-blue-600" />
                    <span>SVIP</span>
                  </div>
                </th>
                <th className="p-4 text-xs font-black text-amber-700 bg-amber-50/30 text-center w-1/3">
                  <div className="flex items-center justify-center gap-1">
                    <Crown className="w-4 h-4 fill-amber-500 text-amber-600" />
                    <span>VIP</span>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs font-semibold text-slate-700">

              {/* 探索模式 */}
              <tr>
                <td className="p-4">
                  <div className="flex flex-col">
                    <span>探索模式</span>
                    <span className="text-[10px] text-blue-600 bg-blue-50 border border-blue-100/30 px-1.5 py-0.5 rounded w-max mt-1 font-bold">SVIP 专属</span>
                  </div>
                </td>
                <td className="p-4 text-center bg-blue-50/20 text-blue-700 font-extrabold">交互式可视化</td>
                <td className="p-4 text-center bg-amber-50/10 text-slate-400">
                  <X className="w-4 h-4 mx-auto text-slate-350" />
                </td>
              </tr>

              {/* 费曼学习 */}
              <tr>
                <td className="p-4">
                  <div className="flex flex-col">
                    <span>费曼学习</span>
                    <span className="text-[10px] text-blue-600 bg-blue-50 border border-blue-100/30 px-1.5 py-0.5 rounded w-max mt-1 font-bold">SVIP 专属</span>
                  </div>
                </td>
                <td className="p-4 text-center bg-blue-50/20 text-blue-700 font-extrabold">对话 + 评估</td>
                <td className="p-4 text-center bg-amber-50/10 text-slate-400">
                  <X className="w-4 h-4 mx-auto text-slate-350" />
                </td>
              </tr>

              {/* AI 学习额度 */}
              <tr>
                <td className="p-4">AI 学习额度</td>
                <td className="p-4 text-center bg-blue-50/20 text-blue-700 font-extrabold">{contact.limitSvip || '300'} 次/天</td>
                <td className="p-4 text-center bg-amber-50/10 text-amber-700 font-extrabold">{contact.limitVip || '100'} 次/天</td>
              </tr>

              {/* 错题容量 */}
              <tr>
                <td className="p-4">错题容量</td>
                <td className="p-4 text-center bg-blue-50/20 text-blue-700 font-extrabold">无限</td>
                <td className="p-4 text-center bg-amber-50/10 text-amber-700 font-extrabold">500 题</td>
              </tr>

              {/* 错题本数量 */}
              <tr>
                <td className="p-4">错题本数量</td>
                <td className="p-4 text-center bg-blue-50/20 text-blue-700 font-extrabold">无限</td>
                <td className="p-4 text-center bg-amber-50/10 text-amber-700 font-extrabold">20 个</td>
              </tr>

              {/* 组卷练习 */}
              <tr>
                <td className="p-4">组卷练习</td>
                <td className="p-4 text-center bg-blue-50/20">
                  <Check className="w-4 h-4 mx-auto text-blue-600 stroke-[3]" />
                </td>
                <td className="p-4 text-center bg-amber-50/10">
                  <Check className="w-4 h-4 mx-auto text-amber-600 stroke-[3]" />
                </td>
              </tr>

              {/* 举一反三 */}
              <tr>
                <td className="p-4">举一反三</td>
                <td className="p-4 text-center bg-blue-50/20">
                  <Check className="w-4 h-4 mx-auto text-blue-600 stroke-[3]" />
                </td>
                <td className="p-4 text-center bg-amber-50/10">
                  <Check className="w-4 h-4 mx-auto text-amber-600 stroke-[3]" />
                </td>
              </tr>

              {/* 闪卡学习 */}
              <tr>
                <td className="p-4">闪卡学习</td>
                <td className="p-4 text-center bg-blue-50/20">
                  <Check className="w-4 h-4 mx-auto text-blue-600 stroke-[3]" />
                </td>
                <td className="p-4 text-center bg-amber-50/10">
                  <Check className="w-4 h-4 mx-auto text-amber-600 stroke-[3]" />
                </td>
              </tr>

            </tbody>
          </table>
        </div>
      </div>

      {/* 3. 会员订购套餐 */}
      <div id="pricing-packages" className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* VIP 套餐 */}
        <div className="bg-white rounded-3xl p-8 border border-slate-200/80 shadow-sm flex flex-col justify-between relative hover:border-amber-300 hover:shadow-md transition-all duration-300">
          <div className="space-y-6">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-2xl font-black text-slate-900 tracking-tight">VIP</h3>
                <p className="text-xs text-slate-400 font-semibold mt-1">适合日常错题整理与练习闭环</p>
              </div>
              <span className="bg-amber-50 text-amber-700 text-xs font-black px-2.5 py-1 rounded-full border border-amber-100/50 shrink-0">
                ¥{contact.priceVipMonth || '19.90'} • ¥{contact.priceVipYear || '199.00'}
              </span>
            </div>

            {/* 标签 */}
            <div className="flex flex-wrap gap-1.5">
              <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded">组卷练习</span>
              <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded">{contact.limitVip || '100'}次/天 AI 学习额度</span>
            </div>

            {/* 参数卡片 */}
            <div className="grid grid-cols-2 gap-2">
              <div className="p-3 bg-slate-50 rounded-xl flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-600 fill-amber-500 shrink-0" />
                <span className="text-[11px] font-bold text-slate-700">AI 学习 {contact.limitVip || '100'} 次/天</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-indigo-600 shrink-0" />
                <span className="text-[11px] font-bold text-slate-700">错题 500 题</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl flex items-center gap-2">
                <Crown className="w-4 h-4 text-purple-600 fill-purple-200 shrink-0" />
                <span className="text-[11px] font-bold text-slate-700">错题本 20 个</span>
              </div>
            </div>

            {/* 详细特权列表 */}
            <ul className="space-y-2.5 text-xs font-semibold text-slate-600 pt-2 border-t border-slate-100">
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <span>开放组卷练习，支持按错题生成试卷</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <span>更高 AI 学习额度，覆盖日常拍照、练习、闪卡</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <span>更多错题本和错题容量，适合多学科整理</span>
              </li>
            </ul>
          </div>

          <div className="space-y-2.5 mt-8">
            <button
              onClick={() => handleInitiatePay('vip', 'month')}
              className="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-extrabold py-3.5 rounded-xl transition flex items-center justify-center gap-1 cursor-pointer"
            >
              VIP 月卡 ¥{contact.priceVipMonth || '19.90'} →
            </button>
            <button
              onClick={() => handleInitiatePay('vip', 'year')}
              className="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-extrabold py-3.5 rounded-xl transition flex items-center justify-center gap-1 cursor-pointer"
            >
              VIP 年卡 ¥{contact.priceVipYear || '199.00'} →
            </button>
          </div>
        </div>

        {/* SVIP 套餐 */}
        <div className="bg-white rounded-3xl p-8 border-2 border-amber-600/70 shadow-sm flex flex-col justify-between relative hover:border-amber-600 hover:shadow-md transition-all duration-300">
          <div className="absolute -top-3 right-8 bg-amber-600 text-white text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider">
            推荐
          </div>

          <div className="space-y-6">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-2xl font-black text-slate-900 tracking-tight">SVIP</h3>
                <p className="text-xs text-slate-400 font-semibold mt-1">适合深度学习、讲解训练和长期错题库</p>
              </div>
              <span className="bg-amber-700 text-white text-xs font-black px-2.5 py-1 rounded-full shrink-0">
                ¥{contact.priceSvipMonth || '29.90'} • ¥{contact.priceSvipYear || '299.00'}
              </span>
            </div>

            {/* 标签 */}
            <div className="flex flex-wrap gap-1.5">
              <span className="bg-blue-50 text-blue-600 text-[10px] font-bold px-2 py-0.5 rounded">探索模式</span>
              <span className="bg-blue-50 text-blue-600 text-[10px] font-bold px-2 py-0.5 rounded">费曼学习</span>
              <span className="bg-blue-50 text-blue-600 text-[10px] font-bold px-2 py-0.5 rounded">无限错题库</span>
            </div>

            {/* 参数卡片 */}
            <div className="grid grid-cols-2 gap-2">
              <div className="p-3 bg-blue-50/30 rounded-xl flex items-center gap-2">
                <Zap className="w-4 h-4 text-blue-650 fill-blue-500 shrink-0" />
                <span className="text-[11px] font-bold text-slate-700">AI 学习 {contact.limitSvip || '300'} 次/天</span>
              </div>
              <div className="p-3 bg-blue-50/30 rounded-xl flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-indigo-600 shrink-0" />
                <span className="text-[11px] font-bold text-slate-700">错题 无限</span>
              </div>
              <div className="p-3 bg-blue-50/30 rounded-xl flex items-center gap-2">
                <Crown className="w-4 h-4 text-purple-600 fill-purple-200 shrink-0" />
                <span className="text-[11px] font-bold text-slate-700">错题本 无限</span>
              </div>
            </div>

            {/* 详细特权列表 */}
            <ul className="space-y-2.5 text-xs font-semibold text-slate-600 pt-2 border-t border-slate-100">
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <span>包含 VIP 的全部权益</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <span>开放探索模式，用交互式可视化理解题目</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <span>开放费曼学习，通过讲解与评估检验掌握度</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <span>更多 AI 学习额度</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <span>错题本和错题容量不设上限</span>
              </li>
            </ul>
          </div>

          <div className="space-y-2.5 mt-8">
            <button
              onClick={() => handleInitiatePay('svip', 'month')}
              className="w-full bg-amber-700 hover:bg-amber-800 text-white text-xs font-extrabold py-3.5 rounded-xl transition flex items-center justify-center gap-1 shadow-md shadow-amber-700/10 cursor-pointer"
            >
              SVIP 月卡 ¥{contact.priceSvipMonth || '29.90'} →
            </button>
            <button
              onClick={() => handleInitiatePay('svip', 'year')}
              className="w-full bg-amber-700 hover:bg-amber-800 text-white text-xs font-extrabold py-3.5 rounded-xl transition flex items-center justify-center gap-1 shadow-md shadow-amber-700/10 cursor-pointer"
            >
              SVIP 年卡 ¥{contact.priceSvipYear || '299.00'} →
            </button>
          </div>
        </div>

      </div>

      {/* 4. 横向权益卖点横条 */}
      <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex flex-wrap items-center justify-around gap-4 text-xs font-semibold text-slate-500">
        <div className="flex items-center gap-1.5">
          <BookOpen className="w-4 h-4 text-amber-600 shrink-0" />
          <span>SVIP 独享探索模式</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Crown className="w-4 h-4 text-amber-600 shrink-0" />
          <span>SVIP 独享费曼学习</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Zap className="w-4 h-4 text-amber-600 shrink-0" />
          <span>VIP 起开放组卷练习</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Award className="w-4 h-4 text-amber-600 shrink-0" />
          <span>配额按 30 天周期重置</span>
        </div>
      </div>

      {/* 5. 底部两栏：激活码兑换 + 私域客服二维码 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* 左栏：卡券兑换 (col-span-5) */}
        <div className="lg:col-span-5 bg-white rounded-3xl border border-slate-200/80 p-6 shadow-sm flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600 shadow-sm shrink-0">
                <Award className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-slate-900 text-sm">激活码兑换中心</h3>
                <p className="text-xs text-slate-400 font-semibold">输入您的激活券码以自助升级身份</p>
              </div>
            </div>

            <form onSubmit={handleRedeem} className="space-y-3">
              <input
                type="text"
                placeholder="请输入格式为 XXXX-XXXX-XXXX-XXXX 的激活码"
                value={redeemCode}
                onChange={e => setRedeemCode(e.target.value)}
                className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-xs font-semibold text-slate-800 transition-all placeholder-slate-400"
              />
              {redeemError && (
                <div className="bg-rose-50 text-rose-600 border border-rose-100 p-3 rounded-xl text-xs font-semibold flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  {redeemError}
                </div>
              )}
              {redeemSuccess && (
                <div className="bg-emerald-50 text-emerald-600 border border-emerald-100 p-3 rounded-xl text-xs font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
                  {redeemSuccess}
                </div>
              )}
              <button
                type="submit"
                disabled={redeemLoading || !redeemCode.trim()}
                className="w-full bg-slate-900 hover:bg-black text-white py-3.5 rounded-xl font-bold text-xs transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {redeemLoading ? '正在激活中...' : '立即提交兑换'}
              </button>
            </form>
          </div>
          <div className="mt-6 pt-4 border-t border-slate-100 text-slate-400 text-[10px] leading-relaxed">
            * 兑换说明：激活码一经兑换即作废。升级成功后相应的权益和限制将自动与您的账号绑定，系统重置重装不影响您的剩余天数。
          </div>
        </div>

        {/* 右栏：微信客服协助 (col-span-7) */}
        <div id="contact-support" className="lg:col-span-7 bg-white rounded-3xl border border-slate-200/80 p-6 shadow-sm flex flex-col md:flex-row justify-between gap-6 relative overflow-hidden">

          <div className="space-y-4 flex-1">
            <div className="flex items-center gap-2.5">
              <span className="bg-amber-50 text-amber-700 text-[10px] font-black px-2.5 py-1 rounded-full border border-amber-100/50">

                智能错开通咨询
              </span>
            </div>

            <h3 className="text-xl font-black text-slate-900 tracking-tight">

              智能错 SVIP 客服协助
            </h3>

            <p className="text-xs text-slate-400 font-semibold leading-relaxed">
              已支持支付宝自助开通；如需人工协助、对公或发票，请添加客服并备注注册邮箱。
            </p>

            {/* <div className="flex flex-wrap gap-2.5 pt-2">
              <span className="bg-slate-50 text-slate-500 text-[10px] font-bold px-3 py-1.5 rounded-lg border border-slate-150">
                当前账号: {localStorage.getItem('errorbook_username') || '未知'}
              </span>
            </div> */}

            {/* 客服文本详情 */}
            <div className="space-y-3 w-full bg-slate-50 p-4 rounded-2xl border border-slate-100 mt-2">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="text-slate-400">客服微信号</span>
                <div className="flex items-center gap-1.5">
                  <span className="font-black text-indigo-700 select-all">{contact.wechatId}</span>
                  <button
                    onClick={handleCopy}
                    className="text-[10px] text-blue-600 hover:text-blue-800 font-bold bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded transition-colors cursor-pointer"
                  >
                    复制
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs font-semibold border-t border-slate-100 pt-2.5">
                <span className="text-slate-400">客服邮箱</span>
                <span className="font-bold text-slate-700 flex items-center gap-1">
                  <span>{contact.serviceEmail}</span>
                </span>
              </div>
            </div>
          </div>

          {/* 二维码展示 */}
          <div className="flex flex-col items-center justify-center shrink-0 border border-slate-100 rounded-2xl p-4 bg-slate-50 max-w-[180px] mx-auto md:mx-0">
            {contact.wechatQr ? (
              <img
                src={contact.wechatQr}
                alt="微信客服二维码"
                className="w-28 h-28 border border-slate-200 rounded-xl bg-white p-1 shadow-sm object-cover"
              />
            ) : (
              <div className="w-28 h-28 bg-white border border-slate-200 rounded-xl flex items-center justify-center text-slate-300">
                <QrCode className="w-12 h-12 animate-pulse" />
              </div>
            )}
            <span className="text-[9px] text-slate-400 mt-2 font-bold tracking-wide text-center">微信扫码联系客服</span>
          </div>

        </div>

      </div>
    </div>
  );
}
