import React from 'react';
import { db } from '../lib/db';
import { ChevronRight, Sparkles, Book, Clock } from 'lucide-react';
import FormattedMath, { InlineContent } from './FormattedMath';
import GeometryRenderer from './GeometryRenderer';
import {
  parseIndividualQuestions,
  parseIndividualSolutions,
  parseIndividualStudentAnswers,
  parseIndividualStandardAnswers,
  parseIndividualErrorAnalysis
} from '../lib/parser';

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
  const parsedQs = parseIndividualQuestions(question.originalText);
  const parsedSols = parseIndividualSolutions(question.solution);
  const parsedStudentAnswers = parseIndividualStudentAnswers(question.studentAnswer || '');
  const parsedStdAnswers = parseIndividualStandardAnswers(question.standardAnswer || '');

  if (parsedQs.length <= 1) {
    // 原有单题展示逻辑（向下兼容）
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-2 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3">
          <div className="flex items-center gap-1 text-[11px] font-bold text-indigo-750 bg-indigo-50 border border-indigo-200/60 px-2.5 py-1 rounded-lg">
            <span>📓 归属错题本：</span>
            <select
              value={question.notebookId || ''}
              onChange={async (e) => {
                const targetNbId = e.target.value;
                const targetNb = notebooks.find(n => n.id === targetNbId);
                const updated = {
                  ...question,
                  notebookId: targetNbId || undefined,
                  notebookName: targetNb ? targetNb.name : undefined
                };
                try {
                  await db.saveQuestion(updated);
                  if (onUpdate) {
                    onUpdate(updated);
                  }
                } catch (err: any) {
                  window.alert(err.message || '转移失败');
                }
              }}
              className="bg-transparent border-none outline-none font-bold text-indigo-850 cursor-pointer pl-0.5"
            >
              <option value="">未分类</option>
              {notebooks.map(nb => (
                <option key={nb.id} value={nb.id}>{nb.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <FormattedMath text={question.originalText} className="text-base text-slate-900 font-bold leading-relaxed" />
          {question.similarQuestion?.geometry && question.similarQuestion.geometry.type !== 'none' && (
            <div className="py-2">
              <GeometryRenderer geometry={question.similarQuestion.geometry} />
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-1.5">
            {question.knowledgePoints.map((p: string) => (
              <span key={p} className="text-xs bg-slate-50 text-slate-705 px-3 py-1 rounded-lg border border-slate-100 font-bold"># {p}</span>
            ))}
          </div>
        </div>

        {question.errorAnalysis && (
          <div className="border-t border-slate-100 pt-6 space-y-4">
            <div className="flex items-center gap-2 text-rose-600 font-extrabold text-sm">
              <span className="text-rose-600 font-bold">❌</span>
              <h4 className="text-slate-900 font-black text-sm">错因分析</h4>
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
  } else {
    // 多题折叠/分页展示逻辑
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-2 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3">
          <div className="flex items-center gap-1 text-[11px] font-bold text-indigo-750 bg-indigo-50 border border-indigo-200/60 px-2.5 py-1 rounded-lg">
            <span>📓 归属错题本：</span>
            <select
              value={question.notebookId || ''}
              onChange={async (e) => {
                const targetNbId = e.target.value;
                const targetNb = notebooks.find(n => n.id === targetNbId);
                const updated = {
                  ...question,
                  notebookId: targetNbId || undefined,
                  notebookName: targetNb ? targetNb.name : undefined
                };
                try {
                  await db.saveQuestion(updated);
                  if (onUpdate) {
                    onUpdate(updated);
                  }
                } catch (err: any) {
                  window.alert(err.message || '转移失败');
                }
              }}
              className="bg-transparent border-none outline-none font-bold text-indigo-850 cursor-pointer pl-0.5"
            >
              <option value="">未分类</option>
              {notebooks.map(nb => (
                <option key={nb.id} value={nb.id}>{nb.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex items-center justify-between bg-slate-50 p-4 rounded-2xl border border-slate-200/60">
          <h3 className="text-sm font-black text-slate-800 flex items-center gap-1.5">
            <span>📄</span> 本卷共包含 {parsedQs.length} 道题目
          </h3>
        </div>

        <div className="space-y-6">
          {parsedQs.map((qItem, iIdx) => {
            const stdAns = parsedStdAnswers[iIdx]?.content || '';
            const stuAns = parsedStudentAnswers[iIdx]?.content || '';
            const solText = parsedSols[iIdx]?.content || '';

            const parsedErrorAnalyses = parseIndividualErrorAnalysis(question.errorAnalysis || "");
            let subErrorAnalysis = "";
            if (parsedErrorAnalyses.length > 1 && parsedErrorAnalyses[iIdx]) {
              subErrorAnalysis = parsedErrorAnalyses[iIdx].content.replace(parsedErrorAnalyses[iIdx].number || '', '').trim();
            } else if (parsedErrorAnalyses.length === 1 && parsedQs.length > 1 && iIdx === 0) {
              subErrorAnalysis = parsedErrorAnalyses[0].content.replace(parsedErrorAnalyses[0].number || '', '').trim();
            }

            return (
              <div key={qItem.id} className="bg-slate-50/40 border border-slate-200/80 rounded-3xl p-6 space-y-5 shadow-sm hover:border-slate-300 transition-colors">
                {/* 题号头部 */}
                <div className="flex items-center justify-between pb-3 border-b border-slate-200/60">
                  <span className="text-xs font-black text-slate-900 bg-slate-200 px-3 py-1 rounded-lg">
                    第 {qItem.number} 题
                  </span>
                </div>

                {/* 题干 */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-slate-800 font-extrabold text-xs">
                    <span className="w-5 h-5 rounded-lg bg-blue-50 flex items-center justify-center border border-blue-100 text-[10px]">📖</span>
                    <h4>本题题干</h4>
                  </div>
                  <FormattedMath text={qItem.content} className="text-sm text-slate-905 font-bold leading-relaxed" />
                </div>

                {/* 学生作答与诊断步骤 / 错因分析 */}
                {subErrorAnalysis && (
                  <div className="border-t border-slate-100 pt-4 space-y-3">
                    <div className="flex items-center gap-2 text-rose-600 font-extrabold text-xs">
                      <span className="text-rose-600 font-bold">❌</span>
                      <h4 className="text-slate-900 font-black text-xs">错因分析</h4>
                    </div>

                    <div className="p-3.5 bg-white border border-slate-200/80 rounded-2xl text-[11px] leading-relaxed text-slate-700 font-medium whitespace-pre-wrap">
                      <FormattedMath text={subErrorAnalysis} />
                    </div>
                  </div>
                )}

                {/* 名师解析 */}
                {solText && (
                  <div className="border-t border-slate-100 pt-4 space-y-2">
                    <div className="flex items-center gap-2 text-blue-600 font-extrabold text-xs">
                      <Sparkles className="w-4 h-4 text-amber-500 animate-pulse" />
                      <h4>AI 智能辅导名师精解步骤</h4>
                    </div>
                    <div className="text-xs leading-relaxed text-slate-805">
                      <FormattedMath text={solText} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }
}
