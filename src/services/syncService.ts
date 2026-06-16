import type { DiaryEntry, MoodType, WeatherType } from '../types';
import { MOOD_CONFIG, WEATHER_CONFIG } from '../types';
import {
  db,
  enqueueMutation,
  getOrCreateDeviceId,
  getOutboxMutations,
  getSyncMeta,
  incrementOutboxRetries,
  putLocalCategory,
  removeOutboxMutations,
  setSyncMeta,
  type LocalCategory,
  type SyncOutboxMutation,
} from '../db/database';
import { apiRequest, jsonBody } from './apiClient';

interface SyncState {
  isSyncing: boolean;
  lastSyncedAt?: string;
  lastError?: string;
}

interface ServerEntry {
  id: string;
  title: string;
  content?: string;
  contentHtml?: string;
  plainText: string;
  mood: string;
  tags?: string[];
  wordCount: number;
  isLocked: boolean;
  isDeleted?: boolean;
  createdAt: string;
  updatedAt: string;
  dateFor: string;
  timeFor?: string;
  weather?: string;
  location?: string;
  deletedAt?: string;
  serverVersion?: number;
}

interface ServerCategory {
  id: string;
  name: string;
  sortOrder?: number;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string;
  serverVersion?: number;
}

interface ServerSetting {
  key: string;
  value: unknown;
  updatedAt?: string;
  serverVersion?: number;
}

interface SyncConflict {
  mutationId: string;
  entityType: 'entry' | 'category' | 'setting';
  entityId: string;
  serverVersion: number;
  serverValue?: ServerEntry | ServerCategory | ServerSetting;
}

interface SyncResponse {
  cursor: string;
  serverTime: string;
  applied: Array<{
    mutationId: string;
    entityType: string;
    entityId: string;
    serverVersion: number;
  }>;
  conflicts: SyncConflict[];
  changes: {
    entries: ServerEntry[];
    categories: ServerCategory[];
    settings: ServerSetting[];
    tombstones: Array<{ entityType: string; entityId: string; serverVersion?: number; deletedAt?: string }>;
  };
}

const state: SyncState = {
  isSyncing: false,
};

let scheduledSync: number | undefined;
let retrySync: number | undefined;
let retryDelayMs = 5000;
const ENTRY_SUMMARIES_CACHE_KEY = 'diary-entry-summaries-v1';
const MAX_RETRY_DELAY_MS = 60000;
const PERIODIC_SYNC_INTERVAL_MS = 30000;

export function getSyncState(): SyncState {
  return { ...state };
}

export async function triggerSync(options: { immediate?: boolean } = {}): Promise<void> {
  if (!localStorage.getItem('diary-token')) return;

  if (!options.immediate) {
    if (scheduledSync !== undefined) window.clearTimeout(scheduledSync);
    scheduledSync = window.setTimeout(() => {
      scheduledSync = undefined;
      void runSync().catch(handleSyncFailure);
    }, 1200);
    return;
  }

  if (scheduledSync !== undefined) {
    window.clearTimeout(scheduledSync);
    scheduledSync = undefined;
  }
  await runSync();
}

async function runSync(): Promise<void> {
  if (state.isSyncing) return;
  if (!localStorage.getItem('diary-token')) return;

  const mutations = await getOutboxMutations();
  const deviceId = await getOrCreateDeviceId();
  const sinceCursor = await getSyncMeta<string>('syncCursor') ?? '0';

  state.isSyncing = true;
  state.lastError = undefined;

  try {
    const response = await apiRequest<SyncResponse>('/sync', {
      method: 'POST',
      body: jsonBody({
        deviceId,
        sinceCursor,
        mutations: mutations.map(toWireMutation),
      }),
    });

    await applySyncResponse(response, mutations);
    await setSyncMeta('syncCursor', response.cursor);
    await setSyncMeta('lastSyncedAt', response.serverTime);
    state.lastSyncedAt = response.serverTime;
    retryDelayMs = 5000;
    clearRetryTimer();
  } catch (error) {
    const ids = mutations.map(mutation => mutation.mutationId);
    await incrementOutboxRetries(ids);
    state.lastError = error instanceof Error ? error.message : '同步失败';
    scheduleRetrySync();
    throw error;
  } finally {
    state.isSyncing = false;
  }
}

