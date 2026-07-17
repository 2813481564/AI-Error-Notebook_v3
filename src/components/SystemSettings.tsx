import React, { useState, useEffect } from 'react';
import { Bot, Mail, ShieldAlert, Save, RefreshCw, Eye, EyeOff, CheckCircle2, History, Trash2 } from 'lucide-react';

interface SystemSettingsData {
  AI_PROVIDER: string;
  AI_API_BASE_URL: string;
  AI_API_KEY: string;
  GEMINI_API_KEY: string;
  AI_MODEL: string;
  AI_VISION_MODEL: string;
  GEMINI_MODEL: string;
  SMTP_HOST: string;
  SMTP_PORT: string;
  SMTP_USER: string;
  SMTP_PASS: string;
  LIMIT_USER: string;
  LIMIT_VIP: string;
  LIMIT_SVIP: string;
  ALLOW_STUDENT_AI: string;
  CAPACITY_USER: string;
  CAPACITY_VIP: string;
  CAPACITY_SVIP: string;
}

interface AiSettingHistoryItem {
  id: number;
  provider: string;
  apiBaseUrl: string;
  apiKey: string;
  geminiApiKey: string;
  model: string;
  visionModel: string;
  geminiModel: string;
  remark: string;
  createdAt: number;
}

export default function SystemSettings() {
  const [settings, setSettings] = useState<SystemSettingsData>({
    AI_PROVIDER: 'gemini',
    AI_API_BASE_URL: '',
    AI_API_KEY: '',
    GEMINI_API_KEY: '',
    AI_MODEL: 'glm-5.1',
    AI_VISION_MODEL: 'glm-5v-turbo',
    GEMINI_MODEL: 'gemma-4-31b-it',
    SMTP_HOST: 'smtp.qq.com',
    SMTP_PORT: '465',
    SMTP_USER: '',
    SMTP_PASS: '',
    LIMIT_USER: '30',
    LIMIT_VIP: '100',
    LIMIT_SVIP: '300',
    ALLOW_STUDENT_AI: 'true',
    CAPACITY_USER: '50',
    CAPACITY_VIP: '500',
    CAPACITY_SVIP: '0',
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'ai' | 'mail' | 'limits'>('ai');
  const [testingAi, setTestingAi] = useState(false);

  // 控制密码/Key字段的可见性
  const [showOpenAiKey, setShowOpenAiKey] = useState(false);
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showSmtpPass, setShowSmtpPass] = useState(false);

  // AI 历史记录相关状态
  const [historyList, setHistoryList] = useState<AiSettingHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [remark, setRemark] = useState('');
  const [restoringId, setRestoringId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const handleTestAi = async () => {
    setTestingAi(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const token = localStorage.getItem('errorbook_token');
      const res = await fetch('/api/admin/settings/test-ai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          provider: settings.AI_PROVIDER,
          apiBaseUrl: settings.AI_API_BASE_URL,
          apiKey: settings.AI_API_KEY,
          geminiApiKey: settings.GEMINI_API_KEY,
          model: settings.AI_MODEL,
          geminiModel: settings.GEMINI_MODEL
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '连通性测试失败');
      }
      setSuccessMsg(data.message || '连通性测试成功！');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setTestingAi(false);
    }
  };

  useEffect(() => {
    fetchSettings();
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const token = localStorage.getItem('errorbook_token');
      const res = await fetch('/api/admin/settings/ai-history', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.history) {
          setHistoryList(data.history);
        }
      }
    } catch (err) {
      console.error('获取历史配置失败:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleRestoreHistory = async (id: number) => {
    if (!window.confirm('确定要恢复此大模型通道配置吗？这将会覆盖当前生效的 AI 设置。')) {
      return;
    }
    setRestoringId(id);
    setError(null);
    setSuccessMsg(null);
    try {
      const token = localStorage.getItem('errorbook_token');
      const res = await fetch('/api/admin/settings/ai-history/restore', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ id })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '恢复历史配置失败');
      }
      if (data.settings) {
        setSettings(prev => ({ ...prev, ...data.settings }));
      }
      setSuccessMsg('已成功恢复选中的历史配置！');
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRestoringId(null);
    }
  };

  const handleDeleteHistory = async (id: number) => {
    if (!window.confirm('确定要删除此条历史配置记录吗？')) {
      return;
    }
    setDeletingId(id);
    setError(null);
    try {
      const token = localStorage.getItem('errorbook_token');
      const res = await fetch(`/api/admin/settings/ai-history/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '删除历史配置失败');
      }
      setHistoryList(prev => prev.filter(item => item.id !== id));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDeletingId(null);
    }
  };

  const fetchSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('errorbook_token');
      const res = await fetch('/api/admin/settings', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.status === 401) {
        localStorage.removeItem('errorbook_token');
        localStorage.removeItem('errorbook_username');
        localStorage.removeItem('errorbook_role');
        window.location.reload();
        return;
      }
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '获取系统设置失败');
      }
      const data = await res.json();
      if (data.settings) {
        setSettings(prev => ({ ...prev, ...data.settings }));
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (key: keyof SystemSettingsData, value: string) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const token = localStorage.getItem('errorbook_token');
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ settings, remark })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '保存设置失败');
      }
      setSuccessMsg('系统设置已成功保存，并在后台实时生效！');
      setRemark(''); // 清空配置备注
      fetchHistory(); // 重新获取历史记录
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
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
    <div className="space-y-6 w-full">
      {/* 顶部标题与简述 */}
      <div className="flex flex-col gap-1.5 md:flex-row md:justify-between md:items-center">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">系统设置</h1>
          <p className="text-xs text-slate-400 font-semibold">管理系统大模型提供商、全局发信验证码及用户防刷限额阈值</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchSettings}
            className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl text-xs font-bold transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            重载配置
          </button>
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

      {/* 大块设置内容 */}
      <div className="bg-white border border-slate-200/60 rounded-3xl overflow-hidden shadow-sm flex flex-col md:flex-row min-h-[500px]">
        {/* 左侧大分类卡片导航 */}
        <div className="w-full md:w-64 border-b md:border-b-0 md:border-r border-slate-100 bg-slate-50/50 p-6 space-y-2 flex-shrink-0">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-3 mb-4">配置模块</p>
          <button
            onClick={() => setActiveTab('ai')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold transition-all ${
              activeTab === 'ai'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/10'
                : 'text-slate-600 hover:bg-slate-100/75'
            }`}
          >
            <Bot className="w-4 h-4" />
            <span>AI 模型服务配置</span>
          </button>
          <button
            onClick={() => setActiveTab('mail')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold transition-all ${
              activeTab === 'mail'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/10'
                : 'text-slate-600 hover:bg-slate-100/75'
            }`}
          >
            <Mail className="w-4 h-4" />
            <span>邮箱 SMTP 发信配置</span>
          </button>
          <button
            onClick={() => setActiveTab('limits')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold transition-all ${
              activeTab === 'limits'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/10'
                : 'text-slate-600 hover:bg-slate-100/75'
            }`}
          >
            <ShieldAlert className="w-4 h-4" />
            <span>使用额度与限制</span>
          </button>
        </div>

        {/* 右侧主表单区 */}
        <form onSubmit={handleSave} className="flex-grow p-6 md:p-8 flex flex-col justify-between">
          <div className="space-y-6">
            {/* AI 模型服务配置面 */}
            {activeTab === 'ai' && (
              <div className="space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-base font-extrabold text-slate-800">AI 大模型通道设置</h3>
                    <p className="text-xs text-slate-400">选择您要接入的模型提供商以及接口凭证</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleTestAi}
                    disabled={testingAi}
                    className="flex items-center justify-center gap-1.5 px-4 py-2 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-200 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
                  >
                    {testingAi ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
                        <span>测试连通性...</span>
                      </>
                    ) : (
                      <>
                        <Bot className="w-3.5 h-3.5" />
                        <span>测试当前连接</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-6">
                  {/* AI Provider */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500">AI 核心服务提供商</label>
                    <select
                      value={settings.AI_PROVIDER}
                      onChange={(e) => handleInputChange('AI_PROVIDER', e.target.value)}
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold bg-white outline-none focus:border-blue-500 transition-colors"
                    >
                      <option value="gemini">Gemini 官方原生 API</option>
                      <option value="openai">OpenAI 兼容接口 (如 DeepSeek, 智谱 GLM, 零一万物)</option>
                    </select>
                    <p className="text-[11px] text-slate-400">Gemini 使用谷歌接口，OpenAI 兼容接口支持绝大多数中国大模型</p>
                  </div>

                  {settings.AI_PROVIDER === 'openai' ? (
                    <>
                      {/* OpenAI API Key */}
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-500">OpenAI API Key (密钥)</label>
                        <div className="relative">
                          <input
                            type={showOpenAiKey ? "text" : "password"}
                            value={settings.AI_API_KEY}
                            onChange={(e) => handleInputChange('AI_API_KEY', e.target.value)}
                            placeholder="填写 API 凭证 Token"
                            className="w-full pl-4 pr-12 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:border-blue-500 transition-colors"
                          />
                          <button
                            type="button"
                            onClick={() => setShowOpenAiKey(!showOpenAiKey)}
                            className="absolute right-3.5 top-3.5 text-slate-400 hover:text-slate-600 transition-colors"
                          >
                            {showOpenAiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      {/* API Base URL */}
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-500">OpenAI API 基准地址 (Base URL)</label>
                        <input
                          type="text"
                          value={settings.AI_API_BASE_URL}
                          onChange={(e) => handleInputChange('AI_API_BASE_URL', e.target.value)}
                          placeholder="例如 https://api.openai.com/v1 或中转代理域名"
                          className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:border-blue-500 transition-colors"
                        />
                        <p className="text-[11px] text-slate-400">末尾不需要以 / 结尾，通常到 /v1 或 /v4 即可</p>
                      </div>

                      {/* Models */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-slate-500">常规文本/出题大模型</label>
                          <input
                            type="text"
                            value={settings.AI_MODEL}
                            onChange={(e) => handleInputChange('AI_MODEL', e.target.value)}
                            placeholder="例如 deepseek-chat 或 glm-5.1"
                            className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:border-blue-500 transition-colors"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-slate-500">图片识图/OCR 视觉大模型</label>
                          <input
                            type="text"
                            value={settings.AI_VISION_MODEL}
                            onChange={(e) => handleInputChange('AI_VISION_MODEL', e.target.value)}
                            placeholder="例如 glm-5v-turbo 或 gpt-4o"
                            className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:border-blue-500 transition-colors"
                          />
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Gemini API Key */}
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-500">Gemini API Key (密钥)</label>
                        <div className="relative">
                          <input
                            type={showGeminiKey ? "text" : "password"}
                            value={settings.GEMINI_API_KEY}
                            onChange={(e) => handleInputChange('GEMINI_API_KEY', e.target.value)}
                            placeholder="AIzaSy..."
                            className="w-full pl-4 pr-12 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:border-blue-500 transition-colors"
                          />
                          <button
                            type="button"
                            onClick={() => setShowGeminiKey(!showGeminiKey)}
                            className="absolute right-3.5 top-3.5 text-slate-400 hover:text-slate-600 transition-colors"
                          >
                            {showGeminiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      {/* Gemini Models */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-slate-500">常规文本/出题大模型 (Gemini)</label>
                          <input
                            type="text"
                            value={settings.GEMINI_MODEL}
                            onChange={(e) => handleInputChange('GEMINI_MODEL', e.target.value)}
                            placeholder="例如 gemini-3-flash-preview"
                            className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:border-blue-500 transition-colors"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-slate-500">图片识图/OCR 视觉大模型 (AI Vision)</label>
                          <input
                            type="text"
                            value={settings.AI_VISION_MODEL}
                            onChange={(e) => handleInputChange('AI_VISION_MODEL', e.target.value)}
                            placeholder="例如 gemini-3-flash-preview"
                            className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:border-blue-500 transition-colors"
                          />
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* 配置备注/别名 */}
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <label className="text-xs font-bold text-slate-500">当前修改备注/别名（可选）</label>
                  <input
                    type="text"
                    value={remark}
                    onChange={(e) => setRemark(e.target.value)}
                    placeholder="例如：DeepSeek 生产备用、Gemma测试通道，用于记录在历史配置中"
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:border-blue-500 transition-colors"
                  />
                  <p className="text-[11px] text-slate-400 font-semibold">若配置有改变并保存，该备注将与当前配置共同存入配置历史中，方便日后切换。</p>
                </div>

                {/* 历史配置列表 */}
                <div className="space-y-4 pt-6 border-t border-slate-200">
                  <div>
                    <h4 className="text-sm font-extrabold text-slate-800 flex items-center gap-1.5">
                      <History className="w-4 h-4 text-slate-500" />
                      历史配置记录
                    </h4>
                    <p className="text-[11px] text-slate-400">记录了您每次修改并保存的 AI 通道设置，点击“应用”即可快速恢复。</p>
                  </div>

                  {historyLoading ? (
                    <div className="py-6 flex justify-center items-center gap-2">
                      <div className="w-5 h-5 border-2 border-slate-200 border-t-blue-500 rounded-full animate-spin"></div>
                      <span className="text-xs text-slate-400 font-semibold">加载历史记录...</span>
                    </div>
                  ) : historyList.length === 0 ? (
                    <div className="py-8 text-center bg-slate-50 border border-dashed border-slate-200 rounded-2xl">
                      <p className="text-xs text-slate-400 font-medium">暂无历史通道配置记录</p>
                    </div>
                  ) : (
                    <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                      {historyList.map((item) => {
                        const isCurrentlyActive = 
                          settings.AI_PROVIDER === item.provider &&
                          settings.AI_API_BASE_URL === item.apiBaseUrl &&
                          settings.AI_API_KEY === item.apiKey &&
                          settings.GEMINI_API_KEY === item.geminiApiKey &&
                          settings.AI_MODEL === item.model &&
                          settings.AI_VISION_MODEL === item.visionModel &&
                          settings.GEMINI_MODEL === item.geminiModel;

                        return (
                          <div 
                            key={item.id} 
                            className={`p-3.5 border rounded-2xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 transition-all ${
                              isCurrentlyActive 
                                ? 'bg-blue-50/50 border-blue-200 shadow-sm' 
                                : 'bg-white border-slate-100 hover:border-slate-200 hover:shadow-sm'
                            }`}
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase ${
                                  item.provider === 'gemini' 
                                    ? 'bg-purple-100 text-purple-700' 
                                    : 'bg-indigo-100 text-indigo-700'
                                }`}>
                                  {item.provider === 'gemini' ? 'Gemini' : 'OpenAI 兼容'}
                                </span>
                                {item.remark && (
                                  <span className="text-xs font-bold text-slate-700">
                                    {item.remark}
                                  </span>
                                )}
                                {isCurrentlyActive && (
                                  <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded-lg text-[9px] font-black">
                                    <CheckCircle2 className="w-2.5 h-2.5" />
                                    当前生效
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-400 font-medium flex flex-wrap gap-x-3 gap-y-0.5">
                                <span>模型: <code className="text-slate-600 font-mono bg-slate-50 px-1 rounded">{item.provider === 'gemini' ? item.geminiModel : item.model}</code></span>
                                {item.provider === 'openai' && item.apiBaseUrl && (
                                  <span className="truncate max-w-[200px]">Base: <code className="text-slate-500">{item.apiBaseUrl}</code></span>
                                )}
                                <span>时间: {new Date(item.createdAt).toLocaleString()}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 self-end sm:self-center">
                              <button
                                type="button"
                                disabled={isCurrentlyActive || restoringId === item.id}
                                onClick={() => handleRestoreHistory(item.id)}
                                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 transition-all ${
                                  isCurrentlyActive 
                                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                    : 'bg-blue-50 text-blue-600 hover:bg-blue-100 active:scale-95'
                                }`}
                              >
                                {restoringId === item.id ? '应用中...' : '应用此配置'}
                              </button>
                              <button
                                type="button"
                                disabled={deletingId === item.id}
                                onClick={() => handleDeleteHistory(item.id)}
                                className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-xl transition-all active:scale-95"
                                title="删除此历史记录"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 邮箱发信配置 */}
            {activeTab === 'mail' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-base font-extrabold text-slate-800">发信 SMTP 邮箱设置</h3>
                  <p className="text-xs text-slate-400">配置用于向用户发送邮箱注册验证码的服务信箱（当前系统推荐 QQ 邮箱）</p>
                </div>

                <div className="grid grid-cols-1 gap-6">
                  {/* Host and Port */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500">SMTP 主机服务器</label>
                      <input
                        type="text"
                        value={settings.SMTP_HOST}
                        onChange={(e) => handleInputChange('SMTP_HOST', e.target.value)}
                        placeholder="例如 smtp.qq.com"
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:border-blue-500 transition-colors"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500">SMTP 端口</label>
                      <input
                        type="number"
                        value={settings.SMTP_PORT}
                        onChange={(e) => handleInputChange('SMTP_PORT', e.target.value)}
                        placeholder="例如 465 (SSL)"
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:border-blue-500 transition-colors"
                      />
                    </div>
                  </div>

                  {/* Mail Account */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500">发信服务 QQ 邮箱</label>
                    <input
                      type="text"
                      value={settings.SMTP_USER}
                      onChange={(e) => handleInputChange('SMTP_USER', e.target.value)}
                      placeholder="如 yourname@qq.com"
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:border-blue-500 transition-colors"
                    />
                  </div>

                  {/* Authorization Code */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500">邮箱授权码 (而非邮箱独立登录密码)</label>
                    <div className="relative">
                      <input
                        type={showSmtpPass ? "text" : "password"}
                        value={settings.SMTP_PASS}
                        onChange={(e) => handleInputChange('SMTP_PASS', e.target.value)}
                        placeholder="请输入在QQ邮箱中获取的 16 位 SMTP 授权码"
                        className="w-full pl-4 pr-12 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:border-blue-500 transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSmtpPass(!showSmtpPass)}
                        className="absolute right-3.5 top-3.5 text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        {showSmtpPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-400">说明：需在 QQ邮箱网页版 → 设置 → 账户 → 开启 POP3/SMTP 服务 获取。</p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'limits' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-base font-extrabold text-slate-800">使用额度与安全限流</h3>
                  <p className="text-xs text-slate-400">全局分配和管控不同等级会员的每日 AI 分析次数与错题保存容量上限</p>
                </div>

                <div className="grid grid-cols-1 gap-6">
                  {/* Limits */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500">普通用户 (User) 每日 AI 限额</label>
                      <input
                        type="number"
                        value={settings.LIMIT_USER}
                        onChange={(e) => handleInputChange('LIMIT_USER', e.target.value)}
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:border-blue-500 transition-colors"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500">黄金会员 (VIP) 每日 AI 限额</label>
                      <input
                        type="number"
                        value={settings.LIMIT_VIP}
                        onChange={(e) => handleInputChange('LIMIT_VIP', e.target.value)}
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:border-blue-500 transition-colors"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500">钻石会员 (SVIP) 每日 AI 限额</label>
                      <input
                        type="number"
                        value={settings.LIMIT_SVIP}
                        onChange={(e) => handleInputChange('LIMIT_SVIP', e.target.value)}
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:border-blue-500 transition-colors"
                      />
                    </div>
                  </div>

                  {/* Capacities */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-slate-100">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500">普通用户 (User) 错题容量上限</label>
                      <input
                        type="number"
                        value={settings.CAPACITY_USER}
                        onChange={(e) => handleInputChange('CAPACITY_USER', e.target.value)}
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:border-blue-500 transition-colors"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500">黄金会员 (VIP) 错题容量上限</label>
                      <input
                        type="number"
                        value={settings.CAPACITY_VIP}
                        onChange={(e) => handleInputChange('CAPACITY_VIP', e.target.value)}
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:border-blue-500 transition-colors"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500">钻石会员 (SVIP) 错题容量上限 (0为无限)</label>
                      <input
                        type="number"
                        value={settings.CAPACITY_SVIP}
                        onChange={(e) => handleInputChange('CAPACITY_SVIP', e.target.value)}
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:border-blue-500 transition-colors"
                      />
                    </div>
                  </div>

                  {/* Allow student role to use AI */}
                  <div className="space-y-2 bg-slate-50 p-4 border border-slate-100 rounded-2xl">
                    <div className="flex items-center justify-between">
                      <div>
                        <label className="text-xs font-bold text-slate-700 block">允许学生身份使用 AI 分解</label>
                        <span className="text-[11px] text-slate-400 block mt-0.5">控制学生免密登录账户是否允许进行 AI 识图及同类题诊断</span>
                      </div>
                      <div>
                        <select
                          value={settings.ALLOW_STUDENT_AI}
                          onChange={(e) => handleInputChange('ALLOW_STUDENT_AI', e.target.value)}
                          className="px-3 py-1.5 border border-slate-200 rounded-xl text-xs font-semibold bg-white outline-none focus:border-blue-500"
                        >
                          <option value="true">开启（允许使用）</option>
                          <option value="false">关闭（拦截请求）</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 保存提交按钮 */}
          <div className="mt-8 pt-6 border-t border-slate-100 flex justify-end gap-3">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-1.5 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold transition-all shadow-md shadow-blue-500/10 disabled:opacity-50"
            >
              {saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>正在保存...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>保存配置</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
