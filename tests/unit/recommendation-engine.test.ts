import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const llmClientMock = vi.hoisted(() => ({ callLlm: vi.fn() }));
const exaClientModuleMock = vi.hoisted(() => {
  const searchMock = vi.fn();
  class ExaClientStub {
    constructor(public apiKey: string) {}
    search = searchMock;
  }
  return { ExaClientStub, searchMock };
});

vi.mock('@/background/llm-client', () => ({
  callLlm: llmClientMock.callLlm,
}));
vi.mock('@/background/exa-client', () => ({
  ExaClient: exaClientModuleMock.ExaClientStub,
  ExaClientError: class extends Error {
    code = 'UNKNOWN';
    constructor(code: string, msg: string) {
      super(msg);
      (this as any).code = code;
    }
  },
}));

const chromeStorage: Record<string, any> = {};
vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: (keys: string[], cb: (r: Record<string, any>) => void) => {
        const out: Record<string, any> = {};
        for (const k of keys) out[k] = chromeStorage[k];
        cb(out);
      },
      set: (obj: Record<string, any>, cb?: () => void) => {
        Object.assign(chromeStorage, obj);
        cb?.();
      },
    },
    sync: {
      get: (keys: string[], cb: (r: Record<string, any>) => void) => {
        cb({
          settings: {
            llmApi: { provider: 'bailian', apiKey: 'llm-key', model: 'qwen-plus' },
            recommend: {
              enabled: true,
              exaApiKey: 'exa-key',
              dataWindowDays: 14,
              cacheTtlHours: 24,
            },
          },
        });
      },
    },
  },
});

import {
  extractTopicsFromSummary,
  runRecommendationSession,
  sweepInterruptedSessions,
  loadSessions,
} from '@/background/recommendation-engine';

describe('extractTopicsFromSummary', () => {
  beforeEach(() => {
    llmClientMock.callLlm.mockReset();
    exaClientModuleMock.searchMock.mockReset();
    for (const k of Object.keys(chromeStorage)) delete chromeStorage[k];
  });

  it('parses valid JSON response into topics', async () => {
    llmClientMock.callLlm.mockResolvedValue(JSON.stringify({
      topics: [
        {
          topic: 'HNSW 算法',
          userEngagement: '关注查询延迟与召回',
          sourceIntent: 'foundational_paper',
          searchQueries: ['HNSW original paper Malkov'],
          exaType: 'research paper',
        },
      ],
    }));

    const topics = await extractTopicsFromSummary('dummy summary text', {
      provider: 'bailian', apiKey: 'llm-key', model: 'qwen-plus',
    });

    expect(topics).toHaveLength(1);
    expect(topics[0].topic).toBe('HNSW 算法');
    expect(topics[0].topicKey).toMatch(/^topic_/);
    expect(topics[0].searchQueries[0]).toBe('HNSW original paper Malkov');
  });

  it('retries once on invalid JSON and throws if retry also fails', async () => {
    llmClientMock.callLlm
      .mockResolvedValueOnce('not json at all')
      .mockResolvedValueOnce('still not json');

    await expect(
      extractTopicsFromSummary('x', { provider: 'openai', apiKey: 'k' })
    ).rejects.toThrow(/JSON/);

    expect(llmClientMock.callLlm).toHaveBeenCalledTimes(2);
  });
});

describe('runRecommendationSession (M1 vertical slice)', () => {
  beforeEach(() => {
    llmClientMock.callLlm.mockReset();
    exaClientModuleMock.searchMock.mockReset();
    for (const k of Object.keys(chromeStorage)) delete chromeStorage[k];
  });

  it('runs extract → search → done and writes one card', async () => {
    llmClientMock.callLlm.mockResolvedValue(JSON.stringify({
      topics: [{
        topic: 'Transformers',
        userEngagement: '研究注意力机制',
        sourceIntent: 'foundational_paper',
        searchQueries: ['Attention is all you need paper'],
        exaType: 'research paper',
      }],
    }));
    exaClientModuleMock.searchMock.mockResolvedValue({
      results: [{
        title: 'Attention Is All You Need',
        url: 'https://arxiv.org/abs/1706.03762',
        publishedDate: '2017-06-12',
        text: 'The dominant sequence transduction models ...',
        score: 0.95,
      }],
    });

    const sessionId = 'rec_test_1';
    await runRecommendationSession({
      sessionId,
      triggerSource: 'from_summary',
      summaryTaskId: 'task_1',
      summaryText: 'This week I studied HNSW and Transformer internals.',
    });

    const stored = await loadSessions();
    const session = stored.find((s) => s.id === sessionId);
    expect(session).toBeDefined();
    expect(session!.status).toBe('done');
    expect(session!.cards).toHaveLength(1);
    expect(session!.cards[0].url).toBe('https://arxiv.org/abs/1706.03762');
    expect(session!.cards[0].sourceKind).toBe('paper');
    expect(session!.cards[0].saved).toBe(false);
    expect(session!.cards[0].opened).toBe(false);
  });

  it('sets status=error when Exa fails', async () => {
    llmClientMock.callLlm.mockResolvedValue(JSON.stringify({
      topics: [{
        topic: 'x', userEngagement: 'y', sourceIntent: 'foundational_paper',
        searchQueries: ['q'], exaType: 'research paper',
      }],
    }));
    const ExaClientError = (await import('@/background/exa-client')).ExaClientError;
    exaClientModuleMock.searchMock.mockRejectedValue(
      new ExaClientError('RATE_LIMITED', 'rate limited')
    );

    await runRecommendationSession({
      sessionId: 'rec_err_1',
      triggerSource: 'from_summary',
      summaryTaskId: 'task_1',
      summaryText: 'x',
    });

    const sessions = await loadSessions();
    const session = sessions.find((s) => s.id === 'rec_err_1')!;
    expect(session.status).toBe('error');
    expect(session.error).toMatch(/rate limited/i);
  });
});

describe('sweepInterruptedSessions', () => {
  beforeEach(() => {
    for (const k of Object.keys(chromeStorage)) delete chromeStorage[k];
  });

  it('marks extracting/searching sessions older than 5 minutes as error', async () => {
    const oldIso = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const recentIso = new Date().toISOString();
    chromeStorage.recommendationSessions = [
      { id: 'a', status: 'extracting', createdAt: oldIso, cards: [], extractedTopics: [], strategies: ['source_upstream'], triggerSource: 'from_summary', dataWindowDays: 14 },
      { id: 'b', status: 'searching', createdAt: recentIso, cards: [], extractedTopics: [], strategies: ['source_upstream'], triggerSource: 'from_summary', dataWindowDays: 14 },
      { id: 'c', status: 'done', createdAt: oldIso, cards: [], extractedTopics: [], strategies: ['source_upstream'], triggerSource: 'from_summary', dataWindowDays: 14 },
    ];

    await sweepInterruptedSessions();

    const all = await loadSessions();
    expect(all.find((s) => s.id === 'a')!.status).toBe('error');
    expect(all.find((s) => s.id === 'a')!.error).toMatch(/中断/);
    expect(all.find((s) => s.id === 'b')!.status).toBe('searching');
    expect(all.find((s) => s.id === 'c')!.status).toBe('done');
  });
});
