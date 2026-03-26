/**
 * 缓存管理器
 * 专注缓存逻辑和内存管理
 */

import { CACHE_EXPIRY, CACHE_MAX_SIZE } from '@/core/constants';
import { Logger } from '@/core/errors';

/**
 * 缓存条目
 */
export interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

/**
 * 缓存管理器
 */
export class CacheManager<K extends string = string, T = any> {
  private cache: Map<K, CacheEntry<T>> = new Map();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private readonly maxSize: number;
  private readonly expiry: number;

  constructor(
    maxSize: number = CACHE_MAX_SIZE,
    expiry: number = CACHE_EXPIRY
  ) {
    this.maxSize = maxSize;
    this.expiry = expiry;
    this.startPeriodicCleanup();
  }

  /**
   * 获取缓存
   */
  get(key: K): T | null {
    const cached = this.cache.get(key);
    if (!cached) {
      return null;
    }

    if (Date.now() - cached.timestamp < this.expiry) {
      return cached.data;
    }

    // 过期，删除
    this.cache.delete(key);
    return null;
  }

  /**
   * 设置缓存
   */
  set(key: K, data: T): void {
    this.cleanupExpired();
    this.enforceMaxSize();

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  /**
   * 删除缓存
   */
  delete(key: K): void {
    this.cache.delete(key);
  }

  /**
   * 清空缓存
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * 判断是否存在
   */
  has(key: K): boolean {
    return this.cache.has(key);
  }

  /**
   * 获取缓存大小
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * 清理过期缓存
   */
  private cleanupExpired(): void {
    const now = Date.now();
    const expiredKeys: K[] = [];

    for (const [key, cached] of this.cache.entries()) {
      if (now - cached.timestamp > this.expiry) {
        expiredKeys.push(key);
      }
    }

    expiredKeys.forEach((key) => this.cache.delete(key));

    if (expiredKeys.length > 0) {
      Logger.debug('[CacheManager] 清理过期缓存', expiredKeys.length, '个条目');
    }
  }

  /**
   * 强制执行最大缓存大小
   */
  private enforceMaxSize(): void {
    while (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
        Logger.debug('[CacheManager] 缓存超限，删除最旧条目:', oldestKey);
      } else {
        break;
      }
    }
  }

  /**
   * 启动定期清理
   */
  private startPeriodicCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpired();
    }, 5 * 60 * 1000); // 每 5 分钟清理一次
  }

  /**
   * 停止定期清理
   */
  private stopPeriodicCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * 获取缓存统计
   */
  getStats(): {
    totalEntries: number;
    expiredEntries: number;
    validEntries: number;
  } {
    const now = Date.now();
    const expiredEntries = Array.from(this.cache.entries()).filter(
      ([, cached]) => now - cached.timestamp > this.expiry
    );

    return {
      totalEntries: this.cache.size,
      expiredEntries: expiredEntries.length,
      validEntries: this.cache.size - expiredEntries.length,
    };
  }

  /**
   * 销毁缓存管理器
   */
  destroy(): void {
    this.stopPeriodicCleanup();
    this.clear();
  }
}
