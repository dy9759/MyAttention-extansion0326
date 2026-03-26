/**
 * Message 类型定义
 * 表示用户或 AI 在对话中的一条消息
 */

/**
 * 消息发送者类型
 */
export type MessageSender = 'user' | 'assistant' | 'ai' | 'AI';

/**
 * 消息接口
 */
export interface Message {
  /** 消息唯一标识 */
  messageId: string;
  /** 发送者 (用户/AI) */
  sender: MessageSender;
  /** 消息内容 */
  content: string;
  /** 思考过程 (可选) */
  thinking?: string;
  /** 消息位置 (用于排序) */
  position: number;
  /** 创建时间 (ISO 8601 字符串) */
  createdAt: string;
  /** 更新时间 (ISO 8601 字符串) */
  updatedAt: string;
  /** 兼容旧版字段 */
  timestamp?: string;
  /** 兼容误用字段（部分模块错误地按会话字段访问） */
  lastMessageAt?: string;
}

/**
 * 消息创建选项
 */
export interface CreateMessageOptions {
  sender: MessageSender;
  content: string;
  thinking?: string;
  position?: number;
  createdAt?: string;
}

/**
 * 消息变化类型
 */
export interface MessageChanges {
  /** 新增的消息 */
  newMessages: Message[];
  /** 更新的消息 */
  updatedMessages: Message[];
  /** 删除的消息 */
  removedMessages: Message[];
  /** 未变化的消息 */
  unchanged: Message[];
}

/**
 * 消息哈希缓存条目
 */
export interface MessageHashCache {
  /** 消息哈希值 */
  hash: string;
  /** 缓存时间戳 */
  timestamp: number;
}
