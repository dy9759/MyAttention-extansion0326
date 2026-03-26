/**
 * Claude 平台适配器
 * 提取 Claude 对话消息（跳过思考块）
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
 * Claude 适配器
 */
export class ClaudeAdapter implements PlatformAdapter {
  readonly platform: PlatformName = 'claude';
  private isObserving = false;
  private observer: MutationObserver | null = null;

  /**
   * 验证是否为有效的 Claude 对话 URL
   */
  isValidConversationUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;
      const pathname = urlObj.pathname;

      if (!hostname.includes('claude.ai')) {
        return false;
      }

      const validPatterns = [/^\/chat\/.*$/]; // /chat/*

      return validPatterns.some((pattern) => pattern.test(pathname));
    } catch (error) {
      Logger.error('[ClaudeAdapter] URL 验证失败:', error);
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
        Logger.debug('[ClaudeAdapter] 提取到对话ID:', result.conversationId);
      }

      return result;
    } catch (error) {
      Logger.error('[ClaudeAdapter] 解析 URL 时出错:', error);
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

    // 检查是否为消息容器
    return (node as Element).hasAttribute('data-test-render-count');
  }

  /**
   * 提取页面上的所有消息
   */
  extractMessages(): Message[] {
    const messages: Message[] = [];

    Logger.debug('[ClaudeAdapter] 开始提取 Claude 消息');

    // 查找所有消息容器
    const messageContainers = document.querySelectorAll('[data-test-render-count]');

    if (messageContainers.length === 0) {
      Logger.debug('[ClaudeAdapter] 未找到消息容器 [data-test-render-count]');
      return messages;
    }

    Logger.debug('[ClaudeAdapter] 找到', messageContainers.length, '个消息容器');

    // 检查是否存在编辑状态
    const existTextarea = Array.from(messageContainers).find((element) =>
      this.isInEditMode(element)
    );
    if (existTextarea) {
      Logger.info('[ClaudeAdapter] 检测到用户正在编辑，跳过消息提取');
      return [];
    }

    messageContainers.forEach((container, index) => {
      let content = '';
      let sender: MessageSender | null = null;

      // 检查是否为用户消息
      const userMessage = container.querySelector('[data-testid="user-message"]');
      if (userMessage) {
        sender = 'user';
        content = this.extractFormattedContent(userMessage);
      }

      // 检查是否为 AI 消息
      const aiMessage = container.querySelector('.font-claude-response');
      if (aiMessage) {
        sender = 'assistant';
        // 只提取正式回复，跳过思考内容（thinking blocks）
        content = this.extractOnlyFormalResponse(aiMessage);
      }

      if (content && sender) {
        const messageId = this.generateMessageId(sender, content, index);

        messages.push({
          messageId,
          sender,
          content,
          thinking: '', // Claude 不提取 thinking
          position: index,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
    });

    Logger.info('[ClaudeAdapter] 成功提取', messages.length, '条消息');
    return messages;
  }

  getSelectionContext(range: Range) {
    return getAdapterSelectionContext(this, range);
  }

  getDwellCandidates(): Element[] {
    return getAdapterDwellCandidates(this);
  }

  /**
   * 只提取正式回复内容，跳过思考部分
   */
  private extractOnlyFormalResponse(element: Element): string {
    if (!element) return '';

    // 查找所有直接子元素，跳过思考块（thinking blocks）
    const childElements = Array.from(element.children);
    const formalResponseParts: string[] = [];

    childElements.forEach((child) => {
      // 跳过思考块 - 这些通常包含 transition-all、rounded-lg、border 等类名的可折叠容器
      if (this.isThinkingBlock(child)) {
        Logger.debug('[ClaudeAdapter] 跳过 Claude 思考块');
        return;
      }

      // 提取正式回复内容
      const content = this.extractFormattedContent(child);
      if (content) {
        formalResponseParts.push(content);
      }
    });

    return formalResponseParts.join('\n\n').trim();
  }

  /**
   * 检查元素是否为思考块
   */
  private isThinkingBlock(element: Element): boolean {
    if (!element || !element.classList) return false;

    // 根据网页示例，思考块通常有以下特征：
    // 1. 包含 transition-all, duration-400, ease-out 类名
    // 2. 包含 rounded-lg, border-0.5 类名
    // 3. 包含 min-h-[2.625rem] 类名
    // 4. 内部有可折叠的结构

    const classList = element.classList;
    const hasThinkingClasses =
      classList.contains('transition-all') &&
      classList.contains('rounded-lg') &&
      (classList.contains('border-0.5') || classList.contains('border'));

    // 额外检查：查看是否包含思考相关的文本提示
    const hasThinkingText =
      element.textContent &&
      (element.textContent.includes('Architected') ||
        element.textContent.includes('Engineered') ||
        element.textContent.includes('s')); // 思考时间标识

    // 检查是否有可折叠的按钮结构
    const hasCollapsibleButton = element.querySelector('button[aria-expanded]');

    return hasThinkingClasses || (Boolean(hasThinkingText) && Boolean(hasCollapsibleButton));
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
    Logger.info('[ClaudeAdapter] 启动适配器');

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

    Logger.info('[ClaudeAdapter] DOM 观察已启动');
  }

  /**
   * 停止观察
   */
  stop(): void {
    Logger.info('[ClaudeAdapter] 停止适配器');

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

          Logger.info('[ClaudeAdapter] DOM 变化，提取到', messages.length, '条消息');
        }
      } catch (error) {
        Logger.error('[ClaudeAdapter] 处理 DOM 变化失败:', error);
      }
    }, 500);
  }

  private debounceTimer: number | null = null;
}

// 导出单例
export const claudeAdapter = new ClaudeAdapter();
