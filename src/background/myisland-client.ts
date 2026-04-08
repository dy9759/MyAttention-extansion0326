/**
 * MyIsland 推送客户端
 * 将浏览器 AI 对话和总结任务事件推送到 MyIsland macOS 应用
 */

const MYISLAND_BASE = 'http://127.0.0.1:1996/api/v1';

async function sendEvent(type: string, payload: Record<string, any>): Promise<void> {
  try {
    console.log(`[MyIsland] Sending event: ${type}`, payload);
    const resp = await fetch(`${MYISLAND_BASE}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, payload }),
      signal: AbortSignal.timeout(3000),
    });
    console.log(`[MyIsland] Response: ${resp.status}`);
  } catch (e) {
    console.warn(`[MyIsland] Failed to send event: ${type}`, e);
  }
}

/**
 * 通知 MyIsland 对话已更新
 */
export function notifyConversationUpdated(conv: {
  conversationId?: string;
  platform?: string;
  title?: string;
  link?: string;
  messageCount?: number;
  messages?: Array<{ sender: string; content: string; createdAt: string }>;
  updatedAt?: string;
}): void {
  if (!conv.conversationId || !conv.platform || !conv.title) return;

  const lastMsg = conv.messages?.[conv.messages.length - 1];
  void sendEvent('conversation_updated', {
    conversationId: conv.conversationId,
    platform: conv.platform,
    title: conv.title,
    link: conv.link ?? '',
    messageCount: conv.messageCount ?? conv.messages?.length ?? 0,
    lastMessage: lastMsg
      ? {
          sender: lastMsg.sender,
          content: lastMsg.content.slice(0, 200),
          createdAt: lastMsg.createdAt,
        }
      : null,
    updatedAt: conv.updatedAt ?? new Date().toISOString(),
  });
}

/**
 * 通知 MyIsland 总结任务开始
 */
export function notifySummaryStarted(
  taskId: string,
  mode: string,
  topic?: string,
  conversationCount?: number
): void {
  void sendEvent('summary_started', {
    taskId,
    mode,
    topic: topic ?? null,
    conversationCount: conversationCount ?? 0,
    startedAt: new Date().toISOString(),
  });
}

/**
 * 通知 MyIsland 总结任务完成
 */
export function notifySummaryCompleted(
  taskId: string,
  mode: string,
  topic: string | undefined,
  status: 'done' | 'error',
  summary?: string
): void {
  void sendEvent('summary_completed', {
    taskId,
    mode,
    topic: topic ?? null,
    status,
    summary: summary ? summary.slice(0, 500) : null,
    completedAt: new Date().toISOString(),
  });
}
