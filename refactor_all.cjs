const fs = require('fs');

let code = fs.readFileSync('src/components/AddQuestion.tsx', 'utf8');

// 1. Add state variables
code = code.replace(
  'const [expandedSolutions, setExpandedSolutions] = useState<Record<number, boolean>>({});',
  'const [expandedSolutions, setExpandedSolutions] = useState<Record<number, boolean>>({});\n  const [streamTasks, setStreamTasks] = useState<any[]>([]);\n  const [isStreaming, setIsStreaming] = useState(false);'
);

// 2. Replace functions
const eIdx = code.indexOf('const extractQuestions =');
const handleSaveIdx = code.indexOf('const handleSave =');
const beforeE = code.slice(0, eIdx);
const afterSave = code.slice(handleSaveIdx);

const processAllCode = `
  // ========== NEW SSE STREAMING PIPELINE ==========
  const processAllStreamQuestions = async () => {
    let finalImageStr = imageStr;
    let finalMimeType = mimeType;

    setError(null);
    try {
      if (!selectedNotebook) {
        throw new Error('请先选择或新建一个归属错题本！错题本为必选项。');
      }
      if (uploadMode === 'crossPage') {
        if (imageList.length === 0) throw new Error('请至少上传一张图片！');
        const merged = await mergeImages(imageList);
        finalImageStr = merged.url;
        finalMimeType = merged.mimeType;
        setImageStr(merged.url);
        setMimeType(merged.mimeType);
      } else {
        if (!imageStr) throw new Error('请先上传图片！');
        if ((uploadMode === 'multi' || uploadMode === 'single') && boxes.length === 0) {
          throw new Error(\`“\${uploadMode === 'single' ? '单题' : '多题'}录入”模式下必须手动框选要录入的题目区域！请在图片上拖拽鼠标进行框选。\`);
        }
      }

      const token = localStorage.getItem('errorbook_token');
      const hasBoxes = (uploadMode === 'multi' || uploadMode === 'single') && boxes.length > 0;
      let croppedImages: string[] = [];
      if (hasBoxes && imageStr) {
        croppedImages = await cropBoxes(imageStr, boxes, mimeType);
      }

      const imagesToProcess = croppedImages.length > 0 ? croppedImages : [finalImageStr];
      
      const newTasks = imagesToProcess.map((img, idx) => ({
        id: crypto.randomUUID ? crypto.randomUUID() : (Date.now() + Math.random()).toString(),
        originalImage: img,
        phase: 'pending',
        progress: 0,
        message: '等待处理...',
        result: null,
      }));
      
      setStreamTasks(newTasks);
      setStep(2); // Jump to UI Step 2 (Streaming UI)
      setIsStreaming(true);

      const curNotebook = notebooks.find(nb => nb.id === selectedNotebook);
      const grade = curNotebook?.grade;

      // Concurrent processing
      await Promise.all(newTasks.map(async (task, idx) => {
        try {
          const res = await fetch('/api/ai/process-all', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { 'Authorization': \`Bearer \${token}\` } : {})
            },
            body: JSON.stringify({
              imageBase64: task.originalImage,
              mimeType: finalMimeType,
              mode: 'single', 
              notebookId: selectedNotebook || undefined,
              grade: grade || undefined,
              thinkingMode: 'disabled'
            })
          });

          if (!res.ok) throw new Error(\`题目 #\${idx + 1} 请求失败\`);
          if (!res.body) throw new Error('No ReadableStream in response body');

          const reader = res.body.getReader();
          const decoder = new TextDecoder('utf-8');
          let done = false;

          while (!done) {
            const { value, done: readerDone } = await reader.read();
            done = readerDone;
            if (value) {
              const chunk = decoder.decode(value, { stream: !done });
              const events = chunk.split('\\n\\n').filter(Boolean);
              for (const ev of events) {
                if (ev.startsWith('event: ')) {
                  const parts = ev.split('\\n');
                  const eventType = parts[0].replace('event: ', '');
                  const dataStr = parts[1]?.replace('data: ', '');
                  if (dataStr) {
                    try {
                      const data = JSON.parse(dataStr);
                      if (eventType === 'status') {
                        setStreamTasks(prev => {
                          const next = [...prev];
                          const t = next[idx];
                          if (data.phase === 'extract') {
                            t.phase = 'extract';
                            t.message = data.message || (data.status === 'done' ? '提取完成' : '提取中...');
                            t.progress = 30;
                          } else if (data.phase === 'diagnose') {
                            t.phase = 'diagnose';
                            t.message = data.message || (data.status === 'done' ? '诊断完成' : '诊断中...');
                            t.progress = 60;
                          } else if (data.phase === 'similar') {
                            t.phase = 'similar';
                            t.message = data.message || (data.status === 'done' ? '举一反三完成' : '举一反三中...');
                            t.progress = 90;
                          } else if (data.phase === 'complete') {
                            t.phase = 'done';
                            t.message = '处理完成';
                            t.progress = 100;
                            t.result = data.data;
                          }
                          return next;
                        });
                      } else if (eventType === 'error') {
                        setStreamTasks(prev => {
                          const next = [...prev];
                          next[idx].phase = 'error';
                          next[idx].message = data.message || '处理发生错误';
                          return next;
                        });
                      }
                    } catch (e) { }
                  }
                }
              }
            }
          }
        } catch (e) {
          setStreamTasks(prev => {
            const next = [...prev];
            next[idx].phase = 'error';
            next[idx].message = e.message || '发生异常';
            return next;
          });
        }
      }));
      
      setIsStreaming(false);

      // automatically check all successful tasks
      setStreamTasks(prev => {
        const successfulIdxs = prev.map((t, i) => t.phase === 'done' ? i : -1).filter(i => i !== -1);
        setSelectedIndexes(new Set(successfulIdxs));
        return prev;
      });

    } catch (err) {
      setError(err.message);
      alert(err.message);
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
\n\n\n\n`;

