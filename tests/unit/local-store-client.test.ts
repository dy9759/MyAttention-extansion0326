import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SnippetInput } from '@/types';
import { LocalStoreClient, LocalStoreClientError } from '@/background/local-store-client';

describe('LocalStoreClient', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls /health successfully', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          status: 'ok',
          version: '1.0.0',
          dbPath: '/tmp/sayso.db',
          connected: true,
        }),
        { status: 200 }
      );
    });

    vi.stubGlobal('fetch', fetchMock);

    const client = new LocalStoreClient('http://127.0.0.1:1995/local-store');
    const health = await client.health();

    expect(health.status).toBe('ok');
    expect(health.dbPath).toBe('/tmp/sayso.db');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:1995/local-store/health',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('maps HTTP error payload into LocalStoreClientError', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          status: 'error',
          code: 'LOCAL_STORE_OFFLINE',
          message: 'connection refused',
        }),
        { status: 503 }
      );
    });

    vi.stubGlobal('fetch', fetchMock);

    const client = new LocalStoreClient('http://127.0.0.1:1995/local-store');

    await expect(client.getAllConversations()).rejects.toMatchObject({
      name: 'LocalStoreClientError',
      code: 'LOCAL_STORE_OFFLINE',
      status: 503,
    } as Partial<LocalStoreClientError>);
  });

  it('creates conversation through /conversations endpoint', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || '{}'));
      expect(body.conversation.conversationId).toBe('conv_1');

      return new Response(
        JSON.stringify({
          conversationId: 'conv_1',
        }),
        { status: 200 }
      );
    });

    vi.stubGlobal('fetch', fetchMock);

    const client = new LocalStoreClient('http://127.0.0.1:1995/local-store');
    const conversationId = await client.createConversation({
      conversationId: 'conv_1',
      link: 'https://chatgpt.com/c/1',
      platform: 'chatgpt',
      title: 'title',
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messageCount: 0,
    });

    expect(conversationId).toBe('conv_1');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:1995/local-store/conversations',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('upserts snippets through /snippets/upsert', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || '{}')) as { snippet: SnippetInput };
      expect(body.snippet.type).toBe('highlight');

      return new Response(
        JSON.stringify({
          snippet: {
            id: 'snippet_1',
            ...body.snippet,
            domain: 'example.com',
            createdAt: '2026-03-02T10:00:00.000Z',
            updatedAt: '2026-03-02T10:00:00.000Z',
          },
        }),
        { status: 200 }
      );
    });

    vi.stubGlobal('fetch', fetchMock);

    const client = new LocalStoreClient('http://127.0.0.1:1995/local-store');
    const snippet = await client.upsertSnippet({
      dedupeKey: 'highlight:https://example.com:selected',
      type: 'highlight',
      captureMethod: 'auto_selection',
      selectionText: 'selected text',
      contextText: 'context text',
      selectors: [],
      url: 'https://example.com',
      title: 'Example',
      sourceKind: 'web_page',
    });

    expect(snippet.id).toBe('snippet_1');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:1995/local-store/snippets/upsert',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('fetches snippet status for a tab url', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          url: 'https://example.com',
          hasSnippet: true,
          snippetCount: 3,
          latestSnippetAt: '2026-03-02T10:00:00.000Z',
        }),
        { status: 200 }
      );
    });

    vi.stubGlobal('fetch', fetchMock);

    const client = new LocalStoreClient('http://127.0.0.1:1995/local-store');
    const status = await client.getSnippetStatusForTab('https://example.com');

    expect(status.hasSnippet).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:1995/local-store/snippets/status?url=https%3A%2F%2Fexample.com',
      expect.objectContaining({ method: 'GET' })
    );
  });
});
