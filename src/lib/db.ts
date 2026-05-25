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
}

export interface Stats {
  total: number;
  bySubject: Record<string, number>;
  weakPoints: { point: string; count: number }[];
}

const DB_NAME = 'AI_ErrorBook_DB';
const STORE_NAME = 'questions';

// Simple wrapper around IndexedDB for easy SQLite migration later
export const db = {
  async init(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = (e: any) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
    });
  },

  async getAllQuestions(): Promise<ErrorQuestion[]> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  },

  async saveQuestion(question: ErrorQuestion): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(question);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  async deleteQuestion(id: string): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
};
