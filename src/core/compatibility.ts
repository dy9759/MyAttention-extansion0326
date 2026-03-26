/**
 * 兼容性处理器
 * 统一处理时间、数据和消息变化
 */

import type { Message, MessageChanges } from '@/types';

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 验证结果
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

// ============================================================================
// 时间处理工具函数
// ============================================================================

/**
 * 时间处理工具
 */
export const TimeUtils = {
  /**
   * 获取消息的显示时间（兼容新旧格式）
   */
  getMessageTime(message: Message | null | undefined): string {
    if (!message) return '';

    if (message.createdAt) return message.createdAt;
    if ((message as any).timestamp) return (message as any).timestamp;

    return new Date().toISOString();
  },

  /**
   * 获取对话的显示时间（兼容新旧格式）
   */
  getConversationTime(conversation: any): string {
    if (!conversation) return '';

    if (conversation.lastMessageAt) return conversation.lastMessageAt;
    if (conversation.createdAt) return conversation.createdAt;
    if ((conversation as any).timestamp) return (conversation as any).timestamp;

    return new Date().toISOString();
  },

  /**
   * 获取对话的最后消息时间
   */
  getLastMessageTime(conversation: any): string {
    if (!conversation || !conversation.messages || conversation.messages.length === 0) {
      return TimeUtils.getConversationTime(conversation);
    }

    const lastMessage = conversation.messages[conversation.messages.length - 1];
    return TimeUtils.getMessageTime(lastMessage);
  },

  /**
   * 验证时间字符串是否有效
   */
  isValidTimeString(timeString: string): boolean {
    if (!timeString) return false;

    try {
      const date = new Date(timeString);
      return !isNaN(date.getTime());
    } catch {
      return false;
    }
  },

  /**
   * 标准化时间字符串
   */
  normalizeTimeString(timeString: string): string {
    if (!TimeUtils.isValidTimeString(timeString)) {
      return new Date().toISOString();
    }

    return new Date(timeString).toISOString();
  },
};

// ============================================================================
// 数据处理工具函数
// ============================================================================

/**
 * 数据处理工具
 */
export const DataUtils = {
  /**
   * 内容哈希计算
   */
  hashContent(str: string): string {
    let hash = 0;
    if (str.length === 0) return hash.toString(36);

    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }

    return Math.abs(hash).toString(36);
  },

  /**
   * 生成备用消息 ID
   */
  generateFallbackMessageId(message: Partial<Message>): string {
    const sender = message.sender || 'unknown';
    const content = message.content || '';
    const position = message.position || 0;
    const hash = DataUtils.hashContent(content.substring(0, 50));

    return `msg_${sender}_pos${position}_${hash}`;
  },
};

// ============================================================================
// 数据迁移适配器
// ============================================================================

/**
 * 数据迁移适配器
 */
export class DataMigrationAdapter {
  private readonly version = 2;

  /**
   * 标准化消息对象
   */
  normalizeMessage(message: any): Message {
    if (!message) return message;

    const normalized: Partial<Message> = { ...message };
    const now = new Date().toISOString();

    if (message.timestamp && !message.createdAt) {
      normalized.createdAt = message.timestamp;
    } else if (!message.createdAt) {
      normalized.createdAt = now;
    }

    if (message.updatedAt) {
      normalized.updatedAt = message.updatedAt;
    } else {
      normalized.updatedAt = normalized.createdAt || now;
    }

    delete (normalized as any).timestamp;

    if (!normalized.messageId) {
      normalized.messageId = DataUtils.generateFallbackMessageId(normalized);
    }

    return normalized as Message;
  }

  /**
   * 标准化对话对象
   */
  normalizeConversation(conversation: any): any {
    if (!conversation) return conversation;

    const normalized: any = { ...conversation };
    const now = new Date().toISOString();

    if (conversation.createdAt) {
      normalized.createdAt = conversation.createdAt;
    } else {
      normalized.createdAt = now;
    }

    if (conversation.updatedAt) {
      normalized.updatedAt = conversation.updatedAt;
    } else {
      normalized.updatedAt = normalized.createdAt || now;
    }

    if (conversation.messages && Array.isArray(conversation.messages)) {
      normalized.messages = conversation.messages.map((msg: any) =>
        this.normalizeMessage(msg)
      );
    }

    normalized.dataVersion = this.version;

    return normalized;
  }

  /**
   * 检查数据是否需要迁移
   */
  needsMigration(data: any): boolean {
    if (data.timestamp) return true;
    if (!data.createdAt || !data.updatedAt) return true;
    if (data.dataVersion !== this.version) return true;

    return false;
  }

  /**
   * 迁移旧数据到新格式
   */
  migrateData(data: any): any {
    if (!this.needsMigration(data)) {
      return data;
    }

    console.log('[Compatibility] 开始数据迁移', {
      hasTimestamp: !!(data as any).timestamp,
      hasCreatedAt: !!data.createdAt,
      hasUpdatedAt: !!data.updatedAt,
      version: data.dataVersion,
    });

    // 如果是对话对象
    if (data.messages && Array.isArray(data.messages)) {
      return this.normalizeConversation(data);
    }

    // 如果是消息对象
    return this.normalizeMessage(data);
  }

