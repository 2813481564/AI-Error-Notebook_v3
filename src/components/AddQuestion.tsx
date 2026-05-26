import { useState, useRef, ChangeEvent } from 'react';
import { db, ErrorQuestion } from '../lib/db';
import { Upload, Camera, Loader2, Sparkles, AlertCircle } from 'lucide-react';
import FormattedMath from './FormattedMath';

export default function AddQuestion({ onNavigate }: { onNavigate: (v: any) => void }) {
  const [imageStr, setImageStr] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string>('image/jpeg');
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [parsedData, setParsedData] = useState<Partial<ErrorQuestion> | null>(null);
  const [errorReason, setErrorReason] = useState('概念不清');
  
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
      
      setParsedData(data);
    } catch (err: any) {
       setError(err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSave = async () => {
    if (!parsedData || !parsedData.originalText) return;
    
    const question: ErrorQuestion = {
      id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
      imageUrl: imageStr || undefined,
      originalText: parsedData.originalText,
      subject: parsedData.subject || '其他',
      knowledgePoints: parsedData.knowledgePoints || [],
      errorReason,
      solution: parsedData.solution || '',
      createdAt: Date.now()
    };
    
    await db.saveQuestion(question);
    onNavigate('library');
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
               <p className="text-slate-700 font-semibold tracking-wide animate-pulse">AI 正在深度分析题目...</p>
            </div>
          )}

          {parsedData && (
             <div className="bg-white rounded-2xl border border-slate-200 p-6 md:p-8 space-y-6 shadow-sm">
                <div>
                  <div className="flex items-center gap-2 mb-3">
                     <span className="bg-blue-50 text-blue-700 px-3 py-1 rounded-xl text-xs font-bold border border-blue-100">{parsedData.subject}</span>
                     <span className="text-xs text-slate-400 font-semibold">AI 高精度识别题目</span>
                  </div>
                  <FormattedMath text={parsedData.originalText} className="text-slate-900 font-bold" />
                </div>

                <div className="pt-5 border-t border-slate-100">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">核心考查知识点</h4>
                  <div className="flex flex-wrap gap-2">
                    {parsedData.knowledgePoints?.map((p, i) => (
                      <span key={i} className="text-xs bg-slate-50 text-slate-700 px-3 py-1 rounded-xl border border-slate-100 font-bold">{p}</span>
                    ))}
                  </div>
                </div>

                <div className="pt-5 border-t border-slate-100">
                   <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">1对1 精解解析步骤</h4>
                   <FormattedMath text={parsedData.solution} className="text-slate-800" />
                </div>
                
                <div className="pt-5 border-t border-slate-100">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">本次作答分类 & 错误原因</h4>
                  <select 
                    value={errorReason} 
                    onChange={e => setErrorReason(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm font-semibold text-slate-800"
                  >
                    <option value="概念不清">概念不清</option>
                    <option value="粗心大意">粗心大意</option>
                    <option value="思路错误">思路错误</option>
                    <option value="完全不会">完全不会</option>
                    <option value="其他">其他</option>
                  </select>
                </div>

                <button 
                  onClick={handleSave}
                  className="w-full bg-slate-900 text-white py-4 rounded-xl font-bold hover:bg-slate-950 transition-colors shadow-lg shadow-slate-900/10 text-sm"
                >
                  保存并归档错题
                </button>
             </div>
          )}
        </div>
      )}
    </div>
  );
}
