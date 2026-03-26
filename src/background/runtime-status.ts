import type { PlatformName, TabRuntimeStatus } from '@/types';

export const RUNTIME_STATUS_STALE_MS = 10 * 60 * 1000;

type RuntimeStatusUpdate = Partial<Omit<TabRuntimeStatus, 'tabId'>> & {
  lastError?: string | null;
};

function toIso(value?: string): string {
  if (!value) {
    return new Date().toISOString();
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString();
  }
  return date.toISOString();
}

function toIsoOrUndefined(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return date.toISOString();
}

export class RuntimeStatusStore {
  private readonly statusByTabId = new Map<number, TabRuntimeStatus>();

  upsert(
    tabId: number,
    base: {
      url: string;
      platform: PlatformName | null;
      injectable: boolean;
    },
    update: RuntimeStatusUpdate
  ): TabRuntimeStatus {
    const current = this.statusByTabId.get(tabId);
    const hasLastError = Object.prototype.hasOwnProperty.call(update, 'lastError');
    const next: TabRuntimeStatus = {
      tabId,
      url: update.url ?? current?.url ?? base.url,
      platform: update.platform ?? current?.platform ?? base.platform,
      injectable: update.injectable ?? current?.injectable ?? base.injectable,
      injected: update.injected ?? current?.injected ?? false,
      lastSeenAt: toIso(update.lastSeenAt || current?.lastSeenAt),
      lastExtractAt: toIsoOrUndefined(update.lastExtractAt || current?.lastExtractAt),
      lastSaveAt: toIsoOrUndefined(update.lastSaveAt || current?.lastSaveAt),
      lastError: hasLastError ? (update.lastError || undefined) : current?.lastError,
      stale: false,
    };

    this.statusByTabId.set(tabId, next);
    return next;
  }

  get(tabId: number, now = Date.now()): TabRuntimeStatus | null {
    const status = this.statusByTabId.get(tabId);
    if (!status) {
      return null;
    }

    const seenAt = new Date(status.lastSeenAt).getTime();
    const stale = Number.isFinite(seenAt) ? now - seenAt > RUNTIME_STATUS_STALE_MS : true;
    return {
      ...status,
      stale,
    };
  }

  clearTab(tabId: number): void {
    this.statusByTabId.delete(tabId);
  }

  clear(): void {
    this.statusByTabId.clear();
  }
}

export const runtimeStatusStore = new RuntimeStatusStore();
