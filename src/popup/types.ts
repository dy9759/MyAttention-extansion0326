/**
 * 弹窗页面类型定义
 */

import type { Conversation, Message, PlatformName, AppSettings } from '@/types';

// ============================================================================
// 导出格式
// ============================================================================

/**
 * 导出格式
 */
export type ExportFormat = 'separate' | 'merged';

/**
 * 导出元数据
 */
export interface ExportMetadata {
  /** 导出模式 */
  exportMode: 'all' | 'filtered';
  /** 对话总数 */
  totalCount: number;
  /** 用户 */
  user?: string;
  /** 导出时间 */
  exportedAt?: string;
}

// ============================================================================
// 搜索和筛选
// ============================================================================

/**
 * 当前筛选状态
 */
export interface CurrentFilter {
  /** 开始日期 */
  startDate: string | null;
  /** 结束日期 */
  endDate: string | null;
  /** 选中的平台 */
  platforms: Set<PlatformName>;
}

// ============================================================================
// 导出按钮管理
// ============================================================================

/**
 * 导出按钮状态
 */
export type ExportButtonState = 'idle' | 'loading' | 'success' | 'error';

// ============================================================================
// 重新导出
// ============================================================================

// Re-export all types from the main types module
