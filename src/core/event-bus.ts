/**
 * 事件总线
 * 提供应用内部的事件系统
 */

import type { AppEvent, EventListener, AppEventType } from '@/types';

// ============================================================================
// EventBus 类
// ============================================================================

/**
 * 事件总线
 * 实现发布-订阅模式的内存事件通信
 */
class EventBus {
  private static instance: EventBus | null = null;
  private static listeners: Map<string, Set<EventListener<any>>> = new Map();
  private static eventHistory: AppEvent<any>[] = [];
  private static maxHistorySize = 100;

  private constructor() {
    // Private constructor for singleton
  }

  /**
   * 获取 EventBus 单例
   */
  static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  /**
   * 订阅事件
   * @param eventType - 事件类型
   * @param listener - 事件监听器
   * @returns 取消订阅的函数
   */
  subscribe<T>(
    eventType: AppEventType,
    listener: EventListener<T>,
    options?: {
      once?: boolean; // 只触发一次
    }
  ): () => void {
    const wrappedListener: EventListener<T> = (event) => {
      if (options?.once) {
        this.unsubscribe(eventType, wrappedListener);
      }
      listener(event);
    };

    if (!EventBus.listeners.has(eventType)) {
      EventBus.listeners.set(eventType, new Set());
    }

    EventBus.listeners.get(eventType)!.add(wrappedListener);

    // 返回取消订阅的函数
    return () => {
      this.unsubscribe(eventType, wrappedListener);
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

    // 记录事件历史
    EventBus.eventHistory.push(event);
    if (EventBus.eventHistory.length > EventBus.maxHistorySize) {
      EventBus.eventHistory.shift();
    }

    // 通知所有监听器
    const listeners = EventBus.listeners.get(eventType);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(event);
        } catch (error) {
          console.error(`[EventBus] Error in listener for ${eventType}:`, error);
        }
      });
    }

    // 调试：记录所有事件
    if (import.meta.env?.DEV) {
      console.log(`[EventBus] Event published: ${eventType}`, event);
    }
  }

  /**
   * 订阅事件并立即执行一次
   * @param eventType - 事件类型
   * @param listener - 事件监听器
   */
  subscribeOnce<T>(
    eventType: AppEventType,
    listener: EventListener<T>
  ): () => void {
    return this.subscribe(eventType, listener, { once: true });
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
    EventBus.listeners.get(eventType)?.delete(listener);
  }

  /**
   * 兼容旧 API：on -> subscribe
   */
  on<T>(
    eventType: AppEventType,
    listener: (payload: T) => void
  ): () => void {
    return this.subscribe<T>(eventType, (event) => listener(event.payload));
  }

  /**
   * 兼容旧 API：emit -> publish
   */
  emit<T>(eventType: AppEventType, payload: T): void {
    this.publish(eventType, payload);
  }

  /**
   * 兼容旧 API：off -> unsubscribe
   */
  off<T>(eventType: AppEventType, listener: EventListener<T>): void {
    this.unsubscribe(eventType, listener);
  }

  /**
   * 取消事件类型的所有订阅
   * @param eventType - 事件类型
   */
  unsubscribeAll(eventType: AppEventType): void {
    EventBus.listeners.delete(eventType);
  }

  /**
   * 清空所有监听器
   */
  clear(): void {
    EventBus.listeners.clear();
    EventBus.eventHistory = [];
  }

  /**
   * 获取事件历史
   * @param eventType - 事件类型（可选）
   */
  getHistory(eventType?: AppEventType): AppEvent<any>[] {
    if (eventType) {
      return EventBus.eventHistory.filter(e => e.type === eventType);
    }
    return [...EventBus.eventHistory];
  }

  /**
   * 清空事件历史
   */
  clearHistory(): void {
    EventBus.eventHistory = [];
  }

  /**
   * 获取当前订阅的监听器数量
   * @param eventType - 事件类型
   */
  getListenerCount(eventType?: AppEventType): number {
    if (eventType) {
      return EventBus.listeners.get(eventType)!.size || 0;
    }
    return Array.from(EventBus.listeners.values()).reduce(
      (total, set) => total + set.size,
      0
    );
  }

  /**
   * 等待事件
   * @param eventType - 要等待的事件类型
   * @param timeout - 超时时间（毫秒）
   * @param condition - 等待条件函数
   */
  waitFor<T>(
    eventType: AppEventType,
    options?: {
      timeout?: number; // 超时时间（毫秒），默认 5000
      condition?: (event: AppEvent<T>) => boolean; // 等待条件
    }
  ): Promise<AppEvent<T>> {
    return new Promise((resolve, reject) => {
      const timeoutId = options?.timeout || 5000;
      const timeoutIdToken = setTimeout(() => {
        reject(new Error(`Timeout waiting for event: ${eventType}`));
      }, timeoutId);

      const unsubscribe = this.subscribe<T>(eventType, (event) => {
        if (!options?.condition || options.condition(event)) {
          clearTimeout(timeoutIdToken);
          unsubscribe();
          resolve(event);
        }
      });
    });
  }
}

// ============================================================================
// 导出单例和类型
// ============================================================================

export const eventBus = EventBus.getInstance();

export { EventBus };
