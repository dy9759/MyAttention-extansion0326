/**
 * 平台配置
 * 定义所有支持的 AI 对话平台及其配置
 */

import type { PlatformConfig } from '@/types/platform';

/**
 * 所有支持的平台配置
 */
export const PLATFORMS: PlatformConfig[] = [
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    domains: [
      {
        hostname: 'chatgpt.com',
        patterns: {
          conversation: [/^\/c\/[a-f0-9]{24,}/],
        },
      },
      {
        hostname: 'chat.openai.com',
        patterns: {
          conversation: [/^\/chat\/[a-f0-9]{24,}/],
        },
      },
    ],
    contentScript: {
      matches: ['https://chatgpt.com/*', 'https://chat.openai.com/*'],
      js: [
        '@/content/common',
        '@/core/compatibility',
        '@/core/storage-manager',
        '@/core/adapter/base',
        '@/adapters/chatgpt',
      ],
      css: ['@/css/content'],
    },
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    domains: [
      {
        hostname: 'chat.deepseek.com',
        patterns: {
          conversation: [],
        },
      },
    ],
    contentScript: {
      matches: ['https://chat.deepseek.com/*'],
      js: [
        '@/content/common',
        '@/core/compatibility',
        '@/core/storage-manager',
        '@/core/adapter/base',
        '@/adapters/deepseek',
      ],
      css: ['@/css/content'],
    },
  },
  {
    id: 'gemini',
    name: 'Gemini',
    domains: [
      {
        hostname: 'gemini.google.com',
        patterns: {
          conversation: [/^\/app\/.*/, /^\/gem\/.*/],
        },
      },
    ],
    contentScript: {
      matches: ['https://gemini.google.com/*'],
      js: [
        '@/content/common',
        '@/core/compatibility',
        '@/core/storage-manager',
        '@/core/adapter/base',
        '@/adapters/gemini',
      ],
      css: ['@/css/content'],
    },
  },
  {
    id: 'claude',
    name: 'Claude',
    domains: [
      {
        hostname: 'claude.ai',
        patterns: {
          conversation: [/^\/chat\/.*/],
        },
      },
    ],
    contentScript: {
      matches: ['https://claude.ai/*'],
      js: [
        '@/content/common',
        '@/core/compatibility',
        '@/core/storage-manager',
        '@/core/adapter/base',
        '@/adapters/claude',
      ],
      css: ['@/css/content'],
    },
  },
  {
    id: 'yuanbao',
    name: '腾讯元宝',
    domains: [
      {
        hostname: 'yuanbao.tencent.com',
        patterns: {
          conversation: [],
        },
      },
    ],
    contentScript: {
      matches: ['https://yuanbao.tencent.com/*'],
      js: [
        '@/content/common',
        '@/core/compatibility',
        '@/core/storage-manager',
        '@/core/adapter/base',
        '@/adapters/yuanbao',
      ],
      css: ['@/css/content'],
    },
  },
  {
    id: 'doubao',
    name: '豆包',
    domains: [
      {
        hostname: 'doubao.com',
        patterns: {
          conversation: [],
        },
      },
    ],
    contentScript: {
      matches: ['https://doubao.com/*'],
      js: [
        '@/content/common',
        '@/core/compatibility',
        '@/core/storage-manager',
        '@/core/adapter/base',
        '@/adapters/doubao',
      ],
      css: ['@/css/content'],
    },
  },
  {
    id: 'kimi',
    name: 'Kimi',
    domains: [
      {
        hostname: 'kimi.moonshot.cn',
        patterns: {
          conversation: [],
        },
      },
      {
        hostname: 'kimi.com',
        patterns: {
          conversation: [],
        },
      },
    ],
    contentScript: {
      matches: ['https://kimi.moonshot.cn/*', 'https://*.kimi.com/*'],
      js: [
        '@/content/common',
        '@/core/compatibility',
        '@/core/storage-manager',
        '@/core/adapter/base',
        '@/adapters/kimi',
      ],
      css: ['@/css/content'],
    },
  },
];

/**
 * 根据 URL 匹配平台
 */
export function matchPlatformByUrl(url: string): PlatformConfig | null {
  try {
    const urlObj = new URL(url);

    for (const platform of PLATFORMS) {
      for (const domain of platform.domains) {
        if (urlObj.hostname === domain.hostname) {
          return platform;
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * 获取平台配置
 */
export function getPlatformById(id: string): PlatformConfig | null {
  return PLATFORMS.find(p => p.id === id) || null;
}

/**
 * 检查 URL 是否受支持
 */
export function isSupportedUrl(url: string): boolean {
  return matchPlatformByUrl(url) !== null;
}
