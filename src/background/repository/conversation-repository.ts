import type { Conversation } from '@/types';

export interface ConversationRepository {
  findConversationByUrl(url: string): Promise<Conversation | null>;
  createConversation(conversation: Partial<Conversation>): Promise<string>;
  updateConversation(conversation: Partial<Conversation>): Promise<void>;
  getConversationById(conversationId: string): Promise<Conversation | null>;
  getAllConversations(): Promise<Conversation[]>;
  getConversationsByIds(conversationIds: string[]): Promise<Conversation[]>;
  deleteConversation(conversationId: string): Promise<void>;
  getStorageUsage(): Promise<{
    totalConversations: number;
    todayNewConversations: number;
  }>;
  clearAllConversations(): Promise<void>;
}
