/**
 * 悬浮标签模块
 * 负责创建可拖拽的悬浮标签、边缘停靠和位置管理
 */

import type { FloatTagPosition } from '@/content/common';
import {
  isSupportedPlatform,
  loadSettingsFromStorage,
  saveFloatTagPosition,
  restoreFloatTagPosition,
  calculatePixelPosition,
  constrainPosition,
  createLogoHTML,
  markAsInitialized,
  safeInit,
  loadFontAwesome,
  getSafeI18nMessage,
} from '@/content/common';
import { eventBus } from '@/core/event-bus';
import { Logger } from '@/core/errors';
import {
  chromeMessageAdapter,
  isExtensionContextInvalidatedError,
  isRuntimeContextAvailable,
} from '@/core/chrome-message';

// ============================================================================
// 常量定义
// ============================================================================

/**
 * 拖动检测阈值（像素）
 */
const DRAG_THRESHOLD = 5;

/**
 * 边缘停靠检测阈值（像素）
 */
const EDGE_THRESHOLD = 50;

/**
 * 成功状态显示时长（毫秒）
 */
const SUCCESS_DURATION = 1500;

/**
 * 可见性自检首次延迟（毫秒）
 */
const VISIBILITY_CHECK_DELAY_MS = 120;

/**
 * 可见性自检重试间隔（毫秒）
 */
const VISIBILITY_RETRY_INTERVAL_MS = 220;

/**
 * 可见性自检最大重试次数
 */
const VISIBILITY_MAX_RETRIES = 2;

/**
 * CSS 类名前缀
 */
const CLASS_PREFIX = 'sayso-';

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 悬浮标签状态
 */
type FloatTagState = 'auto-save' | 'manual-save' | 'success';

/**
 * 边缘停靠侧
 */
type DockSide = 'left' | 'right';

// ============================================================================
// 全局变量
// ============================================================================

/**
 * 悬浮标签元素
 */
let floatTagElement: HTMLDivElement | null = null;

/**
 * 图标元素
 */
let iconElement: HTMLDivElement | null = null;

/**
 * 状态元素
 */
let statusElement: HTMLDivElement | null = null;

/**
 * 保存按钮元素
 */
let saveButton: HTMLDivElement | null = null;

/**
 * 拖动状态
 */
let isDragging = false;

/**
 * 拖动起始位置
 */
let dragStartX = 0;
let dragStartY = 0;

/**
 * 拖动初始元素位置
 */
let initialX = 0;
let initialY = 0;

/**
 * 点击开始时间
 */
let clickStartTime = 0;

/**
 * 边缘引导元素
 */
let leftEdgeGuide: HTMLDivElement | null = null;
let rightEdgeGuide: HTMLDivElement | null = null;

/**
 * 边缘停靠状态
 */
let isEdgeDocked = false;

/**
 * 停靠侧
 */
let dockedSide: DockSide | null = null;

/**
 * 窗口大小调整防抖定时器
 */
let resizeTimeout: number | null = null;

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 添加 CSS 类
 */
function addClass(...classNames: string[]): void {
  if (!floatTagElement) return;
  floatTagElement.classList.add(...classNames);
}

/**
 * 移除 CSS 类
 */
function removeClass(...classNames: string[]): void {
  if (!floatTagElement) return;
  floatTagElement.classList.remove(...classNames);
}

/**
 * 检查是否包含 CSS 类
 */
function hasClass(className: string): boolean {
  if (!floatTagElement) return false;
  return floatTagElement.classList.contains(className);
}

/**
 * 设置元素样式
 */
function setStyle(styles: Partial<CSSStyleDeclaration>): void {
  if (!floatTagElement) return;
  Object.assign(floatTagElement.style, styles);
}

/**
 * 初始化后的可见性自检（防止被页面样式覆盖或出屏）
 */
