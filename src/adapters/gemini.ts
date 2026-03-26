/**
 * Gemini 平台适配器
 * 提取 Gemini 对话消息
 */

import type {
  Message,
  PlatformName,
  UrlMatchResult,
  PlatformAdapter,
  MessageSender,
} from '@/types';
import { eventBus } from '@/core/event-bus';
import { Logger } from '@/core/errors';
import { getAdapterDwellCandidates, getAdapterSelectionContext } from './snippet-context';

/**
 * Gemini 适配器
 */
export class GeminiAdapter implements PlatformAdapter {
  readonly platform: PlatformName = 'gemini';
  private isObserving = false;
  private observer: MutationObserver | null = null;

  /**
   * 验证是否为有效的 Gemini 对话 URL
   */
  isValidConversationUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;
      const pathname = urlObj.pathname;

      if (!hostname.includes('gemini.google.com')) {
        return false;
      }

      // 支持多种 URL 格式
      const validPatterns = [
        /^\/gem\/[^/]+\/[^/]+$/, // /gem/conversation_id
        /^\/app\/[^/]+$/, // /app/conversation_id
        /^\/[^/]+\/[^/]+\/app\/[^/]+$/, // /*/app/conversation_id
        /^\/[^/]+\/[^/]+\/gem\/[^/]+\/[^/]+$/, // /*/gem/conversation_id
      ];

      // 排除初始无内容页面
      if (
        pathname === '/app' ||
        /^\/gem\/[^/]+$/.test(pathname) ||
        /^\/[^/]+\/[^/]+\/app$/.test(pathname) ||
        /^\/[^/]+\/[^/]+\/gem\/[^/]+$/.test(pathname)
      ) {
        return false;
      }

