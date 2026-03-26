import type { SnippetMediaInput } from '@/types';
import { getElementText, isExcludedElement } from '@/content/snippets/generic-candidate-resolver';
import type { SaveableMediaElement } from './media-target-resolver';
import { getMediaKind } from './media-target-resolver';

export interface ExtractedMediaMetadata {
  media: SnippetMediaInput;
  summaryText: string;
  contextText: string;
}

function trimText(value: string | null | undefined, maxLength: number): string {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return normalized.slice(0, maxLength);
}

function toAbsoluteUrl(value: string | null | undefined): string {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return '';
  }

  if (/^(blob:|data:|https?:)/i.test(normalized)) {
    return normalized;
  }

  try {
    return new URL(normalized, window.location.href).toString();
  } catch {
    return normalized;
  }
}

function inferMimeType(element: SaveableMediaElement, sourceUrl: string): string | undefined {
  const typedSource =
    element instanceof HTMLMediaElement
      ? element.querySelector('source[type]')?.getAttribute('type') || ''
      : '';
  const explicitType = typedSource || element.getAttribute('type') || '';
  if (explicitType.trim()) {
    return explicitType.trim().toLowerCase();
  }

  if (sourceUrl.startsWith('data:')) {
    const match = sourceUrl.match(/^data:([^;,]+)?[;,]/i);
    return match?.[1]?.trim().toLowerCase() || undefined;
  }

  const lower = sourceUrl.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.webm')) return 'video/webm';
  if (lower.endsWith('.ogg') || lower.endsWith('.ogv')) return 'video/ogg';
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.m4a')) return 'audio/mp4';
  return undefined;
}

function getMediaSourceUrl(element: SaveableMediaElement): string {
  if (element instanceof HTMLImageElement) {
    return toAbsoluteUrl(element.currentSrc || element.src || element.getAttribute('src'));
  }

  if (element instanceof HTMLVideoElement || element instanceof HTMLAudioElement) {
    const source =
      element.currentSrc ||
      element.src ||
      element.querySelector('source')?.getAttribute('src') ||
      element.getAttribute('src');
    return toAbsoluteUrl(source);
  }

  return '';
}

function getPreviewUrl(element: SaveableMediaElement, sourceUrl: string): string {
  if (element instanceof HTMLVideoElement) {
    return toAbsoluteUrl(element.poster || sourceUrl);
  }
  return sourceUrl;
}

function getAltLikeText(element: SaveableMediaElement): string {
  if (element instanceof HTMLImageElement) {
    return trimText(
      element.getAttribute('alt') ||
        element.getAttribute('title') ||
        element.getAttribute('aria-label'),
      240
    );
  }

  return trimText(
    element.getAttribute('aria-label') || element.getAttribute('title') || '',
    240
  );
}

function getCaptionText(element: SaveableMediaElement): string {
  const figureCaption = element.closest('figure')?.querySelector('figcaption');
  if (figureCaption) {
    const text = trimText(getElementText(figureCaption), 240);
    if (text) {
      return text;
    }
  }

  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy) {
    const nodes = labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id))
      .filter((node): node is HTMLElement => Boolean(node));
    const text = trimText(nodes.map((node) => node.innerText || node.textContent || '').join(' '), 240);
    if (text) {
      return text;
    }
  }

  return '';
}

function getContextText(element: SaveableMediaElement): string {
  const candidates: Array<Element | null> = [
    element.closest('figure'),
    element.closest('section'),
    element.closest('article'),
    element.closest('main'),
    element.closest('[role="main"]'),
    element.parentElement,
  ];

  for (const candidate of candidates) {
    if (!candidate || isExcludedElement(candidate)) {
      continue;
    }
    const text = trimText(getElementText(candidate), 1000);
    if (text.length >= 8) {
      return text;
    }
  }

  return '';
}

export function extractMediaMetadata(element: SaveableMediaElement): ExtractedMediaMetadata | null {
  const sourceUrl = getMediaSourceUrl(element);
  if (!sourceUrl) {
    return null;
  }

  const previewUrl = getPreviewUrl(element, sourceUrl);
  const captionText = getCaptionText(element);
  const altText = getAltLikeText(element);
  const summaryText = trimText(captionText || altText || element.getAttribute('title') || '', 160);
  const contextText = getContextText(element);

  return {
    media: {
      kind: getMediaKind(element),
      sourceUrl,
      previewUrl,
      mimeType: inferMimeType(element, sourceUrl),
      width:
        element instanceof HTMLImageElement
          ? element.naturalWidth || Math.round(element.getBoundingClientRect().width)
          : element instanceof HTMLVideoElement
          ? element.videoWidth || Math.round(element.getBoundingClientRect().width)
          : undefined,
      height:
        element instanceof HTMLImageElement
          ? element.naturalHeight || Math.round(element.getBoundingClientRect().height)
          : element instanceof HTMLVideoElement
          ? element.videoHeight || Math.round(element.getBoundingClientRect().height)
          : undefined,
      durationSec:
        element instanceof HTMLVideoElement || element instanceof HTMLAudioElement
          ? Number.isFinite(element.duration) && element.duration > 0
            ? element.duration
            : undefined
          : undefined,
      posterUrl: element instanceof HTMLVideoElement ? toAbsoluteUrl(element.poster) : undefined,
      altText: altText || undefined,
      downloadStatus: 'pending',
      savedFrom: 'url_pull',
    },
    summaryText,
    contextText,
  };
}