code = beforeE + processAllCode + afterSave;
code = code.replace(/onClick=\{extractQuestions\}/g, 'onClick={processAllStreamQuestions}');
code = code.replace(/开始 AI 切题提取文本/g, '一键全自动智能解析');

const newHandleSave = `
  const handleSave = async () => {
    if (streamTasks.length === 0) return;
    if (selectedIndexes.size === 0) {
      alert('请选择至少一道题目进行保存归档！');
      return;
    }

    const selectedTasks = streamTasks.filter((t, idx) => {
      const isChecked = selectedIndexes.has(idx);
      const reason = errorReasons[idx] || '概念不清';
      return isChecked && reason !== '不纳入归档' && t.phase === 'done' && t.result;
    });

    try {
      if (selectedTasks.length > 0) {
        for (let i = 0; i < selectedTasks.length; i++) {
          const t = selectedTasks[i];
          const itemIdx = streamTasks.indexOf(t);
          const reason = errorReasons[itemIdx] || '概念不清';
          const q = t.result;

          const singleQuestion: ErrorQuestion = {
            id: crypto.randomUUID ? crypto.randomUUID() : (Date.now() + Math.random()).toString(),
            imageUrl: t.originalImage || undefined,
            originalText: q.originalText || '原题缺失',
            subject: q.subject || '数学',
            knowledgePoints: q.knowledgePoints || [],
            errorReason: reason,
            solution: q.solution || '',
            createdAt: Date.now() + i,
            studentAnswer: q.studentAnswer || '',
            errorDiagnosis: q.errorDiagnosis || [],
            errorAnalysis: q.errorAnalysis || '',
            notebookId: selectedNotebook || undefined,
            score: q.score,
            status: 'pending',
            masteryStatus: 'not_mastered',
            standardAnswer: q.standardAnswer || undefined,
            variants: q.variants || []
          };

          await db.saveQuestion(singleQuestion);
        }
        alert(\`已成功归档保存 \${selectedTasks.length} 条错题记录！\`);
      } else {
        alert('选中的题目均标记为“不纳入归档”或尚未处理完成，未写入错题本。');
      }

      onNavigate('library', { notebookId: selectedNotebook || 'unclassified' });
    } catch (err) {
      setError(err.message || '保存错题失败，请重试');
    }
  };
`;

code = code.replace(/const handleSave = async \(\) => \{[\s\S]*?onNavigate\('library', \{ notebookId: selectedNotebook \|\| 'unclassified' \}\);\s*\} catch \(err: any\) \{\s*setError\(err\.message \|\| '保存错题失败，请重试'\);\s*\}\s*\};/, newHandleSave);

// Title updates (Fixing the titles)
code = code.replace(
  /{step === 1 && '录入新错题'}\s*{step === 2 && '校对题目文本'}\s*{step === 3 && 'AI 智能诊断批改'}/,
  "{step === 1 && '录入新错题'}\n          {step === 2 && '全自动 AI 流水线运行中...'}"
);

code = code.replace(
  /{step === 1 && '选择拍照录题的模式，上传图片并关联错题本'}\s*{step === 2 && '校对 OCR 提取的题目与作答文字，修正后让 AI 分析更精准'}\s*{step === 3 && 'AI 智能为您进行步骤级诊断批改、分析薄弱考点与输出标准解析'}/,
  "{step === 1 && '选择拍照录题的模式，上传图片并关联错题本'}\n          {step === 2 && 'AI 正在并发执行提取、诊断、变式流水线，请耐心等待...'}"
);

// Remove the 1-2-3 indicator div entirely
code = code.replace(/<div className="hidden flex items-center justify-between mb-8 max-w-md mx-auto">[\s\S]*?<\/div>\n      <\/div>/, '<div className="hidden" />');


// 5. Replace STEP 2 and STEP 3 JSX
const step2Start = code.indexOf('{/* STEP 2: Review and Edit Extracted Texts */}');
let actualEnd = code.lastIndexOf('    </div>\n  );\n}');
if (actualEnd === -1) {
  const match = code.match(/    <\/div>\s*\);\s*\}\s*$/);
  if (match) actualEnd = match.index;
}

