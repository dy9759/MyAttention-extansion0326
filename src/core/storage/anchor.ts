/**
 * 锚点检测器
 * 实现懒加载锚点算法，支持增量更新
 */

import type { Message, AnchorInfo } from '@/types';
import { Logger } from '@/core/errors';

/**
 * 锚点检测器
 */
export class AnchorDetector {
  /**
   * 头部锚点匹配（性能优化版）
   * @param currentMessages - 当前页面消息
   * @param storedMessages - 存储消息
   * @returns 锚点信息
   */
  static findHeadAnchor(
    currentMessages: Message[],
    storedMessages: Message[]
  ): AnchorInfo {
    if (!currentMessages.length || !storedMessages.length) {
      return { found: false };
    }

    // 预计算存储消息的指纹，避免重复计算
    const storedFingerprints = storedMessages.map(
      (msg) => `${msg.sender}:${msg.content.substring(0, 100)}`
    );

    const anchorSize = Math.min(6, currentMessages.length);

    // 从大到小尝试不同的锚点大小
    for (let size = anchorSize; size >= 1; size--) {
      const anchor = currentMessages
        .slice(0, size)
        .map((msg) => `${msg.sender}:${msg.content.substring(0, 100)}`);

      // 使用字符串连接进行快速匹配，避免嵌套循环
      const anchorString = anchor.join('|');

      for (
        let i = 0;
        i <= storedFingerprints.length - size;
        i++
      ) {
        const storedString = storedFingerprints
          .slice(i, i + size)
          .join('|');

        if (anchorString === storedString) {
          Logger.debug('[AnchorDetector] 锚点匹配成功', { size, position: i });
          return {
            found: true,
            position: i,
            size,
            protectedCount: i,
          };
        }
      }
    }

    return { found: false };
  }

  /**
   * 修正消息 ID（锚点匹配成功时）
   * @param currentMessages - 当前页面消息
   * @param anchorPosition - 锚点在存储中的位置
   * @returns 修正后的消息
   */
  static correctMessageIds(
    currentMessages: Message[],
    anchorPosition: number
  ): Message[] {
    Logger.debug(
      '[AnchorDetector] 修正消息ID以避免重复保存',
      anchorPosition
    );

    return currentMessages.map((message, index) => {
      const correctedPosition = anchorPosition + index;
      // 使用统一的 ID 生成规则，避免重复实现
      const correctedMessageId = `msg_${message.sender}_position_${correctedPosition}`;

      return {
        ...message,
        position: correctedPosition,
        messageId: correctedMessageId,
      };
    });
  }

  /**
   * 检测是否需要全量覆盖
   * @param currentMessages - 当前页面消息
   * @param storedMessages - 存储消息
   * @returns 是否需要全量覆盖
   */
  static shouldFullOverwrite(
    currentMessages: Message[],
    storedMessages: Message[]
  ): boolean {
    if (storedMessages.length === 0) {
      return true;
    }

    // 如果当前消息数大于存储消息数很多，可能需要全量覆盖
    if (currentMessages.length > storedMessages.length * 1.5) {
      return true;
    }

    return false;
  }
}
