# 推荐注意力页面 M1 (垂直切片) 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 端到端跑通最简版推荐功能 —— 从总结详情页点击"基于此报告推荐源头"按钮，走通 LLM 提取 → Exa 搜索 → UI 展示 → 保存为 Snippet 的完整链路。

**Architecture:** 新增一个 Exa HTTP 客户端 + 一个编排层（recommendation-engine）+ 一个 popup 控制器，复用现有的 llm-client、settings、message dispatcher、snippet 保存管道。M1 硬编码为单 topic 单 query，不做 standalone entry / pills / cache / 不感兴趣按钮 —— 这些留给 M2-M6。

**Tech Stack:** TypeScript, Vite, Chrome Manifest V3 service worker, Vitest, Vanilla JS popup, chrome.storage.local, IndexedDB (existing).

**Spec:** [docs/superpowers/specs/2026-04-17-recommendation-page-design.md](../specs/2026-04-17-recommendation-page-design.md)

---

## 文件蓝图（M1 范围）

**新增**：
- `src/types/recommendation.ts` — 类型定义
- `src/background/exa-client.ts` — Exa HTTP 客户端
- `src/background/recommendation-engine.ts` — 编排层
- `src/popup/recommendation-controller.ts` — Popup 推荐 tab 控制器
- `tests/unit/exa-client.test.ts`
- `tests/unit/recommendation-engine.test.ts`

**修改**：
- `src/types/index.ts` — 新增 3 个 `KnownChromeMessageType`，扩展 `AppSettings.recommend`，`DEFAULT_SETTINGS`
- `public/manifest.json` — host_permissions 新增 `https://api.exa.ai/*`
- `src/background/index.ts` — 注册 3 个 message handler，启动时 `sweepInterrupted()`
- `src/popup/index.ts` — tab 切换时初始化 recommendation-controller，summary 详情页按钮
- `src/popup/settings.ts` — 推荐配置读写
- `public/html/popup.html` — 推荐 tab 内部结构微调 + Settings 区块 + summary 详情页按钮

---

## Task 1: 新增推荐功能的类型定义

**Files:**
- Create: `src/types/recommendation.ts`
- Modify: `src/types/index.ts` (add export)

- [ ] **Step 1: Create the types file**

Write `src/types/recommendation.ts`:

```ts
/**
 * 推荐注意力功能的类型定义
 */

export type RecommendationStrategy =
  | 'source_upstream'
  | 'adjacent_expansion'
  | 'orthogonal_perspective'
  | 'contrarian';

export type SourceIntent =
  | 'foundational_paper'
  | 'official_doc'
  | 'original_author'
  | 'reference_impl'
  | 'primary_reference';

export type SourceKind =
  | 'paper'
  | 'official_doc'
  | 'original_author'
  | 'repo'
  | 'other';

export type RecommendationStatus =
  | 'pending'
  | 'extracting'
  | 'searching'
  | 'done'
  | 'error';

export interface ExtractedTopic {
  topicKey: string;
  topic: string;
  userEngagement: string;
  sourceIntent: SourceIntent;
  searchQueries: string[];
  exaType?: 'research paper' | 'github' | 'company';
}

export interface RecommendationCard {
  id: string;
  topicKey: string;
  sourceKind: SourceKind;
  title: string;
  url: string;
  snippet: string;
  rationale: string;
  publishedAt?: string;
  domain: string;
  opened: boolean;
  saved: boolean;
  dismissed: boolean;
  savedSnippetId?: string;
}

export interface RecommendationSession {
  id: string;
  triggerSource: 'standalone' | 'from_summary';
  summaryTaskId?: string;
  strategies: RecommendationStrategy[];
  status: RecommendationStatus;
  progress?: string;
  error?: string;
  extractedTopics: ExtractedTopic[];
  cards: RecommendationCard[];
  createdAt: string;
  completedAt?: string;
  dataWindowDays: number;
}

export interface CreateRecommendationSessionParams {
  triggerSource: 'standalone' | 'from_summary';
  summaryTaskId?: string;
}

export interface MarkRecommendationInteractedParams {
  sessionId: string;
  cardId: string;
  action: 'opened' | 'saved' | 'dismissed';
}
```

- [ ] **Step 2: Re-export from types index**

In `src/types/index.ts` find the bottom `export *` block and append:

```ts
export * from './recommendation';
```

- [ ] **Step 3: Add 3 new message types to `KnownChromeMessageType`**

In `src/types/index.ts`, find the `KnownChromeMessageType` union (around line 17) and before the `// Summary tasks` section, append:

```ts
  // Recommendation
  | 'createRecommendationSession'
  | 'getRecommendationSession'
  | 'markRecommendationInteracted'
```

- [ ] **Step 4: Extend AppSettings with recommend config**

In `src/types/index.ts`, find the `AppSettings` interface and add after `llmApi`:

```ts
  /** 推荐功能配置 */
  recommend?: {
    enabled: boolean;
    exaApiKey: string;
    dataWindowDays: number;
    cacheTtlHours: number;
  };
```

- [ ] **Step 5: Extend DEFAULT_SETTINGS**

In `src/types/index.ts`, find `DEFAULT_SETTINGS` and add after `webCapture`:

```ts
  recommend: {
    enabled: false,
    exaApiKey: '',
    dataWindowDays: 14,
    cacheTtlHours: 24,
  },
```

- [ ] **Step 6: Type-check and commit**

Run: `npm run type-check`
Expected: No errors.

```bash
git add src/types/recommendation.ts src/types/index.ts
git commit -m "feat(types): add recommendation types and settings"
```

---

## Task 2: Extend Chrome extension manifest

**Files:**
- Modify: `public/manifest.json:22`

- [ ] **Step 1: Add api.exa.ai host permission**

In `public/manifest.json`, find `host_permissions` and change it from:

```json
"host_permissions": ["http://127.0.0.1:1995/*", "http://127.0.0.1:1996/*"],
```

to:

```json
"host_permissions": [
  "http://127.0.0.1:1995/*",
  "http://127.0.0.1:1996/*",
  "https://api.exa.ai/*"
],
```

- [ ] **Step 2: Commit**

```bash
git add public/manifest.json
git commit -m "feat(manifest): add api.exa.ai to host_permissions"
```

---

## Task 3: Build Exa HTTP client (TDD)

**Files:**
- Create: `src/background/exa-client.ts`
- Test: `tests/unit/exa-client.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/exa-client.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/exa-client.test.ts`
Expected: FAIL — `ExaClient` module does not exist.

- [ ] **Step 3: Implement ExaClient**

Create `src/background/exa-client.ts`:

