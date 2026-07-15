import React, { useEffect, useState, useRef } from 'react';
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
  FolderSymlink,
  Folder
} from 'lucide-react';
import FormattedMath, { unwrapJsonText } from './FormattedMath';
import GeometryRenderer from './GeometryRenderer';
import ReadOnlyDetail, { BrainCircuitIcon } from './ReadOnlyDetail';


const GRADE_OPTIONS = [
  '一年级', '二年级', '三年级', '四年级', '五年级', '六年级',
  '初一', '初二', '初三',
  '高一', '高二', '高三'
];

function getAvailableSubjects(grade: string): string[] {
  const allSubjects = ['语文', '数学', '英语', '物理', '化学', '生物', '历史', '地理', '政治'];
  if (!grade) return allSubjects;

  if (['一年级', '二年级', '三年级', '四年级', '五年级', '六年级'].includes(grade)) {
    return ['语文', '数学', '英语'];
  }

  if (grade === '初一' || grade === '七年级') {
    return ['语文', '数学', '英语', '生物', '历史', '地理', '政治'];
  }

  if (grade === '初二' || grade === '八年级') {
    return ['语文', '数学', '英语', '物理', '生物', '历史', '地理', '政治'];
  }

  return allSubjects;
}

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

  const isMountedRef = useRef(true);
  const currentQuestionIdRef = useRef(question.id);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  useEffect(() => {
    currentQuestionIdRef.current = question.id;
  }, [question.id]);

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

  // 举一反三保存逻辑状态
  const [showVariationModal, setShowVariationModal] = useState(false);
  const [pendingVariationItem, setPendingVariationItem] = useState<{ item: any, idx: number } | null>(null);
  const [variationNotebooks, setVariationNotebooks] = useState<any[]>([]);
  const [selectedVariationNb, setSelectedVariationNb] = useState('');
  const [showCreateVarNbModal, setShowCreateVarNbModal] = useState(false);
  const [nbForm, setNbForm] = useState({ name: '公共题库', grade: '', subject: '', description: '' });
  const [showVarDropdown, setShowVarDropdown] = useState(false);

  useEffect(() => {
    if (variationNotebooks.length === 0) {
      const token = localStorage.getItem('errorbook_token');
      fetch('/api/notebooks?type=variation', {
        headers: { ...(token ? { 'Authorization': `Bearer ${token}` } : {}) }
      })
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) {
            setVariationNotebooks(data);
            if (data.length > 0) {
              setSelectedVariationNb(data[0].id);
            } else {
              setShowCreateVarNbModal(true);
            }
          }
        })
        .catch(err => console.error('加载AI变题库失败', err));
    }
  }, []);

  const handleCreateVariationNb = async () => {
    if (!nbForm.name.trim()) {
      window.alert('请输入变题本名称');
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
          type: 'variation',
          grade: nbForm.grade,
          subject: nbForm.subject,
          description: nbForm.description
        })
      });
      const data = await res.json();
      if (res.ok) {
        const nb = data.notebook || data;
        setVariationNotebooks(prev => [nb, ...prev]);
        setSelectedVariationNb(nb.id);
        setShowCreateVarNbModal(false);
        setNbForm({ name: '公共题库', grade: '', subject: '', description: '' });
      } else {
        window.alert(data.error || '创建失败');
      }
    } catch (err: any) {
      window.alert(err.message || '创建失败');
    }
  };

  useEffect(() => {
    setSavedStatus({});
  }, [similarData]);

  useEffect(() => {
    setSimilarData(question.similarQuestion || null);
  }, [question]);

  const handleDirectSaveVariation = async (item: any, idx: number) => {
    if (!selectedVariationNb) {
      window.alert("请先在上方选择一个AI变题本");
      return;
    }
    try {
      const newId = "q_similar_" + Math.random().toString(36).substring(2, 9);
      const selectedNbObj = variationNotebooks.find(n => n.id === selectedVariationNb);

      const kps = question.knowledgePoints.filter((k: string) => k !== "AI变式题");
      kps.push("AI变式题");

      const newQuestion: ErrorQuestion = {
        id: newId,
        originalText: item.questionText,
        subject: question.subject,
        knowledgePoints: kps,
        errorReason: "AI变式题",
        examDirection: "【变式强化题】 " + (question.examDirection || ""),
        solution: item.solution,
        createdAt: Date.now(),
        notebookId: selectedVariationNb,
        notebookName: selectedNbObj ? selectedNbObj.name : undefined,
        masteryStatus: "not_mastered",
        status: "audited",
        similarQuestion: item,
        imageUrl: "",
        userId: question.userId,
        studentId: question.studentId
      };

      await db.saveQuestion(newQuestion);
      setSavedStatus(prev => ({ ...prev, [idx]: true }));
      window.alert(`成功将变式题保存至AI变题本【${selectedNbObj?.name || '未知'}】！`);
    } catch (err: any) {
      window.alert(err.message || "保存失败，请重试");
    }
  };

  const isStudent = !isAdmin;

  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState(unwrapJsonText(question.originalText));
  const [editedSubject, setEditedSubject] = useState(question.subject);
  const [editedSolution, setEditedSolution] = useState(question.solution);
  const [editedErrorReason, setEditedErrorReason] = useState(question.errorReason);
  const [editedKp, setEditedKp] = useState(question.knowledgePoints.join(', '));
  const [selectedNotebook, setSelectedNotebook] = useState(question.notebookId || '');
  const [editedStudentAnswer, setEditedStudentAnswer] = useState(unwrapJsonText(question.studentAnswer || '', 'studentAnswer'));
  const [editedErrorAnalysis, setEditedErrorAnalysis] = useState(question.errorAnalysis || '');
  const [editedErrorDiagnosis, setEditedErrorDiagnosis] = useState<DiagnosisStep[]>(question.errorDiagnosis || []);
  const [editedExamDirection, setEditedExamDirection] = useState(question.examDirection || '');
  const [saving, setSaving] = useState(false);


  useEffect(() => {
    setEditedText(unwrapJsonText(question.originalText));
    setEditedSubject(question.subject);
    setEditedSolution(question.solution);
    setEditedErrorReason(question.errorReason);
    setEditedKp(question.knowledgePoints.join(', '));
    setSelectedNotebook(question.notebookId || '');
    setEditedStudentAnswer(unwrapJsonText(question.studentAnswer || '', 'studentAnswer'));
    setEditedErrorAnalysis(question.errorAnalysis || '');
    setEditedErrorDiagnosis(question.errorDiagnosis || []);
    setEditedExamDirection(question.examDirection || '');
    setIsEditing(false);
  }, [question]);

  const generateSimilar = async () => {
    if (generating) return;
    if (!selectedVariationNb) {
      window.alert("请先选择一个归属的AI变题本");
      return;
    }

    setGenerating(true);

    try {
      window.alert("正在拼命生成中，请耐心等待...");

      const token = localStorage.getItem('errorbook_token');
      const selectedNbObj = notebooks.find(n => n.id === question.notebookId);
      const originalGrade = selectedNbObj?.grade;

      const res = await fetch('/api/similar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          originalText: question.originalText,
          subject: question.subject,
          knowledgePoints: question.knowledgePoints,
          count: similarCount,
          grade: originalGrade,
          variantMode,
          visualContext: (question as any).visualContext || ''
        })
      });

      if (res.status === 401) {
        localStorage.removeItem('errorbook_token');
        localStorage.removeItem('errorbook_username');
        window.location.reload();
        throw new Error('登录已过期，请重新登录');
      }

      if (!res.ok) {
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('text/html')) {
          if (res.status === 504 || res.status === 502 || res.status === 500) {
            throw new Error(`AI 变式题计算与组图较复杂，线上网关处理超时 (${res.status})，请稍后重试或将生成数量改为 1 道。`);
          }
          throw new Error(`服务器网络响应异常 (${res.status})，请稍后重试。`);
        }
      }

      let data: any;
      try {
        data = await res.json();
      } catch (e) {
        throw new Error(`服务器回传数据格式异常，可能是推理时间过长导致连接中断，请稍后重新生成。`);
      }
      if (!res.ok) throw new Error(data.error || `请求失败 (${res.status})`);

      const dataArray = Array.isArray(data) ? data : [data];

      if (isMountedRef.current && currentQuestionIdRef.current === question.id) {
        setSimilarData(dataArray);
      }
    } catch (err: any) {
      console.error(err);
      if (isMountedRef.current && currentQuestionIdRef.current === question.id) {
        window.alert(err.message || '生成同类题失败，请重试');
      }
    } finally {
      if (isMountedRef.current && currentQuestionIdRef.current === question.id) {
        setGenerating(false);
      }
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

      {!((!isEditing) && (question.errorReason === 'AI变式题' || question.knowledgePoints?.includes('AI变式题') || question.examDirection?.includes('变式')) && !!question.similarQuestion) && (
        <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
          {question.imageUrl && question.errorReason !== 'AI变式题' && !question.knowledgePoints?.includes('AI变式题') && !question.examDirection?.includes('变式') && (
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
      )}

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
                          onClick={() => handleDirectSaveVariation(item, idx)}
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

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-0.5">归属AI变题本 (必选)</label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <button
                        type="button"
                        onClick={() => setShowVarDropdown(!showVarDropdown)}
                        className="w-full flex items-center justify-between p-3.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:border-blue-400 transition-all shadow-sm"
                      >
                        <span className="flex items-center gap-2">
                          <Folder className="w-4 h-4 text-blue-500/70" />
                          {selectedVariationNb ? variationNotebooks.find(n => n.id === selectedVariationNb)?.name : '请选择变题本...'}
                        </span>
                        <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${showVarDropdown ? 'rotate-90' : ''}`} />
                      </button>

                      {showVarDropdown && (
                        <>
                          <div className="fixed inset-0 z-30" onClick={() => setShowVarDropdown(false)} />
                          <div className="absolute left-0 top-full mt-2 w-full bg-white border border-slate-100 rounded-2xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.1)] p-1.5 z-40 animate-in fade-in slide-in-from-top-2 duration-200 max-h-48 overflow-y-auto">
                            {variationNotebooks.length === 0 ? (
                              <div className="p-3 text-center text-xs text-slate-400">暂无变题本</div>
                            ) : (
                              variationNotebooks.map(nb => (
                                <button
                                  key={nb.id}
                                  type="button"
                                  onClick={() => {
                                    setSelectedVariationNb(nb.id);
                                    setShowVarDropdown(false);
                                  }}
                                  className={`w-full text-left px-3 py-3 text-xs font-bold rounded-xl transition-all flex items-center justify-between ${selectedVariationNb === nb.id ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}
                                >
                                  {nb.name}
                                  {selectedVariationNb === nb.id && <Check className="w-4 h-4 text-blue-600" />}
                                </button>
                              ))
                            )}
                          </div>
                        </>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowCreateVarNbModal(true)}
                      className="px-4 py-3.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 transition shadow-sm cursor-pointer"
                    >
                      新建
                    </button>
                  </div>
                </div>

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
                  disabled={generating || !selectedVariationNb}
                  className={`w-full py-3.5 rounded-xl text-xs font-black transition cursor-pointer flex justify-center items-center gap-2 ${generating || !selectedVariationNb
                      ? 'bg-blue-400 text-white cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/10'
                    }`}
                >
                  {generating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> 正在拼命生成中，请耐心等待...
                    </>
                  ) : (
                    <>
                      <BrainCircuitIcon className="w-4 h-4" /> 开始智能生成推荐题
                    </>
                  )}
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

      {/* 新建变题本弹窗 */}
      {showCreateVarNbModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 border border-slate-100 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-1.5">
                <span>📓</span> 新建AI变题本
              </h3>
              <button
                onClick={() => setShowCreateVarNbModal(false)}
                className="w-8 h-8 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 mb-1 block">变题本名称</label>
                <input
                  type="text"
                  autoFocus
                  value={nbForm.name}
                  onChange={e => setNbForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="例如：初二常错题"
                  className="w-full px-4 py-3 h-[42px] bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-xl outline-none text-xs font-semibold focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-800"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600 mb-1 block">年级 (选填)</label>
                  <select
                    value={nbForm.grade}
                    onChange={e => {
                      const selectedGrade = e.target.value;
                      setNbForm(prev => {
                        const available = getAvailableSubjects(selectedGrade);
                        const newSubject = available.includes(prev.subject) ? prev.subject : (available[0] || '');
                        return {
                          ...prev,
                          grade: selectedGrade,
                          subject: newSubject
                        };
                      });
                    }}
                    className="w-full px-3 h-[42px] bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-xl outline-none text-xs font-semibold focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-700 cursor-pointer"
                  >
                    <option value="">选择年级</option>
                    {GRADE_OPTIONS.map(g => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600 mb-1 block">学科 (选填)</label>
                  <select
                    value={nbForm.subject}
                    onChange={e => setNbForm(prev => ({ ...prev, subject: e.target.value }))}
                    className="w-full px-3 h-[42px] bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-xl outline-none text-xs font-semibold focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-700 cursor-pointer"
                  >
                    <option value="">选择学科</option>
                    {getAvailableSubjects(nbForm.grade).map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 mb-1 block">描述 (选填)</label>
                <textarea
                  rows={3}
                  value={nbForm.description}
                  onChange={e => setNbForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="该变题本的主要内容"
                  className="w-full px-4 py-3 bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-xl outline-none text-xs font-semibold focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-none text-slate-800"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowCreateVarNbModal(false)}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200/80 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer text-center"
                >
                  取消
                </button>
                <button
                  onClick={handleCreateVariationNb}
                  className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-extrabold transition-all cursor-pointer shadow-md shadow-blue-500/10 text-center"
                >
                  确认创建
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