  /**
   * 批量迁移数据
   */
  migrateBatch(dataArray: any[]): any[] {
    if (!Array.isArray(dataArray)) {
      return dataArray;
    }

    return dataArray.map((item: any) => this.migrateData(item));
  }

  /**
   * 获取数据统计信息
   */
  getDataStats(dataArray: any[]): any {
    if (!Array.isArray(dataArray)) {
      return {
        total: 0,
        needsMigration: 0,
        valid: 0,
      };
    }

    const stats = {
      total: dataArray.length,
      needsMigration: 0,
      valid: 0,
      hasTimestamp: 0,
      missingCreatedAt: 0,
      missingUpdatedAt: 0,
    };

    dataArray.forEach((item: any) => {
      if (this.needsMigration(item)) {
        stats.needsMigration++;
      } else {
        stats.valid++;
      }

      if (item.timestamp) stats.hasTimestamp++;
      if (!item.createdAt) stats.missingCreatedAt++;
      if (!item.updatedAt) stats.missingUpdatedAt++;
    });

    return stats;
  }

  /**
   * 验证数据格式是否正确
   */
  validateData(data: any): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
    };

    if (!data.createdAt) {
      result.isValid = false;
      result.errors.push('缺少 createdAt 字段');
    }

    if (!data.updatedAt) {
      result.isValid = false;
      result.errors.push('缺少 updatedAt 字段');
    }

    if (data.createdAt && !TimeUtils.isValidTimeString(data.createdAt)) {
      result.isValid = false;
      result.errors.push('createdAt 格式不正确');
    }

    if (data.updatedAt && !TimeUtils.isValidTimeString(data.updatedAt)) {
      result.isValid = false;
      result.errors.push('updatedAt 格式不正确');
    }

    if (data.timestamp) {
      result.warnings.push('发现旧的 timestamp 字段，建议迁移');
    }

    return result;
  }
}

// ============================================================================
// 统一兼容性处理器
// ============================================================================

/**
 * 统一兼容性处理器
 */
export class Compatibility {
  private readonly version = 2;

  // 数据迁移适配器
  private readonly migrationAdapter = new DataMigrationAdapter();

  // 缓存系统
  private messageCache = new Map<string, { data: any; timestamp: number }>();
  private hashCache = new Map<string, string>();
  private readonly cacheExpiry = 5 * 60 * 1000;

  // 变化追踪
  private changeHistory: any[] = [];
  private readonly maxHistorySize = 100;

  // 批量操作
  private batchQueue: any[] = [];
  private batchTimeout: ReturnType<typeof setTimeout> | null = null;
  private readonly batchDelay = 100;

  /**
   * ==================== 时间处理 ====================
   */

  getMessageTime(message: Message | null | undefined): string {
    return TimeUtils.getMessageTime(message);
  }

  getConversationTime(conversation: any): string {
    return TimeUtils.getConversationTime(conversation);
  }

  getLastMessageTime(conversation: any): string {
    return TimeUtils.getLastMessageTime(conversation);
  }

  isValidTimeString(timeString: string): boolean {
    return TimeUtils.isValidTimeString(timeString);
  }

  normalizeTimeString(timeString: string): string {
    return TimeUtils.normalizeTimeString(timeString);
  }

  /**
   * ==================== 数据迁移 ====================
   */

  normalizeMessage(message: any): Message {
    return this.migrationAdapter.normalizeMessage(message);
  }

  normalizeConversation(conversation: any): any {
    return this.migrationAdapter.normalizeConversation(conversation);
  }

  needsMigration(data: any): boolean {
    return this.migrationAdapter.needsMigration(data);
  }

  migrateData(data: any): any {
    return this.migrationAdapter.migrateData(data);
  }

  migrateBatch(dataArray: any[]): any[] {
    return this.migrationAdapter.migrateBatch(dataArray);
  }

  getDataStats(dataArray: any[]): any {
    return this.migrationAdapter.getDataStats(dataArray);
  }

  validateData(data: any): any {
    return this.migrationAdapter.validateData(data);
  }

  /**
   * ==================== 消息变化检测 ====================
   */

  processMessageChanges(
    currentMessages: Message[],
    storedMessages: Message[]
  ): MessageChanges {
    console.log('[Compatibility] 开始处理消息变化', {
      currentCount: currentMessages.length,
      storedCount: storedMessages.length,
    });

    const changes: MessageChanges = {
      newMessages: [],
      updatedMessages: [],
      removedMessages: [],
      unchanged: [],
    };

    const analysis = this.analyzeChanges(currentMessages, storedMessages);
    this.applyChanges(analysis, changes);
    this.recordChanges(changes);

    console.log('[Compatibility] 消息变化分析完成', {
      new: changes.newMessages.length,
      updated: changes.updatedMessages.length,
      removed: changes.removedMessages.length,
      unchanged: changes.unchanged.length,
    });

    return changes;
  }

