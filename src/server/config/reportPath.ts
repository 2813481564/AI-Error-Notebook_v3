/**
 * 报表路径前缀开关（全局变量）
 *
 * 与 vite.config.ts 中注入前端的前缀保持一致（读取同一个 .env 变量 REPORT_PATH_PREFIX）。
 * 作用：
 *  - 通过路径分发部署（如 https://39.105.70.133/notebook/）时设为 /notebook，
 *    使报表链接变为 /notebook/report/{token}，可被反向代理正确分发。
 *  - 独立域名/本地直连时留空，报表链接保持 /report/{token}。
 *
 * 注意：修改 .env 后需重新 build 打包才生效。
 */
export function getReportPathPrefix(): string {
  // 注意：必须在请求时动态读取 process.env，而不能在模块加载时求值。
  // 因为本模块可能先于 dotenv.config() 被 import，模块加载时读到的 REPORT_PATH_PREFIX 是空的。
  const raw = process.env.REPORT_PATH_PREFIX || '';
  // 统一处理首尾斜杠，避免出现 //notebook 或 /notebook/ 之类的拼接问题
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (trimmed && !trimmed.startsWith('/')) {
    return '/' + trimmed;
  }
  return trimmed;
}