```ts
/**
 * Exa API HTTP 客户端
 * 文档：https://docs.exa.ai/reference/search
 */

import { Logger } from '@/core/errors';

export type ExaErrorCode =
  | 'INVALID_KEY'
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'BAD_REQUEST'
  | 'SERVER_ERROR'
  | 'UNKNOWN';

export class ExaClientError extends Error {
  public readonly code: ExaErrorCode;
  public readonly status?: number;
  public readonly detail?: string;

  constructor(code: ExaErrorCode, message: string, options?: { status?: number; detail?: string }) {
    super(message);
    this.name = 'ExaClientError';
    this.code = code;
    this.status = options?.status;
    this.detail = options?.detail;
  }
}

export interface ExaSearchRequest {
  query: string;
  type?: 'research paper' | 'github' | 'company';
  numResults: number;
  useAutoprompt?: boolean;
  includeText?: boolean;
  timeoutMs?: number;
}

export interface ExaSearchResult {
  title: string;
  url: string;
  publishedDate?: string;
  text?: string;
  score?: number;
  author?: string;
}

export interface ExaSearchResponse {
  results: ExaSearchResult[];
}

const EXA_BASE = 'https://api.exa.ai';
const DEFAULT_TIMEOUT_MS = 10_000;

export class ExaClient {
  constructor(private readonly apiKey: string) {}

  async search(request: ExaSearchRequest): Promise<ExaSearchResponse> {
    if (!this.apiKey) {
      throw new ExaClientError('INVALID_KEY', 'Exa API key is not configured');
    }

    const body: Record<string, unknown> = {
      query: request.query,
      numResults: request.numResults,
      useAutoprompt: request.useAutoprompt ?? false,
    };
    if (request.type) body.type = request.type;
    if (request.includeText !== false) {
      body.contents = { text: { maxCharacters: 500 } };
    }

    const controller = new AbortController();
    const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(`${EXA_BASE}/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      const err = error as Error;
      if (err.name === 'AbortError') {
        throw new ExaClientError('TIMEOUT', `Exa request timed out after ${timeoutMs}ms`);
      }
      throw new ExaClientError('NETWORK_ERROR', err.message || 'network error');
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      const code = this.mapStatusToCode(response.status);
      throw new ExaClientError(code, `Exa ${response.status}: ${detail.slice(0, 200)}`, {
        status: response.status,
        detail,
      });
    }

    const data = (await response.json()) as ExaSearchResponse;
    Logger.debug(`[Exa] ${request.query} → ${data.results?.length ?? 0} results`);
    return { results: data.results ?? [] };
  }

  private mapStatusToCode(status: number): ExaErrorCode {
    if (status === 401 || status === 403) return 'INVALID_KEY';
    if (status === 429) return 'RATE_LIMITED';
    if (status === 400) return 'BAD_REQUEST';
    if (status >= 500) return 'SERVER_ERROR';
    return 'UNKNOWN';
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/exa-client.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/background/exa-client.ts tests/unit/exa-client.test.ts
git commit -m "feat(background): add Exa API client with error mapping"
```

---

## Task 4: Build the recommendation engine (TDD, minimal M1 version)

**Files:**
- Create: `src/background/recommendation-engine.ts`
- Test: `tests/unit/recommendation-engine.test.ts`

M1 version does: read 1 summary by taskId → LLM extracts topics → take first topic → use first query → Exa search → write session. No concurrency, no cache TTL, no standalone entry.

- [ ] **Step 1: Write the failing test for extractTopics**

Create `tests/unit/recommendation-engine.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// We'll import module-level functions after mocking the deps.
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/recommendation-engine.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement recommendation-engine.ts**

Create `src/background/recommendation-engine.ts`:

```ts
/**
 * 推荐注意力 编排引擎（M1 垂直切片版本）
 *
 * M1 范围：
 * - 仅支持 from_summary 触发
 * - 单 topic 单 query
 * - 无并发，无 cache TTL 检查
 * - 状态写入 chrome.storage.local.recommendationSessions
 */

import { Logger } from '@/core/errors';
import { callLlm, type LlmMessage } from './llm-client';
import { ExaClient, ExaClientError, type ExaSearchResult } from './exa-client';
import type {
  AppSettings,
  RecommendationSession,
  RecommendationCard,
  ExtractedTopic,
  SourceKind,
} from '@/types';

const STORAGE_KEY = 'recommendationSessions';
const MAX_STORED_SESSIONS = 5;
const SWEEP_STALE_MS = 5 * 60 * 1000;

const TOPIC_PROMPT = `你是信息检索专家，擅长为用户找到信息的"一手源头"——原始论文、官方文档、原作者作品、参考实现等一手资料，而不是二手评论或博客转载。

任务：从输入中识别用户正在深入关注的 3-5 个话题，为每个话题生成能找到其"源头信息"的搜索意图。

规则：
1. 只选用户真正投入心力的话题（反复提问 / 深度讨论 / 长时间阅读），忽略一次性的碎片信息。
2. 话题名跟随用户语言（中文对话就用中文话题名）；但 searchQueries 必须是英文（Exa 对英文召回质量更高）。
3. sourceIntent 严格从枚举中选：foundational_paper | official_doc | original_author | reference_impl | primary_reference
4. searchQueries 要精准可搜（包含关键名词 + 源头类型提示词）。
5. 严格输出 JSON，不要任何解释文字。

输出 schema:
{
  "topics": [
    {
      "topic": "中文或英文话题名",
      "userEngagement": "用户关注的角度/深度 (1-2 句)",
      "sourceIntent": "foundational_paper | official_doc | original_author | reference_impl | primary_reference",
      "searchQueries": ["英文 query 1", "英文 query 2"],
      "exaType": "research paper | github | company | null"
    }
  ]
}

exaType 映射建议：
  foundational_paper → "research paper"
  reference_impl     → "github"
  official_doc       → "company"
  其他               → null
`;

// ============================================================================
// 持久化
// ============================================================================

export async function loadSessions(): Promise<RecommendationSession[]> {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      resolve(Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : []);
    });
  });
}

export async function saveSessions(sessions: RecommendationSession[]): Promise<void> {
  const trimmed = sessions.slice(0, MAX_STORED_SESSIONS);
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY]: trimmed }, () => resolve());
  });
}

async function getSettings(): Promise<AppSettings> {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['settings'], (result) => {
      resolve((result.settings as AppSettings) || {} as AppSettings);
    });
  });
}

// ============================================================================
// LLM topic extraction
// ============================================================================

export async function extractTopicsFromSummary(
  summaryText: string,
  llmConfig: NonNullable<AppSettings['llmApi']>
): Promise<ExtractedTopic[]> {
  const messages: LlmMessage[] = [
    { role: 'system', content: TOPIC_PROMPT },
    { role: 'user', content: `以下是我的最近总结报告：\n\n${summaryText}\n\n请按 schema 输出 JSON。` },
  ];

  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await callLlm(llmConfig, {
      messages,
      temperature: 0.3,
      maxTokens: 1500,
    });
    try {
      return parseTopics(response);
    } catch (error) {
      lastError = error;
      Logger.warn(`[Recommend] topic 提取 JSON 解析失败 (attempt ${attempt + 1})`, error);
    }
  }
  throw new Error(`LLM 输出不是有效 JSON: ${(lastError as Error)?.message ?? lastError}`);
}

function parseTopics(raw: string): ExtractedTopic[] {
  const trimmed = raw.trim();
  const jsonStart = trimmed.indexOf('{');
  const jsonEnd = trimmed.lastIndexOf('}');
  if (jsonStart < 0 || jsonEnd <= jsonStart) {
    throw new Error('Response does not contain JSON object');
  }
  const jsonText = trimmed.slice(jsonStart, jsonEnd + 1);
  const parsed = JSON.parse(jsonText) as { topics?: any[] };
  if (!parsed.topics || !Array.isArray(parsed.topics)) {
    throw new Error('Missing topics array');
  }
  return parsed.topics.map((t, idx) => ({
    topicKey: `topic_${Date.now()}_${idx}`,
    topic: String(t.topic ?? '').slice(0, 200),
    userEngagement: String(t.userEngagement ?? '').slice(0, 400),
    sourceIntent: normalizeSourceIntent(t.sourceIntent),
    searchQueries: Array.isArray(t.searchQueries)
      ? t.searchQueries.map(String).slice(0, 2)
      : [],
    exaType: normalizeExaType(t.exaType),
  }));
}

function normalizeSourceIntent(v: unknown): ExtractedTopic['sourceIntent'] {
  const allowed = ['foundational_paper', 'official_doc', 'original_author', 'reference_impl', 'primary_reference'];
  return allowed.includes(String(v)) ? (v as ExtractedTopic['sourceIntent']) : 'primary_reference';
}

function normalizeExaType(v: unknown): ExtractedTopic['exaType'] | undefined {
  if (v === 'research paper' || v === 'github' || v === 'company') return v;
  return undefined;
}

// ============================================================================
// Exa search → cards
// ============================================================================

function deriveSourceKind(url: string, exaType: ExtractedTopic['exaType']): SourceKind {
  const lower = url.toLowerCase();
  if (exaType === 'research paper') return 'paper';
  if (/(^|\.)arxiv\.org/.test(lower) || /(^|\.)nature\.com/.test(lower) || /(^|\.)acm\.org/.test(lower) || /(^|\.)ieee\.org/.test(lower) || /semanticscholar\.org/.test(lower)) return 'paper';
  if (exaType === 'github') return 'repo';
  if (/github\.com/.test(lower) || /gitlab\.com/.test(lower)) return 'repo';
  if (/\/docs\//.test(lower) || /\/documentation\//.test(lower) || /(^|\.)readthedocs\.io/.test(lower) || /docs\./.test(lower)) return 'official_doc';
  return 'other';
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function buildCard(topic: ExtractedTopic, result: ExaSearchResult, idx: number): RecommendationCard {
  return {
    id: `card_${topic.topicKey}_${idx}`,
    topicKey: topic.topicKey,
    sourceKind: deriveSourceKind(result.url, topic.exaType),
    title: (result.title ?? '').slice(0, 200),
    url: result.url,
    snippet: (result.text ?? '').slice(0, 400),
    rationale: topic.userEngagement.slice(0, 200),
    publishedAt: result.publishedDate,
    domain: extractDomain(result.url),
    opened: false,
    saved: false,
    dismissed: false,
  };
}

// ============================================================================
// Session runner
// ============================================================================

export interface RunSessionParams {
  sessionId: string;
  triggerSource: 'from_summary' | 'standalone';
  summaryTaskId?: string;
  summaryText?: string;
}

async function updateSession(
  sessionId: string,
  patch: Partial<RecommendationSession>
): Promise<void> {
  const sessions = await loadSessions();
  const existingIdx = sessions.findIndex((s) => s.id === sessionId);
  if (existingIdx < 0) {
    const fresh: RecommendationSession = {
      id: sessionId,
      triggerSource: patch.triggerSource ?? 'from_summary',
      summaryTaskId: patch.summaryTaskId,
      strategies: ['source_upstream'],
      status: 'pending',
      extractedTopics: [],
      cards: [],
      createdAt: new Date().toISOString(),
      dataWindowDays: 14,
      ...patch,
    };
    sessions.unshift(fresh);
  } else {
    sessions[existingIdx] = { ...sessions[existingIdx], ...patch };
  }
  await saveSessions(sessions);
}

export async function runRecommendationSession(params: RunSessionParams): Promise<void> {
  const { sessionId, triggerSource, summaryTaskId, summaryText } = params;
  const createdAt = new Date().toISOString();

  await updateSession(sessionId, {
    triggerSource,
    summaryTaskId,
    status: 'pending',
    createdAt,
    strategies: ['source_upstream'],
    extractedTopics: [],
    cards: [],
    dataWindowDays: 14,
  });

  try {
    const settings = await getSettings();
    const llmConfig = settings.llmApi;
    const exaKey = settings.recommend?.exaApiKey;

    if (!llmConfig?.apiKey) {
      throw new Error('请先在设置页配置 LLM API Key');
    }
    if (!exaKey) {
      throw new Error('请先在设置页配置 Exa API Key');
    }
    if (!summaryText) {
      throw new Error('缺少 summary 文本');
    }

    await updateSession(sessionId, { status: 'extracting', progress: '正在分析注意力...' });
    const topics = await extractTopicsFromSummary(summaryText, llmConfig);

    if (topics.length === 0) {
      await updateSession(sessionId, {
        status: 'done',
        extractedTopics: [],
        cards: [],
        completedAt: new Date().toISOString(),
      });
      return;
    }

    // M1: take first topic only, first query only
    const topic = topics[0];
    const query = topic.searchQueries[0];
    if (!query) {
      throw new Error('LLM 未返回 searchQuery');
    }

    await updateSession(sessionId, {
      status: 'searching',
      progress: '正在搜索源头...',
      extractedTopics: [topic],
    });

    const exa = new ExaClient(exaKey);
    const exaResponse = await exa.search({
      query,
      type: topic.exaType,
      numResults: 3,
    });

    const cards = exaResponse.results.slice(0, 3).map((r, i) => buildCard(topic, r, i));

    await updateSession(sessionId, {
      status: 'done',
      cards,
      completedAt: new Date().toISOString(),
      progress: undefined,
    });
  } catch (error) {
    const message = error instanceof ExaClientError
      ? `${error.code}: ${error.message}`
      : (error instanceof Error ? error.message : String(error));
    Logger.error(`[Recommend] session ${sessionId} 失败`, error);
    await updateSession(sessionId, {
      status: 'error',
      error: message,
      completedAt: new Date().toISOString(),
      progress: undefined,
    });
  }
}

// ============================================================================
// Service Worker 重启恢复
// ============================================================================

export async function sweepInterruptedSessions(): Promise<void> {
  const sessions = await loadSessions();
  const now = Date.now();
  let changed = false;
  for (const s of sessions) {
    if ((s.status === 'extracting' || s.status === 'searching')
        && (now - new Date(s.createdAt).getTime() > SWEEP_STALE_MS)) {
      s.status = 'error';
      s.error = '任务被中断（Service Worker 重启）';
      s.completedAt = new Date().toISOString();
      changed = true;
    }
  }
  if (changed) {
    await saveSessions(sessions);
    Logger.info('[Recommend] sweep 清理了中断任务');
  }
}

// ============================================================================
// 供 handler 调用的创建 API
// ============================================================================

export async function createSession(params: {
  triggerSource: 'from_summary' | 'standalone';
  summaryTaskId?: string;
  summaryText?: string;
}): Promise<{ sessionId: string }> {
  const sessionId = `rec_${Date.now()}`;
  void runRecommendationSession({
    sessionId,
    triggerSource: params.triggerSource,
    summaryTaskId: params.summaryTaskId,
    summaryText: params.summaryText,
  });
  return { sessionId };
}

export async function getSession(
  sessionId?: string
): Promise<RecommendationSession | null> {
  const sessions = await loadSessions();
  if (!sessions.length) return null;
  if (!sessionId) return sessions[0];
  return sessions.find((s) => s.id === sessionId) ?? null;
}

export async function markInteracted(params: {
  sessionId: string;
  cardId: string;
  action: 'opened' | 'saved' | 'dismissed';
  savedSnippetId?: string;
}): Promise<void> {
  const sessions = await loadSessions();
  const session = sessions.find((s) => s.id === params.sessionId);
  if (!session) return;
  const card = session.cards.find((c) => c.id === params.cardId);
  if (!card) return;

  if (params.action === 'opened') card.opened = true;
  if (params.action === 'saved') {
    card.saved = true;
    if (params.savedSnippetId) card.savedSnippetId = params.savedSnippetId;
  }
  if (params.action === 'dismissed') card.dismissed = true;

  await saveSessions(sessions);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/recommendation-engine.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Type-check and commit**

Run: `npm run type-check`
Expected: No errors.

```bash
git add src/background/recommendation-engine.ts tests/unit/recommendation-engine.test.ts
git commit -m "feat(background): add recommendation engine (M1 vertical slice)"
```

---

## Task 5: Register message handlers & call sweep on init

**Files:**
- Modify: `src/background/index.ts` (imports near top, messageHandlersMap around line 596, initialize function)

- [ ] **Step 1: Add imports**

In `src/background/index.ts`, find the existing `createSummaryTask` import (around line 26) and add after it:

```ts
import {
  createSession as createRecommendationSession,
  getSession as getRecommendationSession,
  markInteracted as markRecommendationInteracted,
  sweepInterruptedSessions,
} from './recommendation-engine';
```

- [ ] **Step 2: Find the summary-handling fragment for summaryText lookup**

Before adding the handler, understand that `createRecommendationSession` needs the summary's text. The handler will accept a `summaryTaskId`, look up the task via the existing `getSummaryTaskResult` (already imported), and pass the result text in.

- [ ] **Step 3: Add handlers to `messageHandlersMap`**

In `src/background/index.ts`, find the `'getSummaryTaskResult'` entry (around line 594) and after its closing `},` append:

```ts
  'createRecommendationSession': async (params) => {
    const triggerSource = params.triggerSource === 'standalone' ? 'standalone' : 'from_summary';
    let summaryText: string | undefined;
    if (triggerSource === 'from_summary') {
      if (!params.summaryTaskId) {
        return { status: 'error', error: 'summaryTaskId is required for from_summary trigger' };
      }
      const taskResult = await getSummaryTaskResult(params.summaryTaskId);
      if (!taskResult || !taskResult.result) {
        return { status: 'error', error: 'summary task not found or has no result' };
      }
      summaryText = taskResult.result;
    } else {
      return { status: 'error', error: 'standalone trigger is not supported in M1' };
    }
    return createRecommendationSession({
      triggerSource,
      summaryTaskId: params.summaryTaskId,
      summaryText,
    });
  },

  'getRecommendationSession': async (params) => {
    const session = await getRecommendationSession(params?.sessionId);
    return { session };
  },

  'markRecommendationInteracted': async (params) => {
    await markRecommendationInteracted({
      sessionId: params.sessionId,
      cardId: params.cardId,
      action: params.action,
      savedSnippetId: params.savedSnippetId,
    });
    return { status: 'ok' };
  },
