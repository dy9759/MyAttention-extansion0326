/**
 * 记忆列表模块
 * 负责对话卡片的渲染、显示和交互
 */

import type { Conversation } from '@/types';
import {
  formatTimestamp,
  formatPlatformName,
  escapeHtml,
  formatTextToHtml,
  highlightSearchTerm,
  highlightSearchTermForDetail,
} from './utils/index';
import { Logger } from '@/core/errors';
import { searchConversations } from './search-filter';
import { safeCreateTab, safeGetMessage } from './chrome-safe';

// ============================================================================
// 常量定义
// ============================================================================

/**
 * 卡片最大摘要长度
 */
const SUMMARY_MAX_LENGTH = 100;

/**
 * 消息内容最大折叠长度
 */
const MESSAGE_COLLAPSE_THRESHOLD = 140;

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 卡片渲染选项
 */
export interface RenderOptions {
  conversations: Conversation[];
  searchTerm?: string;
  isMultiSelectMode?: boolean;
  selectedConversationIds?: Set<string>;
  /** 是否在渲染前清空容器，默认 true */
  clearContainer?: boolean;
}

// ============================================================================
// DOM 元素引用
// ============================================================================

export const elements = {
  /** 列表容器 */
  memoriesContent: document.getElementById('attention-content'),

  /** 加载状态 */
  memoriesLoading: document.getElementById('attention-loading'),

  /** 空状态 */
  memoriesEmpty: document.getElementById('attention-empty'),

  /** 列表 */
  memoriesList: document.getElementById('attention-list'),
};

// ============================================================================
// 状态管理
// ============================================================================

/**
 * 当前对话 ID（用于详情页）
 */
let currentConversationId: string | null = null;

/**
 * 对话缓存（供兼容接口使用）
 */
let allConversations: Conversation[] = [];

/**
 * 获取当前对话 ID
 */
export function getCurrentConversationId(): string | null {
  return currentConversationId;
}

/**
 * 设置当前对话 ID
 */
export function setCurrentConversationId(id: string | null): void {
  currentConversationId = id;
  Logger.debug('[MemoriesList] 设置当前对话 ID:', id);
}

// ============================================================================
// 渲染功能
// ============================================================================

/**
 * 显示加载状态
 */
export function showLoading(): void {
  if (!elements.memoriesLoading) return;
  if (!elements.memoriesEmpty) return;
  if (!elements.memoriesList) return;

  elements.memoriesLoading.classList.remove('hidden');
  elements.memoriesEmpty.classList.add('hidden');
  elements.memoriesList.classList.add('hidden');

  Logger.debug('[MemoriesList] 显示加载状态');
}

/**
 * 隐藏加载状态
 */
export function hideLoading(): void {
  if (!elements.memoriesLoading) return;

  elements.memoriesLoading.classList.add('hidden');

  Logger.debug('[MemoriesList] 隐藏加载状态');
}

/**
 * 显示空状态
 */
export function showEmpty(): void {
  if (!elements.memoriesLoading) return;
  if (!elements.memoriesEmpty) return;
  if (!elements.memoriesList) return;

  elements.memoriesLoading.classList.add('hidden');
  elements.memoriesEmpty.classList.remove('hidden');
  elements.memoriesList.classList.add('hidden');

  Logger.debug('[MemoriesList] 显示空状态');
}

/**
 * 隐藏空状态
 */
export function hideEmpty(): void {
  if (!elements.memoriesEmpty) return;

  elements.memoriesEmpty.classList.add('hidden');

  Logger.debug('[MemoriesList] 隐藏空状态');
}

/**
 * 显示列表
 */
export function showList(): void {
  if (!elements.memoriesList) return;

  elements.memoriesList.classList.remove('hidden');

  Logger.debug('[MemoriesList] 显示列表');
}

/**
 * 隐藏列表
 */
