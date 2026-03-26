/**
 * Chrome 存储适配器
 * 封装 Chrome IndexedDB API
 */

import type { Conversation } from '@/types';
import { Logger, ErrorFactory, ERROR_CODES } from '@/core/errors';
import { DB_NAME, DB_VERSION, STORES } from '@/types';
import { normalizeAndDedupeMessages } from './message-normalizer';

/**
 * Chrome 存储适配器
 * 封装 Chrome IndexedDB API，提供类型安全的存储操作
 */
export class ChromeStorageAdapter {
  private db: IDBDatabase | null = null;
  private dbPromise: Promise<IDBDatabase> | null = null;

  /**
   * 打开数据库连接
   */
  async open(): Promise<IDBDatabase> {
    if (this.db) {
      Logger.debug('[StorageAdapter] 数据库已打开');
      return this.db;
    }

    Logger.info('[StorageAdapter] 打开数据库...');

    try {
      this.db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = (event: Event) => {
          Logger.error('[StorageAdapter] 打开数据库失败', event);
          reject(ErrorFactory.database('打开数据库失败', event));
        };

        request.onsuccess = () => {
          const database = request.result;
          Logger.info('[StorageAdapter] 数据库打开成功', {
            name: database.name,
            version: database.version,
            objectStoreNames: database.objectStoreNames,
          });
          resolve(database);
        };

        request.onupgradeneeded = (event) => {
          Logger.warn('[StorageAdapter] 数据库需要升级', event);
          this.handleMigration(event.oldVersion, event.newVersion);
        };
      });

