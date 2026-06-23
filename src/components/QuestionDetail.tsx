import React, { useEffect, useState } from 'react';
import { db, ErrorQuestion, DiagnosisStep } from '../lib/db';
import {
  ArrowLeft,
  Trash2,
  Loader2,
  RefreshCw,
  Check,
  PlusCircle,
  ChevronRight,
  Sparkles,
  CheckCircle2,
  FolderSymlink
} from 'lucide-react';
import FormattedMath from './FormattedMath';
import GeometryRenderer from './GeometryRenderer';
import ReadOnlyDetail, { BrainCircuitIcon } from './ReadOnlyDetail';
import { parseIndividualQuestions } from '../lib/parser';

export default function QuestionDetail({
  question,
  notebooks,
  isAdmin,
  onBack,
  onDelete,
  onUpdate
}: {
  question: ErrorQuestion,
  notebooks: { id: string; name: string; grade?: string }[],
  isAdmin: boolean,
  onBack: () => void,
  onDelete: () => void,
  onUpdate?: (updated: ErrorQuestion) => void
}) {
  const [similarTabActive, setSimilarTabActive] = useState(false);
  const [similarData, setSimilarData] = useState<any>(question.similarQuestion || null);
  const [generating, setGenerating] = useState(false);
  const [showMoveDropdown, setShowMoveDropdown] = useState(false);

  const handleToggleMasteryStatus = async () => {
    const nextStatus = question.masteryStatus === 'mastered' ? 'not_mastered' : 'mastered';
    try {
      await db.updateQuestionMastery(question.id, nextStatus);
      const updatedQuestion: ErrorQuestion = {
        ...question,
        masteryStatus: nextStatus
      };
      if (onUpdate) {
        onUpdate(updatedQuestion);
      }
    } catch (err: any) {
      window.alert(err.message || '更新掌握状态失败');
    }
  };

  const handleMoveToNotebook = async (targetNbId?: string) => {
    try {
      const targetNb = notebooks.find(n => n.id === targetNbId);
      const updatedQuestion: ErrorQuestion = {
        ...question,
        notebookId: targetNbId || undefined,
        notebookName: targetNb ? targetNb.name : undefined
      };
      await db.saveQuestion(updatedQuestion);
      if (onUpdate) {
        onUpdate(updatedQuestion);
      }
      setShowMoveDropdown(false);
    } catch (err: any) {
      window.alert(err.message || '移动失败，请重试');
    }
  };

  // 用于支持多道题数量选择与保存状态跟踪
  const [similarCount, setSimilarCount] = useState<number>(1);
  const [variantMode, setVariantMode] = useState<'同考点换壳' | '条件升级' | '逆向陷阱'>('同考点换壳');
  const [savedStatus, setSavedStatus] = useState<Record<number, boolean>>({});

  // 解析题干中包含的子题
  const parsedQs = parseIndividualQuestions(question.originalText);
  const [selectedSubQIndex, setSelectedSubQIndex] = useState<number>(0);

  useEffect(() => {
    setSavedStatus({});
  }, [similarData]);

  useEffect(() => {
    setSelectedSubQIndex(0);
    setSimilarData(question.similarQuestion || null);
  }, [question]);

  const handleSaveSimilarItem = async (item: any, idx: number) => {
    try {
      const newId = "q_similar_" + Math.random().toString(36).substring(2, 9);
      const selectedNbObj = notebooks.find(n => n.id === question.notebookId);
      const newQuestion: ErrorQuestion = {
        id: newId,
        originalText: item.questionText,
        subject: question.subject,
        knowledgePoints: [...question.knowledgePoints, "AI变式题"],
        errorReason: "AI变式题",
        solution: item.solution,
        createdAt: Date.now(),
        notebookId: question.notebookId,
        notebookName: selectedNbObj ? selectedNbObj.name : undefined,
        masteryStatus: "not_mastered",
        status: "audited",
        similarQuestion: item
      };

      await db.saveQuestion(newQuestion);
      setSavedStatus(prev => ({ ...prev, [idx]: true }));
      window.alert(`成功将变式题 ${idx + 1} 保存至错题库！您可以直接在“组卷练习”中进行添加。`);
    } catch (err: any) {
      window.alert(err.message || "保存失败，请重试");
    }
  };

  const isStudent = !isAdmin;

  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState(question.originalText);
  const [editedSubject, setEditedSubject] = useState(question.subject);
  const [editedSolution, setEditedSolution] = useState(question.solution);
  const [editedErrorReason, setEditedErrorReason] = useState(question.errorReason);
  const [editedKp, setEditedKp] = useState(question.knowledgePoints.join(', '));
  const [selectedNotebook, setSelectedNotebook] = useState(question.notebookId || '');
  const [editedStudentAnswer, setEditedStudentAnswer] = useState(question.studentAnswer || '');
  const [editedErrorAnalysis, setEditedErrorAnalysis] = useState(question.errorAnalysis || '');
  const [editedErrorDiagnosis, setEditedErrorDiagnosis] = useState<DiagnosisStep[]>(question.errorDiagnosis || []);
  const [editedExamDirection, setEditedExamDirection] = useState(question.examDirection || '');
  const [saving, setSaving] = useState(false);


  useEffect(() => {
    setEditedText(question.originalText);
    setEditedSubject(question.subject);
    setEditedSolution(question.solution);
    setEditedErrorReason(question.errorReason);
    setEditedKp(question.knowledgePoints.join(', '));
    setSelectedNotebook(question.notebookId || '');
    setEditedStudentAnswer(question.studentAnswer || '');
    setEditedErrorAnalysis(question.errorAnalysis || '');
    setEditedErrorDiagnosis(question.errorDiagnosis || []);
    setEditedExamDirection(question.examDirection || '');
    setIsEditing(false);
  }, [question]);

  const generateSimilar = async () => {
    if (generating) return;

    setGenerating(true);
    try {
      const token = localStorage.getItem('errorbook_token');
      const selectedNbObj = notebooks.find(n => n.id === question.notebookId);
      const originalGrade = selectedNbObj?.grade;

      let targetText = question.originalText;
      if (parsedQs.length > 1 && selectedSubQIndex >= 0 && selectedSubQIndex < parsedQs.length) {
        targetText = parsedQs[selectedSubQIndex].content;
      }

      const res = await fetch('/api/similar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          originalText: targetText,
          subject: question.subject,
          knowledgePoints: question.knowledgePoints,
          count: similarCount,
          grade: originalGrade,
          variantMode
        })
      });

      if (res.status === 401) {
        localStorage.removeItem('errorbook_token');
        localStorage.removeItem('errorbook_username');
        window.location.reload();
        throw new Error('登录已过期，请重新登录');
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSimilarData(data);

      const updatedQuestion = { ...question, similarQuestion: data };
      await db.saveQuestion(updatedQuestion);
      if (onUpdate) {
        onUpdate(updatedQuestion);
      }
    } catch (err: any) {
      console.error(err);
      window.alert(err.message || '生成同类题失败，请重试');
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveAndPush = async (newStatus: 'pending' | 'audited') => {
    setSaving(true);
    try {
      const selectedNbObj = notebooks.find(n => n.id === selectedNotebook);
      const updatedQuestion: ErrorQuestion = {
        ...question,
        originalText: editedText,
        subject: editedSubject,
        solution: editedSolution,
        errorReason: editedErrorReason,
        knowledgePoints: editedKp.split(',').map(s => s.trim()).filter(Boolean),
        notebookId: selectedNotebook || undefined,
        notebookName: selectedNbObj ? selectedNbObj.name : undefined,
        status: newStatus,
        studentAnswer: editedStudentAnswer,
        errorAnalysis: editedErrorAnalysis,
        errorDiagnosis: editedErrorDiagnosis,
        examDirection: editedExamDirection
      };
      await db.saveQuestion(updatedQuestion);
      if (onUpdate) {
        onUpdate(updatedQuestion);
      }
      setIsEditing(false);
      window.alert('修改保存成功！');
    } catch (err: any) {
      window.alert(err.message || '操作失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300 w-full">

      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-2 text-slate-500 hover:text-slate-950 font-bold text-sm transition-colors">
          <ArrowLeft className="w-4 h-4" />
          <span>返回列表</span>
        </button>
        <div className="flex items-center gap-2">
          {!isStudent && (
            <button
              onClick={() => setIsEditing(!isEditing)}
              className={`text-xs font-bold px-4 py-2 rounded-xl transition-all border ${isEditing
                ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
            >
              {isEditing ? '取消修改' : '编辑与审核推送'}
            </button>
          )}
          {!isStudent && (
            <button onClick={onDelete} className="text-rose-500 hover:bg-rose-50 p-2 rounded-xl transition-colors">
              <Trash2 className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
        {question.imageUrl && (
          <div className="w-full bg-slate-50/50 border-b border-slate-100 flex justify-center py-5 px-4">
            <img
              src={question.imageUrl}
              alt="错题原图"
              className="max-h-[380px] w-auto object-contain rounded-xl shadow-sm border border-slate-200/50 animate-in fade-in zoom-in-95 duration-300"
            />
          </div>
        )}

        <div className="p-6 md:p-8 space-y-6">
          {isEditing ? (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1">学科分类</label>
                  <input
                    type="text"
                    value={editedSubject}
                    onChange={e => setEditedSubject(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-semibold text-slate-800"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1">错误原因</label>
                  <input
                    type="text"
                    value={editedErrorReason}
                    onChange={e => setEditedErrorReason(e.target.value)}
                    placeholder="如：【概念/审题】读题粗心"
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-semibold text-slate-800"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1">考察方向 (选填)</label>
                <input
                  type="text"
                  value={editedExamDirection}
                  onChange={e => setEditedExamDirection(e.target.value)}
                  placeholder="如：函数最值与导数综合"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none text-sm font-semibold text-slate-800"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1">题目完整文本 (LaTeX 数学公式请保持格式)</label>
                <textarea
                  value={editedText}
                  onChange={e => setEditedText(e.target.value)}
                  rows={6}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-semibold text-slate-800"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1">考查核心知识点 (用英文逗号分隔)</label>
                <input
                  type="text"
                  value={editedKp}
                  onChange={e => setEditedKp(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-semibold text-slate-800"
                  placeholder="如：二次函数, 极值点"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1">名师精解与步骤引导 (LaTeX 数学公式请保持格式)</label>
                <textarea
                  value={editedSolution}
                  onChange={e => setEditedSolution(e.target.value)}
                  rows={8}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-semibold text-slate-800"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1">学生完整手写作答文本（OCR提取结果）</label>
                <textarea
                  value={editedStudentAnswer}
                  onChange={e => setEditedStudentAnswer(e.target.value)}
                  rows={4}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-semibold text-slate-800"
                  placeholder="学生的完整手写作答过程文本"
                />
              </div>

              <div className="space-y-3 pt-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1">AI 错因深度剖析 (包含常见错误与根本原因，数学公式请保持格式)</label>
                <textarea
                  value={editedErrorAnalysis}
                  onChange={e => setEditedErrorAnalysis(e.target.value)}
                  rows={5}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-semibold text-slate-800 mb-4"
                  placeholder="请输入本题错因深度剖析..."
                />
              </div>

              {/* 修改所属错题本分类 */}
              <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5 space-y-4">
                <div>
                  <h4 className="text-xs font-black text-blue-900 uppercase tracking-wider flex items-center gap-1.5">
                    <span>📓</span> 调整归属错题本
                  </h4>
                  <p className="text-[10px] text-blue-600/80 mt-0.5 font-medium">选择此题目归属的错题本，以便在错题库中进行分类归纳管理。</p>
                </div>
                <select
                  value={selectedNotebook}
                  onChange={e => setSelectedNotebook(e.target.value)}
                  className="w-full p-3 bg-white border border-blue-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold text-slate-850"
                >
                  <option value="">-- 请选择所属错题本 (选填，留空归为未分类) --</option>
                  {notebooks.map(nb => (
                    <option key={nb.id} value={nb.id}>{nb.name}</option>
                  ))}
                </select>

                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <button
                    onClick={() => handleSaveAndPush('audited')}
                    disabled={saving}
                    className="flex-1 py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black shadow-lg shadow-blue-500/10 transition cursor-pointer"
                  >
                    {saving ? '正在保存...' : '审核通过并推送'}
                  </button>
                  <button
                    onClick={() => handleSaveAndPush('pending')}
                    disabled={saving}
                    className="flex-1 py-3.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-black shadow-lg shadow-slate-900/10 transition"
                  >
                    仅保存修改
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <ReadOnlyDetail
              question={question}
              isStudent={isStudent}
              notebooks={notebooks}
              onUpdate={onUpdate}
            />
          )}
        </div>
      </div>

      {/* 错题举一反三 */}
      {!isEditing && (
        <div className="bg-white border-2 border-blue-100 rounded-3xl p-6 md:p-8 animate-in slide-in-from-bottom-2 fade-in shadow-sm">
          {generating ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-4">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
              <p className="text-slate-600 font-bold tracking-wide animate-pulse">AI 正在深度关联题库并分析难度，为您生成相似变式强化练习题...</p>
            </div>
          ) : similarData ? (
            <div className="space-y-6">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-2">
                <div className="flex items-center gap-2 text-blue-855 font-bold">
                  <span className="w-7 h-7 bg-blue-100 rounded-lg flex items-center justify-center text-xs font-extrabold">练</span>
                  <h4 className="text-sm font-extrabold text-slate-800">高频错点相似强化训练题</h4>
                </div>
                <button
                  type="button"
                  onClick={() => setSimilarData(null)}
                  className="text-xs text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> 重新配置与生成
                </button>
              </div>

              <div className="space-y-6">
                {(Array.isArray(similarData) ? similarData : [similarData]).map((item, idx) => {
                  const isSaved = savedStatus[idx];
                  return (
                    <div key={idx} className="bg-slate-50/40 border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm hover:border-slate-300 transition-colors">
                      <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                        <span className="text-xs font-black text-slate-800 bg-slate-200 px-3 py-1 rounded-lg">
                          变式题 {idx + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleSaveSimilarItem(item, idx)}
                          disabled={isSaved}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm ${isSaved
                            ? 'bg-emerald-50 border border-emerald-200 text-emerald-700 cursor-default'
                            : 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer'
                            }`}
                        >
                          {isSaved ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                              <span>已存入错题库</span>
                            </>
                          ) : (
                            <>
                              <PlusCircle className="w-3.5 h-3.5 text-white" />
                              <span>保存至错题库</span>
                            </>
                          )}
                        </button>
                      </div>

                      {item.geometry && item.geometry.type !== 'none' && (
                        <div className="py-2 bg-white rounded-xl p-2 border border-slate-100">
                          <GeometryRenderer geometry={item.geometry} />
                        </div>
                      )}

                      <FormattedMath text={item.questionText} className="text-slate-900 text-sm font-semibold leading-relaxed" />

                      <details className="group border border-slate-200 rounded-xl overflow-hidden [&_summary::-webkit-details-marker]:hidden bg-white shadow-sm">
                        <summary className="cursor-pointer bg-slate-55/70 p-3 font-bold text-slate-700 flex justify-between items-center group-open:border-b border-slate-200 text-xs">
                          精编解答步骤与知识梳理 (点击展开)
                          <ChevronRight className="w-4 h-4 text-slate-400 group-open:rotate-90 transition-transform" />
                        </summary>
                        <div className="p-4 bg-white">
                          <FormattedMath text={item.solution} className="text-slate-805 text-xs leading-relaxed" />
                        </div>
                      </details>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="space-y-6 animate-in fade-in duration-300">
              <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-5 space-y-4">
                <div>
                  <h4 className="text-xs font-black text-blue-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-amber-500 animate-pulse" /> AI 智能同类变式题推荐 (错题举一反三)
                  </h4>
                  <p className="text-[13px] text-blue-700/80 mt-1 font-medium leading-relaxed">
                    系统已自动锁定当前原题的难度水平、考查知识点与所属年级学段，将为您精确定制出高质量的相似变式题，用于针对性强化巩固。
                  </p>
                </div>

                {parsedQs.length > 1 && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-0.5">选择生成推荐题的子题</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {parsedQs.map((qItem, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setSelectedSubQIndex(idx)}
                          className={`p-3 text-left text-xs font-semibold rounded-xl border transition-all ${selectedSubQIndex === idx
                            ? 'bg-blue-50 border-blue-500 text-blue-805 ring-1 ring-blue-500 shadow-sm'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                            }`}
                        >
                          <div className="font-bold text-slate-800 mb-0.5">{qItem.number || `第 ${idx + 1} 题`}</div>
                          <div className="text-[10px] text-slate-500 truncate">{qItem.content}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-0.5">选择变式训练模式</label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {(['同考点换壳', '条件升级', '逆向陷阱'] as const).map(mode => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setVariantMode(mode)}
                        className={`py-3 px-1 text-[11px] sm:text-xs font-bold rounded-xl border transition-all ${variantMode === mode
                          ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-600/10'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-0.5">选择生成题目数量</label>
                  <div className="flex gap-2.5">
                    {[1, 2, 3].map(c => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setSimilarCount(c)}
                        className={`flex-1 py-3 text-xs font-bold rounded-xl border transition-all ${similarCount === c
                          ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-600/10'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                      >
                        {c} 道题
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={generateSimilar}
                  className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black shadow-lg shadow-blue-500/10 transition cursor-pointer flex justify-center items-center gap-2"
                >
                  <BrainCircuitIcon className="w-4 h-4" /> 开始智能生成推荐题
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 底部快捷操作按钮 */}
      {!isEditing && (
        <div className="flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-slate-100 relative z-20">
          {/* 标记已掌握按钮 */}
          <button
            onClick={handleToggleMasteryStatus}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer active:scale-95 border ${question.masteryStatus === 'mastered'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 hover:text-slate-900'
              }`}
          >
            <CheckCircle2 className={`w-4 h-4 ${question.masteryStatus === 'mastered' ? 'text-emerald-600 fill-emerald-50' : 'text-slate-500'}`} />
            <span>{question.masteryStatus === 'mastered' ? '标记为未掌握' : '标记为已掌握'}</span>
          </button>

          {/* 移动按钮 */}
          <div className="relative">
            <button
              onClick={() => setShowMoveDropdown(!showMoveDropdown)}
              className="flex items-center gap-2 px-5 py-2.5 bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100 hover:text-slate-900 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer active:scale-95"
            >
              <FolderSymlink className="w-4 h-4 text-slate-500" />
              <span>移动</span>
            </button>

            {/* 移动归属下拉菜单 */}
            {showMoveDropdown && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setShowMoveDropdown(false)}
                />
                <div className="absolute right-0 bottom-full mb-2 w-56 bg-white border border-slate-200 rounded-2xl shadow-xl p-2 z-40 animate-in fade-in slide-in-from-bottom-2 duration-200 max-h-60 overflow-y-auto">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-3 py-1.5 border-b border-slate-100 mb-1">
                    选择目标错题本
                  </div>
                  <button
                    onClick={() => handleMoveToNotebook(undefined)}
                    className={`w-full text-left px-3 py-2 text-xs font-bold rounded-lg hover:bg-slate-50 transition-colors flex items-center justify-between cursor-pointer ${!question.notebookId ? 'text-blue-600 bg-blue-50/50' : 'text-slate-700'}`}
                  >
                    <span>未分类错题</span>
                    {!question.notebookId && <Check className="w-3.5 h-3.5 text-blue-600" />}
                  </button>
                  {notebooks.map(nb => (
                    <button
                      key={nb.id}
                      onClick={() => handleMoveToNotebook(nb.id)}
                      className={`w-full text-left px-3 py-2 text-xs font-bold rounded-lg hover:bg-slate-50 transition-colors flex items-center justify-between cursor-pointer ${question.notebookId === nb.id ? 'text-blue-600 bg-blue-50/50' : 'text-slate-700'}`}
                    >
                      <span className="truncate">{nb.name}</span>
                      {question.notebookId === nb.id && <Check className="w-3.5 h-3.5 text-blue-600" />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* 删除错题按钮 */}
          <button
            onClick={onDelete}
            className="flex items-center gap-2 px-5 py-2.5 bg-white hover:bg-rose-50 border border-rose-200 rounded-xl text-xs font-bold text-rose-500 transition-all shadow-sm cursor-pointer active:scale-95"
          >
            <Trash2 className="w-4 h-4 text-rose-500" />
            <span>删除错题</span>
          </button>
        </div>
      )}
    </div>
  );
}