  private analyzeChanges(
    currentMessages: Message[],
    storedMessages: Message[]
  ): {
    additions: Message[];
    modifications: Array<{ old: Message; new: Message }>;
    deletions: Message[];
    unchanged: Message[];
  } {
    const additions: Message[] = [];
    const modifications: Array<{ old: Message; new: Message }> = [];
    const deletions: Message[] = [];
    const unchanged: Message[] = [];

    const currentMap = new Map(
      currentMessages.map((msg) => [msg.messageId, msg])
    );
    const storedMap = new Map(
      storedMessages.map((msg) => [msg.messageId, msg])
    );

    // 检测新增消息
    for (const [messageId, message] of currentMap) {
      if (!storedMap.has(messageId)) {
        additions.push(message);
      }
    }

    // 检测删除消息
    for (const [messageId, message] of storedMap) {
      if (!currentMap.has(messageId)) {
        deletions.push(message);
      }
    }

    // 检测修改消息
    for (const [messageId, currentMsg] of currentMap) {
      const storedMsg = storedMap.get(messageId);
      if (storedMsg && this.hasContentChanges(currentMsg, storedMsg)) {
        modifications.push({
          old: storedMsg,
          new: currentMsg,
        });
      } else if (storedMsg) {
        unchanged.push(currentMsg);
      }
    }

    return {
      additions,
      modifications,
      deletions,
      unchanged,
    };
  }

  private hasContentChanges(currentMsg: Message, storedMsg: Message): boolean {
    // 只检查真正的内容字段变化
    if (currentMsg.content !== storedMsg.content) {
      return true;
    }

    // 检查 thinking 变化
    if (currentMsg.thinking !== storedMsg.thinking) {
      return true;
    }

    // 移除 position/messageId 检查：
    // - position 和 messageId 本质相同（msgId 包含 position）
    // - 在锚点匹配成功时，这些字段被修正过，变化是正常的
    // - 在锚点匹配失败时，这些字段不可信
    // 移除 sender 检查：如果已经通过 messageId 匹配，sender 应该一致

    return false;
  }

  private applyChanges(
    analysis: {
      additions: Message[];
      modifications: Array<{ old: Message; new: Message }>;
      deletions: Message[];
      unchanged: Message[];
    },
    changes: MessageChanges
  ): void {
    changes.newMessages = analysis.additions;
    changes.updatedMessages = analysis.modifications.map((mod) => mod.new);
    changes.removedMessages = analysis.deletions;
    changes.unchanged = analysis.unchanged;
  }

  private recordChanges(changes: MessageChanges): void {
    const changeRecord = {
      timestamp: new Date().toISOString(),
      changes: {
        new: changes.newMessages.length,
        updated: changes.updatedMessages.length,
        removed: changes.removedMessages.length,
      },
    };

    this.changeHistory.push(changeRecord);

    if (this.changeHistory.length > this.maxHistorySize) {
      this.changeHistory.shift();
    }
  }

  /**
   * ==================== 缓存管理 ====================
   */

  getCachedMessage(key: string): any | null {
    const cached = this.messageCache.get(key);
    if (!cached) return null;

    if (Date.now() - cached.timestamp > this.cacheExpiry) {
      this.messageCache.delete(key);
      return null;
    }

    return cached.data;
  }

  setCachedMessage(key: string, data: any): void {
    this.messageCache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  generateContentHash(content: string): string {
    const cachedHash = this.hashCache.get(content);
    if (cachedHash !== undefined) {
      return cachedHash;
    }

    const hash = DataUtils.hashContent(content);
    this.hashCache.set(content, hash);
    return hash;
  }

  /**
   * ==================== 批量操作 ====================
   */

  async batchUpdate(updates: any[]): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.batchQueue.push(...updates);

      if (this.batchTimeout) {
        clearTimeout(this.batchTimeout);
      }

      this.batchTimeout = setTimeout(async () => {
        try {
          const currentBatch = [...this.batchQueue];
          this.batchQueue = [];

          const results = await this.executeBatchUpdate(currentBatch);
          resolve(results);
        } catch (error) {
          reject(error);
        }
      }, this.batchDelay);
    });
  }

  private async executeBatchUpdate(updates: any[]): Promise<any[]> {
    console.log('[Compatibility] 执行批量更新', updates.length);
    return updates;
  }

  /**
   * ==================== 工具方法 ====================
   */

  clearCache(): void {
    this.messageCache.clear();
    this.hashCache.clear();
  }

  clearHistory(): void {
    this.changeHistory = [];
  }

  getCacheStats(): {
    messageCacheSize: number;
    hashCacheSize: number;
    changeHistorySize: number;
  } {
    return {
      messageCacheSize: this.messageCache.size,
      hashCacheSize: this.hashCache.size,
      changeHistorySize: this.changeHistory.length,
    };
  }

  getChangeHistory(): any[] {
    return [...this.changeHistory];
  }

  /**
   * 销毁适配器
   */
  destroy(): void {
    this.clearCache();
    this.clearHistory();

    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }
  }
}
