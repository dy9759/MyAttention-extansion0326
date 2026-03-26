/**
 * 对话详情模块
 * 负责显示和编辑单个对话的详细信息
 */

import type { Conversation, Message } from '@/types';
import {
  formatTimestamp,
  formatPlatformName,
  formatTime as formatMessageTime,
  formatTextToHtml,
  highlightSearchTermForDetail,
} from '@/utils';
import { Logger } from '@/core/errors';
import {
  safeCreateTab,
  safeGetMessage,
  safeSendRuntimeMessage,
} from './chrome-safe';

// ============================================================================
// 常量定义
// ============================================================================

/**
 * 消息折叠阈值
 */
const MESSAGE_COLLAPSE_THRESHOLD = 140;

// ============================================================================
// DOM 元素引用
// ============================================================================

export const elements = {
  /** 详情页容器 */
  conversationDetail: document.getElementById('conversation-detail'),

  /** 返回列表按钮 */
  backToList: document.getElementById('back-to-list'),

  /** 标题区域 */
  detailTitle: document.getElementById('detail-title'),
  detailTitleInput: document.getElementById('detail-title-input'),

  /** 编辑按钮 */
  editTitle: document.getElementById('edit-title'),
  editTitleIcon: document.getElementById('edit-title-icon'),

  /** 打开原始页面按钮 */
  openOriginal: document.getElementById('open-original'),

  /** 更多操作 */
  moreActions: document.getElementById('more-actions'),
  moreActionsDropdown: document.getElementById('more-actions-dropdown'),

  /** 复制按钮 */
  copyConversation: document.getElementById('copy-conversation'),

  /** 删除按钮 */
  deleteConversationDetail: document.getElementById('delete-conversation-detail'),

  /** 详情信息 */
  detailPlatform: document.getElementById('detail-platform'),
  detailUpdated: document.getElementById('detail-updated'),
  detailMessagesCount: document.getElementById('detail-messages-count'),
  detailMessages: document.getElementById('detail-messages'),
};

// ============================================================================
// 全局变量
// ============================================================================

/**
 * 当前对话
 */
let currentConversation: Conversation | null = null;

/**
 * 当前搜索词
 */
let currentSearchTerm = '';

// ============================================================================
// UI 渲染
// ============================================================================

/**
 * 渲染对话详情
 */
export function renderConversationDetail(
  conversation: Conversation,
  searchTerm = ''
): void {
  currentConversation = conversation;
  currentSearchTerm = searchTerm;

  if (!elements.conversationDetail) {
    Logger.error('[ConversationDetail] 详情页元素未找到');
    return;
  }

  // 隐藏所有标签页
  hideAllTabs();

  // 显示详情页
  elements.conversationDetail.classList.remove('hidden');
  elements.conversationDetail.classList.add('active');

  // 更新标题
  if (elements.detailTitle) {
      elements.detailTitle.textContent =
      conversation.title ||
      safeGetMessage('noTitle', 'No Title') ||
      'No Title';
  }

  // 更新平台标签
  if (elements.detailPlatform) {
    elements.detailPlatform.textContent = formatPlatformName(conversation.platform);
    elements.detailPlatform.className = `platform-tag platform-${conversation.platform} mr-2`;
  }

  // 更新时间戳
  if (elements.detailUpdated) {
    elements.detailUpdated.textContent = formatTimestamp(conversation.createdAt);
  }

  // 更新消息数
  if (elements.detailMessagesCount) {
    elements.detailMessagesCount.textContent = String(
      conversation.messages.length || 0
    );
  }

  // 渲染消息
  renderMessages(conversation.messages, searchTerm);

  Logger.info('[ConversationDetail] 渲染对话详情:', conversation.conversationId);
}

/**
 * 渲染消息列表
 */
