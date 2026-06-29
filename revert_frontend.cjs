const fs = require('fs');

let code = fs.readFileSync('src/components/AddQuestion.tsx', 'utf8');

// Replace the states we don't need anymore, but keep the ones we do
code = code.replace(
  'const [streamTasks, setStreamTasks] = useState<any[]>([]);\n  const [isStreaming, setIsStreaming] = useState(false);',
  ''
);

// Replace processAllStreamQuestions with submitBackgroundTasks
const eIdx = code.indexOf('const processAllStreamQuestions =');
const handleSaveIdx = code.indexOf('const handleSave =');

const beforeE = code.slice(0, eIdx);
const afterSave = code.slice(handleSaveIdx);

// Wait, I also need to find the end of handleSave to remove it completely?
// Actually, in this new flow, we don't need handleSave at all!
// Let's find the end of handleSave.
let actualEndSave = code.indexOf('const toggleSelectedIndex =');
if (actualEndSave === -1) {
    actualEndSave = handleSaveIdx + 2000; // rough fallback
}

const beforeProcess = code.slice(0, eIdx);
// Let's keep toggleSelectedIndex etc just in case they are referenced somewhere else, but remove processAllStreamQuestions and handleSave
const endOfSave = code.indexOf('const toggleSelectedIndex =');

const submitLogic = `
  // ========== ASYNC TASK QUEUE PIPELINE ==========
  const submitBackgroundTasks = async () => {
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

      setAnalyzing(true);
      const token = localStorage.getItem('errorbook_token');
      const hasBoxes = (uploadMode === 'multi' || uploadMode === 'single') && boxes.length > 0;
      let croppedImages: string[] = [];
      if (hasBoxes && imageStr) {
        croppedImages = await cropBoxes(imageStr, boxes, mimeType);
      }

      const imagesToProcess = croppedImages.length > 0 ? croppedImages : [finalImageStr];
      
      const curNotebook = notebooks.find(nb => nb.id === selectedNotebook);
      const grade = curNotebook?.grade;

      // Submit all images as background tasks concurrently
      const promises = imagesToProcess.map(async (imgBase64, index) => {
        const res = await fetch('/api/tasks', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': \`Bearer \${token}\` } : {})
          },
          body: JSON.stringify({
            taskName: \`录题任务 \${new Date().toLocaleString()} - 题目\${index + 1}\`,
            autoRun: 1, // Auto run directly to completion
            uploadMode: 'single', // Force single to trigger strict single-question logic
            notebookId: selectedNotebook || undefined,
            payload: {
              imageBase64: imgBase64,
              mimeType: finalMimeType,
              grade: grade || undefined
            }
          })
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || \`题目 \${index + 1} 提交失败\`);
        }
      });

      await Promise.all(promises);

      alert(\`已成功提交 \${imagesToProcess.length} 道题目到后台解析队列！请在错题本中查看进度。\`);
      
      // Jump to Notebook immediately!
      onNavigate('library', { notebookId: selectedNotebook || 'unclassified' });

    } catch (err: any) {
      setError(err.message);
      alert(err.message);
      setAnalyzing(false);
    }
  };

`;

code = code.replace(code.slice(eIdx, endOfSave), submitLogic);

// Replace button click
code = code.replace(/onClick=\{processAllStreamQuestions\}/g, 'onClick={submitBackgroundTasks}');

// Replace button text back to something reasonable or keep it
code = code.replace(/一键全自动智能解析/g, '提交到后台自动解析');

// REMOVE step 2 UI
const step2Start = code.indexOf('{/* STEP 2: Unified Streaming & Results UI */}');
let step2End = code.lastIndexOf('    </div>\n  );\n}');
if (step2End === -1) {
  const match = code.match(/    <\/div>\s*\);\s*\}\s*$/);
  if (match) step2End = match.index;
}

if (step2Start !== -1 && step2End !== -1) {
  code = code.substring(0, step2Start) + '\\n' + code.substring(step2End);
}

// Remove the titles for step 2
code = code.replace(/{step === 2 && '全自动 AI 流水线运行中\.\.\.'}/g, '');
code = code.replace(/{step === 2 && 'AI 正在并发执行提取、诊断、变式流水线，请耐心等待\.\.\.'}/g, '');

fs.writeFileSync('src/components/AddQuestion.tsx', code);
console.log('Frontend Reverted to Task Queue');
