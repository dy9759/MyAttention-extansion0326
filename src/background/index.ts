/**
 * SaySo 后台服务入口
 * 作为扩展的核心部分，负责数据库操作和消息处理
 */

import { Logger, ErrorFactory } from '@/core/errors';
import { messageHandlers } from './handlers';
import { chromeMessageAdapter } from '@/core/chrome-message';
import { eventBus } from '@/core/event-bus';
import { DEFAULT_SETTINGS } from '@/types';
import { isCapturablePage } from '@/core/page-scope';
import { CONTEXT_MENU_IDS } from '@/core/constants';
import {
  ensureLocalStoreMetaDefaults,
  getLocalStoreMeta,
  updateLocalStoreMeta,
} from './local-store-meta';
import { localStoreClient } from './local-store-client';
import { localStoreMigrator } from './migration/local-store-migrator';
import { messageDispatcher } from './message-dispatcher';
import { refreshSnippetBadge } from './snippet-status';
import { getBackgroundWebCaptureSettings } from './settings';
import { localStoreSyncService } from './local-store-sync-service';
import { FIRST_OPEN_WELCOME_PENDING_KEY } from '@/core/first-open';

// ============================================================================
// 初始化设置
// ============================================================================

/**
 * 初始化设置
 */
async function initializeSettings(): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get(['settings'], (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        // 如果没有设置，使用默认设置
        if (!result.settings) {
          chrome.storage.sync.set({ settings: DEFAULT_SETTINGS }, () => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else {
              Logger.info('[Background] 初始化设置完成');
              resolve();
            }
          });
        } else {
          resolve();
        }
      }
    });
  });
}

function stringifyError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

async function initializeLocalStore(): Promise<void> {
  await ensureLocalStoreMetaDefaults();
  const meta = await getLocalStoreMeta();

  if (!meta.local_store_enabled) {
    Logger.warn('[Background] Local Store 已禁用，跳过初始化');
    return;
  }

  try {
    const health = await localStoreClient.health();
    if (health.dbPath) {
      await updateLocalStoreMeta({
        local_store_path: health.dbPath,
      });
    }
    await updateLocalStoreMeta({
      local_store_last_error: '',
    });
  } catch (error) {
    const message = stringifyError(error);
    await updateLocalStoreMeta({
      local_store_last_error: message,
    });
    Logger.error('[Background] Local Store 健康检查失败:', message);
    return;
  }

  const latest = await getLocalStoreMeta();
  if (latest.local_store_migration_state === 'pending') {
    await localStoreMigrator.migrateIfNeeded();
  }

  try {
    await localStoreSyncService.hydrateMirrorFromLocalStore();
    await localStoreSyncService.syncPending('initializeLocalStore');
  } catch (error) {
    Logger.warn('[Background] Local Store 镜像初始化失败', stringifyError(error));
  }
}

// ============================================================================
// 标签页行为管理
// ============================================================================

/**
 * 检查 URL 是否支持内容脚本注入
 */
function isInjectablePage(url: string): boolean {
  return isCapturablePage(url);
}

/**
 * 根据当前标签页动态设置 popup 行为
 */
function updatePopupBehavior(tabId: number, url: string): void {
  if (isInjectablePage(url)) {
    // 支持页面：移除默认 popup，让工具栏图标点击走和悬浮按钮一致的侧边栏。
    chrome.action.setPopup({ tabId, popup: '' });
  } else {
    // 非支持平台：使用回退 popup
    chrome.action.setPopup({ tabId, popup: 'html/fallback_popup.html' });
  }
}

const CONTENT_SCRIPT_FILES = {
  css: ['css/content.css'],
  js: ['content-script.js'],
} as const;

async function pingContentScript(tabId: number): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      chrome.tabs.sendMessage(tabId, { type: 'content:healthPing' }, (response) => {
        if (chrome.runtime.lastError) {
          resolve(false);
          return;
        }

        const type = response?.type ?? response?.data?.type;
        resolve(response?.status === 'ok' && type === 'content:healthPong');
      });
    } catch {
      resolve(false);
    }
  });
}

