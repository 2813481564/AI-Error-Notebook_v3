import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import './index.css';

// 全局拦截并代理 fetch 请求，适配 Nginx 子路径反向代理
const originalFetch = window.fetch;
window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
  if (typeof input === 'string') {
    if (input.startsWith('/api/')) {
      return originalFetch('/notebook' + input, init);
    }
  } else if (input instanceof URL) {
    if (input.pathname.startsWith('/api/')) {
      input.pathname = '/notebook' + input.pathname;
    }
  } else if (input instanceof Request) {
    const urlObj = new URL(input.url);
    if (urlObj.pathname.startsWith('/api/')) {
      const newUrl = urlObj.origin + '/notebook' + urlObj.pathname + urlObj.search;
      return originalFetch(new Request(newUrl, input), init);
    }
  }
  return originalFetch(input, init);
};

import App from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
