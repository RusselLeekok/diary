import type { AppConfig, DiaryEntry, DiaryEntrySummary, MoodType, WeatherType } from '../types';
import { MOOD_CONFIG, WEATHER_CONFIG } from '../types';
import {
  db,
  deleteLocalCategory,
  enqueueMutation,
  ensureDefaultCategories,
  getAllEntries as getLocalEntries,
  getAllTags as getLocalTags,
  getConfig as getLocalConfig,
  getDatesWithEntries as getLocalDatesWithEntries,
  getEntriesByDate as getLocalEntriesByDate,
  getEntryById as getLocalEntryById,
  getLocalCategories,
  getPendingSyncCount,
  getStats as getLocalStats,
  importData as importLocalData,
  putLocalCategory,
  saveEntry as saveLocalEntry,
  searchEntries as searchLocalEntries,
  setConfigItem as setLocalConfigItem,
  trashEntry as trashLocalEntry,
  type LocalCategory,
} from '../db/database';
import { countWords, toDateString } from '../utils/dateUtils';
import { sanitizeDiaryContent } from '../utils/htmlUtils';
import { getSyncState, triggerSync } from './syncService';

const DEFAULT_ENTRY_LIST_LIMIT = 200;
export const ENTRY_SUMMARY_PAGE_SIZE = 120;

export interface StatsPeriodResponse {
  total: number;
  totalWords: number;
  activeDays: number;
  avgWordsPerEntry: number;
  moodCount: Record<string, number>;
  timelineEntries: { key: string; label: string; count: number; words: number }[];
  weekdayEntries: { weekday: number; count: number; words: number }[];
  maxStreak: number;
}

export interface StatsResponse {
  total: number;
  totalWords: number;
  moodCount: Record<string, number>;
  dailyWords: { date: string; count: number }[];
  streak: number;
  maxStreak: number;
  years: number[];
  currentYear: number;
  periodStats: {
    all: StatsPeriodResponse;
    last30: StatsPeriodResponse;
    last180: StatsPeriodResponse;
  };
  yearStats: Record<string, StatsPeriodResponse & {
    year: number;
    monthlyEntries: { month: number; count: number; words: number }[];
  }>;
}

export interface SyncStatusSnapshot {
  pendingCount: number;
  lastSyncedAt?: string;
  lastError?: string;
  isSyncing: boolean;
}

function normalizeEntryForLocal(entry: DiaryEntry): DiaryEntry {
  const content = sanitizeDiaryContent(entry.content ?? '');
  const plainText = entry.plainText || htmlToText(content);
  const now = new Date().toISOString();
  return {
    ...entry,
    title: (entry.title?.trim() || plainText.slice(0, 30).trim() || '无标题').slice(0, 100),
    content,
    plainText,
    mood: isMood(entry.mood) ? entry.mood : 'none',
    weather: isWeather(entry.weather) ? entry.weather : 'none',
    tags: Array.isArray(entry.tags) ? entry.tags.filter(Boolean).slice(0, 1) : [],
    wordCount: countWords(plainText),
    createdAt: entry.createdAt || now,
    updatedAt: entry.updatedAt || now,
    dateFor: entry.dateFor || toDateString(new Date()),
    syncStatus: entry.syncStatus ?? 'pending',
    serverVersion: entry.serverVersion ?? 0,
  };
}

function diaryEntryToSummary(entry: DiaryEntry): DiaryEntrySummary {
  return {
    id: entry.id,
    title: entry.title,
    plainText: entry.plainText.slice(0, 240),
    mood: entry.mood,
    tags: entry.tags,
    wordCount: entry.wordCount,
    isLocked: entry.isLocked,
    isDeleted: entry.isDeleted,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    dateFor: entry.dateFor,
    timeFor: entry.timeFor,
    weather: entry.weather,
    location: entry.location,
    firstImageSrc: extractFirstImageSrc(entry.content),
    serverVersion: entry.serverVersion,
    syncStatus: entry.syncStatus,
    deletedAt: entry.deletedAt,
  };
}

