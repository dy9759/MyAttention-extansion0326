import type { AppSettings } from '@/types';
import { DEFAULT_SETTINGS } from '@/types';

function toBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function mergeBackgroundSettings(partial?: Partial<AppSettings> | null): AppSettings {
  const settings = partial || {};
  const defaultWebCapture = DEFAULT_SETTINGS.webCapture || {
    enabled: true,
    highlightEnabled: true,
    dwellEnabled: true,
    contextMenuEnabled: true,
    badgeEnabled: true,
    highlightOverlayEnabled: true,
    highlightReplayEnabled: true,
    semanticMergeEnabled: true,
    llmStructuringEnabled: true,
    mediaEnabled: true,
    mediaLocalCopyEnabled: true,
  };
  const defaultLocalStore = DEFAULT_SETTINGS.localStore || {
    enabled: true,
    path: undefined,
  };

  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    floatTag: {
      ...DEFAULT_SETTINGS.floatTag,
      ...(settings.floatTag || {}),
    },
    localStore: {
      ...defaultLocalStore,
      ...(settings.localStore || {}),
      enabled: toBoolean(settings.localStore?.enabled, defaultLocalStore.enabled),
    },
    webCapture: {
      enabled: toBoolean(settings.webCapture?.enabled, defaultWebCapture.enabled),
      highlightEnabled: toBoolean(
        settings.webCapture?.highlightEnabled,
        defaultWebCapture.highlightEnabled
      ),
      dwellEnabled: toBoolean(
        settings.webCapture?.dwellEnabled,
        defaultWebCapture.dwellEnabled
      ),
      contextMenuEnabled: toBoolean(
        settings.webCapture?.contextMenuEnabled,
        defaultWebCapture.contextMenuEnabled
      ),
      badgeEnabled: toBoolean(
        settings.webCapture?.badgeEnabled,
        defaultWebCapture.badgeEnabled
      ),
      highlightOverlayEnabled: toBoolean(
        settings.webCapture?.highlightOverlayEnabled,
        defaultWebCapture.highlightOverlayEnabled
      ),
      highlightReplayEnabled: toBoolean(
        settings.webCapture?.highlightReplayEnabled,
        defaultWebCapture.highlightReplayEnabled
      ),
      semanticMergeEnabled: toBoolean(
        settings.webCapture?.semanticMergeEnabled,
        defaultWebCapture.semanticMergeEnabled
      ),
      llmStructuringEnabled: toBoolean(
        settings.webCapture?.llmStructuringEnabled,
        defaultWebCapture.llmStructuringEnabled
      ),
      mediaEnabled: toBoolean(
        settings.webCapture?.mediaEnabled,
        defaultWebCapture.mediaEnabled
      ),
      mediaLocalCopyEnabled: toBoolean(
        settings.webCapture?.mediaLocalCopyEnabled,
        defaultWebCapture.mediaLocalCopyEnabled
      ),
    },
  };
}

export async function getBackgroundSettings(): Promise<AppSettings> {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get(['settings'], (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }

      resolve(mergeBackgroundSettings(result.settings || {}));
    });
  });
}

export async function getBackgroundWebCaptureSettings(): Promise<
  NonNullable<AppSettings['webCapture']>
> {
  const settings = await getBackgroundSettings();
  const webCapture = settings.webCapture;
  if (webCapture) {
    return webCapture;
  }

  return {
    enabled: true,
    highlightEnabled: true,
    dwellEnabled: true,
    contextMenuEnabled: true,
    badgeEnabled: true,
    highlightOverlayEnabled: true,
    highlightReplayEnabled: true,
    semanticMergeEnabled: true,
    llmStructuringEnabled: true,
    mediaEnabled: true,
    mediaLocalCopyEnabled: true,
  };
}
