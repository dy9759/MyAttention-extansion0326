import { afterEach, describe, expect, it, vi } from 'vitest';

const indexedDbSnippetMocks = vi.hoisted(() => ({
  upsertSnippetSelection: vi.fn(),
  getSnippetStatusForTab: vi.fn(),
  getSnippetsByUrl: vi.fn(),
}));

const syncServiceMocks = vi.hoisted(() => ({
  recordOperation: vi.fn(),
}));

vi.mock('@/background/repository/indexeddb-snippet-repository', () => ({
  indexedDbSnippetRepository: indexedDbSnippetMocks,
}));

vi.mock('@/background/local-store-sync-service', () => ({
  localStoreSyncService: syncServiceMocks,
}));

import { snippetRepository } from '@/background/repository/snippet-repository';

describe('snippet repository failover', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Object.values(indexedDbSnippetMocks).forEach((mockFn) => mockFn.mockReset());
    Object.values(syncServiceMocks).forEach((mockFn) => mockFn.mockReset());
  });

  it('stores selection snippets in IndexedDB and enqueues sync replay', async () => {
    indexedDbSnippetMocks.upsertSnippetSelection.mockResolvedValue({
      group: {
        id: 'snippet_1',
        groupKey: 'group:1',
        dedupeKey: 'group:1',
        type: 'highlight',
        captureMethod: 'auto_selection',
        url: 'https://example.com',
        title: 'Example',
        domain: 'example.com',
        sourceKind: 'web_page',
        headingPath: [],
        selectionCount: 1,
        rawContextText: 'context',
        rawContextMarkdown: 'context',
        structuredContextMarkdown: 'context',
        summaryText: 'selected text',
        enrichmentStatus: 'pending',
        createdAt: '2026-03-16T10:00:00.000Z',
        updatedAt: '2026-03-16T10:00:00.000Z',
        selectionText: 'selected text',
        contextText: 'context',
        selectors: [],
        dwellMs: 0,
      },
      item: {
        id: 'snippet_item_1',
        snippetId: 'snippet_1',
        selectionText: 'selected text',
        selectors: [],
        quoteHash: 'quote',
        anchorStatus: 'resolved',
        orderIndex: 0,
        createdAt: '2026-03-16T10:00:00.000Z',
        updatedAt: '2026-03-16T10:00:00.000Z',
      },
    });

    const result = await snippetRepository.upsertSnippetSelection({
      groupKey: 'group:1',
      captureMethod: 'auto_selection',
      selectionText: 'selected text',
      selectors: [],
      url: 'https://example.com',
      title: 'Example',
      sourceKind: 'web_page',
      semanticBlockKey: 'semantic',
      headingPath: [],
      rawContextText: 'context',
      rawContextMarkdown: 'context',
      quoteHash: 'quote',
    });

    expect(result.group.id).toBe('snippet_1');
    expect(indexedDbSnippetMocks.upsertSnippetSelection).toHaveBeenCalledTimes(1);
    expect(syncServiceMocks.recordOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'snippet_selection_upsert',
        entityId: 'snippet_1',
      })
    );
  });

  it('reads snippet status from the mirror repository', async () => {
    indexedDbSnippetMocks.getSnippetStatusForTab.mockResolvedValue({
      url: 'https://example.com',
      hasSnippet: true,
      snippetCount: 2,
      latestSnippetAt: '2026-03-16T10:00:00.000Z',
    });

    const status = await snippetRepository.getSnippetStatusForTab('https://example.com');

    expect(status.hasSnippet).toBe(true);
    expect(indexedDbSnippetMocks.getSnippetStatusForTab).toHaveBeenCalledWith(
      'https://example.com'
    );
  });
});