function renderMessages(messages: Message[] | undefined, searchTerm = ''): void {
  const detailMessages = elements.detailMessages;
  if (!detailMessages) {
    return;
  }

  detailMessages.innerHTML = '';

  if (!messages || messages.length === 0) {
    return;
  }

  let firstMatchElement: HTMLElement | null = null;

  messages.forEach((message, index) => {
    const messageElement = document.createElement('div');
    messageElement.className =
      message.sender === 'user' ? 'message-user' : 'message-ai';
    messageElement.setAttribute('data-message-index', String(index));

    // 消息头部
    const headerHtml = `
      <div class="flex justify-between items-start mb-2">
        <div class="message-sender">${
          message.sender === 'user'
            ? safeGetMessage('user', 'User') || 'User'
            : safeGetMessage('ai', 'AI') || 'AI'
        }</div>
        <div class="message-timestamp">${formatTime(
          message
        )}</div>
      </div>
    `;

    messageElement.innerHTML = headerHtml;

    // 思考内容
    let contentHtml = '';

    if (message.sender === 'ai' && message.thinking) {
      const thinkingId = `thinking-${Date.now()}-${Math.random()
        .toString(36)
        .substr(2, 9)}`;
      let thinkingContent = message.thinking;

      if (searchTerm) {
        thinkingContent = highlightSearchTermForDetail(
          thinkingContent,
          searchTerm
        );
      } else {
        thinkingContent = formatTextToHtml(thinkingContent);
      }

      contentHtml += `
        <div class="thinking-block">
          <div class="thinking-toggle" data-thinking-id="${thinkingId}">
            <div class="thinking-title">${
              safeGetMessage('thinkingProcess', 'Thinking') || 'Thinking'
            }</div>
            <div class="thinking-arrow" id="arrow-${thinkingId}"></div>
          </div>
          <div class="thinking-content" id="${thinkingId}"></div>
        </div>
      `;
    }

    // 消息内容
    let messageContent = message.content;

    if (searchTerm) {
      messageContent = highlightSearchTermForDetail(
        messageContent,
        searchTerm
      );
    } else {
      messageContent = formatTextToHtml(messageContent);
    }

    // 检查是否需要折叠
    const needsCollapse = checkIfMessageNeedsCollapse(
      message.content
    );
    const contentId = `content-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    contentHtml += `
      <div class="message-content-wrapper">
        <div class="message-content${
          needsCollapse ? ' collapsed' : ''
        }" id="${contentId}">${messageContent}</div>
        ${
          needsCollapse
            ? `<button class="message-toggle" data-content-id="${contentId}">
                <span class="toggle-text">展开</span>
                <i class="fas fa-chevron-down"></i>
              </button>`
            : ''
        }
      </div>
    `;

    const contentContainer = document.createElement('div');
    contentContainer.innerHTML = contentHtml;
    messageElement.appendChild(contentContainer);
    detailMessages.appendChild(messageElement);

    // 检查是否包含搜索词（用于自动滚动定位）
    if (searchTerm && !firstMatchElement) {
      const keywords = searchTerm
        .toLowerCase()
        .split(/\s+/)
        .filter(k => k.length > 0);
      const messageText =
        (message.content + ' ' + (message.thinking || '')).toLowerCase();

      const hasAllKeywords = keywords.every((keyword) =>
        messageText.includes(keyword)
      );

      if (hasAllKeywords) {
        firstMatchElement = messageElement;
      }
    }
  });

  // 添加展开/收折按钮事件监听
  const toggleButtons = detailMessages.querySelectorAll('.message-toggle');
  toggleButtons.forEach((button) => {
    button.addEventListener('click', (event) => {
      const target = event.currentTarget as HTMLElement | null;
      const contentId = target?.getAttribute('data-content-id');
      if (contentId) {
        toggleMessageContent(contentId);
      }
    });
  });

  // 如果有搜索词，尝试滚动到第一个高亮位置
  if (searchTerm) {
    setTimeout(() => {
      const firstMark = detailMessages.querySelector('mark');
      if (firstMark) {
        firstMark.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      } else if (firstMatchElement) {
        firstMatchElement.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }
    }, 100);
  } else {
    // 没有搜索词时滚动到底部
    detailMessages.scrollTop = detailMessages.scrollHeight;
  }
}

/**
 * 检查消息是否需要折叠
 */
function checkIfMessageNeedsCollapse(content: string): boolean {
  if (!content) return false;
  return content.length > MESSAGE_COLLAPSE_THRESHOLD;
}

/**
 * 切换消息内容展开/收折状态
 */
function toggleMessageContent(contentId: string): void {
  const contentElement = document.getElementById(contentId);
  if (!contentElement) {
    return;
  }

  const parentElement = contentElement.parentElement;
  if (!parentElement) {
    return;
  }

  const toggleButton = parentElement.querySelector('.message-toggle');
  if (!toggleButton) {
    return;
  }

  const isCollapsed = contentElement.classList.contains('collapsed');
  const toggleText = toggleButton.querySelector('.toggle-text');
  if (!toggleText) {
    return;
  }

  if (isCollapsed) {
    // 展开
    contentElement.classList.remove('collapsed');
    toggleText.textContent = '收起';
    toggleButton.classList.add('expanded');
  } else {
    // 收起
    contentElement.classList.add('collapsed');
    toggleText.textContent = '展开';
    toggleButton.classList.remove('expanded');
  }

  // 滚动到消息顶部
  setTimeout(() => {
    const container = contentElement.closest('.message-user, .message-ai');
    if (container) {
      container.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }
  }, 100);
}

/**
 * 格式化时间
 */
function formatTime(message: Message): string {
  return formatMessageTime(getCompatibleTime(message));
}

/**
 * 获取兼容时间戳
 */
function getCompatibleTime(message: Message): string {
  return (
    message.lastMessageAt ||
    message.createdAt ||
    message.timestamp ||
    new Date().toISOString()
  );
}

/**
 * 隐藏所有标签页
 */
function hideAllTabs(): void {
  const tabs = document.querySelectorAll('.tab-content');
  tabs.forEach((tab) => {
    tab.classList.remove('active');
    tab.classList.add('hidden');
  });
}

/**
 * 返回列表页面
 */
export function backToList(): void {
  if (!elements.conversationDetail) {
    return;
  }

  hideAllTabs();

  // 显示记忆列表标签页
  const memoriesTab = document.getElementById('tab-memories');
  if (memoriesTab) {
    memoriesTab.classList.add('active');
    memoriesTab.classList.remove('hidden');
  }

  currentConversation = null;

  Logger.info('[ConversationDetail] 返回列表页面');
}

// ============================================================================
// 编辑标题
// ============================================================================

/**
 * 开始内联编辑
 */
export function startInlineEdit(): void {
  const titleInput = elements.detailTitleInput as HTMLInputElement | null;
  if (!elements.detailTitle || !titleInput) {
    return;
  }

  const currentTitle = elements.detailTitle.textContent;

  // 隐藏标题，显示输入框
  elements.detailTitle.classList.add('hidden');
  titleInput.classList.remove('hidden');
  titleInput.value = currentTitle || '';

  // 更改按钮样式为保存
  if (elements.editTitleIcon) {
    elements.editTitleIcon.className = 'fas fa-check';
  }

  if (elements.editTitle) {
    elements.editTitle.classList.remove(
      'text-gray-500',
      'hover:bg-gray-100'
    );
    elements.editTitle.classList.add('text-green-600', 'hover:bg-green-50');
  }

  // 聚焦并选中文本
  titleInput.focus();
  titleInput.select();
}

/**
 * 保存内联编辑
 */
export function saveInlineEdit(): void {
  const titleInput = elements.detailTitleInput as HTMLInputElement | null;
  if (!titleInput || !currentConversation) {
    return;
  }

  const newTitle = titleInput.value.trim();

  if (!newTitle) {
    // 如果标题为空，恢复原标题
    cancelInlineEdit();
    return;
  }

  // // 如果标题没有变化，直接取消
  if (currentConversation.title === newTitle) {
    cancelInlineEdit();
    return;
  }

  void (async () => {
    try {
      const response = await safeSendRuntimeMessage({
        type: 'updateConversation',
        conversation: {
          ...currentConversation,
          title: newTitle,
        },
      });

      if (response?.status === 'ok') {
        if (elements.detailTitle) {
          elements.detailTitle.textContent = newTitle;
        }
        cancelInlineEdit();
      } else {
        alert(safeGetMessage('saveFailed', '保存失败，请重试'));
      }
    } catch {
      alert(safeGetMessage('saveFailed', '保存失败，请重试'));
    }
  })();
}

/**
 * 取消内联编辑
 */
export function cancelInlineEdit(): void {
  const titleInput = elements.detailTitleInput as HTMLInputElement | null;
  if (!elements.detailTitle || !titleInput) {
    return;
  }

  // 隐藏输入框，显示标题
  elements.detailTitle.classList.remove('hidden');
  titleInput.classList.add('hidden');

  // 恢复按钮样式为编辑
  if (elements.editTitleIcon) {
    elements.editTitleIcon.className = 'fas fa-edit';
  }

  if (elements.editTitle) {
    elements.editTitle.classList.add(
      'text-gray-500',
      'hover:bg-gray-100'
    );
    elements.editTitle.classList.remove(
      'text-green-600',
      'hover:bg-green-50'
    );
  }
}

/**
 * 打开原始页面
 */
export function openOriginalPage(): void {
  if (!currentConversation || !currentConversation.link) {
    return;
  }

  const link = currentConversation.link;
  void safeCreateTab(link).catch((error) => {
    Logger.error('[ConversationDetail] 打开原始页面失败:', error);
  });

  hideMoreActionsDropdown();

  Logger.info(
    '[ConversationDetail] 打开原始页面:',
    link
  );
}

/**
 * 删除当前对话
 */
export function deleteCurrentConversation(): void {
  if (!currentConversation) {
    return;
  }

  const confirmMessage =
    safeGetMessage('deleteConfirm', '确定要删除这个对话吗？') ||
    '确定要删除这个对话吗？';

  if (!confirm(confirmMessage)) {
    return;
  }

  void (async () => {
    try {
      const response = await safeSendRuntimeMessage({
        type: 'deleteConversation',
        conversationId: currentConversation.conversationId,
      });

      if (response?.status === 'ok') {
        backToList();
      } else {
        alert(safeGetMessage('deleteFailed', '删除失败，请重试'));
      }
    } catch {
      alert(safeGetMessage('deleteFailed', '删除失败，请重试'));
    }
  })();
}

// ============================================================================
// 更多操作
// ============================================================================

/**
 * 显示更多操作下拉菜单
 */
export function showMoreActionsDropdown(): void {
  if (!elements.moreActionsDropdown) {
    return;
  }

  elements.moreActionsDropdown.classList.remove('hidden');
  Logger.debug('[ConversationDetail] 显示更多操作下拉菜单');
}

/**
 * 隐藏更多操作下拉菜单
 */
export function hideMoreActionsDropdown(): void {
  if (!elements.moreActionsDropdown) {
    return;
  }

  elements.moreActionsDropdown.classList.add('hidden');
  Logger.debug('[ConversationDetail] 隐藏更多操作下拉菜单');
}

/**
 * 复制当前对话
 */
export function copyCurrentConversation(): void {
  if (!currentConversation) {
    return;
  }

  // 发送复制事件到主模块
  document.dispatchEvent(
    new CustomEvent('copy-current-conversation', {
      detail: currentConversation,
    })
  );

  Logger.info(
    '[ConversationDetail] 复制对话:',
    currentConversation.conversationId
  );
}

// ============================================================================
// 导出
// ============================================================================

export default {
  renderConversationDetail,
  backToList,
  startInlineEdit,
  saveInlineEdit,
  cancelInlineEdit,
  openOriginalPage,
  deleteCurrentConversation,
  showMoreActionsDropdown,
  hideMoreActionsDropdown,
  copyCurrentConversation,
};
