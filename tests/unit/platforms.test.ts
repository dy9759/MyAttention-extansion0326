import { describe, expect, it } from 'vitest';
import {
  getPlatformFromUrl,
  getSupportedPlatforms,
  isSupportedPlatformUrl,
  SUPPORTED_PLATFORM_MATCH_PATTERNS,
} from '@/core/platforms';

describe('platform url matching', () => {
  it('matches supported platform urls', () => {
    expect(isSupportedPlatformUrl('https://chatgpt.com/c/123')).toBe(true);
    expect(isSupportedPlatformUrl('https://gemini.google.com/app/abc')).toBe(true);
    expect(isSupportedPlatformUrl('https://chat.qwen.ai/chat/123')).toBe(true);
    expect(isSupportedPlatformUrl('https://www.qianwen.com/')).toBe(true);
    expect(isSupportedPlatformUrl('https://qianwen.com/')).toBe(true);
    expect(isSupportedPlatformUrl('https://qwen.ai/home')).toBe(true);
    expect(isSupportedPlatformUrl('https://yuanbao.tencent.com/chat/app/1')).toBe(true);
  });

  it('rejects unsupported platform urls', () => {
    expect(isSupportedPlatformUrl('https://example.com')).toBe(false);
    expect(isSupportedPlatformUrl('chrome://extensions')).toBe(false);
    expect(isSupportedPlatformUrl('')).toBe(false);
  });

  it('resolves platform name and keeps unique match patterns', () => {
    expect(getPlatformFromUrl('https://chat.openai.com/c/1')).toBe('chatgpt');
    expect(getPlatformFromUrl('https://kimi.moonshot.cn/chat/1')).toBe('kimi');
    expect(getPlatformFromUrl('https://chat.qwen.ai/chat/123')).toBe('qwen');
    expect(getPlatformFromUrl('https://www.qianwen.com/')).toBe('qwen');
    expect(getPlatformFromUrl('https://qianwen.com/')).toBe('qwen');
    expect(getPlatformFromUrl('https://qwen.ai/home')).toBe('qwen');
    expect(getPlatformFromUrl('https://not-supported.ai')).toBe(null);

    const supportedPlatforms = getSupportedPlatforms();
    expect(supportedPlatforms).toEqual(
      expect.arrayContaining([
        'chatgpt',
        'gemini',
        'qwen',
        'claude',
        'deepseek',
        'kimi',
        'doubao',
        'yuanbao',
      ])
    );

    expect(SUPPORTED_PLATFORM_MATCH_PATTERNS.length).toBeGreaterThanOrEqual(10);
  });
});
