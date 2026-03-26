/**
 * 弹窗主入口模块
 * 初始化弹窗页面，协调各子模块
 */

import type {
  AppSettings,
  StorageUsage,
  Conversation,
  ChromeMessageResponse,
  TabRuntimeStatus,
  Snippet,
  SnippetGroupDetail,
  SnippetStatus,
} from '@/types';
import { Logger } from '@/core/errors';
import {
  getPlatformFromUrl,
  isSupportedPlatformUrl,
} from '@/core/platforms';
import {
  initializeSettingsInteractions,
  loadSettings,
  updateUI,
  updateStorageUsageDisplay as refreshStorageUsageDisplay,
  refreshLocalStoreStatus,
  handleAutoSaveToggleChange,
  bindWebCaptureToggleEvents,
  handleExportButtonClick,
  handleClearButtonClick,
  elements as settingsElements,
} from './settings';
import {
  setAllConversations,
  getCurrentConversationId,
  renderConversationCards,
  showLoading,
  hideLoading,
  showEmpty,
  hideEmpty,
  showList,
  elements as memoriesListElements,
} from './memories-list';
import {
  renderConversationDetail,
  backToList,
  startInlineEdit,
  saveInlineEdit,
  cancelInlineEdit,
  deleteCurrentConversation,
  copyCurrentConversation,
  openOriginalPage,
  hideMoreActionsDropdown,
  showMoreActionsDropdown,
  elements as conversationDetailElements,
} from './conversation-detail';
import {
  getCurrentFilter,
  handleSearchInput,
  clearSearchInput,
  initializeFilter as initializeSearchFilterModule,
  setFilteredConversationsRenderer,
  setAllConversationsForFilter,
  getFilteredConversations,
  handleDateQuickOptions,
  toggleFilterDropdown,
  togglePlatformSelection,
  applyFilter,
  clearFilter,
  elements as searchElements,
} from './search-filter';
import { I18n } from './i18n';
import { getPageCaptureMode } from '@/core/page-scope';
import {
  isExtensionContextInvalidatedError,
} from '@/core/chrome-message';
import {
  installPopupGlobalErrorGuard,
  safeSendRuntimeMessage,
  safeGetMessage,
} from './chrome-safe';
import { exportManager } from './export-manager';
import {
  createPopupRefreshQueue,
  type PopupRefreshQueue,
  type RefreshTaskType,
} from './refresh-queue';
import {
  renderSnippetCards,
  showLoading as showSnippetsLoading,
  hideLoading as hideSnippetsLoading,
  showEmpty as showSnippetsEmpty,
  showList as showSnippetsList,
  updateCurrentPageSnippetStatus,
  elements as snippetsListElements,
} from './snippets-list';
import {
  renderSnippetDetail,
  hideSnippetDetail,
  getCurrentSnippet,
  getCurrentSnippetDetail,
  openCurrentSnippetOriginalPage,
  openCurrentSnippetSavedCopy,
  elements as snippetDetailElements,
} from './snippet-detail';
import {
  DEFAULT_SNIPPET_FILTER_STATE,
  filterSnippets,
  type SnippetFilterDate,
  type SnippetFilterSource,
  type SnippetFilterState,
  type SnippetFilterType,
} from './snippet-filter';
import { createPopupMessageRouter } from './message-router';
import {
  buildRuntimeDiagnosticsViewModel,
  type RuntimeDiagnosticsViewModel,
} from './runtime-diagnostics';
import { initializeFirstOpenOverlay } from './first-open-overlay';

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 自定义事件类型
 */
interface DetailEvent {
  conversationId: string;
  conversation?: Partial<Conversation>;
  title?: string;
}

/**
 * 删除对话事件类型
 */
interface DeleteEvent {
  conversationId: string;
  title?: string;
}

/**
 * 编辑对话标题事件
 */
interface EditTitleEvent {
  conversationId: string;
  newTitle: string;
}

// ============================================================================
// 本地状态（T02 最小可用）
// ============================================================================

let cachedConversations: Conversation[] = [];
let cachedSnippets: Snippet[] = [];
let snippetFilterState: SnippetFilterState = { ...DEFAULT_SNIPPET_FILTER_STATE };
let snippetSelectionMode = false;
const selectedSnippetIds = new Set<string>();
let snippetSelectionOrder: string[] = [];
let isMultiSelectMode = false;
const selectedConversationIds = new Set<string>();
let runtimeDiagnostics: RuntimeDiagnosticsViewModel | null = null;
let recoveryToastShown = false;
let refreshQueue: PopupRefreshQueue | null = null;
let popupContextInvalidated = false;

const SILENT_MESSAGE_TYPES = new Set(['reportContentRuntime']);
const popupMessageRouter = createPopupMessageRouter({
  silentTypes: SILENT_MESSAGE_TYPES,
});

const runtimeStatusElements = {
  card: document.getElementById('runtime-status-card'),
  badge: document.getElementById('runtime-status-badge'),
  platform: document.getElementById('runtime-platform'),
  lastExtract: document.getElementById('runtime-last-extract'),
  lastSave: document.getElementById('runtime-last-save'),
  lastError: document.getElementById('runtime-last-error'),
  actionTip: document.getElementById('runtime-action-tip'),
  emptySubtitle: document.getElementById('memories-empty-subtitle'),
};

const snippetFilterElements = {
  searchInput: document.getElementById('snippet-search-input') as HTMLInputElement | null,
  typeSelect: document.getElementById('snippet-type-filter') as HTMLSelectElement | null,
  sourceSelect: document.getElementById('snippet-source-filter') as HTMLSelectElement | null,
  dateSelect: document.getElementById('snippet-date-filter') as HTMLSelectElement | null,
};

const ENABLE_RUNTIME_DIAGNOSTICS = Boolean(runtimeStatusElements.card);

const FILTER_PLATFORMS: Array<{ id: Conversation['platform']; label: string }> = [
  { id: 'chatgpt', label: 'ChatGPT' },
  { id: 'gemini', label: 'Gemini' },
  { id: 'qwen', label: 'Qwen' },
  { id: 'claude', label: 'Claude' },
  { id: 'deepseek', label: 'DeepSeek' },
  { id: 'kimi', label: 'Kimi' },
  { id: 'doubao', label: '豆包' },
  { id: 'yuanbao', label: '腾讯元宝' },
];

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getRefreshQueue(): PopupRefreshQueue {
  if (popupContextInvalidated) {
    throw new Error('Popup context invalidated');
  }

  if (refreshQueue) {
    return refreshQueue;
  }

  refreshQueue = createPopupRefreshQueue(async (taskType: RefreshTaskType) => {
    switch (taskType) {
      case 'refreshConversations':
        await loadConversations();
        break;
      case 'refreshStorageStats':
        refreshStorageStats();
        break;
      case 'refreshSnippets':
        await loadSnippets();
        break;
      case 'refreshLocalStoreStatus':
        await refreshLocalStoreStatus();
        break;
      case 'refreshRuntimeDiagnostics':
        if (ENABLE_RUNTIME_DIAGNOSTICS) {
          await refreshRuntimeDiagnostics();
        }
        break;
      default:
        break;
    }
  });

  return refreshQueue;
}

function enqueueRefresh(taskType: RefreshTaskType): void {
  if (popupContextInvalidated) {
    return;
  }
  getRefreshQueue().enqueue(taskType);
}