async function injectContentScript(tabId: number): Promise<void> {
  await chrome.scripting.insertCSS({
    target: { tabId },
    files: [...CONTENT_SCRIPT_FILES.css],
  });
  await chrome.scripting.executeScript({
    target: { tabId },
    files: [...CONTENT_SCRIPT_FILES.js],
  });
}

async function ensureContentScriptInjected(
  tabId: number,
  url: string,
  reason: string
): Promise<boolean> {
  if (!isInjectablePage(url)) {
    return false;
  }

  const isAlive = await pingContentScript(tabId);
  if (isAlive) {
    return false;
  }

  try {
    await injectContentScript(tabId);
    Logger.info('[Background] 已重注入内容脚本', { tabId, reason });
    return true;
  } catch (error) {
    Logger.warn('[Background] 内容脚本重注入失败', {
      tabId,
      url,
      reason,
      error: stringifyError(error),
    });
    return false;
  }
}

async function restoreContentScriptsForOpenTabs(reason: string): Promise<void> {
  try {
    const tabs = await chrome.tabs.query({});
    await Promise.all(
      tabs.map(async (tab) => {
        if (!tab.id || !tab.url || !isInjectablePage(tab.url)) {
          return;
        }
        await ensureContentScriptInjected(tab.id, tab.url, reason);
      })
    );
  } catch (error) {
    Logger.warn('[Background] 扫描恢复内容脚本失败', {
      reason,
      error: stringifyError(error),
    });
  }
}

/**
 * 设置标签页行为监听器
 */
function setupTabBehaviorListeners(): void {
  // 监听标签页 URL 变化，动态设置 popup 行为
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // 当 URL 变化或页面加载完成时更新 popup 行为
    if (changeInfo.url || changeInfo.status === 'complete') {
      updatePopupBehavior(tabId, tab.url || '');
      void refreshSnippetBadge(tabId, tab.url || '');
    }
  });

  // 监听标签页切换，动态设置 popup 行为
  chrome.tabs.onActivated.addListener(async (activeInfo) => {
    try {
      const tab = await chrome.tabs.get(activeInfo.tabId);
      if (tab && tab.url) {
        updatePopupBehavior(activeInfo.tabId, tab.url);
        await refreshSnippetBadge(activeInfo.tabId, tab.url);
      }
    } catch (error) {
      // 标签页可能已关闭，忽略错误
    }
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    messageHandlers.handleClearTabRuntimeStatus(tabId);
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync' || !changes.settings) {
      return;
    }

    void refreshContextMenus();
    void refreshAllTabSnippetBadges();
  });

  void chrome.tabs.query({}).then((tabs) => {
    tabs.forEach((tab) => {
      if (tab.id && tab.url) {
        updatePopupBehavior(tab.id, tab.url);
      }
    });
  });
}

// ============================================================================
// 扩展生命周期监听
// ============================================================================

/**
 * 检查是否为主要版本更新（主版本号变化）
 */
function isMajorVersionUpdate(oldVersion?: string, newVersion?: string): boolean {
  if (!oldVersion || !newVersion) return false;

  const oldMajor = parseInt(oldVersion.split('.')[0]);
  const newMajor = parseInt(newVersion.split('.')[0]);

  return newMajor > oldMajor;
}

/**
 * 检查是否为次要版本更新（次版本号变化）
 */
function isMinorVersionUpdate(oldVersion?: string, newVersion?: string): boolean {
  if (!oldVersion || !newVersion) return false;

  const oldParts = oldVersion.split('.');
  const newParts = newVersion.split('.');

  const oldMajor = parseInt(oldParts[0]);
  const newMajor = parseInt(newParts[0]);
  const oldMinor = parseInt(oldParts[1]);
  const newMinor = parseInt(newParts[1]);

  // 主版本号相同，但次版本号增加
  return oldMajor === newMajor && newMinor > oldMinor;
}

