import { describe, expect, it } from 'vitest';
import type { Message } from '@/types';
import { Compatibility } from '@/core/compatibility';

function msg(
  messageId: string,
  content: string,
  position: number,
  sender: Message['sender'] = 'assistant'
): Message {
  const now = '2026-01-01T00:00:00.000Z';
  return {
    messageId,
    sender,
    content,
    position,
    createdAt: now,
    updatedAt: now,
  };
}

describe('Compatibility.processMessageChanges', () => {
  it('detects additions, updates, removals and unchanged messages', () => {
    const compatibility = new Compatibility();

    const storedMessages: Message[] = [
      msg('m1', 'hello', 0, 'user'),
      msg('m2', 'old answer', 1, 'assistant'),
      msg('m3', 'to be removed', 2, 'assistant'),
    ];

    const currentMessages: Message[] = [
      msg('m1', 'hello', 0, 'user'),
      msg('m2', 'new answer', 1, 'assistant'),
      msg('m4', 'newly added', 2, 'assistant'),
    ];

    const changes = compatibility.processMessageChanges(currentMessages, storedMessages);

    expect(changes.newMessages.map((m) => m.messageId)).toEqual(['m4']);
    expect(changes.updatedMessages.map((m) => m.messageId)).toEqual(['m2']);
    expect(changes.removedMessages.map((m) => m.messageId)).toEqual(['m3']);
    expect(changes.unchanged.map((m) => m.messageId)).toEqual(['m1']);

    compatibility.destroy();
  });
});
