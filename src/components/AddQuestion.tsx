import { useState, useRef, ChangeEvent } from 'react';
import { db, ErrorQuestion } from '../lib/db';
import { Upload, Camera, Loader2, Sparkles, AlertCircle } from 'lucide-react';
import FormattedMath from './FormattedMath';

export default function AddQuestion({ onNavigate }: { onNavigate: (v: any) => void }) {
  const [imageStr, setImageStr] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string>('image/jpeg');
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [parsedData, setParsedData] = useState<ErrorQuestion[] | null>(null);
  const [selectedIndexes, setSelectedIndexes] = useState<Set<number>>(new Set());
  const [errorReasons, setErrorReasons] = useState<Record<number, string>>({});
  const [expandedSolutions, setExpandedSolutions] = useState<Record<number, boolean>>({});
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setMimeType(file.type);
    const reader = new FileReader();
    reader.onload = (event) => {
      setImageStr(event.target?.result as string);
      setParsedData(null); // Reset parsed data on new image
    };
    reader.readAsDataURL(file);
  };

  const analyzeImage = async () => {
    if (!imageStr) return;
    setAnalyzing(true);
    setError(null);
    try {
      const token = localStorage.getItem('errorbook_token');
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ imageBase64: imageStr, mimeType })
      });
      
      if (res.status === 401) {
        localStorage.removeItem('errorbook_token');
        localStorage.removeItem('errorbook_username');
        window.location.reload();
        throw new Error('登录已过期，请重新登录');
      }
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '分析失败');
      
      if (Array.isArray(data)) {
        setParsedData(data);
        setSelectedIndexes(new Set(data.map((_, i) => i)));
        
        const reasons: Record<number, string> = {};
        const expanded: Record<number, boolean> = {};
        data.forEach((_, i) => {
          reasons[i] = '概念不清';
          expanded[i] = i === 0; // Expand first by default
        });
        setErrorReasons(reasons);
        setExpandedSolutions(expanded);
      } else {
        const arrayData = [data as any];
        setParsedData(arrayData);
        setSelectedIndexes(new Set([0]));
        setErrorReasons({ 0: '概念不清' });
        setExpandedSolutions({ 0: true });
      }
    } catch (err: any) {
       setError(err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  const toggleSelectedIndex = (idx: number) => {
    const next = new Set(selectedIndexes);
    if (next.has(idx)) {
      next.delete(idx);
    } else {
      next.add(idx);
    }
    setSelectedIndexes(next);
  };

  const updateErrorReason = (idx: number, val: string) => {
    setErrorReasons(prev => ({ ...prev, [idx]: val }));
  };

  const toggleSolutionExpanded = (idx: number) => {
    setExpandedSolutions(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  const handleSave = async () => {
    if (!parsedData || parsedData.length === 0) return;
    if (selectedIndexes.size === 0) {
      alert('请选择至少一道题目进行保存归档！');
      return;
    }
    
    try {
      const selectedQuestions = parsedData.filter((_, idx) => selectedIndexes.has(idx));
      
      for (const item of selectedQuestions) {
        const itemIdx = parsedData.indexOf(item);
        const reason = errorReasons[itemIdx] || '概念不清';
        
        const question: ErrorQuestion = {
          id: crypto.randomUUID ? crypto.randomUUID() : (Date.now() + Math.random()).toString(),
          imageUrl: imageStr || undefined,
          originalText: item.originalText,
          subject: item.subject || '其他',
          knowledgePoints: item.knowledgePoints || [],
          errorReason: reason,
          solution: item.solution || '',
          createdAt: Date.now(),
          studentAnswer: item.studentAnswer || '',
          errorDiagnosis: item.errorDiagnosis || []
        };
        
        await db.saveQuestion(question);
      }
      
      onNavigate('library');
    } catch (err: any) {
      setError(err.message || '保存错题失败，请重试');
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-2xl mx-auto">
      
      <div className="flex flex-col gap-1 mb-2">
        <h2 className="text-2xl font-black text-slate-950 tracking-tight">录入新错题</h2>
        <p className="text-sm text-slate-500">上传错题图片，AI 自动切题识别并推荐关联考点</p>
      </div>

      {!imageStr ? (
        <div className="bg-white border-2 border-dashed border-slate-200 hover:border-blue-400 transition-colors rounded-2xl p-12 flex flex-col items-center justify-center text-center shadow-sm">
            <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-4 shadow-sm shadow-blue-500/10">
              <Camera className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-1">拍照或上传错题图片</h3>
            <p className="text-xs text-slate-500 mb-6 max-w-xs leading-relaxed">精准识别印刷体与手写体，自动整理推荐同类巩固训练题</p>
            
            <input 
              type="file" 
              accept="image/*" 
              className="hidden" 
              ref={fileInputRef}
              onChange={handleFileChange}
            />
            
            <div className="flex gap-4">
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-blue-700 transition shadow-lg shadow-blue-600/10"
              >
                <Upload className="w-4 h-4" /> 选择本地图片
              </button>
            </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-white p-3 rounded-2xl border border-slate-200 overflow-hidden relative shadow-sm">
             <img src={imageStr} alt="Uploaded" className="w-full max-h-64 object-contain rounded-xl" />
             <button 
               onClick={() => { setImageStr(null); setParsedData(null); }}
               className="absolute top-5 right-5 bg-slate-900/80 hover:bg-slate-900 text-white px-3 py-1.5 rounded-xl text-xs font-bold shadow-md transition backdrop-blur-sm"
             >
               重新上传
             </button>
          </div>
          
          {error && (
            <div className="bg-rose-50 text-rose-600 p-4 rounded-xl flex gap-3 text-sm border border-rose-100">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <p className="font-medium">{error}</p>
            </div>
          )}

          {!parsedData && !analyzing && (
            <button 
              onClick={analyzeImage}
              className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 hover:bg-blue-700 transition"
            >
              <Sparkles className="w-5 h-5" /> 开始 AI 智能解析
            </button>
          )}

          {analyzing && (
            <div className="bg-white p-8 rounded-2xl border border-slate-150 flex flex-col items-center justify-center space-y-4 shadow-sm">
               <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
               <p className="text-slate-700 font-semibold tracking-wide animate-pulse">AI 正在进行试卷自动分题与多步深度解析批改...</p>
            </div>
          )}

          {parsedData && (
             <div className="space-y-6">
                <div className="bg-blue-50 border border-blue-100 p-4 rounded-2xl flex items-center justify-between shadow-sm">
                  <span className="text-xs font-bold text-blue-900">
                    AI 成功在试卷中识别到 {parsedData.length} 道题目
                  </span>
                  <span className="text-[10px] text-slate-400 font-bold">
                    勾选需要归档的题目即可批量保存
                  </span>
                </div>

                {parsedData.map((q, idx) => {
                  const isSelected = selectedIndexes.has(idx);
                  return (
                    <div 
                      key={idx} 
                      className={`bg-white rounded-3xl border p-6 md:p-8 space-y-6 shadow-sm transition-all duration-300 ${
                        isSelected ? 'border-slate-200' : 'border-slate-100 opacity-60'
                      }`}
                    >
                      <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                        <div className="flex items-center gap-3">
                          <input 
                            type="checkbox" 
                            checked={isSelected}
                            onChange={() => toggleSelectedIndex(idx)}
                            className="w-5 h-5 text-blue-600 bg-slate-50 border-slate-300 rounded focus:ring-blue-500 cursor-pointer"
                          />
                          <span className="text-sm font-black text-slate-900">题目 #{idx + 1}</span>
                        </div>
                        <span className="bg-blue-50 text-blue-700 px-3 py-1 rounded-xl text-xs font-bold border border-blue-100">
                          {q.subject}
                        </span>
                      </div>

                      {/* Question Text */}
                      <div className="space-y-2">
                        <FormattedMath text={q.originalText} className="text-slate-900 font-bold" />
                      </div>

                      {/* Knowledge Points */}
                      {q.knowledgePoints && q.knowledgePoints.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {q.knowledgePoints.map((p, pIdx) => (
                            <span key={pIdx} className="text-[10px] bg-slate-50 text-slate-500 px-2.5 py-1 rounded-xl border border-slate-100 font-bold">
                              # {p}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Solution */}
                      {q.solution && (
                        <div className="pt-4 border-t border-slate-100">
                          <button
                            onClick={() => toggleSolutionExpanded(idx)}
                            className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800 transition outline-none"
                          >
                            <span>{expandedSolutions[idx] ? '▼ 收起本题名师精解' : '▶ 展开本题名师精解'}</span>
                          </button>
                          {expandedSolutions[idx] && (
                            <div className="mt-3 p-4 bg-slate-50/50 border border-slate-150 rounded-2xl text-xs leading-relaxed text-slate-800">
                              <FormattedMath text={q.solution} />
                            </div>
                          )}
                        </div>
                      )}

                      {/* Step diagnosis specific to this question */}
                      {q.errorDiagnosis && q.errorDiagnosis.length > 0 && (
                        <div className="pt-4 border-t border-slate-100 space-y-3">
                          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                            <span>📝</span> 本题手写作答 AI 步骤诊断批改
                          </h4>
                          <div className="grid grid-cols-1 gap-3">
                            {q.errorDiagnosis.map((step: any) => {
                              let statusColor = "bg-emerald-50/50 border-emerald-100 text-emerald-800";
                              let statusIcon = "✅";
                              let statusText = "正确";
                              
                              if (step.status === 'incorrect') {
                                statusColor = "bg-rose-50 border-rose-100 text-rose-800";
                                statusIcon = "❌";
                                statusText = "首次出现错误";
                              } else if (step.status === 'consequential_error') {
                                statusColor = "bg-amber-50/30 border-amber-100 text-amber-800";
                                statusIcon = "⚠️";
                                statusText = "受前面错误波及";
                              }

                              return (
                                <div key={step.stepNumber} className={`p-4 border rounded-2xl ${statusColor} space-y-1`}>
                                  <div className="flex items-center justify-between text-xs font-extrabold">
                                    <span>步骤 {step.stepNumber} {statusIcon}</span>
                                    <span>{statusText}</span>
                                  </div>
                                  <div className="text-sm font-semibold leading-relaxed">
                                    <FormattedMath text={step.stepContent} />
                                  </div>
                                  {step.comment && (
                                    <div className="text-xs mt-1.5 pt-1.5 border-t border-current/10 font-bold opacity-90 text-rose-700">
                                      诊断说明：{step.comment}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Individual Error Reason Selection */}
                      <div className="pt-4 border-t border-slate-100 flex items-center gap-3">
                        <label className="text-xs font-bold text-slate-450 whitespace-nowrap">归档错误原因：</label>
                        <select 
                          value={errorReasons[idx] || '概念不清'} 
                          onChange={e => updateErrorReason(idx, e.target.value)}
                          className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-xs font-bold text-slate-700"
                        >
                          <option value="概念不清">概念不清</option>
                          <option value="粗心大意">粗心大意</option>
                          <option value="思路错误">思路错误</option>
                          <option value="完全不会">完全不会</option>
                          <option value="其他">其他</option>
                        </select>
                      </div>
                    </div>
                  );
                })}

                <button 
                  onClick={handleSave}
                  className="w-full bg-slate-900 hover:bg-slate-950 text-white py-4.5 rounded-2xl font-bold transition shadow-lg shadow-slate-900/10 text-sm"
                >
                  保存并批量归档选中的错题 ({selectedIndexes.size} 道)
                </button>
             </div>
          )}
        </div>
      )}
    </div>
  );
}
