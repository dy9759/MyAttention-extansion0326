/**
 * 浏览历史采集模块
 * 使用 chrome.history API 获取用户浏览记录作为注意力信号
 */

import { Logger } from '@/core/errors';
import type { BrowsingHistoryItem } from '@/types';

/** 最大采集天数 */
const MAX_HISTORY_DAYS = 30;

/** 过滤掉的 URL 模式 */
const BLOCKED_PATTERNS = [
  /^chrome/,
  /^about:/,
  /^edge:/,
  /^moz-extension:/,
  /^chrome-extension:/,
  /^data:/,
  /^blob:/,
  /^file:/,
];

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function hashUrl(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    const char = url.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return `hist_${Math.abs(hash).toString(36)}`;
}

function isBlockedUrl(url: string): boolean {
  return BLOCKED_PATTERNS.some((pattern) => pattern.test(url));
}

/**
 * 获取最近的浏览历史
 */
export async function fetchBrowsingHistory(days: number = 7): Promise<BrowsingHistoryItem[]> {
  const startTime = Date.now() - Math.min(days, MAX_HISTORY_DAYS) * 24 * 60 * 60 * 1000;

  try {
    const results = await chrome.history.search({
      text: '',
      startTime,
      maxResults: 500,
    });

    const now = new Date().toISOString();

    return results
      .filter((item) => item.url && item.title && !isBlockedUrl(item.url))
      .map((item) => ({
        id: hashUrl(item.url!),
        url: item.url!,
        title: item.title || item.url!,
        domain: extractDomain(item.url!),
        visitCount: item.visitCount || 1,
        lastVisitTime: item.lastVisitTime
          ? new Date(item.lastVisitTime).toISOString()
          : now,
        createdAt: now,
        updatedAt: now,
      }));
  } catch (error) {
    Logger.error('[HistoryTracker] 获取浏览历史失败', error);
    return [];
  }
}
