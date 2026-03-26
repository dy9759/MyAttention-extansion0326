import type {
  SaveMediaSnippetInput,
  Snippet,
  SnippetGroup,
  SnippetGroupDetail,
  SnippetInput,
  SnippetItem,
  SnippetMedia,
  SnippetMediaInput,
  SnippetMergeInput,
  SnippetSelectionInput,
  SnippetSelectionUpsertResult,
  SnippetStatus,
} from '@/types';
import { database } from '@/background/database';

function cleanUrl(url: string): string {
  return String(url || '').split(/[?#]/)[0];
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname || '';
  } catch {
    return '';
  }
}

function hashText(text: string): string {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0).toString(16);
}

function uniqueHeadingPath(values: string[] = []): string[] {
  return Array.from(new Set(values.filter((value) => value && value.trim())));
}

function buildSummaryText(group: Partial<SnippetGroup>, items: SnippetItem[]): string {
  if (group.summaryText?.trim()) {
    return group.summaryText.trim();
  }
  if (items[0]?.selectionText?.trim()) {
    return items[0].selectionText.trim();
  }
  if (group.selectionText?.trim()) {
    return group.selectionText.trim();
  }
  if (group.media?.altText?.trim()) {
    return group.media.altText.trim();
  }
  return (group.rawContextText || group.contextText || '').slice(0, 160);
}

function sortItems(items: SnippetItem[]): SnippetItem[] {
  return [...items].sort((a, b) => {
    if ((a.orderIndex || 0) !== (b.orderIndex || 0)) {
      return (a.orderIndex || 0) - (b.orderIndex || 0);
    }
    return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
  });
}

function buildGroupId(stableKey: string): string {
  return `snippet_${hashText(stableKey)}`;
}

function buildItemId(stableKey: string): string {
  return `snippet_item_${hashText(stableKey)}`;
}

function normalizeMedia(
  media?: SnippetMediaInput | SnippetMedia
): SnippetMedia | undefined {
  if (!media) {
    return undefined;
  }

  return {
    kind: media.kind,
    sourceUrl: media.sourceUrl,
    previewUrl: media.previewUrl || media.sourceUrl,
    localFileUrl: media.localFileUrl,
    localFileRelativePath: media.localFileRelativePath,
    mimeType: media.mimeType,
    fileSizeBytes: media.fileSizeBytes,
    width: media.width,
    height: media.height,
    durationSec: media.durationSec,
    posterUrl: media.posterUrl,
    altText: media.altText,
    downloadStatus: media.downloadStatus || 'pending',
    downloadError: media.downloadError,
    savedFrom: media.savedFrom || 'url_only',
  };
}

export class IndexedDbSnippetRepository {
  async saveMediaSnippet(input: SaveMediaSnippetInput): Promise<SnippetGroupDetail | null> {
    const snippet = await this.upsertSnippet({
      ...input.snippet,
      type: 'media_save',
      media: input.snippet.media,
    });

    return database.getSnippetGroupById(snippet.id);
  }

