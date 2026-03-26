import { describe, expect, it } from 'vitest';
import type { Message } from '@/types';
import { normalizeAndDedupeMessages } from '@/core/storage/message-normalizer';

function makeMessage(partial: Partial<Message>): Message {
  const now = '2026-01-01T00:00:00.000Z';
  return {
    messageId: partial.messageId || 'm',
    sender: partial.sender || 'assistant',
    content: partial.content || '',
    position: partial.position ?? 0,
    createdAt: partial.createdAt || now,
    updatedAt: partial.updatedAt || partial.createdAt || now,
    thinking: partial.thinking,
    timestamp: partial.timestamp,
    lastMessageAt: partial.lastMessageAt,
  };
}

describe('normalizeAndDedupeMessages', () => {
  it('dedupes by messageId and keeps the newest message', () => {
    const messages = [
      makeMessage({
        messageId: 'same',
        sender: 'AI',
        content: 'old',
        position: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:01.000Z',
      }),
      makeMessage({
        messageId: 'same',
        sender: 'assistant',
        content: 'new',
        position: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:02.000Z',
      }),
    ];

    const normalized = normalizeAndDedupeMessages(messages);
    expect(normalized).toHaveLength(1);
    expect(normalized[0].content).toBe('new');
    expect(normalized[0].sender).toBe('assistant');
  });

  it('normalizes sender ai/AI to assistant', () => {
    const messages = [
      makeMessage({ messageId: 'm1', sender: 'ai', content: 'a', position: 0 }),
      makeMessage({ messageId: 'm2', sender: 'AI', content: 'b', position: 1 }),
      makeMessage({ messageId: 'm3', sender: 'user', content: 'c', position: 2 }),
    ];

    const normalized = normalizeAndDedupeMessages(messages);
    expect(normalized.map((m) => m.sender)).toEqual(['assistant', 'assistant', 'user']);
  });

  it('sorts by position then createdAt', () => {
    const messages = [
      makeMessage({
        messageId: 'm3',
        content: 'third',
        position: 2,
        createdAt: '2026-01-01T00:00:03.000Z',
      }),
      makeMessage({
        messageId: 'm1',
        content: 'first',
        position: 0,
        createdAt: '2026-01-01T00:00:01.000Z',
      }),
      makeMessage({
        messageId: 'm2',
        content: 'second',
        position: 1,
        createdAt: '2026-01-01T00:00:02.000Z',
      }),
    ];

    const normalized = normalizeAndDedupeMessages(messages);
    expect(normalized.map((m) => m.messageId)).toEqual(['m1', 'm2', 'm3']);
  });

  it('builds fallback messageId when missing', () => {
    const messages = [
      {
        ...makeMessage({
          messageId: '',
          sender: 'AI',
          position: 5,
          content: 'hello fallback',
        }),
        messageId: '' as unknown as string,
      },
    ];

    const normalized = normalizeAndDedupeMessages(messages);
    expect(normalized[0].messageId).toContain('assistant_5_');
  });
});
