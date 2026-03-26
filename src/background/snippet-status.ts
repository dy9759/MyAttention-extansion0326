import type { SnippetStatus } from '@/types';
import { isAIConversationPage } from '@/core/page-scope';
import { snippetRepository } from './repository/snippet-repository';
import { getBackgroundWebCaptureSettings } from './settings';

const AI_BADGE_COLOR = '#3b82f6';
const WEB_BADGE_COLOR = '#0d9488';

function clearActionBadge(tabId: number): void {
  chrome.action.setBadgeText({ tabId, text: '' });
}

export async function getSnippetStatusForUrl(url: string): Promise<SnippetStatus> {
  return snippetRepository.getSnippetStatusForTab(url);
}

export async function refreshSnippetBadge(tabId: number, url: string): Promise<void> {
  if (!tabId || !url) {
    return;
  }

  try {
    const webCapture = await getBackgroundWebCaptureSettings();
    if (!webCapture.enabled || !webCapture.badgeEnabled) {
      clearActionBadge(tabId);
      return;
    }

    const status = await snippetRepository.getSnippetStatusForTab(url);
    if (!status.hasSnippet) {
      clearActionBadge(tabId);
      return;
    }

    chrome.action.setBadgeText({ tabId, text: '•' });
    chrome.action.setBadgeBackgroundColor({
      tabId,
      color: isAIConversationPage(url) ? AI_BADGE_COLOR : WEB_BADGE_COLOR,
    });
  } catch {
    clearActionBadge(tabId);
  }
}
