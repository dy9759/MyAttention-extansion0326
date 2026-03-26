/**
 * 导出管理模块
 * 负责处理对话导出为 TXT/ZIP 文件
 */

import type { Conversation, Message } from '@/types';
import type { ExportFormat, ExportMetadata } from './types';
import { Logger } from '@/core/errors';
import { formatPlatformName, formatDateTimeForDisplay } from '../utils';
import { safeSendRuntimeMessage } from './chrome-safe';
import { EXPORT_FILENAME_PREFIX } from '@/core/constants';

// ============================================================================
// 常量定义
// ============================================================================

/**
 * 导出按钮状态
 */
export type ExportButtonState = 'idle' | 'loading' | 'success' | 'error';

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 导出选项
 */
export interface ExportOptions {
  conversationIds: string[];
  format: ExportFormat;
  metadata: ExportMetadata;
  buttonElement?: HTMLButtonElement;
}

// ============================================================================
// 导出管理类
// ============================================================================

/**
 * 导出管理器
 */
export class ExportManager {
  private state: ExportButtonState = 'idle';

  /**
   * 导出对话
   */
  async exportConversations(options: ExportOptions): Promise<void> {
    const { conversationIds, format, metadata, buttonElement } = options;

    this.setState('loading', buttonElement);

    try {
      // 获取对话数据
      const conversations = await this.getConversations(conversationIds);

      if (conversations.length === 0) {
        this.setState('error', buttonElement);
        return;
      }

      // 执行导出
      if (format === 'separate') {
        await this.exportAsSeparateFiles(conversations, metadata);
      } else {
        await this.exportAsMergedFile(conversations, metadata);
      }

      this.setState('success', buttonElement);

      // 3秒后恢复按钮状态
      setTimeout(() => {
        this.setState('idle', buttonElement);
      }, 3000);
    } catch (error) {
      Logger.error('[ExportManager] 导出失败:', error);
      this.setState('error', buttonElement);
    }
  }

  /**
   * 获取对话数据
   */
  private async getConversations(
    conversationIds: string[]
  ): Promise<Conversation[]> {
    const response = await safeSendRuntimeMessage({
      type: 'getConversationsByIds',
      conversationIds,
    });

    if (response?.conversations) {
      return response.conversations as Conversation[];
    }

    throw new Error('Failed to get conversations');
  }

  /**
   * 分别导出为多个文件
   */
  private async exportAsSeparateFiles(
    conversations: Conversation[],
    metadata: ExportMetadata
  ): Promise<void> {
    const filename = this.generateFilename(1, 'txt');

    for (let i = 0; i < conversations.length; i++) {
      const content = this.formatConversation(conversations[i], i + 1);
      const fileContent = this.createFileContent(conversations[i], i + 1);
      const fileName = this.cleanFilename(
        conversations[i].title || `conversation_${i + 1}`,
        50
      );

      await this.downloadFile(content, `${fileName}.txt`);
    }

    Logger.info(
      `[ExportManager] 已导出 ${conversations.length} 个对话为单独文件`
    );
  }

  /**
   * 合并导出为单个文件
   */
  private async exportAsMergedFile(
    conversations: Conversation[],
    metadata: ExportMetadata
  ): Promise<void> {
    const content = conversations
      .map((conv, index) => this.formatConversation(conv, index + 1))
      .join('\n\n' + '===\n\n' + '='.repeat(50) + '\n\n');

    const filename = this.generateFilename(conversations.length, 'txt');

    await this.downloadFile(content, filename);

    Logger.info(
      `[ExportManager] 已导出 ${conversations.length} 个对话为合并文件`
    );
  }

    /**
   * 格式化对话内容
   */
  private formatConversation(
    conversation: Conversation,
    index: number
  ): string {
    const header = `# Conversation ${index}\n`;
    const title = `Title: ${conversation.title || 'No Title'}\n`;
    const url = `Original URL: ${conversation.link || 'N/A'}\n`;
    const platform = `Platform: ${formatPlatformName(conversation.platform)}\n`;
    const createdAt = `Created At: ${formatDateTimeForDisplay(
      new Date(conversation.createdAt)
    )}\n`;
    const messageCount = `Total Messages: ${conversation.messages.length || 0}\n`;
    const divider = '-'.repeat(50) + '\n';

    let content = header + title + url + platform + createdAt + messageCount + divider + '\n\n';

    // 添加消息
    if (conversation.messages && conversation.messages.length > 0) {
      conversation.messages.forEach((message) => {
        const sender = message.sender === 'user' ? 'User' : 'AI';
        const timestamp = message.createdAt
          ? formatDateTimeForDisplay(new Date(message.createdAt))
          : '';
        const prefix = timestamp ? `${sender} [${timestamp}]:\n` : `${sender}: `;

        content += prefix + message.content + '\n\n';

        // 添加思考内容
        if (message.thinking) {
          content += `<Thinking Process>\n${message.thinking}\n</Thinking Process>\n\n`;
        }
      });
    }

    return content;
  }

  /**
   * 创建文件头信息
   */
  private createFileContent(
    conversation: Conversation,
    index: number
  ): string {
    const header = `# Conversation ${index}\n`;
    const title = `Title: ${conversation.title || 'No Title'}\n`;
    const url = `Original URL: ${conversation.link || 'N/A'}\n`;
    const platform = `Platform: ${formatPlatformName(conversation.platform)}\n`;
    const createdAt = `Created At: ${formatDateTimeForDisplay(
      new Date(conversation.createdAt)
    )}\n`;
    const messageCount = `Total Messages: ${conversation.messages.length || 0}\n`;
    const divider = '-'.repeat(50);

    return header + title + url + platform + createdAt + messageCount + divider;
  }

  /**
   * 生成文件名
   */
  private generateFilename(count: number, fileType: 'txt' | 'zip'): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `${EXPORT_FILENAME_PREFIX}${count}_conversations_${timestamp}.${fileType}`;
  }

  /**
   * 清理文件名
   */
  private cleanFilename(filename: string, maxLength: number): string {
    return filename
      .replace(/[<>:"/|?*\\/\\\\]/g, '')
      .substring(0, maxLength);
  }

  /**
   * 下载文件
   */
  private async downloadFile(content: string, filename: string): Promise<void> {
    // 创建 Blob
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    // 创建下载链接
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);

    a.click();

    // 清理
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  /**
   * 设置按钮状态
   */
  private setState(
    state: ExportButtonState,
    buttonElement?: HTMLButtonElement
  ): void {
    if (!buttonElement) {
      return;
    }

    this.state = state;

    switch (state) {
      case 'loading':
        buttonElement.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        buttonElement.disabled = true;
        break;
      case 'success':
        buttonElement.innerHTML = '<i class="fas fa-check text-green-600"></i>';
        buttonElement.disabled = false;
        break;
      case 'error':
        buttonElement.innerHTML = '<i class="fas fa-times text-red-600"></i>';
        buttonElement.disabled = false;
        break;
      case 'idle':
      default:
        buttonElement.innerHTML = '<i class="fas fa-download"></i>';
        buttonElement.disabled = false;
        break;
    }
  }
}

// ============================================================================
// 导出单例
// ============================================================================

export const exportManager = new ExportManager();