function renderSupportedPlatforms(): void {
  const container = document.getElementById('supported-platforms-list');
  if (!container) {
    return;
  }

  const supportedPlatforms = [
    FILTER_PLATFORMS.find((item) => item.id === 'chatgpt'),
    FILTER_PLATFORMS.find((item) => item.id === 'gemini'),
    FILTER_PLATFORMS.find((item) => item.id === 'qwen'),
    FILTER_PLATFORMS.find((item) => item.id === 'claude'),
    FILTER_PLATFORMS.find((item) => item.id === 'deepseek'),
    FILTER_PLATFORMS.find((item) => item.id === 'yuanbao'),
    FILTER_PLATFORMS.find((item) => item.id === 'doubao'),
    FILTER_PLATFORMS.find((item) => item.id === 'kimi'),
  ].filter((item): item is { id: Conversation['platform']; label: string } => Boolean(item));

  container.innerHTML = '';
  supportedPlatforms.forEach((platform) => {
    const badge = document.createElement('span');
    badge.className = `platform-tag platform-${platform.id}`;
    badge.textContent = platform.label;
    container.appendChild(badge);
  });
}

function removeLegacyOfficialSiteEntry(): void {
  const legacyNode = document.querySelector('[data-i18n="productWebsite"]');
  if (!legacyNode) {
    return;
  }

  const clickableContainer = legacyNode.closest('a, button, div');
  if (clickableContainer && clickableContainer.parentElement) {
    clickableContainer.parentElement.remove();
    Logger.info('[Popup] 已移除旧版 Official Site 入口');
  }
}

function handleContextInvalidated(operation: string, error: unknown): void {
  Logger.warn(`[Popup] ${operation}失败：扩展上下文已失效，自动刷新已禁用`);
  Logger.debug(`[Popup] ${operation}上下文失效详情:`, error);
  popupContextInvalidated = true;

  if (refreshQueue) {
    refreshQueue.dispose();
    refreshQueue = null;
  }

  if (!recoveryToastShown) {
    showToast('扩展上下文已失效。当前不会自动刷新，请重新打开扩展面板。', 'warning', 5000);
    recoveryToastShown = true;
  }
}

function logPopupError(operation: string, error: unknown): void {
  if (isExtensionContextInvalidatedError(error)) {
    handleContextInvalidated(operation, error);
    return;
  }
  Logger.error(`[Popup] ${operation}失败:`, error);
}

function extractRuntimeStatus(
  response: ChromeMessageResponse<{ runtimeStatus?: TabRuntimeStatus | null }>
): TabRuntimeStatus | null {
  if ((response as any)?.runtimeStatus) {
    return (response as any).runtimeStatus as TabRuntimeStatus;
  }
  if ((response as any)?.data?.runtimeStatus) {
    return (response as any).data.runtimeStatus as TabRuntimeStatus;
  }
  return null;
}

function extractSnippetsFromResponse(
  response: ChromeMessageResponse<{ snippets?: Snippet[] }>
): Snippet[] {
  if (Array.isArray((response as any)?.snippets)) {
    return (response as any).snippets as Snippet[];
  }
  if (Array.isArray((response as any)?.data?.snippets)) {
    return (response as any).data.snippets as Snippet[];
  }
  return [];
}

function extractSnippetStatus(
  response: ChromeMessageResponse<{ snippetStatus?: SnippetStatus }>
): SnippetStatus | null {
  if ((response as any)?.snippetStatus) {
    return (response as any).snippetStatus as SnippetStatus;
  }
  if ((response as any)?.data?.snippetStatus) {
    return (response as any).data.snippetStatus as SnippetStatus;
  }
  return null;
}

function extractSnippetDetailResponse(
  response: ChromeMessageResponse<{ group?: Snippet; items?: SnippetGroupDetail['items'] }>
): SnippetGroupDetail | null {
  const group = (response as any)?.group || (response as any)?.data?.group;
  const items = (response as any)?.items || (response as any)?.data?.items;
  if (!group) {
    return null;
  }
  return {
    group: group as Snippet,
    items: Array.isArray(items) ? items : [],
  };
}

function cleanSnippetUrl(url: string): string {
  return url.split('#')[0].split('?')[0];
}

async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  const tabs = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  return tabs[0] || null;
}

async function pingContentScript(
  tabId: number
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: 'content:healthPing' }, (response) => {
      if (chrome.runtime.lastError) {
        resolve({
          success: false,
          error: chrome.runtime.lastError.message || '未知错误',
        });
        return;
      }

      const type = response?.type ?? response?.data?.type;
      resolve({
        success: response?.status === 'ok' && type === 'content:healthPong',
      });
    });
  });
}

function renderRuntimeDiagnostics(viewModel: RuntimeDiagnosticsViewModel): void {
  if (runtimeStatusElements.badge) {
    runtimeStatusElements.badge.textContent = viewModel.stateText;
    runtimeStatusElements.badge.className = `px-2 py-0.5 rounded text-xs ${viewModel.stateClassName}`;
  }
  if (runtimeStatusElements.platform) {
    runtimeStatusElements.platform.textContent = viewModel.platformText;
  }
  if (runtimeStatusElements.lastExtract) {
    runtimeStatusElements.lastExtract.textContent = viewModel.lastExtractText;
  }
  if (runtimeStatusElements.lastSave) {
    runtimeStatusElements.lastSave.textContent = viewModel.lastSaveText;
  }
  if (runtimeStatusElements.lastError) {
    runtimeStatusElements.lastError.textContent = viewModel.lastErrorText;
  }
  if (runtimeStatusElements.actionTip) {
    runtimeStatusElements.actionTip.textContent = viewModel.actionTip;
  }
}

function updateEmptyReasonHint(): void {
  const node = runtimeStatusElements.emptySubtitle;
  if (!node) {
    return;
  }

  if (settingsElements.autoSaveToggle && !settingsElements.autoSaveToggle.checked) {
    node.textContent = '自动保存已关闭，请开启后再试，或使用手动保存。';
    return;
  }

  if (!runtimeDiagnostics) {
    node.textContent = '访问支持的 AI 聊天页面开始记录对话';
    return;
  }

  switch (runtimeDiagnostics.state) {
    case 'INJECTED':
      node.textContent = '页面已注入，请发送一轮消息后等待自动保存。';
      break;
    case 'STALE':
      node.textContent = '状态可能过期，请刷新页面后继续对话。';
      break;
    case 'NO_PERMISSION':
      node.textContent = '页面无注入权限，请在扩展详情开启本站访问权限。';
      break;
    case 'NOT_INJECTED':
      node.textContent = '页面未注入，请刷新页面或重新加载扩展。';
      break;
    case 'UNSUPPORTED':
      node.textContent = '当前页面不在支持平台列表中。';
      break;
    default:
      node.textContent = '访问支持的 AI 聊天页面开始记录对话';
      break;
  }
}

async function refreshRuntimeDiagnostics(): Promise<void> {
  if (popupContextInvalidated) {
    return;
  }

  if (!ENABLE_RUNTIME_DIAGNOSTICS) {
    return;
  }

  try {
    const activeTab = await getActiveTab();
    const url = activeTab?.url || '';
    const tabId = activeTab?.id;
    const platform = getPlatformFromUrl(url);
    const injectable = isSupportedPlatformUrl(url);

    let runtimeStatus: TabRuntimeStatus | null = null;
    let pingSuccess = false;
    let pingError: string | undefined;

    if (injectable && typeof tabId === 'number') {
      const statusResponse = await safeSendRuntimeMessage({
        type: 'getTabRuntimeStatus',
        tabId,
      });
      runtimeStatus = extractRuntimeStatus(statusResponse as ChromeMessageResponse<any>);

      if (!runtimeStatus) {
        const pingResult = await pingContentScript(tabId);
        pingSuccess = pingResult.success;
        pingError = pingResult.error;

        if (pingSuccess) {
          const refreshed = await safeSendRuntimeMessage({
            type: 'getTabRuntimeStatus',
            tabId,
          });
          runtimeStatus = extractRuntimeStatus(refreshed as ChromeMessageResponse<any>);
        }
      }
    }

    const viewModel = buildRuntimeDiagnosticsViewModel({
      url,
      platform,
      injectable,
      runtimeStatus,
      pingSuccess,
      pingError,
    });
    runtimeDiagnostics = viewModel;
    renderRuntimeDiagnostics(viewModel);
    updateEmptyReasonHint();
  } catch (error) {
    logPopupError('刷新运行态诊断', error);
  }
}

