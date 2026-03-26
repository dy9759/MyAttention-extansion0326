/**
 * Platform 类型定义
 * 定义平台配置和适配器相关类型
 */

import type { PlatformName } from './conversation';
import type { Message } from './message';

/**
 * 平台域名配置
 */
export interface PlatformDomain {
  /** 主机名 */
  hostname: string;
  /** 匹配的 URL 模式 */
  patterns: {
    /** 对话 URL 匹配模式 */
    conversation: RegExp[];
    /** 聊天页面 URL 匹配模式 (可选) */
    chat?: RegExp[];
  };
}

/**
 * 平台配置
 */
export interface PlatformConfig {
  /** 平台标识 */
  id: PlatformName;
  /** 显示名称 */
  name: string;
  /** 域名配置 */
  domains: PlatformDomain[];
  /** 适配器模块路径 */
  adapter?: string;
  /** 支持的内容脚本模式 */
  contentScript: {
    /** 匹配模式 */
    matches: string[];
    /** JS 文件路径 */
    js: string[];
    /** CSS 文件路径 */
    css?: string[];
  };
}

/**
 * 平台适配器接口
 * 所有平台适配器必须实现此接口
 */
export interface PlatformAdapter {
  /** 平台名称 */
  readonly platform: PlatformName;

  /**
   * 验证是否为有效的对话 URL
   */
  isValidConversationUrl(url: string): boolean;

  /**
   * 从 URL 中提取对话信息
   */
  extractConversationInfo(url: string): UrlMatchResult | {
    conversationId: string | null;
    isNewConversation: boolean;
  };

  /**
   * 提取页面上的所有消息
   */
  extractMessages(): Message[];

  /**
   * 检查元素是否为消息元素
   */
  isMessageElement(node: Node): boolean;

  /**
   * 从页面提取标题 (可选实现)
   */
  extractTitle?(): string | null;

  getSelectionContext?(
    range: Range
  ): { root?: Element; contextText: string; messageIndex?: number; selectionText?: string } | null;

  getDwellCandidates?(): Element[];

  /**
   * 初始化适配器
   */
  init?(): void | Promise<void>;
  start?(): void | Promise<void>;
  stop?(): void;

  /**
   * 销毁适配器
   */
  destroy?(): void;
}

/**
 * URL 匹配结果
 */
export interface UrlMatchResult {
  /** 是否匹配 */
  matched: boolean;
  /** 匹配的平台 */
  platform?: PlatformName;
  /** 兼容旧版适配器的平铺返回结构 */
  conversationId?: string | null;
  isNewConversation?: boolean;
  /** 提取的对话信息 */
  conversationInfo?: {
    conversationId: string | null;
    isNewConversation: boolean;
  };
}

/**
 * 增量更新结果
 */
export interface IncrementalUpdateResult {
  /** 是否成功 */
  success: boolean;
  /** 更新后的对话 */
  conversation?: import('./conversation').Conversation;
  /** 是否使用锚点 */
  anchor?: boolean;
  /** 操作 ID */
  operationId?: string;
  /** 是否被跳过 (无变化) */
  skipped?: boolean;
  /** 是否全量覆盖 */
  fullOverwrite?: boolean;
}

/**
 * 锚点信息
 */
export interface AnchorInfo {
  /** 是否找到锚点 */
  found: boolean;
  /** 锚点位置 */
  position?: number;
  /** 锚点大小 */
  size?: number;
  /** 受保护的消息数量 */
  protectedCount?: number;
}
