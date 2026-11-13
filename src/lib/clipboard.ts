/**
 * 通用剪贴板复制工具
 *
 * 背景：navigator.clipboard.writeText 仅在"安全上下文"下可用
 * （HTTPS 或 localhost）。线上若为 HTTP 明文访问，该 API 为 undefined，
 * 直接调用会抛错导致"复制失败"。因此这里做降级：
 *   1. 优先使用 navigator.clipboard.writeText（HTTPS/localhost 环境）
 *   2. 降级使用 document.execCommand('copy')（HTTP 环境可用，无需安全上下文）
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  // 方案一：现代 Clipboard API（需安全上下文）
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      // 权限被拒等情况，继续尝试降级方案
    }
  }

  // 方案二：传统 execCommand 复制（通过临时 textarea）
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    // 移出屏幕，避免影响布局
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    textarea.style.left = '-9999px';
    textarea.setAttribute('readonly', 'readonly');
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch (e) {
    return false;
  }
}
