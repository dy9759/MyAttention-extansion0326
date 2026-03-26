/**
 * 存储管理器
 * 协调存储组件，提供统一的存储接口
 */

import type { Conversation, Message, MessageChanges, IncrementalUpdateResult } from '@/types';
import { ChromeStorageAdapter } from './adapter';
import { CacheManager } from './cache';
import { AnchorDetector } from './anchor';
import { normalizeAndDedupeMessages } from './message-normalizer';
import { Compatibility } from '@/core/compatibility';
import { Logger, ErrorFactory, ERROR_CODES } from '@/core/errors';
import { eventBus } from '@/core/event-bus';
import { DEFAULT_SETTINGS, CACHE_MAX_SIZE, CACHE_EXPIRY } from '@/core/constants';

/**
 * 存储管理器
 */
export class StorageManager {
  private readonly storageAdapter: ChromeStorageAdapter;
  private readonly cacheManager: CacheManager<string, Conversation>;
  private readonly compatibility: Compatibility;
  private readonly anchorDetector = AnchorDetector;

  // 批量操作管理
  private batchQueue: Array<{
    conversationId: string;
    changes: MessageChanges;
  }> = [];
  private batchTimeout: ReturnType<typeof setTimeout> | null = null;
  private readonly batchDelay = 100;

  constructor() {
    this.storageAdapter = new ChromeStorageAdapter();
    this.cacheManager = new CacheManager(CACHE_MAX_SIZE, CACHE_EXPIRY);
    this.compatibility = new Compatibility();

    Logger.info('[StorageManager] 存储管理器初始化完成');
  }

  /**
   * 增量更新对话
   */
  async incrementalUpdate(
    conversationId: string,
    changes: MessageChanges
  ): Promise<IncrementalUpdateResult> {
    Logger.info('[StorageManager] 开始增量更新', {
      conversationId,
      changes: {
        new: changes.newMessages.length,
        updated: changes.updatedMessages.length,
        removed: changes.removedMessages.length,
      },
    });

    // 检查是否有真正的.变化
    const hasRealChanges =
      changes &&
      (changes.newMessages.length > 0 ||
        changes.updatedMessages.length > 0 ||
        changes.removedMessages.length > 0);

    if (!hasRealChanges) {
      Logger.info('[StorageManager] 没有消息变化，跳过增量更新');
      const conversation = await this.getConversation(conversationId);
      return {
        success: true,
        conversation: conversation || undefined,
        skipped: true,
      };
    }

    try {
      // 获取对话数据
      const conversation = await this.getConversation(conversationId);

      if (!conversation) {
        throw ErrorFactory.storage(
          '对话不存在',
          `conversationId: ${conversationId}`
        );
      }

      // 应用增量变化
      this.applyChanges(conversation, changes);

      // 更新元数据
      this.updateMetadata(conversation, changes);

      // 保存更新
      await this.saveConversation(conversation);

      // 更新缓存
      this.cacheManager.set(conversationId, conversation);

      Logger.info('[StorageManager] 增量更新完成');
      return { success: true, conversation };
    } catch (error) {
      Logger.error('[StorageManager] 增量更新失败', error);
      throw error;
    }
  }

  /**
   * 获取对话数据（带缓存）
   */
  async getConversation(
    conversationId: string
  ): Promise<Conversation | null> {
    // 尝试从缓存获取
    const cached = this.cacheManager.get(conversationId);
    if (cached) {
      Logger.debug('[StorageManager] 从缓存获取对话', conversationId);
      return cached;
    }

    // 从存储获取

    Logger.debug('[StorageManager] 从数据库获取对话', conversationId);
    const conversation = await this.storageAdapter.getConversation(conversationId);

    if (conversation) {
      this.cacheManager.set(conversationId, conversation);
    }

    return conversation;
  }

  /**
   * 应用变化到对话
   */
  private applyChanges(
    conversation: Conversation,
    changes: MessageChanges
  ): void {
    if (!conversation.messages) {
      conversation.messages = [];
    }

    // 删除
    if (changes.removedMessages.length > 0) {
      const removedIds = new Set(
        changes.removedMessages.map((m) => m.messageId)
      );
      conversation.messages = conversation.messages.filter(
        (m) => !removedIds.has(m.messageId)
      );
    }

    // 更新
    if (changes.updatedMessages.length > 0) {
      const updateMap = new Map(
        changes.updatedMessages.map((m) => [m.messageId, m])
      );
      conversation.messages = conversation.messages.map((m) =>
        updateMap.get(m.messageId) || m
      );
    }

    // 新增
    if (changes.newMessages.length > 0) {
      conversation.messages.push(...changes.newMessages);
    }

    // 按位置排序
    conversation.messages = normalizeAndDedupeMessages(conversation.messages);
  }

