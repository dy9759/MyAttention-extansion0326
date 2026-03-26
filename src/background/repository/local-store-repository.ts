import type { Conversation, SyncOutboxEntry } from '@/types';

import { database } from '@/background/database';
import { indexedDbRepository } from './indexeddb-repository';
import { localStoreSyncService } from '@/background/local-store-sync-service';
import type { ConversationRepository } from './conversation-repository';

function buildOutboxEntry(
  operation: SyncOutboxEntry['operation'],
  entityId: string,
  payload: unknown
): SyncOutboxEntry {
  const now = new Date().toISOString();
  return {
    operation,
    entityId,
    payload,
    createdAt: now,
    updatedAt: now,
  };
}

export class LocalStoreRepository implements ConversationRepository {
  async findConversationByUrl(url: string): Promise<Conversation | null> {
    return indexedDbRepository.findConversationByUrl(url);
  }

  async createConversation(conversation: Partial<Conversation>): Promise<string> {
    const conversationId = await indexedDbRepository.createConversation(conversation);
    const detail = await indexedDbRepository.getConversationById(conversationId);
    if (detail) {
      await localStoreSyncService.recordOperation(
        buildOutboxEntry('conversation_upsert', conversationId, detail)
      );
    }
    return conversationId;
  }

  async updateConversation(conversation: Partial<Conversation>): Promise<void> {
    await indexedDbRepository.updateConversation(conversation);
    const conversationId = conversation.conversationId;
    if (!conversationId) {
      return;
    }
    const detail = await indexedDbRepository.getConversationById(conversationId);
    if (detail) {
      await localStoreSyncService.recordOperation(
        buildOutboxEntry('conversation_upsert', conversationId, detail)
      );
    }
  }

  async getConversationById(conversationId: string): Promise<Conversation | null> {
    return indexedDbRepository.getConversationById(conversationId);
  }

  async getAllConversations(): Promise<Conversation[]> {
    return indexedDbRepository.getAllConversations();
  }

  async getConversationsByIds(conversationIds: string[]): Promise<Conversation[]> {
    return indexedDbRepository.getConversationsByIds(conversationIds);
  }

  async deleteConversation(conversationId: string): Promise<void> {
    await indexedDbRepository.deleteConversation(conversationId);
    await localStoreSyncService.recordOperation(
      buildOutboxEntry('conversation_delete', conversationId, { conversationId })
    );
  }

  async getStorageUsage(): Promise<{ totalConversations: number; todayNewConversations: number }> {
    return indexedDbRepository.getStorageUsage();
  }

  async clearAllConversations(): Promise<void> {
    await indexedDbRepository.clearAllConversations();
    await localStoreSyncService.recordOperation(
      buildOutboxEntry('conversation_clear', 'all', {})
    );
  }

  async hydrateFromLocalStore(force = false): Promise<boolean> {
    return localStoreSyncService.hydrateMirrorFromLocalStore(force);
  }
}

export const localStoreRepository = new LocalStoreRepository();
