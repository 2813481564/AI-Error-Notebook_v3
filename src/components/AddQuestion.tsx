import React, { useState, useRef, ChangeEvent, useEffect } from 'react';
import { db, ErrorQuestion } from '../lib/db';
import { Upload, Camera, Loader2, Sparkles, AlertCircle, RotateCw, Trash2, Plus, Check, ChevronLeft } from 'lucide-react';
import FormattedMath from './FormattedMath';

// 图片无缝拼接辅助函数
const mergeImages = async (list: { url: string; mimeType: string }[]): Promise<{ url: string; mimeType: string }> => {
  if (list.length === 0) throw new Error("请上传至少一张图片");
  if (list.length === 1) return { url: list[0].url, mimeType: list[0].mimeType };

  const loadImg = (src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  };

  const imgs = await Promise.all(list.map(item => loadImg(item.url)));

  // 计算合并后的 Canvas 宽度（取所有图片的最大宽度）和高度（所有图片高度累加）
  const maxWidth = Math.max(...imgs.map(img => img.width));
  const totalHeight = imgs.reduce((sum, img) => sum + img.height, 0);

  const canvas = document.createElement('canvas');
  canvas.width = maxWidth;
  canvas.height = totalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error("Canvas 2D context not supported");

  // 顺次绘制每张图片
  let currentY = 0;
  imgs.forEach((img) => {
    // 居中绘制
    const destX = (maxWidth - img.width) / 2;
    ctx.drawImage(img, destX, currentY);
    currentY += img.height;
  });

  return {
    url: canvas.toDataURL(list[0].mimeType),
    mimeType: list[0].mimeType
  };
};

// 选框裁剪辅助函数
const cropBoxes = (
  imageStr: string,
  boxes: { x: number; y: number; w: number; h: number }[],
  mimeType: string
): Promise<string[]> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const results: string[] = [];
        boxes.forEach((box) => {
          const canvas = document.createElement('canvas');
          const cropX = (box.x / 100) * img.naturalWidth;
          const cropY = (box.y / 100) * img.naturalHeight;
          const cropW = (box.w / 100) * img.naturalWidth;
          const cropH = (box.h / 100) * img.naturalHeight;

          canvas.width = cropW;
          canvas.height = cropH;
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('Canvas 2D context not supported');

          ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
          results.push(canvas.toDataURL(mimeType));
        });
        resolve(results);
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error('加载原始图片失败，无法进行区域裁剪'));
    img.src = imageStr;
  });
};

