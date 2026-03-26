/**
 * 消息总线
 * 提供应用内部的消息通信机制
 */

import type { AppEvent, EventListener, AppEventType } from '@/types';

// ============================================================================
// MessageBus 类
// ============================================================================

/**
 * 消息总线
 * 实现发布-订阅模式的消息通信
 */
class MessageBus {
  private static instance: MessageBus | null = null;
  private static listeners: Map<string, Set<EventListener<any>>> = new Map();

  private constructor() {
    // Private constructor for singleton
  }

  /**
   * 获取 MessageBus 单例
   */
  static getInstance(): MessageBus {
    if (!MessageBus.instance) {
      MessageBus.instance = new MessageBus();
    }
    return MessageBus.instance;
  }

  /**
   * 订阅事件
   * @param eventType - 事件类型
   * @param listener - 事件监听器
   * @returns 取消订阅的函数
   */
  subscribe<T>(
    eventType: AppEventType,
    listener: EventListener<T>
  ): () => void {
    if (!MessageBus.listeners.has(eventType)) {
      MessageBus.listeners.set(eventType, new Set());
    }

    MessageBus.listeners.get(eventType)!.add(listener);

    // 返回取消订阅的函数
    return () => {
      MessageBus.listeners.get(eventType)?.delete(listener);
    };
  }

  /**
   * 发布事件
   * @param eventType - 事件类型
   * @param payload - 事件数据
   */
  publish<T>(eventType: AppEventType, payload: T): void {
    const event: AppEvent<T> = {
      type: eventType,
      payload,
      timestamp: Date.now(),
    };

    const listeners = MessageBus.listeners.get(eventType);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(event);
        } catch (error) {
          console.error(`[MessageBus] Error in listener for ${eventType}:`, error);
        }
      });
    }

    // 调试：记录所有事件
    if (import.meta.env?.DEV) {
      console.debug(`[MessageBus] Event published:`, eventType, payload);
    }
  }

  /**
   * 取消特定监听器的订阅
   * @param eventType - 事件类型
   * @param listener - 要取消的监听器
   */
  unsubscribe<T>(
    eventType: AppEventType,
    listener: EventListener<T>
  ): void {
    MessageBus.listeners.get(eventType)?.delete(listener);
  }

  /**
   * 取消事件类型的所有订阅
   * @param eventType - 事件类型
   */
  unsubscribeAll(eventType: AppEventType): void {
    MessageBus.listeners.delete(eventType);
  }

  /**
   * 清空所有监听器
   */
  clear(): void {
    MessageBus.listeners.clear();
  }

  /**
   * 获取当前订阅的监听器数量
   * @param eventType - 事件类型
   */
  getListenerCount(eventType?: AppEventType): number {
    if (eventType) {
      return MessageBus.listeners.get(eventType)?.size || 0;
    }
    return Array.from(MessageBus.listeners.values()).reduce(
      (total, set) => total + set.size,
      0
    );
  }
}

// ============================================================================
// 导出单例和类型
// ============================================================================

export const messageBus = MessageBus.getInstance();

export { MessageBus };
