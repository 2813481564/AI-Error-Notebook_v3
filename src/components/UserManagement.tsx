import React, { useState, useEffect, useRef } from 'react';
import { Users, Edit2, Trash2, X, ShieldAlert, Award, Key, Calendar, Zap, FileBarChart2 } from 'lucide-react';
import WeeklyReportModal from './WeeklyReportModal';

interface UserItem {
  username: string;
  role: 'user' | 'vip' | 'svip' | 'admin';
  lastAiResetDate: string | null;
  aiUsedToday: number;
  questionCount: number;
  idCardLast6?: string | null;
  phoneLast4?: string | null;
  vipExpireAt?: string | null;
  customAiLimit?: number | null;
}

export default function UserManagement({ onNavigate }: { onNavigate: (view: any) => void }) {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 错题周报状态
  const [weeklyStatsUser, setWeeklyStatsUser] = useState<string | null>(null);

  // 编辑模态框状态
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);

  // 选项卡状态与兑换码相关状态
  const [activeTab, setActiveTab] = useState<'users' | 'codes'>('users');
  const [codes, setCodes] = useState<any[]>([]);
  const [codesLoading, setCodesLoading] = useState(false);
  const [generateDays, setGenerateDays] = useState(30);
  const [generateRole, setGenerateRole] = useState<'vip' | 'svip'>('vip');
  const [generateCount, setGenerateCount] = useState(10);

  // 编辑表单字段
  const [editUsername, setEditUsername] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editRole, setEditRole] = useState<'user' | 'vip' | 'svip' | 'admin'>('user');
  const [editIdCard, setEditIdCard] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editVipExpireAt, setEditVipExpireAt] = useState('');
  const [editCustomAiLimit, setEditCustomAiLimit] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 添加模态框状态
  const [showAddModal, setShowAddModal] = useState(false);
  const [addUsername, setAddUsername] = useState('');
  const [addPassword, setAddPassword] = useState('');
  const [addRole, setAddRole] = useState<'user' | 'vip' | 'svip'>('user');
  const [addIdCard, setAddIdCard] = useState('');
  const [addPhone, setAddPhone] = useState('');
  const [addError, setAddError] = useState<string | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('errorbook_token');
      const res = await fetch('/api/admin/users', {
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
        throw new Error(data.error || '获取用户列表失败');
      }

      const data = await res.json();
      setUsers(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchCodes = async () => {
    setCodesLoading(true);
    try {
      const token = localStorage.getItem('errorbook_token');
      const res = await fetch('/api/admin/redeem-codes', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setCodes(data);
      }
    } catch (e) {
      console.error("Failed to fetch codes:", e);
    } finally {
      setCodesLoading(false);
    }
  };

  const handleGenerateCodes = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('errorbook_token');
      const res = await fetch('/api/admin/redeem-codes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          role: generateRole,
          days: generateDays,
          count: generateCount
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '生成失败');
      }
      alert(`成功生成 ${generateCount} 个 ${generateRole.toUpperCase()} 兑换码！`);
      fetchCodes();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleExportCSV = () => {
    let csvContent = "\uFEFF兑换码,会员等级,有效天数,状态,兑换者,兑换时间,创建时间\n";
    codes.forEach(c => {
      const row = [
        c.code,
        c.role.toUpperCase(),
        c.days,
        c.status === 'unused' ? "未使用" : "已使用",
        c.usedBy || "-",
        c.usedAt || "-",
        c.createdAt
      ].join(",");
      csvContent += row + "\n";
    });
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `redemption_codes_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const getLimit = (user: UserItem) => {
    if (user.customAiLimit !== null && user.customAiLimit !== undefined) {
      return user.customAiLimit;
    }
    if (user.role === 'admin') return Infinity;
    if (user.role === 'vip') return 100;
    if (user.role === 'svip') return 300;
    return 30; // user 默认 30 次
  };

  const handleEditClick = (user: UserItem) => {
    setEditingUser(user);
    setEditUsername(user.username);
    setEditRole(user.role);
    setEditPassword('');
    setEditIdCard(user.idCardLast6 || '');
    setEditPhone(user.phoneLast4 || '');
    setEditVipExpireAt(user.vipExpireAt || '');
    setEditCustomAiLimit(user.customAiLimit !== null && user.customAiLimit !== undefined ? String(user.customAiLimit) : '');
    setEditError(null);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setSubmitting(true);
    setEditError(null);

    try {
      const token = localStorage.getItem('errorbook_token');
      const res = await fetch(`/api/admin/users/${editingUser.username}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          newUsername: editUsername,
          password: editPassword || undefined,
          role: editRole,
          vipExpireAt: editVipExpireAt || null,
          customAiLimit: editCustomAiLimit === '' ? null : parseInt(editCustomAiLimit),
          idCardLast6: editRole === 'user' ? editIdCard : undefined,
          phoneLast4: editRole === 'user' ? editPhone : undefined
        })
      });

      if (res.status === 401) {
        window.location.reload();
        return;
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '更新失败');

      setEditingUser(null);
      fetchUsers();
    } catch (err: any) {
      setEditError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setAddError(null);

    try {
      const token = localStorage.getItem('errorbook_token');
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          role: addRole,
          username: addUsername,
          password: (addRole === 'user' && (addIdCard || addPhone)) ? undefined : addPassword,
          idCardLast6: addRole === 'user' ? addIdCard : undefined,
          phoneLast4: addRole === 'user' ? addPhone : undefined
        })
      });

      if (res.status === 401) {
        window.location.reload();
        return;
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '添加用户失败');

      setAddUsername('');
      setAddPassword('');
      setAddIdCard('');
      setAddPhone('');
      setAddRole('user');
      setShowAddModal(false);
      fetchUsers();
    } catch (err: any) {
      setAddError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (username: string) => {
    if (!window.confirm(`确定要彻底删除用户 "${username}" 吗？\n警告：这将级联永久清除该用户的所有云端错题和会话记录，且无法撤销！`)) {
      return;
    }

    try {
      const token = localStorage.getItem('errorbook_token');
      const res = await fetch(`/api/admin/users/${username}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (res.status === 401) {
        window.location.reload();
        return;
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '删除失败');

      fetchUsers();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-6 font-sans">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600/10 flex items-center justify-center text-blue-600">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight">平台系统管理中心</h2>
            <p className="text-xs text-slate-500 font-medium">配置用户角色特权与额度、到期时间，批量管理激活码</p>
          </div>
        </div>

        {activeTab === 'users' && (
          <button
            onClick={() => {
              setAddError(null);
              setShowAddModal(true);
            }}
            className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-bold text-xs hover:from-blue-700 hover:to-indigo-700 transition-all shadow-md shadow-blue-500/10 cursor-pointer flex items-center gap-1.5"
          >
            <span>添加新用户</span>
          </button>
        )}
      </div>

      {/* 标签切换 */}
      <div className="flex bg-slate-100 p-1 rounded-2xl w-fit">
        <button
          onClick={() => setActiveTab('users')}
          className={`px-5 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${activeTab === 'users' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
        >
          用户账号列表
        </button>
        <button
          onClick={() => {
            setActiveTab('codes');
            fetchCodes();
          }}
          className={`px-5 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${activeTab === 'codes' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
        >
          兑换激活码管理
        </button>
      </div>

      {activeTab === 'users' ? (
        <>
          {error && (
            <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl text-rose-600 text-xs font-semibold flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping"></span>
              {error}
            </div>
          )}

          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3">
              <div className="w-10 h-10 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin"></div>
              <p className="text-xs font-semibold text-slate-400">正在拉取用户数据空间...</p>
            </div>
          ) : users.length === 0 ? (
            <div className="py-16 text-center bg-white border border-slate-100 rounded-3xl p-8">
              <p className="text-sm font-bold text-slate-400">暂无其他注册用户</p>
            </div>
          ) : (
            <div className="bg-white border border-slate-200/60 rounded-3xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/70 border-b border-slate-100 text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                      <th className="py-4 px-6">用户名</th>
                      <th className="py-4 px-6 whitespace-nowrap">会员角色等级</th>
                      <th className="py-4 px-6 whitespace-nowrap">到期时间 / 专属限额</th>
                      <th className="py-4 px-6 whitespace-nowrap">今日已用 AI 次数</th>
                      <th className="py-4 px-6 text-center whitespace-nowrap">累计错题数</th>
                      <th className="py-4 px-6 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm font-semibold text-slate-700">
                    {users.map((user) => {
                      const limit = getLimit(user);
                      const usagePercent = limit === Infinity ? 0 : Math.min(100, Math.round((user.aiUsedToday / limit) * 100));

                      return (
                        <tr key={user.username} className="hover:bg-slate-50/40 transition-colors">
                          <td className="py-4 px-6 font-bold text-slate-900">{user.username}</td>
                          <td className="py-4 px-6 whitespace-nowrap">
                            {user.role === 'vip' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-blue-50 text-blue-700 border border-blue-200/50 shadow-sm shadow-blue-500/5 whitespace-nowrap">
                                <Award className="w-3.5 h-3.5 text-blue-500 animate-pulse" />
                                VIP 黄金会员
                              </span>
                            )}
                            {user.role === 'svip' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-yellow-50 text-yellow-750 border border-yellow-250/50 shadow-sm shadow-yellow-500/5 whitespace-nowrap">
                                <Award className="w-3.5 h-3.5 text-yellow-500 animate-bounce" />
                                SVIP 钻石会员
                              </span>
                            )}
                            {user.role === 'user' && (
                              <div className="flex flex-col gap-1 items-start">
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600 whitespace-nowrap">
                                  {(user.idCardLast6 || user.phoneLast4) ? '免密普通用户' : '普通注册用户'}
                                </span>
                                {(user.idCardLast6 || user.phoneLast4) && (
                                  <div className="text-[10px] text-slate-400 font-semibold pl-1 space-y-0.5">
                                    {user.idCardLast6 && <div>身份证后6位: {user.idCardLast6}</div>}
                                    {user.phoneLast4 && <div>手机号后4位: {user.phoneLast4}</div>}
                                  </div>
                                )}
                              </div>
                            )}
                            {user.role === 'admin' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-rose-50 text-rose-700 border border-rose-200/50 shadow-sm shadow-rose-500/5 whitespace-nowrap">
                                <Award className="w-3.5 h-3.5 text-rose-500" />
                                管理员
                              </span>
                            )}
                          </td>
                          <td className="py-4 px-6 text-xs text-slate-600 whitespace-nowrap">
                            <div className="space-y-1">
                              {user.role === 'admin' ? (
                                <span className="text-slate-400 font-bold">永久有效</span>
                              ) : (
                                <div className="flex items-center gap-1">
                                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                  <span>{user.vipExpireAt ? `到期: ${user.vipExpireAt}` : '普通限时/无到期日'}</span>
                                </div>
                              )}
                              {user.customAiLimit !== null && user.customAiLimit !== undefined && (
                                <div className="flex items-center gap-1 text-indigo-650 font-bold">
                                  <Zap className="w-3.5 h-3.5" />
                                  <span>专属限额: {user.customAiLimit}次/日</span>
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="py-4 px-6 min-w-[200px]">
                            <div className="space-y-1.5 max-w-[160px]">
                              <div className="flex justify-between text-[11px] font-bold text-slate-400">
                                <span>{user.aiUsedToday} / {limit === Infinity ? '无限' : `${limit}次`}</span>
                                {limit !== Infinity && <span>{usagePercent}%</span>}
                              </div>
                              {limit !== Infinity && (
                                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all duration-500 ${usagePercent >= 90
                                      ? 'bg-rose-500'
                                      : usagePercent >= 70
                                        ? 'bg-amber-500'
                                        : 'bg-blue-600'
                                      }`}
                                    style={{ width: `${usagePercent}%` }}
                                  ></div>
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="py-4 px-6 text-center text-slate-900 font-bold whitespace-nowrap">{user.questionCount}</td>
                          <td className="py-4 px-6 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => setWeeklyStatsUser(user.username)}
                                className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all cursor-pointer"
                                title="生成错题周报"
                              >
                                <FileBarChart2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleEditClick(user)}
                                className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all cursor-pointer"
                                title="修改账户与权限"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDelete(user.username)}
                                className="p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all cursor-pointer"
                                title="删除账号"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      ) : (
        // ================= 兑换码管理面板 =================
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in fade-in duration-200">
          <div className="bg-white border border-slate-200 p-6 rounded-3xl shadow-sm h-fit">
            <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Key className="w-4 h-4 text-blue-600" />
              批量生成兑换激活码
            </h3>

            <form onSubmit={handleGenerateCodes} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1">会员角色等级</label>
                <select
                  value={generateRole}
                  onChange={e => setGenerateRole(e.target.value as any)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm font-bold text-slate-800 transition-all cursor-pointer"
                >
                  <option value="vip">VIP 会员 (100次 AI / 日)</option>
                  <option value="svip">SVIP 会员 (300次 AI / 日)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1">增加会员天数</label>
                <input
                  type="number"
                  min={1}
                  max={3650}
                  value={generateDays}
                  onChange={e => setGenerateDays(parseInt(e.target.value) || 30)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm font-semibold text-slate-800 transition-all"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1">生成数量</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={generateCount}
                  onChange={e => setGenerateCount(parseInt(e.target.value) || 10)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm font-semibold text-slate-800 transition-all"
                  required
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-blue-500/10 cursor-pointer"
              >
                批量生成激活码
              </button>
            </form>
          </div>

          <div className="bg-white border border-slate-200 rounded-3xl shadow-sm md:col-span-2 overflow-hidden flex flex-col justify-between">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <span className="text-xs font-bold text-slate-700">当前激活码数据库记录 ({codes.length} 条)</span>
              {codes.length > 0 && (
                <button
                  onClick={handleExportCSV}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold rounded-lg transition-colors cursor-pointer"
                >
                  导出 Excel (CSV)
                </button>
              )}
            </div>

            {codesLoading ? (
              <div className="py-20 text-center">
                <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-2"></div>
                <p className="text-[10px] text-slate-400 font-bold">载入中...</p>
              </div>
            ) : codes.length === 0 ? (
              <div className="py-20 text-center text-slate-400 font-bold text-xs">
                暂未生成任何激活兑换码
              </div>
            ) : (
              <div className="overflow-auto max-h-[360px]">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      <th className="py-2.5 px-4">激活码</th>
                      <th className="py-2.5 px-4">角色</th>
                      <th className="py-2.5 px-4">天数</th>
                      <th className="py-2.5 px-4">状态</th>
                      <th className="py-2.5 px-4">使用者</th>
                    </tr>
                  </thead>
                  <tbody className="text-xs font-semibold text-slate-700 divide-y divide-slate-100">
                    {codes.map((c, index) => (
                      <tr key={index} className="hover:bg-slate-50/50">
                        <td className="py-2 px-4 font-mono text-[11px] text-slate-900 select-all">{c.code}</td>
                        <td className="py-2 px-4 uppercase text-[10px]">{c.role}</td>
                        <td className="py-2 px-4">{c.days}天</td>
                        <td className="py-2 px-4">
                          {c.status === 'unused' ? (
                            <span className="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md text-[10px]">未使用</span>
                          ) : (
                            <span className="text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md text-[10px]">已使用</span>
                          )}
                        </td>
                        <td className="py-2 px-4 truncate max-w-[100px]" title={c.usedBy || ''}>
                          {c.usedBy || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="p-4 border-t border-slate-100 text-[10px] text-slate-400 font-medium bg-slate-50/30">
              * 激活码由系统随机生成，包含大写字母及数字。可以直接双击激活码进行复制。
            </div>
          </div>
        </div>
      )}

      {/* 编辑模态框 */}
      {editingUser && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-6 relative animate-in fade-in zoom-in-95 duration-200">
            <button
              onClick={() => setEditingUser(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition-colors outline-none cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="mb-6 flex items-center gap-2.5 text-blue-600 font-bold">
              <div className="p-2 bg-blue-50 rounded-xl">
                <Edit2 className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-black tracking-tight text-slate-900">配置用户账号: {editingUser.username}</h3>
            </div>

            {editError && (
              <div className="mb-4 p-3.5 bg-rose-50 border border-rose-100 rounded-xl text-rose-600 text-xs font-semibold flex items-center gap-2">
                <ShieldAlert className="w-4 h-4" />
                {editError}
              </div>
            )}

            <form onSubmit={handleUpdate} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1">用户角色与 AI 限额等级</label>
                <select
                  value={editRole}
                  onChange={e => setEditRole(e.target.value as any)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm font-bold text-slate-800 transition-all cursor-pointer"
                >
                  <option value="user">普通用户 (30次 AI / 日)</option>
                  <option value="vip">VIP 会员 (100次 AI / 日)</option>
                  <option value="svip">SVIP 会员 (300次 AI / 日)</option>
                  <option value="admin">管理员 (无限制)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1">用户名 / 姓名</label>
                <input
                  type="text"
                  value={editUsername}
                  onChange={e => setEditUsername(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm font-semibold text-slate-800 transition-all"
                  required
                />
              </div>

              {editRole !== 'admin' && (
                <>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1 flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-slate-400" />
                      会员到期时间
                    </label>
                    <input
                      type="date"
                      value={editVipExpireAt}
                      onChange={e => setEditVipExpireAt(e.target.value)}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm font-semibold text-slate-800 transition-all"
                    />
                    <p className="text-[9px] text-slate-400 pl-1">留空或清除则代表无到期日限制</p>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1 flex items-center gap-1">
                      <Zap className="w-3 h-3 text-indigo-500" />
                      专属每日 AI 限额
                    </label>
                    <input
                      type="number"
                      placeholder="使用全局默认额度限制"
                      value={editCustomAiLimit}
                      onChange={e => setEditCustomAiLimit(e.target.value)}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm font-semibold text-slate-800 transition-all placeholder-slate-400"
                    />
                    <p className="text-[9px] text-slate-400 pl-1">设置具体数字后将覆盖该用户原本角色的默认频次限制</p>
                  </div>
                </>
              )}

              {editRole === 'user' && (
                <>
                  {/* <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1">身份证后6位 (免密凭证)</label>
                    <input 
                      type="text"
                      placeholder="例如: 12345X"
                      value={editIdCard}
                      onChange={e => setEditIdCard(e.target.value)}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm font-semibold text-slate-800 transition-all placeholder-slate-400"
                    />
                  </div> */}
                  {/* <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1">手机号后4位 (免密凭证)</label>
                    <input
                      type="text"
                      placeholder="例如: 6789"
                      value={editPhone}
                      onChange={e => setEditPhone(e.target.value)}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm font-semibold text-slate-800 transition-all placeholder-slate-400"
                    />
                  </div> */}
                </>
              )}

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1 flex items-center gap-1">
                  <Key className="w-3 h-3 text-blue-600" />
                  重置 / 修改账户登录密码
                </label>
                <input
                  type="password"
                  placeholder="不修改请留空（输入后将强行覆盖原密码）"
                  value={editPassword}
                  onChange={e => setEditPassword(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm font-semibold text-slate-800 transition-all placeholder-slate-400"
                />
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="flex-1 py-3 border border-slate-200 text-slate-600 rounded-xl font-bold text-xs hover:bg-slate-50 transition-all cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-bold text-xs hover:from-blue-700 hover:to-indigo-700 transition-all shadow-md shadow-blue-500/10 cursor-pointer"
                >
                  {submitting ? '正在更新...' : '保存更改'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 新增用户模态框 */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-6 relative animate-in fade-in zoom-in-95 duration-200">
            <button
              onClick={() => setShowAddModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition-colors outline-none cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="mb-6 flex items-center gap-2.5 text-blue-600 font-bold">
              <div className="p-2 bg-blue-50 rounded-xl">
                <Users className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-black tracking-tight text-slate-900">新增用户账号</h3>
            </div>

            {addError && (
              <div className="mb-4 p-3.5 bg-rose-50 border border-rose-100 rounded-xl text-rose-600 text-xs font-semibold flex items-center gap-2">
                <ShieldAlert className="w-4 h-4" />
                {addError}
              </div>
            )}

            <form onSubmit={handleAddUser} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1">用户角色类型</label>
                <select
                  value={addRole}
                  onChange={e => setAddRole(e.target.value as any)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm font-bold text-slate-800 transition-all cursor-pointer"
                >
                  <option value="user">普通用户 (user)</option>
                  <option value="vip">VIP 会员 (vip)</option>
                  <option value="svip">SVIP 会员 (svip)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1">
                  {addRole === 'user' ? '用户姓名 / QQ邮箱' : '登录邮箱 / 账号'}
                </label>
                <input
                  type="text"
                  placeholder={addRole === 'user' ? "免密模式输入姓名，有密模式输入QQ邮箱" : "请输入有效的 QQ 邮箱或账号"}
                  value={addUsername}
                  onChange={e => setAddUsername(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm font-semibold text-slate-800 transition-all placeholder-slate-400"
                  required
                />
              </div>

              {addRole === 'user' && (addIdCard || addPhone) ? null : (
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1 flex items-center gap-1">
                    <Key className="w-3 h-3" />
                    登录密码
                  </label>
                  <input
                    type="password"
                    placeholder="请输入登录密码（不少于 6 位）"
                    value={addPassword}
                    onChange={e => setAddPassword(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm font-semibold text-slate-800 transition-all placeholder-slate-400"
                    required={!(addRole === 'user' && (addIdCard || addPhone))}
                  />
                </div>
              )}

              {addRole === 'user' && (
                <>
                  {/* <div className="bg-slate-50 p-3 rounded-xl border border-dashed border-slate-200 text-[10px] text-slate-500 font-medium">
                    提示：如果您只想创建一个临时免密账号，请在此录入其身份证或手机号中的任一项，无需设置密码。若不填写这两个字段，则将按邮箱+密码方式创建。
                  </div> */}
                  {/* <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1">身份证后6位 (选填，免密用)</label>
                    <input 
                      type="text"
                      placeholder="请输入身份证后6位"
                      value={addIdCard}
                      onChange={e => setAddIdCard(e.target.value)}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm font-semibold text-slate-800 transition-all placeholder-slate-400"
                    />
                  </div> */}
                  {/* <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1">手机号后4位 (选填，免密用)</label>
                    <input 
                      type="text"
                      placeholder="请输入手机号后4位"
                      value={addPhone}
                      onChange={e => setAddPhone(e.target.value)}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm font-semibold text-slate-800 transition-all placeholder-slate-400"
                    />
                  </div> */}
                </>
              )}

              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-3 border border-slate-200 text-slate-600 rounded-xl font-bold text-xs hover:bg-slate-50 transition-all cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-bold text-xs hover:from-blue-700 hover:to-indigo-700 transition-all shadow-md shadow-blue-500/10 cursor-pointer"
                >
                  {submitting ? '正在提交...' : '确认添加'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {weeklyStatsUser && (
        <WeeklyReportModal username={weeklyStatsUser} onClose={() => setWeeklyStatsUser(null)} />
      )}
    </div>
  );
}
