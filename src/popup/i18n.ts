/**
 * 国际化模块
 * 提供统一的 i18n 辅助函数
 */

// ============================================================================
// I18n 类
// ============================================================================

/**
 * 国际化管理器
 */
class I18n {
  /**
   * 初始化页面的国际化
   */
  static initPageI18n(): void {
    // 替换页面中的所有 i18n 占位符
    document.querySelectorAll('[data-i18n]').forEach(element => {
      const key = element.getAttribute('data-i18n');
      if (key) {
        const message = chrome.i18n.getMessage(key);
        if (message) {
          element.textContent = message;
        }
      }
    });

    // 替换所有占位符属性
    document.querySelectorAll('[data-i18n-attr]').forEach(element => {
      const attr = element.getAttribute('data-i18n-attr');
      const key = element.getAttribute('data-i18n-key');
      if (attr && key) {
        const message = chrome.i18n.getMessage(key);
        if (message) {
          element.setAttribute(attr, message);
        }
      }
    });

    // 设置 HTML dir 属性
    const dir = chrome.i18n.getMessage('@@ui_locale');
    if (dir) {
      document.documentElement.setAttribute('dir', dir.startsWith('ar') ? 'rtl' : 'ltr');
    }
  }

  /**
   * 获取本地化消息
   */
  static getMessage(messageName: string, substitutions?: string | string[]): string | undefined {
    return chrome.i18n.getMessage(messageName, substitutions);
  }

  /**
   * 获取本地化字符串数组
   */
  static getMessages(keys: string[] = []): { [key: string]: string } {
    return keys.reduce<{ [key: string]: string }>((acc, key) => {
      acc[key] = chrome.i18n.getMessage(key) || '';
      return acc;
    }, {});
  }
}

// ============================================================================
// 导出
// ============================================================================

export { I18n };
