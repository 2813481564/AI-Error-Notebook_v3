import React from 'react';
import { db } from '../lib/db';
import { ChevronRight, Sparkles, Book, Clock } from 'lucide-react';
import FormattedMath, { InlineContent } from './FormattedMath';
import GeometryRenderer from './GeometryRenderer';

export function TargetIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}

export function BrainCircuitIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
      <path d="M9 13a4.5 4.5 0 0 0 3-3" />
      <path d="M17.599 6.5a3 3 0 0 0 .399-5.375" />
      <path d="M15.266 12.5a3 3 0 1 0-2.24-4.5" />
      <path d="M16 16.5a3 3 0 1 1-2.91-4.05" />
      <path d="M18.5 13a4.5 4.5 0 0 1-3 3" />
    </svg>
  );
}

export default function ReadOnlyDetail({
  question,
  isStudent,
  onToggleMastery,
  notebooks = [],
  onUpdate
}: {
  question: any;
  isStudent: boolean;
  onToggleMastery?: () => void;
  notebooks?: any[];
  onUpdate?: (updated: any) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <FormattedMath text={question.originalText} className="text-base text-slate-900 font-bold leading-relaxed" />
        {question.errorReason === 'AI变式题' && question.similarQuestion?.geometry && question.similarQuestion.geometry.type !== 'none' && (
          <div className="py-2">
            <GeometryRenderer geometry={question.similarQuestion.geometry} />
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {question.examDirection && (
            <span className="text-xs bg-blue-50 text-blue-600 px-3 py-1 rounded-lg border border-blue-200/60 font-bold">🎯 {question.examDirection}</span>
          )}
          {question.errorReason && question.errorReason !== 'AI变式题' && (
            <span className={`text-xs px-3 py-1 rounded-lg border font-bold ${
              question.errorReason.includes('完全掌握') ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
              question.errorReason.includes('概念/审题') ? 'bg-orange-100 text-orange-700 border-orange-200' :
              question.errorReason.includes('逻辑/建模') ? 'bg-pink-100 text-pink-700 border-pink-200' :
              question.errorReason.includes('计算/执行') ? 'bg-yellow-100 text-yellow-800 border-yellow-200' :
              question.errorReason.includes('规范/表达') ? 'bg-teal-100 text-teal-700 border-teal-200' :
              'bg-rose-50 text-rose-600 border-rose-100'
            }`}>
              {question.errorReason.includes('完全掌握') ? '✅' : '⚠️'} {question.errorReason}
            </span>
          )}
          {question.knowledgePoints.map((p: string) => (
            <span key={p} className="text-xs bg-purple-50 text-purple-600 px-3 py-1 rounded-lg border border-purple-200 font-bold">📖 {p}</span>
          ))}
        </div>
      </div>
      
      {/* 学生手写提取作答文本（如果有） */}
      {question.studentAnswer && (
        <div className="border-t border-slate-100 pt-6 space-y-4">
          <div className="flex items-center gap-2 font-extrabold text-sm text-blue-600">
            <span className="font-bold">📝</span>
            <h4 className="text-slate-900 font-black text-sm">您的作答内容</h4>
          </div>
          <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl text-xs sm:text-sm leading-relaxed text-slate-700 font-medium whitespace-pre-wrap">
            <FormattedMath text={question.studentAnswer} />
          </div>
        </div>
      )}

      {question.errorAnalysis && (
        <div className="border-t border-slate-100 pt-6 space-y-4">
          <div className={`flex items-center gap-2 font-extrabold text-sm ${question.errorReason?.includes('完全掌握') ? 'text-emerald-600' : 'text-rose-600'}`}>
            <span className="font-bold">{question.errorReason?.includes('完全掌握') ? '✅' : '❌'}</span>
            <h4 className="text-slate-900 font-black text-sm">{question.errorReason?.includes('完全掌握') ? '诊断分析' : '错因分析'}</h4>
          </div>

          <div className="p-4 bg-white border border-slate-200/80 rounded-2xl text-xs sm:text-sm leading-relaxed text-slate-700 font-medium whitespace-pre-wrap">
            <FormattedMath text={question.errorAnalysis} />
          </div>
        </div>
      )}

      <div className="border-t border-slate-100 pt-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h4 className="flex items-center gap-2 text-blue-600 font-extrabold text-sm">
            <Sparkles className="w-4 h-4 text-amber-500 animate-pulse" /> AI 智能辅导名师精解步骤
          </h4>
        </div>
        <FormattedMath text={question.solution} className="text-slate-805" />
      </div>
    </div>
  );
}
