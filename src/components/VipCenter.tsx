import React, { useState } from 'react';
import { Gift, CreditCard, CheckCircle2, ShieldAlert, Award, Star, Calendar, Zap } from 'lucide-react';

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

export default function VipCenter({ token, userInfo, onRefresh }: VipCenterProps) {
  const [redeemCode, setRedeemCode] = useState('');
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [redeemSuccess, setRedeemSuccess] = useState<string | null>(null);
  const [redeemLoading, setRedeemLoading] = useState(false);

  // 模拟支付弹窗状态
  const [showPayModal, setShowPayModal] = useState(false);
  const [currentPlan, setCurrentPlan] = useState<{ name: string; amount: number; desc: string } | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [payLoading, setPayLoading] = useState(false);
  const [payConfirmLoading, setPayConfirmLoading] = useState(false);

  // 1. 兑换激活码
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

  // 2. 发起支付
  const handleInitiatePay = async (plan: { name: string; amount: number; desc: string }) => {
    setPayLoading(true);
    setCurrentPlan(plan);
    try {
      const res = await fetch('/api/user/pay', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ amount: plan.amount })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '订单发起失败');
      }
      setOrderId(data.orderId);
      setQrUrl(data.qrUrl);
      setShowPayModal(true);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setPayLoading(false);
    }
  };

  // 3. 确认支付成功
  const handleConfirmPay = async () => {
    if (!orderId) return;
    setPayConfirmLoading(true);
    try {
      const res = await fetch('/api/user/pay-success', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ orderId })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '支付确认失败');
      }
      alert('模拟支付成功！您的会员已成功延长。');
      setShowPayModal(false);
      onRefresh();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setPayConfirmLoading(false);
    }
  };

  const plans = [
    { name: '黄金会员', amount: 19, desc: '30 天 VIP 额度', details: '每天限用 100 次 AI 分析' },
    { name: '钻石会员', amount: 99, desc: '365 天 VIP 额度', details: '每天限用 100 次 AI 分析' },
    { name: '尊享 SVIP', amount: 199, desc: '365 天 SVIP 额度', details: '每天限用 300 次 AI 分析' }
  ];

  return (
    <div className="space-y-6 font-sans">
      
      {/* 头部面板 */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 bottom-0 opacity-10 pointer-events-none transform translate-y-6 translate-x-6">
          <Award size={200} />
        </div>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative z-10">
          <div>
            <p className="text-xs text-blue-200 uppercase font-black tracking-widest">Membership Dashboard</p>
            <h2 className="text-2xl font-black mt-1">会员等级与额度中心</h2>
            <div className="flex flex-wrap gap-2.5 mt-3">
              <span className="bg-white/20 backdrop-blur-md px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5">
                <Star className="w-3.5 h-3.5 fill-yellow-300 text-yellow-300" />
                当前身份: {userInfo?.role.toUpperCase()}
              </span>
              <span className="bg-white/20 backdrop-blur-md px-3 py-1.5 rounded-xl text-xs font-bold">
                到期时间: {userInfo?.vipExpireAt || '未激活会员'}
              </span>
            </div>
          </div>
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/10 w-full md:w-auto">
            <p className="text-xs text-blue-100 font-semibold mb-1">今日 AI 分析额度</p>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black">{userInfo?.aiUsedToday}</span>
              <span className="text-xs text-blue-200">/ {userInfo?.aiLimit === Infinity ? '无限' : `${userInfo?.aiLimit}次`}</span>
            </div>
            <p className="text-[10px] text-blue-200 mt-1">
              今日剩余可用：{userInfo?.aiRemaining}
            </p>
          </div>
        </div>
      </div>

      {/* 三栏布局 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* 兑换激活码卡片 */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600">
                <Gift className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900">激活码兑换</h3>
                <p className="text-xs text-slate-500">输入您的卡券激活码以升级会员等级</p>
              </div>
            </div>

            <form onSubmit={handleRedeem} className="space-y-3">
              <input
                type="text"
                placeholder="请输入格式如 XXXX-XXXX-XXXX-XXXX 的兑换码"
                value={redeemCode}
                onChange={e => setRedeemCode(e.target.value)}
                className="w-full p-3.5 bg-slate-50 border border-slate-250 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm font-semibold text-slate-800 transition-all placeholder-slate-400"
              />
              {redeemError && (
                <div className="bg-rose-50 text-rose-600 border border-rose-100 p-3 rounded-xl text-xs font-semibold flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  {redeemError}
                </div>
              )}
              {redeemSuccess && (
                <div className="bg-emerald-50 text-emerald-600 border border-emerald-100 p-3 rounded-xl text-xs font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  {redeemSuccess}
                </div>
              )}
              <button
                type="submit"
                disabled={redeemLoading || !redeemCode.trim()}
                className="w-full bg-indigo-650 hover:bg-indigo-700 text-white py-3 rounded-xl font-bold transition-all shadow-md shadow-indigo-600/10 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {redeemLoading ? '正在激活...' : '立即兑换激活'}
              </button>
            </form>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100 text-slate-400 text-[10px] leading-relaxed">
            * 兑换码通常由服务商或管理员发放。每个激活码仅可使用一次，使用后立即生效并增加对应的会员天数。
          </div>
        </div>

        {/* 扫码演示支付卡片 */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
                <CreditCard className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900">扫码演示支付</h3>
                <p className="text-xs text-slate-500">模拟虚拟收银台测试通道</p>
              </div>
            </div>
            
            <p className="text-xs text-slate-600 leading-relaxed mb-4">
              用于技术演示及后期接口联调的<b>模拟通道</b>。在此付款不会扣除真实费用，可秒级自动升级：
            </p>

            <div className="space-y-2">
              {plans.map((plan, idx) => (
                <div 
                  key={idx} 
                  className="flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200/60 transition-colors"
                >
                  <div className="max-w-[70%]">
                    <h4 className="font-bold text-xs text-slate-800">{plan.name}</h4>
                    <p className="text-[9px] text-slate-500 mt-0.5">{plan.desc} · {plan.details}</p>
                  </div>
                  <button
                    onClick={() => handleInitiatePay(plan)}
                    disabled={payLoading}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-[10px] px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                  >
                    ¥{plan.amount}
                  </button>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100 text-slate-400 text-[10px] leading-relaxed">
            * 真实支付功能后续上线。当前通道仅为支付逻辑联调，用户可点击发起模拟订单以测试会员系统自动升级逻辑。
          </div>
        </div>

        {/* 线下人工购买卡片 */}
        <div className="bg-gradient-to-br from-indigo-50/50 to-blue-50/50 rounded-3xl border border-indigo-100 p-6 shadow-sm flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-blue-600/10 to-indigo-650/10 rounded-full blur-xl transform translate-x-4 -translate-y-4"></div>
          <div className="relative z-10">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-550 to-indigo-650 rounded-xl flex items-center justify-center text-white shadow-md shadow-blue-500/10">
                <Gift className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900">线下人工购买</h3>
                <p className="text-xs text-slate-500">联系系统客服人工直接开通</p>
              </div>
            </div>
            
            <p className="text-xs text-slate-600 leading-relaxed mb-4">
              如需正式升级开通，请联系管理员线下转账购买，管理员将为您在后台<b>直接授权开通</b>会员资格或<b>分发激活激活码</b>。
            </p>

            <div className="space-y-3 bg-white/70 backdrop-blur-md p-4 rounded-2xl border border-slate-150 shadow-sm">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 font-semibold">客服微信号</span>
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-lg">Admin_VIP_Service</span>
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText("Admin_VIP_Service");
                      alert("客服微信号已成功复制到剪贴板！");
                    }}
                    className="text-[10px] text-blue-600 hover:text-blue-800 font-bold bg-blue-50/80 hover:bg-blue-100/80 px-2 py-0.5 rounded-lg transition-colors cursor-pointer"
                  >
                    复制
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs border-t border-slate-100 pt-2">
                <span className="text-slate-400 font-semibold">服务邮箱</span>
                <span className="font-bold text-slate-700">admin@qq.com</span>
              </div>
              <div className="text-[9px] text-slate-400 leading-relaxed border-t border-slate-100 pt-2">
                * 备注说明：加好友请备注“错题本VIP升级”及您的登录邮箱账号。
              </div>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-150 text-[10px] text-slate-400 leading-relaxed relative z-10">
            人工服务在线时间：每日 9:00 - 22:00。非工作时段可留言，我们将在上线后第一时间为您授权。
          </div>
        </div>

      </div>

      {/* 虚拟支付二维码 Modal */}
      {showPayModal && currentPlan && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-6 relative animate-in fade-in zoom-in-95 duration-200">
            <button 
              onClick={() => setShowPayModal(false)} 
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 font-bold text-lg outline-none cursor-pointer"
            >
              ✕
            </button>
            <div className="mb-4 text-center">
              <h3 className="text-lg font-black text-slate-900">模拟收银台 (测试环境)</h3>
              <p className="text-xs text-slate-500 mt-1">订单ID: {orderId}</p>
            </div>

            <div className="flex flex-col items-center p-6 bg-slate-50 rounded-2xl border border-slate-200/80 mb-6">
              <p className="text-xs font-semibold text-slate-600 mb-4">购买项目：{currentPlan.name} (¥{currentPlan.amount})</p>
              {qrUrl ? (
                <img 
                  src={qrUrl} 
                  alt="Payment QR" 
                  className="w-36 h-36 border border-slate-200 rounded-xl bg-white p-2 shadow-sm"
                />
              ) : (
                <div className="w-36 h-36 border border-dashed border-slate-300 rounded-xl bg-white flex items-center justify-center text-xs text-slate-400">
                  生成中...
                </div>
              )}
              <p className="text-[10px] text-slate-400 mt-4 text-center">
                由于本平台未接入真实商户，请使用下方按钮测试“模拟支付成功”回调
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowPayModal(false)}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition-colors cursor-pointer"
              >
                取消购买
              </button>
              <button
                onClick={handleConfirmPay}
                disabled={payConfirmLoading}
                className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs transition-colors shadow-md shadow-emerald-500/20 cursor-pointer"
              >
                {payConfirmLoading ? '确认中...' : '模拟支付成功 (测试按钮)'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
