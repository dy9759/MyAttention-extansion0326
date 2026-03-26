import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { chatgptAdapter } from '@/adapters/chatgpt';
import { geminiAdapter } from '@/adapters/gemini';
import { claudeAdapter } from '@/adapters/claude';
import { deepseekAdapter } from '@/adapters/deepseek';
import { kimiAdapter } from '@/adapters/kimi';
import { doubaoAdapter } from '@/adapters/doubao';
import { yuanbaoAdapter } from '@/adapters/yuanbao';
import { qwenAdapter } from '@/adapters/qwen';
import type { Message, PlatformAdapter, PlatformName } from '@/types';

beforeAll(() => {
  if (!Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'innerText')) {
    Object.defineProperty(HTMLElement.prototype, 'innerText', {
      configurable: true,
      get() {
        return this.textContent || '';
      },
      set(value: string) {
        this.textContent = value;
      },
    });
  }
});

beforeEach(() => {
  document.body.innerHTML = '';
});

function expectUserAssistantMessages(messages: Message[]): void {
  expect(messages.length).toBeGreaterThanOrEqual(2);
  expect(messages[0].sender).toBe('user');
  expect(messages[1].sender).toBe('assistant');
  expect(messages[0].content.length).toBeGreaterThan(0);
  expect(messages[1].content.length).toBeGreaterThan(0);
}

function expectConversationInfo(
  adapter: PlatformAdapter,
  url: string,
  _platform: PlatformName
): void {
  expect(adapter.isValidConversationUrl(url)).toBe(true);
  const info = adapter.extractConversationInfo(url) as any;
  const conversationId = info.conversationInfo?.conversationId ?? info.conversationId;
  expect(conversationId).toBeTruthy();
  expect(String(conversationId).length).toBeGreaterThan(0);
}

describe('adapter fixtures', () => {
  it('extracts chatgpt messages', () => {
    document.body.innerHTML = `
      <main>
        <div data-message-author-role="user">
          <div class="whitespace-pre-wrap">chatgpt user</div>
        </div>
        <div data-message-author-role="assistant">
          <div class="markdown prose">chatgpt assistant</div>
        </div>
      </main>
    `;

    const messages = chatgptAdapter.extractMessages();
    expectUserAssistantMessages(messages);
    expectConversationInfo(chatgptAdapter, 'https://chatgpt.com/c/abc123', 'chatgpt');
  });

  it('extracts gemini messages', () => {
    document.body.innerHTML = `
      <div id="chat-history">
        <div class="conversation-container">
          <user-query><div class="query-text">gemini user</div></user-query>
          <model-response><div class="model-response-text">gemini assistant</div></model-response>
        </div>
      </div>
    `;

    const messages = geminiAdapter.extractMessages();
    expectUserAssistantMessages(messages);
    expectConversationInfo(geminiAdapter, 'https://gemini.google.com/app/conv_1', 'gemini');
  });

  it('provides snippet context and dwell candidates for ai adapters', () => {
    document.body.innerHTML = `
      <div id="chat-history">
        <div class="conversation-container">
          <user-query><div class="query-text">gemini user</div></user-query>
          <model-response><div class="model-response-text">gemini assistant</div></model-response>
        </div>
      </div>
    `;

    const textNode = document.querySelector('.model-response-text')?.firstChild as Text;
    const range = document.createRange();
    range.setStart(textNode, 7);
    range.setEnd(textNode, 16);

    const context = geminiAdapter.getSelectionContext?.(range);
    const dwellCandidates = geminiAdapter.getDwellCandidates?.() || [];

    expect(context?.contextText).toBe('gemini assistant');
    expect(context?.selectionText).toBe('assistant');
    expect(context?.messageIndex).toBe(1);
    expect(dwellCandidates).toHaveLength(2);
  });

  it('extracts claude messages', () => {
    document.body.innerHTML = `
      <div data-test-render-count="1">
        <div data-testid="user-message">claude user</div>
      </div>
      <div data-test-render-count="2">
        <div class="font-claude-response">
          <div>claude assistant</div>
        </div>
      </div>
    `;

    const messages = claudeAdapter.extractMessages();
    expectUserAssistantMessages(messages);
    expectConversationInfo(claudeAdapter, 'https://claude.ai/chat/abc123', 'claude');
  });

  it('extracts deepseek messages', () => {
    document.body.innerHTML = `
      <div class="dad65929">
        <div class="_9663006">
          <div class="fbb737a4">deepseek user</div>
        </div>
        <div class="_4f9bf79 _43c05b5">
          <div class="ds-message">
            <div class="ds-markdown">deepseek assistant</div>
          </div>
        </div>
      </div>
    `;

    const messages = deepseekAdapter.extractMessages();
    expectUserAssistantMessages(messages);
    expectConversationInfo(
      deepseekAdapter,
      'https://chat.deepseek.com/a/chat/s/abc123',
      'deepseek'
    );
  });

  it('extracts kimi messages', () => {
    document.body.innerHTML = `
      <div class="chat-content-item chat-content-item-user">
        <div class="user-content">kimi user</div>
      </div>
      <div class="chat-content-item chat-content-item-assistant">
        <div class="markdown-container">kimi assistant</div>
      </div>
    `;

    const messages = kimiAdapter.extractMessages();
    expectUserAssistantMessages(messages);
    expectConversationInfo(kimiAdapter, 'https://kimi.com/chat/abc123', 'kimi');
  });

  it('extracts doubao messages', () => {
    document.body.innerHTML = `
      <div data-testid="union_message">
        <div data-testid="send_message"></div>
        <div data-testid="message_text_content">doubao user</div>
      </div>
      <div data-testid="union_message">
        <div data-testid="receive_message">
          <div data-testid="message_text_content">doubao assistant</div>
        </div>
      </div>
    `;

    const messages = doubaoAdapter.extractMessages();
    expectUserAssistantMessages(messages);
    expectConversationInfo(doubaoAdapter, 'https://doubao.com/chat/abc123', 'doubao');
  });

  it('extracts yuanbao messages', () => {
    document.body.innerHTML = `
      <div class="agent-chat__list__content">
        <div class="agent-chat__list__item--human">
          <div class="hyc-content-text">yuanbao user</div>
        </div>
        <div class="agent-chat__list__item--ai">
          <div class="hyc-component-reasoner__text">yuanbao assistant</div>
        </div>
      </div>
    `;

    const messages = yuanbaoAdapter.extractMessages();
    expectUserAssistantMessages(messages);
    expectConversationInfo(
      yuanbaoAdapter,
      'https://yuanbao.tencent.com/chat/app_1/conv_1',
      'yuanbao'
    );
  });

  it('extracts qwen messages', () => {
    document.body.innerHTML = `
      <main>
        <div data-role="user">
          <div class="message-content">qwen user</div>
        </div>
        <div data-role="assistant">
          <div class="tongyi-markdown">qwen assistant</div>
        </div>
      </main>
      <div class="composer">
        <textarea placeholder="input"></textarea>
      </div>
    `;

    const messages = qwenAdapter.extractMessages();
    expectUserAssistantMessages(messages);
    expectConversationInfo(qwenAdapter, 'https://qwen.ai/home?conversationId=abc123', 'qwen');
    expectConversationInfo(qwenAdapter, 'https://qianwen.com/?conversationId=abc123', 'qwen');
  });
});