/**
 * 设置扩展生命周期监听器
 */
function setupLifecycleListeners(): void {
  chrome.runtime.onStartup.addListener(() => {
    void restoreContentScriptsForOpenTabs('runtime.onStartup');
  });

  // 扩展安装或更新时
  chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
      Logger.info('[Background] 首次安装');
      chrome.storage.local.set({ [FIRST_OPEN_WELCOME_PENDING_KEY]: true });
    } else if (details.reason === 'update') {
      const currentVersion = chrome.runtime.getManifest().version;
      const previousVersion = details.previousVersion;

      Logger.info('[Background] 插件已从版本', {
        from: previousVersion,
        to: currentVersion,
      });

      // 检查是否为主要版本或次要版本更新
      if (
        isMajorVersionUpdate(previousVersion, currentVersion) ||
        isMinorVersionUpdate(previousVersion, currentVersion)
      ) {
        // TODO: 替换为新的更新页面 URL
        Logger.info('[Background] 版本更新，跳过打开更新页面');
        Logger.info('[Background] 已打开更新了示页面');
      } else {
        Logger.info('[Background] 当前版本无需显示更新了示');
      }
    }

    if (details.reason === 'install' || details.reason === 'update') {
      void restoreContentScriptsForOpenTabs(`runtime.onInstalled:${details.reason}`);
    }
  });
}

// ============================================================================
// 消息处理器映射
// ============================================================================

/**
 * 消息处理器映射表
 */
const messageHandlersMap: Record<
  string,
  (params: any, sender: chrome.runtime.MessageSender) => Promise<any>