function handleSyncFailure(error: unknown): void {
  console.warn('后台同步失败:', error);
}

async function hasPendingMutations(): Promise<boolean> {
  return (await getOutboxMutations(1)).length > 0;
}

function clearRetryTimer(): void {
  if (retrySync !== undefined) {
    window.clearTimeout(retrySync);
    retrySync = undefined;
  }
}

function scheduleRetrySync(): void {
  if (retrySync !== undefined) return;
  retrySync = window.setTimeout(() => {
    retrySync = undefined;
    void hasPendingMutations()
      .then(hasPending => {
        if (!hasPending || !localStorage.getItem('diary-token')) return;
        return runSync().catch(handleSyncFailure);
      });
  }, retryDelayMs);
  retryDelayMs = Math.min(retryDelayMs * 2, MAX_RETRY_DELAY_MS);
}

function toWireMutation(mutation: SyncOutboxMutation) {
  return {
    mutationId: mutation.mutationId,
    entityType: mutation.entityType,
    entityId: mutation.entityId,
    op: mutation.op,
    baseVersion: mutation.baseVersion,
    clientUpdatedAt: mutation.createdAt,
    payload: mutation.payload,
  };
}

async function applySyncResponse(response: SyncResponse, localMutations: SyncOutboxMutation[]): Promise<void> {
  const hasRemoteChanges = response.changes.entries.length > 0
    || response.changes.categories.length > 0
    || response.changes.settings.length > 0
    || response.changes.tombstones.length > 0
    || response.conflicts.length > 0;
  if (hasRemoteChanges && typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem(ENTRY_SUMMARIES_CACHE_KEY);
  }

  const appliedIds = response.applied.map(item => item.mutationId);
  const conflictIds = response.conflicts.map(item => item.mutationId);
  await removeOutboxMutations([...appliedIds, ...conflictIds]);

  await applyServerChanges(response.changes);
  for (const conflict of response.conflicts) {
    await applyConflict(conflict, localMutations.find(mutation => mutation.mutationId === conflict.mutationId));
  }

  for (const applied of response.applied) {
    if (applied.entityType === 'entry') {
      const entry = await db.entries.get(applied.entityId);
      if (entry) {
        await db.entries.put({
          ...entry,
          serverVersion: applied.serverVersion,
          syncStatus: 'synced',
          lastSyncedAt: response.serverTime,
        });
      }
    }
    if (applied.entityType === 'category') {
      const category = await db.categories.get(applied.entityId);
      if (category) {
        await db.categories.put({
          ...category,
          serverVersion: applied.serverVersion,
          syncStatus: 'synced',
          lastSyncedAt: response.serverTime,
        });
      }
    }
  }
}

async function applyServerChanges(changes: SyncResponse['changes']): Promise<void> {
  for (const entry of changes.entries) {
    await db.entries.put(toLocalEntry(entry, 'synced'));
  }

  for (const category of changes.categories) {
    if (category.deletedAt) {
      await db.categories.delete(category.id);
    } else {
      const duplicateLocal = await db.categories
        .filter(item => item.id !== category.id && item.name === category.name && (item.serverVersion ?? 0) === 0)
        .first();
      if (duplicateLocal) {
        await db.categories.delete(duplicateLocal.id);
      }
      await putLocalCategory(toLocalCategory(category));
    }
  }

  for (const setting of changes.settings) {
    await db.config.put({ key: setting.key, value: setting.value });
  }

  for (const tombstone of changes.tombstones) {
    if (tombstone.entityType === 'entry') {
      await db.entries.delete(tombstone.entityId);
    }
    if (tombstone.entityType === 'category') {
      await db.categories.delete(tombstone.entityId);
    }
  }
}

