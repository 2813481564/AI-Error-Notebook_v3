import React, { useState, useEffect } from 'react';
import { Users, Edit2, Trash2, X, ShieldAlert, Award, Key } from 'lucide-react';

interface UserItem {
  username: string;
  role: 'student' | 'teacher' | 'admin';
  lastAiResetDate: string | null;
  aiUsedToday: number;
  questionCount: number;
}

export default function UserManagement({ onNavigate }: { onNavigate: (view: any) => void }) {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 编辑模态框状态
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [editUsername, setEditUsername] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editRole, setEditRole] = useState<'student' | 'teacher'>('student');
  const [editError, setEditError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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

  useEffect(() => {
    fetchUsers();
  }, []);

  const getLimitByRole = (role: string) => {
    if (role === 'teacher') return 5000;
    if (role === 'admin') return Infinity;
    return 30;
  };

  const handleEditClick = (user: UserItem) => {
    setEditingUser(user);
    setEditUsername(user.username);
    setEditRole((user.role === 'admin' ? 'student' : user.role) as any);
    setEditPassword('');
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
          role: editRole
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600/10 flex items-center justify-center text-blue-600">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight">注册用户管理控制台</h2>
            <p className="text-xs text-slate-500 font-medium">配置用户角色等级、日常 AI 限额以及重置账号密码</p>
          </div>
        </div>
      </div>

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
                  <th className="py-4 px-6">等级与特权</th>
                  <th className="py-4 px-6">今日已用 AI 次数</th>
                  <th className="py-4 px-6 text-center">累计错题数</th>
                  <th className="py-4 px-6 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm font-semibold text-slate-700">
                {users.map((user) => {
                  const limit = getLimitByRole(user.role);
                  const usagePercent = Math.min(100, Math.round((user.aiUsedToday / limit) * 100));
                  
                  return (
                    <tr key={user.username} className="hover:bg-slate-50/40 transition-colors">
                      <td className="py-4 px-6 font-bold text-slate-900">{user.username}</td>
                      <td className="py-4 px-6">
                        {user.role === 'teacher' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-purple-50 text-purple-700 border border-purple-200/50 shadow-sm shadow-purple-500/5">
                            <Award className="w-3.5 h-3.5 text-purple-500 animate-pulse" />
                            老师 (5000次/日)
                          </span>
                        )}
                        {user.role === 'student' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600">
                            学生 (只读题库)
                          </span>
                        )}
                        {user.role === 'admin' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-amber-50 text-amber-700 border border-amber-200/50 shadow-sm shadow-amber-500/5">
                            <Award className="w-3.5 h-3.5 text-amber-500" />
                            管理员
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-6 min-w-[200px]">
                        <div className="space-y-1.5 max-w-[160px]">
                          <div className="flex justify-between text-[11px] font-bold text-slate-400">
                            <span>{user.aiUsedToday} / {limit}次</span>
                            <span>{usagePercent}%</span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full transition-all duration-500 ${
                                usagePercent >= 90 
                                  ? 'bg-rose-500' 
                                  : usagePercent >= 70 
                                    ? 'bg-amber-500' 
                                    : 'bg-blue-600'
                              }`}
                              style={{ width: `${usagePercent}%` }}
                            ></div>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-6 text-center text-slate-900 font-bold">{user.questionCount}</td>
                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-2">
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
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1">用户名</label>
                <input 
                  type="text"
                  value={editUsername}
                  onChange={e => setEditUsername(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm font-semibold text-slate-800 transition-all"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1 flex items-center gap-1">
                  <Key className="w-3 h-3" />
                  新密码
                </label>
                <input 
                  type="password"
                  placeholder="不修改请留空"
                  value={editPassword}
                  onChange={e => setEditPassword(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm font-semibold text-slate-800 transition-all placeholder-slate-400"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1">用户角色与 AI 限额等级</label>
                <select
                  value={editRole}
                  onChange={e => setEditRole(e.target.value as any)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm font-bold text-slate-800 transition-all"
                >
                  <option value="student">学生 (只读题库, 30次/日)</option>
                  <option value="teacher">老师 (录入/出题, 5000次/日)</option>
                </select>
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
    </div>
  );
}
