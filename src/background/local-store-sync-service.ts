import type {
  Conversation,
  LocalStoreFallbackMode,
  LocalStoreStatus,
  SaveMediaSnippetInput,
  Snippet,
  SnippetGroupDetail,
  SnippetInput,
  SnippetMergeInput,
  SnippetSelectionInput,
  SyncOutboxEntry,
} from '@/types';
import { Logger } from '@/core/errors';
import { database } from './database';
import { localStoreClient } from './local-store-client';
import { updateLocalStoreMeta, getLocalStoreMeta } from './local-store-meta';

export const LOCAL_STORE_SYNC_ALARM = 'sayso-local-store-sync';
const LOCAL_STORE_SYNC_PERIOD_MINUTES = 1;

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export class LocalStoreSyncService {
  private syncPromise: Promise<void> | null = null;

  private hydrationPromise: Promise<boolean> | null = null;

  initialize(): void {
    if (typeof chrome === 'undefined' || !chrome.alarms) {
      return;
    }

    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name !== LOCAL_STORE_SYNC_ALARM) {
        return;
      }
      void this.syncPending('alarm');
    });
  }

  async recordOperation(entry: SyncOutboxEntry): Promise<number> {
    const id = await database.addOutboxEntry({
      ...entry,
      createdAt: entry.createdAt || new Date().toISOString(),
      updatedAt: entry.updatedAt || new Date().toISOString(),
    });
    await this.ensureAlarm();
    void this.syncPending('recordOperation');
    return id;
  }

  async getStatus(): Promise<Omit<LocalStoreStatus, 'enabled' | 'migrationState'>> {
    const meta = await getLocalStoreMeta();
    const pendingOpsCount = await database.countOutboxEntries();
    let connected = false;
    let version: string | undefined;
    let path: string | undefined = meta.local_store_path;
    let lastError: string | undefined = meta.local_store_last_error;

    try {
      const health = await localStoreClient.health();
      connected = health.status === 'ok' && health.connected !== false;
      version = health.version;
      path = health.dbPath || path;

      await updateLocalStoreMeta({
        local_store_path: path,
        local_store_last_error: connected ? '' : lastError,
      });
      if (connected) {
        lastError = undefined;
      }
    } catch (error) {
      connected = false;
      lastError = toErrorMessage(error);
      await updateLocalStoreMeta({
        local_store_last_error: lastError,
      });
    }

    const fallbackMode: LocalStoreFallbackMode = !connected
      ? 'offline'
      : pendingOpsCount > 0
      ? 'syncing'
      : 'online';

    return {
      connected,
      fallbackMode,
      pendingOpsCount,
      version,
      path,
      lastError,
      lastSyncAt: meta.local_store_last_sync_at,
      lastMigratedAt: meta.local_store_last_migrated_at,
    };
  }

  async hydrateMirrorFromLocalStore(force = false): Promise<boolean> {
    if (this.hydrationPromise) {
      return this.hydrationPromise;
    }

    this.hydrationPromise = this.hydrateMirrorFromLocalStoreInternal(force).finally(() => {
      this.hydrationPromise = null;
    });
    return this.hydrationPromise;
  }

  async syncPending(reason = 'manual'): Promise<void> {
    if (this.syncPromise) {
      return this.syncPromise;
    }

    this.syncPromise = this.syncPendingInternal(reason).finally(() => {
      this.syncPromise = null;
    });
    return this.syncPromise;
  }

  private async hydrateMirrorFromLocalStoreInternal(force: boolean): Promise<boolean> {
    const meta = await getLocalStoreMeta();
    const pendingCount = await database.countOutboxEntries();
    if (!force && (meta.local_store_last_hydrated_at || pendingCount > 0)) {
      return false;
    }

    try {
      const health = await localStoreClient.health();
      if (health.status !== 'ok' || health.connected === false) {
        return false;
      }

      const conversations = await localStoreClient.getAllConversations();
      const snippetGroups = await localStoreClient.getAllSnippets();
      const snippetDetails: SnippetGroupDetail[] = [];
      for (const group of snippetGroups) {
        const detail = await localStoreClient.getSnippetGroupById(group.id);
        if (detail?.group) {
          snippetDetails.push(detail);
        }
      }

      await database.replaceAllConversations(conversations);
      await database.replaceAllSnippets(snippetDetails);
      await updateLocalStoreMeta({
        local_store_last_hydrated_at: new Date().toISOString(),
        local_store_path: health.dbPath || meta.local_store_path,
        local_store_last_error: '',
      });
      return true;
    } catch (error) {
      const message = toErrorMessage(error);
      Logger.warn('[LocalStoreSyncService] 镜像 hydration 失败', message);
      await updateLocalStoreMeta({
        local_store_last_error: message,
      });
      await this.ensureAlarm();
      return false;
    }
  }

  private async syncPendingInternal(reason: string): Promise<void> {
    const entries = await database.getOutboxEntries();
    if (entries.length === 0) {
      await this.clearAlarm();
      return;
    }

    let health;
    try {
      health = await localStoreClient.health();
    } catch (error) {
      await updateLocalStoreMeta({
        local_store_last_error: toErrorMessage(error),
      });
      await this.ensureAlarm();
      return;
    }

    if (health.status !== 'ok' || health.connected === false) {
      await updateLocalStoreMeta({
        local_store_last_error: 'Local store offline',
        local_store_path: health.dbPath,
      });
      await this.ensureAlarm();
      return;
    }

    await updateLocalStoreMeta({
      local_store_last_error: '',
      local_store_path: health.dbPath,
    });

    for (const entry of entries) {
      try {
        await this.replayEntry(entry);
        await database.deleteOutboxEntry(entry.id);
        await updateLocalStoreMeta({
          local_store_last_sync_at: new Date().toISOString(),
          local_store_last_error: '',
        });
      } catch (error) {
        const message = toErrorMessage(error);
        Logger.warn('[LocalStoreSyncService] 同步失败，保留 outbox', {
          reason,
          operation: entry.operation,
          entityId: entry.entityId,
          error: message,
        });
        await updateLocalStoreMeta({
          local_store_last_error: message,
        });
        await this.ensureAlarm();
        return;
      }
    }

    await this.clearAlarm();
  }

  private async replayEntry(entry: SyncOutboxEntry & { id: number }): Promise<void> {
    switch (entry.operation) {
      case 'conversation_upsert': {
        const conversation = entry.payload as Conversation;
        const existing = await localStoreClient.getConversationById(conversation.conversationId);
        if (existing) {
          await localStoreClient.updateConversation(conversation.conversationId, conversation);
        } else {
          await localStoreClient.createConversation(conversation);
        }
        break;
      }
      case 'conversation_delete':
        await localStoreClient.deleteConversation(entry.entityId);
        break;
      case 'conversation_clear':
        await localStoreClient.clearConversations();
        break;
      case 'snippet_upsert': {
        const snippet = await localStoreClient.upsertSnippet(entry.payload as SnippetInput);
        const existingDetail = await database.getSnippetGroupById(entry.entityId);
        await database.replaceSnippetGroupDetail(
          {
            group: {
              ...snippet,
              selectionText: existingDetail?.group.selectionText || snippet.selectionText,
              selectors: existingDetail?.group.selectors || snippet.selectors,
            },
            items:
              existingDetail?.items.map((item) => ({
                ...item,
                snippetId: snippet.id,
              })) || [],
          },
          {
            previousGroupId: entry.entityId,
            dedupeKey: (entry.payload as SnippetInput).dedupeKey,
          }
        );
        break;
      }
      case 'snippet_selection_upsert': {
        const result = await localStoreClient.upsertSnippetSelection(entry.payload as SnippetSelectionInput);
        const existingDetail = await database.getSnippetGroupById(entry.entityId);
        const nextItems = [
          ...(existingDetail?.items || []).filter((item) => item.quoteHash !== result.item.quoteHash),
          result.item,
        ].map((item) => ({
          ...item,
          snippetId: result.group.id,
        })).sort((a, b) => {
          if ((a.orderIndex || 0) !== (b.orderIndex || 0)) {
            return (a.orderIndex || 0) - (b.orderIndex || 0);
          }
          return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
        });
        await database.replaceSnippetGroupDetail({
          group: result.group,
          items: nextItems,
        }, {
          previousGroupId: entry.entityId,
          groupKey: (entry.payload as SnippetSelectionInput).groupKey,
        });
        break;
      }
      case 'snippet_media_save': {
        const detail = await localStoreClient.saveMediaSnippet(entry.payload as SaveMediaSnippetInput);
        if (detail?.group) {
          await database.replaceSnippetGroupDetail(detail, {
            previousGroupId: entry.entityId,
            dedupeKey: (entry.payload as SaveMediaSnippetInput).snippet.dedupeKey,
          });
        }
        break;
      }
      case 'snippet_delete':
        await localStoreClient.deleteSnippet(entry.entityId);
        break;
      case 'snippet_item_delete':
        await localStoreClient.deleteSnippetItem(entry.entityId);
        break;
      case 'snippet_clear':
        await localStoreClient.clearSnippets();
        break;
      case 'snippet_merge': {
        const detail = await localStoreClient.mergeSnippets(entry.payload as SnippetMergeInput);
        if (detail?.group) {
          await database.replaceSnippetGroupDetail(detail, {
            previousGroupId: detail.group.id,
            groupKey: detail.group.groupKey,
          });
        }
        break;
      }
      default:
        break;
    }
  }

  private async ensureAlarm(): Promise<void> {
    if (typeof chrome === 'undefined' || !chrome.alarms) {
      return;
    }

    await chrome.alarms.create(LOCAL_STORE_SYNC_ALARM, {
      periodInMinutes: LOCAL_STORE_SYNC_PERIOD_MINUTES,
    });
  }

  private async clearAlarm(): Promise<void> {
    if (typeof chrome === 'undefined' || !chrome.alarms) {
      return;
    }

    await chrome.alarms.clear(LOCAL_STORE_SYNC_ALARM);
  }
}

export const localStoreSyncService = new LocalStoreSyncService();