export function hideList(): void {
  if (!elements.memoriesList) return;

  elements.memoriesList.classList.add('hidden');

  Logger.debug('[MemoriesList] 隐藏列表');
}

/**
 * 渲染对话卡片
 */
export function renderConversationCards(options: RenderOptions): void {
  if (!elements.memoriesList) {
    return;
  }

  const {
    conversations,
    searchTerm = '',
    isMultiSelectMode = false,
    selectedConversationIds = new Set<string>(),
  } = options;

  // 清空列表
  const listContainer =
    elements.memoriesList.querySelector('div') || elements.memoriesList;
  if (listContainer && options.clearContainer !== false) {
    listContainer.innerHTML = '';
  }

  // 渲染每个对话卡片
  conversations.forEach((conversation) => {
    const card = createConversationCard(conversation, {
      searchTerm,
      isMultiSelectMode,
      isSelected: selectedConversationIds.has(conversation.conversationId),
    });

    if (card) {
      listContainer.appendChild(card);
    }
  });

  Logger.debug(
    `[MemoriesList] 渲染了 ${conversations.length} 个对话卡片`
  );
}

/**
 * 创建单个对话卡片
 */
function createConversationCard(
  conversation: Conversation,
  options: {
    searchTerm?: string;
    isMultiSelectMode?: boolean;
    isSelected?: boolean;
  } = {}
): HTMLElement | null {
  const {
    searchTerm = '',
    isMultiSelectMode = false,
    isSelected = false,
  } = options;
  const card = document.createElement('div');
  card.className = 'memory-card bg-white p-4 rounded-lg shadow-sm relative';

  // 获取最后一条消息作为摘要
  const lastMessage =
    conversation.messages && conversation.messages.length > 0
      ? conversation.messages[conversation.messages.length - 1]
      : null;

  // 安全处理标题和摘要内容
  const titleText = conversation.title || safeGetMessage('noTitle', 'No Title') || 'No Title';
  let summaryText: string;

  if (searchTerm) {
    // 如果有搜索词，显示搜索命中的片段
    summaryText = findMatchingSnippet(conversation, searchTerm);
  } else {
    // 默认显示最后一条消息的摘要
      summaryText = lastMessage
      ? lastMessage.content.substring(0, SUMMARY_MAX_LENGTH) +
          (lastMessage.content.length > SUMMARY_MAX_LENGTH ? '...' : '')
      : safeGetMessage('noContent', 'No Content') || 'No Content';
  }

  // 如果有搜索词，高亮显示
  const safeTitle = searchTerm
    ? highlightSearchTerm(titleText, searchTerm)
    : escapeHtml(titleText);
  const safeSummary = searchTerm
    ? highlightSearchTerm(summaryText, searchTerm)
    : escapeHtml(summaryText);

  // 构建卡片内容
  if (isMultiSelectMode) {
    card.innerHTML = createMultiSelectLayout({
      conversation,
      safeTitle,
      safeSummary,
      isSelected,
      searchTerm,
    });
  } else {
    card.innerHTML = createNormalLayout({
      conversation,
      safeTitle,
      safeSummary,
      searchTerm,
    });
  }

  // 添加卡片事件监听
  attachCardEvents(card, conversation);

  return card;
}

/**
 * 创建多选模式的布局
 */
function createMultiSelectLayout(params: {
  conversation: Conversation;
  safeTitle: string;
  safeSummary: string;
  isSelected: boolean;
  searchTerm: string;
}): string {
  const { conversation, isSelected } = params;
  const checkboxClass = isSelected
    ? 'btn-brand border-brand'
    : '';

  return `
    <!-- 多选模式下的布局 -->
    <div class="flex gap-3">
      <!-- 圆形选择器 -->
      <div class="flex-shrink-0 mt-0.5">
        <div
          class="multi-select-checkbox w-5 h-5 rounded-full border-2 border-gray-300 flex items-center justify-center cursor-pointer transition-all duration-200 ${checkboxClass}"
          data-conversation-id="${conversation.conversationId}"
          role="checkbox"
        >
          ${isSelected ? '<i class="fas fa-check text-white text-xs"></i>' : ''}
        </div>
      </div>

      <!-- 卡片内容区域 -->
      <div class="flex-1 min-w-0">
        ${createCardContent(params)}
      </div>
    </div>
  `;
}

