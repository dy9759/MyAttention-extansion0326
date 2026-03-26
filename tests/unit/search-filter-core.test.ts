import { describe, expect, it } from 'vitest';
import type { Conversation, Message } from '@/types';
import {
  filterConversationsByDateAndPlatform,
  searchConversationsByTerm,
} from '@/popup/search-filter-core';

function buildMessage(content: string, sender: Message['sender'] = 'assistant'): Message {
  return {
    messageId: `${sender}-${content}`,
    sender,
    content,
    position: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function buildConversation(partial: Partial<Conversation>): Conversation {
  const now = '2026-01-01T00:00:00.000Z';
  return {
    conversationId: partial.conversationId || 'c1',
    link: partial.link || 'https://chatgpt.com/c/1',
    platform: partial.platform || 'chatgpt',
    title: partial.title || 'Untitled',
    messages: partial.messages || [buildMessage('default')],
    createdAt: partial.createdAt || now,
    updatedAt: partial.updatedAt || now,
    messageCount: partial.messageCount ?? (partial.messages || [buildMessage('default')]).length,
    lastMessageAt: partial.lastMessageAt,
    externalId: partial.externalId,
    dataVersion: partial.dataVersion,
  };
}

describe('search-filter core', () => {
  it('searches by title and message content with multi-keyword match', () => {
    const conversations: Conversation[] = [
      buildConversation({
        conversationId: 'c1',
        title: 'ChatGPT prompt engineering',
        messages: [buildMessage('how to write better prompts', 'user')],
      }),
      buildConversation({
        conversationId: 'c2',
        title: 'Gemini translation',
        platform: 'gemini',
        messages: [buildMessage('translate this text to english', 'user')],
      }),
    ];

    const titleMatches = searchConversationsByTerm(conversations, 'chatgpt prompt');
    expect(titleMatches.map((c) => c.conversationId)).toEqual(['c1']);

    const contentMatches = searchConversationsByTerm(conversations, 'translate english');
    expect(contentMatches.map((c) => c.conversationId)).toEqual(['c2']);
  });

  it('filters by platform and date range', () => {
    const conversations: Conversation[] = [
      buildConversation({
        conversationId: 'c1',
        platform: 'chatgpt',
        createdAt: '2026-01-10T00:00:00.000Z',
      }),
      buildConversation({
        conversationId: 'c2',
        platform: 'gemini',
        createdAt: '2026-01-20T00:00:00.000Z',
      }),
      buildConversation({
        conversationId: 'c3',
        platform: 'claude',
        createdAt: '2026-02-05T00:00:00.000Z',
      }),
    ];

    const filtered = filterConversationsByDateAndPlatform(conversations, {
      startDate: '2026-01-15',
      endDate: '2026-01-31',
      platforms: new Set(['gemini']),
    });

    expect(filtered.map((c) => c.conversationId)).toEqual(['c2']);
  });
});