function ensureFloatTagVisible(): boolean {
  if (!floatTagElement) {
    return false;
  }

  setStyle({
    display: 'flex',
    visibility: 'visible',
    opacity: '1',
  });

  const rect = floatTagElement.getBoundingClientRect();
  const style = window.getComputedStyle(floatTagElement);
  const hiddenByStyle =
    style.display === 'none' ||
    style.visibility === 'hidden' ||
    style.opacity === '0';
  const outOfViewport =
    rect.bottom <= 0 ||
    rect.right <= 0 ||
    rect.top >= window.innerHeight ||
    rect.left >= window.innerWidth;

  if (hiddenByStyle || rect.width === 0 || rect.height === 0 || outOfViewport) {
    // 回退到固定默认位置，避免由于历史位置/页面样式导致完全不可见
    setStyle({
      left: '20px',
      top: '20px',
      right: 'auto',
    });
  }

  const nextRect = floatTagElement.getBoundingClientRect();
  const visible =
    nextRect.width > 0 &&
    nextRect.height > 0 &&
    nextRect.bottom > 0 &&
    nextRect.right > 0 &&
    nextRect.top < window.innerHeight &&
    nextRect.left < window.innerWidth;

  Logger.debug('[FloatTag] 可见性自检结果:', {
    visible,
    rect: {
      left: nextRect.left,
      top: nextRect.top,
      width: nextRect.width,
      height: nextRect.height,
    },
  });

  return visible;
}

function runFloatTagVisibilityCheck(attempt = 0): void {
  const visible = ensureFloatTagVisible();
  if (visible) {
    return;
  }

  if (attempt < VISIBILITY_MAX_RETRIES) {
    window.setTimeout(() => {
      runFloatTagVisibilityCheck(attempt + 1);
    }, VISIBILITY_RETRY_INTERVAL_MS);
    return;
  }

  Logger.warn('[FloatTag] 可见性自检失败，已回退默认位置');
}

// ============================================================================
// 边缘引导管理
// ============================================================================

/**
 * 创建边缘引导元素
 */
function createEdgeGuides(): void {
  // 左边引导
  leftEdgeGuide = document.createElement('div');
  leftEdgeGuide.className = 'edge-guide left';
  leftEdgeGuide.setAttribute('data-sayso-guide', 'true');
  document.body.appendChild(leftEdgeGuide);

  // 右边引导
  rightEdgeGuide = document.createElement('div');
  rightEdgeGuide.className = 'edge-guide right';
  rightEdgeGuide.setAttribute('data-sayso-guide', 'true');
  document.body.appendChild(rightEdgeGuide);

  Logger.debug('[FloatTag] 边缘引导元素已创建');
}

/**
 * 显示边缘引导
 */
function showEdgeGuide(side: DockSide): void {
  if (side === 'left' && leftEdgeGuide) {
    leftEdgeGuide.classList.add('active');
    rightEdgeGuide?.classList.remove('active');
  } else if (side === 'right' && rightEdgeGuide) {
    rightEdgeGuide.classList.add('active');
    leftEdgeGuide?.classList.remove('active');
  }
}

/**
 * 隐藏边缘引导
 */
function hideEdgeGuides(): void {
  leftEdgeGuide?.classList.remove('active');
  rightEdgeGuide?.classList.remove('active');
}

/**
 * 清理边缘引导元素
 */
function cleanupEdgeGuides(): void {
  if (leftEdgeGuide) {
    leftEdgeGuide.remove();
    leftEdgeGuide = null;
  }

  if (rightEdgeGuide) {
    rightEdgeGuide.remove();
    rightEdgeGuide = null;
  }

  Logger.debug('[FloatTag] 边缘引导元素已清理');
}

// ============================================================================
// 位置管理
// ============================================================================

/**
 * 根据保存的位置定位悬浮标签
 */
function restoreSavedPosition(): void {
  const savedPosition = restoreFloatTagPosition();

  if (!savedPosition) {
    Logger.debug('[FloatTag] 没有保存的位置');
    return;
  }

  const pixelPosition = calculatePixelPosition(savedPosition);
  const constrained = constrainPosition(
    pixelPosition.x,
    pixelPosition.y,
    200, // 预估悬浮标签宽度
    50  // 预估悬浮标签高度
  );

  setStyle({
    left: `${constrained.x}px`,
    top: `${constrained.y}px`,
    right: 'auto',
  });

  // 恢复贴边状态
  if (savedPosition.isEdgeDocked && savedPosition.dockedSide) {
    isEdgeDocked = true;
    dockedSide = savedPosition.dockedSide;

    if (dockedSide === 'left') {
      addClass('edge-docked', 'left');
      setStyle({ left: '0px', right: 'auto' });
    } else {
      addClass('edge-docked');
      setStyle({ right: '0px', left: 'auto' });
    }

    Logger.debug('[FloatTag] 边缘停靠状态已恢复:', dockedSide);
  }

  Logger.debug('[FloatTag] 位置已恢复:', constrained);
}

