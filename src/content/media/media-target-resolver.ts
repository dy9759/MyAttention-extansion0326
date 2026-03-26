const MIN_VISUAL_MEDIA_SIZE = 48;
const MIN_AUDIO_WIDTH = 180;
const EXCLUDED_ANCESTOR_SELECTORS =
  '#sayso-sidebar, .sayso-float, [data-sayso-tag="true"], [data-sayso-media-overlay="true"], [aria-hidden="true"]';

export type SaveableMediaElement = HTMLImageElement | HTMLVideoElement | HTMLAudioElement;

export function isMediaElement(element: Element | null): element is SaveableMediaElement {
  return Boolean(
    element &&
      (element instanceof HTMLImageElement ||
        element instanceof HTMLVideoElement ||
        element instanceof HTMLAudioElement)
  );
}

export function getMediaKind(
  element: SaveableMediaElement
): 'image' | 'video' | 'audio' {
  if (element instanceof HTMLImageElement) {
    return 'image';
  }
  if (element instanceof HTMLVideoElement) {
    return 'video';
  }
  return 'audio';
}

export function getMediaElementFromNode(target: EventTarget | Node | null): SaveableMediaElement | null {
  if (!target || !(target instanceof Node)) {
    return null;
  }

  const element: Element | null =
    target instanceof Element
      ? target.closest('img, video, audio')
      : target.parentElement?.closest('img, video, audio') || null;

  return isMediaElement(element) ? element : null;
}

export function isSaveableMediaElement(element: SaveableMediaElement | null): boolean {
  if (!element || element.closest(EXCLUDED_ANCESTOR_SELECTORS)) {
    return false;
  }

  const style = window.getComputedStyle(element);
  if (
    style.display === 'none' ||
    style.visibility === 'hidden' ||
    style.opacity === '0' ||
    style.pointerEvents === 'none'
  ) {
    return false;
  }

  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return false;
  }

  if (
    rect.bottom <= 0 ||
    rect.right <= 0 ||
    rect.top >= window.innerHeight ||
    rect.left >= window.innerWidth
  ) {
    return false;
  }

  if (element instanceof HTMLAudioElement) {
    return rect.width >= MIN_AUDIO_WIDTH || element.controls;
  }

  return rect.width >= MIN_VISUAL_MEDIA_SIZE && rect.height >= MIN_VISUAL_MEDIA_SIZE;
}
