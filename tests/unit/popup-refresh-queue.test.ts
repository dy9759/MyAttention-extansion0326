import { afterEach, describe, expect, it, vi } from 'vitest';

import { createPopupRefreshQueue } from '@/popup/refresh-queue';

describe('popup refresh queue', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('coalesces same task type within 250ms window', async () => {
    vi.useFakeTimers();
    const runner = vi.fn(async () => {
      // noop
    });

    const queue = createPopupRefreshQueue(runner, { coalesceWindowMs: 250 });

    queue.enqueue('refreshStorageStats');
    await vi.advanceTimersByTimeAsync(150);
    queue.enqueue('refreshStorageStats');

    await vi.advanceTimersByTimeAsync(240);
    expect(runner).toHaveBeenCalledTimes(0);

    await vi.advanceTimersByTimeAsync(20);
    expect(runner).toHaveBeenCalledTimes(1);
    expect(runner).toHaveBeenNthCalledWith(1, 'refreshStorageStats');

    queue.dispose();
  });

  it('runs tasks serially and by priority', async () => {
    vi.useFakeTimers();
    const order: string[] = [];
    let active = 0;
    let maxActive = 0;

    const queue = createPopupRefreshQueue(async (taskType) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      order.push(`start:${taskType}`);
      await Promise.resolve();
      order.push(`end:${taskType}`);
      active -= 1;
    });

    queue.enqueue('refreshRuntimeDiagnostics');
    queue.enqueue('refreshStorageStats');
    queue.enqueue('refreshConversations');

    await vi.advanceTimersByTimeAsync(300);

    expect(maxActive).toBe(1);
    expect(order).toEqual([
      'start:refreshConversations',
      'end:refreshConversations',
      'start:refreshStorageStats',
      'end:refreshStorageStats',
      'start:refreshRuntimeDiagnostics',
      'end:refreshRuntimeDiagnostics',
    ]);

    queue.dispose();
  });
});