```

- [ ] **Step 4: Bypass the dispatcher for the long-running recommendation create**

In `src/background/index.ts`, find:

```ts
const BYPASS_DISPATCHER_TYPES = new Set(['createSummaryTask']);
```

and change to:

```ts
const BYPASS_DISPATCHER_TYPES = new Set(['createSummaryTask', 'createRecommendationSession']);
```

- [ ] **Step 5: Call sweepInterruptedSessions on service worker init**

Find the `initialize()` function (starts around line 976). Locate the call to `syncExistingTasksToMyIsland()` and add immediately after it:

```ts
    try {
      await sweepInterruptedSessions();
    } catch (error) {
      Logger.warn('[Background] sweepInterruptedSessions 失败', error);
    }
```

- [ ] **Step 6: Build and smoke-test type-checking**

Run: `npm run type-check`
Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add src/background/index.ts
git commit -m "feat(background): wire recommendation handlers and sweep on init"
```

---

## Task 6: Settings UI — Exa API key + recommend toggle

**Files:**
- Modify: `public/html/popup.html` (settings tab area, after LLM config block)
- Modify: `src/popup/settings.ts` (elements, loadSettings, saveSettings bindings)

- [ ] **Step 1: Find the LLM config block in popup.html**

Search for the LLM configuration section. It should contain an input for LLM API key. We'll insert a new block right after its closing container.

