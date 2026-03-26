import { afterEach, describe, expect, it, vi } from 'vitest';

const databaseMocks = vi.hoisted(() => ({
  countOutboxEntries: vi.fn(),
  addOutboxEntry: vi.fn(),
}));

const clientMocks = vi.hoisted(() => ({
  health: vi.fn(),
}));

const metaMocks = vi.hoisted(() => ({
  getLocalStoreMeta: vi.fn(),
  updateLocalStoreMeta: vi.fn(),
}));

vi.mock('@/background/database', () => ({
  database: databaseMocks,
}));

vi.mock('@/background/local-store-client', () => ({
  localStoreClient: clientMocks,
}));

vi.mock('@/background/local-store-meta', () => metaMocks);

import { LocalStoreSyncService } from '@/background/local-store-sync-service';

describe('local store sync service status', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Object.values(databaseMocks).forEach((mockFn) => mockFn.mockReset());
    Object.values(clientMocks).forEach((mockFn) => mockFn.mockReset());
    Object.values(metaMocks).forEach((mockFn) => mockFn.mockReset());
  });

  it('reports syncing mode when the service is connected and pending outbox entries exist', async () => {
    databaseMocks.countOutboxEntries.mockResolvedValue(3);
    clientMocks.health.mockResolvedValue({
      status: 'ok',
      connected: true,
      version: '1.0.0',
      dbPath: '/tmp/sayso.db',
    });
    metaMocks.getLocalStoreMeta.mockResolvedValue({
      local_store_enabled: true,
      local_store_migration_state: 'done',
      local_store_path: '/tmp/sayso.db',
      local_store_last_error: '',
      local_store_last_sync_at: '2026-03-16T10:00:00.000Z',
    });
    metaMocks.updateLocalStoreMeta.mockResolvedValue({});

    const service = new LocalStoreSyncService();
    const status = await service.getStatus();

    expect(status.connected).toBe(true);
    expect(status.fallbackMode).toBe('syncing');
    expect(status.pendingOpsCount).toBe(3);
    expect(status.path).toBe('/tmp/sayso.db');
  });

  it('reports offline mode when health checks fail', async () => {
    databaseMocks.countOutboxEntries.mockResolvedValue(1);
    clientMocks.health.mockRejectedValue(new Error('connection refused'));
    metaMocks.getLocalStoreMeta.mockResolvedValue({
      local_store_enabled: true,
      local_store_migration_state: 'done',
      local_store_path: '/tmp/sayso.db',
      local_store_last_error: '',
      local_store_last_sync_at: undefined,
    });
    metaMocks.updateLocalStoreMeta.mockResolvedValue({});

    const service = new LocalStoreSyncService();
    const status = await service.getStatus();

    expect(status.connected).toBe(false);
    expect(status.fallbackMode).toBe('offline');
    expect(status.pendingOpsCount).toBe(1);
    expect(status.lastError).toContain('connection refused');
  });
});