/**
 * 创建普通模式的布局
 */
function createNormalLayout(params: {
  conversation: Conversation;
  safeTitle: string;
  safeSummary: string;
  searchTerm: string;
}): string {
  const { conversation, safeTitle, safeSummary } = params;
  return `
    <!-- 标题和按钮区域 -->
    <div class="flex items-center justify-between mb-2 gap-2">
      <h3 class="font-medium text-sm truncate flex-1">${safeTitle}</h3>
      <div class="flex items-center gap-1 card-action opacity-0 transition-opacity duration-200 flex-shrink-0">
        <button
          class="edit-title text-gray-400 hover:text-brand p-1 rounded"
          title="${escapeHtml(safeGetMessage('editConversationTitle', 'Edit') || 'Edit')}"
          data-conversation-id="${conversation.conversationId}"
        >
          <i class="fas fa-edit text-xs"></i>
        </button>
        <button
          class="open-original
          text-gray-400 hover:text-brand p-1 rounded"
          title="${escapeHtml(safeGetMessage('openOriginalPage', 'Open') || 'Open')}"
          data-conversation-id="${conversation.conversationId}"
        >
          <i class="fas fa-arrow-up-right-from-square text-xs"></i>
        </button>
        <button
          class="delete-conversation text-gray-400 hover:text-red-500 p-1 rounded"
          title="${escapeHtml(safeGetMessage('delete', 'Delete') || 'Delete')}"
          data-conversation-id="${conversation.conversationId}"
        >
          <i class="fas fa-trash-alt text-xs"></i>
        </button>
      </div>
    </div>

    <!-- 摘要内容 -->
    <p class="text-gray-600 text-sm mb-3 line-clamp-2">
      ${safeSummary}
    </p>

    <!-- 底部信息区域 -->
    ${createFooterContent(conversation)}
  `;
}

/**
 * 创建卡片内容区域
 */
function createCardContent(params: {
  conversation: Conversation;
  safeTitle: string;
  safeSummary: string;
  searchTerm: string;
}): string {
  const { conversation, safeSummary } = params;
  return `
    <!-- 摘要内容 -->
    <p class="text-gray-600 text-sm mb-3 line-clamp-2">
      ${safeSummary}
    </p>

    <!-- 底部信息区域 -->
    ${createFooterContent(conversation)}
  `;
}

/**
 * 创建底部信息区域
 */
function createFooterContent(conversation: Conversation): string {
  const platformName = formatPlatformName(conversation.platform);
  const messageCount = conversation.messages.length || 0;
  const timestamp = formatTimestamp(conversation.createdAt);

  return `
    <!-- 底部信息区域 -->
    <div class="flex items-center justify-between text-xs text-gray-500 gap-2">
      <div class="flex items-center gap-3 flex-1 min-w-0">
        <div class="platform-tag platform-${conversation.platform}">${platformName}</div>
        <div class="flex items-center gap-1">
          <i class="fas fa-comment-dots opacity-70"></i>
          <span class="font-medium">${messageCount}</span>
        </div>
      </div>

      <!-- 时间显示区域 - 右下角 -->
      <div class="text-xs text-gray-400 flex-shrink-0">
        <span>${timestamp}</span>
      </div>
    </div>
  `;
}

/**
 * 查找包含搜索词的消息片段
 */