> = {
  'connectDB': async () => {
    await messageHandlers.handleConnectDB();
    return { status: 'ok' };
  },

  'findConversationByUrl': async (params) => {
    const conversation = await messageHandlers.handleFindConversationByUrl(params.url);
    return { conversation };
  },

  'createConversation': async (params) => {
    const conversationId = await messageHandlers.handleCreateConversation(params.conversation);
    return { conversationId };
  },

  'updateConversation': async (params) => {
    await messageHandlers.handleUpdateConversation(params.conversation);
    return { status: 'ok' };
  },

  'getConversationById': async (params) => {
    const conversation = await messageHandlers.handleGetConversationById(params.conversationId);
    return { conversation };
  },

  'getAllConversations': async () => {
    const conversations = await messageHandlers.handleGetAllConversations();
    return { conversations };
  },

  'getConversationsByIds': async (params) => {
    const conversations = await messageHandlers.handleGetConversationsByIds(
      params.conversationIds || []
    );
    return { conversations };
  },

  'deleteConversation': async (params) => {
    await messageHandlers.handleDeleteConversation(params.conversationId);
    return { status: 'ok' };
  },

  'getStorageUsage': async () => {
    const usage = await messageHandlers.handleGetStorageUsage();
    return { usage };
  },

  'updateSettings': async (params) => {
    await messageHandlers.handleUpdateSettings(params.settings);
    return { status: 'ok' };
  },

  'getSettings': async () => {
    const settings = await messageHandlers.handleGetSettings();
    return { settings };
  },

  'exportConversationsByRange': async (params) => {
    const url = await messageHandlers.handleExportConversations(params);
    return { url };
  },

  'clearStorage': async () => {
    await messageHandlers.handleClearStorage();
    return { status: 'ok' };
  },

  'manualSave': async (params) => {
    const result = await messageHandlers.handleManualSave({ url: params.url });
    return result;
  },

  'openSidePanel': async (params, sender) => {
    await messageHandlers.handleOpenSidePanel(sender);
    return { status: 'ok' };
  },

  'incrementalUpdate': async (params) => {
    const result = await messageHandlers.handleIncrementalUpdate(params);
    return result;
  },

  'smartIncrementalUpdate': async (params) => {
    const result = await messageHandlers.handleSmartIncrementalUpdate(params);
    return result;
  },

  'getConversation': async (params) => {
    const conversation = await messageHandlers.handleGetConversation(params.conversationId);
    return { conversation };
  },

  'reportContentRuntime': async (params, sender) => {
    const runtimeStatus = await messageHandlers.handleReportContentRuntime(params, sender);
    return { runtimeStatus };
  },

  'getTabRuntimeStatus': async (params, sender) => {
    const runtimeStatus = await messageHandlers.handleGetTabRuntimeStatus(params, sender);
    return { runtimeStatus };
  },

  'getLocalStoreStatus': async () => {
    const localStore = await messageHandlers.handleGetLocalStoreStatus();
    return { localStore };
  },

  'getBrowserSyncStatus': async () => {
    const browserSync = await messageHandlers.handleGetBrowserSyncStatus();
    return { browserSync };
  },

  'setLocalStorePath': async (params) => {
    const localStore = await messageHandlers.handleSetLocalStorePath(params.path);
    return { localStore };
  },

  'startLocalStoreMigration': async () => {
    const migration = await messageHandlers.handleStartLocalStoreMigration();
    return { migration };
  },

  'getLocalStoreMigrationState': async () => {
    const migration = await messageHandlers.handleGetLocalStoreMigrationState();
    return { migration };
  },

  'upsertSnippet': async (params, sender) => {
    const snippet = await messageHandlers.handleUpsertSnippet(params.snippet);
    if (sender.tab?.id && snippet.url) {
      void refreshSnippetBadge(sender.tab.id, snippet.url);
    }
    return { snippet };
  },

  'saveMediaSnippet': async (params, sender) => {
    const detail = await messageHandlers.handleSaveMediaSnippet({
      snippet: params.snippet,
      upload: params.upload,
    });
    if (sender.tab?.id && detail?.group.url) {
      void refreshSnippetBadge(sender.tab.id, detail.group.url);
    }
    return detail || { group: null, items: [] };
  },

  'upsertSnippetSelection': async (params, sender) => {
    const result = await messageHandlers.handleUpsertSnippetSelection(params.selection);
    if (sender.tab?.id && result.group.url) {
      void refreshSnippetBadge(sender.tab.id, result.group.url);
    }
    return result;
  },

  'getAllSnippets': async () => {
    const snippets = await messageHandlers.handleGetAllSnippets();
    return { snippets };
  },

  'getSnippetsByUrl': async (params) => {
    const snippets = await messageHandlers.handleGetSnippetsByUrl(params.url || '');
    return { snippets };
  },

  'getSnippetById': async (params) => {
    const snippet = await messageHandlers.handleGetSnippetById(params.id);
    return { snippet };
  },

  'getSnippetGroupById': async (params) => {
    const detail = await messageHandlers.handleGetSnippetGroupById(params.id);
    return detail || { group: null, items: [] };
  },

  'mergeSnippets': async (params, sender) => {
    const detail = await messageHandlers.handleMergeSnippets({
      targetId: params.targetId || '',
      sourceIds: Array.isArray(params.sourceIds) ? params.sourceIds : [],
    });
    if (sender.tab?.id && detail?.group.url) {
      void refreshSnippetBadge(sender.tab.id, detail.group.url);
    }
    return detail || { group: null, items: [] };
  },

  'deleteSnippet': async (params, sender) => {
    await messageHandlers.handleDeleteSnippet(params.id);
    if (sender.tab?.id && sender.tab.url) {
      void refreshSnippetBadge(sender.tab.id, sender.tab.url);
    }
    return { status: 'ok' };
  },

  'deleteSnippetItem': async (params, sender) => {
    await messageHandlers.handleDeleteSnippetItem(params.id);
    if (sender.tab?.id && sender.tab.url) {
      void refreshSnippetBadge(sender.tab.id, sender.tab.url);
    }
    return { status: 'ok' };
  },

  'clearSnippets': async () => {
    await messageHandlers.handleClearSnippets();
    return { status: 'ok' };
  },

  'getSnippetStatusForTab': async (params) => {
    const snippetStatus = await messageHandlers.handleGetSnippetStatusForTab(params.url || '');
    return { snippetStatus };
  },
};

