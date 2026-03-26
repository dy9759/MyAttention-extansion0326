import { afterEach, describe, expect, it, vi } from 'vitest';

import { MessageDispatcher } from '@/background/message-dispatcher';

function createSender(): chrome.runtime.MessageSender {
  return {} as chrome.runtime.MessageSender;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

describe('background message dispatcher', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('coalesces in-flight read requests with same key', async () => {
    const dispatcher = new MessageDispatcher();
    const sender = createSender();
    const handler = vi.fn(async () => {
      await delay(10);
      return { ok: true };
    });

    const request = {
      messageType: 'getStorageUsage',
      params: { type: 'getStorageUsage' },
      sender,
      handler,
    };

    const [first, second] = await Promise.all([
      dispatcher.dispatch(request),
      dispatcher.dispatch(request),
    ]);

    expect(first).toEqual({ ok: true });
    expect(second).toEqual({ ok: true });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('serializes same conversation writes and prioritizes manual over auto in queue', async () => {
    vi.useFakeTimers();
    const dispatcher = new MessageDispatcher();
    const sender = createSender();

    let firstResolved = false;
    let unblockFirst: (() => void) | null = null;
    const firstDone = new Promise<void>((resolve) => {
      unblockFirst = () => {
        firstResolved = true;
        resolve();
      };
    });

    const starts: string[] = [];

    const handler = vi.fn(async (params: any) => {
      const source = params.source || 'unknown';
      starts.push(source);
      if (!firstResolved) {
        await firstDone;
      }
      return source;
    });

    const p1 = dispatcher.dispatch({
      messageType: 'updateConversation',
      params: {
        type: 'updateConversation',
        source: 'auto',
        conversation: { conversationId: 'conv-1' },
      },
      sender,
      handler,
    });

    const p2 = dispatcher.dispatch({
      messageType: 'updateConversation',
      params: {
        type: 'updateConversation',
        source: 'auto',
        conversation: { conversationId: 'conv-1' },
      },
      sender,
      handler,
    });

    const p3 = dispatcher.dispatch({
      messageType: 'updateConversation',
      params: {
        type: 'updateConversation',
        source: 'manual',
        conversation: { conversationId: 'conv-1' },
      },
      sender,
      handler,
    });

    await Promise.resolve();
    unblockFirst?.();

    await Promise.all([p1, p2, p3]);

    expect(starts).toEqual(['auto', 'manual', 'auto']);
  });

  it('limits concurrent writes across different conversations', async () => {
    vi.useFakeTimers();

    const dispatcher = new MessageDispatcher({
      maxConcurrentWriteKeys: 2,
      taskTimeoutMs: 5_000,
    });
    const sender = createSender();

    let active = 0;
    let maxActive = 0;

    const handler = vi.fn(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await delay(30);
      active -= 1;
      return 'ok';
    });

    const tasks = ['conv-1', 'conv-2', 'conv-3'].map((conversationId) =>
      dispatcher.dispatch({
        messageType: 'createConversation',
        params: {
          type: 'createConversation',
          source: 'auto',
          conversation: { conversationId },
        },
        sender,
        handler,
      })
    );

    await vi.advanceTimersByTimeAsync(200);
    await Promise.all(tasks);

    expect(handler).toHaveBeenCalledTimes(3);
    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it('continues processing queued writes after timeout', async () => {
    vi.useFakeTimers();

    const dispatcher = new MessageDispatcher({
      maxConcurrentWriteKeys: 1,
      taskTimeoutMs: 20,
    });
    const sender = createSender();

    const handler = vi.fn(async (params: any) => {
      if (params.stall) {
        return new Promise(() => {
          // never resolve
        });
      }
      return 'ok-next';
    });

    const p1 = dispatcher.dispatch({
      messageType: 'updateConversation',
      params: {
        type: 'updateConversation',
        source: 'auto',
        stall: true,
        conversation: { conversationId: 'conv-timeout' },
      },
      sender,
      handler,
    });
    const p1Error = p1.catch((error) => error as Error);

    const p2 = dispatcher.dispatch({
      messageType: 'updateConversation',
      params: {
        type: 'updateConversation',
        source: 'auto',
        stall: false,
        conversation: { conversationId: 'conv-timeout' },
      },
      sender,
      handler,
    });

    await vi.advanceTimersByTimeAsync(25);
    const timeoutError = await p1Error;
    expect(timeoutError).toBeInstanceOf(Error);
    expect(timeoutError.message).toContain('timed out');
    await expect(p2).resolves.toBe('ok-next');
  });
});