function extractFirstImageSrc(html: string): string {
  return html.match(/<img[^>]+src=(["'])(.*?)\1/i)?.[2] ?? '';
}

function entryPayload(entry: DiaryEntry) {
  return {
    id: entry.id,
    title: entry.title,
    contentHtml: entry.content,
    mood: entry.mood,
    tags: entry.tags,
    dateFor: entry.dateFor,
    timeFor: entry.timeFor ?? null,
    isLocked: entry.isLocked,
    isDeleted: Boolean(entry.isDeleted),
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    weather: entry.weather ?? 'none',
    location: entry.location ?? null,
  };
}

export async function getAllEntries(): Promise<DiaryEntry[]> {
  return (await getLocalEntries()).slice(0, DEFAULT_ENTRY_LIST_LIMIT);
}

export async function getEntrySummaries(): Promise<DiaryEntrySummary[]> {
  const page = await getEntrySummaryPage();
  return page.entries;
}

export async function getEntrySummaryPage(options: { limit?: number; offset?: number } = {}): Promise<{
  entries: DiaryEntrySummary[];
  hasMore: boolean;
  nextOffset: number;
}> {
  const offset = options.offset ?? 0;
  const limit = options.limit ?? ENTRY_SUMMARY_PAGE_SIZE;
  const all = (await getLocalEntries()).map(diaryEntryToSummary);
  const entries = all.slice(offset, offset + limit);
  return {
    entries,
    hasMore: offset + entries.length < all.length,
    nextOffset: offset + entries.length,
  };
}

export async function getEntryById(id: string): Promise<DiaryEntry | undefined> {
  return await getLocalEntryById(id);
}

export async function getEntriesByDate(dateFor: string): Promise<DiaryEntry[]> {
  return (await getLocalEntriesByDate(dateFor)).filter(entry => entry.isDeleted !== true);
}

export async function getDatesWithEntries(year: number, month: number): Promise<Set<string>> {
  return await getLocalDatesWithEntries(year, month);
}

export async function saveEntry(entry: DiaryEntry): Promise<void> {
  const existing = await getLocalEntryById(entry.id);
  const now = new Date().toISOString();
  const next = normalizeEntryForLocal({
    ...entry,
    createdAt: existing?.createdAt ?? entry.createdAt ?? now,
    updatedAt: now,
    serverVersion: existing?.serverVersion ?? entry.serverVersion ?? 0,
    syncStatus: 'pending',
  });

  await saveLocalEntry(next);
  await enqueueMutation({
    entityType: 'entry',
    entityId: next.id,
    op: existing ? 'update' : 'create',
    payload: entryPayload(next),
    baseVersion: existing?.serverVersion ?? 0,
  });
  triggerSyncSoon();
}

/** 彻底删除日记。普通删除请使用 trashEntry。 */
export async function deleteEntry(id: string): Promise<void> {
  const existing = await getLocalEntryById(id);
  await db.entries.delete(id);
  await enqueueMutation({
    entityType: 'entry',
    entityId: id,
    op: 'delete',
    payload: { id },
    baseVersion: existing?.serverVersion ?? 0,
  });
  triggerSyncSoon();
}

export async function trashEntry(id: string): Promise<void> {
  const existing = await getLocalEntryById(id);
  if (!existing) return;
  await trashLocalEntry(id);
  const trashed = await getLocalEntryById(id);
  if (!trashed) return;
  const next = {
    ...trashed,
    deletedAt: trashed.deletedAt ?? new Date().toISOString(),
    syncStatus: 'pending' as const,
  };
  await saveLocalEntry(next);
  await enqueueMutation({
    entityType: 'entry',
    entityId: id,
    op: 'update',
    payload: entryPayload(next),
    baseVersion: existing.serverVersion ?? 0,
  });
  triggerSyncSoon();
}

export async function getTrashedEntries(): Promise<DiaryEntrySummary[]> {
  const all = await db.entries.orderBy('dateFor').reverse().toArray();
  return all.filter(entry => entry.isDeleted === true).map(diaryEntryToSummary);
}

export async function restoreEntry(id: string): Promise<DiaryEntry | undefined> {
  const existing = await getLocalEntryById(id);
  if (!existing) return undefined;
  const next = {
    ...existing,
    isDeleted: false,
    deletedAt: undefined,
    updatedAt: new Date().toISOString(),
    syncStatus: 'pending' as const,
  };
  await saveLocalEntry(next);
  await enqueueMutation({
    entityType: 'entry',
    entityId: id,
    op: 'update',
    payload: entryPayload(next),
    baseVersion: existing.serverVersion ?? 0,
  });
  triggerSyncSoon();
  return next;
}

export async function clearTrash(): Promise<void> {
  const trashed = await db.entries.filter(entry => entry.isDeleted === true).toArray();
  for (const entry of trashed) {
    await enqueueMutation({
      entityType: 'entry',
      entityId: entry.id,
      op: 'delete',
      payload: { id: entry.id },
      baseVersion: entry.serverVersion ?? 0,
    });
  }
  await db.entries.bulkDelete(trashed.map(entry => entry.id));
  triggerSyncSoon();
}

export async function clearAllEntries(): Promise<void> {
  const entries = await db.entries.toArray();
  for (const entry of entries) {
    await enqueueMutation({
      entityType: 'entry',
      entityId: entry.id,
      op: 'delete',
      payload: { id: entry.id },
      baseVersion: entry.serverVersion ?? 0,
    });
  }
  await db.entries.clear();
  triggerSyncSoon();
}

export async function searchEntries(keyword: string): Promise<DiaryEntry[]> {
  return await searchLocalEntries(keyword);
}

export async function filterEntries(params: {
  keyword?: string;
  mood?: string;
  tags?: string[];
  dateFrom?: string;
  dateTo?: string;
}): Promise<DiaryEntry[]> {
  const entries = await getLocalEntries();
  const keyword = params.keyword?.trim().toLowerCase();
  return entries.filter(entry => {
    if (entry.isDeleted === true) return false;
    if (keyword && !entry.title.toLowerCase().includes(keyword) && !entry.plainText.toLowerCase().includes(keyword)) return false;
    if (params.mood && entry.mood !== params.mood) return false;
    if (params.tags?.length && !params.tags.some(tag => entry.tags.includes(tag))) return false;
    if (params.dateFrom && entry.dateFor < params.dateFrom) return false;
    if (params.dateTo && entry.dateFor > params.dateTo) return false;
    return true;
  });
}

export async function getAllTags(): Promise<string[]> {
  return await getLocalTags();
}

export async function getStats(): Promise<StatsResponse> {
  return await getLocalStats() as StatsResponse;
}

export async function getConfig(): Promise<AppConfig> {
  return await getLocalConfig();
}

export async function setConfigItem(key: string, value: unknown): Promise<void> {
  await setLocalConfigItem(key, value);
  if (key === 'theme' || key === 'fontSize' || key === 'autoSaveInterval') {
    await enqueueMutation({
      entityType: 'setting',
      entityId: key,
      op: 'update',
      payload: { key, value },
      baseVersion: 0,
    });
    triggerSyncSoon();
  }
}

export async function exportData(startDate?: string, endDate?: string): Promise<string> {
  const entries = (await db.entries.toArray())
    .filter(entry => (!startDate || entry.dateFor >= startDate) && (!endDate || entry.dateFor <= endDate))
    .sort((a, b) => `${b.dateFor} ${b.timeFor ?? ''}`.localeCompare(`${a.dateFor} ${a.timeFor ?? ''}`));
  const config = await getConfig();
  return JSON.stringify({ entries, config, exportedAt: new Date().toISOString() }, null, 2);
}

export async function importData(jsonStr: string): Promise<{ count: number }> {
  const result = await importLocalData(jsonStr);
  const imported = JSON.parse(jsonStr) as { entries?: Array<Partial<DiaryEntry>> };
  const ids = new Set(imported.entries?.map(entry => entry.id).filter((id): id is string => typeof id === 'string') ?? []);
  const entries = ids.size > 0
    ? (await db.entries.bulkGet(Array.from(ids))).filter((entry): entry is DiaryEntry => Boolean(entry))
    : await db.entries.toArray();

  for (const entry of entries) {
    const next = { ...entry, syncStatus: 'pending' as const, serverVersion: entry.serverVersion ?? 0 };
    await saveLocalEntry(next);
    await enqueueMutation({
      entityType: 'entry',
      entityId: next.id,
      op: 'update',
      payload: entryPayload(next),
      baseVersion: next.serverVersion ?? 0,
    });
  }
  triggerSyncSoon();
  return result;
}

export async function getCategories(): Promise<Array<{ id: string; name: string; entryCount?: number }>> {
  const categories = await getLocalCategories();
  const entries = await getLocalEntries();
  return categories.map(category => ({
    id: category.id,
    name: category.name,
    entryCount: entries.filter(entry => entry.tags.includes(category.name)).length,
  }));
}

export async function createCategory(name: string): Promise<void> {
  const cleanName = name.trim();
  if (!cleanName) return;
  const existing = await getLocalCategories();
  if (existing.some(category => category.name === cleanName)) return;
  const now = new Date().toISOString();
  const category: LocalCategory = {
    id: crypto.randomUUID ? crypto.randomUUID() : `cat_${Date.now()}`,
    name: cleanName,
    sortOrder: existing.length,
    createdAt: now,
    updatedAt: now,
    serverVersion: 0,
    syncStatus: 'pending',
  };
  await putLocalCategory(category);
  await enqueueMutation({
    entityType: 'category',
    entityId: category.id,
    op: 'create',
    payload: category,
    baseVersion: 0,
  });
  triggerSyncSoon();
}

export async function renameCategoryByName(oldName: string, newName: string): Promise<void> {
  const cleanOld = oldName.trim();
  const cleanNew = newName.trim();
  if (!cleanOld || !cleanNew || cleanOld === cleanNew) return;
  const categories = await getLocalCategories();
  const category = categories.find(item => item.name === cleanOld);
  if (!category) return;
  const next = { ...category, name: cleanNew, updatedAt: new Date().toISOString(), syncStatus: 'pending' as const };
  await putLocalCategory(next);

  const entries = await db.entries.filter(entry => entry.tags.includes(cleanOld)).toArray();
  for (const entry of entries) {
    const updated = {
      ...entry,
      tags: entry.tags.map(tag => tag === cleanOld ? cleanNew : tag),
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending' as const,
    };
    await saveLocalEntry(updated);
    await enqueueMutation({
      entityType: 'entry',
      entityId: updated.id,
      op: 'update',
      payload: entryPayload(updated),
      baseVersion: entry.serverVersion ?? 0,
    });
  }

  await enqueueMutation({
    entityType: 'category',
    entityId: next.id,
    op: 'update',
    payload: next,
    baseVersion: category.serverVersion ?? 0,
  });
  triggerSyncSoon();
}

export async function deleteCategoryByName(name: string): Promise<void> {
  const cleanName = name.trim();
  if (!cleanName) return;
  const category = (await getLocalCategories()).find(item => item.name === cleanName);
  if (!category) return;

  await deleteLocalCategory(category.id);
  const entries = await db.entries.filter(entry => entry.tags.includes(cleanName)).toArray();
  for (const entry of entries) {
    const updated = {
      ...entry,
      tags: entry.tags.filter(tag => tag !== cleanName),
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending' as const,
    };
    await saveLocalEntry(updated);
    await enqueueMutation({
      entityType: 'entry',
      entityId: updated.id,
      op: 'update',
      payload: entryPayload(updated),
      baseVersion: entry.serverVersion ?? 0,
    });
  }

  await enqueueMutation({
    entityType: 'category',
    entityId: category.id,
    op: 'delete',
    payload: { id: category.id },
    baseVersion: category.serverVersion ?? 0,
  });
  triggerSyncSoon();
}

export async function getSyncStatusSnapshot(): Promise<SyncStatusSnapshot> {
  const syncState = getSyncState();
  return {
    pendingCount: await getPendingSyncCount(),
    lastSyncedAt: syncState.lastSyncedAt,
    lastError: syncState.lastError,
    isSyncing: syncState.isSyncing,
  };
}

export async function syncNow(): Promise<SyncStatusSnapshot> {
  await triggerSync({ immediate: true });
  return await getSyncStatusSnapshot();
}

export function getApiBaseUrl(): string {
  return 'local-first';
}

function triggerSyncSoon(): void {
  triggerSync().catch(error => {
    console.warn('后台同步失败:', error);
  });
}

function isMood(value: unknown): value is MoodType {
  return typeof value === 'string' && value in MOOD_CONFIG;
}

function isWeather(value: unknown): value is WeatherType {
  return typeof value === 'string' && value in WEATHER_CONFIG;
}

function htmlToText(html: string): string {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.innerText;
}

void ensureDefaultCategories();
