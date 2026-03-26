import type { PlatformName, TabRuntimeStatus } from '@/types';
import { PLATFORM_NAMES } from '@/types/conversation';

export type RuntimeInjectionState =
  | 'INJECTED'
  | 'STALE'
  | 'NOT_INJECTED'
  | 'NO_PERMISSION'
  | 'UNSUPPORTED'
  | 'NO_ACTIVE_TAB';

export interface RuntimeDiagnosticsViewModel {
  state: RuntimeInjectionState;
  stateText: string;
  stateClassName: string;
  platformText: string;
  lastExtractText: string;
  lastSaveText: string;
  lastErrorText: string;
  actionTip: string;
}

export interface RuntimeDiagnosticsInput {
  url: string;
  platform: PlatformName | null;
  injectable: boolean;
  runtimeStatus: TabRuntimeStatus | null;
  pingSuccess: boolean;
  pingError?: string;
}

function formatTimestamp(value?: string): string {
  if (!value) {
    return '-';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
}

export function resolveRuntimeState(input: RuntimeDiagnosticsInput): RuntimeInjectionState {
  if (!input.url) {
    return 'NO_ACTIVE_TAB';
  }
  if (!input.injectable) {
    return 'UNSUPPORTED';
  }
  if (input.runtimeStatus) {
    if (input.runtimeStatus.stale) {
      return 'STALE';
    }
    if (input.runtimeStatus.injected) {
      return 'INJECTED';
    }
  }
  if (input.pingSuccess) {
    return 'INJECTED';
  }
  if (input.pingError) {
    return 'NO_PERMISSION';
  }
  return 'NOT_INJECTED';
}

function resolveActionTip(state: RuntimeInjectionState): string {
  switch (state) {
    case 'INJECTED':
      return '页面已注入，可直接发送消息触发自动保存。';
    case 'STALE':
      return '状态可能过期，请刷新页面后重试。';
    case 'NO_PERMISSION':
      return '请在扩展详情中开启本站访问权限，然后刷新页面。';
    case 'NOT_INJECTED':
      return '请刷新当前页面或重新加载扩展。';
    case 'UNSUPPORTED':
      return '当前页面不在支持平台列表中。';
    case 'NO_ACTIVE_TAB':
      return '未检测到活动标签页。';
    default:
      return '';
  }
}

function resolveStateText(state: RuntimeInjectionState): { text: string; className: string } {
  switch (state) {
    case 'INJECTED':
      return { text: '已注入', className: 'text-green-700 bg-green-100' };
    case 'STALE':
      return { text: '状态过期', className: 'text-yellow-700 bg-yellow-100' };
    case 'NO_PERMISSION':
      return { text: '无权限/未注入', className: 'text-red-700 bg-red-100' };
    case 'NOT_INJECTED':
      return { text: '未注入', className: 'text-orange-700 bg-orange-100' };
    case 'UNSUPPORTED':
      return { text: '不支持页面', className: 'text-gray-700 bg-gray-100' };
    case 'NO_ACTIVE_TAB':
      return { text: '无活动页面', className: 'text-gray-700 bg-gray-100' };
    default:
      return { text: '-', className: 'text-gray-700 bg-gray-100' };
  }
}

export function buildRuntimeDiagnosticsViewModel(
  input: RuntimeDiagnosticsInput
): RuntimeDiagnosticsViewModel {
  const state = resolveRuntimeState(input);
  const { text, className } = resolveStateText(state);
  const status = input.runtimeStatus;
  const platformText = input.platform ? PLATFORM_NAMES[input.platform] : '-';

  return {
    state,
    stateText: text,
    stateClassName: className,
    platformText,
    lastExtractText: formatTimestamp(status?.lastExtractAt),
    lastSaveText: formatTimestamp(status?.lastSaveAt),
    lastErrorText: status?.lastError || '-',
    actionTip: resolveActionTip(state),
  };
}
