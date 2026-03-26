/**
 * 错误处理模块
 * 提供统一的错误处理和日志记录机制
 */

import { SaySoError, ERROR_CODES } from '@/types';

// ============================================================================
// 日志级别
// ============================================================================

/**
 * 日志级别
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4,
}

// ============================================================================
// Logger 类
// ============================================================================

/**
 * 日志记录器
 */
class Logger {
  private static currentLevel: LogLevel = LogLevel.INFO;

  /**
   * 设置日志级别
   */
  static setLevel(level: LogLevel): void {
    Logger.currentLevel = level;
  }

  /**
   * 调试日志
   */
  static debug(message: string, ...args: any[]): void {
    if (Logger.currentLevel <= LogLevel.DEBUG) {
      console.debug(`[DEBUG] ${message}`, ...args);
    }
  }

  /**
   * 信息日志
   */
  static info(message: string, ...args: any[]): void {
    if (Logger.currentLevel <= LogLevel.INFO) {
      console.info(`[INFO] ${message}`, ...args);
    }
  }

  /**
   * 警告日志
   */
  static warn(message: string, ...args: any[]): void {
    if (Logger.currentLevel <= LogLevel.WARN) {
      console.warn(`[WARN] ${message}`, ...args);
    }
  }

  /**
   * 错误日志
   */
  static error(message: string, ...args: any[]): void {
    if (Logger.currentLevel <= LogLevel.ERROR) {
      console.error(`[ERROR] ${message}`, ...args);
    }
  }

  /**
   * 致命错误日志
   */
  static fatal(message: string, ...args: any[]): void {
    if (Logger.currentLevel <= LogLevel.FATAL) {
      console.error(`[FATAL] ${message}`, ...args);
    }
  }
}

// ============================================================================
// 错误工厂类
// ============================================================================

/**
 * 错误工厂
 * 提供便捷的错误创建方法
 */
export class ErrorFactory {
  /**
   * 创建数据库错误
   */
  static database(message: string, cause?: unknown): SaySoError {
    return new SaySoError(
      ERROR_CODES.DB_OPEN_FAILED,
      message,
      { cause }
    );
  }

  /**
   * 创建验证错误
   */
  static validation(
    type: keyof typeof ERROR_CODES,
    message: string,
    context?: any
  ): SaySoError {
    return new SaySoError(
      ERROR_CODES[type],
      message,
      { context }
    );
  }

  /**
   * 创建提取错误
   */
  static extraction(message: string, context?: any): SaySoError {
    return new SaySoError(
      ERROR_CODES.EXTRACTION_FAILED,
      message,
      { context }
    );
  }

  /**
   * 创建存储错误
   */
  static storage(message: string, cause?: unknown): SaySoError {
    return new SaySoError(
      ERROR_CODES.STORAGE_WRITE_FAILED,
      message,
      { cause }
    );
  }

  /**
   * 创建网络错误
   */
  static network(message: string, context?: any): SaySoError {
    return new SaySoError(
      ERROR_CODES.NETWORK_ERROR,
      message,
      { context }
    );
  }

  /**
   * 创建平台错误
   */
  static platform(
    type: keyof typeof ERROR_CODES,
    message: string,
    platform?: string
  ): SaySoError {
    return new SaySoError(
      ERROR_CODES[type],
      message,
      { context: { platform } }
    );
  }

  /**
   * 创建运行时错误
   */
  static runtime(message: string, context?: any): SaySoError {
    return new SaySoError(
      ERROR_CODES.API_ERROR,
      message,
      { context }
    );
  }
}

// ============================================================================
// 错误处理器
// ============================================================================

/**
 * 错误处理策略
 */
export interface ErrorHandlingStrategy {
  /** 是否应该记录错误 */
  shouldLog: boolean;
  /** 是否应该显示用户通知 */
  shouldNotify: boolean;
  /** 是否应该重试 */
  shouldRetry: boolean;
  /** 最大重试次数 */
  maxRetries?: number;
}

/**
 * 默认错误处理策略
 */
export const DEFAULT_ERROR_STRATEGY: ErrorHandlingStrategy = {
  shouldLog: true,
  shouldNotify: false,
  shouldRetry: false,
};

/**
 * 错误处理器
 */
export class ErrorHandler {
  private static strategies: Map<string, ErrorHandlingStrategy> = new Map();

  /**
   * 注册错误处理策略
   */
  static registerStrategy(
    errorCode: string,
    strategy: ErrorHandlingStrategy
  ): void {
    ErrorHandler.strategies.set(errorCode, strategy);
  }

  /**
   * 处理错误
   */
  static handle(error: unknown): void {
    const normalizedError =
      error instanceof Error ? error : new Error(String(error));
    const code = normalizedError instanceof SaySoError ? normalizedError.code : 'UNKNOWN';
    const strategy = ErrorHandler.strategies.get(code) || DEFAULT_ERROR_STRATEGY;

    if (strategy.shouldLog) {
      Logger.error(normalizedError.message, normalizedError);
    }

    if (strategy.shouldNotify) {
      ErrorHandler.notifyUser(normalizedError);
    }

    if (strategy.shouldRetry) {
      // TODO: 实现重试逻辑
    }
  }

  /**
   * 通知用户错误
   */
  private static notifyUser(error: unknown): void {
    // TODO: 实现用户通知逻辑（如显示 toast 消息）
    const normalizedError =
      error instanceof Error ? error : new Error(String(error));
    Logger.warn('User notification would be shown:', normalizedError.message);
  }

  /**
   * 包装异步函数，自动处理错误
   */
  static async wrap<T>(
    fn: () => Promise<T>,
    options?: {
      fallback?: T;
      onError?: (error: unknown) => void;
    }
  ): Promise<T> {
    try {
      return await fn();
    } catch (error: unknown) {
      ErrorHandler.handle(error);
      options?.onError?.(error);
      return options?.fallback as T;
    }
  }
}

// ============================================================================
// 开发环境初始化
// ============================================================================

if (import.meta.env?.DEV) {
  Logger.setLevel(LogLevel.DEBUG);
} else {
  Logger.setLevel(LogLevel.INFO);
}

// 导出
export { Logger, ERROR_CODES };
