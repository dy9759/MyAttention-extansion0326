/**
 * 豆包平台适配器
 * 提取豆包对话消息
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
 * 豆包适配器
 */
export class DoubaoAdapter implements PlatformAdapter {
  readonly platform: PlatformName = 'doubao';
  private isObserving = false;
  private observer: MutationObserver | null = null;
  private debounceTimer: number | null = null;
  private initialProbeTimer: number | null = null;
  private repeatedProbeTimer: number | null = null;
  private repeatedProbeAttempts = 0;
  private hasPublishedMessages = false;

  /**
   * 验证是否为有效的豆包对话 URL
   */
  isValidConversationUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;
      const pathname = urlObj.pathname;

      if (!hostname.includes('doubao.com')) {
        return false;
      }

      // 只处理 /chat/ 后面有具体路径的情况
      // 排除 /chat/ 或 /chat/ 这种没有具体对话ID的情况
      const validPatterns = [
        /^\/chat\/(?!local)[^/]+.*$/, // /chat/具体路径，但排除local
      ];

      return validPatterns.some((pattern) => pattern.test(pathname));
    } catch (error) {
      Logger.error('[DoubaoAdapter] URL 验证失败:', error);
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

        Logger.debug('[DoubaoAdapter] 提取到对话ID:', result.conversationId);
      }

      return result;
    } catch (error) {
      Logger.error('[DoubaoAdapter] 解析 URL 时出错:', error);
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
    const element = node as Element;
    if (element.getAttribute('data-testid') === 'union_message') {
      return true;
    }
    const className = String(element.className || '').toLowerCase();
    return className.includes('message') && (
      className.includes('user')
      || className.includes('assistant')
      || className.includes('bot')
      || className.includes('ai')
    );
  }

  /**
   * 提取页面上的所有消息
   */
  extractMessages(): Message[] {
    Logger.debug('[DoubaoAdapter] 开始提取豆包消息');

    const legacyContainers = this.queryAllDeep('[data-testid="union_message"]');
    if (legacyContainers.length > 0) {
      const extracted = this.extractMessagesFromLegacyContainers(legacyContainers);
      Logger.info('[DoubaoAdapter] 豆包成功提取', extracted.length, '条消息');
      return extracted;
    }

    const fallback = this.extractMessagesFromFallbackSelectors();
    Logger.info('[DoubaoAdapter] 豆包回退提取', fallback.length, '条消息');
    return fallback;
  }

  getSelectionContext(range: Range) {
    return getAdapterSelectionContext(this, range);
  }

  getDwellCandidates(): Element[] {
    return getAdapterDwellCandidates(this);
  }

  private extractMessagesFromLegacyContainers(messageContainers: Element[]): Message[] {
    const messages: Message[] = [];
    const existTextarea = Array.from(messageContainers).find((element) => this.isInEditMode(element));
    if (existTextarea) {
      Logger.info('[DoubaoAdapter] 检测到用户正在编辑，跳过消息提取');
      return [];
    }

    messageContainers.forEach((container, index) => {
      let content = '';
      let thinking = '';
      let sender: MessageSender | null = null;

      const sendMessage = container.querySelector('[data-testid="send_message"]');
      if (sendMessage) {
        sender = 'user';
        const userTextElement = container.querySelector('[data-testid="message_text_content"]');
        if (userTextElement) {
          content = userTextElement.innerText.trim();
        }
      }

      const receiveMessage = container.querySelector('[data-testid="receive_message"]');
      if (receiveMessage) {
        sender = 'assistant';
        const thinkBlock = receiveMessage.querySelector('[data-testid="think_block_collapse"]');
        if (thinkBlock) {
          const thinkTextElement = thinkBlock.querySelector('[data-testid="message_text_content"]');
          if (thinkTextElement) {
            thinking = this.extractFormattedContent(thinkTextElement);
          }
        }

        const allTextElements = receiveMessage.querySelectorAll('[data-testid="message_text_content"]');
        for (const textElement of allTextElements) {
          if (!textElement.closest('[data-testid="think_block_collapse"]')) {
            content = this.extractFormattedContent(textElement);
            break;
          }
        }
      }

      if (!content || !sender) {
        return;
      }

      messages.push({
        messageId: this.generateMessageId(sender, content, index),
        sender,
        content,
        thinking,
        position: index,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    });

    return this.normalizeMessages(messages);
  }

  private extractMessagesFromFallbackSelectors(): Message[] {
    const candidates: Array<{ element: Element; sender: MessageSender }> = [];
    const push = (selector: string, sender: MessageSender): void => {
      this.queryAllDeep(selector).forEach((element) => {
        candidates.push({
          element: this.resolveMessageElement(element),
          sender,
        });
      });
    };

    push('[data-role="user"]', 'user');
    push('[data-message-role="user"]', 'user');
    push('[class*="user-message" i]', 'user');
    push('[class*="from-user" i]', 'user');
    push('[class*="chat-item-user" i]', 'user');
    push('[class*="message-user" i]', 'user');

    push('[data-role="assistant"]', 'assistant');
    push('[data-message-role="assistant"]', 'assistant');
    push('[class*="assistant-message" i]', 'assistant');
    push('[class*="from-assistant" i]', 'assistant');
    push('[class*="chat-item-assistant" i]', 'assistant');
    push('[class*="message-assistant" i]', 'assistant');
    push('[class*="bot-message" i]', 'assistant');

    if (candidates.length === 0) {
      this.queryAllDeep('[data-message-id], [class*="message" i], article, main section')
        .forEach((element) => {
          const sender = this.inferSenderFromElement(element);
          if (!sender) {
            return;
          }
          candidates.push({
            element: this.resolveMessageElement(element),
            sender,
          });
        });
    }

    const dedupByElement = new Map<Element, MessageSender>();
    candidates.forEach(({ element, sender }) => {
      if (!dedupByElement.has(element) && this.isLikelyMessageElement(element)) {
        dedupByElement.set(element, sender);
      }
    });

    const ordered = Array.from(dedupByElement.entries())
      .map(([element, sender]) => ({ element, sender }))
      .sort((a, b) => {
        const position = a.element.compareDocumentPosition(b.element);
        if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
          return -1;
        }
        if (position & Node.DOCUMENT_POSITION_PRECEDING) {
          return 1;
        }
        return 0;
      });

    if (ordered.find((entry) => this.isInEditMode(entry.element))) {
      Logger.info('[DoubaoAdapter] 检测到用户正在编辑，跳过消息提取');
      return [];
    }

    const messages: Message[] = [];
    const dedupByContent = new Set<string>();
    ordered.forEach((entry, index) => {
      const content = this.extractMessageText(entry.element);
      if (!content) {
        return;
      }

      const dedupKey = `${entry.sender}:${content}`;
      if (dedupByContent.has(dedupKey)) {
        return;
      }
      dedupByContent.add(dedupKey);

      messages.push({
        messageId: this.generateMessageId(entry.sender, content, index),
        sender: entry.sender,
        content,
        thinking: '',
        position: index,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    });

    return messages;
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
          thinking: (message.thinking || '').trim(),
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
    const textarea = element.querySelector('textarea, [contenteditable="true"]');
    if (!textarea) {
      return false;
    }
    const activeElement = document.activeElement;
    return Boolean(activeElement && (textarea === activeElement || textarea.contains(activeElement)));
  }

  private inferSenderFromElement(element: Element): MessageSender | null {
    const dataRole = (
      element.getAttribute('data-role')
      || element.getAttribute('data-message-role')
      || ''
    ).toLowerCase();
    if (dataRole.includes('user') || dataRole.includes('human')) {
      return 'user';
    }
    if (dataRole.includes('assistant') || dataRole.includes('ai') || dataRole.includes('bot')) {
      return 'assistant';
    }

    const className = String(element.className || '').toLowerCase();
    if (
      className.includes('user')
      || className.includes('human')
      || className.includes('right')
      || className.includes('self')
    ) {
      return 'user';
    }
    if (
      className.includes('assistant')
      || className.includes('ai')
      || className.includes('bot')
      || className.includes('left')
      || className.includes('model')
    ) {
      return 'assistant';
    }
    return null;
  }

  private resolveMessageElement(element: Element): Element {
    return (
      element.closest(
        [
          '[data-message-id]',
          '[data-role]',
          '[data-message-role]',
          '[class*="message" i]',
          '[class*="chat-item" i]',
          'article',
          'li',
        ].join(', ')
      )
      || element
    );
  }

  private isLikelyMessageElement(element: Element): boolean {
    if (!this.isVisible(element)) {
      return false;
    }

    if (element.closest('aside, nav, header, footer, [role="navigation"], [class*="sidebar" i]')) {
      return false;
    }

    const text = this.extractMessageText(element);
    if (!text || text.length < 2) {
      return false;
    }

    return !element.querySelector('textarea, input[type="text"], [contenteditable="true"]');
  }

  private isVisible(element: Element): boolean {
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') {
      return false;
    }
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return false;
    }
    return !(rect.bottom <= 0 || rect.top >= window.innerHeight);
  }

  private extractMessageText(element: Element): string {
    const contentElement = element.querySelector(
      [
        '[data-testid="message_text_content"]',
        '.message-content',
        '.content',
        '.text',
        '.markdown',
        '.chat-content',
        '[data-testid*="content"]',
        '[class*="message-content" i]',
      ].join(', ')
    ) || element;

    return this.extractFormattedContent(contentElement);
  }

  /**
   * 开始监听
   */
  start(): void {
    Logger.info('[DoubaoAdapter] 启动适配器');
    this.hasPublishedMessages = false;
    this.repeatedProbeAttempts = 0;

    // 设置定时器，等待页面完全加载
    setTimeout(() => {
      this.startObserving();
      this.tryExtractAndPublish('startup');
      this.initialProbeTimer = window.setTimeout(() => {
        this.tryExtractAndPublish('startup-probe');
      }, 2000);
      this.startRepeatedProbe();
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

    Logger.info('[DoubaoAdapter] DOM 观察已启动');
  }

  /**
   * 停止观察
   */
  stop(): void {
    Logger.info('[DoubaoAdapter] 停止适配器');

    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.initialProbeTimer) {
      clearTimeout(this.initialProbeTimer);
      this.initialProbeTimer = null;
    }

    if (this.repeatedProbeTimer) {
      clearInterval(this.repeatedProbeTimer);
      this.repeatedProbeTimer = null;
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

    this.debounceTimer = window.setTimeout(() => {
      this.tryExtractAndPublish('dom-change');
    }, 500);
  }

  private tryExtractAndPublish(reason: string): number {
    try {
      const messages = this.extractMessages();
      if (!messages.length) {
        return 0;
      }

      eventBus.publish('messages:extracted', {
        platform: this.platform,
        messages,
      });
      this.hasPublishedMessages = true;
      Logger.info('[DoubaoAdapter] 提取到消息:', {
        reason,
        count: messages.length,
      });
      return messages.length;
    } catch (error) {
      Logger.error('[DoubaoAdapter] 处理消息提取失败:', error);
      return 0;
    }
  }

  private startRepeatedProbe(): void {
    if (this.repeatedProbeTimer) {
      clearInterval(this.repeatedProbeTimer);
      this.repeatedProbeTimer = null;
    }

    this.repeatedProbeTimer = window.setInterval(() => {
      if (this.hasPublishedMessages) {
        clearInterval(this.repeatedProbeTimer!);
        this.repeatedProbeTimer = null;
        return;
      }

      this.repeatedProbeAttempts += 1;
      this.tryExtractAndPublish(`repeated-probe-${this.repeatedProbeAttempts}`);

      if (this.repeatedProbeAttempts >= 12) {
        clearInterval(this.repeatedProbeTimer!);
        this.repeatedProbeTimer = null;
      }
    }, 2000);
  }

  private queryAllDeep(selector: string): Element[] {
    const roots: ParentNode[] = [document];
    const visited = new Set<Node>();

    for (let index = 0; index < roots.length; index += 1) {
      const root = roots[index] as ParentNode;
      if (!root || visited.has(root as Node)) {
        continue;
      }
      visited.add(root as Node);

      const elements = root.querySelectorAll('*');
      elements.forEach((element) => {
        const maybeShadowRoot = (element as HTMLElement).shadowRoot;
        if (maybeShadowRoot && !visited.has(maybeShadowRoot)) {
          roots.push(maybeShadowRoot);
        }
      });
    }

    const result = new Set<Element>();
    roots.forEach((root) => {
      root.querySelectorAll(selector).forEach((element) => result.add(element));
    });
    return Array.from(result);
  }
}

// 导出单例
export const doubaoAdapter = new DoubaoAdapter();
