import type {
  SaveMediaSnippetInput,
  Snippet,
  SnippetMergeInput,
  SnippetGroupDetail,
  SnippetInput,
  SnippetSelectionInput,
  SnippetSelectionUpsertResult,
  SnippetStatus,
  SyncOutboxEntry,
} from '@/types';

import { indexedDbSnippetRepository } from './indexeddb-snippet-repository';
import { localStoreSyncService } from '@/background/local-store-sync-service';

function buildOutboxEntry(
  operation: SyncOutboxEntry['operation'],
  entityId: string,
  payload: unknown
): SyncOutboxEntry {
  const now = new Date().toISOString();
  return {
    operation,
    entityId,
    payload,
    createdAt: now,
    updatedAt: now,
  };
}

export class SnippetRepository {
  async saveMediaSnippet(input: SaveMediaSnippetInput): Promise<SnippetGroupDetail | null> {
    const detail = await indexedDbSnippetRepository.saveMediaSnippet(input);
    if (detail?.group) {
      await localStoreSyncService.recordOperation(
        buildOutboxEntry('snippet_media_save', detail.group.id, input)
      );
    }
    return detail;
  }

  async upsertSnippet(snippet: SnippetInput): Promise<Snippet> {
    const saved = await indexedDbSnippetRepository.upsertSnippet(snippet);
    await localStoreSyncService.recordOperation(
      buildOutboxEntry('snippet_upsert', saved.id, snippet)
    );
    return saved;
  }

  async upsertSnippetSelection(
    selection: SnippetSelectionInput
  ): Promise<SnippetSelectionUpsertResult> {
    const saved = await indexedDbSnippetRepository.upsertSnippetSelection(selection);
    await localStoreSyncService.recordOperation(
      buildOutboxEntry('snippet_selection_upsert', saved.group.id, selection)
    );
    return saved;
  }

  async getAllSnippets(): Promise<Snippet[]> {
    return indexedDbSnippetRepository.getAllSnippets();
  }

  async getSnippetById(id: string): Promise<Snippet | null> {
    return indexedDbSnippetRepository.getSnippetById(id);
  }

  async getSnippetGroupById(id: string): Promise<SnippetGroupDetail | null> {
    return indexedDbSnippetRepository.getSnippetGroupById(id);
  }

  async getSnippetsByUrl(url: string): Promise<SnippetGroupDetail[]> {
    return indexedDbSnippetRepository.getSnippetsByUrl(url);
  }

  async deleteSnippet(id: string): Promise<void> {
    await indexedDbSnippetRepository.deleteSnippet(id);
    await localStoreSyncService.recordOperation(
      buildOutboxEntry('snippet_delete', id, { id })
    );
  }

  async mergeSnippets(input: SnippetMergeInput): Promise<SnippetGroupDetail | null> {
    const merged = await indexedDbSnippetRepository.mergeSnippets(input);
    if (merged?.group) {
      await localStoreSyncService.recordOperation(
        buildOutboxEntry('snippet_merge', merged.group.id, input)
      );
    }
    return merged;
  }

  async deleteSnippetItem(id: string): Promise<void> {
    await indexedDbSnippetRepository.deleteSnippetItem(id);
    await localStoreSyncService.recordOperation(
      buildOutboxEntry('snippet_item_delete', id, { id })
    );
  }

  async clearSnippets(): Promise<void> {
    await indexedDbSnippetRepository.clearSnippets();
    await localStoreSyncService.recordOperation(
      buildOutboxEntry('snippet_clear', 'all', {})
    );
  }

  async getSnippetStatusForTab(url: string): Promise<SnippetStatus> {
    return indexedDbSnippetRepository.getSnippetStatusForTab(url);
  }

  async enrichSnippet(id: string): Promise<SnippetGroupDetail | null> {
    return indexedDbSnippetRepository.enrichSnippet(id);
  }
}

export const snippetRepository = new SnippetRepository();