/**
 * 重新定位悬浮标签（响应窗口大小变化）
 */
function repositionFloatTag(): void {
  const savedPosition = restoreFloatTagPosition();
  const rect = floatTagElement?.getBoundingClientRect();

  if (!savedPosition) {
    return;
  }

  if (savedPosition.isEdgeDocked && savedPosition.dockedSide) {
    // 恢复贴边状态
    addClass('edge-docked');

    if (savedPosition.dockedSide === 'left') {
      addClass('left');
      setStyle({ left: '0px', right: 'auto' });
    } else {
      removeClass('left');
      setStyle({ right: '0px', left: 'auto' });
    }

    // 垂直位置计算
    let targetY: number;
    if (savedPosition.verticalAnchor === 'top') {
      targetY = savedPosition.verticalDistance;
    } else {
      targetY = window.innerHeight - savedPosition.verticalDistance;
    }

    // 确保垂直位置在当前视窗范围内
    const tagHeight = rect?.height || 50;
    const maxY = window.innerHeight - tagHeight;
    const constrainedY = Math.max(0, Math.min(targetY, maxY));

    setStyle({ top: `${constrainedY}px` });
  } else {
    // 非贴边状态下的重新定位
    const pixelPosition = calculatePixelPosition(savedPosition);
    const constrained = constrainPosition(
      pixelPosition.x,
      pixelPosition.y,
      rect?.width || 200,
      rect?.height || 50
    );

    setStyle({
      left: `${constrained.x}px`,
      top: `${constrained.y}px`,
      right: 'auto',
    });
  }

  Logger.debug('[FloatTag] 位置已重新定位');
}

/**
 * 检查并应用边缘停靠
 */
function checkEdgeDock(): void {
  const rect = floatTagElement?.getBoundingClientRect();

  if (!rect) {
    return;
  }

  const distanceFromLeft = rect.left;
  const distanceFromRight = window.innerWidth - rect.left - rect.width;

  if (distanceFromLeft <= EDGE_THRESHOLD) {
    // 停靠左边
    addClass('edge-docked', 'left');
    setStyle({ left: '0px', right: 'auto' });

    isEdgeDocked = true;
    dockedSide = 'left';

    // 保存贴边状态
    saveFloatTagPosition(0, rect.top, true, 'left');
  } else if (distanceFromRight <= EDGE_THRESHOLD) {
    // 停靠右边
    addClass('edge-docked');
    removeClass('left');

    setStyle({ right: '0px', left: 'auto' });

    isEdgeDocked = true;
    dockedSide = 'right';

    // 保存贴边状态
    saveFloatTagPosition(window.innerWidth - rect.width, rect.top, true, 'right');
  } else {
    // 普通位置，保存新位置
    saveFloatTagPosition(rect.left, rect.top, false);
  }
}

function resetDragVisualState(): void {
  removeClass('dragging', 'near-edge');
  hideEdgeGuides();
  setStyle({
    cursor: 'grab',
    userSelect: 'auto',
  });
}

function resetDragState(): void {
  isDragging = false;
  clickStartTime = 0;
}

