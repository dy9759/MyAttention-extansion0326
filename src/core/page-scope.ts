import { getPlatformFromUrl, isSupportedPlatformUrl } from './platforms';

const BLOCKED_PROTOCOLS = ['chrome:', 'chrome-extension:', 'edge:', 'about:', 'moz-extension:'];
const BLOCKED_HOST_PREFIXES = ['chrome.google.com', 'addons.mozilla.org', 'microsoftedge.microsoft.com'];

export type PageCaptureMode = 'ai_conversation' | 'generic_web' | 'unsupported';

export function isCapturablePage(url: string): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }

  try {
    const parsed = new URL(url);
    if (BLOCKED_PROTOCOLS.includes(parsed.protocol)) {
      return false;
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return false;
    }
    if (BLOCKED_HOST_PREFIXES.some((prefix) => parsed.hostname.startsWith(prefix))) {
      return false;
    }
    return !parsed.pathname.toLowerCase().endsWith('.pdf');
  } catch {
    return false;
  }
}

export function isAIConversationPage(url: string): boolean {
  return isSupportedPlatformUrl(url);
}

export function getPageCaptureMode(url: string): PageCaptureMode {
  if (!isCapturablePage(url)) {
    return 'unsupported';
  }
  if (isAIConversationPage(url) && getPlatformFromUrl(url)) {
    return 'ai_conversation';
  }
  return 'generic_web';
}
