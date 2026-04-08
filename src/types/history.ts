/**
 * 浏览历史类型定义
 */

/**
 * 浏览历史条目
 */
export interface BrowsingHistoryItem {
  /** 唯一标识（URL hash） */
  id: string;
  /** 页面 URL */
  url: string;
  /** 页面标题 */
  title: string;
  /** 域名 */
  domain: string;
  /** 访问次数 */
  visitCount: number;
  /** 最近访问时间 ISO 8601 */
  lastVisitTime: string;
  /** 首次采集时间 */
  createdAt: string;
  /** 更新时间 */
  updatedAt: string;
}