Run:
```bash
grep -n "llm-api-key\|LLM API\|llmApi" /Users/chauncey2025/Documents/GitHub/MyAttentionExtansion/.claude/worktrees/quirky-meitner/public/html/popup.html
```

Use the found line to locate the end of that section.

- [ ] **Step 2: Add recommend config HTML**

After the LLM configuration block's closing `</div>` (the card-level one), insert:

```html
<!-- 推荐配置 -->
<div class="bg-white rounded-lg shadow-sm p-4 mb-3">
  <h3 class="text-sm font-medium mb-4 flex items-center">
    <i class="fas fa-compass mr-2 text-gray-500"></i>
    <span>推荐</span>
  </h3>

  <label class="flex items-center justify-between mb-3">
    <span class="text-sm text-gray-700">启用推荐</span>
    <input type="checkbox" id="recommend-enabled-toggle" class="toggle" />
  </label>

  <div class="mb-3">
    <label for="recommend-exa-key" class="block text-xs text-gray-600 mb-1">
      Exa API Key
    </label>
    <input
      type="password"
      id="recommend-exa-key"
      placeholder="请输入 Exa API Key"
      class="w-full px-2 py-1 text-sm border border-gray-300 rounded"
    />
    <p class="text-xs text-gray-400 mt-1">
      获取 Key: <a href="https://exa.ai" target="_blank" class="text-brand underline">exa.ai</a>
    </p>
  </div>

  <div class="mb-3">
    <label for="recommend-window-days" class="block text-xs text-gray-600 mb-1">
      数据窗口天数 (1-30)
    </label>
    <input
      type="number"
      id="recommend-window-days"
      min="1"
      max="30"
      value="14"
      class="w-24 px-2 py-1 text-sm border border-gray-300 rounded"
    />
  </div>

  <div class="mb-3">
    <label for="recommend-cache-hours" class="block text-xs text-gray-600 mb-1">
      结果缓存时长 (小时)
    </label>
    <input
      type="number"
      id="recommend-cache-hours"
      min="1"
      max="168"
      value="24"
      class="w-24 px-2 py-1 text-sm border border-gray-300 rounded"
    />
  </div>

  <button id="recommend-save-btn" class="bg-brand text-white px-3 py-1.5 rounded text-sm hover:opacity-90">
    保存推荐配置
  </button>
  <span id="recommend-save-status" class="ml-2 text-xs text-green-600 hidden">已保存</span>
</div>
```