  /**
   * 更新对话元数据
   */
  private updateMetadata(
    conversation: Conversation,
    changes: MessageChanges | null
  ): void {
    // 只有当有真正的内容变化时才更新对话的 updatedAt
    const hasRealChanges = changes &&
      (changes.newMessages.length > 0 ||
        changes.updatedMessages.length > 0 ||
        changes.removedMessages.length > 0);

    if (hasRealChanges) {
      conversation.updatedAt = new Date().toISOString();
    }

    // 更新消息数量
    conversation.messageCount = conversation.messages.length;

    // 更新最后消息时间
    if (conversation.messages.length > 0) {
      const lastMessage =
        conversation.messages[conversation.messages.length - 1];
      conversation.lastMessageAt =
        lastMessage.updatedAt || lastMessage.createdAt;
    }

    // 生成标题（如果不存在）
    if (!conversation.title) {
      const firstUserMessage = conversation.messages.find(
        (m) => m.sender === 'user'
      );
      if (firstUserMessage) {
        const text = firstUserMessage.content;
        conversation.title = text.length > 50 ? text.substring(0, 50) + '...' : text;
      }
    }
  }

  /**
   * 保存对话
   */
  async saveConversation(conversation: Conversation): Promise<void> {
    const normalizedConversation: Conversation = {
      ...conversation,
      messages: normalizeAndDedupeMessages(conversation.messages || []),
    };

    const maxRetries = 2;
    let attempt = 0;
    let lastError: unknown;

    while (attempt <= maxRetries) {
      try {
        await this.storageAdapter.updateConversation(normalizedConversation);
        return;
      } catch (error) {
        lastError = error;
        attempt += 1;
        if (attempt > maxRetries) {
          break;
        }
        const delay = 120 * attempt;
        await new Promise<void>((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  /**
   * 缓存对话
   */
  cacheConversation(conversationId: string, conversation: Conversation): void {
    this.cacheManager.set(conversationId, conversation);
  }

  /**
   * 清空缓存
   */
  clearCache(conversationId?: string): void {
    if (conversationId) {
      this.cacheManager.delete(conversationId);
    } else {
      this.cacheManager.clear();
    }
  }

  /**
   * 智能增量更新（懒加载感知）
   */
  async smartIncrementalUpdate(
    conversationId: string,
    currentMessages: Message[]
  ): Promise<IncrementalUpdateResult> {
    if (!currentMessages || !Array.isArray(currentMessages)) {
      throw new Error('currentMessages must be a valid array');
    }

    Logger.debug('[StorageManager] 开始智能增量更新', {
      conversationId,
      messageCount: currentMessages.length,
    });

    const conversation = await this.getConversation(conversationId);
    const storedMessages = conversation?.messages || [];

    // 新对话或当前无消息：全量处理
    if (!storedMessages.length) {
      return this.saveNewConversation(conversationId, currentMessages, conversation);
    }

    if (!currentMessages.length) {
      Logger.info('[StorageManager] 当前页面无消息，跳过更新');
      return { success: true, conversation: conversation || undefined };
    }

    if (!conversation) {
      throw ErrorFactory.storage(
        '对话不存在',
        `conversationId: ${conversationId}`
      );
    }

    // 已保存对话：锚点匹配（委托给锚点检测器）
    const anchor = this.anchorDetector.findHeadAnchor(
      currentMessages,
      storedMessages
    );

    return this.processWithAnchor(
      conversation,
      currentMessages,
      storedMessages,
      anchor
    );
  }

  /**
   * 分区处理
   */
  private async processWithAnchor(
    conversation: Conversation,
    currentMessages: Message[],
    storedMessages: Message[],
    anchor: any
  ): Promise<IncrementalUpdateResult> {
    const operationId = `${conversation.conversationId}_${Date.now()}`;
    Logger.debug('[StorageManager] 开始处理操作', operationId);

    let protectedZone: Message[] = [];
    let operationZone: Message[] = storedMessages;
    let correctedCurrentMessages = currentMessages;

    if (anchor.found && anchor.position > 0) {
      Logger.debug('[StorageManager] 保护前', anchor.protectedCount, '条懒加载消息');
      protectedZone = storedMessages.slice(0, anchor.position);
      operationZone = storedMessages.slice(anchor.position);

      // 修正当前消息的 position 和 messageId，避免重复保存
      correctedCurrentMessages = this.anchorDetector.correctMessageIds(
        currentMessages,
        anchor.position
      );
    } else if (!anchor.found) {
      Logger.warn(
        '[StorageManager] 锚点匹配失败，用页面内容全量覆盖存储'
      );
      // 直接用页面内容覆盖存储，确保数据一致性
      conversation.messages = normalizeAndDedupeMessages(currentMessages);

      // 更新元数据
      this.updateMetadata(conversation, null);
      await this.saveConversation(conversation);
      this.cacheManager.set(conversation.conversationId, conversation);

      return {
        success: true,
        conversation,
        anchor: false,
        operationId,
        fullOverwrite: true,
      };
    }

    try {
      // 处理操作区变化（委托给兼容性处理器）
      const changes = this.compatibility.processMessageChanges(
        correctedCurrentMessages,
        operationZone
      );

      // 检查是否有真正的变化
      const hasRealChanges =
        changes &&
        (changes.newMessages.length > 0 ||
          changes.updatedMessages.length > 0 ||
          changes.removedMessages.length > 0);

      if (!hasRealChanges) {
        Logger.info(
          '[StorageManager] 没有消息变化，跳过保存',
          operationId
        );
        return {
          success: true,
          conversation,
          anchor: anchor.found,
          operationId,
          skipped: true,
        };
      }

      // 合并保护区和更新后的操作区
      conversation.messages = normalizeAndDedupeMessages([
        ...protectedZone,
        ...this.mergeChanges(operationZone, changes),
      ]);

      this.updateMetadata(conversation, changes);
      await this.saveConversation(conversation);
      this.cacheManager.set(conversation.conversationId, conversation);

      Logger.info('[StorageManager] 操作完成', operationId);
      return {
        success: true,
        conversation,
        anchor: anchor.found,
        operationId,
      };
    } catch (error) {
      Logger.error('[StorageManager] 操作失败', operationId, error);
      throw error;
    }
  }

  /**
   * 合并变化到消息列表
   */
  private mergeChanges(
    messages: Message[],
    changes: MessageChanges
  ): Message[] {
    let result = [...messages];

    // 删除
    if (changes.removedMessages.length > 0) {
      const removedIds = new Set(
        changes.removedMessages.map((m) => m.messageId)
      );
      result = result.filter((m) => !removedIds.has(m.messageId));
    }

    // 更新
    if (changes.updatedMessages.length > 0) {
      const updateMap = new Map(
        changes.updatedMessages.map((m) => [m.messageId, m])
      );
      result = result.map((m) => updateMap.get(m.messageId) || m);
    }

    // 新增
    if (changes.newMessages.length > 0) {
      result.push(
        ...changes.newMessages.map((msg) =>
          this.compatibility.normalizeMessage(msg)
        )
      );
    }

    return normalizeAndDedupeMessages(result);
  }

  /**
   * 保存新对话
   */
  private async saveNewConversation(
    conversationId: string,
    currentMessages: Message[],
    conversation: Conversation | null
  ): Promise<IncrementalUpdateResult> {
    Logger.info(
      '[StorageManager] 新对话，全量保存',
      currentMessages.length
    );

    if (!currentMessages.length) {
      Logger.info('[StorageManager] 无消息内容，跳过保存');
      return {
        success: true,
      conversation: conversation ?? undefined,
      };
    }

    const changes: MessageChanges = {
      newMessages: normalizeAndDedupeMessages(currentMessages),
      updatedMessages: [],
      removedMessages: [],
      unchanged: [],
    };

    return this.incrementalUpdate(conversationId, changes);
  }

  /**
   * 批量操作优化
   */
  async batchUpdate(
    updates: Array<{
      conversationId: string;
      changes: MessageChanges;
    }>
  ): Promise<Array<any>> {
    Logger.info('[StorageManager] 开始批量更新', updates.length, '个操作');

    const results: Promise<any>[] = [];

    for (const update of updates) {
      results.push(this.incrementalUpdate(update.conversationId, update.changes));
    }

    const settledResults = await Promise.allSettled(results);

    Logger.info('[StorageManager] 批量更新完成', {
      total: updates.length,
      success: settledResults.filter((r) => r.status === 'fulfilled').length,
      failed: settledResults.filter((r) => r.status === 'rejected').length,
    });

    return settledResults;
  }

  /**
   * 添加批量操作到队列
   */
  queueBatchUpdate(update: {
    conversationId: string;
    changes: MessageChanges;
  }): void {
    this.batchQueue.push(update);

    // 清除现有定时器
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
    }

    // 设置新的定时器
    this.batchTimeout = setTimeout(async () => {
      const updates = [...this.batchQueue];
      this.batchQueue = [];

      if (updates.length > 0) {
        await this.batchUpdate(updates);
      }
    }, this.batchDelay);
  }

  /**
   * 销毁实例，清理资源
   */
  destroy(): void {
    // 清理定时器
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }

    this.batchQueue = [];

    // 委托给各组件进行清理
    this.cacheManager.destroy();

    Logger.info('[StorageManager] 存储管理器已销毁');
  }

  /**
   * 处理批量操作队列
   */
  private async processBatchQueue(): Promise<void> {
    if (this.batchQueue.length === 0) {
      return;
    }

    const updates = [...this.batchQueue];
    this.batchQueue = [];

    await this.batchUpdate(updates);
  }

  /**
   * 获取缓存统计
   */
  getCacheStats(): {
    totalEntries: number;
    expiredEntries: number;
    validEntries: number;
    batchQueueSize: number;
  } {
    const cacheStats = this.cacheManager.getStats();

    return {
      ...cacheStats,
      batchQueueSize: this.batchQueue.length,
    };
  }

}

// 导出单例
export const storageManager = new StorageManager();
// 兼容旧代码的误导入（chatgpt adapter 中存在）
export const database = storageManager;
