import type { ChromeMessageRequest, ChromeMessageResponse } from '@/types';

export function toErrorMessage(error: unknown): string {
  if (typeof error === 'string') {
    return error;
  }

  if (error && typeof error === 'object') {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === 'string' && maybeMessage.trim().length > 0) {
      return maybeMessage;
    }

    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }

  return String(error);
}

function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  const message = toErrorMessage(error);
  return new Error(message || 'Unknown Chrome runtime error');
}

export function isContextInvalidated(error: unknown): boolean {
  const message = toErrorMessage(error).toLowerCase();
  return (
    message.includes('extension context invalidated') ||
    message.includes('could not establish connection') ||
    message.includes('receiving end does not exist')
  );
}

function getRuntimeLastErrorSafe(): unknown | null {
  try {
    return chrome.runtime.lastError || null;
  } catch (error) {
    return error;
  }
}

function isRuntimeContextAvailable(): boolean {
  try {
    return Boolean(chrome.runtime?.id);
  } catch {
    return false;
  }
}

export function safeGetMessage(
  key: string,
  fallback = '',
  substitutions?: string | string[]
): string {
  try {
    const message = chrome?.i18n?.getMessage?.(key, substitutions as any);
    if (typeof message === 'string' && message.length > 0) {
      return message;
    }
  } catch {
    // ignore and fallback
  }

  return fallback || '';
}

export async function safeSendRuntimeMessage<T = unknown, R = unknown>(
  message: ChromeMessageRequest<T>
): Promise<ChromeMessageResponse<R>> {
  return new Promise((resolve, reject) => {
    if (!chrome?.runtime?.sendMessage) {
      reject(new Error('Chrome runtime unavailable'));
      return;
    }

    if (!isRuntimeContextAvailable()) {
      reject(new Error('Extension context invalidated.'));
      return;
    }

    try {
      chrome.runtime.sendMessage(message, (response) => {
        try {
          const lastError = getRuntimeLastErrorSafe();
          if (lastError) {
            reject(normalizeError(lastError));
            return;
          }

          resolve((response ?? {}) as ChromeMessageResponse<R>);
        } catch (error) {
          reject(normalizeError(error));
        }
      });
    } catch (error) {
      reject(normalizeError(error));
    }
  });
}

export async function safeCreateTab(url: string): Promise<chrome.tabs.Tab | void> {
  if (!url) {
    return;
  }

  return new Promise((resolve, reject) => {
    if (!chrome?.tabs?.create) {
      reject(new Error('Chrome tabs API unavailable'));
      return;
    }

    if (!isRuntimeContextAvailable()) {
      reject(new Error('Extension context invalidated.'));
      return;
    }

    try {
      chrome.tabs.create({ url }, (tab) => {
        try {
          const lastError = getRuntimeLastErrorSafe();
          if (lastError) {
            reject(normalizeError(lastError));
            return;
          }

          resolve(tab);
        } catch (error) {
          reject(normalizeError(error));
        }
      });
    } catch (error) {
      reject(normalizeError(error));
    }
  });
}

export function installPopupGlobalErrorGuard(
  onInvalidated: (error: unknown) => void
): () => void {
  let handled = false;

  const tryHandle = (error: unknown): boolean => {
    if (handled || !isContextInvalidated(error)) {
      return false;
    }

    handled = true;
    onInvalidated(error);
    return true;
  };

  const onWindowError = (event: ErrorEvent) => {
    const error = event.error ?? event.message;
    if (tryHandle(error)) {
      event.preventDefault();
    }
  };

  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    if (tryHandle(event.reason)) {
      event.preventDefault();
    }
  };

  window.addEventListener('error', onWindowError);
  window.addEventListener('unhandledrejection', onUnhandledRejection);

  return () => {
    window.removeEventListener('error', onWindowError);
    window.removeEventListener('unhandledrejection', onUnhandledRejection);
  };
}