function findMatchingSnippet(
  conversation: Conversation,
  searchTerm: string
): string {
  if (!conversation.messages || !searchTerm) {
    return safeGetMessage('noContent', 'No Content') || 'No Content';
  }

  const keywords = searchTerm
    .toLowerCase()
    .split(/\s+/)
    .filter(k => k.length > 0);

  for (const message of conversation.messages) {
    if (message.content) {
      const lowerContent = message.content.toLowerCase();

      if (keywords.every(keyword => lowerContent.includes(keyword))) {
        // 提取包含所有关键词的片段
        const start = Math.max(0, message.content.indexOf(searchTerm) - 50);
        const end = Math.min(
          message.content.length,
          message.content.indexOf(searchTerm) + searchTerm.length + 50
        );

        return message.content.substring(start, end);
      }
    }
  }

  return safeGetMessage('noContent', 'No Content') || 'No Content';
}

/**
 * 添加卡片事件监听
 */
function attachCardEvents(card: HTMLElement, conversation: Conversation): void {
  // 多选模式下的选择器点击
  const checkbox = card.querySelector('.multi-select-checkbox');
  if (checkbox) {
    checkbox.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleConversationSelection(conversation.conversationId);
    });
  }

  // 编辑标题按钮
  const editBtn = card.querySelector('.edit-title');
  if (editBtn) {
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // 触发编辑标题事件
      document.dispatchEvent(
        new CustomEvent('edit-conversation', {
          detail: {
            conversationId: conversation.conversationId,
            title: conversation.title,
          },
        })
      );
    });
  }

  // 打开原始页面按钮
  const openBtn = card.querySelector('.open-original');
  if (openBtn) {
    openBtn.addEventListener('click', (e) => {
      e.stopPropagation();

    if (conversation.link) {
        openOriginalPage(conversation.link);
      }
    });
  }

  // 删除按钮
  const deleteButton = card.querySelector('.delete-conversation');
  if (deleteButton) {
    deleteButton.addEventListener('click', (e) => {
      e.stopPropagation();

    // 触发删除事件
    document.dispatchEvent(
      new CustomEvent('delete-conversation', {
        detail: {
          conversationId: conversation.conversationId,
          title: conversation.title,
        },
      })
    );
    });
  }

  // 卡片主体点击（非多选模式）
  if (!checkbox) {
    card.addEventListener('click', (e) => {
      const target = e.target as HTMLElement | null;
      if (!target) {
        return;
      }
      // 排除操作按钮的点击
      if (
        !target.closest('.open-original') &&
        !target.closest('.delete-conversation') &&
        !target.closest('.edit-title')
      ) {
        // 触发显示详情事件
        document.dispatchEvent(
          new CustomEvent('show-conversation', {
            detail: {
              conversationId: conversation.conversationId,
              conversation,
            },
          })
        );
      }
    });
  }
}

/**
 * 切换对话选中状态
 */
function toggleConversationSelection(conversationId: string): void {
  document.dispatchEvent(
    new CustomEvent('toggle-conversation-selection', {
      detail: {
        conversationId,
      },
    })
  );

  Logger.debug('[MemoriesList] 切换选中状态:', conversationId);
}

/**
 * 打开原始页面
 */
export function openOriginalPage(url: string): void {
  if (!url) {
    Logger.warn('[MemoriesList] 无效的 URL:', url);
    return;
  }

  void safeCreateTab(url).catch((error) => {
    Logger.error('[MemoriesList] 打开原始页面失败:', error);
  });
}

/**
 * 返回列表页（兼容 popup 入口调用）
 */
export function backToList(): void {
  document.dispatchEvent(new CustomEvent('back-to-list'));
}

// ============================================================================
// 导出
// ============================================================================

export default {
  // 状态管理
  getCurrentConversationId,
  setCurrentConversationId,

  // 渲染功能
  showLoading,
  hideLoading,
  showEmpty,
  hideEmpty,
  showList,
  hideList,
  renderConversationCards,

  // 其他功能
  openOriginalPage,
};

/**
 * 设置所有对话
 */
export function setAllConversations(conversations: Conversation[]): void {
  allConversations = conversations;
}
