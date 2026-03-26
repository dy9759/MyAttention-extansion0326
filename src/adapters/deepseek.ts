/**
 * DeepSeek 平台适配器
 * 提取 DeepSeek 对话消息
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
 * DeepSeek 适配器
 */
export class DeepSeekAdapter implements PlatformAdapter {
  readonly platform: PlatformName = 'deepseek';
  private isObserving = false;
  private observer: MutationObserver | null = null;

  /**
   * 验证是否为有效的 DeepSeek 对话 URL
   */
  isValidConversationUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      if (!urlObj.hostname.includes('chat.deepseek.com')) {
        return false;
      }
      return /^\/a\/chat\/s\/[^/]+$/.test(urlObj.pathname);
    } catch (error) {
      Logger.error('[DeepSeekAdapter] URL 验证失败:', error);
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
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const pathWithoutLeadingSlash = pathname.startsWith('/')
        ? pathname.substring(1)
        : pathname;

      if (
        pathWithoutLeadingSlash &&
        pathWithoutLeadingSlash !== '' &&
        pathWithoutLeadingSlash !== 'a' &&
        pathWithoutLeadingSlash !== 'chat'
      ) {
        result.conversationId = pathWithoutLeadingSlash.replace(/\//g, '_');
        Logger.debug('[DeepSeekAdapter] 提取到对话ID:', result.conversationId);
      }

      return result;
    } catch (error) {
      Logger.error('[DeepSeekAdapter] 解析 URL 时出错:', error);
      return result;
    }
  }

  /**
   * 检查元素是否为消息元素（或消息内部的子元素）
   */
  isMessageElement(node: Node): boolean {
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return false;
    }

    // 直接检查节点本身
    if ((node as Element).classList) {
      // 用户消息容器
      if ((node as Element).classList.contains('_9663006')) {
        return true;
      }
      // AI 消息容器
      if (
        (node as Element).classList.contains('_4f9bf79') &&
        (node as Element).classList.contains('_43c05b5')
      ) {
        return true;
      }
    }

    // 向上遍历父元素，检查是否在消息容器内部
    let parent = node.parentElement;
    while (parent && parent !== document.body) {
      if (parent.classList &&
          (parent.classList.contains('_9663006') ||
            (parent.classList.contains('_4f9bf79') &&
            parent.classList.contains('_43c05b5')))) {
        return true;
      }
      parent = parent.parentElement;
    }

    return false;
  }

  /**
   * 提取页面上的所有消息
   */
  extractMessages(): Message[] {
    const messages: Message[] = [];

    const chatWindow = document.querySelector('.dad65929');
    if (!chatWindow) {
      Logger.debug('[DeepSeekAdapter] 未找到对话窗口');
      return messages;
    }

    const messageElements = chatWindow.querySelectorAll(
      '._9663006, ._4f9bf79._43c05b5'
    );

    const existTextarea = Array.from(messageElements).find((element) =>
      this.isInEditMode(element)
    );
    if (existTextarea) {
      Logger.info('[DeepSeekAdapter] 检测到用户正在编辑，跳过消息提取');
      return [];
    }

    Logger.debug('[DeepSeekAdapter] 找到', messageElements.length, '条消息元素');

    messageElements.forEach((element, index) => {
      const isUserMessage = (element as Element).classList.contains('_9663006');
      const sender: MessageSender = isUserMessage ? 'user' : 'assistant';
      let content = '';
      let thinking = '';

      if (isUserMessage) {
        // 用户消息：从 .fbb737a4 提取
        const userTextElement = (element as Element).querySelector('.fbb737a4');
        if (userTextElement) {
          content = userTextElement.innerText.trim();
        }
      } else {
        // AI 消息：分别提取思考内容和正式回答
        const dsMessage = (element as Element).querySelector('.ds-message');
        if (dsMessage) {
          // 1. 提取思考内容：从 .ds-think-content 或 .e1675d8b 内的 .ds-markdown 提取
          const thinkingContainer = dsMessage.querySelector(
            '.ds-think-content, .e1675d8b'
          );
          if (thinkingContainer) {
            const thinkingMarkdown = thinkingContainer.querySelector('.ds-markdown');
            if (thinkingMarkdown) {
              thinking = this.extractFormattedContent(thinkingMarkdown);
            }
          }

          // 2. 提取正式回答：从 .ds-message 的直接子元素 .ds-markdown 提取
          const directMarkdown = Array.from(dsMessage.children).find(
            (child) => (child as Element).classList.contains('ds-markdown')
          );
          if (directMarkdown) {
            content = this.extractFormattedContent(directMarkdown);
          }
        }
      }

      if (content) {
        const messageId = this.generateMessageId(sender, content, index);

        messages.push({
          messageId,
          sender,
          content,
          thinking,
          position: index,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
    });

    Logger.info('[DeepSeekAdapter] 成功提取', messages.length, '条消息');
    return messages;
  }

  getSelectionContext(range: Range) {
    return getAdapterSelectionContext(this, range);
  }

  getDwellCandidates(): Element[] {
    return getAdapterDwellCandidates(this);
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
        return prevLine && nextLine && prevLine.trim() && nextLine.trim();
      })
      .join('\n')
      .trim();
  }

  /**
   * 开始监听
   */
  private isInEditMode(element: Element): boolean {
    return !!element.querySelector('textarea');
  }

  /**
   * 开始监听
   */
  start(): void {
    Logger.info('[DeepSeekAdapter] 启动适配器');

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

    Logger.info('[DeepSeekAdapter] DOM 观察已启动');
  }

  /**
   * 停止观察
   */
  stop(): void {
    Logger.info('[DeepSeekAdapter] 停止适配器');

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

          Logger.info('[DeepSeekAdapter] DOM 变化，提取到', messages.length, '条消息');
        }
      } catch (error) {
        Logger.error('[DeepSeekAdapter] 处理 DOM 变化失败:', error);
      }
    }, 500);
  }

  private debounceTimer: number | null = null;
}

// 导出单例
export const deepseekAdapter = new DeepSeekAdapter();
