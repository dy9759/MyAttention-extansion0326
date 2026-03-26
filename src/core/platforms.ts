import type { PlatformName } from '@/types';

export interface SupportedPlatformRule {
  name: PlatformName;
  urlPrefix: string;
  matchPattern: string;
}

export const SUPPORTED_PLATFORM_RULES: SupportedPlatformRule[] = [
  {
    name: 'deepseek',
    urlPrefix: 'https://chat.deepseek.com',
    matchPattern: 'https://chat.deepseek.com/*',
  },
  {
    name: 'chatgpt',
    urlPrefix: 'https://chatgpt.com',
    matchPattern: 'https://chatgpt.com/*',
  },
  {
    name: 'chatgpt',
    urlPrefix: 'https://chat.openai.com',
    matchPattern: 'https://chat.openai.com/*',
  },
  {
    name: 'gemini',
    urlPrefix: 'https://gemini.google.com',
    matchPattern: 'https://gemini.google.com/*',
  },
  {
    name: 'qwen',
    urlPrefix: 'https://chat.qwen.ai',
    matchPattern: 'https://chat.qwen.ai/*',
  },
  {
    name: 'qwen',
    urlPrefix: 'https://www.qianwen.com',
    matchPattern: 'https://www.qianwen.com/*',
  },
  {
    name: 'qwen',
    urlPrefix: 'https://qianwen.com',
    matchPattern: 'https://qianwen.com/*',
  },
  {
    name: 'qwen',
    urlPrefix: 'https://qwen.ai',
    matchPattern: 'https://qwen.ai/*',
  },
  {
    name: 'yuanbao',
    urlPrefix: 'https://yuanbao.tencent.com',
    matchPattern: 'https://yuanbao.tencent.com/*',
  },
  {
    name: 'doubao',
    urlPrefix: 'https://www.doubao.com',
    matchPattern: 'https://www.doubao.com/*',
  },
  {
    name: 'doubao',
    urlPrefix: 'https://doubao.com',
    matchPattern: 'https://doubao.com/*',
  },
  {
    name: 'claude',
    urlPrefix: 'https://claude.ai',
    matchPattern: 'https://claude.ai/*',
  },
  {
    name: 'kimi',
    urlPrefix: 'https://kimi.moonshot.cn',
    matchPattern: 'https://kimi.moonshot.cn/*',
  },
  {
    name: 'kimi',
    urlPrefix: 'https://kimi.com',
    matchPattern: 'https://kimi.com/*',
  },
  {
    name: 'kimi',
    urlPrefix: 'https://www.kimi.com',
    matchPattern: 'https://www.kimi.com/*',
  },
];

export const SUPPORTED_PLATFORM_MATCH_PATTERNS = Array.from(
  new Set(SUPPORTED_PLATFORM_RULES.map((rule) => rule.matchPattern))
);

export function isSupportedPlatformUrl(url: string): boolean {
  if (!url) {
    return false;
  }
  return SUPPORTED_PLATFORM_RULES.some((rule) => url.startsWith(rule.urlPrefix));
}

export function getPlatformFromUrl(url: string): PlatformName | null {
  const matched = SUPPORTED_PLATFORM_RULES.find((rule) => url.startsWith(rule.urlPrefix));
  return matched?.name || null;
}

export function getSupportedPlatforms(): PlatformName[] {
  return Array.from(new Set(SUPPORTED_PLATFORM_RULES.map((rule) => rule.name)));
}
