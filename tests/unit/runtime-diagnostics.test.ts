import { describe, expect, it } from 'vitest';

import {
  buildRuntimeDiagnosticsViewModel,
  resolveRuntimeState,
} from '@/popup/runtime-diagnostics';

describe('popup runtime diagnostics', () => {
  it('marks injected when runtime status says injected', () => {
    const state = resolveRuntimeState({
      url: 'https://gemini.google.com/app/conv_1',
      platform: 'gemini',
      injectable: true,
      runtimeStatus: {
        tabId: 1,
        url: 'https://gemini.google.com/app/conv_1',
        platform: 'gemini',
        injectable: true,
        injected: true,
        lastSeenAt: '2026-02-27T10:00:00.000Z',
      },
      pingSuccess: false,
    });

    expect(state).toBe('INJECTED');
  });

  it('marks stale when runtime status is stale', () => {
    const viewModel = buildRuntimeDiagnosticsViewModel({
      url: 'https://www.doubao.com/chat/123',
      platform: 'doubao',
      injectable: true,
      runtimeStatus: {
        tabId: 2,
        url: 'https://www.doubao.com/chat/123',
        platform: 'doubao',
        injectable: true,
        injected: true,
        lastSeenAt: '2026-02-27T10:00:00.000Z',
        stale: true,
      },
      pingSuccess: false,
    });

    expect(viewModel.state).toBe('STALE');
    expect(viewModel.actionTip).toContain('过期');
  });

  it('marks no permission when ping fails on supported page', () => {
    const viewModel = buildRuntimeDiagnosticsViewModel({
      url: 'https://gemini.google.com/app/conv_2',
      platform: 'gemini',
      injectable: true,
      runtimeStatus: null,
      pingSuccess: false,
      pingError: 'Could not establish connection',
    });

    expect(viewModel.state).toBe('NO_PERMISSION');
    expect(viewModel.actionTip).toContain('权限');
  });

  it('marks unsupported for non-supported pages', () => {
    const viewModel = buildRuntimeDiagnosticsViewModel({
      url: 'https://example.com',
      platform: null,
      injectable: false,
      runtimeStatus: null,
      pingSuccess: false,
    });

    expect(viewModel.state).toBe('UNSUPPORTED');
    expect(viewModel.stateText).toBe('不支持页面');
  });
});