// ============================================================================
// 初始化
// ============================================================================

/**
 * 初始化弹窗
 */
export function initPopup() {
  Logger.info('[Popup] 初始化弹窗');

  try {
    installPopupGlobalErrorGuard((error) => {
      handleContextInvalidated('全局异常', error);
    });
    getRefreshQueue();

    // 初始化国际化
    I18n.initPageI18n();
    void initializeFirstOpenOverlay();

    // 兼容旧版 DOM：确保 About 区域不出现 Official Site 入口
    removeLegacyOfficialSiteEntry();

    // 设置版本号
    setVersionNumber();
    renderSupportedPlatforms();

    // 初始化设置管理
    initializeSettingsManagement();

    // 初始化筛选功能（模块状态 + UI 事件）
    initializeSearchFilterModule();
    initializeFilterUI();

    // 初始化记忆列表
    initializeMemoriesList();
    if (ENABLE_RUNTIME_DIAGNOSTICS) {
      enqueueRefresh('refreshRuntimeDiagnostics');
    }
    void selectInitialTab();

    // 初始化详情页
    initializeConversationDetail();
    initializeSnippetDetail();

    // 监听存储变化
    setupStorageChangeListener();

    // 监听后台消息
    setupMessageListeners();

    // 监听页面可见性变化
    setupVisibilityChangeListener();

    // 监听自定义事件
    setupCustomEventListeners();

    Logger.info('[Popup] 弹窗初始化完成');
  } catch (error) {
    logPopupError('弹窗初始化', error);
  }
}

/**
 * 设置版本号显示
 */
function setVersionNumber() {
  try {
    const manifest = chrome.runtime.getManifest();
    const version = manifest.version || '1.0.0';

    const versionElement = document.getElementById('version-number');
    if (versionElement) {
      versionElement.textContent = version;
    }
  } catch (error) {
    logPopupError('获取版本号', error);
  }
}

async function selectInitialTab(): Promise<void> {
  try {
    const activeTab = await getActiveTab();
    const mode = getPageCaptureMode(activeTab?.url || '');
    if (mode === 'generic_web') {
      switchTab('snippets');
      return;
    }
    switchTab('memories');
  } catch (error) {
    logPopupError('选择默认标签页', error);
  }
}

/**
 * 初始化设置管理
 */
function initializeSettingsManagement() {
  Logger.debug('[Popup] 初始化设置管理');

  initializeSettingsInteractions();

  // 首次打开加载设置，默认自动保存开启
  loadSettings();
  enqueueRefresh('refreshLocalStoreStatus');

  // 注册自动保存开关监听
  if (settingsElements.autoSaveToggle) {
    settingsElements.autoSaveToggle.addEventListener(
      'change',
      handleAutoSaveToggleChange
    );
  }
  bindWebCaptureToggleEvents();

  // 注册导出按钮监听
  if (settingsElements.exportBtn) {
    settingsElements.exportBtn.addEventListener('click', handleExportButtonClick);
  }

  // 注册清空按钮监听
  if (settingsElements.clearBtn) {
    settingsElements.clearBtn.addEventListener('click', handleClearButtonClick);
  }

  // 创建导出按钮下拉菜单（可选）
  createExportDropdown();

  Logger.debug('[Popup] 设置管理已初始化');
}

/**
 * 初始化记忆列表
 */
function initializeMemoriesList() {
  Logger.debug('[Popup] 初始化记忆列表');

  // 注册标签切换监听
  const tabMemories = document.getElementById('tab-memories');
  const tabSnippets = document.getElementById('tab-snippets');
  const tabSettings = document.getElementById('tab-settings');

  if (tabMemories) {
    tabMemories.addEventListener('click', () => switchTab('memories'));
  }

  if (tabSnippets) {
    tabSnippets.addEventListener('click', () => switchTab('snippets'));
  }

  if (tabSettings) {
    tabSettings.addEventListener('click', () => switchTab('settings'));
  }

  // 注册返回列表按钮监听（详情页）
  const backBtn = document.getElementById('back-to-list');
  if (backBtn) {
    backBtn.addEventListener('click', backToList);
  }

  // 初始化数据
  enqueueRefresh('refreshConversations');
  enqueueRefresh('refreshSnippets');

  Logger.debug('[Popup] 记忆列表已初始化');
}

/**
 * 初始化筛选功能
 */
function initializeFilterUI() {
  Logger.debug('[Popup] 初始化筛选功能');

  setFilteredConversationsRenderer(() => {
    renderCurrentConversationList();
  });

  // 搜索相关
  if (searchElements.searchInput) {
    searchElements.searchInput.addEventListener('input', (event) => {
      const target = event.target as HTMLInputElement | null;
      handleSearchInput(target?.value || '');
    });
  }

  if (searchElements.clearSearch) {
    searchElements.clearSearch.addEventListener('click', clearSearchInput);
  }

  if (searchElements.filterToggle) {
    searchElements.filterToggle.addEventListener('click', () => {
      toggleFilterDropdown();
      refreshPlatformOptionState();
    });
  }

  if (searchElements.applyFilter) {
    searchElements.applyFilter.addEventListener('click', () => {
      applyFilter();
    });
  }

  if (searchElements.clearFilter) {
    searchElements.clearFilter.addEventListener('click', () => {
      clearFilter();
      applyFilter();
      refreshPlatformOptionState();
    });
  }

  if (searchElements.dateWeek) {
    searchElements.dateWeek.addEventListener('click', () => {
      handleDateQuickOptions(7);
      applyFilter();
    });
  }

  if (searchElements.dateMonth) {
    searchElements.dateMonth.addEventListener('click', () => {
      handleDateQuickOptions(30);
      applyFilter();
    });
  }

  if (searchElements.platformTagsContainer) {
    searchElements.platformTagsContainer.addEventListener('click', () => {
      if (searchElements.platformDropdownMenu) {
        searchElements.platformDropdownMenu.classList.toggle('hidden');
      }
    });
  }

  renderPlatformFilterOptions();

  // 多选切换
  const multiSelectToggle = document.getElementById('multi-select-toggle');
  if (multiSelectToggle) {
    multiSelectToggle.addEventListener('click', toggleMultiSelectMode);
  }

  // 导出筛选结果
  const exportFilteredMerged = document.getElementById('export-filtered-merged');
  if (exportFilteredMerged) {
    exportFilteredMerged.addEventListener('click', () => {
      void handleExportFilteredConversations({ exportType: 'merged' });
    });
  }

  const exportFilteredSeparate = document.getElementById('export-filtered-separate');
  if (exportFilteredSeparate) {
    exportFilteredSeparate.addEventListener('click', () => {
      void handleExportFilteredConversations({ exportType: 'separate' });
    });
  }

  const exportFilteredBtn = document.getElementById('export-filtered-btn');
  if (exportFilteredBtn) {
    exportFilteredBtn.addEventListener('click', (event) => {
      event.preventDefault();
      toggleFilteredExportDropdown();
    });
  }

  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    if (!target) {
      return;
    }

    const exportDropdown = document.getElementById('export-filtered-dropdown');
    if (exportDropdown && !exportDropdown.classList.contains('hidden')) {
      const exportBtn = document.getElementById('export-filtered-btn');
      const inExportArea =
        exportDropdown.contains(target) || (exportBtn ? exportBtn.contains(target) : false);
      if (!inExportArea) {
        exportDropdown.classList.add('hidden');
      }
    }

    if (searchElements.platformDropdownMenu && !searchElements.platformDropdownMenu.classList.contains('hidden')) {
      const inPlatformArea =
        searchElements.platformDropdownMenu.contains(target) ||
        (searchElements.platformTagsContainer
          ? searchElements.platformTagsContainer.contains(target)
          : false);
      if (!inPlatformArea) {
        searchElements.platformDropdownMenu.classList.add('hidden');
      }
    }
  });

  Logger.debug('[Popup] 筛选功能已初始化');
}

