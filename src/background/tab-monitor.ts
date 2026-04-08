/**
 * 后台标签页监控模块
 * 检测 AI Chat 标签页在后台时的更新状态，并发送通知
 */

import { Logger } from '@/core/errors';
import { isSupportedPlatformUrl, getPlatformFromUrl } from '@/core/platforms';

const ALARM_NAME = 'sayso-tab-monitor';
const CHECK_INTERVAL_MINUTES = 1;

/** 跟踪每个标签页最后已知的保存时间 */
const lastKnownSaveAt = new Map<number, string>();

/**
 * 启动后台标签页监控
 */
export function startTabMonitor(): void {
  chrome.alarms.create(ALARM_NAME, {
    periodInMinutes: CHECK_INTERVAL_MINUTES,
  });

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_NAME) {
      void checkBackgroundTabs();
    }
  });

  Logger.info('[TabMonitor] 后台标签页监控已启动');
}

/**
 * 检查所有后台 AI Chat 标签页
 */
async function checkBackgroundTabs(): Promise<void> {
  try {
    const tabs = await chrome.tabs.query({});
    const activeTab = (await chrome.tabs.query({ active: true, currentWindow: true }))[0];

    for (const tab of tabs) {
      if (!tab.id || !tab.url) continue;
      // 仅监控支持平台且非当前活跃标签
      if (!isSupportedPlatformUrl(tab.url)) continue;
      if (activeTab && tab.id === activeTab.id) continue;

      try {
        const response = await chrome.tabs.sendMessage(tab.id, {
          type: 'content:healthPing',
        });

        if (response?.type === 'content:healthPong' && response.lastSaveAt) {
          const prevSaveAt = lastKnownSaveAt.get(tab.id);
          if (prevSaveAt && response.lastSaveAt !== prevSaveAt) {
            // 检测到新的保存 → 发送通知
            const platform = getPlatformFromUrl(tab.url);
            void sendCompletionNotification(tab, platform || 'AI');
          }
          lastKnownSaveAt.set(tab.id, response.lastSaveAt);
        }
      } catch {
        // 内容脚本未注入或标签页不可达，忽略
      }
    }
  } catch (error) {
    Logger.error('[TabMonitor] 检查后台标签页失败', error);
  }
}

/**
 * 发送 AI 完成通知 (MyIsland)
 */
async function sendCompletionNotification(
  tab: chrome.tabs.Tab,
  platformName: string
): Promise<void> {
  try {
    await chrome.notifications.create(`sayso-complete-${tab.id}`, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/logo_128.png'),
      title: 'AI 回答已完成',
      message: `${platformName} 的对话已更新：${tab.title || '未知标题'}`,
      priority: 1,
    });

    Logger.info(`[TabMonitor] 已发送通知: tab ${tab.id} (${platformName})`);
  } catch (error) {
    Logger.error('[TabMonitor] 发送通知失��', error);
  }
}

/**
 * 清理已关闭标签页的跟踪数据
 */
export function cleanupTabMonitor(tabId: number): void {
  lastKnownSaveAt.delete(tabId);
}
