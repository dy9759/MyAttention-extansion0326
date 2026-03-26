import { describe, expect, it } from 'vitest';

import { RuntimeStatusStore, RUNTIME_STATUS_STALE_MS } from '@/background/runtime-status';

describe('runtime status store', () => {
  it('writes and reads runtime status', () => {
    const store = new RuntimeStatusStore();
    const status = store.upsert(
      101,
      {
        url: 'https://gemini.google.com/app/abc',
        platform: 'gemini',
        injectable: true,
      },
      {
        injected: true,
        lastExtractAt: '2026-02-27T10:00:00.000Z',
        lastSaveAt: '2026-02-27T10:00:10.000Z',
      }
    );

    const read = store.get(101);
    expect(read).not.toBeNull();
    expect(status.tabId).toBe(101);
    expect(read?.injected).toBe(true);
    expect(read?.platform).toBe('gemini');
    expect(read?.lastExtractAt).toBe('2026-02-27T10:00:00.000Z');
    expect(read?.lastSaveAt).toBe('2026-02-27T10:00:10.000Z');
  });

  it('overwrites fields and supports clearing lastError', () => {
    const store = new RuntimeStatusStore();
    store.upsert(
      202,
      {
        url: 'https://www.doubao.com/chat/1',
        platform: 'doubao',
        injectable: true,
      },
      {
        injected: true,
        lastError: 'INJECT_FAILED',
      }
    );

    store.upsert(
      202,
      {
        url: 'https://www.doubao.com/chat/1',
        platform: 'doubao',
        injectable: true,
      },
      {
        lastSaveAt: '2026-02-27T12:00:00.000Z',
        lastError: null,
      }
    );

    const read = store.get(202);
    expect(read?.lastSaveAt).toBe('2026-02-27T12:00:00.000Z');
    expect(read?.lastError).toBeUndefined();
  });

  it('marks stale when status is outdated', () => {
    const store = new RuntimeStatusStore();
    store.upsert(
      303,
      {
        url: 'https://gemini.google.com/app/abc',
        platform: 'gemini',
        injectable: true,
      },
      {
        injected: true,
        lastSeenAt: '2026-02-27T00:00:00.000Z',
      }
    );

    const stale = store.get(
      303,
      new Date('2026-02-27T00:00:00.000Z').getTime() + RUNTIME_STATUS_STALE_MS + 1
    );

    expect(stale?.stale).toBe(true);
  });
});
