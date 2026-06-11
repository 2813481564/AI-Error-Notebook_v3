import React from 'react';

interface SavedPapersProps {
  onNavigate: (view: any) => void;
  onOpenPaper: (questions: any[]) => void;
}

export default function SavedPapers({ onNavigate, onOpenPaper }: SavedPapersProps) {
  return (
    <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
      <h2 className="text-2xl font-bold mb-4 text-slate-900">我的试卷</h2>
      <p className="text-slate-500 mb-6">正在构建试卷列表管理面板...</p>
    </div>
  );
}
