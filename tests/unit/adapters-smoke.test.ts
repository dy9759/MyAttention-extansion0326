import { describe, expect, it } from 'vitest';

import { chatgptAdapter } from '@/adapters/chatgpt';
import { geminiAdapter } from '@/adapters/gemini';
import { claudeAdapter } from '@/adapters/claude';
import { deepseekAdapter } from '@/adapters/deepseek';
import { kimiAdapter } from '@/adapters/kimi';
import { doubaoAdapter } from '@/adapters/doubao';
import { yuanbaoAdapter } from '@/adapters/yuanbao';
import { qwenAdapter } from '@/adapters/qwen';

const adapters = [
  chatgptAdapter,
  geminiAdapter,
  claudeAdapter,
  deepseekAdapter,
  kimiAdapter,
  qwenAdapter,
  doubaoAdapter,
  yuanbaoAdapter,
];

describe('adapter smoke', () => {
  it('exports 8 platform adapters with required methods', () => {
    expect(adapters).toHaveLength(8);

    for (const adapter of adapters) {
      expect(adapter.platform).toBeTruthy();
      expect(typeof adapter.isValidConversationUrl).toBe('function');
      expect(typeof adapter.extractConversationInfo).toBe('function');
      expect(typeof adapter.extractMessages).toBe('function');
      expect(typeof adapter.start).toBe('function');
      expect(typeof adapter.stop).toBe('function');
    }
  });
});
