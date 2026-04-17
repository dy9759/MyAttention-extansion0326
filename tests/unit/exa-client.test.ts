import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExaClient, ExaClientError } from '@/background/exa-client';

describe('ExaClient', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends search request with correct params', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          results: [
            {
              title: 'Attention Is All You Need',
              url: 'https://arxiv.org/abs/1706.03762',
              publishedDate: '2017-06-12',
              text: 'The dominant sequence transduction models...',
              score: 0.95,
            },
          ],
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = new ExaClient('test-key');
    const result = await client.search({
      query: 'Transformer original paper',
      type: 'research paper',
      numResults: 3,
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0].url).toBe('https://arxiv.org/abs/1706.03762');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.exa.ai/search',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-api-key': 'test-key',
          'Content-Type': 'application/json',
        }),
      })
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.query).toBe('Transformer original paper');
    expect(body.type).toBe('research paper');
    expect(body.numResults).toBe(3);
    expect(body.useAutoprompt).toBe(false);
  });

  it('maps 401 to ExaClientError with code INVALID_KEY', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response('{"error":"Invalid key"}', { status: 401 })
    ));
    const client = new ExaClient('bad-key');
    await expect(client.search({ query: 'x', numResults: 1 }))
      .rejects.toMatchObject({ name: 'ExaClientError', code: 'INVALID_KEY', status: 401 });
  });

  it('maps 429 to ExaClientError with code RATE_LIMITED', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response('rate limited', { status: 429 })
    ));
    const client = new ExaClient('k');
    await expect(client.search({ query: 'x', numResults: 1 }))
      .rejects.toMatchObject({ name: 'ExaClientError', code: 'RATE_LIMITED' });
  });

  it('maps network timeout to code TIMEOUT', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      const err: any = new Error('aborted');
      err.name = 'AbortError';
      throw err;
    }));
    const client = new ExaClient('k');
    await expect(client.search({ query: 'x', numResults: 1 }))
      .rejects.toMatchObject({ name: 'ExaClientError', code: 'TIMEOUT' });
  });
});
