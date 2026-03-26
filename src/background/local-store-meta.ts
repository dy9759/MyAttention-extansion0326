import type { LocalStoreMigrationState } from '@/types';

const KEY_ENABLED = 'local_store_enabled';
const KEY_PATH = 'local_store_path';
const KEY_MIGRATION_STATE = 'local_store_migration_state';
const KEY_LAST_ERROR = 'local_store_last_error';
const KEY_LAST_MIGRATED_AT = 'local_store_last_migrated_at';
const KEY_LAST_SYNC_AT = 'local_store_last_sync_at';
const KEY_LAST_HYDRATED_AT = 'local_store_last_hydrated_at';

export interface LocalStoreMeta {
  local_store_enabled: boolean;
  local_store_path?: string;
  local_store_migration_state: LocalStoreMigrationState;
  local_store_last_error?: string;
  local_store_last_migrated_at?: string;
  local_store_last_sync_at?: string;
  local_store_last_hydrated_at?: string;
}

export const LOCAL_STORE_META_DEFAULTS: LocalStoreMeta = {
  local_store_enabled: true,
  local_store_migration_state: 'pending',
};

export const LOCAL_STORE_META_KEYS = [
  KEY_ENABLED,
  KEY_PATH,
  KEY_MIGRATION_STATE,
  KEY_LAST_ERROR,
  KEY_LAST_MIGRATED_AT,
  KEY_LAST_SYNC_AT,
  KEY_LAST_HYDRATED_AT,
] as const;

function readLocalStorage<T = Record<string, unknown>>(keys: readonly string[]): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(result as T);
    });
  });
}

function writeLocalStorage(payload: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(payload, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

export async function ensureLocalStoreMetaDefaults(): Promise<LocalStoreMeta> {
  const existing = await readLocalStorage<Record<string, unknown>>(LOCAL_STORE_META_KEYS);
  const patch: Record<string, unknown> = {};

  if (typeof existing[KEY_ENABLED] !== 'boolean') {
    patch[KEY_ENABLED] = LOCAL_STORE_META_DEFAULTS.local_store_enabled;
  }

  const migrationState = existing[KEY_MIGRATION_STATE];
  if (
    migrationState !== 'pending' &&
    migrationState !== 'running' &&
    migrationState !== 'done' &&
    migrationState !== 'failed'
  ) {
    patch[KEY_MIGRATION_STATE] = LOCAL_STORE_META_DEFAULTS.local_store_migration_state;
  }

  if (Object.keys(patch).length > 0) {
    await writeLocalStorage(patch);
  }

  return getLocalStoreMeta();
}

export async function getLocalStoreMeta(): Promise<LocalStoreMeta> {
  const raw = await readLocalStorage<Record<string, unknown>>(LOCAL_STORE_META_KEYS);

  const migrationState = raw[KEY_MIGRATION_STATE];
  const normalizedMigrationState: LocalStoreMigrationState =
    migrationState === 'running' ||
    migrationState === 'done' ||
    migrationState === 'failed' ||
    migrationState === 'pending'
      ? migrationState
      : LOCAL_STORE_META_DEFAULTS.local_store_migration_state;

  return {
    local_store_enabled:
      typeof raw[KEY_ENABLED] === 'boolean'
        ? (raw[KEY_ENABLED] as boolean)
        : LOCAL_STORE_META_DEFAULTS.local_store_enabled,
    local_store_path:
      typeof raw[KEY_PATH] === 'string' && (raw[KEY_PATH] as string).trim().length > 0
        ? (raw[KEY_PATH] as string)
        : undefined,
    local_store_migration_state: normalizedMigrationState,
    local_store_last_error:
      typeof raw[KEY_LAST_ERROR] === 'string' && (raw[KEY_LAST_ERROR] as string).trim().length > 0
        ? (raw[KEY_LAST_ERROR] as string)
        : undefined,
    local_store_last_migrated_at:
      typeof raw[KEY_LAST_MIGRATED_AT] === 'string' &&
      (raw[KEY_LAST_MIGRATED_AT] as string).trim().length > 0
        ? (raw[KEY_LAST_MIGRATED_AT] as string)
        : undefined,
    local_store_last_sync_at:
      typeof raw[KEY_LAST_SYNC_AT] === 'string' &&
      (raw[KEY_LAST_SYNC_AT] as string).trim().length > 0
        ? (raw[KEY_LAST_SYNC_AT] as string)
        : undefined,
    local_store_last_hydrated_at:
      typeof raw[KEY_LAST_HYDRATED_AT] === 'string' &&
      (raw[KEY_LAST_HYDRATED_AT] as string).trim().length > 0
        ? (raw[KEY_LAST_HYDRATED_AT] as string)
        : undefined,
  };
}

export async function updateLocalStoreMeta(
  patch: Partial<LocalStoreMeta>
): Promise<LocalStoreMeta> {
  const payload: Record<string, unknown> = {};

  if (typeof patch.local_store_enabled === 'boolean') {
    payload[KEY_ENABLED] = patch.local_store_enabled;
  }

  if (patch.local_store_path !== undefined) {
    payload[KEY_PATH] = patch.local_store_path;
  }

  if (patch.local_store_migration_state !== undefined) {
    payload[KEY_MIGRATION_STATE] = patch.local_store_migration_state;
  }

  if (patch.local_store_last_error !== undefined) {
    payload[KEY_LAST_ERROR] = patch.local_store_last_error;
  }

  if (patch.local_store_last_migrated_at !== undefined) {
    payload[KEY_LAST_MIGRATED_AT] = patch.local_store_last_migrated_at;
  }

  if (patch.local_store_last_sync_at !== undefined) {
    payload[KEY_LAST_SYNC_AT] = patch.local_store_last_sync_at;
  }

  if (patch.local_store_last_hydrated_at !== undefined) {
    payload[KEY_LAST_HYDRATED_AT] = patch.local_store_last_hydrated_at;
  }

  if (Object.keys(payload).length > 0) {
    await writeLocalStorage(payload);
  }

  return getLocalStoreMeta();
}