async function applyConflict(conflict: SyncConflict, localMutation?: SyncOutboxMutation): Promise<void> {
  if (conflict.serverValue) {
    if (conflict.entityType === 'entry') {
      await db.entries.put(toLocalEntry(conflict.serverValue as ServerEntry, 'synced'));
    }
    if (conflict.entityType === 'category') {
      await putLocalCategory(toLocalCategory(conflict.serverValue as ServerCategory));
    }
    if (conflict.entityType === 'setting') {
      const setting = conflict.serverValue as ServerSetting;
      await db.config.put({ key: setting.key, value: setting.value });
    }
  }

  if (conflict.entityType !== 'entry' || !localMutation?.payload || localMutation.op === 'delete') return;

  const local = localMutation.payload as Partial<DiaryEntry> & { contentHtml?: string };
  const now = new Date().toISOString();
  const conflictEntry: DiaryEntry = {
    id: crypto.randomUUID ? crypto.randomUUID() : `conflict_${Date.now()}`,
    title: `${String(local.title || '无标题')}（冲突副本）`,
    content: String(local.contentHtml ?? local.content ?? ''),
    plainText: String(local.plainText ?? ''),
    mood: isMood(local.mood) ? local.mood : 'none',
    tags: Array.isArray(local.tags) ? local.tags.map(String) : [],
    wordCount: Number(local.wordCount) || 0,
    isLocked: Boolean(local.isLocked),
    isDeleted: false,
    createdAt: now,
    updatedAt: now,
    dateFor: typeof local.dateFor === 'string' ? local.dateFor : now.slice(0, 10),
    timeFor: typeof local.timeFor === 'string' ? local.timeFor : undefined,
    weather: isWeather(local.weather) ? local.weather : 'none',
    location: typeof local.location === 'string' ? local.location : '',
    serverVersion: 0,
    syncStatus: 'conflict',
  };

  await db.entries.put(conflictEntry);
  await enqueueMutation({
    entityType: 'entry',
    entityId: conflictEntry.id,
    op: 'create',
    payload: {
      ...local,
      id: conflictEntry.id,
      title: conflictEntry.title,
      contentHtml: conflictEntry.content,
      createdAt: conflictEntry.createdAt,
      updatedAt: conflictEntry.updatedAt,
      dateFor: conflictEntry.dateFor,
    },
    baseVersion: 0,
  });
}

function toLocalEntry(entry: ServerEntry, syncStatus: 'synced' | 'pending' | 'conflict'): DiaryEntry {
  return {
    id: entry.id,
    title: entry.title,
    content: entry.contentHtml ?? entry.content ?? '',
    plainText: entry.plainText ?? '',
    mood: isMood(entry.mood) ? entry.mood : 'none',
    tags: entry.tags ?? [],
    wordCount: Number(entry.wordCount) || 0,
    isLocked: Boolean(entry.isLocked),
    isDeleted: Boolean(entry.isDeleted),
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    dateFor: entry.dateFor,
    timeFor: entry.timeFor,
    weather: isWeather(entry.weather) ? entry.weather : 'none',
    location: entry.location ?? '',
    deletedAt: entry.deletedAt,
    serverVersion: entry.serverVersion ?? 0,
    syncStatus,
    lastSyncedAt: new Date().toISOString(),
  };
}

function toLocalCategory(category: ServerCategory): LocalCategory {
  const now = new Date().toISOString();
  return {
    id: category.id,
    name: category.name,
    sortOrder: category.sortOrder ?? 0,
    createdAt: category.createdAt ?? now,
    updatedAt: category.updatedAt ?? now,
    deletedAt: category.deletedAt,
    serverVersion: category.serverVersion ?? 0,
    syncStatus: 'synced',
    lastSyncedAt: now,
  };
}

function isMood(value: unknown): value is MoodType {
  return typeof value === 'string' && value in MOOD_CONFIG;
}

function isWeather(value: unknown): value is WeatherType {
  return typeof value === 'string' && value in WEATHER_CONFIG;
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    void triggerSync({ immediate: true }).catch(error => {
      console.warn('网络恢复后同步失败:', error);
    });
  });

  window.addEventListener('focus', () => {
    void triggerSync({ immediate: true }).catch(handleSyncFailure);
  });

  window.addEventListener('pageshow', () => {
    void triggerSync({ immediate: true }).catch(handleSyncFailure);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void triggerSync({ immediate: true }).catch(handleSyncFailure);
    }
  });

  window.setInterval(() => {
    void hasPendingMutations()
      .then(hasPending => {
        if (hasPending) return triggerSync({ immediate: true }).catch(handleSyncFailure);
      });
  }, PERIODIC_SYNC_INTERVAL_MS);
}