function finalizeDrag(options?: {
  shouldOpenSidebar?: boolean;
  target?: EventTarget | null;
  clickDuration?: number;
}): void {
  if (clickStartTime === 0) {
    return;
  }

  const clickDuration = options?.clickDuration ?? Date.now() - clickStartTime;
  const targetNode = (options?.target as Node | null) || null;

  resetDragVisualState();

  const isClickOnSaveButton =
    saveButton &&
    targetNode &&
    (targetNode === saveButton || saveButton.contains(targetNode));

  if (options?.shouldOpenSidebar && !isDragging && clickDuration < 300 && !isClickOnSaveButton) {
    if (!isRuntimeContextAvailable()) {
      console.log(
        getSafeI18nMessage('extensionContextInvalid', '扩展上下文已失效，请刷新页面')
      );
      resetDragState();
      return;
    }

    void chromeMessageAdapter.sendMessage({
      type: 'openSidePanel',
    }).then(() => {
      Logger.info('[FloatTag] 侧边栏打开请求已发送');
    }).catch((error) => {
      if (isExtensionContextInvalidatedError(error)) {
        Logger.warn('[FloatTag] 打开侧边栏失败：扩展上下文已失效');
        return;
      }
      Logger.error('[FloatTag] 打开侧边栏失败:', error);
    });
  }

  if (isDragging) {
    checkEdgeDock();
  }

  resetDragState();
}

// ============================================================================
// 状态管理
// ============================================================================

/**
 * 设置悬浮标签状态
 */
function setFloatTagState(state: FloatTagState, text: string, icon: string): void {
  if (!floatTagElement || !statusElement || !iconElement) {
    return;
  }

  // 保存贴边状态
  const isEdgeDockedState = hasClass('edge-docked');
  const isLeftDocked = hasClass('left');

  // 移除所有状态类，但保留贴边状态
  floatTagElement.className = `${CLASS_PREFIX}float`;

  // 恢复贴边状态
  if (isEdgeDockedState) {
    addClass('edge-docked');

    if (isLeftDocked) {
      addClass('left');
    }
  }

  // 添加当前状态类
  addClass(`${CLASS_PREFIX}${state}`);

  // 更新状态文本
  statusElement.textContent = text;

  // 更新图标
  iconElement.innerHTML = icon;
}

/**
 * 更新悬浮标签状态
 */
export function updateFloatTagState(): void {
  if (!floatTagElement) {
    return;
  }

  const autoSave = window.saySoSettings?.autoSave;

  if (autoSave) {
    // 自动保存模式
    setFloatTagState(
      'auto-save',
      getSafeI18nMessage('autoSaving', '自动保存'),
      createLogoHTML()
    );

    // 移除保存按钮（如果存在）
    if (saveButton?.parentElement === floatTagElement) {
      floatTagElement.removeChild(saveButton);
    }
  } else {
    // 手动保存模式
    setFloatTagState(
      'manual-save',
      getSafeI18nMessage('manualSave', '手动保存'),
      createLogoHTML()
    );

    // 添加保存按钮（如果不存在）
    if (saveButton?.parentElement !== floatTagElement && saveButton) {
      floatTagElement.appendChild(saveButton);
    }
  }
}

/**
 * 显示保存成功状态
 */
export function showSuccessStatus(): void {
  const isEdgeDockedState = hasClass('edge-docked');
  const autoSave = window.saySoSettings?.autoSave;

  if (isEdgeDockedState && autoSave && iconElement) {
    // 贴边模式下的自动保存：只更改图标，不显示文字
    iconElement.innerHTML =
      '<span style="color: #2828cd41; font-size: 18px;">✓</span>';

    // 延迟恢复图标，但保持贴边状态
    setTimeout(() => {
      updateFloatTagState();
    }, SUCCESS_DURATION);
  } else {
    // 普通模式：显示对勾图标和成功文字
    setFloatTagState(
      'success',
      getSafeI18nMessage('saveSuccess', '已保存'),
      '<span style="color: #2828cd41; font-size: 18px;">✓</span>'
    );

    // 延迟恢复原来的状态
    setTimeout(() => {
      updateFloatTagState();
    }, SUCCESS_DURATION);
  }
}

// ============================================================================
// 事件处理
// ============================================================================

/**
 * 处理鼠标按下事件
 */
function handleMouseDown(e: MouseEvent): void {
  clickStartTime = Date.now();
  isDragging = false;

  dragStartX = e.clientX;
  dragStartY = e.clientY;

  const rect = floatTagElement?.getBoundingClientRect();

  if (rect) {
    initialX = rect.left;
    initialY = rect.top;
  }

  // 添加拖动样式
  setStyle({
    cursor: 'grabbing',
    userSelect: 'none',
  });

  e.preventDefault();
}

