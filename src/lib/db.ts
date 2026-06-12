export interface SimilarQuestion {
  questionText: string;
  solution: string;
  geometry?: any;
}

export interface DiagnosisStep {
  stepNumber: number;
  stepContent: string;
  status: 'correct' | 'incorrect' | 'consequential_error';
  comment?: string;
}

export interface ErrorQuestion {
  id: string;
  imageUrl?: string;
  originalText: string;
  subject: string;
  knowledgePoints: string[];
  errorReason: string;
  solution: string;
  createdAt: number;
  similarQuestion?: SimilarQuestion;
  studentId?: string;
  status?: 'pending' | 'audited';
  masteryStatus?: 'not_mastered' | 'mastered';
  studentAnswer?: string;
  errorDiagnosis?: DiagnosisStep[];
  paperName?: string;
  standardAnswer?: string;
  score?: number;
  notebookId?: string;
  notebookName?: string;
}

export interface Stats {
  total: number;
  bySubject: Record<string, number>;
  weakPoints: { point: string; count: number }[];
}

export interface SavedPaper {
  id: string;
  title: string;
  userId: string;
  createdAt: number;
  questionIds: string[];
  mode: 'original' | 'variant';
}


function getHeaders(): HeadersInit {
  const token = localStorage.getItem('errorbook_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
}

// Net wrapper around SQLite API endpoints
export const db = {
  async getAllQuestions(): Promise<ErrorQuestion[]> {
    const res = await fetch('/api/questions', {
      headers: getHeaders()
    });
    if (res.status === 401) {
      localStorage.removeItem('errorbook_token');
      localStorage.removeItem('errorbook_username');
      window.location.reload();
      throw new Error('登录已过期，请重新登录');
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || '获取错题失败');
    }
    return res.json();
  },

  async saveQuestion(question: ErrorQuestion): Promise<void> {
    const res = await fetch('/api/questions', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(question)
    });
    if (res.status === 401) {
      localStorage.removeItem('errorbook_token');
      localStorage.removeItem('errorbook_username');
      window.location.reload();
      throw new Error('登录已过期，请重新登录');
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || '保存错题失败');
    }
  },

  async updateQuestionMastery(id: string, masteryStatus: 'not_mastered' | 'mastered'): Promise<void> {
    const res = await fetch(`/api/questions/${id}/mastery`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ masteryStatus })
    });
    if (res.status === 401) {
      localStorage.removeItem('errorbook_token');
      localStorage.removeItem('errorbook_username');
      window.location.reload();
      throw new Error('登录已过期，请重新登录');
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || '更新掌握状态失败');
    }
  },

  async deleteQuestion(id: string): Promise<void> {
    const res = await fetch(`/api/questions/${id}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    if (res.status === 401) {
      localStorage.removeItem('errorbook_token');
      localStorage.removeItem('errorbook_username');
      window.location.reload();
      throw new Error('登录已过期，请重新登录');
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || '删除错题失败');
    }
  },

  async getAllPublicQuestions(): Promise<ErrorQuestion[]> {
    const res = await fetch('/api/public-questions', {
      headers: getHeaders()
    });
    if (res.status === 401) {
      localStorage.removeItem('errorbook_token');
      localStorage.removeItem('errorbook_username');
      window.location.reload();
      throw new Error('登录已过期，请重新登录');
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || '获取公共题库失败');
    }
    return res.json();
  },

  async savePublicQuestion(question: Omit<ErrorQuestion, 'status' | 'studentId'>): Promise<void> {
    const res = await fetch('/api/public-questions', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(question)
    });
    if (res.status === 401) {
      localStorage.removeItem('errorbook_token');
      localStorage.removeItem('errorbook_username');
      window.location.reload();
      throw new Error('登录已过期，请重新登录');
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || '保存至公共题库失败');
    }
  },

  async deletePublicQuestion(id: string): Promise<void> {
    const res = await fetch(`/api/public-questions/${id}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    if (res.status === 401) {
      localStorage.removeItem('errorbook_token');
      localStorage.removeItem('errorbook_username');
      window.location.reload();
      throw new Error('登录已过期，请重新登录');
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || '从公共题库删除失败');
    }
  },

  async getAllPapers(): Promise<SavedPaper[]> {
    const res = await fetch('/api/papers', {
      headers: getHeaders()
    });
    if (res.status === 401) {
      localStorage.removeItem('errorbook_token');
      localStorage.removeItem('errorbook_username');
      window.location.reload();
      throw new Error('登录已过期，请重新登录');
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || '获取试卷列表失败');
    }
    return res.json();
  },

  async savePaper(title: string, questionIds: string[], mode: 'original' | 'variant'): Promise<void> {
    const res = await fetch('/api/papers', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ title, questionIds, mode })
    });
    if (res.status === 401) {
      localStorage.removeItem('errorbook_token');
      localStorage.removeItem('errorbook_username');
      window.location.reload();
      throw new Error('登录已过期，请重新登录');
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || '保存试卷失败');
    }
  },

  async deletePaper(id: string): Promise<void> {
    const res = await fetch(`/api/papers/${id}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    if (res.status === 401) {
      localStorage.removeItem('errorbook_token');
      localStorage.removeItem('errorbook_username');
      window.location.reload();
      throw new Error('登录已过期，请重新登录');
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || '删除试卷失败');
    }
  },

  async getTasks(): Promise<any[]> {
    const res = await fetch('/api/tasks', {
      headers: getHeaders()
    });
    if (res.status === 401) {
      localStorage.removeItem('errorbook_token');
      localStorage.removeItem('errorbook_username');
      window.location.reload();
      throw new Error('登录已过期，请重新登录');
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || '获取任务列表失败');
    }
    return res.json();
  },

  async createTask(taskData: { taskName: string; autoRun: number; uploadMode: string; notebookId?: string; payload: any }): Promise<{ success: boolean; taskId: string }> {
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(taskData)
    });
    if (res.status === 401) {
      localStorage.removeItem('errorbook_token');
      localStorage.removeItem('errorbook_username');
      window.location.reload();
      throw new Error('登录已过期，请重新登录');
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || '创建后台任务失败');
    }
    return res.json();
  },

  async submitTaskReview(taskId: string, reviewData: { step: 2 | 3; payload: any }): Promise<{ success: boolean }> {
    const res = await fetch(`/api/tasks/${taskId}/review`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(reviewData)
    });
    if (res.status === 401) {
      localStorage.removeItem('errorbook_token');
      localStorage.removeItem('errorbook_username');
      window.location.reload();
      throw new Error('登录已过期，请重新登录');
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || '提交任务审核失败');
    }
    return res.json();
  },

  async deleteTask(taskId: string): Promise<void> {
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    if (res.status === 401) {
      localStorage.removeItem('errorbook_token');
      localStorage.removeItem('errorbook_username');
      window.location.reload();
      throw new Error('登录已过期，请重新登录');
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || '删除任务失败');
    }
  }
};

