import React from 'react';

interface CreatePaperExerciseProps {
  onNavigate: (view: any) => void;
  onGeneratePaper: (questions: any[]) => void;
}

export default function CreatePaperExercise({ onNavigate, onGeneratePaper }: CreatePaperExerciseProps) {
  return (
    <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
      <h2 className="text-2xl font-bold mb-4 text-slate-900">组卷练习</h2>
      <p className="text-slate-500 mb-6">正在构建智能组卷面板...</p>
    </div>
  );
}
