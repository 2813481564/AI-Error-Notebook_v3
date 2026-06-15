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
  similarQuestion?: SimilarQuestion | SimilarQuestion[];
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


const API_PREFIX = '/api';

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
    const res = await fetch(`${API_PREFIX}/questions`, {
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
    const res = await fetch(`${API_PREFIX}/questions`, {
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
    const res = await fetch(`${API_PREFIX}/questions/${id}/mastery`, {
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
    const res = await fetch(`${API_PREFIX}/questions/${id}`, {
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
    const res = await fetch(`${API_PREFIX}/public-questions`, {
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
    const res = await fetch(`${API_PREFIX}/public-questions`, {
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
    const res = await fetch(`${API_PREFIX}/public-questions/${id}`, {
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
    const res = await fetch(`${API_PREFIX}/papers`, {
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
    const res = await fetch(`${API_PREFIX}/papers`, {
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
    const res = await fetch(`${API_PREFIX}/papers/${id}`, {
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
    const res = await fetch(`${API_PREFIX}/tasks`, {
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
    const res = await fetch(`${API_PREFIX}/tasks`, {
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
    const res = await fetch(`${API_PREFIX}/tasks/${taskId}/review`, {
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
    const res = await fetch(`${API_PREFIX}/tasks/${taskId}`, {
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
  },

  async setTaskNotified(taskId: string): Promise<void> {
    const res = await fetch(`${API_PREFIX}/tasks/${taskId}/notified`, {
      method: 'POST',
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
      throw new Error(data.error || '设置任务通知状态失败');
    }
  },

  async getPaginatedQuestions(params: {
    page: number;
    limit: number;
    subject?: string;
    notebookId?: string;
    masteryStatus?: string;
    search?: string;
  }): Promise<{ total: number; page: number; limit: number; questions: ErrorQuestion[] }> {
    const query = new URLSearchParams({
      page: String(params.page),
      limit: String(params.limit),
      ...(params.subject ? { subject: params.subject } : {}),
      ...(params.notebookId ? { notebookId: params.notebookId } : {}),
      ...(params.masteryStatus ? { masteryStatus: params.masteryStatus } : {}),
      ...(params.search ? { search: params.search } : {})
    }).toString();

    const res = await fetch(`${API_PREFIX}/questions?${query}`, {
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
      throw new Error(data.error || '获取分页错题失败');
    }
    return res.json();
  },

  async getUnclassifiedCount(): Promise<number> {
    const res = await fetch(`${API_PREFIX}/questions/unclassified-count`, {
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
      throw new Error(data.error || '获取未分类错题数失败');
    }
    const data = await res.json();
    return data.count;
  },

  async getPaginatedTasks(page: number, limit: number): Promise<{ 
    total: number; 
    page: number; 
    limit: number; 
    tasks: any[]; 
    stats?: {
      running: number;
      pendingOcr: number;
      pendingDiag: number;
      completed: number;
    }
  }> {
    const res = await fetch(`${API_PREFIX}/tasks?page=${page}&limit=${limit}`, {
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

  async getTaskDetail(taskId: string): Promise<any> {
    const res = await fetch(`${API_PREFIX}/tasks/${taskId}`, {
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
      throw new Error(data.error || '获取任务详情失败');
    }
    return res.json();
  }
};