/**
 * 处理鼠标移动事件
 */
function handleMouseMove(e: MouseEvent): void {
  if (clickStartTime === 0) {
    return;
  }

  // 某些页面或浏览器场景下 mouseup 不会可靠回到 document，
  // 这里用 buttons 做兜底，避免松手后标签继续跟随鼠标。
  if (e.buttons === 0) {
    finalizeDrag();
    return;
  }

  const deltaX = e.clientX - dragStartX;
  const deltaY = e.clientY - dragStartY;

  // 如果移动距离超过阈值，则认为是拖动
  if (
    !isDragging &&
    (Math.abs(deltaX) > DRAG_THRESHOLD || Math.abs(deltaY) > DRAG_THRESHOLD)
  ) {
    isDragging = true;
    addClass('dragging');

    // 如果当前是贴边状态，先退出贴边模式
    if (isEdgeDocked) {
      removeClass('edge-docked', 'left');
      isEdgeDocked = false;
      dockedSide = null;
    }
  }

  if (isDragging && floatTagElement) {
    const newX = initialX + deltaX;
    const newY = initialY + deltaY;

    // 限制在视窗范围内
    const constrained = constrainPosition(
      newX,
      newY,
      floatTagElement.offsetWidth,
      floatTagElement.offsetHeight
    );

    setStyle({
      left: `${constrained.x}px`,
      top: `${constrained.y}px`,
      right: 'auto',
    });

    // 边缘检测和视觉引导
    const distanceFromLeft = constrained.x;
    const distanceFromRight =
      window.innerWidth - constrained.x - floatTagElement.offsetWidth;

    // 移除之前的边缘样式
    removeClass('near-edge');

    if (distanceFromLeft <= EDGE_THRESHOLD) {
      showEdgeGuide('left');
      addClass('near-edge');
    } else if (distanceFromRight <= EDGE_THRESHOLD) {
      showEdgeGuide('right');
      addClass('near-edge');
    } else {
      hideEdgeGuides();
    }
  }
}

/**
 * 处理鼠标松开事件
 */
function handleMouseUp(e: MouseEvent): void {
  finalizeDrag({
    shouldOpenSidebar: true,
    target: e.target,
    clickDuration: Date.now() - clickStartTime,
  });
}

function handleWindowBlur(): void {
  finalizeDrag();
}

function handleVisibilityChange(): void {
  if (document.visibilityState === 'hidden') {
    finalizeDrag();
  }
}

/**
 * 处理手动保存
 */
function handleManualSave(): void {
  // 触发页面内容捕获
  window.dispatchEvent(
    new CustomEvent('sayso-manual-save')
  );

  // 检查是否处于贴边状态
  if (isEdgeDocked && iconElement) {
    const dockedIcon = iconElement;

    // 贴边状态下，保持贴边，只更新图标
    dockedIcon.innerHTML =
      '<span style="color: #2828cd41; font-size: 18px;">✓</span>';

    // 添加成功状态类，但保持贴边状态
    removeClass(`${CLASS_PREFIX}manual-save`);
    addClass(`${CLASS_PREFIX}success`);

    // 延迟恢复原来的状态
    setTimeout(() => {
      removeClass(`${CLASS_PREFIX}success`);
      addClass(`${CLASS_PREFIX}manual-save`);
      dockedIcon.innerHTML = createLogoHTML();

      if (statusElement) {
        statusElement.textContent =
          getSafeI18nMessage('manualSave', '手动保存');
      }
    }, SUCCESS_DURATION);
  } else {
    // 非贴边状态，使用标准成功状态显示
    showSuccessStatus();
  }
}

/**
 * 处理窗口大小调整
 */
function handleResize(): void {
  // 使用防抖避免频繁调整
  if (resizeTimeout) {
    clearTimeout(resizeTimeout);
  }

  resizeTimeout = window.setTimeout(() => {
    repositionFloatTag();
  }, 100);
}

// ============================================================================
// 清理
// ============================================================================

/**
 * 清理现有悬浮标签
 */