- [ ] **Step 3: Wire element handles in settings.ts**

In `src/popup/settings.ts`, locate the `elements` object/const where DOM handles are collected. Append the following fields to the appropriate interface and `elements` object:

```ts
recommendEnabledToggle: document.getElementById('recommend-enabled-toggle') as HTMLInputElement | null,
recommendExaKey: document.getElementById('recommend-exa-key') as HTMLInputElement | null,
recommendWindowDays: document.getElementById('recommend-window-days') as HTMLInputElement | null,
recommendCacheHours: document.getElementById('recommend-cache-hours') as HTMLInputElement | null,
recommendSaveBtn: document.getElementById('recommend-save-btn') as HTMLButtonElement | null,
recommendSaveStatus: document.getElementById('recommend-save-status') as HTMLElement | null,
```

(Adjust style to match the existing pattern in this file — if it uses an `ElementsMap` interface, add the same keys there too.)

- [ ] **Step 4: Populate UI from settings**

In `src/popup/settings.ts`, find the `updateUI(settings)` function and append inside its body:

```ts
  if (elements.recommendEnabledToggle) {
    elements.recommendEnabledToggle.checked = settings.recommend?.enabled ?? false;
  }
  if (elements.recommendExaKey) {
    elements.recommendExaKey.value = settings.recommend?.exaApiKey ?? '';
  }
  if (elements.recommendWindowDays) {
    elements.recommendWindowDays.value = String(settings.recommend?.dataWindowDays ?? 14);
  }
  if (elements.recommendCacheHours) {
    elements.recommendCacheHours.value = String(settings.recommend?.cacheTtlHours ?? 24);
  }
```

- [ ] **Step 5: Save handler**

In `src/popup/settings.ts`, find where other settings save buttons register click handlers (likely a `bindEvents` function or similar). Add a new binding:

```ts
  if (elements.recommendSaveBtn) {
    elements.recommendSaveBtn.addEventListener('click', async () => {
      const enabled = elements.recommendEnabledToggle?.checked ?? false;
      const exaApiKey = (elements.recommendExaKey?.value ?? '').trim();
      const dataWindowDays = clamp(parseInt(elements.recommendWindowDays?.value ?? '14', 10), 1, 30);
      const cacheTtlHours = clamp(parseInt(elements.recommendCacheHours?.value ?? '24', 10), 1, 168);

      await chrome.runtime.sendMessage({
        type: 'updateSettings',
        settings: {
          recommend: { enabled, exaApiKey, dataWindowDays, cacheTtlHours },
        },
      });

      if (elements.recommendSaveStatus) {
        elements.recommendSaveStatus.classList.remove('hidden');
        setTimeout(() => elements.recommendSaveStatus?.classList.add('hidden'), 2000);
      }
    });
  }
```

If a `clamp` helper isn't already defined in this file, add at top:

```ts
function clamp(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}
```

- [ ] **Step 6: Build and smoke-test**

Run: `npm run type-check`
Expected: No errors.

Run: `npm run build`
Expected: Build succeeds without warnings about missing exports.

- [ ] **Step 7: Commit**

```bash
git add public/html/popup.html src/popup/settings.ts
git commit -m "feat(popup): settings UI for Exa API key and recommend config"
```

---

## Task 7: Popup recommendation controller

**Files:**
- Create: `src/popup/recommendation-controller.ts`
- Modify: `src/popup/index.ts` (switchTab, initialization)
- Modify: `public/html/popup.html` (tweak `#recommend-content` inner structure)

M1 scope: render 4 states (empty / loading / ready / error). No pills, no refresh button, no dismiss button, no cache TTL check. "打开" and "保存到注意力" actions only.

- [ ] **Step 1: Tweak recommend tab HTML**

In `public/html/popup.html`, replace the entire `<div id="recommend-content" ...>` block (the existing skeleton from the exploration) with:

```html
<!-- 推荐注意力页面 -->
<div id="recommend-content" class="tab-content hidden flex-1 flex flex-col p-2">
  <div class="mb-3">
    <h2 class="text-sm font-semibold text-gray-800">发现注意力</h2>
    <p class="text-xs text-gray-500">源头信息推荐</p>
  </div>

  <!-- Empty -->
  <div id="recommend-empty" class="flex-1 flex items-center justify-center">
    <div class="text-center">
      <i class="fas fa-compass text-4xl text-gray-300 mb-3"></i>
      <p class="text-gray-500 mb-2">还没有推荐内容</p>
      <p class="text-sm text-gray-400">在总结页生成一份报告后，点击"基于此报告推荐源头"</p>
    </div>
  </div>

  <!-- Loading -->
  <div id="recommend-loading" class="hidden flex-1 flex items-center justify-center">
    <div class="text-center">
      <i class="fas fa-spinner fa-spin text-2xl text-gray-400 mb-2"></i>
      <p id="recommend-loading-text" class="text-gray-500 text-sm">处理中...</p>
    </div>
  </div>

  <!-- Error -->
  <div id="recommend-error" class="hidden flex-1 flex items-center justify-center">
    <div class="text-center max-w-xs">
      <i class="fas fa-exclamation-triangle text-2xl text-red-400 mb-2"></i>
      <p id="recommend-error-text" class="text-red-600 text-sm mb-2"></p>
      <button id="recommend-retry-btn" class="text-brand text-xs underline">重试</button>
    </div>
  </div>

  <!-- Ready -->
  <div id="recommend-list" class="hidden flex-1 overflow-y-auto">
    <div id="recommend-cards" class="grid gap-2 grid-cols-1 pb-2"></div>
  </div>
</div>
```

- [ ] **Step 2: Create the controller module**

Create `src/popup/recommendation-controller.ts`:

```ts
/**
 * 推荐 Tab 控制器（M1 垂直切片）
 * - 4 态渲染（empty / loading / ready / error）
 * - 2s 轮询任务状态
 * - 卡片交互：打开 / 保存到注意力
 */

import { Logger } from '@/core/errors';
import type { RecommendationSession, RecommendationCard } from '@/types';

interface Elements {
  empty: HTMLElement | null;
  loading: HTMLElement | null;
  loadingText: HTMLElement | null;
  error: HTMLElement | null;
  errorText: HTMLElement | null;
  retryBtn: HTMLElement | null;
  list: HTMLElement | null;
  cards: HTMLElement | null;
}

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_DURATION_MS = 90_000;

let pollTimer: number | null = null;
let pollStartedAt = 0;
let activeSessionId: string | null = null;
let lastTriggerParams: { triggerSource: 'from_summary'; summaryTaskId: string } | null = null;

function getElements(): Elements {
  return {
    empty: document.getElementById('recommend-empty'),
    loading: document.getElementById('recommend-loading'),
    loadingText: document.getElementById('recommend-loading-text'),
    error: document.getElementById('recommend-error'),
    errorText: document.getElementById('recommend-error-text'),
    retryBtn: document.getElementById('recommend-retry-btn'),
    list: document.getElementById('recommend-list'),
    cards: document.getElementById('recommend-cards'),
  };
}

function showOnly(kind: 'empty' | 'loading' | 'error' | 'list'): void {
  const els = getElements();
  const map = { empty: els.empty, loading: els.loading, error: els.error, list: els.list };
  for (const [k, el] of Object.entries(map)) {
    if (!el) continue;
    if (k === kind) el.classList.remove('hidden');
    else el.classList.add('hidden');
  }
}

function stopPolling(): void {
  if (pollTimer !== null) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
}

function startPolling(sessionId: string): void {
  stopPolling();
  activeSessionId = sessionId;
  pollStartedAt = Date.now();
  pollTimer = window.setInterval(() => {
    void pollOnce(sessionId);
  }, POLL_INTERVAL_MS);
  void pollOnce(sessionId);
}

async function pollOnce(sessionId: string): Promise<void> {
  if (Date.now() - pollStartedAt > MAX_POLL_DURATION_MS) {
    stopPolling();
    renderError('轮询超时，请稍后重试');
    return;
  }
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'getRecommendationSession',
      sessionId,
    });
    const session: RecommendationSession | null = response?.session ?? null;
    if (!session) return;
    renderSession(session);
    if (session.status === 'done' || session.status === 'error') {
      stopPolling();
    }
  } catch (error) {
    Logger.warn('[Recommend] poll error', error);
  }
}

function renderSession(session: RecommendationSession): void {
  if (session.status === 'pending' || session.status === 'extracting' || session.status === 'searching') {
    showOnly('loading');
    const els = getElements();
    if (els.loadingText) {
      els.loadingText.textContent = session.progress ?? '处理中...';
    }
    return;
  }
  if (session.status === 'error') {
    renderError(session.error ?? '未知错误');
    return;
  }
  if (session.status === 'done') {
    renderCards(session);
  }
}

function renderError(message: string): void {
  showOnly('error');
  const els = getElements();
  if (els.errorText) els.errorText.textContent = message;
}

function renderCards(session: RecommendationSession): void {
  const els = getElements();
  if (!els.cards) return;
  if (session.cards.length === 0) {
    showOnly('empty');
    const emptyEl = els.empty;
    if (emptyEl) {
      emptyEl.innerHTML = `
        <div class="text-center">
          <i class="fas fa-info-circle text-4xl text-gray-300 mb-3"></i>
          <p class="text-gray-500">本次没有匹配到源头内容</p>
        </div>`;
    }
    return;
  }
  showOnly('list');
  els.cards.innerHTML = '';
  for (const card of session.cards) {
    if (card.dismissed) continue;
    els.cards.appendChild(buildCardElement(session.id, card));
  }
}

function buildCardElement(sessionId: string, card: RecommendationCard): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'bg-white border border-gray-200 rounded-lg p-3 hover:shadow-sm transition';
  const sourceLabel = {
    paper: '📄 论文',
    official_doc: '📘 官方文档',
    original_author: '✍️ 原作者',
    repo: '💻 仓库',
    other: '🔗 资源',
  }[card.sourceKind];

  wrapper.innerHTML = `
    <div class="text-xs text-gray-500 mb-1">${escapeHtml(sourceLabel)}</div>
    <div class="text-sm font-medium text-gray-800 mb-1 line-clamp-2">${escapeHtml(card.title)}</div>
    <div class="text-xs text-gray-600 mb-2 line-clamp-3">${escapeHtml(card.snippet)}</div>
    ${card.rationale ? `<div class="text-xs text-brand bg-brand-light rounded px-2 py-1 mb-2">💡 ${escapeHtml(card.rationale)}</div>` : ''}
    <div class="text-xs text-gray-400 mb-2">📍 ${escapeHtml(card.domain)}${card.publishedAt ? ` · ${escapeHtml(card.publishedAt)}` : ''}</div>
    <div class="flex gap-2">
      <button data-action="open" class="text-xs px-2 py-1 border border-gray-300 rounded hover:bg-gray-50">打开</button>
      <button data-action="save" class="text-xs px-2 py-1 border border-brand text-brand rounded hover:bg-brand-light ${card.saved ? 'opacity-60 pointer-events-none' : ''}">
        ${card.saved ? '已保存' : '保存到注意力'}
      </button>
    </div>
  `;

  wrapper.querySelector('[data-action="open"]')?.addEventListener('click', () => {
    window.open(card.url, '_blank');
    void chrome.runtime.sendMessage({
      type: 'markRecommendationInteracted',
      sessionId,
      cardId: card.id,
      action: 'opened',
    });
  });

  wrapper.querySelector('[data-action="save"]')?.addEventListener('click', async () => {
    if (card.saved) return;
    const snippetResp = await chrome.runtime.sendMessage({
      type: 'upsertSnippet',
      snippet: {
        dedupeKey: `recommendation:${card.id}`,
        type: 'page_save',
        captureMethod: 'context_menu_page',
        selectionText: card.title,
        contextText: card.snippet,
        selectors: [],
        url: card.url,
        title: card.title,
        domain: card.domain,
        sourceKind: 'web_page',
        headingPath: [card.rationale || card.sourceKind],
        rawContextMarkdown: card.snippet,
        summaryText: card.rationale,
      },
    });

    const savedSnippetId = snippetResp?.data?.group?.id ?? snippetResp?.group?.id;

    await chrome.runtime.sendMessage({
      type: 'markRecommendationInteracted',
      sessionId,
      cardId: card.id,
      action: 'saved',
      savedSnippetId,
    });

    card.saved = true;
    const btn = wrapper.querySelector('[data-action="save"]');
    if (btn) {
      btn.textContent = '已保存';
      btn.classList.add('opacity-60', 'pointer-events-none');
    }
  });

  return wrapper;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ============================================================================
// 外部 API
// ============================================================================

export async function onRecommendTabActivated(params?: {
  triggerSource?: 'from_summary';
  summaryTaskId?: string;
}): Promise<void> {
  // 先挂接重试按钮（幂等）
  const els = getElements();
  if (els.retryBtn && !els.retryBtn.dataset.bound) {
    els.retryBtn.addEventListener('click', () => {
      if (lastTriggerParams) {
        void triggerRecommendationFromSummary(lastTriggerParams.summaryTaskId);
      }
    });
    els.retryBtn.dataset.bound = '1';
  }

  if (params?.triggerSource === 'from_summary' && params.summaryTaskId) {
    await triggerRecommendationFromSummary(params.summaryTaskId);
    return;
  }

  const response = await chrome.runtime.sendMessage({ type: 'getRecommendationSession' });
  const session: RecommendationSession | null = response?.session ?? null;
  if (!session) {
    showOnly('empty');
    return;
  }
  renderSession(session);
  if (session.status === 'pending' || session.status === 'extracting' || session.status === 'searching') {
    startPolling(session.id);
  }
}

export async function triggerRecommendationFromSummary(summaryTaskId: string): Promise<void> {
  lastTriggerParams = { triggerSource: 'from_summary', summaryTaskId };
  showOnly('loading');
  const els = getElements();
  if (els.loadingText) els.loadingText.textContent = '正在启动...';

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'createRecommendationSession',
      triggerSource: 'from_summary',
      summaryTaskId,
    });

    if (response?.status === 'error') {
      renderError(response.error ?? '创建任务失败');
      return;
    }

    const sessionId = response?.data?.sessionId ?? response?.sessionId;
    if (!sessionId) {
      renderError('未返回 sessionId');
      return;
    }
    startPolling(sessionId);
  } catch (error) {
    renderError(error instanceof Error ? error.message : String(error));
  }
}

export function onRecommendTabDeactivated(): void {
  stopPolling();
}
```