      Logger.info('[StorageAdapter] 数据库连接完成');
      return this.db;
    } catch (error) {
      throw ErrorFactory.database('数据库初始化失败', error as Error);
    }
  }

  /**
   * 处理数据库升级
   */
  private handleMigration(oldVersion: number, newVersion: number | null): void {
    Logger.info('[StorageAdapter] 处理数据库升级', {
      from: oldVersion,
      to: newVersion ?? DB_VERSION,
    });

    // 获取需要迁移的数据
    const oldData = this.getMigratedData(oldVersion);
    this.migrateData(oldData, newVersion ?? DB_VERSION);
  }

  /**
   * 获取需要迁移的数据（预留）
   */
  private getMigratedData(version: number): any {
    Logger.debug('[StorageAdapter] 获取迁移数据', version);
    return null;
  }

  /**
   * 迁移数据（预留）
   */
  private migrateData(oldData: any, newVersion: number): void {
    Logger.debug('[StorageAdapter] 迁移数据', { to: newVersion });
  }

  /**
   * 获取数据库 Promise
   */
  getDatabase(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = this.open();
    }
    return this.dbPromise;
  }

  /**
   * 获取数据库实例（同步访问）
   */
  getDatabaseSync(): IDBDatabase | null {
    return this.db;
  }

  /**
   * 开始事务
   */
  async transaction<T>(
    mode: IDBTransactionMode,
    callback: (stores: any) => Promise<T>
  ): Promise<T> {
    const db = await this.getDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.CONVERSATIONS, mode);
      transaction.onerror = (event: Event) => {
        Logger.error('[StorageAdapter] 事务失败', event);
        reject(ErrorFactory.storage('事务执行失败', event));
      };

      const stores: any = {
        conversations: transaction.objectStore(STORES.CONVERSATIONS),
      };

      transaction.oncomplete = () => {
        Logger.debug('[StorageAdapter] 事务完成');
      };
      transaction.onabort = () => {
        Logger.warn('[StorageAdapter] 事务中止');
      };

      try {
        const result = callback(stores);
        resolve(result);
      } catch (error) {
        transaction.abort();
        reject(error);
      }
    });
  }

  /**
   * 只读事务
   */
  async readTransaction<T>(
    callback: (stores: any) => Promise<T>
  ): Promise<T> {
    return this.transaction('readonly', callback);
  }

  /**
   * 读写事务
   */
  async readWriteTransaction<T>(
    callback: (stores: any) => Promise<T>
  ): Promise<T> {
    return this.transaction('readwrite', callback);
  }

  /**
   * 创建对话
   */
  async createConversation(conversation: Partial<Conversation>): Promise<string> {
    Logger.info('[StorageAdapter] 创建对话', conversation.conversationId);

    try {
      const conversationId = await this.readWriteTransaction(async (stores) => {
        const store = stores.conversations;

        // 检查是否已存在
        const existing = await this.get(store, conversation.conversationId!);
        if (existing) {
          Logger.warn('[StorageAdapter] 对话已存在:', conversation.conversationId);
          throw ErrorFactory.storage('对话已存在', '对话 ID 已存在');
        }

        const now = new Date().toISOString();
        const normalizedMessages = normalizeAndDedupeMessages(conversation.messages || []);
        const fullConversation: Conversation = {
          conversationId: conversation.conversationId!,
          link: conversation.link || '',
          title: conversation.title || '新对话',
          platform: conversation.platform!,
          messages: normalizedMessages,
          createdAt: conversation.createdAt || now,
          updatedAt: now,
          messageCount: normalizedMessages.length,
          lastMessageAt:
            this.getLastMessageTime({
              messages: normalizedMessages,
              createdAt: now,
              updatedAt: now,
            }) || undefined,
          externalId: conversation.externalId || null,
          dataVersion: 2,
        };

        store.add(fullConversation);
        Logger.debug('[StorageAdapter] 对话已创建:', conversation.conversationId);

        return conversation.conversationId!;
      });

      return conversationId;
    } catch (error) {
      Logger.error('[StorageAdapter] 创建对话失败', error);
      throw error;
    }
  }

  /**
   * 获取对话
   */
  async getConversation(
    conversationId: string
  ): Promise<Conversation | null> {
    Logger.debug('[StorageAdapter] 获取对话:', conversationId);

    try {
      return await this.readTransaction(async (stores) => {
        const store = stores.conversations;
        return await this.get(store, conversationId);
      });
    } catch (error) {
      Logger.error('[StorageAdapter] 获取对话失败', error);
      return null;
    }
  }

  /**
   * 更新对话
   */
  async updateConversation(conversation: Partial<Conversation>): Promise<void> {
    Logger.debug('[StorageAdapter] 更新对话:', conversation.conversationId);

    try {
      await this.readWriteTransaction(async (stores) => {
        const store = stores.conversations;

        const existing = await this.get(store, conversation.conversationId!);
        if (!existing) {
          Logger.warn('[StorageAdapter] 对话不存在:', conversation.conversationId);
          throw ErrorFactory.storage('对话不存在', '对话 ID 不存在');
        }

        const normalizedMessages = conversation.messages
          ? normalizeAndDedupeMessages(conversation.messages)
          : undefined;

        const now = new Date().toISOString();
        const updated: Conversation = {
          ...existing,
          ...conversation,
          ...(normalizedMessages ? { messages: normalizedMessages } : {}),
          updatedAt: now,
          messageCount: normalizedMessages?.length || existing.messageCount,
          lastMessageAt: normalizedMessages?.length
            ? this.getLastMessageTime({
                  messages: normalizedMessages,
                  createdAt: existing.createdAt,
                  updatedAt: now,
                })
            : existing.lastMessageAt,
        };

        store.put(updated);
        Logger.debug('[StorageAdapter] 对话已更新:', conversation.conversationId);
      });
    } catch (error) {
      Logger.error('[StorageAdapter] 更新对话失败', error);
      throw error;
    }
  }

  /**
   * 删除对话
   */
  async deleteConversation(conversationId: string): Promise<void> {
    Logger.info('[StorageAdapter] 删除对话:', conversationId);

    try {
      await this.readWriteTransaction(async (stores) => {
        const store = stores.conversations;
        store.delete(conversationId);
        Logger.info('[StorageAdapter] 对话已删除:', conversationId);
      });
    } catch (error) {
      Logger.error('[StorageAdapter] 删除对话失败', error);
      throw error;
    }
  }

  /**
   * 获取所有对话
   */
  async getAllConversations(): Promise<Conversation[]> {
    Logger.debug('[StorageAdapter] 获取所有对话');

    try {
      return await this.readTransaction(async (stores) => {
        const store = stores.conversations;
        const all: Conversation[] = [];

        await this.getAll(store, (item) => {
          all.push(item);
        });

        // 按更新时间倒序排序
        all.sort((a, b) => {
          const timeA = new Date(a.updatedAt || a.createdAt).getTime();
          const timeB = new Date(b.updatedAt || b.createdAt).getTime();
          return timeB - timeA;
        });

        Logger.info('[StorageAdapter] 找到对话数量:', all.length);
        return all;
      });
    } catch (error) {
      Logger.error('[StorageAdapter] 获取所有对话失败', error);
      return [];
    }
  }

  /**
   * 根据 URL 查找对话
   */
  async findConversationByUrl(url: string): Promise<Conversation | null> {
    Logger.debug('[StorageAdapter] 根据 URL 查找对话:', url);

    try {
      return await this.readTransaction(async (stores) => {
        const store = stores.conversations;
        const cleanUrl = this.sanitizeConversationUrl(url);
        const index = store.index('link');

        return await new Promise<Conversation | null>((resolve, reject) => {
          const request = index.get(cleanUrl);
          request.onsuccess = () => {
            const conversation = request.result || null;
            if (conversation) {
              Logger.debug('[StorageAdapter] 找到对话:', conversation.conversationId);
            } else {
              Logger.debug('[StorageAdapter] 未找到对话');
            }
            resolve(conversation);
          };
          request.onerror = (event: Event) => {
            const target = event.target as IDBRequest | null;
            reject(target?.error || event);
          };
        });
      });
    } catch (error) {
      Logger.error('[StorageAdapter] 查找对话失败', error);
      return null;
    }
  }

  /**
   * 清空所有数据
   */
  async clearAll(): Promise<void> {
    Logger.info('[StorageAdapter] 清空所有数据');

    try {
      return await this.readWriteTransaction(async (stores) => {
        const store = stores.conversations;
        store.clear();
        Logger.info('[StorageAdapter] 数据已清空');
      });
    } catch (error) {
      Logger.error('[StorageAdapter] 清空数据失败', error);
      throw error;
    }
  }

  /**
   * 获取存储使用情况
   */
  async getStorageUsage(): Promise<{
    conversations: number;
    messages: number;
  }> {
    Logger.debug('[StorageAdapter] 获取存储使用情况');

    try {
      return await this.readTransaction(async (stores) => {
        const store = stores.conversations;

        let conversationCount = 0;
        let messageCount = 0;

        await this.getAll(store, (conversation) => {
          conversationCount++;
          messageCount += conversation.messageCount || 0;
        });

        return {
          conversations: conversationCount,
          messages: messageCount,
        };
      });
    } catch (error) {
      Logger.error('[StorageAdapter] 获取存储使用情况失败', error);
      return {
        conversations: 0,
        messages: 0,
      };
    }
  }

  /**
   * 获取对象
   */
  private async get(
    store: IDBObjectStore,
    key: IDBValidKey | IDBKeyRange
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const request = store.get(key);

      request.onsuccess = (result) => {
        resolve(result);
      };

      request.onerror = (event: Event) => {
        Logger.error('[StorageAdapter] 获取对象失败', event);
        reject(ErrorFactory.storage('获取对象失败', event));
      };
    });
  }

  /**
   * 获取所有对象
   */
  private async getAll(
    store: IDBObjectStore,
    callback: (item: any) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = store.openCursor();

      request.onsuccess = () => {
        try {
          const cursor = request.result;
          if (cursor) {
            callback(cursor.value);
            cursor.continue();
            return;
          }
          resolve();
        } catch (error) {
          reject(error);
        }
      };

      request.onerror = (event: Event) => {
        Logger.error('[StorageAdapter] 获取所有对象失败', event);
        reject(ErrorFactory.storage('获取所有对象失败', event));
      };
    });
  }

  /**
   * 获取最后消息时间
   */
  private getLastMessageTime(conversation: any): string | null {
    if (!conversation || !conversation.messages || conversation.messages.length === 0) {
      return null;
    }

    const lastMessage = conversation.messages[conversation.messages.length - 1];
    if (lastMessage && lastMessage.updatedAt) {
      return lastMessage.updatedAt;
    }
    if (lastMessage && lastMessage.createdAt) {
      return lastMessage.createdAt;
    }

    return null;
  }

  /**
   * 清洗会话 URL（忽略 query/hash）
   */
  private sanitizeConversationUrl(url: string): string {
    return (url || '').split(/[?#]/)[0];
  }

  /**
   * 关闭数据库
   */
  async close(): Promise<void> {
    Logger.info('[StorageAdapter] 关闭数据库');

    if (this.db) {
      this.db.close();
      this.db = null;
      this.dbPromise = null;
      Logger.info('[StorageAdapter] 数据库已关闭');
    }
  }

  /**
   * 销毁适配器
   */
  async destroy(): Promise<void> {
    await this.close();
  }
}

// 导出单例
export const chromeStorageAdapter = new ChromeStorageAdapter();