  async upsertSnippet(snippet: SnippetInput): Promise<Snippet> {
    const normalizedUrl = cleanUrl(snippet.url);
    const existing = await database.getSnippetGroupByDedupeKey(snippet.dedupeKey);
    const existingDetail = existing ? await database.getSnippetGroupById(existing.id) : null;
    const now = snippet.updatedAt || new Date().toISOString();
    const createdAt = existing?.createdAt || snippet.createdAt || now;
    const isHighlight = snippet.type === 'highlight';

    const items = existingDetail?.items || [];
    let nextItems = items;

    if (isHighlight) {
      const quoteHash = hashText(`${snippet.dedupeKey}:${snippet.selectionText}`);
      const existingItem = items.find((item) => item.quoteHash === quoteHash);
      const item: SnippetItem = existingItem || {
        id: buildItemId(`${snippet.dedupeKey}:${quoteHash}`),
        snippetId: existing?.id || buildGroupId(snippet.dedupeKey),
        selectionText: snippet.selectionText,
        selectors: snippet.selectors || [],
        quoteHash,
        anchorStatus: 'resolved',
        orderIndex: 0,
        createdAt,
        updatedAt: now,
      };

      nextItems = existingItem
        ? items.map((candidate) =>
            candidate.id === existingItem.id
              ? {
                  ...candidate,
                  selectionText: snippet.selectionText,
                  selectors: snippet.selectors || [],
                  updatedAt: now,
                }
              : candidate
          )
        : [item];
    }

    const firstItem = sortItems(nextItems)[0];
    const nextGroup: Snippet = {
      id: existing?.id || buildGroupId(snippet.dedupeKey),
      groupKey: existing?.groupKey || snippet.dedupeKey,
      dedupeKey: snippet.dedupeKey,
      type: snippet.type,
      captureMethod: snippet.captureMethod,
      url: normalizedUrl,
      title: snippet.title || normalizedUrl,
      domain: snippet.domain || existing?.domain || getDomain(normalizedUrl),
      sourceKind: snippet.sourceKind,
      platform: snippet.platform,
      conversationId: snippet.conversationId,
      messageIndex: snippet.messageIndex,
      semanticBlockKey: snippet.semanticBlockKey,
      headingPath: uniqueHeadingPath(snippet.headingPath || existing?.headingPath || []),
      blockKind: snippet.blockKind || existing?.blockKind,
      selectionCount: nextItems.length,
      rawContextText: snippet.rawContextText || snippet.contextText || existing?.rawContextText || '',
      rawContextMarkdown:
        snippet.rawContextMarkdown || snippet.contextText || existing?.rawContextMarkdown || '',
      structuredContextMarkdown:
        existing?.structuredContextMarkdown ||
        snippet.rawContextMarkdown ||
        snippet.contextText ||
        '',
      summaryText: buildSummaryText(
        {
          summaryText: snippet.summaryText || existing?.summaryText,
          selectionText: firstItem?.selectionText || snippet.selectionText,
          rawContextText: snippet.rawContextText || snippet.contextText || existing?.rawContextText,
          contextText: snippet.contextText || existing?.contextText,
          media: normalizeMedia(snippet.media || existing?.media),
        },
        sortItems(nextItems)
      ),
      enrichmentStatus: 'pending',
      enrichmentModel: existing?.enrichmentModel,
      createdAt,
      updatedAt: now,
      selectionText: firstItem?.selectionText || snippet.selectionText || existing?.selectionText || '',
      contextText: snippet.contextText || existing?.contextText || '',
      selectors: firstItem?.selectors || snippet.selectors || existing?.selectors || [],
      dwellMs: snippet.dwellMs || existing?.dwellMs || 0,
      media: normalizeMedia(snippet.media || existing?.media),
    };

    const detail = {
      group: nextGroup,
      items: sortItems(
        nextItems.map((item) => ({
          ...item,
          snippetId: nextGroup.id,
        }))
      ),
    };

    await database.replaceSnippetGroupDetail(detail, {
      previousGroupId: existing?.id,
      dedupeKey: snippet.dedupeKey,
    });
    return nextGroup;
  }

