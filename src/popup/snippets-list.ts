import type { Snippet } from '@/types';
import { formatTimestamp, escapeHtml } from './utils/index';
import { safeGetMessage } from './chrome-safe';

export const elements = {
  snippetsContent: document.getElementById('attention-content'),
  snippetsLoading: document.getElementById('attention-loading'),
  snippetsEmpty: document.getElementById('attention-empty'),
  snippetsList: document.getElementById('attention-list'),
  saveCurrentPage: document.getElementById('save-current-page-snippet') as HTMLButtonElement | null,
  currentPageStatus: document.getElementById('current-page-snippet-status'),
  toggleMergeMode: document.getElementById('toggle-snippet-merge-mode') as HTMLButtonElement | null,
  mergeSelected: document.getElementById('merge-selected-snippets') as HTMLButtonElement | null,
  mergeHint: document.getElementById('snippet-merge-hint'),
};

interface RenderSnippetCardOptions {
  selectionMode: boolean;
  selectedSnippetIds: Set<string>;
  /** 是否在渲染前清空容器，默认 true */
  clearContainer?: boolean;
}

function getTypeLabel(snippet: Snippet): string {
  if (snippet.type === 'media_save') {
    return snippet.media?.kind === 'video'
      ? 'Video'
      : snippet.media?.kind === 'audio'
      ? 'Audio'
      : 'Image';
  }
  if (snippet.type === 'page_save') {
    return 'Quick Save';
  }
  if (snippet.type === 'dwell') {
    return 'Auto Dwell';
  }
  return snippet.captureMethod === 'context_menu_selection' ? 'Quick Save' : 'Auto Highlight';
}

function getMergeLabel(snippet: Snippet): string {
  if (snippet.type !== 'highlight') {
    return '';
  }

  const count = snippet.selectionCount || 0;
  if (count > 1) {
    return `${count} highlights in same context`;
  }
  return '1 highlight';
}

function getMediaStatusLabel(snippet: Snippet): string {
  if (snippet.media?.downloadStatus === 'ready') {
    return 'Local Copy';
  }
  if (snippet.media?.downloadStatus === 'failed') {
    return 'Failed';
  }
  return 'URL Only';
}

function getMediaPreviewHtml(snippet: Snippet): string {
  const previewUrl = snippet.media?.localFileUrl || snippet.media?.previewUrl || snippet.media?.sourceUrl;
  if (!snippet.media) {
    return '';
  }

  if (snippet.media.kind === 'image' && previewUrl) {
    return `<img src="${escapeHtml(previewUrl)}" alt="${escapeHtml(snippet.media.altText || snippet.summaryText || 'media preview')}" class="w-[72px] h-[72px] rounded-lg object-cover border border-gray-200 bg-gray-50 shrink-0">`;
  }

  if (snippet.media.kind === 'video') {
    const poster = snippet.media.posterUrl || previewUrl || '';
    return `
      <div class="w-[72px] h-[72px] rounded-lg border border-gray-200 bg-gray-900 text-white shrink-0 overflow-hidden flex items-center justify-center relative">
        ${
          poster
            ? `<img src="${escapeHtml(poster)}" alt="video poster" class="absolute inset-0 w-full h-full object-cover opacity-70">`
            : ''
        }
        <i class="fas fa-play text-sm relative"></i>
      </div>
    `;
  }

  return `
    <div class="w-[72px] h-[72px] rounded-lg border border-gray-200 bg-gray-100 text-gray-500 shrink-0 flex items-center justify-center">
      <i class="fas fa-wave-square text-base"></i>
    </div>
  `;
}

export function showLoading(): void {
  elements.snippetsLoading?.classList.remove('hidden');
  elements.snippetsEmpty?.classList.add('hidden');
  elements.snippetsList?.classList.add('hidden');
}

export function hideLoading(): void {
  elements.snippetsLoading?.classList.add('hidden');
}

export function showEmpty(): void {
  elements.snippetsLoading?.classList.add('hidden');
  elements.snippetsEmpty?.classList.remove('hidden');
  elements.snippetsList?.classList.add('hidden');
}

export function showList(): void {
  elements.snippetsEmpty?.classList.add('hidden');
  elements.snippetsList?.classList.remove('hidden');
}