export function cleanupFloatTags(): void {
  document.removeEventListener('mousemove', handleMouseMove);
  document.removeEventListener('mouseup', handleMouseUp);
  window.removeEventListener('blur', handleWindowBlur);
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  window.removeEventListener('resize', handleResize);

  // 查找所有可能的悬浮标签元素
  const existingTags = document.querySelectorAll(
    '.sayso-float, [data-sayso-tag="true"]'
  );

  existingTags.forEach((tag) => {
    if (tag && tag.parentNode) {
      Logger.debug('[FloatTag] 清理重复的悬浮标签');
      tag.parentNode.removeChild(tag);
    }
  });

  // 清理边缘引导元素
  const existingGuides = document.querySelectorAll(
    '.edge-guide, [data-sayso-guide="true"]'
  );

  existingGuides.forEach((guide) => {
    if (guide && guide.parentNode) {
      Logger.debug('[FloatTag] 清理边缘引导元素');
      guide.parentNode.removeChild(guide);
    }
  });

  // 重置全局变量
  floatTagElement = null;
  iconElement = null;
  statusElement = null;
  saveButton = null;
  resetDragState();

  // 清理边缘引导
  cleanupEdgeGuides();

  Logger.debug('[FloatTag] 悬浮标签已清理');
}

// ============================================================================
// 创建和初始化
// ============================================================================

/**
 * 创建悬浮标签
 */
function createFloatTag(): void {
  // 清理可能存在的旧标签
  cleanupFloatTags();

  // 创建悬浮标签元素
  floatTagElement = document.createElement('div');
  floatTagElement.className = `${CLASS_PREFIX}float ${CLASS_PREFIX}fade-in`;
  floatTagElement.setAttribute('data-sayso-tag', 'true');

  // 创建图标元素
  iconElement = document.createElement('div');
  iconElement.className = `${CLASS_PREFIX}icon`;

  // 初始设置logo和徽章（后续由updateFloatTagState更新）
  iconElement.innerHTML = createLogoHTML();

  // 创建状态文本元素
  statusElement = document.createElement('div');
  statusElement.className = `${CLASS_PREFIX}status`;

  // 创建保存按钮（仅在手动保存模式下显示）
  saveButton = document.createElement('div');
  saveButton.className = `${CLASS_PREFIX}save`;
  saveButton.innerHTML = '💾';
  saveButton.addEventListener('click', handleManualSave);

  // 添加元素到悬浮标签
  floatTagElement.appendChild(iconElement);
  floatTagElement.appendChild(statusElement);

  // 创建边缘引导元素
  createEdgeGuides();

  // 添加拖动事件监听
  floatTagElement.addEventListener('mousedown', handleMouseDown);
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
  window.addEventListener('blur', handleWindowBlur);
  document.addEventListener('visibilitychange', handleVisibilityChange);

  // 添加鼠标悬停效果，提示用户可以点击或拖动
  setStyle({
    cursor: 'grab',
  });

  floatTagElement.title =
    getSafeI18nMessage('clickToOpenManager', '点击打开记忆管理器，拖动调整位置');

  // 恢复之前保存的位置
  restoreSavedPosition();

  // 添加到页面
  document.body.appendChild(floatTagElement);

  window.setTimeout(() => {
    runFloatTagVisibilityCheck();
  }, VISIBILITY_CHECK_DELAY_MS);

  // 加载Font Awesome
  loadFontAwesome();

  // 根据设置显示不同状态
  updateFloatTagState();

  // 监听窗口大小变化，重新调整悬浮标签位置
  window.addEventListener('resize', handleResize);

  Logger.info('[FloatTag] 悬浮标签已创建');
}

/**
 * 初始化悬浮标签
 */
export function initFloatTag(): void {
  Logger.info('[FloatTag] 初始化悬浮标签');

  // 检查当前 URL 是否为支持的平台
  if (!isSupportedPlatform(window.location.href)) {
    Logger.debug('[FloatTag] 当前平台不支持悬浮标签');
    return;
  }

  // 创建悬浮标签
  createFloatTag();

  // 标记为已初始化
  markAsInitialized();
}

// ============================================================================
// 导出
// ============================================================================

export default {
  initFloatTag,
  updateFloatTagState,
  showSuccessStatus,
  cleanupFloatTags,
};