/**
 * 初始化对话详情
 */
function initializeConversationDetail() {
  Logger.debug('[Popup] 初始化对话详情');

  const editBtn = conversationDetailElements.editTitle;
  const titleInput = conversationDetailElements.detailTitleInput as HTMLInputElement | null;
  const moreActionsBtn = conversationDetailElements.moreActions;
  const dropdown = conversationDetailElements.moreActionsDropdown;

  if (editBtn) {
    editBtn.addEventListener('click', () => {
      if (titleInput && !titleInput.classList.contains('hidden')) {
        saveInlineEdit();
      } else {
        startInlineEdit();
      }
    });
  }

  if (titleInput) {
    titleInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        saveInlineEdit();
      } else if (event.key === 'Escape') {
        cancelInlineEdit();
      }
    });
    titleInput.addEventListener('blur', () => {
      if (!titleInput.classList.contains('hidden')) {
        saveInlineEdit();
      }
    });
  }

  if (moreActionsBtn && dropdown) {
    moreActionsBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      dropdown.classList.toggle('hidden');
    });

    document.addEventListener('click', (event) => {
      const target = event.target as HTMLElement | null;
      if (!target) {
        return;
      }
      if (!dropdown.classList.contains('hidden')) {
        const clickedInside =
          dropdown.contains(target) || moreActionsBtn.contains(target);
        if (!clickedInside) {
          hideMoreActionsDropdown();
        }
      }
    });
  }

  if (conversationDetailElements.openOriginal) {
    conversationDetailElements.openOriginal.addEventListener('click', () => {
      openOriginalPage();
    });
  }

  if (conversationDetailElements.copyConversation) {
    conversationDetailElements.copyConversation.addEventListener('click', () => {
      copyCurrentConversation();
    });
  }

  if (conversationDetailElements.deleteConversationDetail) {
    conversationDetailElements.deleteConversationDetail.addEventListener('click', () => {
      deleteCurrentConversation();
    });
  }

  // 初始化状态同步
  syncDetailPageState();

  Logger.debug('[Popup] 对话详情已初始化');
}

function initializeSnippetDetail() {
  snippetsListElements.saveCurrentPage?.addEventListener('click', () => {
    void handleSaveCurrentPageSnippet();
  });

  snippetsListElements.toggleMergeMode?.addEventListener('click', () => {
    toggleSnippetSelectionMode();
  });

  snippetsListElements.mergeSelected?.addEventListener('click', () => {
    void mergeSelectedSnippets();
  });

  snippetDetailElements.back?.addEventListener('click', () => {
    hideSnippetDetail();
    switchTab('snippets');
  });

  snippetDetailElements.openOriginal?.addEventListener('click', () => {
    openCurrentSnippetOriginalPage();
  });

  snippetDetailElements.openSavedCopy?.addEventListener('click', () => {
    openCurrentSnippetSavedCopy();
  });

  snippetDetailElements.rebuildBtn?.addEventListener('click', () => {
    void rebuildCurrentTabHighlights();
  });

  snippetDetailElements.deleteBtn?.addEventListener('click', () => {
    const snippet = getCurrentSnippet();
    if (!snippet) {
      return;
    }
    void deleteSnippetById(snippet.id);
  });

  snippetFilterElements.searchInput?.addEventListener('input', (event) => {
    const target = event.target as HTMLInputElement | null;
    updateSnippetFilters({
      query: target?.value || '',
    });
  });

  snippetFilterElements.typeSelect?.addEventListener('change', (event) => {
    const target = event.target as HTMLSelectElement | null;
    updateSnippetFilters({
      type: (target?.value || 'all') as SnippetFilterType,
    });
  });

  snippetFilterElements.sourceSelect?.addEventListener('change', (event) => {
    const target = event.target as HTMLSelectElement | null;
    updateSnippetFilters({
      source: (target?.value || 'all') as SnippetFilterSource,
    });
  });

  snippetFilterElements.dateSelect?.addEventListener('change', (event) => {
    const target = event.target as HTMLSelectElement | null;
    updateSnippetFilters({
      dateRange: (target?.value || 'all') as SnippetFilterDate,
    });
  });

  syncSnippetFilterUI();
  updateSnippetMergeControls();
}

/**
 * 同步详情页状态
 */
function syncDetailPageState() {
  const detailPage = document.getElementById('conversation-detail');
  const memoriesTab = document.getElementById('tab-memories');

  if (!detailPage || !memoriesTab) {
    return;
  }

  const isDetailVisible = !detailPage.classList.contains('hidden');

  if (!isDetailVisible) {
    Logger.debug('[Popup] 详情页隐藏，无需同步');
    return;
  }

  // 详情页可见，标签页隐藏 - 说明用户在详情页
  if (!memoriesTab.classList.contains('active')) {
    Logger.debug('[Popup] 标签页未激活');
    return;
  }

  Logger.debug('[Popup] 同步详情页状态');
}

// ============================================================================
// 存储变化监听
// ============================================================================

/**
 * 设置存储变化监听
 */
function setupStorageChangeListener() {
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.sidebar_refresh_trigger) {
      Logger.info('[Popup] 检测到存储变化');

      // 刷新列表数据
      enqueueRefresh('refreshConversations');
      enqueueRefresh('refreshSnippets');

      // 刷新存储使用情况
      enqueueRefresh('refreshStorageStats');
      enqueueRefresh('refreshLocalStoreStatus');

      // 如果当前在详情页，也刷新详情页
      refreshDetailPageIfActive();
    }
  });
}

// ============================================================================
// 后台消息监听
// ============================================================================

/**
 * 设置后台消息监听
 */
function setupMessageListeners() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const messageType = message?.type;
    Logger.debug('[Popup] 收到后台消息:', messageType);

    const asyncHandlers: Record<string, (m: any, r: (resp: any) => void) => Promise<void>> = {
      manualSave: handleManualSave,
      toggleSidebar: handleToggleSidebar,
      exportConversations: handleExportConversations,
    };

    const notificationHandlers: Record<string, (m: any, r: (resp: any) => void) => void> = {
      settingsUpdated: handleSettingsUpdated,
    };

    const handler = typeof messageType === 'string' ? asyncHandlers[messageType] : undefined;
    const notificationHandler =
      typeof messageType === 'string' ? notificationHandlers[messageType] : undefined;
    const decision = popupMessageRouter.classify(messageType, Boolean(handler));

    if (decision.kind === 'notification' && notificationHandler) {
      notificationHandler(message, sendResponse);
      return false;
    }

    if (decision.kind === 'handled' && handler) {
      void handler(message, sendResponse);
      return true;
    }

    if (decision.kind === 'unknown' && decision.shouldLogUnknown) {
      Logger.debug('[Popup] 未识别消息类型（采样日志）:', messageType);
    }

    return false;
  });
}

/**
 * 处理获取所有对话
 */