export function renderSnippetCards(
  snippets: Snippet[],
  options: RenderSnippetCardOptions = {
    selectionMode: false,
    selectedSnippetIds: new Set<string>(),
  }
): void {
  if (!elements.snippetsList) {
    return;
  }

  const container = elements.snippetsList.querySelector('div') || elements.snippetsList;
  if (options.clearContainer !== false) {
    container.innerHTML = '';
  }

  snippets.forEach((snippet) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className =
      'memory-card bg-white p-4 rounded-lg shadow-sm relative text-left w-full border border-gray-200 hover:border-gray-300';
    const isSelected = options.selectedSnippetIds.has(snippet.id);
    const canSelect = snippet.type === 'highlight';
    if (options.selectionMode) {
      card.classList.toggle('ring-2', isSelected);
      card.classList.toggle('ring-amber-300', isSelected);
      if (!canSelect) {
        card.classList.add('opacity-70');
      }
    }

    const summary = (
      snippet.summaryText ||
      (snippet.type === 'page_save'
        ? snippet.contextText
        : snippet.selectionText || snippet.contextText)
    ).slice(0, 160);
    const typeLabel = getTypeLabel(snippet);
    const sourceLabel = snippet.sourceKind === 'ai_conversation' ? 'AI' : 'Web';
    const mergeLabel = getMergeLabel(snippet);
    const enrichmentLabel =
      snippet.enrichmentStatus === 'ready'
        ? 'Structured'
        : snippet.enrichmentStatus === 'processing'
        ? 'Structuring'
        : snippet.enrichmentStatus === 'failed'
        ? 'Fallback'
        : 'Pending';
    const mediaStatusLabel = snippet.type === 'media_save' ? getMediaStatusLabel(snippet) : '';
    const mediaPreviewHtml = snippet.type === 'media_save' ? getMediaPreviewHtml(snippet) : '';

    card.innerHTML = `
      ${
        options.selectionMode
          ? `<div class="flex items-center justify-end mb-2">
               <span class="text-[10px] px-2 py-1 rounded-full ${
                 canSelect
                   ? isSelected
                     ? 'bg-amber-100 text-amber-700'
                     : 'bg-gray-100 text-gray-500'
                   : 'bg-gray-100 text-gray-400'
               }">
                 ${canSelect ? (isSelected ? '已选中' : '点击选择') : '不可合并'}
               </span>
             </div>`
          : ''
      }
      <div class="flex items-start gap-3 mb-2">
        ${mediaPreviewHtml}
        <div class="min-w-0 flex-1">
          <div class="font-medium text-sm truncate">${escapeHtml(snippet.title || snippet.domain || 'Untitled')}</div>
          <div class="text-xs text-gray-500 mt-1">${escapeHtml(snippet.domain || '-')}</div>
        </div>
        <div class="flex items-center gap-1 flex-shrink-0">
          <span class="text-[10px] px-2 py-1 rounded-full bg-gray-100 text-gray-700">${escapeHtml(typeLabel)}</span>
          <span class="text-[10px] px-2 py-1 rounded-full bg-brand-light text-brand">${escapeHtml(sourceLabel)}</span>
        </div>
      </div>
      <div class="flex items-center gap-2 flex-wrap mb-2">
        ${
          mergeLabel
            ? `<span class="text-[10px] px-2 py-1 rounded-full bg-amber-50 text-amber-700">${escapeHtml(mergeLabel)}</span>`
            : ''
        }
        <span class="text-[10px] px-2 py-1 rounded-full bg-emerald-50 text-emerald-700">${escapeHtml(enrichmentLabel)}</span>
        ${
          mediaStatusLabel
            ? `<span class="text-[10px] px-2 py-1 rounded-full bg-violet-50 text-violet-700">${escapeHtml(mediaStatusLabel)}</span>`
            : ''
        }
      </div>
      ${
        snippet.type === 'page_save'
          ? `<p class="text-sm text-gray-600 line-clamp-3">${escapeHtml(summary)}</p>`
          : snippet.type === 'media_save'
          ? `<p class="text-sm text-gray-800 font-medium line-clamp-2">${escapeHtml(snippet.summaryText || snippet.media?.altText || snippet.media?.sourceUrl || '-')}</p>
             <p class="text-xs text-gray-500 mt-2 line-clamp-3">${escapeHtml(summary || snippet.media?.sourceUrl || '')}</p>`
          : `<p class="text-sm text-gray-800 font-medium line-clamp-2">${escapeHtml(snippet.selectionText || snippet.summaryText || '-')}</p>
             <p class="text-xs text-gray-500 mt-2 line-clamp-3">${escapeHtml(summary)}</p>`
      }
      <div class="flex items-center justify-between text-xs text-gray-400 mt-3">
        <span>${formatTimestamp(snippet.updatedAt || snippet.createdAt)}</span>
        <span>${snippet.dwellMs ? `${Math.round(snippet.dwellMs / 1000)}s` : ''}</span>
      </div>
    `;

    card.addEventListener('click', () => {
      if (options.selectionMode) {
        if (!canSelect) {
          return;
        }
        document.dispatchEvent(
          new CustomEvent('toggle-snippet-selection', {
            detail: { snippetId: snippet.id, snippet },
          })
        );
        return;
      }

      document.dispatchEvent(
        new CustomEvent('show-snippet', {
          detail: { snippetId: snippet.id, snippet },
        })
      );
    });

    container.appendChild(card);
  });
}

export function updateCurrentPageSnippetStatus(hasSnippet: boolean): void {
  if (!elements.currentPageStatus) {
    return;
  }

  elements.currentPageStatus.textContent = hasSnippet
    ? safeGetMessage('snippetStatusSaved', '已保存')
    : safeGetMessage('snippetStatusNotSaved', '未保存');
  elements.currentPageStatus.className = hasSnippet
    ? 'text-xs px-2 py-1 rounded-full bg-green-100 text-green-700'
    : 'text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600';
}
