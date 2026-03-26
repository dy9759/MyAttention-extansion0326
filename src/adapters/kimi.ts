/**
 * Kimi 平台适配器
 * 提取 Kimi 对话消息
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
 * Kimi 适配器
 */
export class KimiAdapter implements PlatformAdapter {
  readonly platform: PlatformName = 'kimi';
  private isObserving = false;
  private observer: MutationObserver | null = null;

  /**
   * 验证是否为有效的 Kimi 对话 URL
   */
  isValidConversationUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;
      const pathname = urlObj.pathname;

      if (!hostname.includes('kimi.com')) {
        return false;
      }

      // 匹配 /chat/ 后面有具体路径的情况
      const validPatterns = [/^\/chat\/[^/]+.*$/];

      return validPatterns.some((pattern) => pattern.test(pathname));
    } catch (error) {
      Logger.error('[KimiAdapter] URL 验证失败:', error);
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
        pathWithoutLeadingSlash !== 'chat'
      ) {
        result.conversationId = pathWithoutLeadingSlash.replace(/\//g, '_');

        Logger.debug('[KimiAdapter] 提取到对话ID:', result.conversationId);
      }

      return result;
    } catch (error) {
      Logger.error('[KimiAdapter] 解析 URL 时出错:', error);
      return result;
    }
  }

  /**
   * 检查元素是否为消息元素
   */
  isMessageElement(node: Node): boolean {
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return false;
    }

    return (node as Element).classList.contains('chat-content-item');
  }

  /**
   * 提取页面上的所有消息
   */
  extractMessages(): Message[] {
    const messages: Message[] = [];

    Logger.debug('[KimiAdapter] 开始提取 Kimi 消息');

    const messageContainers = document.querySelectorAll('.chat-content-item');

    if (messageContainers.length === 0) {
      Logger.debug('[KimiAdapter] 未找到消息容器');
      return messages;
    }

    Logger.debug('[KimiAdapter] 找到', messageContainers.length, '个消息容器');

    // 检查是否存在编辑状态
    const existTextarea = Array.from(messageContainers).find((element) =>
      this.isInEditMode(element)
    );
    if (existTextarea) {
      Logger.info('[KimiAdapter] 检测到用户正在编辑，跳过消息提取');
      return [];
    }

    messageContainers.forEach((container, index) => {
      const isUserMessage = (container as Element).classList.contains(
        'chat-content-item-user'
      );
      const sender: MessageSender = isUserMessage ? 'user' : 'assistant';
      let content = '';
      const contentParts: string[] = [];

      if (isUserMessage) {
        const userContents = container.querySelectorAll('.user-content');
        const contentParts: string[] = [];

        userContents.forEach((userContent) => {
          const text = this.extractFormattedContent(userContent);
          if (text) {
            contentParts.push(text);
          }
        });

        content = contentParts.join('\n\n');
      } else {
        const isAIMessage = (container as Element).classList.contains(
          'chat-content-item-assistant'
        );

        if (isAIMessage) {
          const contentElements: any[] = [];
          // 收集 markdown-container
          container
            .querySelectorAll('.markdown-container')
            .forEach((el) => {
              if (!el.closest('.think-stage')) {
                contentElements.push(el);
              }
            });

          // 收集 editor-content
          container
            .querySelectorAll('.editor-content')
            .forEach((el) => {
              if (!el.closest('.think-stage')) {
                contentElements.push(el);
              }
            });

          // 按 DOM 顺序排序
          contentElements.sort((a, b) => {
            if (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) {
              return -1;
            }
            return 1;
          });

          // 提取文本内容
          contentElements.forEach((element) => {
            const text = this.extractFormattedContent(element);
            if (text) {
              contentParts.push(text);
            }
          });

          content = contentParts.join('\n\n');
        }
      }

      if (content) {
        const messageId = this.generateMessageId(sender, content, index);

        messages.push({
          messageId,
          sender,
          content,
          thinking: '',
          position: index,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
    });

    Logger.info('[KimiAdapter] Kimi 成功提取', messages.length, '条消息');
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
    Logger.info('[KimiAdapter] 启动适配器');

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

    Logger.info('[KimiAdapter] DOM 观察已启动');
  }

  /**
   * 停止观察
   */
  stop(): void {
    Logger.info('[KimiAdapter] 停止适配器');

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

          Logger.info('[KimiAdapter] DOM 变化，提取到', messages.length, '条消息');
        }
      } catch (error) {
        Logger.error('[KimiAdapter] 处理 DOM 变化失败:', error);
      }
    }, 500);
  }

  private debounceTimer: number | null = null;
}

// 导出单例
export const kimiAdapter = new KimiAdapter();
