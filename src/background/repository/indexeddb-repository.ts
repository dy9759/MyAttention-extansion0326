import type { Conversation } from '@/types';

import { database } from '@/background/database';
import type { ConversationRepository } from './conversation-repository';

export class IndexedDbRepository implements ConversationRepository {
  async findConversationByUrl(url: string): Promise<Conversation | null> {
    return database.findConversationByUrl(url);
  }

  async createConversation(conversation: Partial<Conversation>): Promise<string> {
    return database.createConversation(conversation);
  }

  async updateConversation(conversation: Partial<Conversation>): Promise<void> {
    await database.updateConversation(conversation);
  }

  async getConversationById(conversationId: string): Promise<Conversation | null> {
    return database.getConversationById(conversationId);
  }

  async getAllConversations(): Promise<Conversation[]> {
    return database.getAllConversations();
  }

  async getConversationsByIds(conversationIds: string[]): Promise<Conversation[]> {
    const conversations: Conversation[] = [];

    for (const conversationId of conversationIds) {
      const conversation = await database.getConversationById(conversationId);
      if (conversation) {
        conversations.push(conversation);
      }
    }

    return conversations;
  }

  async deleteConversation(conversationId: string): Promise<void> {
    await database.deleteConversation(conversationId);
  }

  async getStorageUsage(): Promise<{ totalConversations: number; todayNewConversations: number }> {
    return database.getStorageUsage();
  }

  async clearAllConversations(): Promise<void> {
    await database.clearAllConversations();
  }
}

export const indexedDbRepository = new IndexedDbRepository();
