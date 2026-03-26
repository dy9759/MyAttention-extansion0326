/**
 * Qwen 平台适配器
 * 适配 qwen 国际版与国内版页面结构
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

const QWEN_HOSTS = new Set(['chat.qwen.ai', 'www.qianwen.com', 'qianwen.com', 'qwen.ai']);

export class QwenAdapter implements PlatformAdapter {
  readonly platform: PlatformName = 'qwen';
  private isObserving = false;
  private observer: MutationObserver | null = null;
  private debounceTimer: number | null = null;
  private initialProbeTimer: number | null = null;

  isValidConversationUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      if (!QWEN_HOSTS.has(urlObj.hostname)) {
        return false;
      }

      const pathname = urlObj.pathname || '/';

      if (urlObj.hostname === 'qwen.ai') {
        return (
          pathname === '/' ||
          pathname === '/home' ||
          pathname.startsWith('/chat') ||
          pathname.startsWith('/c/') ||
          pathname.includes('conversation')
        );
      }

      return pathname !== '/favicon.ico';
    } catch (error) {
      Logger.error('[QwenAdapter] URL 验证失败:', error);
      return false;
    }
  }

  extractConversationInfo(url: string): UrlMatchResult {
    const result: UrlMatchResult = {
      matched: false,
      conversationId: null,
      isNewConversation: false,
    };

    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;
      const pathname = urlObj.pathname;
      const pathWithoutLeadingSlash = pathname.replace(/^\/+/, '');

      const queryCandidates = [
        'conversationId',
        'conversation_id',
        'sessionId',
        'session_id',
        'chatId',
        'chat_id',
        'id',
      ];

      let conversationId: string | null = null;
      for (const key of queryCandidates) {
        const value = urlObj.searchParams.get(key);
        if (value) {
          conversationId = `${hostname}_${key}_${value}`;
          break;
        }
      }

      if (!conversationId && pathWithoutLeadingSlash) {
        if (pathWithoutLeadingSlash !== 'home' && pathWithoutLeadingSlash !== 'chat') {
          conversationId = `${hostname}_${pathWithoutLeadingSlash}`.replace(/\//g, '_');
        }
      }

      result.conversationId = conversationId;
      result.isNewConversation = !conversationId || conversationId === 'new';
      return result;
    } catch (error) {
      Logger.error('[QwenAdapter] 解析 URL 时出错:', error);
      return result;
    }
  }

  isMessageElement(node: Node): boolean {
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return false;
    }

    const element = node as Element;
    const roleAttr =
      (element.getAttribute('data-role') || element.getAttribute('data-message-role') || '').toLowerCase();

    if (
      roleAttr.includes('user') ||
      roleAttr.includes('assistant') ||
      roleAttr.includes('ai') ||
      roleAttr.includes('bot')
    ) {
      return true;
    }

    const className = (element.className || '').toString().toLowerCase();
    return (
      className.includes('message') &&
      (className.includes('user') ||
        className.includes('assistant') ||
        className.includes('ai') ||
        className.includes('bot'))
    );
  }

  extractMessages(): Message[] {
    const entries: Array<{ element: Element; sender: MessageSender }> = [];

    const pushBySelector = (selector: string, sender: MessageSender) => {
      document.querySelectorAll(selector).forEach((element) => {
        entries.push({
          element: this.resolveMessageElement(element),
          sender,
        });
      });
    };

    pushBySelector('[data-role="user"]', 'user');
    pushBySelector('[data-role*="user" i]', 'user');
    pushBySelector('[data-message-role="user"]', 'user');
    pushBySelector('[data-message-role*="user" i]', 'user');
    pushBySelector('[data-testid*="user-message"]', 'user');
    pushBySelector('[data-testid*="user-message" i]', 'user');
    pushBySelector('.message.user', 'user');
    pushBySelector('.chat-message.user', 'user');
    pushBySelector('.msg-user', 'user');
    pushBySelector('.message-item.user', 'user');
    pushBySelector('[class*="message-item-user"]', 'user');
    pushBySelector('[class*="user-message" i]', 'user');
    pushBySelector('[class*="from-user" i]', 'user');
    pushBySelector('[class*="human-message" i]', 'user');
    pushBySelector('.ml-auto', 'user');
    pushBySelector('[class*="justify-end"]', 'user');

    pushBySelector('[data-role="assistant"]', 'assistant');
    pushBySelector('[data-role*="assistant" i]', 'assistant');
    pushBySelector('[data-role="ai"]', 'assistant');
    pushBySelector('[data-role*="ai" i]', 'assistant');
    pushBySelector('[data-role="bot"]', 'assistant');
    pushBySelector('[data-role*="bot" i]', 'assistant');
    pushBySelector('[data-message-role="assistant"]', 'assistant');
    pushBySelector('[data-message-role*="assistant" i]', 'assistant');
    pushBySelector('[data-testid*="assistant-message"]', 'assistant');
    pushBySelector('[data-testid*="assistant-message" i]', 'assistant');
    pushBySelector('[data-testid*="bot-message" i]', 'assistant');
    pushBySelector('.message.assistant', 'assistant');
    pushBySelector('.chat-message.assistant', 'assistant');
    pushBySelector('.msg-assistant', 'assistant');
    pushBySelector('.message-item.assistant', 'assistant');
    pushBySelector('[class*="message-item-assistant"]', 'assistant');
    pushBySelector('[class*="assistant-message" i]', 'assistant');
    pushBySelector('[class*="from-assistant" i]', 'assistant');
    pushBySelector('.tongyi-markdown', 'assistant');
    pushBySelector('[class*="tongyi-markdown"]', 'assistant');
    pushBySelector('[class*="markdown-body" i]', 'assistant');

    if (entries.length === 0) {
      document.querySelectorAll('[data-message-id], [class*="message-item"], .message, article, main section').forEach((element) => {
        const sender = this.inferSenderFromElement(element);
        if (sender) {
          entries.push({
            element: this.resolveMessageElement(element),
            sender,
          });
        }
      });
    }

    const deduped = new Map<Element, MessageSender>();
    entries.forEach(({ element, sender }) => {
      if (!deduped.has(element) && this.isLikelyMessageElement(element)) {
        deduped.set(element, sender);
      }
    });

    const orderedEntries = Array.from(deduped.entries())
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

    const editing = orderedEntries.find((entry) => this.isInEditMode(entry.element));
    if (editing) {
      Logger.info('[QwenAdapter] 检测到用户正在编辑，跳过消息提取');
      return [];
    }

    const messages: Message[] = [];
    const seen = new Set<string>();
    orderedEntries.forEach((entry, index) => {
      const content = this.extractMessageText(entry.element);
      if (!content) {
        return;
      }

      const dedupeKey = `${entry.sender}:${content}`;
      if (seen.has(dedupeKey)) {
        return;
      }
      seen.add(dedupeKey);

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

    Logger.info('[QwenAdapter] 成功提取', messages.length, '条消息');
    return messages;
  }

  getSelectionContext(range: Range) {
    return getAdapterSelectionContext(this, range);
  }

  getDwellCandidates(): Element[] {
    return getAdapterDwellCandidates(this);
  }

  start(): void {
    Logger.info('[QwenAdapter] 启动适配器');
    setTimeout(() => {
      this.startObserving();
      this.tryExtractAndPublish('startup');
      this.initialProbeTimer = window.setTimeout(() => {
        this.tryExtractAndPublish('startup-probe');
      }, 2000);
    }, 1000);
  }

  stop(): void {
    Logger.info('[QwenAdapter] 停止适配器');

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

    this.isObserving = false;
  }

  private startObserving(): void {
    if (this.isObserving) {
      return;
    }

    this.isObserving = true;

    this.observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          this.onDomChanged();
        }
      });
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: false,
      characterData: true,
    });

    Logger.info('[QwenAdapter] DOM 观察已启动');
  }

  private onDomChanged(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = window.setTimeout(() => {
      this.tryExtractAndPublish('dom-change');
    }, 500);
  }

  private tryExtractAndPublish(reason: 'startup' | 'startup-probe' | 'dom-change'): void {
    try {
      const messages = this.extractMessages();
      if (messages.length === 0) {
        return;
      }

      eventBus.publish('messages:extracted', {
        platform: this.platform,
        messages,
      });

      Logger.info('[QwenAdapter] 提取到消息:', {
        reason,
        count: messages.length,
      });
    } catch (error) {
      Logger.error('[QwenAdapter] 处理消息提取失败:', error);
    }
  }

  private inferSenderFromElement(element: Element): MessageSender | null {
    const roleAttr =
      (element.getAttribute('data-role') || element.getAttribute('data-message-role') || '').toLowerCase();

    if (roleAttr.includes('user') || roleAttr.includes('human')) {
      return 'user';
    }

    if (
      roleAttr.includes('assistant') ||
      roleAttr.includes('ai') ||
      roleAttr.includes('bot') ||
      roleAttr.includes('model')
    ) {
      return 'assistant';
    }

    const className = (element.className || '').toString().toLowerCase();

    if (className.includes('user') || className.includes('human')) {
      return 'user';
    }

    if (
      className.includes('assistant') ||
      className.includes('ai') ||
      className.includes('bot') ||
      className.includes('model')
    ) {
      return 'assistant';
    }

    return null;
  }

  private extractMessageText(element: Element): string {
    const preferred = element.querySelector(
      '.message-content, .content, .text, .markdown, .chat-content, [data-testid*="content"], [class*="message-content"]'
    );

    const source = preferred || element;
    const textContent = (source as HTMLElement).innerText || source.textContent || '';

    return textContent
      .split('\n')
      .map((line) => line.trim())
      .filter((line, index, array) => {
        if (line) {
          return true;
        }
        const prev = array[index - 1];
        const next = array[index + 1];
        return !!(prev && next && prev.trim() && next.trim());
      })
      .join('\n')
      .trim();
  }

  private resolveMessageElement(element: Element): Element {
    const container = element.closest(
      [
        '[data-message-id]',
        '[data-role]',
        '[data-message-role]',
        '[class*="message" i]',
        '[class*="chat-item" i]',
        'article',
        'li',
      ].join(', ')
    );
    return container || element;
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

    // 避免把输入区当成消息
    if (element.querySelector('textarea, input[type="text"], [contenteditable="true"]')) {
      return false;
    }

    return true;
  }

  private isVisible(element: Element): boolean {
    const html = element as HTMLElement;
    const style = getComputedStyle(html);
    if (style.display === 'none' || style.visibility === 'hidden') {
      return false;
    }

    const rect = html.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      // 单测环境（jsdom）无真实布局，回退为“有文本即可见”
      const isJsdom = typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent);
      if (isJsdom) {
        const text = (html.innerText || html.textContent || '').trim();
        return text.length > 0;
      }
      return false;
    }

    if (rect.bottom <= 0 || rect.top >= window.innerHeight) {
      return false;
    }

    return true;
  }

  private generateMessageId(sender: MessageSender, content: string, position: number): string {
    const hash = this.hashContent(content.substring(0, 50));
    return `msg_${sender}_pos${position}_${hash}`;
  }

  private hashContent(str: string): string {
    let hash = 0;
    if (str.length === 0) {
      return hash.toString(36);
    }

    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash &= hash;
    }

    return Math.abs(hash).toString(36);
  }

  private isInEditMode(element: Element): boolean {
    const editable = element.querySelector('textarea, [contenteditable="true"]');
    if (!editable) {
      return false;
    }

    const active = document.activeElement;
    return !!active && (editable === active || editable.contains(active));
  }
}

export const qwenAdapter = new QwenAdapter();
