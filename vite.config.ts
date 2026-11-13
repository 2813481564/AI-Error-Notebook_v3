import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // 读取报表路径前缀开关（与后端 .env 的 REPORT_PATH_PREFIX 保持一致）
  const env = loadEnv(mode, path.resolve(__dirname), '');
  const reportPrefix = (env.REPORT_PATH_PREFIX || '').trim().replace(/\/+$/, '');
  return {
    base: mode === 'production' ? '/notebook/' : '/',
    define: {
      'import.meta.env.VITE_REPORT_PATH_PREFIX': JSON.stringify(reportPrefix),
    },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      allowedHosts: true, // 允许通过反向代理的任意域名（如 course.studystudio.top）访问 Vite
      // 通过 DISABLE_HMR 环境变量关闭热更新（部署环境或代理场景下使用）
      // 关闭热更新时同步关闭文件监听，避免空转占用 CPU
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
