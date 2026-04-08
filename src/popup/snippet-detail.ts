import type { Snippet, SnippetGroupDetail, SnippetItem } from '@/types';
import { escapeHtml, formatTime, formatTimestamp } from './utils/index';
import { safeCreateTab } from './chrome-safe';
import { renderMarkdownToHtml } from './markdown-renderer';

export const elements = {
  detail: document.getElementById('snippet-detail'),
  back: document.getElementById('back-to-snippets'),
  title: document.getElementById('snippet-detail-title'),
  meta: document.getElementById('snippet-detail-meta'),
  media: document.getElementById('snippet-detail-media'),
  summary: document.getElementById('snippet-detail-summary'),
  markdown: document.getElementById('snippet-detail-markdown'),
  items: document.getElementById('snippet-detail-items'),
  stats: document.getElementById('snippet-detail-stats'),
  openOriginal: document.getElementById('snippet-detail-open-original'),
  openSavedCopy: document.getElementById('snippet-detail-open-saved-copy'),
  rebuildBtn: document.getElementById('snippet-detail-rebuild'),
  deleteBtn: document.getElementById('snippet-detail-delete'),
};

let currentSnippetDetail: SnippetGroupDetail | null = null;

function buildMeta(detail: SnippetGroupDetail): string {
  const snippet = detail.group;
  return [
    snippet.domain || '-',
    snippet.sourceKind === 'ai_conversation' ? 'AI' : 'Web',
    snippet.type,
    snippet.platform || '',
    snippet.conversationId || '',
    Number.isInteger(snippet.messageIndex) ? `#${snippet.messageIndex}` : '',
    snippet.enrichmentStatus || '',
    formatTimestamp(snippet.updatedAt || snippet.createdAt),
  ]
    .filter(Boolean)
    .map((part) => `<span>${escapeHtml(String(part))}</span>`)
    .join(' · ');
}

function renderStats(detail: SnippetGroupDetail): string {
  const snippet = detail.group;
  return [
    `Selections: ${detail.items.length || snippet.selectionCount || 0}`,
    snippet.headingPath?.length ? `Headings: ${snippet.headingPath.join(' / ')}` : '',
    snippet.blockKind ? `Block: ${snippet.blockKind}` : '',
    snippet.dwellMs ? `Dwell: ${Math.round(snippet.dwellMs / 1000)}s` : '',
    snippet.media?.kind ? `Media: ${snippet.media.kind}` : '',
    snippet.media?.mimeType ? `MIME: ${snippet.media.mimeType}` : '',
    snippet.media?.width && snippet.media?.height
      ? `Size: ${snippet.media.width}x${snippet.media.height}`
      : '',
    snippet.media?.durationSec ? `Duration: ${Math.round(snippet.media.durationSec)}s` : '',
    snippet.media?.fileSizeBytes ? `Bytes: ${snippet.media.fileSizeBytes}` : '',
    snippet.media?.downloadStatus ? `Status: ${snippet.media.downloadStatus}` : '',
    snippet.media?.savedFrom ? `Saved From: ${snippet.media.savedFrom}` : '',
  ]
    .filter(Boolean)
    .map((part) => `<span class="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700">${escapeHtml(part)}</span>`)
    .join('');
}

function renderMarkdown(markdown: string): string {
  return renderMarkdownToHtml(markdown || '');
}

