import { useState, useRef, ChangeEvent, useEffect } from 'react';
import { db, ErrorQuestion } from '../lib/db';
import { Upload, Camera, Loader2, Sparkles, AlertCircle, RotateCw, Trash2, Plus, Check, ChevronLeft } from 'lucide-react';
import FormattedMath from './FormattedMath';

export default function AddQuestion({ onNavigate }: { onNavigate: (v: any) => void }) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [imageStr, setImageStr] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string>('image/jpeg');
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 错题本相关状态
  const [notebooks, setNotebooks] = useState<{ id: string; name: string }[]>([]);
  const [selectedNotebook, setSelectedNotebook] = useState<string>('');

  // 标准答案相关的状态（此处仅作向下兼容定义，不再渲染UI输入项）
  const [answerImageStr, setAnswerImageStr] = useState<string | null>(null);
  const [answerMimeType, setAnswerMimeType] = useState<string>('image/jpeg');
  const [answerText, setAnswerText] = useState<string>('');
  const answerFileInputRef = useRef<HTMLInputElement>(null);

  // 原始图片放大查看状态
  const [isZoomed, setIsZoomed] = useState(false);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });


  const handleCreateNotebook = async () => {
    const name = prompt('请输入新错题本名称：');
    if (!name || !name.trim()) return;
    try {
      const token = localStorage.getItem('errorbook_token');
      const res = await fetch('/api/notebooks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ name: name.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '创建失败');
      setNotebooks(prev => [...prev, data]);
      setSelectedNotebook(data.id);
    } catch (err: any) {
      alert(err.message || '操作失败');
    }
  };

  useEffect(() => {
    const token = localStorage.getItem('errorbook_token');
    fetch('/api/notebooks', {
      headers: {
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      }
    })
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setNotebooks(data);
        }
      })
      .catch(console.error);
  }, []);

  // Stage 2 states (extracted questions for review)
  const [extractedQuestions, setExtractedQuestions] = useState<{ subject: string; originalText: string; studentAnswer: string }[] | null>(null);

  // Stage 3 states (diagnosed results)
  const [diagnosing, setDiagnosing] = useState<Record<number, 'pending' | 'loading' | 'success' | 'error'>>({});
  const [parsedData, setParsedData] = useState<ErrorQuestion[] | null>(null);
  const [selectedIndexes, setSelectedIndexes] = useState<Set<number>>(new Set());
  const [errorReasons, setErrorReasons] = useState<Record<number, string>>({});
  const [expandedSolutions, setExpandedSolutions] = useState<Record<number, boolean>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle file upload
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setMimeType(file.type);
    const reader = new FileReader();
    reader.onload = (event) => {
      setImageStr(event.target?.result as string);
      setExtractedQuestions(null);
      setParsedData(null);
      setStep(1);
    };
    reader.readAsDataURL(file);
  };

  // Rotate image 90 degrees clockwise using HTML5 Canvas
  const handleRotate = () => {
    if (!imageStr) return;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Swap width and height for 90 degree rotation
      canvas.width = img.height;
      canvas.height = img.width;

      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((90 * Math.PI) / 180);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);

      const rotatedBase64 = canvas.toDataURL(mimeType);
      setImageStr(rotatedBase64);
    };
    img.src = imageStr;
  };

  // Stage 1 -> Stage 2: Call Vision AI to extract text
  const extractQuestions = async () => {
    if (!imageStr) return;
    setAnalyzing(true);
    setError(null);
    try {
      const token = localStorage.getItem('errorbook_token');
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          imageBase64: imageStr,
          mimeType,
          answerImageBase64: answerImageStr || undefined,
          answerMimeType,
          answerText: answerText || undefined
        })
      });

      if (res.status === 401) {
        localStorage.removeItem('errorbook_token');
        localStorage.removeItem('errorbook_username');
        window.location.reload();
        throw new Error('登录已过期，请重新登录');
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '提取失败');

      if (Array.isArray(data)) {
        setExtractedQuestions(data);
      } else {
        setExtractedQuestions([data]);
      }
      setStep(2);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  // Stage 2 actions: Edit extracted questions list
  const handleUpdateExtracted = (idx: number, field: string, val: string) => {
    if (!extractedQuestions) return;
    const next = [...extractedQuestions];
    next[idx] = { ...next[idx], [field]: val };
    setExtractedQuestions(next);
  };

  const handleAddQuestion = () => {
    setExtractedQuestions(prev => [
      ...(prev || []),
      { subject: '数学', originalText: '请输入题干内容...', studentAnswer: '' }
    ]);
  };

  const handleDeleteQuestion = (idx: number) => {
    if (!extractedQuestions) return;
    const next = extractedQuestions.filter((_, i) => i !== idx);
    setExtractedQuestions(next);
  };

  // Stage 2 -> Stage 3: Call Text AI to diagnose each question
  const diagnoseAll = async () => {
    if (!extractedQuestions || extractedQuestions.length === 0) return;
    setStep(3);

    const statuses: Record<number, 'pending' | 'loading' | 'success' | 'error'> = {};
    extractedQuestions.forEach((_, idx) => {
      statuses[idx] = 'pending';
    });
    setDiagnosing(statuses);
    setError(null);
    setParsedData(null);

    const results: ErrorQuestion[] = new Array(extractedQuestions.length);

    // 受控并发执行任务池定义
    const tasks = extractedQuestions.map((item, idx) => async () => {
      setDiagnosing(prev => ({ ...prev, [idx]: 'loading' }));
      try {
        const token = localStorage.getItem('errorbook_token');
        const res = await fetch('/api/diagnose', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            ...item,
            thinkingMode: 'disabled'
          })
        });

        if (res.status === 401) {
          localStorage.removeItem('errorbook_token');
          localStorage.removeItem('errorbook_username');
          window.location.reload();
          throw new Error('登录已过期，请重新登录');
        }

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `题目 #${idx + 1} 诊断失败`);

        results[idx] = {
          id: crypto.randomUUID ? crypto.randomUUID() : (Date.now() + Math.random()).toString(),
          imageUrl: imageStr || undefined,
          originalText: item.originalText,
          subject: item.subject,
          knowledgePoints: data.knowledgePoints || [],
          errorReason: '概念不清',
          solution: data.solution || '',
          createdAt: Date.now(),
          studentAnswer: item.studentAnswer,
          errorDiagnosis: data.errorDiagnosis || [],
          notebookId: selectedNotebook || undefined,
          score: data.score !== undefined ? data.score : undefined
        };
        setDiagnosing(prev => ({ ...prev, [idx]: 'success' }));
      } catch (err: any) {
        console.error(err);
        results[idx] = {
          id: crypto.randomUUID ? crypto.randomUUID() : (Date.now() + Math.random()).toString(),
          imageUrl: imageStr || undefined,
          originalText: item.originalText,
          subject: item.subject,
          knowledgePoints: ['待补充'],
          errorReason: '其他',
          solution: 'AI 诊断请求失败，您可以手动编辑保存该题',
          createdAt: Date.now(),
          studentAnswer: item.studentAnswer,
          errorDiagnosis: [],
          notebookId: selectedNotebook || undefined,
          score: 0
        };
        setDiagnosing(prev => ({ ...prev, [idx]: 'error' }));
      }
    });

    // 限制最大并发数为 3 的并发控制器
    const limitConcurrency = async (fns: (() => Promise<any>)[], limit: number) => {
      const executing: Promise<any>[] = [];
      for (const fn of fns) {
        const p = Promise.resolve().then(() => fn());
        executing.push(p);
        if (executing.length >= limit) {
          await Promise.race(executing);
        }
        p.then(() => executing.splice(executing.indexOf(p), 1));
      }
      await Promise.all(executing);
    };

    await limitConcurrency(tasks, 3);

    setParsedData(results);
    setSelectedIndexes(new Set(results.map((_, i) => i)));

    const reasons: Record<number, string> = {};
    const expanded: Record<number, boolean> = {};
    results.forEach((_, i) => {
      reasons[i] = '概念不清';
      expanded[i] = i === 0; // Expand first by default
    });
    setErrorReasons(reasons);
    setExpandedSolutions(expanded);
  };

  // Checkbox functions in Stage 3
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

  // Final Stage: Save selected questions
  const handleSave = async () => {
    if (!parsedData || parsedData.length === 0) return;
    if (selectedIndexes.size === 0) {
      alert('请选择至少一道题目进行保存归档！');
      return;
    }

    // 过滤掉未勾选，以及虽然勾选了但是归类原因为“不纳入归档”的题目
    const selectedQuestions = parsedData.filter((_, idx) => {
      const isChecked = selectedIndexes.has(idx);
      const reason = errorReasons[idx] || '概念不清';
      return isChecked && reason !== '不纳入归档';
    });

    try {
      if (selectedQuestions.length > 0) {
        // 合并所有选中的题目信息为一条整卷错题记录
        const mergedOriginalText = selectedQuestions.map((q, idx) => {
          const text = q.originalText.trim();
          const hasNumberPrefix = /^(?:[0-9一二三四五六七八九十]+[.\u3001、\uFF0E\-\s_]|第[0-9一二三四五六七八九十]+[题问小题步]|\([0-9一二三四五六七八九十]+\)|（[0-9一二三四五六七八九十]+）)/.test(text);
          return hasNumberPrefix ? text : `${idx + 1}. ${text}`;
        }).join('\n\n');
        const mergedStudentAnswer = selectedQuestions.map((q, idx) => {
          if (!q.studentAnswer) return '';
          return `### 第${idx + 1}题学生作答\n${q.studentAnswer.trim()}`;
        }).filter(Boolean).join('\n\n');
        const mergedSolution = selectedQuestions.map((q, idx) => `### 第${idx + 1}题解析\n${q.solution.trim()}`).join('\n\n');
        const mergedStandardAnswer = selectedQuestions.map((q, idx) => {
          if (!q.standardAnswer) return '';
          return `### 第${idx + 1}题标准答案\n${q.standardAnswer.trim()}`;
        }).filter(Boolean).join('\n\n');
        const mergedKp: string[] = Array.from(new Set(selectedQuestions.flatMap(q => (q.knowledgePoints || []) as string[])));
        const mergedErrorReason = Array.from(new Set(selectedQuestions.map(q => {
          const itemIdx = parsedData.indexOf(q);
          return errorReasons[itemIdx] || '概念不清';
        }))).join(', ');

        const mergedDiagnosis: any[] = [];
        let stepCount = 1;
        selectedQuestions.forEach((q, qIdx) => {
          if (q.errorDiagnosis && q.errorDiagnosis.length > 0) {
            q.errorDiagnosis.forEach((step) => {
              mergedDiagnosis.push({
                stepNumber: stepCount++,
                stepContent: `(第${qIdx + 1}题) ${step.stepContent}`,
                status: step.status,
                comment: step.comment || ''
              });
            });
          }
        });

        const scores = selectedQuestions.map(q => q.score).filter(s => s !== undefined) as number[];
        const mergedScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : undefined;

        const mergedQuestion: ErrorQuestion = {
          id: crypto.randomUUID ? crypto.randomUUID() : (Date.now() + Math.random()).toString(),
          imageUrl: imageStr || undefined,
          originalText: mergedOriginalText,
          subject: selectedQuestions[0].subject || '数学',
          knowledgePoints: mergedKp,
          errorReason: mergedErrorReason,
          solution: mergedSolution,
          createdAt: Date.now(),
          studentAnswer: mergedStudentAnswer,
          errorDiagnosis: mergedDiagnosis,
          notebookId: selectedNotebook || undefined,
          score: mergedScore,
          status: 'pending' // 初始状态为待审核
        };

        await db.saveQuestion(mergedQuestion);
        alert('已成功归档保存为 1 条整卷错题记录！');
      } else {
        alert('选中的题目均标记为“不纳入归档”，未写入错题本。');
      }

      onNavigate('library');
    } catch (err: any) {
      setError(err.message || '保存错题失败，请重试');
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-3xl mx-auto pb-12">

      {/* Step Indicator */}
      <div className="flex items-center justify-between mb-8 max-w-md mx-auto">
        <div className="flex flex-col items-center">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition-colors duration-300 ${step >= 1 ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'
            }`}>1</div>
          <span className="text-[10px] mt-1.5 font-extrabold text-slate-500">上传与旋转</span>
        </div>
        <div className={`flex-1 h-0.5 mx-3 transition-colors duration-500 ${step >= 2 ? 'bg-blue-600' : 'bg-slate-100'}`} />
        <div className="flex flex-col items-center">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition-colors duration-300 ${step >= 2 ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'
            }`}>2</div>
          <span className="text-[10px] mt-1.5 font-extrabold text-slate-500">内容校对</span>
        </div>
        <div className={`flex-1 h-0.5 mx-3 transition-colors duration-500 ${step >= 3 ? 'bg-blue-600' : 'bg-slate-100'}`} />
        <div className="flex flex-col items-center">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition-colors duration-300 ${step >= 3 ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'
            }`}>3</div>
          <span className="text-[10px] mt-1.5 font-extrabold text-slate-500">名师诊断</span>
        </div>
      </div>

      <div className="flex flex-col gap-1 mb-2">
        <h2 className="text-2xl font-black text-slate-950 tracking-tight">
          {step === 1 && '录入新错题'}
          {step === 2 && '校对题目文本'}
          {step === 3 && 'AI 智能诊断批改'}
        </h2>
        <p className="text-sm text-slate-500">
          {step === 1 && '上传错题图片，可自由旋转校正，使用 AI 切题识别'}
          {step === 2 && '校对提取出的题干及作答文本，可手动增删修改，确保后续诊断精准'}
          {step === 3 && 'AI 名师正在为您对每一道题进行核心考点梳理、标准解析与答题诊断'}
        </p>
      </div>

      {error && (
        <div className="bg-rose-50 text-rose-600 p-4 rounded-2xl flex gap-3 text-sm border border-rose-100">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <p className="font-semibold">{error}</p>
        </div>
      )}

      {/* STEP 1: Upload & Rotate */}
      {step === 1 && (
        <>
          {/* 错题属性与关联设置 */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4 mb-6">
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <span>📓</span> 归属错题本与诊断设置
            </h3>
            
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">选择错题本</label>
              <div className="flex gap-2 items-center">
                <select
                  value={selectedNotebook}
                  onChange={e => setSelectedNotebook(e.target.value)}
                  className="flex-1 p-3 bg-slate-50/50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs font-bold text-slate-700"
                >
                  <option value="">-- 请选择归属错题本 (选填，留空归入未分类) --</option>
                  {notebooks.map(nb => (
                    <option key={nb.id} value={nb.id}>{nb.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleCreateNotebook}
                  className="px-4 py-3 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-600 rounded-xl text-xs font-black transition-all flex items-center gap-1 shrink-0 cursor-pointer"
                >
                  <span>+ 新建错题本</span>
                </button>
              </div>
            </div>


          </div>

          {!imageStr ? (
            <div className="bg-white border-2 border-dashed border-slate-200 hover:border-blue-400 transition-colors rounded-2xl p-12 flex flex-col items-center justify-center text-center shadow-sm">
              <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-4 shadow-sm shadow-blue-500/10">
                <Camera className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-1">拍照或上传错题图片</h3>
              <p className="text-xs text-slate-500 mb-6 max-w-xs leading-relaxed">精准识别印刷体与手写体，分步骤进行多题自动切题识别</p>

              <input
                type="file"
                accept="image/*"
                className="hidden"
                ref={fileInputRef}
                onChange={handleFileChange}
              />

              <button
                onClick={() => fileInputRef.current?.click()}
                className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-blue-700 transition shadow-lg shadow-blue-600/10"
              >
                <Upload className="w-4 h-4" /> 选择本地图片
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-white p-3 rounded-2xl border border-slate-200 overflow-hidden relative shadow-sm flex flex-col items-center">
                <img src={imageStr} alt="Uploaded" className="w-full max-h-96 object-contain rounded-xl" />

                <div className="flex gap-2 mt-3 w-full justify-between px-1">
                  <button
                    onClick={handleRotate}
                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5"
                    title="顺时针旋转90°"
                  >
                    <RotateCw className="w-3.5 h-3.5" /> 顺时针旋转 90°
                  </button>
                  <button
                    onClick={() => { setImageStr(null); setExtractedQuestions(null); }}
                    className="bg-rose-50 hover:bg-rose-100 text-rose-600 px-4 py-2.5 rounded-xl text-xs font-bold transition"
                  >
                    重新上传
                  </button>
                </div>
              </div>

              {!analyzing ? (
                <button
                  onClick={extractQuestions}
                  className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 hover:bg-blue-700 transition"
                >
                  <Sparkles className="w-5 h-5" /> 开始 AI 切题提取文本
                </button>
              ) : (
                <div className="bg-white p-8 rounded-2xl border border-slate-150 flex flex-col items-center justify-center space-y-4 shadow-sm">
                  <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                  <p className="text-slate-700 font-semibold tracking-wide animate-pulse">AI 正在精准分析图片并提取题干与手写答题内容...</p>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* STEP 2: Review and Edit Extracted Texts */}
      {step === 2 && extractedQuestions && (
        <div className="space-y-6">
          <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl text-xs font-bold text-amber-800 flex items-center justify-between shadow-sm">
            <span>🔍 请仔细核对提取出来的题干和学生作答，修正文字及公式错漏。</span>
            <span className="text-[10px] text-slate-400">支持直接编辑</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: Original Image Preview */}
            <div className="lg:col-span-5 lg:sticky lg:top-6 space-y-4">
              <div className="bg-white border border-slate-200 rounded-3xl p-4 shadow-sm">
                <div className="flex justify-between items-center mb-3 pb-2 border-b border-slate-100">
                  <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                    原始试卷图片对照
                  </span>
                  <span className="text-[10px] text-blue-600 font-bold bg-blue-50 px-2.5 py-0.5 rounded-full">
                    对照预览
                  </span>
                </div>
                {imageStr && (
                  <div className="overflow-auto max-h-[70vh] rounded-2xl border border-slate-100 flex justify-center bg-slate-50 relative group">
                    <img
                      src={imageStr}
                      alt="Uploaded Original"
                      className="w-full h-auto object-contain max-h-none transition-transform duration-200"
                    />
                    <button
                      onClick={() => setIsZoomed(true)}
                      className="absolute bottom-3 right-3 bg-slate-900/80 hover:bg-slate-900 text-white p-2.5 rounded-full transition shadow-md flex items-center gap-1 text-[10px] font-bold select-none cursor-pointer"
                    >
                      <span>🔍 放大对照图片</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Editable Question Cards */}
            <div className="lg:col-span-7 space-y-6">
              {extractedQuestions.map((eq, idx) => (
                <div key={idx} className="bg-white border border-slate-200 rounded-3xl p-6 space-y-4 shadow-sm relative">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <span className="text-sm font-black text-slate-900 font-sans">题目卡片 #{idx + 1}</span>

                    <div className="flex items-center gap-3">
                      <select
                        value={eq.subject}
                        onChange={e => handleUpdateExtracted(idx, 'subject', e.target.value)}
                        className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none"
                      >
                        <option value="数学">数学</option>
                        <option value="物理">物理</option>
                        <option value="化学">化学</option>
                        <option value="英语">英语</option>
                        <option value="语文">语文</option>
                        <option value="其他">其他</option>
                      </select>

                      <button
                        onClick={() => handleDeleteQuestion(idx)}
                        className="text-rose-500 hover:text-rose-700 p-1.5 rounded-lg hover:bg-rose-50 transition"
                        title="删除此题"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Original Question Textarea */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500">题干内容 (印刷体文本，公式使用 $ 符号包围)：</label>

                    {/* LaTeX Preview */}
                    {eq.originalText && (
                      <div className="w-full p-3 bg-blue-50 border border-blue-100 rounded-xl text-sm leading-relaxed text-slate-700">
                        <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wide block mb-1">渲染预览</span>
                        <FormattedMath text={eq.originalText} />
                      </div>
                    )}

                    <textarea
                      rows={4}
                      value={eq.originalText}
                      onChange={e => handleUpdateExtracted(idx, 'originalText', e.target.value)}
                      className="w-full p-4 bg-slate-50/50 border border-slate-200 rounded-2xl text-xs font-semibold leading-relaxed focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-y font-mono"
                      placeholder="输入本题的题干内容..."
                    />
                  </div>

                  {/* Student Answer Textarea */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500">学生作答内容 (手写提取文本，留空则无需步骤批改)：</label>

                    {/* LaTeX 实时公式预览 */}
                    {eq.studentAnswer && (
                      <div className="w-full p-3 bg-rose-50/30 border border-rose-100/50 rounded-xl text-sm leading-relaxed text-slate-700">
                        <span className="text-[10px] font-bold text-rose-450 uppercase tracking-wide block mb-1">学生作答实时渲染预览</span>
                        <FormattedMath text={eq.studentAnswer} />
                      </div>
                    )}

                    <textarea
                      rows={3}
                      value={eq.studentAnswer}
                      onChange={e => handleUpdateExtracted(idx, 'studentAnswer', e.target.value)}
                      className="w-full p-4 bg-slate-50/50 border border-slate-200 rounded-2xl text-xs font-semibold leading-relaxed focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-y"
                      placeholder="如：解：第1步...（若学生未作答可置空）"
                    />
                  </div>
                </div>
              ))}

              <div className="flex gap-4">
                <button
                  onClick={handleAddQuestion}
                  className="flex-1 bg-white hover:bg-slate-50 text-slate-700 py-3.5 border-2 border-dashed border-slate-200 rounded-2xl font-bold text-xs flex items-center justify-center gap-1.5 transition"
                >
                  <Plus className="w-4 h-4" /> 添加一道题目
                </button>
              </div>
            </div>
          </div>

          <div className="flex gap-4 pt-4">
            <button
              onClick={() => setStep(1)}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-6 py-4.5 rounded-2xl font-bold text-sm flex items-center gap-1.5 transition"
            >
              <ChevronLeft className="w-4 h-4" /> 返回重选
            </button>

            <button
              onClick={diagnoseAll}
              className="flex-1 bg-blue-600 text-white py-4.5 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-600/10 hover:bg-blue-700 transition text-sm"
            >
              <Check className="w-4 h-4" /> 确认文本无误，开始智能诊断
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Diagnose Progress & Results */}
      {step === 3 && (
        <div className="space-y-6">
          {/* Progress List */}
          {!parsedData && (
            <div className="bg-white p-8 rounded-3xl border border-slate-200 space-y-4 shadow-sm">
              <h3 className="text-sm font-black text-slate-900 mb-3">AI 诊断进度详情</h3>
              <div className="space-y-3">
                {extractedQuestions?.map((item, idx) => {
                  const status = diagnosing[idx] || 'pending';
                  return (
                    <div key={idx} className="flex items-center justify-between p-3.5 bg-slate-50 rounded-2xl text-xs border border-slate-150">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-700">题目 #{idx + 1}</span>
                        <span className="text-[10px] text-slate-400 max-w-[200px] truncate">({item.originalText})</span>
                      </div>

                      <div className="flex items-center gap-1.5 font-bold">
                        {status === 'pending' && (
                          <span className="text-slate-400">等待诊断...</span>
                        )}
                        {status === 'loading' && (
                          <>
                            <Loader2 className="w-3.5 h-3.5 text-blue-600 animate-spin" />
                            <span className="text-blue-600">正在分析诊断...</span>
                          </>
                        )}
                        {status === 'success' && (
                          <span className="text-emerald-600">诊断完成 ✅</span>
                        )}
                        {status === 'error' && (
                          <span className="text-rose-600">诊断出错 ❌</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Results Render */}
          {parsedData && (
            <div className="space-y-6">
              <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-2xl flex items-center justify-between shadow-sm">
                <span className="text-xs font-bold text-emerald-950">
                  🎉 所有题目诊断分析完成！共有 {parsedData.length} 道错题记录。
                </span>
                <span className="text-[10px] text-slate-400 font-bold">
                  勾选需要保存的题目并分类归档即可。
                </span>
              </div>

              {parsedData.map((q, idx) => {
                const isSelected = selectedIndexes.has(idx);
                const isExcluded = errorReasons[idx] === '不纳入归档';
                return (
                  <div
                    key={idx}
                    className={`bg-white rounded-3xl border p-6 md:p-8 space-y-6 shadow-sm transition-all duration-300 ${isExcluded
                        ? 'border-slate-150 bg-slate-50/40 opacity-50'
                        : isSelected ? 'border-slate-200' : 'border-slate-100 opacity-60'
                      }`}
                  >
                    <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isSelected && !isExcluded}
                          disabled={isExcluded}
                          onChange={() => toggleSelectedIndex(idx)}
                          className="w-5 h-5 text-blue-600 bg-slate-50 border-slate-300 rounded focus:ring-blue-500 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        />
                        <span className="text-sm font-black text-slate-900 flex items-center gap-2">
                          题目 #{idx + 1}
                          {isExcluded && (
                            <span className="text-[10px] bg-rose-50 text-rose-600 px-2 py-0.5 rounded-lg border border-rose-100 font-bold">不纳入归档</span>
                          )}
                          {q.score !== undefined && !isExcluded && (
                            <span className={`text-[10px] px-2.5 py-0.5 rounded-lg border font-black ${q.score >= 90
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                : q.score >= 60
                                  ? 'bg-blue-50 text-blue-700 border-blue-100'
                                  : 'bg-rose-50 text-rose-700 border-rose-100'
                              }`}>
                              AI 评卷得分: {q.score}分
                            </span>
                          )}
                        </span>
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
                        <option value="不纳入归档">不纳入归档 (学生完全做对 / 无需录入)</option>
                      </select>
                    </div>
                  </div>
                );
              })}

              <div className="flex gap-4 pt-4">
                <button
                  onClick={() => setStep(2)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-6 py-4.5 rounded-2xl font-bold text-sm flex items-center gap-1.5 transition"
                >
                  <ChevronLeft className="w-4 h-4" /> 重新编辑文本
                </button>

                <button
                  onClick={handleSave}
                  className="flex-1 bg-slate-900 hover:bg-slate-955 text-white py-4.5 rounded-2xl font-bold transition shadow-lg shadow-slate-900/10 text-sm"
                >
                  保存并批量归档选中的错题 ({selectedIndexes.size} 道)
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 原始图片放大平滑缩放与拖拽弹窗 */}
      {isZoomed && (
        <div className="fixed inset-0 bg-slate-950/90 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200 select-none">
          <div className="absolute top-4 right-4 z-50 flex items-center gap-2">
            <button
              onClick={() => setScale(s => Math.min(s + 0.2, 3))}
              className="bg-slate-800 hover:bg-slate-700 text-white w-9 h-9 rounded-xl font-bold flex items-center justify-center transition text-sm cursor-pointer"
            >
              ＋
            </button>
            <button
              onClick={() => setScale(s => Math.max(s - 0.2, 0.5))}
              className="bg-slate-800 hover:bg-slate-700 text-white w-9 h-9 rounded-xl font-bold flex items-center justify-center transition text-sm cursor-pointer"
            >
              －
            </button>
            <button
              onClick={() => { setScale(1); setPosition({ x: 0, y: 0 }); }}
              className="bg-slate-800 hover:bg-slate-700 text-white px-3 h-9 rounded-xl font-bold flex items-center justify-center transition text-xs cursor-pointer"
            >
              重置
            </button>
            <button
              onClick={() => { setIsZoomed(false); setScale(1); setPosition({ x: 0, y: 0 }); }}
              className="bg-rose-600 hover:bg-rose-700 text-white px-4 h-9 rounded-xl font-bold flex items-center justify-center transition text-xs cursor-pointer"
            >
              关闭 (ESC)
            </button>
          </div>

          <div
            className="w-full h-full flex items-center justify-center overflow-hidden cursor-grab active:cursor-grabbing"
            onMouseDown={(e) => {
              setIsDragging(true);
              setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
            }}
            onMouseMove={(e) => {
              if (!isDragging) return;
              setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
            }}
            onMouseUp={() => setIsDragging(false)}
            onMouseLeave={() => setIsDragging(false)}
            onWheel={(e) => {
              const delta = e.deltaY < 0 ? 0.15 : -0.15;
              setScale(s => Math.max(0.5, Math.min(3, s + delta)));
            }}
          >
            <img
              src={imageStr!}
              alt="Zoomed Original"
              draggable="false"
              style={{
                transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                transition: isDragging ? 'none' : 'transform 0.12s ease-out',
                maxHeight: '90vh',
                maxWidth: '90vw',
                objectFit: 'contain'
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
