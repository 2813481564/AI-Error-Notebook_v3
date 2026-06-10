import React, { useState, useEffect } from 'react';
import { Megaphone, QrCode, Save, Plus, Trash2, Edit2, CheckCircle2, ShieldAlert, Sparkles, Image as ImageIcon, Link as LinkIcon, Layers, Eye, EyeOff } from 'lucide-react';

interface Announcement {
  id: number;
  title: string;
  imageUrl: string;
  linkUrl: string | null;
  sortOrder: number;
  status: 'active' | 'inactive';
  createdAt: number;
}

interface VipContact {
  wechatQr: string;
  wechatId: string;
  serviceEmail: string;
  notes: string;
}

export default function AnnouncementManagement() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingContact, setSavingContact] = useState(false);
  const [savingAnnouncement, setSavingAnnouncement] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // 私域配置状态
  const [contact, setContact] = useState<VipContact>({
    wechatQr: '',
    wechatId: '',
    serviceEmail: '',
    notes: '',
  });

  // 编辑/新增公告表单状态
  const [editingAnn, setEditingAnn] = useState<Partial<Announcement> | null>(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('errorbook_token');
      
      // 1. 获取私域客服配置
      const contactRes = await fetch('/api/vip/contact', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (contactRes.ok) {
        const contactData = await contactRes.json();
        setContact(contactData);
      }

      // 2. 获取所有公告
      const annRes = await fetch('/api/admin/announcements', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!annRes.ok) {
        throw new Error('获取公告列表失败');
      }
      const annData = await annRes.json();
      setAnnouncements(annData);
    } catch (err: any) {
      setError(err.message || '加载配置失败');
    } finally {
      setLoading(false);
    }
  };

  // 保存客服私域配置
  const handleSaveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingContact(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const token = localStorage.getItem('errorbook_token');
      const res = await fetch('/api/admin/vip/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(contact)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '保存私域配置失败');
      
      setSuccessMsg('微信私域购买配置保存成功！');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSavingContact(false);
    }
  };

  // 二维码文件选择转换 base64
  const handleQrUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setContact(prev => ({ ...prev, wechatQr: reader.result as string }));
    };
    reader.readAsDataURL(file);
  };

  // 公告图文件选择转换 base64
  const handleAnnImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setEditingAnn(prev => ({ ...prev, imageUrl: reader.result as string }));
    };
    reader.readAsDataURL(file);
  };

  // 打开新增模态框
  const handleOpenAdd = () => {
    setEditingAnn({
      title: '',
      imageUrl: '',
      linkUrl: '',
      sortOrder: 0,
      status: 'active'
    });
    setShowModal(true);
  };

  // 打开编辑模态框
  const handleOpenEdit = (ann: Announcement) => {
    setEditingAnn({ ...ann });
    setShowModal(true);
  };

  // 提交保存公告
  const handleSaveAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAnn?.title || !editingAnn?.imageUrl) {
      alert('请填写公告标题并上传/输入图片地址！');
      return;
    }
    setSavingAnnouncement(true);
    setError(null);

    try {
      const token = localStorage.getItem('errorbook_token');
      const res = await fetch('/api/admin/announcements', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(editingAnn)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '保存公告失败');

      setShowModal(false);
      setEditingAnn(null);
      fetchData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSavingAnnouncement(false);
    }
  };

  // 删除公告
  const handleDeleteAnnouncement = async (id: number) => {
    if (!window.confirm('确定要删除此轮播图公告吗？')) return;
    try {
      const token = localStorage.getItem('errorbook_token');
      const res = await fetch(`/api/admin/announcements/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('删除失败');
      fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  if (loading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center gap-3">
        <div className="w-10 h-10 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin"></div>
        <p className="text-xs font-semibold text-slate-400">正在获取最新配置空间...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto font-sans text-slate-700">
      
      {/* 顶部标题与简述 */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 shadow-sm">
          <Megaphone className="w-5 h-5 animate-pulse" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">公告与私域管理</h1>
          <p className="text-xs text-slate-400 font-semibold">管理会员中心顶部的轮播图公告，以及配置人工付费导流的微信二维码与微信号</p>
        </div>
      </div>

      {/* 消息提示框 */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl text-rose-600 text-xs font-semibold flex items-center gap-2 shadow-sm animate-fade-in">
          <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl text-emerald-700 text-xs font-semibold flex items-center gap-2 shadow-sm animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-500 animate-bounce" />
          <span>{successMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* 左侧：私域客服与付款二维码配置 */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-6">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <QrCode className="w-4 h-4 text-blue-600" />
            <h2 className="font-extrabold text-sm text-slate-900">线下私域客服与付款配置</h2>
          </div>

          <form onSubmit={handleSaveContact} className="space-y-4">
            
            {/* 微信二维码上传 */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">微信二维码图片</label>
              
              <div className="flex flex-col items-center p-4 bg-slate-50 border border-slate-200 rounded-2xl relative group overflow-hidden">
                {contact.wechatQr ? (
                  <div className="relative">
                    <img 
                      src={contact.wechatQr} 
                      alt="WeChat QR" 
                      className="w-32 h-32 border border-slate-200 rounded-xl bg-white p-1.5 shadow-sm object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setContact(prev => ({ ...prev, wechatQr: '' }))}
                      className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white rounded-full p-1 text-[10px] font-bold shadow-md hover:bg-rose-600 transition-colors"
                      title="清除二维码"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <div className="w-32 h-32 border-2 border-dashed border-slate-350 rounded-xl bg-white flex flex-col items-center justify-center text-slate-400 text-[10px] gap-1.5">
                    <QrCode className="w-6 h-6 text-slate-350" />
                    <span>暂未设置二维码</span>
                  </div>
                )}
                
                <div className="mt-3 w-full">
                  <input 
                    type="file" 
                    accept="image/*" 
                    onChange={handleQrUpload} 
                    id="qr-upload-input" 
                    className="hidden" 
                  />
                  <label 
                    htmlFor="qr-upload-input" 
                    className="w-full flex items-center justify-center gap-1 px-4 py-2 border border-slate-250 text-slate-650 hover:bg-slate-100 rounded-xl text-xs font-bold transition-all cursor-pointer bg-white"
                  >
                    <span>上传/修改二维码图片</span>
                  </label>
                  
                  <div className="mt-2.5">
                    <input 
                      type="text"
                      placeholder="或在此粘贴外链图片 URL..."
                      value={contact.wechatQr.startsWith('data:image') ? '' : contact.wechatQr}
                      onChange={e => setContact(prev => ({ ...prev, wechatQr: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-[10px] font-semibold outline-none focus:border-blue-500 transition-colors placeholder-slate-400"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 客服微信号 */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">客服微信号</label>
              <input 
                type="text"
                placeholder="例如: Admin_VIP_Service"
                value={contact.wechatId}
                onChange={e => setContact(prev => ({ ...prev, wechatId: e.target.value }))}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:border-blue-500 transition-colors"
                required
              />
            </div>

            {/* 服务邮箱 */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">服务客服邮箱</label>
              <input 
                type="email"
                placeholder="例如: admin@qq.com"
                value={contact.serviceEmail}
                onChange={e => setContact(prev => ({ ...prev, serviceEmail: e.target.value }))}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:border-blue-500 transition-colors"
                required
              />
            </div>

            {/* 备注说明 */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">线下购买备注及说明</label>
              <textarea 
                rows={4}
                placeholder="例如：人工客服在线时间：每日 9:00 - 22:00。加微信号请备注“错题本VIP升级”。"
                value={contact.notes}
                onChange={e => setContact(prev => ({ ...prev, notes: e.target.value }))}
                className="w-full p-4 bg-slate-50/50 border border-slate-200 rounded-xl text-xs font-semibold leading-relaxed focus:ring-2 focus:ring-blue-500 outline-none resize-none"
              />
            </div>

            <button
              type="submit"
              disabled={savingContact}
              className="w-full flex items-center justify-center gap-1.5 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-blue-500/10 cursor-pointer disabled:opacity-50"
            >
              {savingContact ? '正在保存...' : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>保存客服与付款配置</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* 右侧：轮播图公告列表管理 */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-650" />
              <h2 className="font-extrabold text-sm text-slate-900">轮播图 Banner 公告管理</h2>
            </div>
            
            <button
              onClick={handleOpenAdd}
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl flex items-center gap-1 transition-all cursor-pointer shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>新建公告</span>
            </button>
          </div>

          {announcements.length === 0 ? (
            <div className="py-20 text-center border border-slate-100 bg-slate-50/50 rounded-2xl">
              <ImageIcon className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-xs font-bold text-slate-400">当前未配置任何轮播图公告</p>
              <p className="text-[10px] text-slate-400 mt-1">点击右上角“新建公告”按钮开始发布</p>
            </div>
          ) : (
            <div className="space-y-3">
              {announcements.map((ann) => (
                <div 
                  key={ann.id} 
                  className={`flex flex-col md:flex-row md:items-center justify-between p-4 bg-slate-50/50 hover:bg-slate-50 rounded-2xl border border-slate-200/60 transition-colors gap-4`}
                >
                  <div className="flex gap-4">
                    {/* 公告图预览 */}
                    <div className="w-24 h-14 rounded-lg bg-white border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center">
                      {ann.imageUrl ? (
                        <img src={ann.imageUrl} alt={ann.title} className="w-full h-full object-cover" />
                      ) : (
                        <ImageIcon className="w-5 h-5 text-slate-300" />
                      )}
                    </div>

                    <div className="space-y-1 max-w-[280px] md:max-w-[340px]">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-bold text-xs text-slate-900 truncate max-w-[200px]">{ann.title}</h4>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-bold ${
                          ann.status === 'active' 
                            ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' 
                            : 'bg-slate-100 text-slate-550'
                        }`}>
                          {ann.status === 'active' ? '启用中' : '已禁用'}
                        </span>
                        <span className="text-[9px] bg-indigo-50 text-indigo-650 px-1.5 py-0.5 rounded-md font-black">
                          排序: {ann.sortOrder}
                        </span>
                      </div>
                      
                      {ann.linkUrl ? (
                        <div className="flex items-center gap-1 text-[10px] text-slate-400 truncate">
                          <LinkIcon className="w-3 h-3 text-slate-350 shrink-0" />
                          <span className="truncate">{ann.linkUrl}</span>
                        </div>
                      ) : (
                        <div className="text-[10px] text-slate-400 italic">无跳转链接</div>
                      )}
                    </div>
                  </div>

                  {/* 管理按钮 */}
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => handleOpenEdit(ann)}
                      className="p-2 text-slate-550 hover:text-indigo-650 hover:bg-indigo-50 rounded-xl transition-all cursor-pointer"
                      title="编辑公告"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteAnnouncement(ann.id)}
                      className="p-2 text-slate-555 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all cursor-pointer"
                      title="删除公告"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 新增/编辑公告模态框 */}
      {showModal && editingAnn && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 relative animate-in fade-in zoom-in-95 duration-200">
            <button 
              onClick={() => { setShowModal(false); setEditingAnn(null); }} 
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition-colors outline-none cursor-pointer"
            >
              ✕
            </button>
            
            <div className="mb-5 flex items-center gap-2.5 text-indigo-600 font-bold">
              <div className="p-2 bg-indigo-50 rounded-xl">
                <Megaphone className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-black tracking-tight text-slate-900">
                {editingAnn.id ? '编辑轮播图公告' : '新建轮播图公告'}
              </h3>
            </div>

            <form onSubmit={handleSaveAnnouncement} className="space-y-4">
              
              {/* 标题 */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 pl-0.5">公告标题/描述 (必填)</label>
                <input 
                  type="text"
                  placeholder="请输入公告标题..."
                  value={editingAnn.title || ''}
                  onChange={e => setEditingAnn(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:border-blue-500 transition-colors"
                  required
                />
              </div>

              {/* 公告配图 */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 pl-0.5 block">公告大图 (必填)</label>
                
                <div className="flex flex-col items-center p-4 bg-slate-50 border border-slate-200 rounded-2xl relative">
                  {editingAnn.imageUrl ? (
                    <div className="relative w-full max-h-40 overflow-hidden rounded-xl border border-slate-250 flex justify-center bg-white p-1">
                      <img 
                        src={editingAnn.imageUrl} 
                        alt="Preview" 
                        className="max-h-36 object-contain rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={() => setEditingAnn(prev => ({ ...prev, imageUrl: '' }))}
                        className="absolute top-1.5 right-1.5 bg-rose-500 text-white rounded-full p-1 text-[10px] font-bold shadow-md hover:bg-rose-600 transition-colors"
                        title="清除图片"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <div className="w-full h-28 border-2 border-dashed border-slate-300 rounded-xl bg-white flex flex-col items-center justify-center text-slate-400 text-xs gap-1.5">
                      <ImageIcon className="w-7 h-7 text-slate-300" />
                      <span>未上传公告配图</span>
                    </div>
                  )}

                  <div className="mt-3 w-full">
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={handleAnnImageUpload} 
                      id="ann-upload-input" 
                      className="hidden" 
                    />
                    <label 
                      htmlFor="ann-upload-input" 
                      className="w-full flex items-center justify-center gap-1 px-4 py-2 border border-slate-250 text-slate-600 hover:bg-slate-100 rounded-xl text-xs font-bold transition-all cursor-pointer bg-white"
                    >
                      <span>选择本地图片上传 (自动转 Base64)</span>
                    </label>
                    
                    <div className="mt-2.5">
                      <input 
                        type="text"
                        placeholder="或在此粘贴外链大图 URL..."
                        value={editingAnn.imageUrl?.startsWith('data:image') ? '' : editingAnn.imageUrl || ''}
                        onChange={e => setEditingAnn(prev => ({ ...prev, imageUrl: e.target.value }))}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-[10px] font-semibold outline-none focus:border-blue-500 transition-colors placeholder-slate-400"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* 点击跳转链接 */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 pl-0.5">点击跳转 URL (选填)</label>
                <input 
                  type="text"
                  placeholder="https://example.com/promo (点击轮播图时的跳转链接)"
                  value={editingAnn.linkUrl || ''}
                  onChange={e => setEditingAnn(prev => ({ ...prev, linkUrl: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:border-blue-500 transition-colors"
                />
              </div>

              {/* 排序及状态 */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 pl-0.5">显示排序号 (越小越靠前)</label>
                  <input 
                    type="number"
                    min={0}
                    value={editingAnn.sortOrder !== undefined ? editingAnn.sortOrder : 0}
                    onChange={e => setEditingAnn(prev => ({ ...prev, sortOrder: parseInt(e.target.value) || 0 }))}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-xs font-semibold outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 pl-0.5">启用状态</label>
                  <select
                    value={editingAnn.status || 'active'}
                    onChange={e => setEditingAnn(prev => ({ ...prev, status: e.target.value as any }))}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none"
                  >
                    <option value="active">启用 (正常在会员中心展示)</option>
                    <option value="inactive">禁用 (下架隐藏)</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-3 mt-6 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => { setShowModal(false); setEditingAnn(null); }}
                  className="flex-1 py-3 border border-slate-200 text-slate-600 rounded-xl font-bold text-xs hover:bg-slate-50 transition-all cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={savingAnnouncement}
                  className="flex-1 py-3 bg-gradient-to-r from-indigo-650 to-blue-600 text-white rounded-xl font-bold text-xs hover:from-indigo-700 hover:to-blue-700 transition-all shadow-md shadow-indigo-600/10 cursor-pointer"
                >
                  {savingAnnouncement ? '正在保存...' : '确认发布'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
