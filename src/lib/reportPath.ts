/**
 * 前端报表路径前缀（由 vite.config.ts 从 .env 的 REPORT_PATH_PREFIX 注入）
 *
 *  - 独立域名/本地直连：前缀为空字符串，报表路径保持 /report/{token}
 *  - 通过路径分发部署（如 https://39.105.70.133/notebook/）：前缀为 /notebook
 */
const raw: string = (import.meta.env.VITE_REPORT_PATH_PREFIX as string) || '';
// 统一去掉尾部斜杠，保证拼接时不出双斜杠
export const reportPathPrefix: string = raw.trim().replace(/\/+$/, '');

/** 报表页面路由前缀：如 /notebook/report */
export const reportRoutePrefix: string = `${reportPathPrefix}/report`;