      return validPatterns.some((pattern) => pattern.test(pathname));
    } catch (error) {
      Logger.error('[GeminiAdapter] URL 验证失败:', error);
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

      // 移除开头的斜杠，获取完整度路径
      const pathWithoutLeadingSlash = pathname.startsWith('/')
        ? pathname.substring(1)
        : pathname;

      // 分析路径段
      const pathSegments = pathWithoutLeadingSlash.split('/');

      // 根据不同的路径格式提取对话 ID
      let conversationId = null;

      if (pathSegments.length >= 2) {
        if (pathSegments[0] === 'app' && pathSegments[1]) {
          conversationId = pathSegments[1];
        } else if (pathSegments[0] === 'gem' && pathSegments.length >= 3 && pathSegments[2]) {
          conversationId = pathSegments[2];
        } else if (pathSegments.length >= 4 && pathSegments[2] === 'app' && pathSegments[3]) {
          conversationId = pathSegments[3];
        } else if (pathSegments.length >= 5 && pathSegments[2] === 'gem' && pathSegments[4]) {
          conversationId = pathSegments[4];
        }
      }

      if (conversationId) {
        // 使用完整度路径作为对话 ID，将斜杠替换为下划线
        result.conversationId = pathWithoutLeadingSlash.replace(/\//g, '_');
        Logger.debug('[GeminiAdapter] 提取到对话 ID:', result.conversationId);
      }

      return result;
    } catch (error) {
      Logger.error('[GeminiAdapter] 解析 URL 时出错:', error);
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

    if ((node as Element).classList.contains('conversation-container')) {
      return true;
    }

    if (
      (node as Element).tagName === 'USER-QUERY' ||
      (node as Element).tagName === 'MODEL-RESPONSE'
    ) {
      return true;
    }

    // 检查是否包含消息内容元素
    if (
      (node as Element).querySelector('user-query') ||
      (node as Element).querySelector('model-response') ||
      (node as Element).querySelector('.query-text') ||
      (node as Element).querySelector('message-content')
    ) {
      return true;
    }

    // 检查父元素是否为消息容器
    let parent = node.parentElement;
    while (parent && parent !== document.body) {
      if (
        parent.classList.contains('conversation-container') ||
        parent.tagName === 'USER-QUERY' ||
        parent.tagName === 'MODEL-RESPONSE'
      ) {
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

    const chatHistoryContainer = document.querySelector('#chat-history');
    if (!chatHistoryContainer) {
      Logger.debug('[GeminiAdapter] 未找到聊天历史容器 #chat-history');
      return messages;
    }

    const conversationBlocks = chatHistoryContainer.querySelectorAll('.conversation-container');
    if (conversationBlocks.length === 0) {
      Logger.debug('[GeminiAdapter] 在 #chat-history 中未找到对话块');
      return messages;
    }

    Logger.debug('[GeminiAdapter] 找到', conversationBlocks.length, '个对话块');

    // 检查对话块中是否存在 textarea（编辑状态）
    const existTextarea = Array.from(conversationBlocks).find((block) =>
      this.isInEditMode(block)
    );
    if (existTextarea) {
      Logger.info('[GeminiAdapter] 检测到用户正在编辑，跳过消息提取');
      return [];
    }

    conversationBlocks.forEach((block, blockIndex) => {
      // 提取用户消息
      const userQueryContainer = block.querySelector('user-query .query-text');
      if (userQueryContainer) {
        let userContent = '';

        userContent = this.extractFormattedContent(userQueryContainer);

        if (userContent && userContent.trim()) {
          const position = blockIndex * 2; // 用户消息在偶数位置
          const userMessageId = this.generateMessageId('user', userContent, position);

          messages.push({
            messageId: userMessageId,
            sender: 'user',
            content: userContent,
            thinking: '',
            position: position,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
      }

      // 提取 AI 响应
      const modelResponseEntity = block.querySelector('model-response');
      if (modelResponseEntity) {
        let aiContent = '';

        const messageContentContainer = modelResponseEntity.querySelector(
          '.model-response-text'
        );
        if (messageContentContainer) {
          aiContent = this.extractFormattedContent(messageContentContainer);
        }

        if (aiContent && aiContent.trim()) {
          const position = blockIndex * 2 + 1; // AI 消息在奇数位置
          const aiMessageId = this.generateMessageId('assistant', aiContent, position);

          messages.push({
            messageId: aiMessageId,
            sender: 'assistant',
            content: aiContent,
            thinking: '',
            position: position,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
      }
    });

    const normalized = this.normalizeMessages(messages);
    Logger.info('[GeminiAdapter] 成功提取', normalized.length, '条消息');
    return normalized;
  }

  getSelectionContext(range: Range) {
    return getAdapterSelectionContext(this, range);
  }

  getDwellCandidates(): Element[] {
    return getAdapterDwellCandidates(this);
  }

  private normalizeMessages(messages: Message[]): Message[] {
    const deduped = new Map<string, Message>();
    messages.forEach((message) => {
      const content = (message.content || '').trim();
      if (!content) {
        return;
      }
      const sender: MessageSender = message.sender === 'user' ? 'user' : 'assistant';
      const key = `${sender}:${content}:${message.position}`;
      if (!deduped.has(key)) {
        deduped.set(key, {
          ...message,
          sender,
          content,
        });
      }
    });

    return Array.from(deduped.values())
      .sort((a, b) => (a.position || 0) - (b.position || 0))
      .map((message, index) => ({
        ...message,
        position: index,
        sender: message.sender === 'user' ? 'user' : 'assistant',
      }));
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
    Logger.info('[GeminiAdapter] 启动适配器');

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

    Logger.info('[GeminiAdapter] DOM 观察已启动');
  }

  /**
   * 停止观察
   */
  stop(): void {
    Logger.info('[GeminiAdapter] 停止适配器');

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

          Logger.info('[GeminiAdapter] DOM 变化，提取到', messages.length, '条消息');
        }
      } catch (error) {
        Logger.error('[GeminiAdapter] 处理 DOM 变化失败:', error);
      }
    }, 500);
  }

  private debounceTimer: number | null = null;
}

// 导出单例
export const geminiAdapter = new GeminiAdapter();
