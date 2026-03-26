import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import {
  installPopupGlobalErrorGuard,
  safeGetMessage,
  safeSendRuntimeMessage,
} from '@/popup/chrome-safe';

function installChromeMock() {
  const runtime = {
    id: 'test-extension-id',
    lastError: undefined as { message?: string } | undefined,
    sendMessage: vi.fn(),
  };

  const tabs = {
    create: vi.fn((_options: chrome.tabs.CreateProperties, callback?: (tab: chrome.tabs.Tab) => void) => {
      callback?.({ id: 1 } as chrome.tabs.Tab);
    }),
  };

  const i18n = {
    getMessage: vi.fn((_key: string) => ''),
  };

  (globalThis as any).chrome = {
    runtime,
    tabs,
    i18n,
  };

  return { runtime, tabs, i18n };
}

describe('popup chrome-safe', () => {
  beforeEach(() => {
    installChromeMock();
  });

  afterEach(() => {
    delete (globalThis as any).chrome;
    vi.restoreAllMocks();
  });

  it('safeSendRuntimeMessage rejects when lastError exists', async () => {
    const runtime = (globalThis as any).chrome.runtime;
    runtime.sendMessage.mockImplementation((_message: unknown, callback: (response?: unknown) => void) => {
      runtime.lastError = { message: 'Extension context invalidated.' };
      callback(undefined);
      runtime.lastError = undefined;
    });

    await expect(
      safeSendRuntimeMessage({ type: 'getSettings' as any })
    ).rejects.toThrow('Extension context invalidated');
  });

  it('safeSendRuntimeMessage rejects when runtime id is unavailable', async () => {
    const runtime = (globalThis as any).chrome.runtime;
    Object.defineProperty(runtime, 'id', {
      configurable: true,
      get() {
        throw new Error('Extension context invalidated.');
      },
    });

    await expect(
      safeSendRuntimeMessage({ type: 'getSettings' as any })
    ).rejects.toThrow('Extension context invalidated');
  });

  it('safeGetMessage returns fallback when i18n access throws', () => {
    const i18n = (globalThis as any).chrome.i18n;
    i18n.getMessage.mockImplementation(() => {
      throw new Error('Extension context invalidated.');
    });

    expect(safeGetMessage('saveSuccess', 'fallback text')).toBe('fallback text');
  });

  it('installPopupGlobalErrorGuard consumes context invalidated unhandledrejection', () => {
    const onInvalidated = vi.fn();
    const cleanup = installPopupGlobalErrorGuard(onInvalidated);

    const event = new Event('unhandledrejection', { cancelable: true }) as PromiseRejectionEvent;
    Object.defineProperty(event, 'reason', {
      value: new Error('Extension context invalidated.'),
      configurable: true,
    });

    window.dispatchEvent(event);

    expect(onInvalidated).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);

    cleanup();
  });
});