- [ ] **Step 3: Wire controller into popup index**

In `src/popup/index.ts`:

(a) Add import near other popup imports:

```ts
import {
  onRecommendTabActivated,
  onRecommendTabDeactivated,
} from './recommendation-controller';
```

(b) Add a module-level variable for carrying jump params:

```ts
let pendingRecommendParams: { triggerSource: 'from_summary'; summaryTaskId: string } | null = null;
```

(c) Find the `switchTab` function (around line 1718). At the bottom of the function, before the closing `}`, append:

```ts
  if (tabName === 'recommend') {
    const params = pendingRecommendParams;
    pendingRecommendParams = null;
    void onRecommendTabActivated(params ?? undefined);
  } else {
    onRecommendTabDeactivated();
  }
```

(d) Export a helper to jump from summary page:

Append near other exports (or near `switchTab`):

```ts
export function jumpToRecommendFromSummary(summaryTaskId: string): void {
  pendingRecommendParams = { triggerSource: 'from_summary', summaryTaskId };
  switchTab('recommend');
}
```

- [ ] **Step 4: Type-check & build**

Run: `npm run type-check && npm run build`
Expected: success.

- [ ] **Step 5: Commit**

```bash
git add src/popup/recommendation-controller.ts src/popup/index.ts public/html/popup.html
git commit -m "feat(popup): recommendation controller and tab UI states"
```

---

## Task 8: Summary-detail "推荐源头" button

**Files:**
- Modify: `public/html/popup.html` — add button near `summary-result-content`
- Modify: `src/popup/index.ts:1626-1650` (`viewSummaryResult`) — show + bind button
- Modify: `src/popup/index.ts:1533-1540` (`showSummaryTaskList`) — hide button on back

The summary result renders via `viewSummaryResult(taskId, title)` (line 1626). It populates `#summary-result-content` inside `#summary-result-view`. We'll add the button inside `#summary-result-view`, show it in `viewSummaryResult` with the `taskId` in closure, and hide it in `showSummaryTaskList`.

- [ ] **Step 1: Add the button in popup.html**

Find `<div id="summary-result-content"` in `public/html/popup.html`. Inside the same parent block that holds `summary-result-view`, right after the content div, add:

```html
<div class="mt-3 flex justify-end">
  <button
    id="summary-to-recommend-btn"
    class="bg-brand text-white px-3 py-1.5 rounded text-sm hover:opacity-90 hidden"
  >
    <i class="fas fa-compass mr-1"></i>
    基于此报告推荐源头
  </button>
</div>
```

- [ ] **Step 2: Show and bind the button in `viewSummaryResult`**

In `src/popup/index.ts`, modify `viewSummaryResult` (starting line 1626). Inside the function, after the `try` block (right before the closing `}` of `viewSummaryResult`, after the catch), add:

Replace the current ending of `viewSummaryResult`:

