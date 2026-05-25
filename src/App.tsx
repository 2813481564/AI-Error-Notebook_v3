import { useState, ReactNode } from 'react';
import { Camera, BarChart3, Database, Home, HelpCircle, HardDrive } from 'lucide-react';
import Dashboard from './components/Dashboard';
import AddQuestion from './components/AddQuestion';
import QuestionLibrary from './components/QuestionLibrary';

type View = 'dashboard' | 'add' | 'library';

export default function App() {
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [showSqlTip, setShowSqlTip] = useState(false);

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
        
        <nav className="flex-1 p-4 space-y-1.5">
          <button
            onClick={() => setCurrentView('dashboard')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              currentView === 'dashboard' 
                ? 'bg-blue-50 text-blue-700 shadow-sm' 
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
            }`}
          >
            <Home className="w-4 h-4" />
            <span>首页统计</span>
          </button>
          
          <button
            onClick={() => setCurrentView('add')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              currentView === 'add' 
                ? 'bg-blue-50 text-blue-700 shadow-sm' 
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
            }`}
          >
            <Camera className="w-4 h-4" />
            <span>拍照录题</span>
          </button>
          
          <button
            onClick={() => setCurrentView('library')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              currentView === 'library' 
                ? 'bg-blue-50 text-blue-700 shadow-sm' 
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
            }`}
          >
            <Database className="w-4 h-4" />
            <span>错题库管理</span>
          </button>
        </nav>

        {/* SQLite Storage Status & Link */}
        <div className="p-4 border-t border-slate-100">
          <button 
            onClick={() => setShowSqlTip(true)}
            className="w-full text-left p-3.5 bg-slate-900 rounded-2xl text-white hover:bg-black transition-colors relative group overflow-hidden"
          >
            <div className="absolute right-3 top-3.5 text-white/40 group-hover:text-white transition-colors">
              <HelpCircle className="w-4 h-4" />
            </div>
            <p className="text-[10px] tracking-wider font-bold text-slate-400 uppercase mb-1">SQLite 数据同步</p>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <p className="text-xs font-semibold">存储状态: 已准备完毕</p>
            </div>
            <p className="text-[10px] text-slate-400 mt-2 hover:underline">点击查看 SQLite 导入指南</p>
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
          <button 
            onClick={() => setShowSqlTip(true)}
            className="text-xs bg-slate-900 text-white rounded-full px-3 py-1.5 font-bold hover:bg-black transition-colors flex items-center gap-1"
          >
            <HardDrive className="w-3 h-3" />
            存储说明
          </button>
        </header>

        {/* Content Area */}
        <main className="flex-1 h-full overflow-y-auto p-4 md:p-8 pb-24 md:pb-8">
          <div className="max-w-4xl mx-auto space-y-6">
            {currentView === 'dashboard' && <Dashboard onNavigate={setCurrentView} />}
            {currentView === 'add' && <AddQuestion onNavigate={setCurrentView} />}
            {currentView === 'library' && <QuestionLibrary onNavigate={setCurrentView} />}
          </div>
        </main>

        {/* Mobile Navigation - Only Bottom */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex items-center justify-around pb-safe z-20">
          <NavItem 
            icon={<Home className="w-5 h-5" />} label="首页" 
            active={currentView === 'dashboard'} 
            onClick={() => setCurrentView('dashboard')} 
          />
          <div className="relative -top-5">
            <button 
              onClick={() => setCurrentView('add')}
              className="w-14 h-14 bg-blue-600 rounded-full flex items-center justify-center text-white shadow-lg shadow-blue-600/30 hover:bg-blue-700 transition-colors"
            >
               <Camera className="w-6 h-6" />
            </button>
          </div>
          <NavItem 
            icon={<Database className="w-5 h-5" />} label="错题库" 
            active={currentView === 'library'} 
            onClick={() => setCurrentView('library')} 
          />
        </nav>
      </div>

      {/* SQLite Instruction Modal */}
      {showSqlTip && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-6 relative animate-in fade-in zoom-in-95 duration-200">
            <button 
              onClick={() => setShowSqlTip(false)} 
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
            >
              ✕
            </button>
            <div className="mb-4 flex items-center gap-2 text-blue-600 font-bold">
              <HardDrive className="w-5 h-5" />
              <h3 className="text-lg">本地 SQLite 存储迁移说明</h3>
            </div>
            
            <div className="space-y-4 text-slate-600 text-sm leading-relaxed">
              <p>
                为了让您线上体验流畅，我们当前在线上开发环境使用了 <strong>IndexedDB (本地键值数据库)</strong> 进行数据持久化存储。
              </p>
              <p>
                <strong>如何导入到本地电脑开发 (使用 SQLite)？</strong>
              </p>
              <ol className="list-decimal pl-5 space-y-2">
                <li>
                  <strong>数据表映射非常直接：</strong> 错题表对应本软件的 <code>ErrorQuestion</code> 类型。
                </li>
                <li>
                  推荐创建与其对应的 <code>questions</code> 物理表，主要字段有:
                  <div className="bg-slate-50 p-3 rounded-lg font-mono text-xs text-slate-700 mt-1 max-h-32 overflow-y-auto">
                    CREATE TABLE questions (<br />
                    &nbsp;&nbsp;id TEXT PRIMARY KEY,<br />
                    &nbsp;&nbsp;originalText TEXT NOT NULL,<br />
                    &nbsp;&nbsp;subject TEXT NOT NULL,<br />
                    &nbsp;&nbsp;knowledgePoints TEXT,<br />
                    &nbsp;&nbsp;errorReason TEXT,<br />
                    &nbsp;&nbsp;solution TEXT,<br />
                    &nbsp;&nbsp;imageUrl TEXT,<br />
                    &nbsp;&nbsp;createdAt INTEGER<br />
                    );
                  </div>
                </li>
                <li>
                  当您将本项目导入到本地时，只需引入 <code>sqlite3</code> 并在 Express 后端或 Electron 读写 <code>questions.db</code> 文件即可。所有的字段与查询均可通过直接搬运 IndexedDB 中的接口无缝扩展！
                </li>
              </ol>
            </div>

            <button 
              onClick={() => setShowSqlTip(false)}
              className="mt-6 w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-colors"
            >
              我明白了
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