async function handleGetAllConversations(
  message: any,
  sendResponse: (response: any) => void
): Promise<void> {
  try {
    const response = await safeSendRuntimeMessage<unknown, Conversation[]>({
      type: 'getAllConversations',
    });
    const conversations = extractConversationsFromResponse(response);

    cachedConversations = conversations;
    setAllConversations(conversations);
    renderCurrentConversationList();

    sendResponse({ status: 'ok', conversations });
  } catch (error) {
    logPopupError('获取对话列表', error);
    sendResponse({
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * 处理设置更新
 */
function handleSettingsUpdated(
  message: any,
  sendResponse: (response: any) => void
): void {
  if (message.settings) {
    updateUI(message.settings);
    enqueueRefresh('refreshLocalStoreStatus');
    enqueueRefresh('refreshStorageStats');
  }

  sendResponse({ status: 'ok' });
}

/**
 * 处理获取设置
 */
async function handleGetSettings(
  message: any,
  sendResponse: (response: any) => void
): Promise<void> {
  try {
    const result = await safeSendRuntimeMessage({
      type: 'getSettings',
    });

    if (result.settings) {
      updateUI(result.settings);
      enqueueRefresh('refreshLocalStoreStatus');
      enqueueRefresh('refreshStorageStats');
    }

    sendResponse(result);
  } catch (error) {
    logPopupError('获取设置', error);
    sendResponse({ status: 'error', error: getErrorMessage(error) });
  }
}

/**
 * 处理手动保存
 */
async function handleManualSave(
  message: any,
  sendResponse: (response: any) => void
): Promise<void> {
  try {
    if (message.url) {
      // 执行手动保存逻辑
      Logger.info('[Popup] 执行手动保存:', message.url);

      // 可以在这里添加保存动画或通知
      showToast(chrome.i18n.getMessage('saveSuccess') || '已保存', 'success');
    }
  } catch (error) {
    logPopupError('手动保存', error);
  }

  sendResponse({ status: 'ok' });
}

/**
 * 处理切换侧边栏
 */
async function handleToggleSidebar(
  message: any,
  sendResponse: (response: any) => void
): Promise<void> {
  try {
    Logger.info('[Popup] 切换侧边栏');

    await safeSendRuntimeMessage({
      type: 'toggleSidebar',
    });

    sendResponse({ status: 'ok' });
  } catch (error) {
    logPopupError('切换侧边栏', error);
    sendResponse({ status: 'error', error: getErrorMessage(error) });
  }
}

/**
 * 处理导出对话
 */
async function handleExportConversations(
  message: any,
  sendResponse: (response: any) => void
): Promise<void> {
  try {
    Logger.info('[Popup] 导出对话:', message.exportType);

    // 触发导出事件到记忆列表模块处理
    window.dispatchEvent(
      new CustomEvent('export-conversations', {
        detail: message.detail,
      })
    );

    sendResponse({ status: 'ok' });
  } catch (error) {
    logPopupError('导出对话', error);
    sendResponse({ status: 'error', error: getErrorMessage(error) });
  }
}

// ============================================================================
// 页面可见性变化监听
// ============================================================================

/**
 * 设置页面可见性变化监听
 */
function setupVisibilityChangeListener() {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      Logger.debug('[Popup] 弹窗变为可见');

      // 如果当前在记忆列表页面，刷新列表
      if (
        memoriesListElements.memoriesContent &&
        memoriesListElements.memoriesContent.classList.contains('active')
      ) {
        enqueueRefresh('refreshConversations');
      }

      if (
        snippetsListElements.snippetsContent &&
        snippetsListElements.snippetsContent.classList.contains('active')
      ) {
        enqueueRefresh('refreshSnippets');
      }

      // 刷新存储存储使用情况
      enqueueRefresh('refreshStorageStats');
      enqueueRefresh('refreshLocalStoreStatus');
      if (ENABLE_RUNTIME_DIAGNOSTICS) {
        enqueueRefresh('refreshRuntimeDiagnostics');
      }

      // 如果当前在详情页，也刷新详情页
      refreshDetailPageIfActive();
    }
  });
}

// ============================================================================
// 自定义事件监听
// ============================================================================

/**
 * 设置自定义事件监听
 */
function setupCustomEventListeners() {
  // 对话详情事件
  document.addEventListener('show-conversation', (event) => {
    const detailEvent = event as CustomEvent;
    handleShowConversation(detailEvent.detail);
  });

  document.addEventListener('edit-conversation', (event) => {
    const editEvent = event as CustomEvent;
    handleEditConversation(editEvent.detail);
  });

  document.addEventListener('delete-conversation', (event) => {
    const deleteEvent = event as CustomEvent;
    handleDeleteConversation(deleteEvent.detail);
  });

  document.addEventListener('show-snippet', (event) => {
    const snippetEvent = event as CustomEvent<{ snippetId?: string; snippet?: Snippet }>;
    const snippetId = snippetEvent.detail?.snippetId || snippetEvent.detail?.snippet?.id;
    if (!snippetId) {
      return;
    }
    void openSnippetDetailById(snippetId);
  });

  document.addEventListener('toggle-snippet-selection', (event) => {
    const selectionEvent = event as CustomEvent<{ snippetId?: string }>;
    const snippetId = selectionEvent.detail?.snippetId;
    if (!snippetSelectionMode || !snippetId) {
      return;
    }

    if (selectedSnippetIds.has(snippetId)) {
      selectedSnippetIds.delete(snippetId);
      snippetSelectionOrder = snippetSelectionOrder.filter((id) => id !== snippetId);
    } else {
      selectedSnippetIds.add(snippetId);
      snippetSelectionOrder.push(snippetId);
    }

    updateSnippetMergeControls();
    renderCurrentSnippetList();
  });

  document.addEventListener('focus-snippet-item', (event) => {
    const focusEvent = event as CustomEvent<{ itemId?: string }>;
    const itemId = focusEvent.detail?.itemId;
    if (!itemId) {
      return;
    }
    void focusSnippetItemInActiveTab(itemId);
  });

  document.addEventListener('delete-snippet-item', (event) => {
    const deleteEvent = event as CustomEvent<{ itemId?: string }>;
    const itemId = deleteEvent.detail?.itemId;
    if (!itemId) {
      return;
    }
    void deleteSnippetItemById(itemId);
  });

  // 切换多选模式
  document.addEventListener('toggle-multi-select', () => {
    toggleMultiSelectMode();
  });

  document.addEventListener('toggle-conversation-selection', (event) => {
    const selectionEvent = event as CustomEvent<{ conversationId?: string }>;
    const conversationId = selectionEvent.detail?.conversationId;
    if (!conversationId) {
      return;
    }

    if (selectedConversationIds.has(conversationId)) {
      selectedConversationIds.delete(conversationId);
    } else {
      selectedConversationIds.add(conversationId);
    }
    renderCurrentConversationList();
  });

  // 导出筛选结果
  document.addEventListener('export-filtered-conversations', (event) => {
    const exportEvent = event as CustomEvent;
    void handleExportFilteredConversations(exportEvent.detail);
  });

  document.addEventListener('export-all-conversations', () => {
    void handleExportFilteredConversations({
      exportType: 'separate',
      scope: 'all',
    });
  });

  document.addEventListener('copy-current-conversation', (event) => {
    const copyEvent = event as CustomEvent<Conversation>;
    const conversation = copyEvent.detail;
    if (!conversation) {
      return;
    }
    void copyConversationToClipboard(conversation);
  });

  // 清空存储
  document.addEventListener('show-clear-confirm', () => {
    void handleClearStorage();
  });
}

/**
 * 处理显示对话事件
 */
function handleShowConversation(detail: any): void {
  if (!detail || !detail.conversation) {
    return;
  }

  renderConversationDetail(detail.conversation);
}

/**
 * 处理编辑对话事件
 */
function handleEditConversation(detail: any): void {
  if (!detail || !detail.conversationId) {
    return;
  }

  const newTitle = prompt(
    chrome.i18n.getMessage('editConversationTitle') || '编辑标题',
    detail.title || ''
  );
  if (!newTitle || !newTitle.trim() || newTitle.trim() === detail.title) {
    return;
  }

  void updateConversationTitle(detail.conversationId, newTitle.trim());
}

/**
 * 处理删除对话事件
 */
function handleDeleteConversation(detail: any): void {
  if (!detail || !detail.conversationId) {
    return;
  }

  showDeleteModal(detail.conversationId, detail.title);
}

// ============================================================================
// 标签切换
// ============================================================================

/**
 * 切换标签页
 */
function switchTab(tabName: 'memories' | 'snippets' | 'settings'): void {
  Logger.debug(`[Popup] 切换标签页: ${tabName}`);

  const tabs = document.querySelectorAll('.sidebar-btn');
  const contents = document.querySelectorAll('.tab-content');

  // 隐藏详情页
  if (conversationDetailElements.conversationDetail) {
    conversationDetailElements.conversationDetail.classList.add('hidden');
  }
  hideSnippetDetail();
  if (tabName !== 'snippets' && snippetSelectionMode) {
    toggleSnippetSelectionMode(false);
  }

  // 更新标签按钮样式
  tabs.forEach((tab) => {
    if (tab.id === `tab-${tabName}`) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });

  // 更新内容显示
  contents.forEach((content) => {
    if (content.id === `${tabName}-content`) {
      content.classList.add('active');
      content.classList.remove('hidden');
    } else {
      content.classList.remove('active');
      content.classList.add('hidden');
    }
  });

  // 显示主导航和概览（从详情页返回时时）
  const dataOverview = document.querySelector('header');
  if (dataOverview && tabName !== 'settings') {
    dataOverview.classList.remove('hidden');
  }

  // 如果切换到记忆列表，刷新数据
  if (tabName === 'memories') {
    enqueueRefresh('refreshConversations');
    enqueueRefresh('refreshStorageStats');
  } else if (tabName === 'snippets') {
    enqueueRefresh('refreshSnippets');
  }
}

// ============================================================================
// 列表数据加载与本地操作（T02 最小实现）
// ============================================================================

function extractConversationsFromResponse(
  response: ChromeMessageResponse<Conversation[]>
): Conversation[] {
  if (Array.isArray(response)) {
    return response as unknown as Conversation[];
  }
  if (Array.isArray(response?.conversations)) {
    return response.conversations as Conversation[];
  }
  if (Array.isArray(response?.data)) {
    return response.data as Conversation[];
  }
  return [];
}

function renderCurrentConversationList(): void {
  const conversations = getFilteredConversations();

  if (!conversations.length) {
    showEmpty();
    updateEmptyReasonHint();
    return;
  }

  hideEmpty();
  showList();
  renderConversationCards({
    conversations,
    isMultiSelectMode,
    selectedConversationIds,
  });
}

function syncSnippetFilterUI(): void {
  if (snippetFilterElements.searchInput) {
    snippetFilterElements.searchInput.value = snippetFilterState.query;
  }
  if (snippetFilterElements.typeSelect) {
    snippetFilterElements.typeSelect.value = snippetFilterState.type;
  }
  if (snippetFilterElements.sourceSelect) {
    snippetFilterElements.sourceSelect.value = snippetFilterState.source;
  }
  if (snippetFilterElements.dateSelect) {
    snippetFilterElements.dateSelect.value = snippetFilterState.dateRange;
  }
}

function renderCurrentSnippetList(): void {
  const snippets = getFilteredSnippets();
  if (!snippets.length) {
    showSnippetsEmpty();
    updateSnippetMergeControls();
    return;
  }

  showSnippetsList();
  renderSnippetCards(snippets, {
    selectionMode: snippetSelectionMode,
    selectedSnippetIds,
  });
  updateSnippetMergeControls();
}

function updateSnippetFilters(partial: Partial<SnippetFilterState>): void {
  snippetFilterState = {
    ...snippetFilterState,
    ...partial,
  };
  syncSnippetFilterUI();
  renderCurrentSnippetList();
}

function getFilteredSnippets(): Snippet[] {
  return filterSnippets(cachedSnippets, snippetFilterState);
}

function clearSnippetSelection(): void {
  selectedSnippetIds.clear();
  snippetSelectionOrder = [];
}

function toggleSnippetSelectionMode(force?: boolean): void {
  snippetSelectionMode = typeof force === 'boolean' ? force : !snippetSelectionMode;
  if (!snippetSelectionMode) {
    clearSnippetSelection();
  }
  updateSnippetMergeControls();
  renderCurrentSnippetList();
}

function getSelectedMergeCandidateSnippets(): Snippet[] {
  return snippetSelectionOrder
    .map((id) => cachedSnippets.find((snippet) => snippet.id === id))
    .filter((snippet): snippet is Snippet => Boolean(snippet && selectedSnippetIds.has(snippet.id)));
}

function canMergeSelectedSnippets(): boolean {
  const selected = getSelectedMergeCandidateSnippets();
  if (selected.length < 2) {
    return false;
  }

  const [first] = selected;
  return selected.every((snippet) => {
    return (
      snippet.type === 'highlight' &&
      snippet.url === first.url &&
      snippet.sourceKind === first.sourceKind
    );
  });
}

function updateSnippetMergeControls(): void {
  if (snippetsListElements.toggleMergeMode) {
    snippetsListElements.toggleMergeMode.textContent = snippetSelectionMode ? '取消选择' : '选择合并';
    snippetsListElements.toggleMergeMode.className = snippetSelectionMode
      ? 'px-3 py-2 text-xs font-medium bg-amber-100 text-amber-800 rounded-lg hover:bg-amber-200 transition-colors'
      : 'px-3 py-2 text-xs font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors';
  }

  const mergeEnabled = canMergeSelectedSnippets();
  if (snippetsListElements.mergeSelected) {
    snippetsListElements.mergeSelected.disabled = !mergeEnabled;
    snippetsListElements.mergeSelected.classList.toggle('opacity-50', !mergeEnabled);
    snippetsListElements.mergeSelected.classList.toggle('cursor-not-allowed', !mergeEnabled);
    snippetsListElements.mergeSelected.textContent = snippetSelectionMode
      ? `合并所选${selectedSnippetIds.size ? ` (${selectedSnippetIds.size})` : ''}`
      : '合并所选';
  }

  if (snippetsListElements.mergeHint) {
    snippetsListElements.mergeHint.classList.toggle('hidden', !snippetSelectionMode);
  }
}

async function getActiveTabIfAvailable(): Promise<chrome.tabs.Tab | null> {
  try {
    return await getActiveTab();
  } catch (error) {
    logPopupError('获取当前标签页', error);
    return null;
  }
}

async function rebuildCurrentTabHighlights(silent = false): Promise<void> {
  const activeTab = await getActiveTabIfAvailable();
  if (!activeTab?.id) {
    return;
  }

  try {
    await chrome.tabs.sendMessage(activeTab.id, { type: 'rebuildSnippetHighlights' });
    if (!silent) {
      showToast('已重新恢复页面高光', 'success');
    }
  } catch (error) {
    logPopupError('恢复页面高光', error);
  }
}

async function focusSnippetItemInActiveTab(itemId: string): Promise<void> {
  const activeTab = await getActiveTabIfAvailable();
  if (!activeTab?.id) {
    return;
  }

  try {
    await chrome.tabs.sendMessage(activeTab.id, { type: 'focusSnippetItem', itemId });
  } catch (error) {
    logPopupError('定位片段高光', error);
  }
}

async function openSnippetDetailById(id: string): Promise<void> {
  try {
    const response = await safeSendRuntimeMessage({
      type: 'getSnippetGroupById',
      id,
    });
    const detail = extractSnippetDetailResponse(response as ChromeMessageResponse<any>);
    if (!detail) {
      return;
    }

    hideSnippetDetail();
    renderSnippetDetail(detail);
    document.querySelectorAll('.tab-content').forEach((tab) => {
      if (tab.id !== 'snippet-detail') {
        tab.classList.add('hidden');
        tab.classList.remove('active');
      }
    });
  } catch (error) {
    logPopupError('加载片段详情', error);
  }
}

async function loadConversations(): Promise<void> {
  if (popupContextInvalidated) {
    return;
  }

  showLoading();

  try {
    const response = await safeSendRuntimeMessage<unknown, Conversation[]>({
      type: 'getAllConversations',
    });
    const conversations = extractConversationsFromResponse(response).sort((a, b) => {
      const aTime = new Date(a.updatedAt || a.createdAt).getTime();
      const bTime = new Date(b.updatedAt || b.createdAt).getTime();
      return bTime - aTime;
    });
    cachedConversations = conversations;
    setAllConversations(conversations);
    setAllConversationsForFilter(conversations);
    applyFilter();
    renderCurrentConversationList();
    enqueueRefresh('refreshStorageStats');
    if (ENABLE_RUNTIME_DIAGNOSTICS) {
      enqueueRefresh('refreshRuntimeDiagnostics');
    }
  } catch (error) {
    logPopupError('加载对话', error);
    showEmpty();
    updateEmptyReasonHint();
  } finally {
    hideLoading();
  }
}

async function loadSnippets(): Promise<void> {
  if (popupContextInvalidated) {
    return;
  }

  showSnippetsLoading();

  try {
    const response = await safeSendRuntimeMessage<unknown, { snippets?: Snippet[] }>({
      type: 'getAllSnippets',
    });
    const snippets = extractSnippetsFromResponse(response).sort((a, b) => {
      const aTime = new Date(a.updatedAt || a.createdAt).getTime();
      const bTime = new Date(b.updatedAt || b.createdAt).getTime();
      return bTime - aTime;
    });
    cachedSnippets = snippets;
    Array.from(selectedSnippetIds).forEach((id) => {
      if (!snippets.some((snippet) => snippet.id === id)) {
        selectedSnippetIds.delete(id);
      }
    });
    snippetSelectionOrder = snippetSelectionOrder.filter((id) => selectedSnippetIds.has(id));
    renderCurrentSnippetList();

    const activeTab = await getActiveTab();
    const url = activeTab?.url || '';
    const captureMode = getPageCaptureMode(url);
    if (snippetsListElements.saveCurrentPage) {
      snippetsListElements.saveCurrentPage.disabled = captureMode === 'unsupported';
      snippetsListElements.saveCurrentPage.classList.toggle('opacity-50', captureMode === 'unsupported');
      snippetsListElements.saveCurrentPage.classList.toggle('cursor-not-allowed', captureMode === 'unsupported');
    }
    if (url) {
      const statusResponse = await safeSendRuntimeMessage({
        type: 'getSnippetStatusForTab',
        url,
      });
      const status = extractSnippetStatus(statusResponse as ChromeMessageResponse<any>);
      updateCurrentPageSnippetStatus(Boolean(status?.hasSnippet));
    } else {
      updateCurrentPageSnippetStatus(false);
    }
  } catch (error) {
    logPopupError('加载片段', error);
    showSnippetsEmpty();
    updateCurrentPageSnippetStatus(false);
  } finally {
    hideSnippetsLoading();
  }
}

async function handleSaveCurrentPageSnippet(): Promise<void> {
  const activeTab = await getActiveTab();
  if (!activeTab?.id || getPageCaptureMode(activeTab.url || '') === 'unsupported') {
    return;
  }

  try {
    await chrome.tabs.sendMessage(activeTab.id, { type: 'capturePageFromContextMenu' });
    showToast(safeGetMessage('saveSuccess', 'Save successful'), 'success');
    window.setTimeout(() => {
      enqueueRefresh('refreshSnippets');
    }, 300);
  } catch (error) {
    logPopupError('保存当前页面片段', error);
  }
}

async function deleteSnippetById(id: string): Promise<void> {
  try {
    const currentDetail = getCurrentSnippetDetail();
    await safeSendRuntimeMessage({
      type: 'deleteSnippet',
      id,
    });
    if (currentDetail?.group.url) {
      await rebuildCurrentTabHighlights(true);
    }
    hideSnippetDetail();
    switchTab('snippets');
    enqueueRefresh('refreshSnippets');
  } catch (error) {
    logPopupError('删除片段', error);
  }
}

async function mergeSelectedSnippets(): Promise<void> {
  if (!canMergeSelectedSnippets()) {
    return;
  }

  const selected = getSelectedMergeCandidateSnippets();
  const [target, ...sources] = selected;
  if (!target || sources.length === 0) {
    return;
  }

  try {
    const response = await safeSendRuntimeMessage({
      type: 'mergeSnippets',
      targetId: target.id,
      sourceIds: sources.map((snippet) => snippet.id),
    });
    const detail = extractSnippetDetailResponse(response as ChromeMessageResponse<any>);

    clearSnippetSelection();
    toggleSnippetSelectionMode(false);
    enqueueRefresh('refreshSnippets');
    await rebuildCurrentTabHighlights(true);
    showToast('已合并选中的 snippets', 'success');

    if (detail) {
      renderSnippetDetail(detail);
      document.querySelectorAll('.tab-content').forEach((tab) => {
        if (tab.id !== 'snippet-detail') {
          tab.classList.add('hidden');
          tab.classList.remove('active');
        }
      });
    }
  } catch (error) {
    logPopupError('合并片段', error);
    showToast('合并失败，请确认选择的是同一页面的高亮记录', 'error');
  }
}

async function deleteSnippetItemById(id: string): Promise<void> {
  try {
    const currentDetail = getCurrentSnippetDetail();
    if (!currentDetail) {
      return;
    }

    await safeSendRuntimeMessage({
      type: 'deleteSnippetItem',
      id,
    });

    await rebuildCurrentTabHighlights(true);
    enqueueRefresh('refreshSnippets');

    const detailResponse = await safeSendRuntimeMessage({
      type: 'getSnippetGroupById',
      id: currentDetail.group.id,
    });
    const detail = extractSnippetDetailResponse(detailResponse as ChromeMessageResponse<any>);
    if (!detail) {
      hideSnippetDetail();
      switchTab('snippets');
      return;
    }

    renderSnippetDetail(detail);
  } catch (error) {
    logPopupError('删除划词条目', error);
  }
}

function toggleFilteredExportDropdown(): void {
  const dropdown = document.getElementById('export-filtered-dropdown');
  if (!dropdown) {
    return;
  }
  dropdown.classList.toggle('hidden');
}

function toggleMultiSelectMode(): void {
  isMultiSelectMode = !isMultiSelectMode;
  if (!isMultiSelectMode) {
    selectedConversationIds.clear();
  }
  renderCurrentConversationList();
}

async function handleExportFilteredConversations(detail?: any): Promise<void> {
  try {
    const exportType = detail?.exportType === 'merged' ? 'merged' : 'separate';
    const scope = detail?.scope === 'all' ? 'all' : 'filtered';

    const sourceConversations =
      scope === 'all' ? cachedConversations : getFilteredConversations();
    const exportTarget =
      isMultiSelectMode && selectedConversationIds.size > 0
        ? sourceConversations.filter((conversation) =>
            selectedConversationIds.has(conversation.conversationId)
          )
        : sourceConversations;

    if (!exportTarget.length) {
      showToast(chrome.i18n.getMessage('noMemoriesSaved') || '没有可导出的记录', 'warning');
      return;
    }

    showToast(chrome.i18n.getMessage('exporting') || '正在导出...', 'info');
    await exportManager.exportConversations({
      conversationIds: exportTarget.map((conversation) => conversation.conversationId),
      format: exportType,
      metadata: {
        exportMode: scope,
        totalCount: exportTarget.length,
        exportedAt: new Date().toISOString(),
      },
      buttonElement: settingsElements.exportBtn || undefined,
    });
  } catch (error) {
    logPopupError('导出筛选对话', error);
    showToast('导出失败，请重试', 'error');
  }
}

async function handleClearStorage(): Promise<void> {
  const confirmed = confirm(
    chrome.i18n.getMessage('clearConfirm') || '确定要清空所有聊天记录吗？'
  );
  if (!confirmed) {
    return;
  }

  try {
    const response = await safeSendRuntimeMessage({ type: 'clearStorage' });

    if (response?.status === 'ok') {
      cachedConversations = [];
      setAllConversations([]);
      setAllConversationsForFilter([]);
      renderCurrentConversationList();
      refreshStorageUsageDisplay();
      showToast(chrome.i18n.getMessage('clearSuccess') || '已清空', 'success');
    } else {
      Logger.error('[Popup] 清空存储失败:', response);
      showToast(chrome.i18n.getMessage('clearFailed') || '清空失败', 'error');
    }
  } catch (error) {
    logPopupError('清空存储', error);
    showToast(chrome.i18n.getMessage('clearFailed') || '清空失败', 'error');
  }
}

// ============================================================================
// 辅助函数
// ============================================================================

function renderPlatformFilterOptions(): void {
  if (!searchElements.platformDropdownMenu) {
    return;
  }

  searchElements.platformDropdownMenu.innerHTML = FILTER_PLATFORMS.map(
    (platform) => `
      <button
        class="platform-filter-option w-full text-left px-3 py-2 text-xs hover:bg-gray-50 transition-colors flex items-center justify-between"
        data-platform="${platform.id}"
      >
        <span>${platform.label}</span>
        <i class="fas fa-check text-blue-500 hidden"></i>
      </button>
    `
  ).join('');

  searchElements.platformDropdownMenu
    .querySelectorAll<HTMLElement>('.platform-filter-option')
    .forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        const platform = button.dataset.platform as Conversation['platform'] | undefined;
        if (!platform) {
          return;
        }
        togglePlatformSelection(platform);
        refreshPlatformOptionState();
        applyFilter();
      });
    });

  refreshPlatformOptionState();
}

