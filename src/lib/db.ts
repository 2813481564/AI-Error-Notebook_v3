export interface SimilarQuestion {
  questionText: string;
  solution: string;
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
}

export interface Stats {
  total: number;
  bySubject: Record<string, number>;
  weakPoints: { point: string; count: number }[];
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
  }
};