export default function AddQuestion({ onNavigate }: { onNavigate: (v: any, params?: any) => void }) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [uploadMode, setUploadMode] = useState<'single' | 'multi' | 'crossPage'>('single');

  // 单图/多题下的单张图片状态
  const [imageStr, setImageStr] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string>('image/jpeg');

  // 跨页多图模式下的图片队列状态
  const [imageList, setImageList] = useState<{ id: string; url: string; mimeType: string }[]>([]);

  // 多题选框裁剪状态
  const [boxes, setBoxes] = useState<{ id: string; x: number; y: number; w: number; h: number }[]>([]);
  const [isDrawingBox, setIsDrawingBox] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [currentPos, setCurrentPos] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // 跨页多图拼接后的提取模式：'multi'（识别出多道题）或 'single'（识别为单道长题）
  const [crossPageExtractMode, setCrossPageExtractMode] = useState<'single' | 'multi'>('multi');

  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 错题本相关状态
  const [notebooks, setNotebooks] = useState<{ id: string; name: string; grade?: string }[]>([]);
  const [selectedNotebook, setSelectedNotebook] = useState<string>('');

  // 后台异步任务选项
  const [enableBgTask, setEnableBgTask] = useState(true);
  const [autoRun, setAutoRun] = useState(true);

  // 原始图片放大查看状态
  const [isZoomed, setIsZoomed] = useState(false);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const multiFileInputRef = useRef<HTMLInputElement>(null);

  // 获取错题本列表
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
      setNotebooks(prev => [...prev, data.notebook || data]);
      setSelectedNotebook(data.notebook?.id || data.id);
    } catch (err: any) {
      alert(err.message || '操作失败');
    }
  };

  // Stage 2 states (extracted questions for review)
  const [extractedQuestions, setExtractedQuestions] = useState<{ subject: string; originalText: string; studentAnswer: string; standardAnswer?: string }[] | null>(null);

  // Stage 3 states (diagnosed results)
  const [diagnosing, setDiagnosing] = useState<Record<number, 'pending' | 'loading' | 'success' | 'error'>>({});
  const [parsedData, setParsedData] = useState<ErrorQuestion[] | null>(null);
  const [selectedIndexes, setSelectedIndexes] = useState<Set<number>>(new Set());
  const [errorReasons, setErrorReasons] = useState<Record<number, string>>({});
  const [expandedSolutions, setExpandedSolutions] = useState<Record<number, boolean>>({});

  // 单图文件上传回调
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

  // 跨页多图文件上传回调
  const handleMultiFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file: any) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const url = event.target?.result as string;
        setImageList(prev => [
          ...prev,
          {
            id: "img_" + Math.random().toString(36).substring(2, 9),
            url,
            mimeType: file.type
          }
        ]);
      };
      reader.readAsDataURL(file);
    });
  };

  // 单图模式下的 90 度旋转
  const handleRotate = () => {
    if (!imageStr) return;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = img.height;
      canvas.height = img.width;

      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((90 * Math.PI) / 180);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);

      const rotatedBase64 = canvas.toDataURL(mimeType);
      setImageStr(rotatedBase64);
      setBoxes([]); // 旋转后清空选框
    };
    img.src = imageStr;
  };

  // 多题框选录入区域鼠标交互处理
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (uploadMode !== 'multi') return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    setIsDrawingBox(true);
    setStartPos({ x, y });
    setCurrentPos({ x, y });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDrawingBox) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    setCurrentPos({
      x: Math.max(0, Math.min(100, x)),
      y: Math.max(0, Math.min(100, y))
    });
  };

  const handleMouseUp = () => {
    if (!isDrawingBox) return;
    setIsDrawingBox(false);

    const x = Math.min(startPos.x, currentPos.x);
    const y = Math.min(startPos.y, currentPos.y);
    const w = Math.abs(currentPos.x - startPos.x);
    const h = Math.abs(currentPos.y - startPos.y);

    if (w > 1.5 && h > 1.5) {
      const newBox = {
        id: 'box_' + Math.random().toString(36).substring(2, 9),
        x,
        y,
        w,
        h
      };
      setBoxes(prev => [...prev, newBox]);
    }
  };

  const handleMouseLeave = () => {
    if (isDrawingBox) {
      handleMouseUp();
    }
  };

  const deleteBox = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setBoxes(prev => prev.filter(b => b.id !== id));
  };

  // 跨页列表中的特定图片 90 度旋转
  const handleRotateInList = (index: number) => {
    const item = imageList[index];
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      canvas.width = img.height;
      canvas.height = img.width;
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((90 * Math.PI) / 180);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      const rotated = canvas.toDataURL(item.mimeType);
      const next = [...imageList];
      next[index] = { ...item, url: rotated };
      setImageList(next);
    };
    img.src = item.url;
  };

  // 调用 AI 提取文本
  const extractQuestions = async () => {
    let finalImageStr = imageStr;
    let finalMimeType = mimeType;

    setAnalyzing(true);
    setError(null);
    try {
      if (uploadMode === 'crossPage') {
        if (imageList.length === 0) {
          throw new Error('请至少上传一张图片！');
        }
        // 合并多图为大长图
        const merged = await mergeImages(imageList);
        finalImageStr = merged.url;
        finalMimeType = merged.mimeType;
        // 保存合并后的图，用于后续显示和归档
        setImageStr(merged.url);
        setMimeType(merged.mimeType);
      } else {
        if (!imageStr) {
          throw new Error('请先上传图片！');
        }
        if (uploadMode === 'multi' && boxes.length === 0) {
          throw new Error('“多题录入”模式下必须手动框选至少一个题目区域！请在下方图片上拖拽鼠标框选题目。');
        }
      }

      const token = localStorage.getItem('errorbook_token');
      const hasBoxes = uploadMode === 'multi' && boxes.length > 0;
      let croppedImages: string[] = [];
      if (hasBoxes && imageStr) {
        croppedImages = await cropBoxes(imageStr, boxes, mimeType);
      }

      if (enableBgTask) {
        // 后台异步任务录题
        const baseTaskName = `错题录入_${new Date().toLocaleDateString().replace(/\//g, '')}_${new Date().toTimeString().slice(0, 5).replace(/:/g, '')}`;

        if (hasBoxes && croppedImages.length > 0) {
          for (let i = 0; i < croppedImages.length; i++) {
            const taskName = `${baseTaskName}_框选分题#${i + 1}`;
            const res = await fetch('/api/tasks', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {})
              },
              body: JSON.stringify({
                taskName,
                autoRun: autoRun ? 1 : 0,
                uploadMode: 'single', // 框选切图后，每一道题对 AI 来说都是单题
                notebookId: selectedNotebook || undefined,
                payload: {
                  imageBase64: croppedImages[i],
                  mimeType: mimeType,
                  extractMode: 'single'
                }
              })
            });
            if (res.status === 401) {
              localStorage.removeItem('errorbook_token');
              localStorage.removeItem('errorbook_username');
              window.location.reload();
              throw new Error('登录已过期，请重新登录');
            }
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || `创建框选分题任务 #${i + 1} 失败`);
          }
          alert(`成功提交了 ${croppedImages.length} 个框选分题录入任务至后台队列进行处理！\n您可以在“后台任务”中追踪执行进度。`);
        } else {
          const extractMode = uploadMode === 'crossPage' ? crossPageExtractMode : (uploadMode === 'multi' ? 'multi' : 'single');
          const res = await fetch('/api/tasks', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            },
            body: JSON.stringify({
              taskName: baseTaskName,
              autoRun: autoRun ? 1 : 0,
              uploadMode,
              notebookId: selectedNotebook || undefined,
              payload: {
                imageBase64: finalImageStr,
                mimeType: finalMimeType,
                extractMode
              }
            })
          });

          if (res.status === 401) {
            localStorage.removeItem('errorbook_token');
            localStorage.removeItem('errorbook_username');
            window.location.reload();
            throw new Error('登录已过期，请重新登录');
          }

          const data = await res.json();
          if (!res.ok) throw new Error(data.error || '创建后台录题任务失败');

          const userRole = localStorage.getItem('errorbook_role') || 'user';
          const isAdmin = userRole === 'admin';
          if (isAdmin) {
            alert(`错题已成功提交后台排队处理！\n您可以在“后台任务”中追踪其执行状态，或者继续在本页面上传其他错题。`);
          } else {
            alert("错题已成功提交，AI 正在后台进行诊断，已为您跳转至错题本。");
          }
        }

        const userRole = localStorage.getItem('errorbook_role') || 'user';
        const isAdmin = userRole === 'admin';

        // 清理当前状态
        setImageStr(null);
        setImageList([]);
        setBoxes([]);
        setExtractedQuestions(null);
        setParsedData(null);
        setStep(1);

        if (!isAdmin) {
          onNavigate('library', { notebookId: selectedNotebook || 'unclassified' });
        }
        return;
      }

      if (hasBoxes && croppedImages.length > 0) {
        const allExtracted: any[] = [];
        for (let i = 0; i < croppedImages.length; i++) {
          const res = await fetch('/api/extract', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            },
            body: JSON.stringify({
              imageBase64: croppedImages[i],
              mimeType: mimeType,
              mode: 'single' // 强制为单题提取模式
            })
          });

          if (res.status === 401) {
            localStorage.removeItem('errorbook_token');
            localStorage.removeItem('errorbook_username');
            window.location.reload();
            throw new Error('登录已过期，请重新登录');
          }

          const data = await res.json();
          if (!res.ok) throw new Error(data.error || `提取第 ${i + 1} 个选区失败`);
          if (Array.isArray(data)) {
            allExtracted.push(...data);
          } else {
            allExtracted.push(data);
          }
        }
        setExtractedQuestions(allExtracted);
        setStep(2);
      } else {
        const res = await fetch('/api/extract', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            imageBase64: finalImageStr,
            mimeType: finalMimeType,
            mode: uploadMode === 'crossPage' ? crossPageExtractMode : (uploadMode === 'multi' ? 'multi' : 'single')
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
      }
    } catch (err: any) {
      setError(err.message);
      alert(err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleUpdateExtracted = (idx: number, field: string, val: string) => {
    if (!extractedQuestions) return;
    const next = [...extractedQuestions];
    next[idx] = { ...next[idx], [field]: val };
    setExtractedQuestions(next);
  };

  const handleAddNewQuestionCard = () => {
    setExtractedQuestions(prev => [
      ...(prev || []),
      { subject: '数学', originalText: '请输入题干内容...', studentAnswer: '' }
    ]);
  };

  const handleDeleteQuestionCard = (idx: number) => {
    if (!extractedQuestions) return;
    const next = extractedQuestions.filter((_, i) => i !== idx);
    setExtractedQuestions(next);
  };

  // 诊断各题
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

    const curNotebook = notebooks.find(nb => nb.id === selectedNotebook);
    const grade = curNotebook?.grade;

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
            grade: grade || undefined,
            notebookId: selectedNotebook || undefined,
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
          errorAnalysis: data.errorAnalysis || '',
          notebookId: selectedNotebook || undefined,
          score: data.score !== undefined ? data.score : undefined,
          masteryStatus: 'not_mastered',
          standardAnswer: item.standardAnswer
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
          errorAnalysis: 'AI 诊断请求失败，暂无错因分析。',
          notebookId: selectedNotebook || undefined,
          score: 0,
          masteryStatus: 'not_mastered',
          standardAnswer: item.standardAnswer
        };
        setDiagnosing(prev => ({ ...prev, [idx]: 'error' }));
      }
    });

    // 并发控制器（并发数限制为 3）
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
      expanded[i] = i === 0;
    });
    setErrorReasons(reasons);
    setExpandedSolutions(expanded);
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

  // 归档保存
  const handleSave = async () => {
    if (!parsedData || parsedData.length === 0) return;
    if (selectedIndexes.size === 0) {
      alert('请选择至少一道题目进行保存归档！');
      return;
    }

    const selectedQuestions = parsedData.filter((_, idx) => {
      const isChecked = selectedIndexes.has(idx);
      const reason = errorReasons[idx] || '概念不清';
      return isChecked && reason !== '不纳入归档';
    });

    try {
      if (selectedQuestions.length > 0) {
        // 循环保存每个勾选的题目为独立的错题记录
        for (let i = 0; i < selectedQuestions.length; i++) {
          const q = selectedQuestions[i];
          const itemIdx = parsedData.indexOf(q);
          const reason = errorReasons[itemIdx] || '概念不清';

          const singleQuestion: ErrorQuestion = {
            id: crypto.randomUUID ? crypto.randomUUID() : (Date.now() + Math.random()).toString(),
            imageUrl: imageStr || undefined,
            originalText: q.originalText,
            subject: q.subject || '数学',
            knowledgePoints: q.knowledgePoints || [],
            errorReason: reason,
            solution: q.solution || '',
            createdAt: Date.now() + i, // 稍微错开时间戳以保证排序相对顺序
            studentAnswer: q.studentAnswer || '',
            errorDiagnosis: q.errorDiagnosis || [],
            errorAnalysis: q.errorAnalysis || '',
            notebookId: selectedNotebook || undefined,
            score: q.score,
            status: 'pending',
            masteryStatus: 'not_mastered',
            standardAnswer: q.standardAnswer || undefined
          };

          await db.saveQuestion(singleQuestion);
        }
        alert(`已成功归档保存为 ${selectedQuestions.length} 条独立的错题记录！`);
      } else {
        alert('选中的题目均标记为“不纳入归档”，未写入错题本。');
      }

      onNavigate('library', { notebookId: selectedNotebook || 'unclassified' });
    } catch (err: any) {
      setError(err.message || '保存错题失败，请重试');
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-3xl mx-auto pb-12">

      {/* Step Indicator */}
      <div className="flex items-center justify-between mb-8 max-w-md mx-auto">
        <div className="flex flex-col items-center">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition-colors duration-300 ${step >= 1 ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>1</div>
          <span className="text-[10px] mt-1.5 font-extrabold text-slate-555">上传与设置</span>
        </div>
        <div className={`flex-1 h-0.5 mx-3 transition-colors duration-500 ${step >= 2 ? 'bg-blue-600' : 'bg-slate-100'}`} />
        <div className="flex flex-col items-center">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition-colors duration-300 ${step >= 2 ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>2</div>
          <span className="text-[10px] mt-1.5 font-extrabold text-slate-555">内容校对</span>
        </div>
        <div className={`flex-1 h-0.5 mx-3 transition-colors duration-500 ${step >= 3 ? 'bg-blue-600' : 'bg-slate-100'}`} />
        <div className="flex flex-col items-center">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition-colors duration-300 ${step >= 3 ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>3</div>
          <span className="text-[10px] mt-1.5 font-extrabold text-slate-555">智能诊断</span>
        </div>
      </div>

      <div className="flex flex-col gap-1 mb-2">
        <h2 className="text-2xl font-black text-slate-950 tracking-tight font-sans">
          {step === 1 && '录入新错题'}
          {step === 2 && '校对题目文本'}
          {step === 3 && 'AI 智能诊断批改'}
        </h2>
        <p className="text-sm text-slate-500 font-medium">
          {step === 1 && '选择拍照录题的模式，上传图片并关联错题本'}
          {step === 2 && '校对 OCR 提取的题目与作答文字，修正后让 AI 分析更精准'}
          {step === 3 && 'AI 智能为您进行步骤级诊断批改、分析薄弱考点与输出标准解析'}
        </p>
      </div>

      {error && (
        <div className="bg-rose-50 text-rose-600 p-4 rounded-2xl flex gap-3 text-sm border border-rose-100 font-semibold shadow-sm">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* STEP 1: Upload & Mode Select */}
      {step === 1 && (
        <>
          {/* 关联错题本 */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4 mb-5">
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <span>📓</span> 错题本归属设置
            </h3>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block pl-0.5">选择错题本</label>
              <div className="flex gap-2 items-center">
                <select
                  value={selectedNotebook}
                  onChange={e => setSelectedNotebook(e.target.value)}
                  className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs font-bold text-slate-700"
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

          {/* 后台异步任务选项卡 (已默认开启并隐藏) */}
          {false && (
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4 mb-5">
              <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <span>⚙️</span> 后台录题设置
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 异步排队开关 */}
                <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200/60 rounded-2xl">
                  <div>
                    <h4 className="text-xs font-bold text-slate-800">开启后台任务排队</h4>
                    <p className="text-[10px] text-slate-400 mt-0.5">上传图片后立即返回，由后台静默提取与诊断</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEnableBgTask(!enableBgTask)}
                    className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer outline-none ${enableBgTask ? 'bg-blue-600' : 'bg-slate-300'
                      }`}
                  >
                    <span
                      className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${enableBgTask ? 'transform translate-x-6' : ''
                        }`}
                    />
                  </button>
                </div>

                {/* 审核模式开关，仅当开启后台任务时可见 */}
                <div className={`flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200/60 rounded-2xl transition-all duration-300 ${enableBgTask ? 'opacity-100 pointer-events-auto' : 'opacity-40 pointer-events-none'
                  }`}>
                  <div>
                    <h4 className="text-xs font-bold text-slate-800">全自动归档 (免审核)</h4>
                    <p className="text-[10px] text-slate-400 mt-0.5">跳过所有人工核对，AI 识别诊断完毕后自动入库</p>
                  </div>
                  <button
                    type="button"
                    disabled={!enableBgTask}
                    onClick={() => setAutoRun(!autoRun)}
                    className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer outline-none ${autoRun ? 'bg-emerald-600' : 'bg-slate-300'
                      }`}
                  >
                    <span
                      className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${autoRun ? 'transform translate-x-6' : ''
                        }`}
                    />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Mode Selector Tab */}
          <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm mb-5 space-y-3">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block pl-0.5">选择录题模式</label>
            <div className="grid grid-cols-2 gap-2 bg-slate-50 p-1.5 rounded-2xl border border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setUploadMode('single');
                  setImageStr(null);
                  setImageList([]);
                }}
                className={`py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${uploadMode === 'single'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/10'
                  : 'text-slate-555 hover:text-slate-800'
                  }`}
              >
                <span>单题录入</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setUploadMode('multi');
                  setImageStr(null);
                  setImageList([]);
                }}
                className={`py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${uploadMode === 'multi'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/10'
                  : 'text-slate-555 hover:text-slate-800'
                  }`}
              >
                <span>多题录入</span>
              </button>
              {/* 暂且隐藏跨页合并录入按钮 */}
              {/* <button
                type="button"
                onClick={() => {
                  setUploadMode('crossPage');
                  setImageStr(null);
                  setImageList([]);
                }}
                className={`py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${uploadMode === 'crossPage'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/10'
                    : 'text-slate-555 hover:text-slate-800'
                  }`}
              >
                <span>跨页合并录入</span>
              </button> */}
            </div>

            <p className="text-[10px] text-slate-400 pl-0.5 leading-relaxed">
              {uploadMode === 'single' && '💡 适用于单张图片中只有 1 道错题的场景，AI 将以单题最高精度和聚焦深度提取题干与公式。'}
              {uploadMode === 'multi' && '💡 适用于单张图片中包含多道不同独立错题，您需要手动在图片上框选出各道题的范围，系统会分别裁剪并执行并行智能诊断。'}
              {uploadMode === 'crossPage' && '💡 适用于试卷折叠、错题过长跨越两面等，上传多张图后前端将在 Canvas 中顺次无缝拼接后再做提取。'}
            </p>
          </div>

          {/* Upload Area for Single/Multi Mode */}
          {uploadMode !== 'crossPage' && (
            <>
              {!imageStr ? (
                <div className="bg-white border-2 border-dashed border-slate-200 hover:border-blue-400 transition-colors rounded-3xl p-12 flex flex-col items-center justify-center text-center shadow-sm">
                  <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-4 shadow-sm shadow-blue-500/10">
                    <Camera className="w-8 h-8" />
                  </div>
                  <h3 className="text-base font-bold text-slate-900 mb-1">上传试卷/错题单张图片</h3>
                  <p className="text-xs text-slate-500 mb-6 max-w-xs leading-relaxed">
                    支持识别各类印刷公式、中英文题干以及学生手写作答内容
                  </p>

                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                  />

                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold text-xs flex items-center gap-2 hover:bg-blue-700 transition shadow-lg shadow-blue-600/10 cursor-pointer"
                  >
                    <Upload className="w-4 h-4" /> 选择本地图片
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-white p-4 rounded-3xl border border-slate-200 overflow-hidden relative shadow-sm flex flex-col items-center w-full">
                    {uploadMode === 'multi' && (
                      <div className="text-sm text-blue-800 bg-blue-50 border border-blue-200 px-4 py-3 rounded-2xl mb-4 w-full text-center font-black animate-pulse shadow-sm">
                        🚨 必须框选：多题模式下，请在下方图片上按住鼠标左键拖拽框选出每一道题。框选完成后再点击下方按钮提取。
                      </div>
                    )}

                    <div
                      ref={containerRef}
                      className={`relative inline-block select-none border border-slate-100 rounded-2xl overflow-hidden bg-slate-50 max-w-full ${uploadMode === 'multi' ? 'cursor-crosshair' : ''
                        }`}
                      onMouseDown={handleMouseDown}
                      onMouseMove={handleMouseMove}
                      onMouseUp={handleMouseUp}
                      onMouseLeave={handleMouseLeave}
                    >
                      <img
                        src={imageStr}
                        alt="Uploaded"
                        className="max-w-full h-auto max-h-[60vh] block pointer-events-none select-none"
                      />

                      {/* 渲染现有选区 */}
                      {uploadMode === 'multi' && boxes.map((box, index) => (
                        <div
                          key={box.id}
                          className="absolute border-2 border-rose-500 bg-rose-500/10 group flex items-center justify-center transition-colors hover:bg-rose-500/20"
                          style={{
                            left: `${box.x}%`,
                            top: `${box.y}%`,
                            width: `${box.w}%`,
                            height: `${box.h}%`,
                          }}
                        >
                          <span className="absolute top-1 left-1 bg-rose-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded shadow">
                            题目 {index + 1}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => deleteBox(box.id, e)}
                            className="absolute -top-2 -right-2 w-5 h-5 bg-rose-700 hover:bg-rose-800 text-white text-[9px] font-black rounded-full flex items-center justify-center shadow transition-transform group-hover:scale-110 cursor-pointer border border-white"
                            title="删除此选区"
                          >
                            ✕
                          </button>
                        </div>
                      ))}

                      {/* 绘制中的临时选区 */}
                      {uploadMode === 'multi' && isDrawingBox && (
                        <div
                          className="absolute border-2 border-dashed border-blue-500 bg-blue-500/15 pointer-events-none"
                          style={{
                            left: `${Math.min(startPos.x, currentPos.x)}%`,
                            top: `${Math.min(startPos.y, currentPos.y)}%`,
                            width: `${Math.abs(currentPos.x - startPos.x)}%`,
                            height: `${Math.abs(currentPos.y - startPos.y)}%`,
                          }}
                        />
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2 mt-4 w-full justify-between px-1">
                      <button
                        onClick={handleRotate}
                        className="flex-1 min-w-[120px] bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                        title="顺时针旋转90°"
                      >
                        <RotateCw className="w-3.5 h-3.5" /> 顺时针旋转 90°
                      </button>
                      {uploadMode === 'multi' && boxes.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setBoxes([])}
                          className="bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-700 px-4 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer"
                        >
                          清空选框 ({boxes.length})
                        </button>
                      )}
                      <button
                        onClick={() => { setImageStr(null); setExtractedQuestions(null); setBoxes([]); }}
                        className="bg-rose-50 hover:bg-rose-100 text-rose-600 px-5 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer"
                      >
                        重新上传
                      </button>
                    </div>
                  </div>

                  {!analyzing ? (
                    <button
                      onClick={extractQuestions}
                      className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 hover:bg-blue-700 transition text-sm cursor-pointer"
                    >
                      <Sparkles className="w-4.5 h-4.5" /> {enableBgTask ? "提交至后台排队提取" : "开始 AI 切题提取文本"}
                    </button>
                  ) : (
                    <div className="bg-white p-8 rounded-3xl border border-slate-150 flex flex-col items-center justify-center space-y-4 shadow-sm">
                      <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                      <p className="text-slate-750 font-bold tracking-wide animate-pulse text-xs">AI 正在分析图片并提取题干与作答步骤中，请稍候...</p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Upload Area for Cross Page Mode */}
          {uploadMode === 'crossPage' && (
            <div className="space-y-4">
              <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4">
                <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                  <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <span>🖼️</span> 跨页多图拼接队列 ({imageList.length}张)
                  </h3>
                  <span className="text-[10px] text-blue-600 bg-blue-50 px-2 py-0.5 rounded font-bold">按顺序由上到下拼接</span>
                </div>

                {imageList.length === 0 ? (
                  <div
                    onClick={() => multiFileInputRef.current?.click()}
                    className="border-2 border-dashed border-slate-200 hover:border-blue-400 transition-colors rounded-3xl p-12 flex flex-col items-center justify-center text-center cursor-pointer bg-slate-50/20 shadow-sm"
                  >
                    <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-4">
                      <Plus className="w-6 h-6" />
                    </div>
                    <span className="text-sm font-bold text-slate-700">选择要拼接的跨页错题多图</span>
                    <span className="text-[11px] text-slate-400 mt-1.5 max-w-xs leading-relaxed">
                      支持一次框选上传多张。上传后可以进行上移/下移排序、旋转校正以及删除。
                    </span>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {imageList.map((item, index) => (
                      <div key={item.id} className="bg-slate-50/50 border border-slate-200 rounded-2xl p-2.5 flex flex-col relative group">
                        <div className="relative aspect-[3/4] rounded-lg overflow-hidden border border-slate-200 bg-white">
                          <img src={item.url} alt="thumbnail" className="w-full h-full object-contain" />
                          <span className="absolute top-1.5 left-1.5 bg-slate-900/70 text-white w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold">
                            {index + 1}
                          </span>
                        </div>

                        <div className="flex justify-between gap-1.5 mt-2.5">
                          <button
                            type="button"
                            disabled={index === 0}
                            onClick={() => {
                              const next = [...imageList];
                              [next[index - 1], next[index]] = [next[index], next[index - 1]];
                              setImageList(next);
                            }}
                            className="bg-white hover:bg-slate-100 border border-slate-200 text-slate-500 disabled:opacity-40 p-1.5 rounded-lg flex-1 flex justify-center cursor-pointer font-bold text-xs"
                            title="上移"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            disabled={index === imageList.length - 1}
                            onClick={() => {
                              const next = [...imageList];
                              [next[index + 1], next[index]] = [next[index], next[index + 1]];
                              setImageList(next);
                            }}
                            className="bg-white hover:bg-slate-100 border border-slate-200 text-slate-500 disabled:opacity-40 p-1.5 rounded-lg flex-1 flex justify-center cursor-pointer font-bold text-xs"
                            title="下移"
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRotateInList(index)}
                            className="bg-white hover:bg-slate-100 border border-slate-200 text-slate-500 p-1.5 rounded-lg flex-1 flex justify-center cursor-pointer"
                            title="顺时针旋转90°"
                          >
                            <RotateCw className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const next = imageList.filter((_, i) => i !== index);
                              setImageList(next);
                            }}
                            className="bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-650 p-1.5 rounded-lg flex-1 flex justify-center cursor-pointer"
                            title="移除此图"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}

                    {/* Add More button */}
                    <div
                      onClick={() => multiFileInputRef.current?.click()}
                      className="border-2 border-dashed border-slate-200 hover:border-blue-400 transition-colors rounded-2xl p-4 flex flex-col items-center justify-center text-center cursor-pointer bg-slate-50/20 aspect-[3/4] h-full justify-self-center min-w-[120px] justify-center"
                    >
                      <Plus className="w-5 h-5 text-slate-400" />
                      <span className="text-[10px] font-bold text-slate-500 mt-1">追加上传下一页</span>
                    </div>
                  </div>
                )}

                <input
                  type="file"
                  multiple
                  accept="image/*"
                  className="hidden"
                  ref={multiFileInputRef}
                  onChange={handleMultiFileChange}
                />
              </div>

              {imageList.length > 0 && (
                <>
                  {/* 跨页拼接后的识别模式选择 */}
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3 mb-4">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block pl-0.5">拼接后提取模式</label>
                    <div className="grid grid-cols-2 gap-2 bg-white p-1 rounded-xl border border-slate-100">
                      <button
                        type="button"
                        onClick={() => setCrossPageExtractMode('multi')}
                        className={`py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${crossPageExtractMode === 'multi'
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-slate-555 hover:text-slate-800'
                          }`}
                      >
                        <span>提取多道题 (多张试卷/多题)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setCrossPageExtractMode('single')}
                        className={`py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${crossPageExtractMode === 'single'
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-slate-555 hover:text-slate-800'
                          }`}
                      >
                        <span>提取单道长题 (跨页单题)</span>
                      </button>
                    </div>
                  </div>

                  {!analyzing ? (
                    <button
                      onClick={extractQuestions}
                      className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 hover:bg-blue-700 transition text-sm cursor-pointer"
                    >
                      <Sparkles className="w-4.5 h-4.5" /> {enableBgTask ? "合并拼接并提交后台提取" : "合并拼接并提取文本"}
                    </button>
                  ) : (
                    <div className="bg-white p-8 rounded-3xl border border-slate-150 flex flex-col items-center justify-center space-y-4 shadow-sm">
                      <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                      <p className="text-slate-750 font-bold tracking-wide animate-pulse text-xs">正在将多张图片在 Canvas 中拼接，并开始 AI 长图文本提取，请稍候...</p>
                    </div>
                  )}
                </>
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
                    对照参考原图
                  </span>
                  <span className="text-[10px] text-blue-600 font-bold bg-blue-50 px-2.5 py-0.5 rounded-full">
                    {uploadMode === 'crossPage' ? '拼接长图' : '单页图'}
                  </span>
                </div>
                {imageStr && (
                  <div className="overflow-auto max-h-[70vh] rounded-2xl border border-slate-100 flex justify-center bg-slate-50 relative group">
                    <img
                      src={imageStr}
                      alt="Uploaded Original"
                      className="w-full h-auto object-contain max-h-none transition-transform duration-205"
                    />
                    <button
                      onClick={() => setIsZoomed(true)}
                      className="absolute bottom-3 right-3 bg-slate-900/80 hover:bg-slate-900 text-white p-2.5 rounded-full transition shadow-md flex items-center gap-1 text-[10px] font-bold select-none cursor-pointer"
                    >
                      <span>🔍 放大对照原图</span>
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
                    <span className="text-xs font-black text-slate-900 font-sans">题目卡片 #{idx + 1}</span>

                    <div className="flex items-center gap-3">
                      <select
                        value={eq.subject}
                        onChange={e => handleUpdateExtracted(idx, 'subject', e.target.value)}
                        className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold text-slate-700 outline-none"
                      >
                        <option value="数学">数学</option>
                        <option value="物理">物理</option>
                        <option value="化学">化学</option>
                        <option value="英语">英语</option>
                        <option value="语文">语文</option>
                        <option value="其他">其他</option>
                      </select>

                      <button
                        onClick={() => handleDeleteQuestionCard(idx)}
                        className="text-rose-500 hover:text-rose-700 p-1.5 rounded-lg hover:bg-rose-50 transition cursor-pointer"
                        title="删除此题"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Question Textarea */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-500">题干内容 (印刷体文字，LaTeX公式使用 $ 符号包围)：</label>

                    {eq.originalText && (
                      <div className="w-full p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs leading-relaxed text-slate-700 font-medium">
                        <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wide block mb-1">渲染预览</span>
                        <FormattedMath text={eq.originalText} />
                      </div>
                    )}

                    <textarea
                      rows={4}
                      value={eq.originalText}
                      onChange={e => handleUpdateExtracted(idx, 'originalText', e.target.value)}
                      className="w-full p-3.5 bg-slate-50/50 border border-slate-200 rounded-2xl text-xs font-semibold leading-relaxed focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-y font-mono"
                      placeholder="输入该题目的题干内容..."
                    />
                  </div>

                  {/* Student Answer Textarea */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-500">学生作答 (手写提取文本，留空则无需步骤诊断批改)：</label>

                    {eq.studentAnswer && (
                      <div className="w-full p-3 bg-rose-50/30 border border-rose-100/50 rounded-xl text-xs leading-relaxed text-slate-700 font-medium">
                        <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wide block mb-1">学生作答实时渲染预览</span>
                        <FormattedMath text={eq.studentAnswer} />
                      </div>
                    )}

                    <textarea
                      rows={3}
                      value={eq.studentAnswer}
                      onChange={e => handleUpdateExtracted(idx, 'studentAnswer', e.target.value)}
                      className="w-full p-3.5 bg-slate-50/50 border border-slate-200 rounded-2xl text-xs font-semibold leading-relaxed focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-y"
                      placeholder="如：解：由题意可得... (如果无学生作答此字段可留空)"
                    />
                  </div>
                </div>
              ))}

              <div className="flex gap-4">
                <button
                  onClick={handleAddNewQuestionCard}
                  className="flex-1 bg-white hover:bg-slate-50 text-slate-700 py-3.5 border-2 border-dashed border-slate-200 rounded-2xl font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <Plus className="w-4 h-4" /> 追加手动添加一道题目
                </button>
              </div>
            </div>
          </div>

          <div className="flex gap-4 pt-4">
            <button
              onClick={() => setStep(1)}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-6 py-4.5 rounded-2xl font-bold text-sm flex items-center gap-1.5 transition cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" /> 返回重选图片
            </button>

            <button
              onClick={diagnoseAll}
              className="flex-1 bg-blue-600 text-white py-4.5 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-600/10 hover:bg-blue-700 transition text-sm cursor-pointer"
            >
              <Check className="w-4 h-4" /> 确认文本无误，开始智能诊断
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Diagnose Progress & Results */}
      {step === 3 && (
        <div className="space-y-6">
          {/* Progress Loading List */}
          {!parsedData && (
            <div className="bg-white p-8 rounded-3xl border border-slate-200 space-y-4 shadow-sm">
              <h3 className="text-xs font-black text-slate-900 mb-3 uppercase tracking-wider">AI 名师诊断进度详情</h3>
              <div className="space-y-3">
                {extractedQuestions?.map((item, idx) => {
                  const status = diagnosing[idx] || 'pending';
                  return (
                    <div key={idx} className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-150 rounded-2xl text-xs font-semibold">
                      <div className="flex items-center gap-2.5">
                        <span className="font-bold text-slate-750">题目 #{idx + 1}</span>
                        <span className="text-[10px] text-slate-400 max-w-[200px] truncate">({item.originalText})</span>
                      </div>

                      <div className="flex items-center gap-1.5 font-bold text-[11px]">
                        {status === 'pending' && (
                          <span className="text-slate-400">等待诊断...</span>
                        )}
                        {status === 'loading' && (
                          <>
                            <Loader2 className="w-3.5 h-3.5 text-blue-600 animate-spin" />
                            <span className="text-blue-600">正在分析诊断步骤...</span>
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
                        <span className="text-sm font-black text-slate-900 flex items-center gap-2 font-sans">
                          题目 #{idx + 1}
                          {isExcluded && (
                            <span className="text-[10px] bg-rose-50 text-rose-650 px-2 py-0.5 rounded-lg border border-rose-100 font-bold">不纳入归档</span>
                          )}
                          {q.score !== undefined && !isExcluded && (
                            <span className={`text-[10px] px-2.5 py-0.5 rounded-lg border font-black ${q.score >= 90
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                              : q.score >= 60
                                ? 'bg-blue-50 text-blue-700 border-blue-100'
                                : 'bg-rose-50 text-rose-750 border-rose-100'
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
                      <FormattedMath text={q.originalText} className="text-slate-900 font-bold text-xs" />
                    </div>

                    {/* Knowledge Points */}
                    {q.knowledgePoints && q.knowledgePoints.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {q.knowledgePoints.map((p, pIdx) => (
                          <span key={pIdx} className="text-[10px] bg-slate-50 text-slate-555 px-2.5 py-1 rounded-xl border border-slate-100 font-bold">
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
                          className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800 transition outline-none cursor-pointer"
                        >
                          <span>{expandedSolutions[idx] ? '▼ 收起本题名师精解' : '▶ 展开本题名师精解'}</span>
                        </button>
                        {expandedSolutions[idx] && (
                          <div className="mt-3 p-4 bg-slate-50/50 border border-slate-150 rounded-2xl text-xs leading-relaxed text-slate-800 font-medium">
                            <FormattedMath text={q.solution} />
                          </div>
                        )}
                      </div>
                    )}

                    {/* Error Analysis / Diagnosis */}
                    {q.errorAnalysis ? (
                      <div className="pt-4 border-t border-slate-100 space-y-3">
                        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                          <span>🔍</span> AI 错因深度剖析
                        </h4>
                        <div className="p-4 bg-slate-50 border border-slate-150 rounded-2xl text-xs leading-relaxed text-slate-800 font-medium whitespace-pre-wrap">
                          <FormattedMath text={q.errorAnalysis} />
                        </div>
                      </div>
                    ) : false ? (
                      <div className="pt-4 border-t border-slate-100 space-y-3">
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                          <span>📝</span> 手写作答 AI 步骤诊断批改
                        </h4>
                        <div className="grid grid-cols-1 gap-3">
                          {q.errorDiagnosis.map((stepItem: any) => {
                            let statusColor = "bg-emerald-50/50 border-emerald-100 text-emerald-800";
                            let statusIcon = "✅";
                            let statusText = "正确";

                            if (stepItem.status === 'incorrect') {
                              statusColor = "bg-rose-50 border-rose-100 text-rose-800";
                              statusIcon = "❌";
                              statusText = "首次出现错误";
                            } else if (stepItem.status === 'consequential_error') {
                              statusColor = "bg-amber-50/30 border-amber-100 text-amber-800";
                              statusIcon = "⚠️";
                              statusText = "受前面错误波及";
                            }

                            return (
                              <div key={stepItem.stepNumber} className={`p-4 border rounded-2xl ${statusColor} space-y-1.5`}>
                                <div className="flex items-center justify-between text-xs font-extrabold">
                                  <span>步骤 {stepItem.stepNumber} {statusIcon}</span>
                                  <span>{statusText}</span>
                                </div>
                                <div className="text-xs font-semibold leading-relaxed">
                                  <FormattedMath text={stepItem.stepContent} />
                                </div>
                                {stepItem.comment && (
                                  <div className="text-xs mt-2 pt-2 border-t border-current/10 font-bold opacity-90 text-rose-700">
                                    诊断说明：{stepItem.comment}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}

                    {/* Reason Selection */}
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
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-6 py-4.5 rounded-2xl font-bold text-sm flex items-center gap-1.5 transition cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" /> 重新编辑文本
                </button>

                <button
                  onClick={handleSave}
                  className="flex-1 bg-slate-900 hover:bg-slate-950 text-white py-4.5 rounded-2xl font-bold transition shadow-lg shadow-slate-900/10 text-sm cursor-pointer"
                >
                  保存并批量归档选中的错题 ({selectedIndexes.size} 道)
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* zoom overlay modal */}
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
              关闭
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
