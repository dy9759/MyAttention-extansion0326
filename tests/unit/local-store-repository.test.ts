import { afterEach, describe, expect, it, vi } from 'vitest';

const indexedDbMocks = vi.hoisted(() => ({
  createConversation: vi.fn(),
  updateConversation: vi.fn(),
  getConversationById: vi.fn(),
  getAllConversations: vi.fn(),
  getConversationsByIds: vi.fn(),
  findConversationByUrl: vi.fn(),
  deleteConversation: vi.fn(),
  getStorageUsage: vi.fn(),
  clearAllConversations: vi.fn(),
}));

const syncServiceMocks = vi.hoisted(() => ({
  recordOperation: vi.fn(),
  hydrateMirrorFromLocalStore: vi.fn(),
}));

vi.mock('@/background/repository/indexeddb-repository', () => ({
  indexedDbRepository: indexedDbMocks,
}));

vi.mock('@/background/local-store-sync-service', () => ({
  localStoreSyncService: syncServiceMocks,
}));

import { localStoreRepository } from '@/background/repository/local-store-repository';

describe('local store repository failover', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Object.values(indexedDbMocks).forEach((mockFn) => mockFn.mockReset());
    Object.values(syncServiceMocks).forEach((mockFn) => mockFn.mockReset());
  });

  it('writes conversations into the mirror first and records an outbox operation', async () => {
    indexedDbMocks.createConversation.mockResolvedValue('conv-1');
    indexedDbMocks.getConversationById.mockResolvedValue({
      conversationId: 'conv-1',
      link: 'https://chatgpt.com/c/1',
      title: 'title',
      platform: 'chatgpt',
      messages: [],
      createdAt: '2026-03-16T10:00:00.000Z',
      updatedAt: '2026-03-16T10:00:00.000Z',
      messageCount: 0,
    });

    const conversationId = await localStoreRepository.createConversation({
      conversationId: 'conv-1',
      link: 'https://chatgpt.com/c/1',
      title: 'title',
      platform: 'chatgpt',
      messages: [],
    });

    expect(conversationId).toBe('conv-1');
    expect(indexedDbMocks.createConversation).toHaveBeenCalledTimes(1);
    expect(syncServiceMocks.recordOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'conversation_upsert',
        entityId: 'conv-1',
      })
    );
  });

  it('proxies read operations to the IndexedDB mirror', async () => {
    indexedDbMocks.getAllConversations.mockResolvedValue([
      {
        conversationId: 'conv-1',
        link: 'https://chatgpt.com/c/1',
        title: 'title',
        platform: 'chatgpt',
        messages: [],
        createdAt: '2026-03-16T10:00:00.000Z',
        updatedAt: '2026-03-16T10:00:00.000Z',
        messageCount: 0,
      },
    ]);

    const conversations = await localStoreRepository.getAllConversations();

    expect(conversations).toHaveLength(1);
    expect(indexedDbMocks.getAllConversations).toHaveBeenCalledTimes(1);
    expect(syncServiceMocks.recordOperation).not.toHaveBeenCalled();
  });
});
