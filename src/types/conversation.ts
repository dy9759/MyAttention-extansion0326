/**
 * Conversation 类型定义
 * 表示一个完整的对话记录
 */

import type { Message, MessageSender } from './message';

/**
 * 平台名称类型
 */
export type PlatformName =
  | 'chatgpt'
  | 'deepseek'
  | 'gemini'
  | 'claude'
  | 'qwen'
  | 'yuanbao'
  | 'doubao'
  | 'kimi';

/**
 * 平台显示名称映射
 */
export const PLATFORM_NAMES: Record<PlatformName, string> = {
  chatgpt: 'ChatGPT',
  deepseek: 'DeepSeek',
  gemini: 'Gemini',
  claude: 'Claude',
  qwen: 'Qwen',
  yuanbao: '腾讯元宝',
  doubao: '豆包',
  kimi: 'Kimi',
};

/**
 * 对话接口
 */
export interface Conversation {
  /** 对话唯一标识 */
  conversationId: string;
  /** 原始页面链接 */
  link: string;
  /** 平台名称 */
  platform: PlatformName;
  /** 对话标题 */
  title: string;
  /** 消息列表 */
  messages: Message[];
  /** 创建时间 (ISO 8601 字符串) */
  createdAt: string;
  /** 更新时间 (ISO 8601 字符串) */
  updatedAt: string;
  /** 消息数量 */
  messageCount: number;
  /** 最后消息时间 (ISO 8601 字符串) */
  lastMessageAt?: string;
  /** 外部平台对话 ID (可选) */
  externalId?: string | null;
  /** 数据版本 */
  dataVersion?: number;
}

/**
 * 创建对话选项
 */
export interface CreateConversationOptions {
  link: string;
  platform: PlatformName;
  title?: string;
  messages?: Message[];
  externalId?: string | null;
}

/**
 * 对话信息提取结果
 */
export interface ConversationInfo {
  /** 对话 ID */
  conversationId: string | null;
  /** 是否为新对话 */
  isNewConversation: boolean;
}

/**
 * 对话统计信息
 */
export interface ConversationStats {
  /** 总对话数 */
  totalConversations: number;
  /** 今日新增对话数 */
  todayNewConversations: number;
}

/**
 * 导出类型
 */
export type ExportType = 'separate' | 'merged';

/**
 * 导出元数据
 */
export interface ExportMetadata {
  /** 搜索关键词 */
  searchTerm?: string;
  /** 筛选条件 */
  filter?: {
    startDate?: string;
    endDate?: string;
    platforms?: PlatformName[];
  };
}

/**
 * 导出配置
 */
export interface ExportConfig {
  /** 要导出的对话 ID 列表 */
  conversationIds: string[];
  /** 导出类型 */
  exportType: ExportType;
  /** 元数据 */
  metadata?: ExportMetadata;
}