function normalizeMessageResponse(result: any): any {
  if (result && typeof result === 'object') {
    if ('status' in result || 'error' in result) {
      return {
        status: (result as any).status || ((result as any).error ? 'error' : 'ok'),
        ...result,
        data: (result as any).data ?? (result as any),
      };
    }

    return {
      status: 'ok',
      data: result,
      ...result,
    };
  }

  return {
    status: 'ok',
    data: result,
  };
}

// ============================================================================
// 消息监听器
// ============================================================================

const ENABLE_MESSAGE_DISPATCHER = true;

/**
 * 设置消息监听器
 */
function setupMessageListeners(): void {
  chrome.runtime.onMessage.addListener(
    (message, sender, sendResponse) => {
      Logger.debug('[Background] 收到消息:', message.type);

      const handler = messageHandlersMap[message.type];

      if (!handler) {
        Logger.warn('[Background] 未知的消息类型:', message.type);
        sendResponse({ status: 'error', error: 'Unknown message type' });
        return false;
      }

      const dispatchPromise = ENABLE_MESSAGE_DISPATCHER
        ? messageDispatcher.dispatch({
            messageType: message.type,
            params: message,
            sender,
            handler,
          })
        : Promise.resolve(handler(message, sender));

      dispatchPromise
        .then((result) => {
          sendResponse(normalizeMessageResponse(result));
        })
        .catch((error) => {
          Logger.error('[Background] 处理消息失败:', error);
          sendResponse({
            status: 'error',
            error: error instanceof Error ? error.message : String(error),
          });
        });

      // 关键：同步返回 true，保持消息通道，等待异步 sendResponse
      return true;
    }
  );
}

// ============================================================================
// 图标点击监听器
// ============================================================================

/**
 * 设置图标点击监听器
 */
function setupActionListener(): void {
  chrome.action.onClicked.addListener(async (tab) => {
    Logger.info('[Background] 扩展图标被点击');

    // 检查是否在支持的页面
    const url = tab.url || '';

    if (!isInjectablePage(url)) {
      Logger.info('[Background] 当前页面不支持使用侧边栏');
      return;
    }

    // 工具栏图标与悬浮按钮保持一致：统一打开注入式侧边栏。
    if (tab.id) {
      await ensureContentScriptInjected(tab.id, url, 'action.onClicked');
      chrome.tabs.sendMessage(tab.id, { type: 'toggleSidebar' }).catch((error) => {
        Logger.error('[Background] 发送打开侧边栏消息失败:', error);
      });
    }
  });
}

let contextMenuListenerBound = false;

function removeAllContextMenus(): Promise<void> {
  return new Promise((resolve) => {
    chrome.contextMenus.removeAll(() => resolve());
  });
}

function createContextMenu(options: chrome.contextMenus.CreateProperties): Promise<void> {
  return new Promise((resolve) => {
    chrome.contextMenus.create(options, () => resolve());
  });
}

async function refreshActiveTabSnippetBadge(): Promise<void> {
  const tabs = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  const activeTab = tabs[0];
  if (activeTab?.id && activeTab.url) {
    await refreshSnippetBadge(activeTab.id, activeTab.url);
  }
}

async function refreshAllTabSnippetBadges(): Promise<void> {
  const tabs = await chrome.tabs.query({});
  await Promise.all(
    tabs.map(async (tab) => {
      if (tab.id && tab.url) {
        await refreshSnippetBadge(tab.id, tab.url);
      }
    })
  );
}

