import React, { useState, useRef, ChangeEvent, useEffect } from 'react';
import { db, ErrorQuestion } from '../lib/db';
import { Upload, Camera, Loader2, Sparkles, AlertCircle, RotateCw, Trash2, Plus, Check, ChevronLeft, ChevronDown, X } from 'lucide-react';
import FormattedMath from './FormattedMath';

const GRADE_OPTIONS = [
  '一年级', '二年级', '三年级', '四年级', '五年级', '六年级',
  '初一', '初二', '初三',
  '高一', '高二', '高三'
];

function getAvailableSubjects(grade: string): string[] {
  if (!grade) return ['数学', '英语', '语文', '物理', '化学', '生物', '政治', '历史', '地理', '其他'];
  if (grade.includes('初') || grade.includes('高')) {
    return ['数学', '英语', '语文', '物理', '化学', '生物', '政治', '历史', '地理'];
  }
  return ['数学', '英语', '语文'];
}

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

interface QuadBox {
  id: string;
  p0: { x: number; y: number };
  p1: { x: number; y: number };
  p2: { x: number; y: number };
  p3: { x: number; y: number };
}

// 选框裁剪辅助函数（双线性插值展平）
const cropBoxes = (
  imageStr: string,
  boxes: QuadBox[],
  mimeType: string
): Promise<string[]> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const results: string[] = [];
        boxes.forEach((box) => {
          // 计算 4 个顶点在原始图片上的实际像素坐标
          const p0 = { x: (box.p0.x / 100) * img.naturalWidth, y: (box.p0.y / 100) * img.naturalHeight };
          const p1 = { x: (box.p1.x / 100) * img.naturalWidth, y: (box.p1.y / 100) * img.naturalHeight };
          const p2 = { x: (box.p2.x / 100) * img.naturalWidth, y: (box.p2.y / 100) * img.naturalHeight };
          const p3 = { x: (box.p3.x / 100) * img.naturalWidth, y: (box.p3.y / 100) * img.naturalHeight };

          // 计算裁剪区域四条边的长度，用均值来确定输出图像的宽高
          const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
          const edgeW1 = dist(p0, p1);
          const edgeW2 = dist(p3, p2);
          const edgeH1 = dist(p0, p3);
          const edgeH2 = dist(p1, p2);

          let destW = Math.round((edgeW1 + edgeW2) / 2);
          let destH = Math.round((edgeH1 + edgeH2) / 2);

          // 限制最大宽高，避免性能和 AI 识别异常
          const maxDim = 1600;
          if (destW > maxDim || destH > maxDim) {
            const ratio = Math.min(maxDim / destW, maxDim / destH);
            destW = Math.round(destW * ratio);
            destH = Math.round(destH * ratio);
          }
          if (destW < 10) destW = 10;
          if (destH < 10) destH = 10;

          // 绘制源图像以获取像素数据
          const canvasSrc = document.createElement('canvas');
          canvasSrc.width = img.naturalWidth;
          canvasSrc.height = img.naturalHeight;
          const ctxSrc = canvasSrc.getContext('2d');
          if (!ctxSrc) throw new Error('Canvas 2D context not supported');
          ctxSrc.drawImage(img, 0, 0);

          const imgDataSrc = ctxSrc.getImageData(0, 0, img.naturalWidth, img.naturalHeight);
          const srcData = imgDataSrc.data;
          const srcW = img.naturalWidth;
          const srcH = img.naturalHeight;

          // 目标画布
          const canvasDst = document.createElement('canvas');
          canvasDst.width = destW;
          canvasDst.height = destH;
          const ctxDst = canvasDst.getContext('2d');
          if (!ctxDst) throw new Error('Canvas 2D context not supported');
          const imgDataDst = ctxDst.createImageData(destW, destH);
          const dstData = imgDataDst.data;

          // 双线性插值反向采样渲染循环
          for (let v = 0; v < destH; v++) {
            const nv = v / (destH - 1 || 1);
            for (let u = 0; u < destW; u++) {
              const nu = u / (destW - 1 || 1);

              const w0 = (1 - nu) * (1 - nv);
              const w1 = nu * (1 - nv);
              const w2 = nu * nv;
              const w3 = (1 - nu) * nv;

              const sx = Math.round(w0 * p0.x + w1 * p1.x + w2 * p2.x + w3 * p3.x);
              const sy = Math.round(w0 * p0.y + w1 * p1.y + w2 * p2.y + w3 * p3.y);

              const clampedX = Math.max(0, Math.min(srcW - 1, sx));
              const clampedY = Math.max(0, Math.min(srcH - 1, sy));

              const srcIdx = (clampedY * srcW + clampedX) * 4;
              const dstIdx = (v * destW + u) * 4;

              dstData[dstIdx] = srcData[srcIdx];
              dstData[dstIdx + 1] = srcData[srcIdx + 1];
              dstData[dstIdx + 2] = srcData[srcIdx + 2];
              dstData[dstIdx + 3] = srcData[srcIdx + 3];
            }
          }

          ctxDst.putImageData(imgDataDst, 0, 0);
          results.push(canvasDst.toDataURL(mimeType));
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

export default function AddQuestion({ onNavigate, initialUploadMode }: { onNavigate: (v: any, params?: any) => void, initialUploadMode?: 'single' | 'multi' | 'crossPage' }) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [uploadMode, setUploadMode] = useState<'single' | 'multi' | 'crossPage'>(initialUploadMode || 'single');

  useEffect(() => {
    if (initialUploadMode) {
      setUploadMode(initialUploadMode);
    }
  }, [initialUploadMode]);

  // 单图/多题下的单张图片状态
  const [imageStr, setImageStr] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string>('image/jpeg');

  // 跨页多图模式下的图片队列状态
  const [imageList, setImageList] = useState<{ id: string; url: string; mimeType: string }[]>([]);

  // 多题选框裁剪状态
  const [boxes, setBoxes] = useState<QuadBox[]>([]);
  const [isDrawingBox, setIsDrawingBox] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [currentPos, setCurrentPos] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // 二次编辑交互状态
  const [activeBoxId, setActiveBoxId] = useState<string | null>(null);
  const [interactionType, setInteractionType] = useState<'drawing' | 'moving' | 'resizing' | null>(null);
  const [resizeHandle, setResizeHandle] = useState<'p0' | 'p1' | 'p2' | 'p3' | null>(null);
  const [dragStartPct, setDragStartPct] = useState({ x: 0, y: 0 });
  const [initialBoxPoints, setInitialBoxPoints] = useState<{
    p0: { x: number; y: number };
    p1: { x: number; y: number };
    p2: { x: number; y: number };
    p3: { x: number; y: number };
  } | null>(null);

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
    fetch('/api/notebooks?type=normal', {
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

  const [isNotebookDropdownOpen, setIsNotebookDropdownOpen] = useState(false);
  const notebookDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notebookDropdownRef.current && !notebookDropdownRef.current.contains(event.target as Node)) {
        setIsNotebookDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const [showNotebookModal, setShowNotebookModal] = useState(false);
  const [nbForm, setNbForm] = useState({ name: '', grade: '', subject: '', description: '' });

  const handleCreateNotebook = () => {
    setNbForm({ name: '', grade: '', subject: '', description: '' });
    setShowNotebookModal(true);
  };

  const handleSaveNotebookSubmit = async () => {
    if (!nbForm.name.trim()) {
      alert('请输入错题本名称');
      return;
    }
    try {
      const token = localStorage.getItem('errorbook_token');
      const res = await fetch('/api/notebooks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          name: nbForm.name.trim(),
          grade: nbForm.grade,
          subject: nbForm.subject,
          description: nbForm.description,
          type: 'normal'
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '创建失败');
      setNotebooks(prev => [data.notebook || data, ...prev]);
      setSelectedNotebook(data.notebook?.id || data.id);
      setShowNotebookModal(false);
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

  // 选框挪动按下事件
  const handleBoxMouseDown = (e: React.MouseEvent, box: QuadBox) => {
    e.stopPropagation();
    e.preventDefault();
    if (uploadMode !== 'multi' && uploadMode !== 'single') return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    setActiveBoxId(box.id);
    setInteractionType('moving');
    setDragStartPct({ x, y });
    setInitialBoxPoints({
      p0: { ...box.p0 },
      p1: { ...box.p1 },
      p2: { ...box.p2 },
      p3: { ...box.p3 }
    });
  };

  // 选框调整节点按下事件
  const handleHandleMouseDown = (
    e: React.MouseEvent,
    box: QuadBox,
    handleDir: 'p0' | 'p1' | 'p2' | 'p3'
  ) => {
    e.stopPropagation();
    e.preventDefault();
    if (uploadMode !== 'multi' && uploadMode !== 'single') return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    setActiveBoxId(box.id);
    setInteractionType('resizing');
    setResizeHandle(handleDir);
    setDragStartPct({ x, y });
    setInitialBoxPoints({
      p0: { ...box.p0 },
      p1: { ...box.p1 },
      p2: { ...box.p2 },
      p3: { ...box.p3 }
    });
  };

  // 多题及单题框选录入区域鼠标交互处理
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (uploadMode !== 'multi' && uploadMode !== 'single') return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    setInteractionType('drawing');
    setIsDrawingBox(true);
    setStartPos({ x, y });
    setCurrentPos({ x, y });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    const pctX = Math.max(0, Math.min(100, x));
    const pctY = Math.max(0, Math.min(100, y));

    if (interactionType === 'drawing') {
      setCurrentPos({ x: pctX, y: pctY });
    } else if (interactionType === 'moving' && activeBoxId && initialBoxPoints) {
      const dx = pctX - dragStartPct.x;
      const dy = pctY - dragStartPct.y;

      setBoxes(prev => prev.map(box => {
        if (box.id !== activeBoxId) return box;

        const shiftPoint = (p: { x: number; y: number }) => {
          let nx = p.x + dx;
          let ny = p.y + dy;
          if (nx < 0) nx = 0;
          if (nx > 100) nx = 100;
          if (ny < 0) ny = 0;
          if (ny > 100) ny = 100;
          return { x: nx, y: ny };
        };

        return {
          ...box,
          p0: shiftPoint(initialBoxPoints.p0),
          p1: shiftPoint(initialBoxPoints.p1),
          p2: shiftPoint(initialBoxPoints.p2),
          p3: shiftPoint(initialBoxPoints.p3)
        };
      }));
    } else if (interactionType === 'resizing' && activeBoxId && resizeHandle && initialBoxPoints) {
      const dx = x - dragStartPct.x;
      const dy = y - dragStartPct.y;

      setBoxes(prev => prev.map(box => {
        if (box.id !== activeBoxId) return box;

        const targetPt = initialBoxPoints[resizeHandle];
        let nx = targetPt.x + dx;
        let ny = targetPt.y + dy;
        if (nx < 0) nx = 0;
        if (nx > 100) nx = 100;
        if (ny < 0) ny = 0;
        if (ny > 100) ny = 100;

        return {
          ...box,
          [resizeHandle]: { x: nx, y: ny }
        };
      }));
    }
  };

  const handleMouseUp = () => {
    if (interactionType === 'drawing' && isDrawingBox) {
      setIsDrawingBox(false);

      const x = Math.min(startPos.x, currentPos.x);
      const y = Math.min(startPos.y, currentPos.y);
      const w = Math.abs(currentPos.x - startPos.x);
      const h = Math.abs(currentPos.y - startPos.y);

      if (w > 1.5 && h > 1.5) {
        const newBox = {
          id: 'box_' + Math.random().toString(36).substring(2, 9),
          p0: { x: x, y: y },
          p1: { x: x + w, y: y },
          p2: { x: x + w, y: y + h },
          p3: { x: x, y: y + h }
        };
        if (uploadMode === 'single') {
          setBoxes([newBox]);
        } else {
          setBoxes(prev => [...prev, newBox]);
        }
      }
    }
    setInteractionType(null);
    setActiveBoxId(null);
    setResizeHandle(null);
    setInitialBoxPoints(null);
  };

  const handleMouseLeave = () => {
    if (interactionType === 'drawing' || interactionType === 'moving' || interactionType === 'resizing') {
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

  // ========== NEW SSE STREAMING PIPELINE ==========

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
          throw new Error(`“${uploadMode === 'single' ? '单题' : '多题'}录入”模式下必须手动框选要录入的题目区域！请在图片上拖拽鼠标进行框选。`);
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
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            taskName: `录题任务 ${new Date().toLocaleString()} - 题目${index + 1}`,
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
          throw new Error(data.error || `题目 ${index + 1} 提交失败`);
        }
      });

      await Promise.all(promises);

      alert(`已成功提交 ${imagesToProcess.length} 道题目到后台解析队列！请在错题本中查看进度。`);

      // Jump to Notebook immediately!
      onNavigate('library', { notebookId: selectedNotebook || 'unclassified' });

    } catch (err: any) {
      setError(err.message);
      alert(err.message);
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
        alert(`已成功归档保存 ${selectedTasks.length} 条错题记录！`);
      } else {
        alert('选中的题目均标记为“不纳入归档”或尚未处理完成，未写入错题本。');
      }

      onNavigate('library', { notebookId: selectedNotebook || 'unclassified' });
    } catch (err) {
      setError(err.message || '保存错题失败，请重试');
    }
  };


  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 w-full pb-12">

      {/* Step Indicator */}
      <div className="hidden flex items-center justify-between mb-8 max-w-md mx-auto">
        <div className="flex flex-col items-center">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition-colors duration-300 ${step >= 1 ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>1</div>
          <span className="text-[13px] mt-1.5 font-extrabold text-slate-555">上传与设置</span>
        </div>
        <div className={`flex-1 h-0.5 mx-3 transition-colors duration-500 ${step >= 2 ? 'bg-blue-600' : 'bg-slate-100'}`} />
        <div className="flex flex-col items-center">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition-colors duration-300 ${step >= 2 ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>2</div>
          <span className="text-[13px] mt-1.5 font-extrabold text-slate-555">内容校对</span>
        </div>
        <div className={`flex-1 h-0.5 mx-3 transition-colors duration-500 ${step >= 3 ? 'bg-blue-600' : 'bg-slate-100'}`} />
        <div className="flex flex-col items-center">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition-colors duration-300 ${step >= 3 ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>3</div>
          <span className="text-[13px] mt-1.5 font-extrabold text-slate-555">智能诊断</span>
        </div>
      </div>

      <div className="flex flex-col gap-1 mb-2">
        <h2 className="text-2xl font-black text-slate-950 tracking-tight font-sans">
          {step === 1 && '录入新错题'}

        </h2>
        <p className="text-sm text-slate-500 font-medium">
          {step === 1 && '选择拍照录题的模式，上传图片并关联错题本'}

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

              <div className="flex gap-2 items-center">
                <div className="relative flex-1" ref={notebookDropdownRef}>
                  <div
                    onClick={() => setIsNotebookDropdownOpen(!isNotebookDropdownOpen)}
                    className={`flex items-center justify-between px-3 h-[42px] bg-slate-50 border rounded-xl outline-none text-xs font-bold text-slate-700 cursor-pointer transition-all ${isNotebookDropdownOpen ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-slate-200 hover:border-blue-300'
                      }`}
                  >
                    <span className="truncate">
                      {selectedNotebook ? notebooks.find(nb => nb.id === selectedNotebook)?.name : '-- 请选择归属错题本 (必填) --'}
                    </span>
                    <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isNotebookDropdownOpen ? 'rotate-180' : ''}`} />
                  </div>

                  {isNotebookDropdownOpen && (
                    <div className="absolute z-50 w-full mt-2 bg-white border border-slate-200 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.08)] py-2 max-h-[260px] overflow-y-auto animate-in fade-in slide-in-from-top-2">
                      {notebooks.map(nb => (
                        <div
                          key={nb.id}
                          onClick={() => { setSelectedNotebook(nb.id); setIsNotebookDropdownOpen(false); }}
                          className={`px-4 py-3 text-xs font-bold cursor-pointer transition-colors ${selectedNotebook === nb.id ? 'bg-blue-50 text-blue-600' : 'text-slate-600 hover:bg-slate-50'
                            }`}
                        >
                          {nb.name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleCreateNotebook}
                  className="px-4 h-[42px] bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-600 rounded-xl text-xs font-black transition-all flex items-center gap-1 shrink-0 cursor-pointer"
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
            <label className="text-[13px] font-bold text-slate-400 uppercase tracking-wider block pl-0.5">选择录题模式</label>
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

            <p className="text-[13px] text-slate-400 pl-0.5 leading-relaxed">
              {uploadMode === 'single' && '💡 适用于单张图片中只有 1 道错题的场景，您需要手动在图片上框选出要录入的题目区域（支持画好框后拖拽其边缘或顶角进行二次微调）。'}
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
                    {uploadMode === 'single' && (
                      <div className="text-xs text-blue-800 bg-blue-50/60 border border-blue-100 px-4 py-2.5 rounded-2xl mb-4 w-full text-center font-bold animate-pulse">
                        🚨 必须框选：单题模式下，请在下方图片上按住鼠标左键拖拽框选出您需要提取的那道错题区域。画好框后可直接拖拽其边缘或顶角进行精准微调。
                      </div>
                    )}

                    <div
                      ref={containerRef}
                      className={`relative inline-block select-none border border-slate-100 rounded-2xl overflow-hidden bg-slate-50 max-w-full ${(uploadMode === 'multi' || uploadMode === 'single') ? 'cursor-crosshair' : ''
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

                      {/* SVG 选区绘制区 */}
                      <svg
                        viewBox="0 0 100 100"
                        preserveAspectRatio="none"
                        className="absolute inset-0 w-full h-full pointer-events-none select-none z-10"
                      >
                        {(uploadMode === 'multi' || uploadMode === 'single') && boxes.map((box) => {
                          const pointsStr = `${box.p0.x},${box.p0.y} ${box.p1.x},${box.p1.y} ${box.p2.x},${box.p2.y} ${box.p3.x},${box.p3.y}`;
                          const isCurrentActive = activeBoxId === box.id;
                          return (
                            <polygon
                              key={box.id}
                              points={pointsStr}
                              className={`fill-rose-500/10 stroke-rose-500 stroke-[0.3] ${isCurrentActive ? 'stroke-dashed fill-rose-500/20' : 'hover:fill-rose-500/15'
                                }`}
                              style={{ cursor: 'move', pointerEvents: 'auto' }}
                              onMouseDown={(e) => handleBoxMouseDown(e, box)}
                            />
                          );
                        })}
                      </svg>

                      {/* 渲染控制节点和角标、删除按钮 */}
                      {(uploadMode === 'multi' || uploadMode === 'single') && boxes.map((box, index) => {
                        const handles = [
                          { name: 'p0', pt: box.p0, cursor: 'cursor-nwse-resize' },
                          { name: 'p1', pt: box.p1, cursor: 'cursor-nesw-resize' },
                          { name: 'p2', pt: box.p2, cursor: 'cursor-nwse-resize' },
                          { name: 'p3', pt: box.p3, cursor: 'cursor-nesw-resize' },
                        ] as const;
                        return (
                          <div key={box.id} className="absolute inset-0 pointer-events-none z-20">
                            {/* 题目序号角标 */}
                            <span
                              className="absolute bg-rose-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded shadow select-none pointer-events-none -translate-x-1/2 -translate-y-1/2 animate-bounce"
                              style={{
                                left: `${box.p0.x}%`,
                                top: `${box.p0.y - 3}%`,
                              }}
                            >
                              {uploadMode === 'single' ? '已选区域' : `题目 ${index + 1}`}
                            </span>

                            {/* 删除按钮 */}
                            <button
                              type="button"
                              onClick={(e) => deleteBox(box.id, e)}
                              className="absolute w-5 h-5 bg-rose-700 hover:bg-rose-800 text-white text-[9px] font-black rounded-full flex items-center justify-center shadow transition-transform hover:scale-110 cursor-pointer border border-white -translate-x-1/2 -translate-y-1/2 pointer-events-auto z-30"
                              style={{
                                left: `${box.p1.x}%`,
                                top: `${box.p1.y}%`,
                              }}
                              title="删除此选区"
                            >
                              ✕
                            </button>

                            {/* 4角调整节点 */}
                            {handles.map(h => (
                              <div
                                key={h.name}
                                onMouseDown={(e) => handleHandleMouseDown(e, box, h.name)}
                                className={`absolute w-6 h-6 flex items-center justify-center -translate-x-1/2 -translate-y-1/2 ${h.cursor} pointer-events-auto`}
                                style={{
                                  left: `${h.pt.x}%`,
                                  top: `${h.pt.y}%`,
                                }}
                              >
                                <div className="w-3.5 h-3.5 bg-blue-600 border-2 border-white rounded-full shadow-md hover:scale-125 transition-transform" />
                              </div>
                            ))}
                          </div>
                        );
                      })}

                      {/* 绘制中的临时选区 */}
                      {(uploadMode === 'multi' || uploadMode === 'single') && isDrawingBox && (
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
                      {(uploadMode === 'multi' || uploadMode === 'single') && boxes.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setBoxes([])}
                          className="bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-700 px-4 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer"
                        >
                          清空选框 {uploadMode === 'multi' && `(${boxes.length})`}
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
                      onClick={submitBackgroundTasks}
                      className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 hover:bg-blue-700 transition text-sm cursor-pointer"
                    >
                      <Sparkles className="w-4.5 h-4.5" /> {enableBgTask ? "提交至后台智能分析" : "提交到后台自动解析"}
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
                      onClick={submitBackgroundTasks}
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


    </div>
  );
}