if(step2Start !== -1 && actualEnd !== -1) {
  const beforeStep2 = code.slice(0, step2Start);
  const afterUI = '\n' + code.slice(actualEnd);

  const newUI = `
      {/* STEP 2: Unified Streaming & Results UI */}
      {step === 2 && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 w-full">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 bg-blue-50 rounded-full blur-3xl opacity-50 pointer-events-none" />
            
            <div className="flex items-center justify-between mb-8 border-b border-slate-100 pb-4 relative z-10">
              <div>
                <h3 className="text-xl font-black text-slate-800 flex items-center gap-2">
                  <Sparkles className="w-6 h-6 text-blue-500" />
                  智能全自动处理管线
                </h3>
                <p className="text-xs text-slate-500 mt-1.5 font-bold">
                  正在并发执行【单题物理隔离】流水线：题干提取 → 诊断批改 → 举一反三
                </p>
              </div>
              {isStreaming ? (
                <div className="bg-blue-50 text-blue-600 px-5 py-2.5 rounded-2xl text-xs font-black flex items-center gap-2 shadow-sm border border-blue-100">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  并发处理中...
                </div>
              ) : (
                <button
                  onClick={handleSave}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-2xl text-sm font-black shadow-lg shadow-emerald-500/30 transition-all flex items-center gap-2 hover:-translate-y-0.5 cursor-pointer"
                >
                  <Check className="w-5 h-5" /> 确认无误并全部保存入库
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 relative z-10">
              {streamTasks.map((task, idx) => {
                const q = task.result;
                const isDone = task.phase === 'done';
                const isError = task.phase === 'error';
                return (
                  <div key={task.id} className={\`border-2 rounded-3xl p-5 flex flex-col relative overflow-hidden transition-all duration-500 \${isDone ? 'border-emerald-100 bg-emerald-50/10 hover:border-emerald-300' : isError ? 'border-rose-100 bg-rose-50/20' : 'border-blue-300 bg-blue-50/30 shadow-xl shadow-blue-500/10 ring-4 ring-blue-500/5 scale-[1.02]'}\`}>
                    
                    <div className="flex items-center justify-between mb-5">
                      <span className="text-xs font-black text-slate-400 bg-slate-100 px-2 py-1 rounded-lg">题目 #{idx + 1}</span>
                      <div className={\`px-3 py-1.5 rounded-xl text-[11px] font-black flex items-center gap-1.5 shadow-sm \${isDone ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : isError ? 'bg-rose-100 text-rose-700' : 'bg-blue-600 text-white'}\`}>
                        {!isDone && !isError && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        {task.message}
                      </div>
                    </div>

                    <div className="w-full h-[180px] bg-slate-50 border border-slate-100 rounded-2xl mb-4 overflow-hidden relative shadow-inner flex items-center justify-center p-2">
                      <img src={task.originalImage} className="max-w-full max-h-full object-contain rounded-xl" />
                    </div>

                    {!isDone && !isError && (
                      <div className="w-full h-2.5 bg-slate-200/50 rounded-full overflow-hidden mb-2 shadow-inner">
                        <div 
                          className="h-full bg-blue-500 transition-all duration-700 ease-out relative" 
                          style={{ width: \`\${task.progress}%\` }} 
                        >
                          <div className="absolute inset-0 bg-white/20 animate-pulse" />
                        </div>
                      </div>
                    )}

                    {isDone && q && (
                      <div className="flex-1 space-y-4 mt-2 border-t border-slate-100 pt-5">
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[11px] font-black text-slate-400 uppercase tracking-wider">识别题干</label>
                          <div className="text-[13px] font-medium text-slate-700 line-clamp-3 leading-relaxed bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                            <FormattedMath text={q.originalText} />
                          </div>
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[11px] font-black text-slate-400 uppercase tracking-wider">智能诊断</label>
                          <div className="text-[13px] font-bold text-rose-600 line-clamp-2 leading-relaxed bg-rose-50/50 p-2.5 rounded-xl border border-rose-100">
                            <FormattedMath text={q.errorAnalysis || q.solution || q.errorReason} />
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="text-[11px] font-black text-slate-400 uppercase tracking-wider">举一反三</label>
                          <div className="text-[12px] text-blue-600 font-black bg-blue-50 px-2 py-0.5 rounded-md">
                            生成了 {q.variants?.length || 0} 道变式题
                          </div>
                        </div>

                        <div className="mt-4 pt-4 border-t border-slate-100/80 flex items-center justify-between">
                           <label className="flex items-center gap-2.5 cursor-pointer group">
                             <div 
                               onClick={() => toggleSelectedIndex(idx)}
                               className={\`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all \${selectedIndexes.has(idx) ? 'bg-emerald-500 border-emerald-500 shadow-sm shadow-emerald-500/30' : 'bg-white border-slate-300 group-hover:border-slate-400'}\`}>
                               {selectedIndexes.has(idx) && <Check className="w-3.5 h-3.5 text-white" />}
                             </div>
                             <span className="text-xs font-black text-slate-600 group-hover:text-slate-900 transition-colors">
                               纳入错题本归档
                             </span>
                           </label>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
`;
  code = beforeStep2 + newUI + afterUI;
}

fs.writeFileSync('src/components/AddQuestion.tsx', code);
console.log('Script updated successfully in one go!');
