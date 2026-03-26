import type { Message } from '@/types';

function toIsoString(value: string | undefined, fallback: string): string {
  if (!value) {
    return fallback;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return fallback;
  }

  return date.toISOString();
}

function normalizeSender(sender: Message['sender'] | undefined): Message['sender'] {
  return sender === 'user' ? 'user' : 'assistant';
}

function buildFallbackMessageId(message: Partial<Message>, index: number): string {
  const sender = normalizeSender(message.sender);
  const content = (message.content || '').slice(0, 32);
  const position = Number.isFinite(message.position) ? (message.position as number) : index;
  return `${sender}_${position}_${content}`;
}

/**
 * 统一做消息归一化、去重和稳定排序，避免重复写入导致的数据膨胀。
 */
export function normalizeAndDedupeMessages(messages: Message[] = []): Message[] {
  const now = new Date().toISOString();

  const normalized = messages.map((message, index) => {
    const createdAt = toIsoString(
      message.createdAt || (message as Partial<Message>).timestamp,
      now
    );
    const updatedAt = toIsoString(message.updatedAt, createdAt);
    const position = Number.isFinite(message.position) ? message.position : index;
    const messageId = message.messageId || buildFallbackMessageId(message, index);

    return {
      ...message,
      messageId,
      sender: normalizeSender(message.sender),
      content: message.content || '',
      position,
      createdAt,
      updatedAt,
    } as Message;
  });

  const deduped = new Map<string, Message>();
  normalized.forEach((message) => {
    const key = message.messageId;
    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, message);
      return;
    }

    const existingTime = new Date(existing.updatedAt || existing.createdAt).getTime();
    const currentTime = new Date(message.updatedAt || message.createdAt).getTime();
    deduped.set(key, currentTime >= existingTime ? message : existing);
  });

  return Array.from(deduped.values()).sort((a, b) => {
    const posDiff = (a.position || 0) - (b.position || 0);
    if (posDiff !== 0) {
      return posDiff;
    }

    const createdDiff =
      new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
    if (createdDiff !== 0) {
      return createdDiff;
    }

    return a.messageId.localeCompare(b.messageId);
  });
}
