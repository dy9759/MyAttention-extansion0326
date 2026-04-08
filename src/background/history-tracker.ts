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

    // 按 URL 去重：同一页面只保留最新记录，合并访问次数
    const urlMap = new Map<string, BrowsingHistoryItem>();

    for (const item of results) {
      if (!item.url || !item.title || isBlockedUrl(item.url)) continue;

      const url = item.url;
      const existing = urlMap.get(url);
      const visitTime = item.lastVisitTime
        ? new Date(item.lastVisitTime).toISOString()
        : now;
      const visitCount = item.visitCount || 1;

      if (existing) {
        // 保留最新的访问时间，累加访问次数
        if (visitTime > existing.lastVisitTime) {
          existing.lastVisitTime = visitTime;
          existing.title = item.title || existing.title;
        }
        existing.visitCount = Math.max(existing.visitCount, visitCount);
      } else {
        urlMap.set(url, {
          id: hashUrl(url),
          url,
          title: item.title || url,
          domain: extractDomain(url),
          visitCount,
          lastVisitTime: visitTime,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    return Array.from(urlMap.values())
      .sort((a, b) => b.lastVisitTime.localeCompare(a.lastVisitTime));
  } catch (error) {
    Logger.error('[HistoryTracker] 获取浏览历史失败', error);
    return [];
  }
}
