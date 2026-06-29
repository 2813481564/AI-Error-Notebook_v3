import { useState, useRef } from 'react';
import { Printer, ArrowLeft, Eye, EyeOff, Edit, Check, Sparkles, Loader2, Undo2, RefreshCw, Save, Crop, ImageOff, Image as ImageIcon } from 'lucide-react';
import { db, ErrorQuestion } from '../lib/db';
import FormattedMath from './FormattedMath';
import GeometryRenderer from './GeometryRenderer';
import type { GeometryData } from '../types/geometry';
import ReactCrop, { type Crop as CropType, type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';

export default function TestPaper({ 
  questions,
  initialCroppedImages,
  initialHiddenImages,
  onBack 
}: { 
  questions: ErrorQuestion[];
  initialCroppedImages?: Record<string, string>;
  initialHiddenImages?: Record<string, boolean>;
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
  const [regeneratingIndex, setRegeneratingIndex] = useState<number | null>(null);

  const [showSaveModal, setShowSaveModal] = useState(false);
  const [paperTitleInput, setPaperTitleInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [croppedImages, setCroppedImages] = useState<Record<string, string>>(initialCroppedImages || {});
  const [hiddenImages, setHiddenImages] = useState<Record<string, boolean>>(initialHiddenImages || {});
  const [cropModalData, setCropModalData] = useState<{ id: string; url: string } | null>(null);
  const [crop, setCrop] = useState<CropType>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [isUploadingCrop, setIsUploadingCrop] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  const handleSaveCrop = async () => {
    if (!completedCrop || !imgRef.current || !cropModalData) return;
    const image = imgRef.current;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;
    const pixelRatio = window.devicePixelRatio;

    canvas.width = Math.floor(completedCrop.width * scaleX * pixelRatio);
    canvas.height = Math.floor(completedCrop.height * scaleY * pixelRatio);

    ctx.scale(pixelRatio, pixelRatio);
    ctx.imageSmoothingQuality = 'high';

    const cropX = completedCrop.x * scaleX;
    const cropY = completedCrop.y * scaleY;

    ctx.save();
    ctx.translate(-cropX, -cropY);
    ctx.drawImage(
      image,
      0,
      0,
      image.naturalWidth,
      image.naturalHeight,
      0,
      0,
      image.naturalWidth,
      image.naturalHeight
    );
    ctx.restore();

    const base64Image = canvas.toDataURL('image/jpeg', 0.95);
    setIsUploadingCrop(true);
    try {
      const url = await db.uploadImage(base64Image);
      setCroppedImages(prev => ({ ...prev, [cropModalData.id]: url }));
      setCropModalData(null);
      setCrop(undefined);
      setCompletedCrop(undefined);
    } catch (error: any) {
      alert(error.message || '图片保存失败，请重试');
    } finally {
      setIsUploadingCrop(false);
    }
  };

  const handleOpenSaveModal = () => {
    setPaperTitleInput(title + (paperMode === 'variant' ? ' (AI变式)' : ''));
    setSaveError(null);
    setShowSaveModal(true);
  };

  const handleConfirmSave = async () => {
    if (!paperTitleInput.trim()) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const qIds = questions.map(q => q.id);
      await db.savePaper(paperTitleInput.trim(), qIds, paperMode, croppedImages, hiddenImages);
      setShowSaveModal(false);
      alert('试卷保存成功！您可以到“我的试卷”中查看。');
    } catch (err: any) {
      console.error(err);
      setSaveError(err.message || '保存试卷失败，请重试');
    } finally {
      setIsSaving(false);
    }
  };

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

  // 重新生成单道变式题
  const regenerateSingleVariant = async (index: number) => {
    if (regeneratingIndex !== null) return;
    setRegeneratingIndex(index);

    try {
      const token = localStorage.getItem('errorbook_token');
      const res = await fetch('/api/paper/variant/regenerate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ 
          originalQuestion: questions[index],
          currentVariant: variants[index]
        })
      });

      if (res.status === 401) {
        localStorage.removeItem('errorbook_token');
        localStorage.removeItem('errorbook_username');
        window.location.reload();
        throw new Error('登录已过期，请重新登录');
      }

      if (!res.ok) {
        let errorMsg = '重新生成失败';
        try {
          const errData = await res.json();
          errorMsg = errData.error || errorMsg;
        } catch (_) {
          errorMsg = `请求失败，服务器返回状态: ${res.status}`;
        }
        throw new Error(errorMsg);
      }

      const newVariant = await res.json();
      
      setVariants(prev => {
        const next = [...prev];
        next[index] = newVariant;
        return next;
      });

    } catch (err: any) {
      console.error(err);
      alert(err.message || 'AI 重新生成失败，请重试');
    } finally {
      setRegeneratingIndex(null);
    }
  };

  // 决定最终渲染的题目列表
  const displayedQuestions = paperMode === 'original' 
    ? questions.map((q, idx) => {
        const isAIVariant = q.errorReason === 'AI变式题' || 
                            (q.knowledgePoints && q.knowledgePoints.includes('AI变式题')) || 
                            (q.id && q.id.startsWith('q_similar_')) || 
                            (q.examDirection || '').includes('【变式强化题】');
                            
        return {
          id: q.id,
          subject: q.subject,
          text: q.originalText,
          solution: q.solution,
          errorReason: q.errorReason,
          imageUrl: isAIVariant ? undefined : q.imageUrl,
          geometry: (isAIVariant && q.similarQuestion)
            ? (Array.isArray(q.similarQuestion) 
                ? q.similarQuestion[0]?.geometry 
                : q.similarQuestion.geometry)
            : undefined
        };
      })
    : variants.map((v, idx) => ({
        id: `variant-${idx}`,
        subject: v.subject || '数学',
        text: v.variantText,
        solution: v.solution,
        errorReason: 'AI 变式题',
        imageUrl: v.imageUrl,
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
          @page {
            margin: 0;
          }
          body {
            margin: 1.6cm 2cm !important;
            background: #fff !important;
            color: #000 !important;
            font-size: 14px !important;
          }
          html, body, #root,
          .h-screen,
          .h-full,
          .overflow-hidden,
          .overflow-y-auto,
          main {
            height: auto !important;
            min-height: 0 !important;
            overflow: visible !important;
            position: static !important;
            background: transparent !important;
          }
          /* Hide scrollbars during print */
          ::-webkit-scrollbar {
            display: none !important;
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

          {/* AI Variant Switcher Button - 已隐藏原按钮 */}
          {paperMode !== 'original' && (
            <button
              onClick={() => setPaperMode('original')}
              className="flex items-center gap-1.5 px-4.5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition-all cursor-pointer w-full sm:w-auto justify-center"
            >
              <Undo2 className="w-4 h-4" />
              <span>⏪ 返回原错题试卷</span>
            </button>
          )}

          {/* Save Paper Trigger */}
          <button
            onClick={handleOpenSaveModal}
            className="flex items-center gap-1.5 px-5 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-extrabold hover:bg-slate-50 transition-colors shadow-sm cursor-pointer w-full sm:w-auto justify-center"
          >
            <Save className="w-4 h-4 text-slate-500" />
            <span>保存试卷</span>
          </button>

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
                <span className="no-print text-slate-400 font-bold flex items-center gap-3">
                  {paperMode === 'original' ? `# 错题 ID: ${q.id.slice(0, 8)}` : '# AI 命制变式题'}
                  
                  {q.imageUrl && hiddenImages[q.id] && (
                    <button
                      onClick={() => setHiddenImages(prev => { const next = {...prev}; delete next[q.id]; return next; })}
                      className="flex items-center gap-1 text-blue-600 hover:text-blue-700 transition-colors cursor-pointer"
                      title="恢复显示原图"
                    >
                      <ImageIcon className="w-3.5 h-3.5" />
                      <span>恢复图片</span>
                    </button>
                  )}

                  {paperMode === 'variant' && (
                    <button
                      onClick={() => regenerateSingleVariant(index)}
                      disabled={regeneratingIndex === index}
                      className="flex items-center gap-1 text-blue-600 hover:text-blue-700 disabled:text-slate-400 transition-colors cursor-pointer"
                      title="对这道题不满意？让 AI 自动查找瑕疵并重新生成"
                    >
                      {regeneratingIndex === index ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5" />
                      )}
                      <span>{regeneratingIndex === index ? '正在自检纠错...' : '重新生成此题'}</span>
                    </button>
                  )}
                </span>
              </div>

              {/* Question Image (if any) */}
              {q.imageUrl && !hiddenImages[q.id] && (
                <div className="py-2 flex justify-center group relative">
                  <img src={croppedImages[q.id] || q.imageUrl} alt="题目图片" className="max-w-full max-h-[300px] object-contain rounded-lg border border-slate-200" />
                  <div className="no-print absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={() => setCropModalData({ id: q.id, url: q.imageUrl! })}
                      className="bg-slate-900/80 hover:bg-slate-900 text-white p-2 rounded-xl backdrop-blur-md cursor-pointer flex items-center gap-1.5 text-xs font-bold shadow-lg"
                      title="自由裁剪图片"
                    >
                      <Crop className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">裁剪</span>
                    </button>
                    <button 
                      onClick={() => setHiddenImages(prev => ({ ...prev, [q.id]: true }))}
                      className="bg-rose-500/90 hover:bg-rose-600 text-white p-2 rounded-xl backdrop-blur-md cursor-pointer flex items-center gap-1.5 text-xs font-bold shadow-lg"
                      title="删除原错题图片"
                    >
                      <ImageOff className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">删除图片</span>
                    </button>
                  </div>
                </div>
              )}

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

      {/* Save Modal */}
      {showSaveModal && (
        <div className="no-print fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-sm w-full p-6 relative animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-base font-black text-slate-900 flex items-center gap-2 mb-4">
              <Save className="w-5 h-5 text-blue-600" />
              <span>保存试卷到云端</span>
            </h3>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1.5 block">试卷标题</label>
                <input
                  type="text"
                  value={paperTitleInput}
                  onChange={(e) => setPaperTitleInput(e.target.value)}
                  placeholder="请输入试卷标题..."
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none text-sm font-semibold focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                />
              </div>
              
              <div className="text-xs text-slate-400 bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-1">
                <p>• 试卷模式：<span className="font-bold text-slate-700">{paperMode === 'original' ? '原错题版' : 'AI 变式强化版'}</span></p>
                <p>• 题目数量：<span className="font-bold text-slate-700">{questions.length} 道</span></p>
              </div>

              {saveError && (
                <p className="text-xs text-rose-500 font-bold">{saveError}</p>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowSaveModal(false)}
                  disabled={isSaving}
                  className="flex-1 py-2.5 border border-slate-200 text-slate-600 bg-white rounded-xl text-xs font-bold hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  取消
                </button>
                <button
                  onClick={handleConfirmSave}
                  disabled={isSaving || !paperTitleInput.trim()}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-blue-500/10 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>正在保存...</span>
                    </>
                  ) : (
                    <span>确认保存</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Crop Modal */}
      {cropModalData && (
        <div className="no-print fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-in fade-in zoom-in-95 duration-200">
          <div className="bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col w-full max-w-4xl max-h-[90vh]">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white z-10">
              <h3 className="font-black text-slate-800 flex items-center gap-2">
                <Crop className="w-5 h-5 text-blue-600" />
                自由裁剪错题原图
              </h3>
              <button onClick={() => { setCropModalData(null); setCrop(undefined); setCompletedCrop(undefined); }} className="text-slate-400 hover:text-slate-600 font-bold px-2 py-1 cursor-pointer">关闭</button>
            </div>
            
            <div className="p-6 bg-slate-100 flex-1 overflow-auto flex items-center justify-center min-h-[300px]">
              <ReactCrop
                crop={crop}
                onChange={(_, percentCrop) => setCrop(percentCrop)}
                onComplete={(c) => setCompletedCrop(c)}
                className="max-h-[60vh] rounded-xl shadow-md bg-white max-w-full"
              >
                <img 
                  ref={imgRef}
                  src={cropModalData.url} 
                  alt="裁剪区域" 
                  className="max-h-[60vh] w-auto object-contain pointer-events-none" 
                  crossOrigin="anonymous"
                />
              </ReactCrop>
            </div>
            
            <div className="p-4 border-t border-slate-100 bg-white flex justify-between items-center shrink-0 z-10 flex-wrap gap-4">
              <span className="text-xs text-slate-500 font-bold hidden sm:inline-block">提示：在图片上拖拽框选您想要保留的区域，不框选则取消</span>
              <div className="flex gap-2 w-full sm:w-auto justify-end">
                <button
                  onClick={() => { setCropModalData(null); setCrop(undefined); setCompletedCrop(undefined); }}
                  className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer"
                >
                  取消
                </button>
                {croppedImages[cropModalData.id] && (
                  <button
                    onClick={() => {
                      setCroppedImages(prev => {
                        const next = { ...prev };
                        delete next[cropModalData.id];
                        return next;
                      });
                      setCropModalData(null);
                      setCrop(undefined);
                      setCompletedCrop(undefined);
                    }}
                    className="px-5 py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-600 border border-amber-200 font-bold text-xs rounded-xl transition cursor-pointer"
                  >
                    恢复原图
                  </button>
                )}
                <button
                  onClick={handleSaveCrop}
                  disabled={!completedCrop?.width || !completedCrop?.height || isUploadingCrop}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold text-xs rounded-xl transition shadow-md shadow-blue-500/10 cursor-pointer flex items-center gap-1.5"
                >
                  {isUploadingCrop ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      确认裁剪
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      确认裁剪
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