async function refreshContextMenus(): Promise<void> {
  await removeAllContextMenus();

  try {
    const webCapture = await getBackgroundWebCaptureSettings();
    if (!webCapture.enabled || !webCapture.contextMenuEnabled) {
      return;
    }

    await createContextMenu({
      id: CONTEXT_MENU_IDS.SELECTION,
      title: '保存选中文本到 SaySoAttention',
      contexts: ['selection'],
    });
    await createContextMenu({
      id: CONTEXT_MENU_IDS.PAGE,
      title: '保存当前页面片段到 SaySoAttention',
      contexts: ['page'],
    });
    await createContextMenu({
      id: CONTEXT_MENU_IDS.LINK,
      title: '保存链接文本到 SaySoAttention',
      contexts: ['link'],
    });
    if (webCapture.mediaEnabled !== false) {
      await createContextMenu({
        id: CONTEXT_MENU_IDS.MEDIA,
        title: '保存媒体到 SaySoAttention',
        contexts: ['image', 'video', 'audio'],
      });
    }
  } catch (error) {
    Logger.error('[Background] 更新右键菜单失败:', error);
  }
}

function setupContextMenus(): void {
  if (!contextMenuListenerBound) {
    chrome.contextMenus.onClicked.addListener((info, tab) => {
      void handleContextMenuClick(info, tab);
    });
    contextMenuListenerBound = true;
  }

  void refreshContextMenus();
}

function normalizeContextMenuMediaKind(mediaType?: string): 'image' | 'video' | 'audio' {
  if (mediaType === 'video') {
    return 'video';
  }
  if (mediaType === 'audio') {
    return 'audio';
  }
  return 'image';
}

function cleanContextMenuUrl(url: string): string {
  return String(url || '').split('#')[0].split('?')[0];
}

async function fallbackSaveMediaFromContextMenu(
  info: chrome.contextMenus.OnClickData,
  tabId: number,
  tabUrl: string,
  tabTitle: string,
  webCapture: Awaited<ReturnType<typeof getBackgroundWebCaptureSettings>>
): Promise<void> {
  const sourceUrl = String(info.srcUrl || '').trim();
  if (!sourceUrl) {
    return;
  }

  const mediaKind = normalizeContextMenuMediaKind(info.mediaType);
  const normalizedTabUrl = cleanContextMenuUrl(tabUrl);
  const summaryText = sourceUrl.split('/').pop() || `${mediaKind} resource`;
  const allowLocalCopy = webCapture.mediaLocalCopyEnabled !== false;

  await messageHandlers.handleSaveMediaSnippet({
    snippet: {
      dedupeKey: `media_save:${normalizedTabUrl}:${sourceUrl}:web_page`,
      type: 'media_save',
      captureMethod: 'hover_media_save',
      selectionText: summaryText,
      contextText: sourceUrl,
      selectors: [],
      url: normalizedTabUrl,
      title: tabTitle,
      sourceKind: 'web_page',
      media: {
        kind: mediaKind,
        sourceUrl,
        previewUrl: sourceUrl,
        downloadStatus: allowLocalCopy ? 'pending' : 'url_only',
        savedFrom: allowLocalCopy ? 'url_pull' : 'url_only',
      },
      semanticBlockKey: `media:${normalizedTabUrl}:${sourceUrl}`,
      headingPath: [],
      blockKind: 'media',
      rawContextText: sourceUrl,
      rawContextMarkdown: sourceUrl,
      summaryText,
    },
  });
  await refreshSnippetBadge(tabId, tabUrl);
}

