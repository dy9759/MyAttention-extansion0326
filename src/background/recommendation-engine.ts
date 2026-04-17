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
