const fs = require('fs');

let code = fs.readFileSync('src/components/AddQuestion.tsx', 'utf8');

const step2Start = code.indexOf('{/* STEP 2: Review and Edit Extracted Texts */}');
// find the last div before final brace
const lastReturnEnd = code.lastIndexOf('    </div>\n  );\n}');
let actualEnd = lastReturnEnd;
if (lastReturnEnd === -1) {
  actualEnd = code.lastIndexOf('</div>');
  actualEnd = code.lastIndexOf('</div>', actualEnd - 1);
  // Find the exact location of the end wrapper
  const match = code.match(/    <\/div>\s*\);\s*\}\s*$/);
  if (match) {
    actualEnd = match.index;
  }
}

if(step2Start === -1 || actualEnd === -1) {
  console.log('Cannot find UI boundaries', step2Start, actualEnd);
  process.exit(1);
}

const beforeStep2 = code.slice(0, step2Start);
const afterUI = '\n' + code.slice(actualEnd);

const newUI = `
      {/* STEP 2: Unified Streaming & Results UI */}
      {step === 2 && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 w-full">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm relative overflow-hidden">
            {/* 顶层背景修饰 */}
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
                    
                    {/* Status Badge */}
                    <div className="flex items-center justify-between mb-5">
                      <span className="text-xs font-black text-slate-400 bg-slate-100 px-2 py-1 rounded-lg">题目 #{idx + 1}</span>
                      <div className={\`px-3 py-1.5 rounded-xl text-[11px] font-black flex items-center gap-1.5 shadow-sm \${isDone ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : isError ? 'bg-rose-100 text-rose-700' : 'bg-blue-600 text-white'}\`}>
                        {!isDone && !isError && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        {task.message}
                      </div>
                    </div>

                    {/* Image Preview */}
                    <div className="w-full h-[180px] bg-slate-50 border border-slate-100 rounded-2xl mb-4 overflow-hidden relative shadow-inner flex items-center justify-center p-2">
                      <img src={task.originalImage} className="max-w-full max-h-full object-contain rounded-xl" />
                    </div>

                    {/* Progress Bar */}
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

                    {/* Result Preview (if done) */}
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

                        {/* Selection Checkbox */}
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
fs.writeFileSync('src/components/AddQuestion.tsx', code);
console.log('UI updated successfully');