  async upsertSnippetSelection(
    selection: SnippetSelectionInput
  ): Promise<SnippetSelectionUpsertResult> {
    const groupKey =
      selection.groupKey ||
      `highlight:${cleanUrl(selection.url)}:${selection.semanticBlockKey}:${selection.quoteHash}`;
    const existing = await database.getSnippetGroupByGroupKey(groupKey);
    const existingDetail = existing ? await database.getSnippetGroupById(existing.id) : null;
    const now = selection.updatedAt || new Date().toISOString();
    const createdAt = existing?.createdAt || selection.createdAt || now;
    const nextGroupId = existing?.id || buildGroupId(groupKey);
    const currentItems = existingDetail?.items || [];
    const currentItem = currentItems.find((item) => item.quoteHash === selection.quoteHash);

    const nextItem: SnippetItem = currentItem
      ? {
          ...currentItem,
          selectionText: selection.selectionText,
          selectors: selection.selectors || [],
          updatedAt: now,
        }
      : {
          id: buildItemId(`${groupKey}:${selection.quoteHash}`),
          snippetId: nextGroupId,
          selectionText: selection.selectionText,
          selectors: selection.selectors || [],
          quoteHash: selection.quoteHash,
          anchorStatus: 'resolved',
          orderIndex:
            selection.itemOrderIndex ??
            currentItems.reduce((maxValue, item) => Math.max(maxValue, item.orderIndex || 0), -1) + 1,
          createdAt,
          updatedAt: now,
        };

    const otherItems = currentItems.filter((item) => item.id !== nextItem.id);
    const nextItems = sortItems(
      [...otherItems, nextItem].map((item) => ({
        ...item,
        snippetId: nextGroupId,
      }))
    );
    const firstItem = nextItems[0];

    const nextGroup: Snippet = {
      id: nextGroupId,
      groupKey,
      dedupeKey: existing?.dedupeKey || groupKey,
      type: 'highlight',
      captureMethod: selection.captureMethod,
      url: cleanUrl(selection.url),
      title: selection.title || cleanUrl(selection.url),
      domain: selection.domain || existing?.domain || getDomain(selection.url),
      sourceKind: selection.sourceKind,
      platform: selection.platform,
      conversationId: selection.conversationId,
      messageIndex: selection.messageIndex,
      semanticBlockKey: selection.semanticBlockKey,
      headingPath: uniqueHeadingPath(selection.headingPath || existing?.headingPath || []),
      blockKind: selection.blockKind || existing?.blockKind,
      selectionCount: nextItems.length,
      rawContextText: selection.rawContextText,
      rawContextMarkdown: selection.rawContextMarkdown,
      structuredContextMarkdown:
        existing?.structuredContextMarkdown || selection.rawContextMarkdown || '',
      summaryText: buildSummaryText(
        {
          summaryText: selection.summaryText || existing?.summaryText,
          selectionText: firstItem?.selectionText,
          rawContextText: selection.rawContextText,
          contextText: selection.rawContextText,
        },
        nextItems
      ),
      enrichmentStatus: 'pending',
      enrichmentModel: existing?.enrichmentModel,
      createdAt,
      updatedAt: now,
      selectionText: firstItem?.selectionText || '',
      contextText: selection.rawContextText,
      selectors: firstItem?.selectors || [],
      dwellMs: 0,
      media: normalizeMedia(existing?.media),
    };

    await database.replaceSnippetGroupDetail(
      {
        group: nextGroup,
        items: nextItems,
      },
      {
        previousGroupId: existing?.id,
        groupKey,
      }
    );

    return {
      group: nextGroup,
      item: nextItems.find((item) => item.id === nextItem.id)!,
    };
  }

  async getAllSnippets(): Promise<Snippet[]> {
    return database.getAllSnippets();
  }

  async getSnippetById(id: string): Promise<Snippet | null> {
    return database.getSnippetById(id);
  }

  async getSnippetGroupById(id: string): Promise<SnippetGroupDetail | null> {
    return database.getSnippetGroupById(id);
  }

  async getSnippetsByUrl(url: string): Promise<SnippetGroupDetail[]> {
    return database.getSnippetsByUrl(url);
  }

  async deleteSnippet(id: string): Promise<void> {
    await database.deleteSnippet(id);
  }