async function handleContextMenuClick(
  info: chrome.contextMenus.OnClickData,
  tab?: chrome.tabs.Tab
): Promise<void> {
  const tabId = tab?.id;
  const tabUrl = tab?.url || '';
  const tabTitle = tab?.title || tabUrl || 'Untitled Page';

  if (!tabId || !tabUrl) {
    return;
  }

  try {
    const webCapture = await getBackgroundWebCaptureSettings();
    if (!webCapture.enabled || !webCapture.contextMenuEnabled) {
      return;
    }

    if (
      info.menuItemId === CONTEXT_MENU_IDS.SELECTION ||
      info.menuItemId === CONTEXT_MENU_IDS.PAGE ||
      info.menuItemId === CONTEXT_MENU_IDS.MEDIA
    ) {
      await ensureContentScriptInjected(tabId, tabUrl, `contextMenu:${String(info.menuItemId)}`);
    }

    if (info.menuItemId === CONTEXT_MENU_IDS.SELECTION) {
      await chrome.tabs.sendMessage(tabId, {
        type: 'captureSelectionFromContextMenu',
        selectionText: info.selectionText || '',
      });
      return;
    }

    if (info.menuItemId === CONTEXT_MENU_IDS.PAGE) {
      await chrome.tabs.sendMessage(tabId, {
        type: 'capturePageFromContextMenu',
      });
      return;
    }

    if (info.menuItemId === CONTEXT_MENU_IDS.MEDIA) {
      if (!info.srcUrl) {
        return;
      }

      try {
        await chrome.tabs.sendMessage(tabId, {
          type: 'captureMediaFromContextMenu',
          srcUrl: info.srcUrl,
          mediaType: info.mediaType || '',
        });
        return;
      } catch {
        await fallbackSaveMediaFromContextMenu(info, tabId, tabUrl, tabTitle, webCapture);
        return;
      }
    }

    if (info.menuItemId === CONTEXT_MENU_IDS.LINK) {
      await messageHandlers.handleUpsertSnippet({
        dedupeKey: `highlight:${tabUrl}:${(info.linkUrl || '').slice(0, 120)}`,
        type: 'highlight',
        captureMethod: 'context_menu_selection',
        selectionText: info.linkUrl || '',
        contextText: '',
        selectors: [],
        url: tabUrl,
        title: tabTitle,
        sourceKind: 'web_page',
      });
      await refreshSnippetBadge(tabId, tabUrl);
      return;
    }
  } catch (error) {
    if (info.menuItemId === CONTEXT_MENU_IDS.MEDIA && info.srcUrl) {
      const webCapture = await getBackgroundWebCaptureSettings();
      await fallbackSaveMediaFromContextMenu(info, tabId, tabUrl, tabTitle, webCapture);
      return;
    }

    if (info.menuItemId === CONTEXT_MENU_IDS.SELECTION && info.selectionText) {
      await messageHandlers.handleUpsertSnippet({
        dedupeKey: `highlight:${tabUrl}:${info.selectionText.slice(0, 120)}`,
        type: 'highlight',
        captureMethod: 'context_menu_selection',
        selectionText: info.selectionText,
        contextText: '',
        selectors: [],
        url: tabUrl,
        title: tabTitle,
        sourceKind: 'web_page',
      });
      await refreshSnippetBadge(tabId, tabUrl);
    }
  }
}

// ============================================================================
// 应用入口
// ============================================================================

/**
 * 初始化应用
 */
async function initialize(): Promise<void> {
  Logger.info('[Background] 初始化 SaySoAttention 后台服务');

  try {
    // 初始化设置
    await initializeSettings();

    localStoreSyncService.initialize();

    // 初始化 Local Store（健康检查 + 首次迁移）
    try {
      await initializeLocalStore();
    } catch (error) {
      Logger.error('[Background] Local Store 初始化失败，将保持服务并等待手动恢复:', error);
    }

    // 设置标签页行为监听器
    setupTabBehaviorListeners();

    // 设置扩展生命周期监听器
    setupLifecycleListeners();

    // 设置消息监听器
    setupMessageListeners();

    // 设置图标点击监听器
    setupActionListener();

    // 设置右键菜单入口
    setupContextMenus();

    // 启动后主动修复已打开标签页中的失效内容脚本（无页面刷新）
    await restoreContentScriptsForOpenTabs('background.initialize');

    Logger.info('[Background] 后台服务初始化完成');
  } catch (error) {
    Logger.error('[Background] 后台服务初始化失败:', error);
  }
}

// 启动应用
initialize().catch((error) => {
  Logger.error('[Background] 应用启动失败:', error);
});

// ============================================================================
// 导出（用于测试）
// ============================================================================

export { initialize, messageHandlersMap };
