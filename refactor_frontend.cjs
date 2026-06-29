const fs = require('fs');

let code = fs.readFileSync('src/components/AddQuestion.tsx', 'utf8');

// 1. Add state variables
code = code.replace(
  'const [expandedSolutions, setExpandedSolutions] = useState<Record<number, boolean>>({});',
  'const [expandedSolutions, setExpandedSolutions] = useState<Record<number, boolean>>({});\n  const [streamTasks, setStreamTasks] = useState<any[]>([]);\n  const [isStreaming, setIsStreaming] = useState(false);'
);

// 2. Replace extractQuestions & diagnoseAll & other unneeded functions with processAllStreamQuestions
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

// 3. Update the button onClick to point to processAllStreamQuestions
code = code.replace(/onClick=\{extractQuestions\}/g, 'onClick={processAllStreamQuestions}');
code = code.replace(/开始 AI 切题提取文本/g, '一键全自动智能解析');

// 4. Update the handleSave to use streamTasks
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


// 5. Replace UI titles and step indicators
code = code.replace(
  '{step === 2 && \'校对题目文本\'}\n          {step === 3 && \'AI 智能诊断批改\'}',
  '{step === 2 && \'全自动 AI 流式分析中\'}'
);
code = code.replace(
  '{step === 2 && \'校对 OCR 提取的题目与作答文字，修正后让 AI 分析更精准\'}\n          {step === 3 && \'AI 智能为您进行步骤级诊断批改、分析薄弱考点与输出标准解析\'}',
  '{step === 2 && \'AI 正在为您自动执行提取、诊断、变式管线，请耐心等待\'}'
);

fs.writeFileSync('src/components/AddQuestion.tsx', code);
console.log('Script updated successfully up to state + functions');
