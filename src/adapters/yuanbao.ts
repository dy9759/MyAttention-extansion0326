/**
 * 腾讯元宝平台适配器
 * 提取腾讯元宝对话消息
 */

import type {
  Message,
  PlatformName,
  UrlMatchResult,
  PlatformAdapter,
  MessageSender,
} from '@/types';
import { storageManager } from '@/core/storage/manager';
import { chromeMessageAdapter } from '@/core/chrome-message';
import { eventBus } from '@/core/event-bus';
import { Logger } from '@/core/errors';
import { getAdapterDwellCandidates, getAdapterSelectionContext } from './snippet-context';

/**
 * 腾讯元宝适配器
 */
export class YuanbaoAdapter implements PlatformAdapter {
  readonly platform: PlatformName = 'yuanbao';
  private isObserving = false;
  private observer: MutationObserver | null = null;

  /**
   * 验证是否为有效的腾讯元宝对话 URL
   */
  isValidConversationUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;
      const pathname = urlObj.pathname;

      // 检查域名
      if (!hostname.includes('yuanbao.tencent.com')) {
        return false;
      }

      const validPatterns = [
        /^\/chat\/[^/]+\/[^/]+$/, // /chat/app_id/conversation_id
      ];

      const isValid = validPatterns.some((pattern) => pattern.test(pathname));
      Logger.debug('[YuanbaoAdapter] URL 验证结果:', isValid);
      return isValid;
    } catch (error) {
      Logger.error('[YuanbaoAdapter] URL 验证失败:', error);
      return false;
    }
  }

  /**
   * 从 URL 中提取对话信息
   */
  extractConversationInfo(url: string): UrlMatchResult {
    const result: UrlMatchResult = {
      matched: false,
      conversationId: null,
      isNewConversation: false,
    };

    try {
      Logger.debug('[YuanbaoAdapter] 开始提取元宝对话信息 - URL:', url);

      const urlObj = new URL(url);
      const pathname = urlObj.pathname;

      Logger.debug('[YuanbaoAdapter] 元宝路径:', pathname);

      const pathWithoutLeadingSlash = pathname.startsWith('/')
        ? pathname.substring(1)
        : pathname;

      // 尝试从哪里 data 属性获取对话 ID
      const conversationElement = document.querySelector('[data-conv-id]');
      if (conversationElement) {
        const dataConvId = conversationElement.getAttribute('data-conv-id');
        if (dataConvId) {
          const idParts = dataConvId.split('_');
          if (idParts.length > 0) {
            result.conversationId = idParts[0];
          }
        }
      }

      // 如果没有找到，从路径提取
      if (!result.conversationId) {
        if (
          pathWithoutLeadingSlash &&
          pathWithoutLeadingSlash !== '' &&
          pathWithoutLeadingSlash !== 'chat'
        ) {
          result.conversationId = pathWithoutLeadingSlash.replace(/\//g, '_');
        }
      }

      result.isNewConversation = !result.conversationId || result.conversationId === 'new';
      Logger.debug('[YuanbaoAdapter] 提取到对话ID:', result.conversationId);
      Logger.debug('[YuanbaoAdapter] 是否为新对话:', result.isNewConversation);
      return result;
    } catch (error) {
      Logger.error('[YuanbaoAdapter] 解析 URL 时出错:', error);
      return result;
    }
  }

  /**
   * 检查元素是否为消息元素
   */
  isMessageElement(node: Node): boolean {
    return (
      node.nodeType === Node.ELEMENT_NODE &&
      (node as Element).classList &&
      ((node as Element).classList.contains('agent-chat__list__item--human') ||
        (node as Element).classList.contains('agent-chat__list__item--ai'))
    );
  }

  /**
   * 提取页面上的所有消息
   */
  extractMessages(): Message[] {
    const messages: Message[] = [];

    Logger.debug('[YuanbaoAdapter] 开始提取元宝消息');

    const chatContainer = document.querySelector('.agent-chat__list__content');

    if (!chatContainer) {
      Logger.debug('[YuanbaoAdapter] 未找到对话容器 .agent-chat__list__content');
      return messages;
    }

    const userMessages = chatContainer.querySelectorAll(
      '.agent-chat__list__item--human'
    );
    const aiMessages = chatContainer.querySelectorAll(
      '.agent-chat__list__item--ai'
    );

    Logger.debug('[YuanbaoAdapter] 找到消息:', {
      user: userMessages.length,
      ai: aiMessages.length,
    });

    // 检查是否有用户正在编辑
    const existTextarea = Array.from(userMessages).find((element) =>
      this.isInEditMode(element)
    );
    if (existTextarea) {
      Logger.info('[YuanbaoAdapter] 检测到用户正在编辑，跳过消息提取');
      return [];
    }

    const allMessageElements: Array<{ element: Element; type: MessageSender }> = [];

    userMessages.forEach((element) => {
      allMessageElements.push({ element, type: 'user' });
    });

    aiMessages.forEach((element) => {
      allMessageElements.push({ element, type: 'assistant' });
    });

    // 按 DOM 中的实际位置排序
    allMessageElements.sort((a, b) => {
      const position = a.element.compareDocumentPosition(b.element);
      if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
        return -1;
      } else if (position & Node.DOCUMENT_POSITION_PRECEDING) {
        return 1;
      }
      return 0;
    });

    allMessageElements.forEach((messageInfo, index) => {
      const { element, type } = messageInfo;
      let content = '';
      let thinking = '';

      if (type === 'user') {
        const contentElement = element.querySelector('.hyc-content-text');
        if (contentElement) {
          content = contentElement.innerText.trim();
        }
      } else {
        // 查找思考内容（如果存在）
        const thinkElement = element.querySelector('.hyc-component-reasoner__think-content');
        if (thinkElement) {
          const thinkTextElement = thinkElement.querySelector('.hyc-component-reasoner__text');
          if (thinkTextElement) {
            thinking = thinkTextElement.innerText.trim();
          }
        }

        // 查找 AI 回复内容 - 如果有 reasoning 文本，使用那个
        const reasonerTextElement = element.querySelector('.hyc-component-reasoner__text');
        if (reasonerTextElement) {
          content = this.extractFormattedContent(reasonerTextElement);
        }

        // 底层方案：直接从 AI 消息元素提取内容
        if (!content) {
          content = this.extractFormattedContent(element);
        }
      }

      if (content) {
        const messageId = this.generateMessageId(type, content, index);

        messages.push({
          messageId,
          sender: type,
          content,
          thinking,
          position: index,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
    });

    Logger.info('[YuanbaoAdapter] 成功提取', messages.length, '条消息');
    return messages;
  }

  getSelectionContext(range: Range) {
    return getAdapterSelectionContext(this, range);
  }

  getDwellCandidates(): Element[] {
    return getAdapterDwellCandidates(this);
  }

  /**
   * 提取格式化内容
   */
  private extractFormattedContent(element: Element): string {
    if (!element) return '';

    const textContent = element.innerText || element.textContent || '';
    return textContent
      .split('\n')
      .map((line) => line.trim())
      .filter((line, index, array) => {
        if (line) return true;
        const prevLine = array[index - 1];
        const nextLine = array[index + 1];
        return !!(
          prevLine &&
          nextLine &&
          prevLine.trim() &&
          nextLine.trim()
        );
      })
      .join('\n')
      .trim();
  }

  /**
   * 生成消息 ID
   */
  private generateMessageId(
    sender: MessageSender,
    content: string,
    position: number
  ): string {
    const hash = this.hashContent(content.substring(0, 50));
    return `msg_${sender}_pos${position}_${hash}`;
  }

  /**
   * 内容哈希计算
   */
  private hashContent(str: string): string {
    let hash = 0;
    if (str.length === 0) return hash.toString(36);
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * 检查元素是否处于编辑模式
   */
  private isInEditMode(element: Element): boolean {
    const textarea = element.querySelector('textarea');
    return !!textarea;
  }

  /**
   * 开始监听
   */
  start(): void {
    Logger.info('[YuanbaoAdapter] 启动适配器');

    // 设置定时器，等待页面完全加载
    setTimeout(() => {
      this.startObserving();
    }, 1000);
  }

  /**
   * 开始观察 DOM 变化
   */
  private startObserving(): void {
    if (this.isObserving) {
      return;
    }

    this.isObserving = true;

    // 创建 MutationObserver 监听 DOM 变化
    this.observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          this.onDomChanged();
        }
      });
    });

    // 开始观察文档
    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: false,
      characterData: true,
    });

    Logger.info('[YuanbaoAdapter] DOM 观察已启动');
  }

  /**
   * 停止观察
   */
  stop(): void {
    Logger.info('[YuanbaoAdapter] 停止适配器');

    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }

    this.isObserving = false;
  }

  /**
   * 处理 DOM 变化事件
   */
  private onDomChanged(): void {
    // 使用防抖，避免频繁触发
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = window.setTimeout(async () => {
      try {
        const messages = this.extractMessages();

        if (messages.length > 0) {
          // 触发事件总线事件
          eventBus.publish('messages:extracted', {
            platform: this.platform,
            messages,
          });

          Logger.info('[YuanbaoAdapter] DOM 变化，提取到', messages.length, '条消息');
        }
      } catch (error) {
        Logger.error('[YuanbaoAdapter] 处理 DOM 变化失败:', error);
      }
    }, 500);
  }

  private debounceTimer: number | null = null;
}

// 导出单例
export const yuanbaoAdapter = new YuanbaoAdapter();