  async mergeSnippets(input: SnippetMergeInput): Promise<SnippetGroupDetail | null> {
    const targetDetail = await database.getSnippetGroupById(input.targetId);
    if (!targetDetail?.group || targetDetail.group.type !== 'highlight') {
      throw new Error('SNIPPET_NOT_FOUND');
    }

    const sourceDetails = await Promise.all(
      (input.sourceIds || []).map((id) => database.getSnippetGroupById(id))
    );
    const validSources = sourceDetails.filter((detail): detail is SnippetGroupDetail => !!detail?.group);
    if (validSources.length !== (input.sourceIds || []).length) {
      throw new Error('SNIPPET_NOT_FOUND');
    }

    validSources.forEach((detail) => {
      if (
        detail.group.type !== 'highlight' ||
        detail.group.url !== targetDetail.group.url ||
        detail.group.sourceKind !== targetDetail.group.sourceKind
      ) {
        throw new Error('SNIPPET_MERGE_SCOPE_INVALID');
      }
    });

    const mergedItems = sortItems(
      [...targetDetail.items, ...validSources.flatMap((detail) => detail.items)].filter(
        (item, index, array) =>
          array.findIndex((candidate) => candidate.quoteHash === item.quoteHash) === index
      )
    ).map((item, index) => ({
      ...item,
      snippetId: targetDetail.group.id,
      orderIndex: index,
      updatedAt: new Date().toISOString(),
    }));

    for (const source of validSources) {
      await database.deleteSnippet(source.group.id);
    }

    const mergedGroup: Snippet = {
      ...targetDetail.group,
      selectionCount: mergedItems.length,
      selectionText: mergedItems[0]?.selectionText || targetDetail.group.selectionText || '',
      selectors: mergedItems[0]?.selectors || targetDetail.group.selectors || [],
      rawContextText: uniqueHeadingPath([
        targetDetail.group.rawContextText,
        ...validSources.map((detail) => detail.group.rawContextText),
      ]).join('\n\n'),
      rawContextMarkdown: uniqueHeadingPath([
        targetDetail.group.rawContextMarkdown,
        ...validSources.map((detail) => detail.group.rawContextMarkdown),
      ]).join('\n\n'),
      structuredContextMarkdown: uniqueHeadingPath([
        targetDetail.group.structuredContextMarkdown,
        ...validSources.map((detail) => detail.group.structuredContextMarkdown),
      ]).join('\n\n'),
      headingPath: uniqueHeadingPath([
        ...targetDetail.group.headingPath,
        ...validSources.flatMap((detail) => detail.group.headingPath || []),
      ]),
      summaryText: buildSummaryText(targetDetail.group, mergedItems),
      enrichmentStatus: 'pending',
      updatedAt: new Date().toISOString(),
    };

    const detail = {
      group: mergedGroup,
      items: mergedItems,
    };
    await database.replaceSnippetGroupDetail(detail, {
      previousGroupId: targetDetail.group.id,
      groupKey: targetDetail.group.groupKey,
    });
    return detail;
  }

  async deleteSnippetItem(id: string): Promise<void> {
    const deleted = await database.deleteSnippetItem(id);
    if (!deleted) {
      return;
    }

    const detail = await database.getSnippetGroupById(deleted.snippetId);
    if (!detail?.group) {
      return;
    }

    if (detail.items.length === 0 && detail.group.type === 'highlight') {
      await database.deleteSnippet(deleted.snippetId);
      return;
    }

    const firstItem = detail.items[0];
    await database.upsertSnippetGroup({
      ...detail.group,
      selectionCount: detail.items.length,
      selectionText: firstItem?.selectionText || '',
      selectors: firstItem?.selectors || [],
      summaryText: buildSummaryText(detail.group, detail.items),
      updatedAt: new Date().toISOString(),
    });
  }

  async clearSnippets(): Promise<void> {
    await database.clearSnippets();
  }

  async getSnippetStatusForTab(url: string): Promise<SnippetStatus> {
    return database.getSnippetStatus(url);
  }

  async enrichSnippet(id: string): Promise<SnippetGroupDetail | null> {
    return database.getSnippetGroupById(id);
  }
}

export const indexedDbSnippetRepository = new IndexedDbSnippetRepository();