function renderItem(item: SnippetItem, index: number): string {
  return `
    <div class="rounded-lg border border-gray-200 p-3 bg-white">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0 flex-1">
          <div class="text-xs text-gray-500 mb-1">Highlight ${index + 1} · ${escapeHtml(formatTime(item.updatedAt || item.createdAt))}</div>
          <div class="text-sm text-gray-800 whitespace-pre-wrap break-words">${escapeHtml(item.selectionText || '')}</div>
        </div>
        <div class="flex items-center gap-1 shrink-0">
          <button
            type="button"
            class="snippet-item-focus px-2 py-1 text-xs rounded bg-[rgba(94,106,210,0.08)] text-[#5e6ad2] hover:bg-[rgba(94,106,210,0.12)]"
            data-item-id="${escapeHtml(item.id)}"
          >
            定位
          </button>
          <button
            type="button"
            class="snippet-item-delete px-2 py-1 text-xs rounded bg-red-50 text-red-600 hover:bg-red-100"
            data-item-id="${escapeHtml(item.id)}"
          >
            删除
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderMediaPreview(detail: SnippetGroupDetail): string {
  const media = detail.group.media;
  if (!media) {
    return '';
  }

  const previewUrl = media.localFileUrl || media.previewUrl || media.sourceUrl || '';
  if (!previewUrl) {
    return '<div class="text-sm text-gray-500">No preview available</div>';
  }

  if (media.kind === 'image') {
    return `<img src="${escapeHtml(previewUrl)}" alt="${escapeHtml(media.altText || detail.group.summaryText || 'saved image')}" class="w-full max-h-80 object-contain rounded-lg border border-gray-200 bg-gray-50">`;
  }

  if (media.kind === 'video') {
    return `<video src="${escapeHtml(previewUrl)}" ${media.posterUrl ? `poster="${escapeHtml(media.posterUrl)}"` : ''} controls preload="metadata" class="w-full max-h-80 rounded-lg border border-gray-200 bg-black"></video>`;
  }

  return `<audio src="${escapeHtml(previewUrl)}" controls preload="metadata" class="w-full"></audio>`;
}

function bindItemActions(): void {
  if (!elements.items) {
    return;
  }

  elements.items.querySelectorAll<HTMLButtonElement>('.snippet-item-focus').forEach((button) => {
    button.addEventListener('click', () => {
      const itemId = button.dataset.itemId;
      if (!itemId) {
        return;
      }

      document.dispatchEvent(
        new CustomEvent('focus-snippet-item', {
          detail: { itemId },
        })
      );
    });
  });

  elements.items.querySelectorAll<HTMLButtonElement>('.snippet-item-delete').forEach((button) => {
    button.addEventListener('click', () => {
      const itemId = button.dataset.itemId;
      if (!itemId) {
        return;
      }

      document.dispatchEvent(
        new CustomEvent('delete-snippet-item', {
          detail: { itemId },
        })
      );
    });
  });
}

export function getCurrentSnippet(): Snippet | null {
  return currentSnippetDetail?.group || null;
}

export function getCurrentSnippetDetail(): SnippetGroupDetail | null {
  return currentSnippetDetail;
}

export function renderSnippetDetail(detail: SnippetGroupDetail): void {
  currentSnippetDetail = detail;
  const snippet = detail.group;

  if (elements.title) {
    elements.title.textContent = snippet.title || snippet.domain || 'Untitled';
  }

  if (elements.meta) {
    elements.meta.innerHTML = buildMeta(detail);
  }

  if (elements.summary) {
    elements.summary.textContent = snippet.summaryText || snippet.selectionText || snippet.url || '';
  }

  if (elements.media) {
    if (snippet.media) {
      elements.media.innerHTML = renderMediaPreview(detail);
      elements.media.parentElement?.classList.remove('hidden');
    } else {
      elements.media.innerHTML = '';
      elements.media.parentElement?.classList.add('hidden');
    }
  }

  if (elements.stats) {
    elements.stats.innerHTML = renderStats(detail);
  }

  if (elements.markdown) {
    const markdown = snippet.structuredContextMarkdown || snippet.rawContextMarkdown || snippet.contextText || '';
    elements.markdown.innerHTML = renderMarkdown(markdown);
  }

  if (elements.items) {
    if (detail.items.length) {
      elements.items.innerHTML = detail.items.map((item, index) => renderItem(item, index)).join('');
      bindItemActions();
    } else if (snippet.type === 'media_save') {
      elements.items.innerHTML =
        '<div class="text-sm text-gray-500 bg-white rounded-lg border border-gray-200 p-4">媒体资源没有划词条目，详情以预览和元信息为主。</div>';
    } else {
      elements.items.innerHTML =
        '<div class="text-sm text-gray-500 bg-white rounded-lg border border-gray-200 p-4">No highlight items</div>';
    }
  }

  if (elements.openSavedCopy) {
    const hasLocalCopy = Boolean(snippet.media?.localFileUrl);
    elements.openSavedCopy.classList.toggle('hidden', !hasLocalCopy);
  }

  elements.detail?.classList.remove('hidden');
  elements.detail?.classList.add('active');
}

export function hideSnippetDetail(): void {
  elements.detail?.classList.add('hidden');
  elements.detail?.classList.remove('active');
}

export function openCurrentSnippetOriginalPage(): void {
  const targetUrl =
    currentSnippetDetail?.group.media?.sourceUrl || currentSnippetDetail?.group.url;
  if (!targetUrl) {
    return;
  }

  void safeCreateTab(targetUrl);
}

export function openCurrentSnippetSavedCopy(): void {
  const targetUrl = currentSnippetDetail?.group.media?.localFileUrl;
  if (!targetUrl) {
    return;
  }

  void safeCreateTab(targetUrl);
}
