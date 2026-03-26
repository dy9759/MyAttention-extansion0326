import type { Conversation } from '@/types';

import { Logger } from '@/core/errors';
import { indexedDbRepository } from '@/background/repository/indexeddb-repository';
import {
  getLocalStoreMeta,
  updateLocalStoreMeta,
} from '@/background/local-store-meta';
import { localStoreClient } from '@/background/local-store-client';

function errorToMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export class LocalStoreMigrator {
  private isRunning = false;

  async migrateIfNeeded(): Promise<void> {
    const meta = await getLocalStoreMeta();

    if (!meta.local_store_enabled) {
      Logger.warn('[LocalStoreMigrator] 本地存储未启用，跳过迁移');
      return;
    }

    if (meta.local_store_migration_state === 'done') {
      Logger.info('[LocalStoreMigrator] 迁移已完成，跳过');
      return;
    }

    await this.runMigration(false);
  }

  async startMigration(force = true): Promise<void> {
    await this.runMigration(force);
  }

  private async runMigration(force: boolean): Promise<void> {
    if (this.isRunning) {
      Logger.warn('[LocalStoreMigrator] 迁移正在进行中，跳过重复触发');
      return;
    }

    const meta = await getLocalStoreMeta();
    if (!force && meta.local_store_migration_state === 'done') {
      return;
    }

    this.isRunning = true;
    await updateLocalStoreMeta({
      local_store_migration_state: 'running',
      local_store_last_error: '',
    });

    try {
      const legacyConversations = await indexedDbRepository.getAllConversations();
      Logger.info('[LocalStoreMigrator] 检测到旧库会话数量:', legacyConversations.length);

      if (legacyConversations.length === 0) {
        await indexedDbRepository.clearAllConversations();
        await updateLocalStoreMeta({
          local_store_migration_state: 'done',
          local_store_last_error: '',
          local_store_last_migrated_at: new Date().toISOString(),
        });
        return;
      }

      await this.upsertLegacyConversations(legacyConversations);
      await this.verifyMigratedConversations(legacyConversations);

      await updateLocalStoreMeta({
        local_store_migration_state: 'done',
        local_store_last_error: '',
        local_store_last_migrated_at: new Date().toISOString(),
      });

      Logger.info('[LocalStoreMigrator] 迁移完成');
    } catch (error) {
      const message = errorToMessage(error);
      Logger.error('[LocalStoreMigrator] 迁移失败:', message);

      await updateLocalStoreMeta({
        local_store_migration_state: 'failed',
        local_store_last_error: message,
      });

      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  private async upsertLegacyConversations(conversations: Conversation[]): Promise<void> {
    for (const conversation of conversations) {
      const existing = await localStoreClient.getConversationById(conversation.conversationId);
      if (existing) {
        await localStoreClient.updateConversation(conversation.conversationId, conversation);
      } else {
        await localStoreClient.createConversation(conversation);
      }
    }
  }

  private async verifyMigratedConversations(conversations: Conversation[]): Promise<void> {
    const targetIds = conversations.map((conversation) => conversation.conversationId);
    const migratedConversations = await localStoreClient.getConversationsByIds(targetIds);

    const migratedIdSet = new Set(migratedConversations.map((conversation) => conversation.conversationId));

    const missing = targetIds.filter((conversationId) => !migratedIdSet.has(conversationId));
    if (missing.length > 0) {
      throw new Error(`Migration verification failed, missing conversations: ${missing.join(', ')}`);
    }
  }
}

export const localStoreMigrator = new LocalStoreMigrator();
