import React, { useState, useEffect } from 'react';
import { Gift, CheckCircle2, ShieldAlert, Award, Star, Zap, QrCode, Copy, Sparkles, Mail, FileText } from 'lucide-react';

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
}

interface Announcement {
  id: number;
  title: string;
  imageUrl: string;
  linkUrl: string | null;
}

interface VipContact {
  wechatQr: string;
  wechatId: string;
  serviceEmail: string;
  notes: string;
}

export default function VipCenter({ token, userInfo, onRefresh }: VipCenterProps) {
  const [redeemCode, setRedeemCode] = useState('');
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [redeemSuccess, setRedeemSuccess] = useState<string | null>(null);
  const [redeemLoading, setRedeemLoading] = useState(false);

  // 公告与客服状态
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [contact, setContact] = useState<VipContact>({
    wechatQr: '',
    wechatId: 'Admin_VIP_Service',
    serviceEmail: 'admin@qq.com',
    notes: '人工服务在线时间：每日 9:00 - 22:00。加微信号请备注“错题本VIP升级”。',
  });
  
  // 轮播图当前幻灯片索引
  const [currentSlide, setCurrentSlide] = useState(0);

  // 获取公告与私域联系方式
  useEffect(() => {
    const fetchVipData = async () => {
      try {
        const headers = { 'Authorization': `Bearer ${token}` };
        
        // 1. 获取激活的公告
        const annRes = await fetch('/api/announcements', { headers });
        if (annRes.ok) {
          const annData = await annRes.json();
          setAnnouncements(annData);
        }

        // 2. 获取客服配置
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

  // 轮播图自动播放
  useEffect(() => {
    if (announcements.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentSlide(prev => (prev + 1) % announcements.length);
    }, 4500);
    return () => clearInterval(interval);
  }, [announcements]);

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

  return (
    <div className="space-y-6 font-sans text-slate-700">
      
      {/* 1. 动态轮播图公告区 */}
      {announcements.length > 0 ? (
        <div className="relative w-full h-48 md:h-64 rounded-3xl overflow-hidden shadow-md border border-slate-200 group bg-slate-100">
          <div 
            className="flex h-full transition-transform duration-500 ease-out"
            style={{ 
              transform: `translateX(-${currentSlide * 100}%)`, 
              width: `${announcements.length * 100}%` 
            }}
          >
            {announcements.map((ann, idx) => (
              <div 
                key={ann.id} 
                onClick={() => ann.linkUrl && window.open(ann.linkUrl, '_blank')}
                className={`h-full flex-shrink-0 relative ${ann.linkUrl ? 'cursor-pointer' : ''}`}
                style={{ width: `${100 / announcements.length}%` }}
              >
                <img 
                  src={ann.imageUrl} 
                  alt={ann.title} 
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent flex items-end p-6">
                  <h3 className="text-white font-extrabold text-sm md:text-lg drop-shadow-md">{ann.title}</h3>
                </div>
              </div>
            ))}
          </div>
          
          {/* 左右导航按钮 */}
          {announcements.length > 1 && (
            <>
              <button 
                onClick={() => setCurrentSlide(prev => (prev - 1 + announcements.length) % announcements.length)}
                className="absolute left-4 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/40 hover:bg-white/80 backdrop-blur-sm flex items-center justify-center text-slate-800 opacity-0 group-hover:opacity-100 transition-opacity font-extrabold text-lg select-none cursor-pointer"
              >
                ‹
              </button>
              <button 
                onClick={() => setCurrentSlide(prev => (prev + 1) % announcements.length)}
                className="absolute right-4 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/40 hover:bg-white/80 backdrop-blur-sm flex items-center justify-center text-slate-800 opacity-0 group-hover:opacity-100 transition-opacity font-extrabold text-lg select-none cursor-pointer"
              >
                ›
              </button>
              
              {/* 分页圆点 */}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
                {announcements.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentSlide(idx)}
                    className={`w-2 h-2 rounded-full transition-all cursor-pointer ${
                      currentSlide === idx ? 'bg-white w-4' : 'bg-white/50 hover:bg-white/80'
                    }`}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      ) : (
        /* 无配置轮播图时，显示精美的默认设计卡片 */
        <div className="relative w-full h-44 rounded-3xl overflow-hidden shadow-md border border-slate-200 bg-gradient-to-r from-blue-600 to-indigo-600 flex items-center p-6 md:p-10 text-white">
          <div className="space-y-2 relative z-10 max-w-xl">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-[10px] font-black uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5 fill-yellow-300 text-yellow-300" />
              智能错题本会员特权
            </div>
            <h3 className="text-xl md:text-2xl font-black">升级 VIP / SVIP 高级会员</h3>
            <p className="text-xs text-blue-100 font-semibold leading-relaxed">
              支持更深层次的错题根因归纳，享受每日最高 300 次 AI 专属大模型解析，帮助您快速击破学习薄弱环节！
            </p>
          </div>
          <div className="absolute right-0 bottom-0 opacity-10 pointer-events-none transform translate-y-6 translate-x-6">
            <Award size={180} />
          </div>
        </div>
      )}

      {/* 2. 头部身份等级面板 */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 bottom-0 opacity-5 pointer-events-none transform translate-y-6 translate-x-6">
          <Award size={200} />
        </div>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative z-10">
          <div>
            <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest">Membership Dashboard</p>
            <h2 className="text-xl font-black mt-1">会员等级与额度中心</h2>
            <div className="flex flex-wrap gap-2.5 mt-3">
              <span className="bg-white/10 backdrop-blur-md px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5">
                <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
                当前身份: {userInfo?.role.toUpperCase() === 'ADMIN' ? '管理员' : userInfo?.role.toUpperCase() === 'VIP' ? 'VIP黄金会员' : userInfo?.role.toUpperCase() === 'SVIP' ? 'SVIP钻石会员' : '普通用户'}
              </span>
              <span className="bg-white/10 backdrop-blur-md px-3 py-1.5 rounded-xl text-xs font-bold">
                到期时间: {userInfo?.vipExpireAt || '永久额度/无期限限制'}
              </span>
            </div>
          </div>
          <div className="bg-white/5 backdrop-blur-md rounded-2xl p-4 border border-white/10 w-full md:w-auto">
            <p className="text-xs text-slate-300 font-semibold mb-1">今日 AI 分析额度</p>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-blue-400">{userInfo?.aiUsedToday}</span>
              <span className="text-xs text-slate-400">/ {userInfo?.aiLimit === Infinity ? '无限' : `${userInfo?.aiLimit}次`}</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              今日剩余可用：{userInfo?.aiRemaining}
            </p>
          </div>
        </div>
      </div>

      {/* 3. 两栏主要布局 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* 左栏：卡券兑换 */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-650 shadow-sm">
                <Gift className="w-5 h-5 animate-pulse" />
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
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl font-bold text-xs transition-all shadow-md shadow-indigo-600/10 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {redeemLoading ? '正在激活中...' : '立即提交兑换'}
              </button>
            </form>
          </div>
          <div className="mt-6 pt-4 border-t border-slate-100 text-slate-400 text-[10px] leading-relaxed">
            * 兑换说明：激活码一经兑换即作废。升级成功后相应的权益和限制将自动与您的账号绑定，系统重置重装不影响您的剩余天数。
          </div>
        </div>

        {/* 右栏：线下人工购买/私域引流 */}
        <div className="bg-gradient-to-br from-indigo-50/20 to-blue-50/20 rounded-3xl border border-indigo-100/70 p-6 shadow-sm flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-blue-600/10 to-indigo-600/10 rounded-full blur-xl transform translate-x-4 -translate-y-4"></div>
          
          <div className="space-y-4 relative z-10">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center text-white shadow-md shadow-blue-500/10">
                <QrCode className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-slate-900 text-sm">线下人工专享通道</h3>
                <p className="text-xs text-slate-500 font-semibold">微信扫码联系系统客服开通/获取卡密</p>
              </div>
            </div>
            
            <p className="text-xs text-slate-650 leading-relaxed">
              请扫码或添加微信号联系客服进行线下转账。完成付款后客服将为您的账号<b>直接授权</b>或者发卡<b>激活码</b>完成开通。
            </p>

            {/* 客服配置展示区：上下布局 */}
            <div className="flex flex-col gap-4 items-center bg-white/80 backdrop-blur-md p-5 rounded-2xl border border-slate-150 shadow-sm w-full">
              
              {/* 二维码图片展示 (上) */}
              {contact.wechatQr && (
                <div className="flex flex-col items-center justify-center border-b border-slate-100 pb-4 w-full">
                  <img 
                    src={contact.wechatQr} 
                    alt="微信收款/客服二维码" 
                    className="w-32 h-32 border border-slate-200 rounded-xl bg-white p-1.5 shadow-md object-cover"
                  />
                  <span className="text-[10px] text-slate-400 mt-2 font-bold tracking-wide">微信扫一扫联系客服</span>
                </div>
              )}

              {/* 客服文本详情 (下) */}
              <div className="space-y-3 w-full">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400 font-bold">客服微信号</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-black text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-lg select-all">{contact.wechatId}</span>
                    <button 
                      onClick={handleCopy}
                      className="text-[10px] text-blue-600 hover:text-blue-800 font-bold bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg transition-colors cursor-pointer flex items-center gap-0.5 shadow-sm"
                    >
                      <Copy className="w-2.5 h-2.5" />
                      <span>复制</span>
                    </button>
                  </div>
                </div>
                
                <div className="flex items-center justify-between text-xs border-t border-slate-100 pt-3">
                  <span className="text-slate-400 font-bold">客服邮箱</span>
                  <span className="font-bold text-slate-700 flex items-center gap-1">
                    <Mail className="w-3.5 h-3.5 text-slate-400" />
                    <span>{contact.serviceEmail}</span>
                  </span>
                </div>

                <div className="text-[10px] text-slate-500 leading-relaxed border-t border-slate-100 pt-3">
                  {contact.notes}
                </div>
              </div>

            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-200/60 text-[10px] text-slate-450 leading-relaxed relative z-10 font-semibold">
            加客服请备注“错题本VIP升级”及登录的邮箱账号，以便我们以最快速度为您激活权益。
          </div>
        </div>

      </div>

    </div>
  );
}
