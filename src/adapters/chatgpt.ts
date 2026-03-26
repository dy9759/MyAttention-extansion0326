/**
 * ChatGPT 平台适配器
 * 提取 ChatGPT 对话消息
 */

import type {
  Message,
  PlatformName,
  UrlMatchResult,
  PlatformAdapter,
  MessageSender,
} from '@/types';
import { storageManager, database } from '@/core/storage/manager';
import { chromeMessageAdapter } from '@/core/chrome-message';
import { eventBus } from '@/core/event-bus';
import { Logger } from '@/core/errors';
import { getAdapterDwellCandidates, getAdapterSelectionContext } from './snippet-context';

/**
 * ChatGPT 适配器
 */
export class ChatGPTAdapter implements PlatformAdapter {
  readonly platform: PlatformName = 'chatgpt';
  private isObserving = false;
  private observer: MutationObserver | null = null;

  /**
   * 验证是否为有效的 ChatGPT 对话 URL
   */
  isValidConversationUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;
      const pathname = urlObj.pathname;

      if (
        !hostname.includes('chatgpt.com') &&
        !hostname.includes('chat.openai.com')
      ) {
        return false;
      }

      const validPatterns = [
        /^\/c\/[^/]+$/, // /c/conversation_id
        /^\/g\/[^/]+\/c\/[^/]+$/, // /g/gpt_id/c/conversation_id
      ];

      return validPatterns.some((pattern) => pattern.test(pathname));
    } catch (error) {
      Logger.error('[ChatGPTAdapter] URL 验证失败:', error);
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
        pathWithoutLeadingSlash !== 'c' &&
        pathWithoutLeadingSlash !== 'chat'
      ) {
        result.conversationId = pathWithoutLeadingSlash.replace(/\//g, '_');
        Logger.debug('[ChatGPTAdapter] 提取到对话ID:', result.conversationId);
      }

      return result;
    } catch (error) {
      Logger.error('[ChatGPTAdapter] 解析 URL 时出错:', error);
      return result;
    }
  }

  /**
   * 检查元素是否为消息元素
   */
  isMessageElement(node: Node): boolean {
    return (
      node.nodeType === Node.ELEMENT_NODE &&
      ((node as Element).hasAttribute('data-testid') &&
        (node as Element)
          .getAttribute('data-testid')!
          .startsWith('conversation-turn-')) ||
        (node as Element).hasAttribute('data-message-author-role'))
  }

  /**
   * 提取页面上的所有消息
   */
  extractMessages(): Message[] {
    const messages: Message[] = [];

    const conversationContainer =
      document.querySelector('main') ||
      document.querySelector('[role="main"]') ||
      document.body;

    if (!conversationContainer) {
      Logger.debug('[ChatGPTAdapter] 未找到对话容器');
      return messages;
    }

    const articleContainers = conversationContainer.querySelectorAll('article');

    // 检查是否存在编辑状态
    const existTextarea = Array.from(articleContainers).find((element) =>
      this.isInEditMode(element)
    );
    if (existTextarea) {
      Logger.info('[ChatGPTAdapter] 检测到用户正在编辑，跳过消息提取');
      return [];
    }

    const userMessages = conversationContainer.querySelectorAll(
      'div[data-message-author-role="user"]'
    );
    const aiMessages = conversationContainer.querySelectorAll(
      'div[data-message-author-role="assistant"]'
    );
    const allMessageElements: Array<{ element: Element; type: MessageSender }> = [];

    userMessages.forEach((element) => {
      allMessageElements.push({ element, type: 'user' });
    });
    aiMessages.forEach((element) => {
      allMessageElements.push({ element, type: 'assistant' });
    });

    Logger.info('[ChatGPTAdapter] 找到消息:', {
      user: userMessages.length,
      ai: aiMessages.length,
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

      if (type === 'user') {
        const userTextElement = element.querySelector('.whitespace-pre-wrap');
        if (userTextElement && userTextElement.innerText.trim()) {
          const content = userTextElement.innerText.trim();
          const messageId = this.generateMessageId('user', content, index);

          messages.push({
            messageId,
            sender: 'user',
            content,
            thinking: '',
            position: index,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
      } else if (type === 'assistant') {
        let thinking = '';
        let content = '';

        // 提取 AI thinking 文本
        const potentialThinkingElements = element.querySelectorAll(
          ':scope > div:not(.markdown)'
        );
        potentialThinkingElements.forEach((ptElement) => {
          if (
            (ptElement as HTMLElement).offsetParent !== null &&
            ptElement.innerText &&
            ptElement.innerText.trim() !== ''
          ) {
            if (
              !ptElement.querySelector('button') &&
              !ptElement.classList.contains('flex')
            ) {
              thinking = ptElement.innerText.trim();
            }
          }
        });

        // 提取 AI 正式消息文本
        const aiMarkdownElement = element.querySelector('.markdown.prose');
        if (aiMarkdownElement) {
          content = this.extractFormattedContent(aiMarkdownElement);
        }

        if (content) {
          const messageId = this.generateMessageId('assistant', content, index);

          messages.push({
            messageId,
            sender: 'assistant',
            content,
            thinking,
            position: index,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
      }
    });

    Logger.info('[ChatGPTAdapter] 成功提取', messages.length, '条消息');
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
        return prevLine && nextLine && prevLine.trim() && nextLine.trim();
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
   * 开始监听
   */
  private isInEditMode(element: Element): boolean {
    return !!element.querySelector('textarea');
  }

  /**
   * 开始监听
   */
  start(): void {
    Logger.info('[ChatGPTAdapter] 启动适配器');

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

    Logger.info('[ChatGPTAdapter] DOM 观察已启动');
  }

  /**
   * 停止观察
   */
  stop(): void {
    Logger.info('[ChatGPTAdapter] 停止适配器');

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

          Logger.info('[ChatGPTAdapter] DOM 变化，提取到', messages.length, '条消息');
        }
      } catch (error) {
        Logger.error('[ChatGPTAdapter] 处理 DOM 变化失败:', error);
      }
    }, 500);
  }

  private debounceTimer: number | null = null;
}

// 导出单例
export const chatgptAdapter = new ChatGPTAdapter();
