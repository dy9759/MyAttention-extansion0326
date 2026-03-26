/**
 * 实用函数模块
 * 提供文本格式化、时间处理、导出等通用功能
 */

import type { PlatformName } from '@/types';

// ============================================================================
// 平台名称映射
// ============================================================================

/**
 * 平台名称映射（国际化显示用）
 */
const PLATFORM_DISPLAY_NAMES: Record<PlatformName, string> = {
  chatgpt: 'ChatGPT',
  gemini: 'Gemini',
  claude: 'Claude',
  deepseek: 'DeepSeek',
  qwen: 'Qwen',
  yuanbao: '腾讯元宝',
  doubao: '豆包',
  kimi: 'Kimi',
};

/**
 * 格式化平台名称为正确的大小写
 */
export function formatPlatformName(platform: PlatformName): string {
  return PLATFORM_DISPLAY_NAMES[platform] || platform;
}

// ============================================================================
// 时间格式化
// ============================================================================

/**
 * 格式化时间戳为相对时间
 */
export function formatTimestamp(timestamp: string | number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes < 1) {
    return chrome.i18n.getMessage('justNow') || '刚刚';
  } else if (diffMinutes < 60) {
    return chrome.i18n.getMessage('minutesAgo')?.replace('{0}', diffMinutes.toString()) ||
      `${diffMinutes}分钟前`;
  } else if (diffMinutes < 24 * 60) {
    const hours = Math.floor(diffMinutes / 60);
    return chrome.i18n.getMessage('hoursAgo')?.replace('{0}', hours.toString()) ||
      `${hours}小时前`;
  } else {
    // 超过一天显示具体日期
    return formatDate(timestamp);
  }
}

/**
 * 格式化日期
 */
export function formatDate(timestamp: string | number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = padZero(date.getMonth() + 1);
  const day = padZero(date.getDate());

  return `${year}-${month}-${day}`;
}

/**
 * 格式化时间
 */
export function formatTime(timestamp: string | number): string {
  const date = new Date(timestamp);
  return `${formatDate(timestamp)} ${padZero(date.getHours())}:${padZero(date.getMinutes())}`;
}

/**
 * 格式化日期时间为显示格式（与导出格式一致）
 */
export function formatDateTimeForDisplay(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * 补零
 */
function padZero(num: number): string {
  return num < 10 ? `0${num}` : num.toString();
}

// ============================================================================
// 字节格式化
// ============================================================================

/**
 * 格式化字节为人类可读的形式
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  } else if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  } else if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  } else {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
}

// ============================================================================
// HTML 转义
// ============================================================================

/**
 * 转义 HTML
 */
export function escapeHtml(text: string): string {
  if (!text) return '';

  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * 将纯文本转换为 HTML，保持换行和格式
 */
export function formatTextToHtml(text: string): string {
  if (!text) return '';

  // 转义HTML特殊字符
  let escapedText = escapeHtml(text);

  // 将换行符转换为<br>标签
  escapedText = escapedText.replace(/\n/g, '<br>');

  // 处理多个连续空格（保持原有的空格格式）
  escapedText = escapedText.replace(/ +/g, (match) => {
    return '&nbsp;'.repeat(match.length);
  });

  return escapedText;
}

/**
 * 高亮搜索关键词（列表页用）
 */
export function highlightSearchTerm(
  text: string,
  searchTerm: string
): string {
  if (!searchTerm || !text) return escapeHtml(text);

  const keywords = searchTerm.toLowerCase().split(/\s+/).filter(k => k.length > 0);
  let tempText = text;

  // 使用特殊标记包裹关键词
  keywords.forEach(keyword => {
    const regex = new RegExp(`(${escapeRegExp(keyword)})`, 'gi');
    tempText = tempText.replace(regex, '###HIGHLIGHT_START###$1###HIGHLIGHT_END###');
  });

  // 对整个文本进行HTML转义
  let highlightedText = escapeHtml(tempText);

  // 将特殊标记替换为<mark>标签
  highlightedText = highlightedText.replace(
    /###HIGHLIGHT_START###(.*?)###HIGHLIGHT_END###/g,
    '<mark class="bg-yellow-200">$1</mark>'
  );

  return highlightedText;
}

/**
 * 高亮搜索关键词（详情页用 - 先高亮再转HTML）
 */
export function highlightSearchTermForDetail(
  text: string,
  searchTerm: string
): string {
  if (!searchTerm || !text) return formatTextToHtml(text);

  const keywords = searchTerm.toLowerCase().split(/\s+/).filter(k => k.length > 0);
  let highlightedText = text;

  // 先对原始文本进行高亮标记（使用特殊标记符）
  keywords.forEach(keyword => {
    const regex = new RegExp(`(${escapeRegExp(keyword)})`, 'gi');
    highlightedText = highlightedText.replace(regex, '###HIGHLIGHT_START###$1###HIGHLIGHT_END###');
  });

  // 转换为HTML格式（处理换行符等）
  highlightedText = formatTextToHtml(highlightedText);

  // 将特殊标记符替换为实际的高亮标签
  highlightedText = highlightedText.replace(
    /###HIGHLIGHT_START###(.*?)###HIGHLIGHT_END###/g,
    '<mark class="bg-yellow-200">$1</mark>'
  );

  return highlightedText;
}

/**
 * 转义正则表达式特殊字符
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ============================================================================
// 导出
// ============================================================================

export default {
  formatPlatformName,
  formatTimestamp,
  formatDate,
  formatTime,
  formatDateTimeForDisplay,
  formatBytes,
  escapeHtml,
  formatTextToHtml,
  highlightSearchTerm,
  highlightSearchTermForDetail,
};
