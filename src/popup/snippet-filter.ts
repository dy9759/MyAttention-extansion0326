import type { Snippet, SnippetSourceKind, SnippetType } from '@/types';

export type SnippetFilterType = SnippetType | 'all';
export type SnippetFilterSource = SnippetSourceKind | 'all';
export type SnippetFilterDate = 'all' | 'today' | '7d' | '30d';

export interface SnippetFilterState {
  query: string;
  type: SnippetFilterType;
  source: SnippetFilterSource;
  dateRange: SnippetFilterDate;
}

export const DEFAULT_SNIPPET_FILTER_STATE: SnippetFilterState = {
  query: '',
  type: 'all',
  source: 'all',
  dateRange: 'all',
};

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function resolveDateThreshold(dateRange: SnippetFilterDate, nowMs: number): number | null {
  const startOfToday = new Date(nowMs);
  startOfToday.setHours(0, 0, 0, 0);

  if (dateRange === 'today') {
    return startOfToday.getTime();
  }
  if (dateRange === '7d') {
    return nowMs - 7 * 24 * 60 * 60 * 1000;
  }
  if (dateRange === '30d') {
    return nowMs - 30 * 24 * 60 * 60 * 1000;
  }

  return null;
}

export function filterSnippets(
  snippets: Snippet[],
  filters: SnippetFilterState,
  nowMs = Date.now()
): Snippet[] {
  const query = normalizeText(filters.query);
  const threshold = resolveDateThreshold(filters.dateRange, nowMs);

  return snippets.filter((snippet) => {
    if (filters.type !== 'all' && snippet.type !== filters.type) {
      return false;
    }

    if (filters.source !== 'all' && snippet.sourceKind !== filters.source) {
      return false;
    }

    if (threshold !== null) {
      const timestamp = new Date(snippet.updatedAt || snippet.createdAt).getTime();
      if (!Number.isFinite(timestamp) || timestamp < threshold) {
        return false;
      }
    }

    if (!query) {
      return true;
    }

    const haystack = normalizeText(
      [
        snippet.title,
        snippet.domain,
        snippet.selectionText,
        snippet.summaryText,
        snippet.contextText,
        snippet.rawContextMarkdown,
        snippet.structuredContextMarkdown,
        snippet.platform,
        snippet.url,
        snippet.media?.kind,
        snippet.media?.sourceUrl,
        snippet.media?.previewUrl,
        snippet.media?.altText,
        snippet.media?.mimeType,
      ]
        .filter(Boolean)
        .join(' ')
    );

    return haystack.includes(query);
  });
}