function refreshPlatformOptionState(): void {
  const selectedPlatforms = getCurrentFilter().platforms;
  if (!searchElements.platformDropdownMenu) {
    return;
  }

  searchElements.platformDropdownMenu
    .querySelectorAll<HTMLElement>('.platform-filter-option')
    .forEach((button) => {
      const icon = button.querySelector('i');
      const platform = button.dataset.platform as Conversation['platform'] | undefined;
      const selected = !!platform && selectedPlatforms.has(platform);
      button.classList.toggle('bg-blue-50', selected);
      if (icon) {
        icon.classList.toggle('hidden', !selected);
      }
    });
}

async function updateConversationTitle(
  conversationId: string,
  title: string
): Promise<void> {
  try {
    const target = cachedConversations.find(
      (conversation) => conversation.conversationId === conversationId
    );
    if (!target) {
      return;
    }

    const response = await safeSendRuntimeMessage({
      type: 'updateConversation',
      conversation: {
        ...target,
        title,
      },
    });

    if (response?.status !== 'error') {
      await loadConversations();
    } else {
      showToast(chrome.i18n.getMessage('saveFailed') || '保存失败，请重试', 'error');
    }
  } catch (error) {
    logPopupError('更新对话标题', error);
    showToast(chrome.i18n.getMessage('saveFailed') || '保存失败，请重试', 'error');
  }
}

