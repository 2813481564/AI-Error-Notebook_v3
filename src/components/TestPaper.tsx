import { useState } from 'react';
import { Printer, ArrowLeft, Eye, EyeOff, Edit, Check, Sparkles, Loader2, Undo2 } from 'lucide-react';
import { ErrorQuestion } from '../lib/db';
import FormattedMath from './FormattedMath';
import GeometryRenderer from './GeometryRenderer';
import type { GeometryData } from '../types/geometry';

export default function TestPaper({ 
  questions, 
  onBack 
}: { 
  questions: ErrorQuestion[];
  onBack: () => void;
}) {
  const [isTeacherMode, setIsTeacherMode] = useState(false);
  const [title, setTitle] = useState('智能错题本 - 巩固复习测验卷');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [tempTitle, setTempTitle] = useState(title);

  // 新增：模式管理 ('original' | 'variant')
  const [paperMode, setPaperMode] = useState<'original' | 'variant'>('original');
  const [variants, setVariants] = useState<any[]>([]);
  const [generating, setGenerating] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);

  const handlePrint = () => {
    window.print();
  };

  const saveTitle = () => {
    if (tempTitle.trim()) {
      setTitle(tempTitle);
    }
    setIsEditingTitle(false);
  };

  // 生成 AI 变式强化试卷
  const generateVariants = async () => {
    if (variants.length > 0) {
      setPaperMode('variant');
      return;
    }

    setGenerating(true);
    setLoadingStep(1);
    
    // 定时滚动展示逼真的 AI 名师出题状态，提升用户体验 (Wow UX)
    const stepInterval = setInterval(() => {
      setLoadingStep(prev => (prev < 3 ? prev + 1 : prev));
    }, 2500);

    try {
      const token = localStorage.getItem('errorbook_token');
      const res = await fetch('/api/paper/variants', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ questions })
      });

      if (res.status === 401) {
        localStorage.removeItem('errorbook_token');
        localStorage.removeItem('errorbook_username');
        window.location.reload();
        throw new Error('登录已过期，请重新登录');
      }

      if (res.status === 429) {
        throw new Error('今日 AI 使用次数已达上限，无法生成变式练习卷。您可以联系管理员升级您的账户等级！');
      }

      if (!res.ok) {
        let errorMsg = '生成失败';
        try {
          const errData = await res.json();
          errorMsg = errData.error || errorMsg;
        } catch (_) {
          errorMsg = `请求失败，服务器返回状态: ${res.status}`;
        }
        throw new Error(errorMsg);
      }

      const data = await res.json();

      setVariants(data);
      setPaperMode('variant');
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'AI 生成变式试卷失败，请重试');
    } finally {
      clearInterval(stepInterval);
      setGenerating(false);
      setLoadingStep(0);
    }
  };

  // 决定最终渲染的题目列表
  const displayedQuestions = paperMode === 'original' 
    ? questions.map((q, idx) => ({
        id: q.id,
        subject: q.subject,
        text: q.originalText,
        solution: q.solution,
        errorReason: q.errorReason,
        geometry: undefined
      }))
    : variants.map((v, idx) => ({
        id: `variant-${idx}`,
        subject: v.subject || '数学',
        text: v.variantText,
        solution: v.solution,
        errorReason: 'AI 变式题',
        geometry: v.geometry
      }));

  return (
    <div className="space-y-6 relative">
      
      {/* 打印机特化 CSS 注入 */}
      <style>{`
        @media print {
          .no-print {
            display: none !important;
          }
          body, html {
            background: #fff !important;
            color: #000 !important;
            font-size: 14px !important;
          }
          .print-main-area {
            padding: 0 !important;
            margin: 0 !important;
            border: none !important;
            box-shadow: none !important;
            background: transparent !important;
            width: 100% !important;
            max-width: 100% !important;
          }
          .print-question-card {
            border: none !important;
            border-bottom: 1px dashed #94a3b8 !important;
            border-radius: 0 !important;
            padding: 20px 0 !important;
            margin-bottom: 10px !important;
            page-break-inside: avoid !important;
          }
          .print-answer-lines {
            border-bottom: 1px solid #cbd5e1 !important;
            margin-top: 15px !important;
          }
        }
      `}</style>

      {/* Loading Overlay (Wow Aesthetics) */}
      {generating && (
        <div className="no-print fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-2xl max-w-sm w-full text-center space-y-6 flex flex-col items-center">
            <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center animate-bounce">
              <Sparkles className="w-8 h-8 text-amber-500" />
            </div>
            
            <div className="space-y-2">
              <h4 className="text-base font-black text-slate-900">AI 考点命题组卷中</h4>
              <div className="flex items-center justify-center gap-2 text-xs text-slate-500 font-bold">
                <Loader2 className="w-4.5 h-4.5 text-blue-600 animate-spin" />
                {loadingStep === 1 && <span className="animate-pulse">正在深度分析错题的核心知识漏洞...</span>}
                {loadingStep === 2 && <span className="animate-pulse">正在为您精准命制 1:1 相似变式题...</span>}
                {loadingStep >= 3 && <span className="animate-pulse">正在排版教师标准步骤与详细解析...</span>}
              </div>
            </div>

            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
              <div 
                className="bg-blue-600 h-1.5 rounded-full transition-all duration-1000" 
                style={{ width: `${(loadingStep / 3) * 100}%` }}
              ></div>
            </div>
          </div>
        </div>
      )}

      {/* Control Bar (no-print) */}
      <div className="no-print flex flex-col md:flex-row gap-4 items-start md:items-center justify-between bg-white border border-slate-200/60 p-5 rounded-3xl shadow-sm">
        <button 
          onClick={onBack}
          className="flex items-center gap-2 text-slate-500 hover:text-slate-950 font-bold text-xs transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>返回错题库</span>
        </button>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Mode Switcher */}
          <button
            onClick={() => setIsTeacherMode(!isTeacherMode)}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
              isTeacherMode 
                ? 'bg-amber-50 border-amber-200 text-amber-700' 
                : 'bg-blue-50 border-blue-200 text-blue-700'
            }`}
          >
            {isTeacherMode ? (
              <>
                <Eye className="w-4 h-4" />
                <span>当前视图：教师解析版</span>
              </>
            ) : (
              <>
                <EyeOff className="w-4 h-4" />
                <span>当前视图：学生测验版</span>
              </>
            )}
          </button>

          {/* AI Variant Switcher Button */}
          {paperMode === 'original' ? (
            <button
              onClick={generateVariants}
              className="flex items-center gap-1.5 px-4.5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-amber-500/10 cursor-pointer w-full sm:w-auto justify-center"
            >
              <Sparkles className="w-4 h-4 text-white" />
              <span>⚡ 生成 AI 变式练习卷</span>
            </button>
          ) : (
            <button
              onClick={() => setPaperMode('original')}
              className="flex items-center gap-1.5 px-4.5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition-all cursor-pointer w-full sm:w-auto justify-center"
            >
              <Undo2 className="w-4 h-4" />
              <span>⏪ 返回原错题试卷</span>
            </button>
          )}

          {/* Print Trigger */}
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl text-xs font-extrabold hover:from-blue-700 hover:to-indigo-700 transition-colors shadow-md shadow-blue-500/10 cursor-pointer w-full sm:w-auto justify-center"
          >
            <Printer className="w-4 h-4" />
            <span>一键打印试卷 (Ctrl+P)</span>
          </button>
        </div>
      </div>

      {/* Paper Container */}
      <div className="print-main-area bg-white border border-slate-200/60 rounded-3xl p-8 md:p-12 shadow-sm space-y-8 relative overflow-hidden">
        
        {/* Paper Header */}
        <div className="text-center space-y-5 pb-6 border-b-2 border-slate-900">
          {/* Editable Title */}
          <div className="flex items-center justify-center gap-2 group">
            {isEditingTitle ? (
              <div className="no-print flex items-center gap-2 max-w-xl w-full">
                <input 
                  type="text"
                  value={tempTitle}
                  onChange={e => setTempTitle(e.target.value)}
                  className="flex-1 p-2 border border-slate-300 rounded-xl text-center text-lg font-black text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none"
                  autoFocus
                />
                <button 
                  onClick={saveTitle}
                  className="p-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors"
                >
                  <Check className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <>
                <h1 className="text-xl md:text-2xl font-black text-slate-950 tracking-tight">
                  {title}{paperMode === 'variant' && ' (AI 变式强化训练卷)'}
                </h1>
                <button
                  onClick={() => { setTempTitle(title); setIsEditingTitle(true); }}
                  className="no-print p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-50 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                  title="修改试卷标题"
                >
                  <Edit className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>

          {/* Candidate Info Grid */}
          <div className="max-w-md mx-auto grid grid-cols-3 gap-6 text-xs text-slate-700 font-bold">
            <div className="flex items-center gap-1">
              <span>班级：</span>
              <div className="flex-1 border-b border-slate-400 h-4"></div>
            </div>
            <div className="flex items-center gap-1">
              <span>姓名：</span>
              <div className="flex-1 border-b border-slate-400 h-4"></div>
            </div>
            <div className="flex items-center gap-1">
              <span>学号：</span>
              <div className="flex-1 border-b border-slate-400 h-4"></div>
            </div>
          </div>

          {/* Scores Indicator */}
          <div className="max-w-md mx-auto border border-slate-800 grid grid-cols-3 text-xs font-black divide-x divide-slate-800 text-center">
            <div className="p-2">大题</div>
            <div className="p-2">得 分</div>
            <div className="p-2">阅卷人</div>
          </div>
        </div>

        {/* Paper Body */}
        <div className="divide-y divide-slate-100 space-y-6">
          {displayedQuestions.map((q, index) => (
            <div 
              key={q.id} 
              className="print-question-card pt-6 first:pt-0 space-y-4"
            >
              {/* Question Index & Subject */}
              <div className="flex items-center justify-between text-xs">
                <span className="font-black text-slate-900 text-sm">
                  第 {index + 1} 题. 
                  <span className="no-print ml-2 bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-bold">{q.subject}</span>
                </span>
                <span className="no-print text-slate-400 font-bold">
                  {paperMode === 'original' ? `# 错题 ID: ${q.id.slice(0, 8)}` : '# AI 命制变式题'}
                </span>
              </div>

              {/* Geometry Area */}
              {q.geometry && q.geometry.type !== 'none' && (
                <div className="py-2">
                  <GeometryRenderer geometry={q.geometry} />
                </div>
              )}

              {/* Question Text */}
              <FormattedMath 
                text={q.text} 
                className="text-sm text-slate-900 leading-relaxed font-bold" 
              />

              {/* Answers Area depending on Mode */}
              {isTeacherMode ? (
                // 教师解析版
                <div className="bg-amber-50/50 border border-amber-100 rounded-2xl p-5 space-y-4 animate-in fade-in duration-300">
                  <div className="text-xs text-amber-800 font-black flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                    <span>类型：{q.errorReason || 'AI 变式'}</span>
                  </div>
                  
                  <div className="border-t border-amber-200/50 pt-3">
                    <h5 className="text-xs font-black text-amber-900 mb-2">名师标准精解步骤：</h5>
                    <FormattedMath text={q.solution} className="text-slate-800 text-xs" />
                  </div>
                </div>
              ) : (
                // 学生测验版 (渲染空白作答线区域)
                <div className="space-y-4 pt-4">
                  <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider no-print">答题区域 (打印保留)</div>
                  <div className="space-y-3 pl-2">
                    <div className="print-answer-lines h-0.5 w-full border-b border-slate-200 border-dashed"></div>
                    <div className="print-answer-lines h-0.5 w-full border-b border-slate-200 border-dashed"></div>
                    <div className="print-answer-lines h-0.5 w-full border-b border-slate-200 border-dashed"></div>
                    <div className="print-answer-lines h-0.5 w-full border-b border-slate-200 border-dashed"></div>
                    <div className="print-answer-lines h-0.5 w-full border-b border-slate-200 border-dashed"></div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Paper Footer */}
        <div className="text-center pt-8 border-t border-slate-300 text-[10px] text-slate-400 font-bold">
          <span>（本试卷由 AI 智能错题系统组卷自动生成，仅限个人巩固复习与班级练习使用）</span>
        </div>

      </div>

    </div>
  );
}
