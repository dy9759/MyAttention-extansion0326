import { describe, expect, it } from 'vitest';

import type { Snippet } from '@/types';
import { filterSnippets } from '@/popup/snippet-filter';

const snippets: Snippet[] = [
  {
    id: '1',
    dedupeKey: 'highlight:web',
    type: 'highlight',
    captureMethod: 'auto_selection',
    selectionText: 'selected idea',
    contextText: 'web page context',
    selectors: [],
    dwellMs: 0,
    url: 'https://example.com/post',
    title: 'Example Post',
    domain: 'example.com',
    sourceKind: 'web_page',
    createdAt: '2026-03-02T10:00:00.000Z',
    updatedAt: '2026-03-02T10:00:00.000Z',
  },
  {
    id: '2',
    dedupeKey: 'dwell:ai',
    type: 'dwell',
    captureMethod: 'auto_dwell',
    selectionText: '',
    contextText: 'assistant answer context',
    selectors: [],
    dwellMs: 4000,
    url: 'https://chatgpt.com/c/abc',
    title: 'ChatGPT',
    domain: 'chatgpt.com',
    sourceKind: 'ai_conversation',
    platform: 'chatgpt',
    conversationId: 'c_abc',
    messageIndex: 1,
    createdAt: '2026-02-20T10:00:00.000Z',
    updatedAt: '2026-02-20T10:00:00.000Z',
  },
  {
    id: '3',
    dedupeKey: 'page:web',
    type: 'page_save',
    captureMethod: 'context_menu_page',
    selectionText: '',
    contextText: 'saved article summary',
    selectors: [],
    dwellMs: 0,
    url: 'https://another.example/article',
    title: 'Another Article',
    domain: 'another.example',
    sourceKind: 'web_page',
    createdAt: '2026-01-01T10:00:00.000Z',
    updatedAt: '2026-01-01T10:00:00.000Z',
  },
  {
    id: '4',
    dedupeKey: 'media:web',
    type: 'media_save',
    captureMethod: 'hover_media_save',
    selectionText: 'Product screenshot',
    contextText: 'Landing page hero image',
    selectors: [],
    dwellMs: 0,
    url: 'https://example.com/gallery',
    title: 'Gallery',
    domain: 'example.com',
    sourceKind: 'web_page',
    summaryText: 'Product screenshot',
    media: {
      kind: 'image',
      sourceUrl: 'https://cdn.example.com/product.png',
      previewUrl: 'https://cdn.example.com/product-thumb.png',
      mimeType: 'image/png',
      altText: 'product screenshot',
      downloadStatus: 'ready',
      savedFrom: 'url_pull',
      localFileUrl: 'http://127.0.0.1:1995/local-store/snippets/4/media/file',
    },
    createdAt: '2026-03-03T10:00:00.000Z',
    updatedAt: '2026-03-03T10:00:00.000Z',
  },
];

describe('filterSnippets', () => {
  it('filters by query, type, and source together', () => {
    const filtered = filterSnippets(snippets, {
      query: 'assistant',
      type: 'dwell',
      source: 'ai_conversation',
      dateRange: 'all',
    });

    expect(filtered.map((snippet) => snippet.id)).toEqual(['2']);
  });

  it('filters by date shortcuts', () => {
    const filtered = filterSnippets(
      snippets,
      {
        query: '',
        type: 'all',
        source: 'all',
        dateRange: 'today',
      },
      new Date('2026-03-02T12:00:00.000Z').getTime()
    );

    expect(filtered.map((snippet) => snippet.id)).toEqual(['1', '4']);
  });

  it('matches media snippets by type and media fields', () => {
    const filtered = filterSnippets(snippets, {
      query: 'product screenshot',
      type: 'media_save',
      source: 'web_page',
      dateRange: 'all',
    });

    expect(filtered.map((snippet) => snippet.id)).toEqual(['4']);
  });
});