async function deleteConversationById(
  conversationId: string,
  title?: string
): Promise<void> {
  try {
    const confirmed = confirm(
      (chrome.i18n.getMessage('deleteConfirm') || '确定要删除这个对话吗？') +
        (title ? `\n\n${title}` : '')
    );
    if (!confirmed) {
      return;
    }

    const response = await safeSendRuntimeMessage({
      type: 'deleteConversation',
      conversationId,
    });

    if (response?.status !== 'error') {
      await loadConversations();
      showToast(chrome.i18n.getMessage('deleteSuccess') || '删除成功', 'success');
    } else {
      showToast(chrome.i18n.getMessage('deleteFailed') || '删除失败，请重试', 'error');
    }
  } catch (error) {
    logPopupError('删除对话', error);
    showToast(chrome.i18n.getMessage('deleteFailed') || '删除失败，请重试', 'error');
  }
}

async function copyConversationToClipboard(conversation: Conversation): Promise<void> {
  const text = formatConversationForClipboard(conversation);
  try {
    await navigator.clipboard.writeText(text);
    showToast(chrome.i18n.getMessage('copySuccess') || '已复制', 'success');
  } catch (error) {
    logPopupError('复制', error);
    showToast(chrome.i18n.getMessage('copyFailed') || '复制失败', 'error');
  }
}