```ts
  } catch (error) {
    logPopupError('获取总结结果', error);
    if (resultContent) {
      resultContent.innerHTML = `<p class="text-red-500">获取失败</p>`;
    }
  }
}
```

with:

```ts
  } catch (error) {
    logPopupError('获取总结结果', error);
    if (resultContent) {
      resultContent.innerHTML = `<p class="text-red-500">获取失败</p>`;
    }
  }

  const recommendBtn = document.getElementById('summary-to-recommend-btn') as HTMLButtonElement | null;
  if (recommendBtn) {
    recommendBtn.classList.remove('hidden');
    recommendBtn.onclick = () => jumpToRecommendFromSummary(taskId);
  }
}
```

Note: `taskId` is the first parameter of `viewSummaryResult`, so it's already in scope.

- [ ] **Step 3: Hide the button in `showSummaryTaskList`**

In `src/popup/index.ts`, modify `showSummaryTaskList` (starts line 1533). Replace:

```ts
function showSummaryTaskList(): void {
  const listEl = document.getElementById('summary-task-list');
  const resultView = document.getElementById('summary-result-view');
  const emptyEl = document.getElementById('summary-empty');
  if (listEl) listEl.classList.remove('hidden');
  if (resultView) resultView.classList.add('hidden');
  if (emptyEl) emptyEl.classList.add('hidden');
}
```

with:

```ts
function showSummaryTaskList(): void {
  const listEl = document.getElementById('summary-task-list');
  const resultView = document.getElementById('summary-result-view');
  const emptyEl = document.getElementById('summary-empty');
  const recommendBtn = document.getElementById('summary-to-recommend-btn');
  if (listEl) listEl.classList.remove('hidden');
  if (resultView) resultView.classList.add('hidden');
  if (emptyEl) emptyEl.classList.add('hidden');
  if (recommendBtn) recommendBtn.classList.add('hidden');
}
```

- [ ] **Step 4: Verify `jumpToRecommendFromSummary` is in scope**

`jumpToRecommendFromSummary` was defined in Task 7 inside `src/popup/index.ts`. Since `viewSummaryResult` is in the same file, no extra import is needed. Verify with:

```bash
grep -n "jumpToRecommendFromSummary\|export function jumpToRecommendFromSummary" /Users/chauncey2025/Documents/GitHub/MyAttentionExtansion/.claude/worktrees/quirky-meitner/src/popup/index.ts
```

Expected: Two matches — the function definition (from Task 7) and the call site added in Step 2.

- [ ] **Step 5: Type-check & build**

Run: `npm run type-check && npm run build`
Expected: success.

- [ ] **Step 6: Commit**

```bash
git add public/html/popup.html src/popup/index.ts
git commit -m "feat(popup): add 'recommend from summary' button"
```

---

## Task 9: Manual end-to-end verification

**Files:** None (verification only)

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: Completes successfully.

- [ ] **Step 2: Load extension in Chrome**

- Open `chrome://extensions`
- Enable Developer mode
- Remove any previous unpacked load of this project
- Click "Load unpacked" → select the `dist/` directory

Expected: Extension loads without errors.

- [ ] **Step 3: Verify manifest permissions**

In `chrome://extensions`, click "Details" on My Attention. Under "Site access" → "On specific sites", confirm `https://api.exa.ai/*` is listed.

- [ ] **Step 4: Configure keys**

- Click extension icon → Settings tab
- Enter LLM API Key (Bailian or OpenAI) — verify config if not already set
- Enter Exa API Key (get one at exa.ai)
- Enable "启用推荐"
- Click "保存推荐配置"

Expected: "已保存" appears momentarily.

- [ ] **Step 5: Generate a summary**

- Have at least one Conversation recorded (visit ChatGPT/Claude and ensure a conversation is captured)
- In popup, navigate to Summary tab
- Generate a "AI 周报"
- Wait for status = done

Expected: Summary result renders in the detail view. "基于此报告推荐源头" button becomes visible.

- [ ] **Step 6: Trigger recommendation**

- Click "基于此报告推荐源头"

Expected sequence:
- Recommend tab becomes active
- Loading state with "正在分析注意力..."
- Then "正在搜索源头..."
- After 5-15 seconds: up to 3 cards appear

- [ ] **Step 7: Verify Exa call in DevTools**

While the above runs, open the service worker DevTools (chrome://extensions → "service worker" link). In Network tab, confirm:
- A POST to `https://api.exa.ai/search` was made
- Response has `results` array

- [ ] **Step 8: Test card actions**

- Click "打开" on a card → new tab opens with the recommended URL
- Click "保存到注意力" on another card → button changes to "已保存"
- Navigate to Snippets tab → verify a new snippet exists with title matching the recommended content

- [ ] **Step 9: Test error path**

- Settings → enter a bogus Exa API Key (e.g. `not-a-real-key`) → Save
- Go back to Summary → click "基于此报告推荐源头" again
- Expected: Recommend tab shows error state with message containing "INVALID_KEY" or "401"

- [ ] **Step 10: Restore key and test sweep**

- Re-enter valid Exa key, save
- Trigger a new recommendation and DURING loading state, click "重新加载扩展" in chrome://extensions (this simulates service worker restart)
- Open popup again → navigate to Recommend tab
- Expected: After ~5 minutes the stuck session will be swept; immediate observation should show it still stuck — force observe by adjusting SWEEP_STALE_MS to a small value during manual test (optional)

- [ ] **Step 11: Record findings**

If everything works: proceed to commit. If anything breaks, file issues as separate tasks (not fix inside M1 — M1 is the vertical slice).

- [ ] **Step 12: Final commit (if any doc updates needed)**

```bash
# Only if manual verification turned up small doc/text fixes:
git add <files>
git commit -m "fix(recommend): M1 verification adjustments"
```

---

## M1 完成判定

M1 验收通过当且仅当：
- `npm run test` 全绿（包含新增的 exa-client 和 recommendation-engine 单测）
- `npm run type-check` 无错
- `npm run build` 无错
- Manual E2E（Task 9）全部通过
- 失败状态能恢复（重试按钮 + sweep 机制）

---

## M2-M6 后续计划（未包含在本 plan 中）

待 M1 实际运行验证 Exa 召回质量和 UX 后，按 spec §11 继续：

- **M2** — 扩展到 3-5 topics、并发搜索、URL 去重
- **M3** — 独立入口（standalone），数据窗口配置应用
- **M4** — 探索方向 pills + 点击筛选
- **M5** — 缓存 TTL、stale 条、手动刷新
- **M6** — 不感兴趣按钮、完整错误兜底、Settings "测试连接" 按钮

每个 M 建议在 M1 通过后单独开一个 plan 文件。
