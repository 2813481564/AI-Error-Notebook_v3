import React, { useState, useEffect, useRef } from 'react';
import { X, Send, BrainCircuit, RefreshCw, CheckCircle2, ChevronRight, MessageSquare, Book } from 'lucide-react';
import FormattedMath from './FormattedMath';
import { ResponsiveContainer, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from 'recharts';

interface FeynmanChatProps {
  questionId: string;
  originalText: string;
  imageUrl?: string;
  standardAnswer?: string;
  onClose: () => void;
  onMasteryUpdate: (status: string) => void;
}

interface ChatMessage {
  role: 'user' | 'model';
  content: string;
}

export default function FeynmanChat({
  questionId,
  originalText,
  imageUrl,
  onClose,
  onMasteryUpdate
}: FeynmanChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [evaluation, setEvaluation] = useState<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  useEffect(() => {
    fetchHistory();
  }, [questionId]);

  const fetchHistory = async () => {
    try {
      const token = localStorage.getItem('errorbook_token');
      const res = await fetch(`/api/feynman/${questionId}/history`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setMessages(data.data || []);
        if (data.evaluation) {
          setEvaluation(data.evaluation);
        } else if (data.data.length === 0) {
          // 初始化第一条消息
          setMessages([{
            role: 'model',
            content: '老师你好！这道题我看了半天没看懂，你能从第一步开始，给我讲讲你的解题思路吗？'
          }]);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);

    try {
      const token = localStorage.getItem('errorbook_token');
      const res = await fetch('/api/feynman/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ questionId, message: userMessage })
      });
      const data = await res.json();
      if (data.success) {
        setMessages(prev => [...prev, { role: 'model', content: data.data.reply }]);
        if (data.data.status === 'completed' && data.data.evaluation) {
          setEvaluation(data.data.evaluation);
          onMasteryUpdate('mastered');
        }
      }
    } catch (e) {
      console.error(e);
      setMessages(prev => [...prev, { role: 'model', content: '网络错误，请稍后再试。' }]);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('确定要重新开始费曼学习吗？历史记录将被清空。')) return;
    try {
      const token = localStorage.getItem('errorbook_token');
      await fetch(`/api/feynman/${questionId}/reset`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      setEvaluation(null);
      setMessages([{
        role: 'model',
        content: '老师你好！我们重新开始吧，你能给我讲讲这道题的解题思路吗？'
      }]);
    } catch (e) {
      console.error(e);
    }
  };

  const radarData = evaluation ? [
    { subject: '逻辑清晰', A: Number(evaluation.logicScore) || 0, fullMark: 100 },
    { subject: '概念准确', A: Number(evaluation.conceptScore) || 0, fullMark: 100 },
    { subject: '表达流畅', A: Number(evaluation.expressionScore) || 0, fullMark: 100 },
    { subject: '知识发散', A: Number(evaluation.divergenceScore) || 0, fullMark: 100 },
  ] : [];

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6">
      <div className="bg-white w-full max-w-6xl h-full max-h-[90vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row relative">
        
        {/* Left Side: Question Reference */}
        <div className="w-full md:w-5/12 bg-slate-50 border-r border-slate-200 flex flex-col h-[40vh] md:h-full">
          <div className="p-4 border-b border-slate-200 bg-white">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <Book className="w-5 h-5 text-blue-600" />
              参考题目
            </h3>
          </div>
          <div className="flex-1 overflow-y-auto p-4 md:p-6">
            <FormattedMath text={originalText} className="text-base text-slate-800 font-medium leading-relaxed" />
            {imageUrl && (
              <img src={imageUrl} alt="题图" className="mt-4 max-w-full rounded-xl border border-slate-200 shadow-sm" />
            )}
          </div>
        </div>

        {/* Right Side: Chat / Report */}
        <div className="w-full md:w-7/12 bg-white flex flex-col h-[60vh] md:h-full relative">
          
          {evaluation ? (
            // Evaluation Report
            <div className="flex-1 overflow-y-auto bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 text-white relative flex flex-col">
              <div className="absolute top-4 right-4 z-10 flex gap-2">
                <button onClick={onClose} className="p-2.5 bg-white/10 hover:bg-rose-500/90 text-white rounded-full transition-all backdrop-blur-md shadow-lg border border-white/10">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 flex flex-col items-center py-10 px-6 sm:px-10 max-w-2xl mx-auto w-full">
                
                {/* Header */}
                <div className="flex flex-col items-center text-center mb-8">
                  <div className="bg-emerald-500/20 p-4 rounded-full mb-4 ring-2 ring-emerald-400/50 shadow-[0_0_30px_rgba(52,211,153,0.2)]">
                    <CheckCircle2 className="w-10 h-10 text-emerald-400" />
                  </div>
                  <h2 className="text-3xl sm:text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-emerald-300 to-cyan-300 tracking-tight mb-4">
                    掌握度评估报告
                  </h2>
                  <div className="flex items-baseline gap-2">
                    <span className="text-slate-400 font-medium">综合得分</span>
                    <span className="text-5xl font-black text-white drop-shadow-[0_0_15px_rgba(52,211,153,0.4)]">
                      {evaluation.score}
                    </span>
                    <span className="text-emerald-400 font-bold">/ 100</span>
                  </div>
                </div>
                
                {/* Radar Chart */}
                <div className="w-full h-72 sm:h-80 mb-10 relative">
                  {/* Optional background glow for chart */}
                  <div className="absolute inset-0 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none"></div>
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="65%" data={radarData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
                      <PolarGrid stroke="rgba(255,255,255,0.15)" strokeDasharray="3 3" />
                      <PolarAngleAxis dataKey="subject" tick={{ fill: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: 600 }} />
                      <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
                      <defs>
                        <linearGradient id="colorCyan" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.8}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.2}/>
                        </linearGradient>
                      </defs>
                      <Radar name="Score" dataKey="A" stroke="#22d3ee" strokeWidth={2} fill="url(#colorCyan)" fillOpacity={0.6} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>

                {/* Feedback Cards */}
                <div className="w-full space-y-5">
                  <div className="bg-white/5 rounded-2xl p-6 sm:p-7 border border-white/10 backdrop-blur-md shadow-xl">
                    <h4 className="font-bold text-lg text-emerald-300 mb-3 flex items-center gap-2">
                      <MessageSquare className="w-5 h-5" /> 名师点评
                    </h4>
                    <p className="text-slate-200 leading-relaxed text-sm sm:text-base">
                      {evaluation.comment}
                    </p>
                  </div>
                  
                  {evaluation.weaknesses && evaluation.weaknesses.length > 0 && (
                    <div className="bg-rose-500/5 rounded-2xl p-6 sm:p-7 border border-rose-500/20 backdrop-blur-md shadow-xl">
                      <h4 className="font-bold text-lg text-rose-400 mb-3 flex items-center gap-2">
                        <BrainCircuit className="w-5 h-5" /> 待提升模块
                      </h4>
                      <ul className="space-y-3">
                        {evaluation.weaknesses.map((w: string, i: number) => (
                          <li key={i} className="flex gap-3 text-slate-300 text-sm sm:text-base leading-relaxed items-start">
                            <span className="text-rose-500 mt-0.5 font-black">•</span>
                            <span>{w}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

              </div>
            </div>
          ) : (
            // Chat Interface
            <>
              {/* Chat Header */}
              <div className="p-4 border-b border-slate-200 bg-white flex justify-between items-center shrink-0">
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                  <BrainCircuit className="w-5 h-5 text-blue-600" />
                  费曼学习互动
                </h3>
                <div className="flex gap-2">
                  <button onClick={handleReset} title="重新开始" className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-full transition-colors">
                    <RefreshCw className="w-5 h-5" />
                  </button>
                  <button onClick={onClose} title="关闭" className="p-2 bg-rose-100 hover:bg-rose-200 text-rose-600 rounded-full transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 bg-slate-50/50">
                {messages.map((msg, idx) => (
                  <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-2xl px-5 py-3.5 shadow-sm ${
                      msg.role === 'user' 
                        ? 'bg-blue-600 text-white rounded-br-none' 
                        : 'bg-white border border-slate-200 text-slate-800 rounded-bl-none'
                    }`}>
                      {msg.role === 'model' && (
                        <div className="flex items-center gap-2 mb-2 text-xs font-bold text-blue-600">
                          <BrainCircuit className="w-4 h-4" /> AI 同学
                        </div>
                      )}
                      <div className="leading-relaxed whitespace-pre-wrap text-sm">
                        {msg.role === 'user' ? (
                          <span>{msg.content}</span>
                        ) : (
                          <FormattedMath text={msg.content} className={msg.role === 'user' ? "text-white !text-sm" : "text-slate-800 !text-sm"} />
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex justify-start">
                    <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-none px-5 py-4 shadow-sm flex gap-2 items-center">
                      <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Chat Input */}
              <div className="p-4 bg-white border-t border-slate-200 flex gap-3 items-end">
                <div className="flex-1 relative">
                  <textarea
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder="向 AI 同学讲解你的解题思路..."
                    className="w-full resize-none rounded-xl bg-slate-100 border-transparent focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 py-3 pl-4 pr-12 min-h-[52px] max-h-32 transition-all outline-none"
                    rows={input.split('\n').length > 1 ? Math.min(input.split('\n').length, 4) : 1}
                  />
                </div>
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || loading}
                  className="p-3.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-xl shadow-md transition-all flex items-center justify-center shrink-0"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