function formatConversationForClipboard(conversation: Conversation): string {
  const lines = [
    `# ${conversation.title || 'No Title'}`,
    `${conversation.link || ''}`,
    '',
  ];

  conversation.messages.forEach((message) => {
    const role = message.sender === 'user' ? 'User' : 'Assistant';
    lines.push(`${role}: ${message.content}`);
    if (message.thinking) {
      lines.push(`Thinking: ${message.thinking}`);
    }
    lines.push('');
  });

  return lines.join('\n');
}

/**
 * 导出按钮下拉菜单创建（可选）
 */
function createExportDropdown(): void {
  Logger.debug('[Popup] 创建导出按钮下拉菜单');
  // 原始实现可以稍后添加
}

/**
 * 更新存储使用显示
 */
function refreshStorageStats(): void {
  refreshStorageUsageDisplay();
}

/**
 * 显示Toast 通知
 */
function showToast(message: string, type = 'info', duration = 3000): void {
  // 创建 toast 元素
  const toastContainer = document.getElementById('toast-container');
  if (!toastContainer) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  // 根据类型设置图标
  let icon = '';
  switch (type) {
    case 'success':
      icon = '<i class="fas fa-check"></i>';
      break;
    case 'error':
      icon = '<i class="fas fa-times"></i>';
      break;
    case 'warning':
      icon = '<i class="fas fa-exclamation-triangle"></i>';
      break;
    default:
      icon = '<i class="fas fa-info-circle"></i>';
      break;
  }

  toast.innerHTML = `${icon}<span>${message}</span>`;
  toastContainer.appendChild(toast);

  // 触发显示动画
  setTimeout(() => {
    toast.classList.add('show');
  }, 10);

  // 自动移除
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }, duration);
}

/**
 * 显示删除确认模态框
 */
function showDeleteModal(conversationId: string, title?: string): void {
  Logger.info(`[Popup] 删除对话确认: ${conversationId}`);
  void deleteConversationById(conversationId, title);
}

/**
 * 隐藏删除确认模态框
 */
function hideDeleteModal(): void {
  Logger.debug('[Popup] 隐藏删除确认');
  // 初始化隐藏模态框
}

/**
 * 显示修改标题模态框
 */
function showEditTitleModal(): void {
  Logger.info('[Popup] 显示编辑标题');
  // 初始化编辑模态框
}

/**
 * 隐藏修改标题模态框
 */
function hideEditTitleModal(): void {
  Logger.info('[Popup] 隐藏编辑标题');
}

/**
 * 刷新详情页（如果当前在详情页）
 */
function refreshDetailPageIfActive(): void {
  syncDetailPageState();
}

// ============================================================================
// 页面加载时初始化
// ============================================================================

// 等待 DOM 加载完成后初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPopup);
} else {
  // DOM 已经加载完成，直接初始化
  initPopup();
}

// 声明：此模块作为弹窗页面主入口
// - 协调各子模块（设置、记忆列表、对话详情、搜索筛选）
// - 处理后台消息和自定义事件
// - 提供导出按钮下拉菜单管理（可选）
