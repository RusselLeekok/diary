import Dexie, { type Table } from 'dexie';
import type { DiaryEntry, AppConfig, MoodType, WeatherType } from '../types';
import { DEFAULT_CONFIG, MOOD_CONFIG, WEATHER_CONFIG } from '../types';
import { countWords, toDateString } from '../utils/dateUtils';
import { sanitizeDiaryContent } from '../utils/htmlUtils';

export type SyncStatus = 'synced' | 'pending' | 'conflict';
export type SyncEntityType = 'entry' | 'category' | 'setting';
export type SyncOperation = 'create' | 'update' | 'delete';

export interface LocalCategory {
  id: string;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  serverVersion?: number;
  syncStatus?: SyncStatus;
  lastSyncedAt?: string;
}

export interface SyncOutboxMutation {
  mutationId: string;
  entityType: SyncEntityType;
  entityId: string;
  op: SyncOperation;
  payload: unknown;
  baseVersion: number;
  createdAt: string;
  retryCount: number;
}

export interface SyncMeta {
  key: string;
  value: unknown;
}

// 定义数据库类
class DiaryDatabase extends Dexie {
  entries!: Table<DiaryEntry, string>;
  config!: Table<{ key: string; value: unknown }, string>;
  categories!: Table<LocalCategory, string>;
  outbox!: Table<SyncOutboxMutation, string>;
  syncMeta!: Table<SyncMeta, string>;

  constructor() {
    super('DiaryAppDB');
    this.version(1).stores({
      entries: 'id, dateFor, mood, createdAt, updatedAt',
      config: 'key',
    });
    this.version(2).stores({
      entries: 'id, dateFor, mood, createdAt, updatedAt, syncStatus, serverVersion, deletedAt',
      config: 'key',
      categories: 'id, name, sortOrder, updatedAt, syncStatus, serverVersion, deletedAt',
      outbox: 'mutationId, entityType, entityId, op, createdAt, retryCount',
      syncMeta: 'key',
    });
  }
}

export const db = new DiaryDatabase();

const DEFAULT_CATEGORY_NAMES = ['生活', '工作', '心情', '随笔'];

export async function ensureDefaultCategories(): Promise<LocalCategory[]> {
  const existing = await db.categories.filter(category => !category.deletedAt).toArray();
  if (existing.length > 0) return existing.sort(compareCategories);

  const now = new Date().toISOString();
  const categories = DEFAULT_CATEGORY_NAMES.map((name, index) => ({
    id: `local_cat_${index + 1}`,
    name,
    sortOrder: index,
    createdAt: now,
    updatedAt: now,
    serverVersion: 0,
    syncStatus: 'synced' as SyncStatus,
  }));
  await db.categories.bulkPut(categories);
  return categories;
}

export async function getLocalCategories(): Promise<LocalCategory[]> {
  await ensureDefaultCategories();
  return (await db.categories.filter(category => !category.deletedAt).toArray()).sort(compareCategories);
}

export async function putLocalCategory(category: LocalCategory): Promise<void> {
  await db.categories.put(category);
}

export async function deleteLocalCategory(id: string): Promise<void> {
  await db.categories.delete(id);
}

function compareCategories(a: LocalCategory, b: LocalCategory): number {
  return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);
}

export async function getSyncMeta<T = unknown>(key: string): Promise<T | undefined> {
  return (await db.syncMeta.get(key))?.value as T | undefined;
}

export async function setSyncMeta(key: string, value: unknown): Promise<void> {
  await db.syncMeta.put({ key, value });
}

export async function getOrCreateDeviceId(): Promise<string> {
  const existing = await getSyncMeta<string>('deviceId');
  if (existing) return existing;
  const deviceId = `device_${generateImportId()}`;
  await setSyncMeta('deviceId', deviceId);
  return deviceId;
}

export async function enqueueMutation(mutation: Omit<SyncOutboxMutation, 'mutationId' | 'createdAt' | 'retryCount'> & {
  mutationId?: string;
  createdAt?: string;
  retryCount?: number;
}): Promise<SyncOutboxMutation> {
  const item: SyncOutboxMutation = {
    mutationId: mutation.mutationId ?? `mut_${generateImportId()}`,
    entityType: mutation.entityType,
    entityId: mutation.entityId,
    op: mutation.op,
    payload: mutation.payload,
    baseVersion: mutation.baseVersion,
    createdAt: mutation.createdAt ?? new Date().toISOString(),
    retryCount: mutation.retryCount ?? 0,
  };
  await db.outbox.put(item);
  return item;
}

export async function getOutboxMutations(limit = 100): Promise<SyncOutboxMutation[]> {
  return await db.outbox.orderBy('createdAt').limit(limit).toArray();
}

export async function removeOutboxMutations(ids: string[]): Promise<void> {
  if (ids.length > 0) await db.outbox.bulkDelete(ids);
}

export async function incrementOutboxRetries(ids: string[]): Promise<void> {
  await db.transaction('rw', db.outbox, async () => {
    for (const id of ids) {
      const mutation = await db.outbox.get(id);
      if (mutation) {
        await db.outbox.put({ ...mutation, retryCount: mutation.retryCount + 1 });
      }
    }
  });
}

export async function getPendingSyncCount(): Promise<number> {
  return await db.outbox.count();
}

// ==================== 日记 CRUD ====================

/** 获取所有日记（按时间倒序） */
export async function getAllEntries(): Promise<DiaryEntry[]> {
  const entries = await db.entries.orderBy('dateFor').reverse().toArray();
  return entries.filter(e => e.isDeleted !== true);
}

/** 根据 ID 获取日记 */
export async function getEntryById(id: string): Promise<DiaryEntry | undefined> {
  return await db.entries.get(id);
}

/** 根据日期获取日记列表 */
export async function getEntriesByDate(dateFor: string): Promise<DiaryEntry[]> {
  return await db.entries.where('dateFor').equals(dateFor).toArray();
}

/** 获取某月内有日记的所有日期 */
export async function getDatesWithEntries(year: number, month: number): Promise<Set<string>> {
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const entries = await db.entries
    .where('dateFor')
    .startsWith(prefix)
    .toArray();
  return new Set(entries.filter(e => e.isDeleted !== true).map(e => e.dateFor));
}

/** 保存日记（新建或更新） */
export async function saveEntry(entry: DiaryEntry): Promise<void> {
  await db.entries.put(entry);
}

/** 删除日记 */
export async function deleteEntry(id: string): Promise<void> {
  await db.entries.delete(id);
}

/** 全文搜索 */
export async function searchEntries(keyword: string): Promise<DiaryEntry[]> {
  const lowerKw = keyword.toLowerCase();
  const entries = await db.entries
    .filter(entry =>
      entry.isDeleted !== true && (
        entry.plainText.toLowerCase().includes(lowerKw) ||
        entry.title.toLowerCase().includes(lowerKw) ||
        entry.tags.some(t => t.toLowerCase().includes(lowerKw))
      )
    )
    .toArray();
  return entries;
}

/** 高级过滤 */
export async function filterEntries(params: {
  keyword?: string;
  mood?: string;
  tags?: string[];
  dateFrom?: string;
  dateTo?: string;
}): Promise<DiaryEntry[]> {
  let collection = db.entries.orderBy('dateFor').reverse();
  const results = await collection.toArray();
  return results.filter(entry => {
    if (entry.isDeleted === true) return false;
    if (params.keyword) {
      const kw = params.keyword.toLowerCase();
      if (!entry.plainText.toLowerCase().includes(kw) &&
          !entry.title.toLowerCase().includes(kw)) return false;
    }
    if (params.mood && params.mood !== '' && entry.mood !== params.mood) return false;
    if (params.tags && params.tags.length > 0) {
      if (!params.tags.some(t => entry.tags.includes(t))) return false;
    }
    if (params.dateFrom && entry.dateFor < params.dateFrom) return false;
    if (params.dateTo && entry.dateFor > params.dateTo) return false;
    return true;
  });
}

/** 获取所有标签（去重） */
export async function getAllTags(): Promise<string[]> {
  const entries = await db.entries.toArray();
  const categories = await getLocalCategories();
  const tagSet = new Set<string>(categories.map(category => category.name));
  entries.forEach(e => e.tags.forEach(t => tagSet.add(t)));
  return Array.from(tagSet).sort();
}

/** 获取统计数据 */
export async function getStats() {
  const all = await db.entries.orderBy('dateFor').toArray();
  const entries = all.filter(e => e.isDeleted !== true);
  const total = entries.length;
  const totalWords = entries.reduce((sum, e) => sum + e.wordCount, 0);

  // 情绪分布
  const moodCount: Record<string, number> = {};
  entries.forEach(e => {
    moodCount[e.mood] = (moodCount[e.mood] || 0) + 1;
  });

  // 近30天每日字数
  const today = new Date();
  const currentYear = today.getFullYear();
  const dailyWords: { date: string; count: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = toDateString(d);
    const dayEntries = entries.filter(e => e.dateFor === dateStr);
    dailyWords.push({
      date: dateStr,
      count: dayEntries.reduce((sum, e) => sum + e.wordCount, 0),
    });
  }

  // 连续打卡天数
  let streak = 0;
  let maxStreak = 0;
  const dateSet = new Set(entries.map(e => e.dateFor));
  const cur = new Date(today);
  // 从今天往前数
  while (true) {
    const dateStr = toDateString(cur);
    if (dateSet.has(dateStr)) {
      streak++;
      cur.setDate(cur.getDate() - 1);
    } else {
      break;
    }
  }
  // 最长连续
  let tempStreak = 0;
  const sortedDates = Array.from(dateSet).sort();
  for (let i = 0; i < sortedDates.length; i++) {
    if (i === 0) {
      tempStreak = 1;
    } else {
      const prev = new Date(sortedDates[i - 1]);
      const curr = new Date(sortedDates[i]);
      const diff = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
      if (diff === 1) {
        tempStreak++;
      } else {
        tempStreak = 1;
      }
    }
    maxStreak = Math.max(maxStreak, tempStreak);
  }

  const entryYears = entries
    .map(entry => Number(entry.dateFor.slice(0, 4)))
    .filter(year => Number.isInteger(year));
  const uniqueYears = Array.from(new Set(entryYears)).sort((a, b) => b - a);
  const years = uniqueYears.length > 0 ? uniqueYears : [currentYear];

  const yearStats = Object.fromEntries(years.map(year => {
    const yearEntries = entries.filter(entry => entry.dateFor.startsWith(`${year}-`));
    const timelineEntries = buildYearMonthTimeline(entries, year);
    const summary = summarizeStatsEntries(yearEntries, timelineEntries);

    return [String(year), {
      year,
      ...summary,
      monthlyEntries: timelineEntries.map(entry => ({
        month: Number(entry.key.slice(5, 7)),
        count: entry.count,
        words: entry.words,
      })),
    }];
  }));

  const todayString = toDateString(today);
  const last30Start = toDateString(addDaysForStats(today, -29));
  const last180Start = toDateString(addDaysForStats(today, -179));
  const allStart = entries[0]?.dateFor ?? todayString;
  const allEnd = entries[entries.length - 1]?.dateFor ?? todayString;

  const periodStats = {
    all: summarizeStatsEntries(entries, buildYearlyTimeline(entries, allStart, allEnd)),
    last30: summarizeStatsEntries(
      entries.filter(entry => entry.dateFor >= last30Start && entry.dateFor <= todayString),
      buildDailyTimeline(entries, today, 30),
    ),
    last180: summarizeStatsEntries(
      entries.filter(entry => entry.dateFor >= last180Start && entry.dateFor <= todayString),
      buildMonthlyTimeline(entries, last180Start, todayString),
    ),
  };

  return { total, totalWords, moodCount, dailyWords, streak, maxStreak, years, currentYear, yearStats, periodStats };
}

type StatsTimelineEntry = { key: string; label: string; count: number; words: number };

function summarizeStatsEntries(entries: DiaryEntry[], timelineEntries: StatsTimelineEntry[]) {
  const total = entries.length;
  const totalWords = entries.reduce((sum, entry) => sum + entry.wordCount, 0);
  const moodCount: Record<string, number> = {};
  const weekdayEntries = Array.from({ length: 7 }, (_, weekday) => ({ weekday, count: 0, words: 0 }));
  const activeDateSet = new Set<string>();

  entries.forEach(entry => {
    moodCount[entry.mood] = (moodCount[entry.mood] ?? 0) + 1;
    activeDateSet.add(entry.dateFor);

    const weekday = new Date(`${entry.dateFor}T00:00:00`).getDay();
    weekdayEntries[weekday].count += 1;
    weekdayEntries[weekday].words += entry.wordCount;
  });

  return {
    total,
    totalWords,
    activeDays: activeDateSet.size,
    avgWordsPerEntry: total > 0 ? Math.round(totalWords / total) : 0,
    moodCount,
    timelineEntries,
    weekdayEntries,
    maxStreak: calculateMaxStreak(activeDateSet),
  };
}

function calculateMaxStreak(dateSet: Set<string>): number {
  let maxStreak = 0;
  let tempStreak = 0;
  const sortedDates = Array.from(dateSet).sort();
  for (let i = 0; i < sortedDates.length; i++) {
    if (i === 0) {
      tempStreak = 1;
    } else {
      const prev = new Date(sortedDates[i - 1]);
      const curr = new Date(sortedDates[i]);
      const diff = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
      tempStreak = diff === 1 ? tempStreak + 1 : 1;
    }
    maxStreak = Math.max(maxStreak, tempStreak);
  }
  return maxStreak;
}

function buildDailyTimeline(entries: DiaryEntry[], today: Date, days: number): StatsTimelineEntry[] {
  return Array.from({ length: days }, (_, index) => {
    const date = toDateString(addDaysForStats(today, index - days + 1));
    const dayEntries = entries.filter(entry => entry.dateFor === date);
    return {
      key: date,
      label: date.slice(5),
      count: dayEntries.length,
      words: dayEntries.reduce((sum, entry) => sum + entry.wordCount, 0),
    };
  });
}

function buildMonthlyTimeline(entries: DiaryEntry[], startDate: string, endDate: string): StatsTimelineEntry[] {
  const start = new Date(`${startDate.slice(0, 7)}-01T00:00:00`);
  const end = new Date(`${endDate.slice(0, 7)}-01T00:00:00`);
  const result: StatsTimelineEntry[] = [];
  const cursor = new Date(start);

  while (cursor <= end) {
    const year = cursor.getFullYear();
    const month = cursor.getMonth() + 1;
    const key = `${year}-${String(month).padStart(2, '0')}`;
    const monthEntries = entries.filter(entry => entry.dateFor.startsWith(key));
    result.push({
      key,
      label: `${year}年${month}月`,
      count: monthEntries.length,
      words: monthEntries.reduce((sum, entry) => sum + entry.wordCount, 0),
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return result;
}

function buildYearlyTimeline(entries: DiaryEntry[], startDate: string, endDate: string): StatsTimelineEntry[] {
  const startYear = Number(startDate.slice(0, 4));
  const endYear = Number(endDate.slice(0, 4));

  return Array.from({ length: endYear - startYear + 1 }, (_, index) => {
    const year = startYear + index;
    const yearEntries = entries.filter(entry => entry.dateFor.startsWith(`${year}-`));
    return {
      key: String(year),
      label: `${year}年`,
      count: yearEntries.length,
      words: yearEntries.reduce((sum, entry) => sum + entry.wordCount, 0),
    };
  });
}

function buildYearMonthTimeline(entries: DiaryEntry[], year: number): StatsTimelineEntry[] {
  return Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const key = `${year}-${String(month).padStart(2, '0')}`;
    const monthEntries = entries.filter(entry => entry.dateFor.startsWith(key));
    return {
      key,
      label: `${month}月`,
      count: monthEntries.length,
      words: monthEntries.reduce((sum, entry) => sum + entry.wordCount, 0),
    };
  });
}

function addDaysForStats(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

// ==================== 配置 ====================

/** 获取配置 */
export async function getConfig(): Promise<AppConfig> {
  const keys = ['theme', 'fontSize', 'hasPassword', 'passwordHash', 'autoSaveInterval', 'categories'];
  const config = { ...DEFAULT_CONFIG };
  for (const key of keys) {
    const row = await db.config.get(key);
    if (row !== undefined) {
      (config as Record<string, unknown>)[key] = row.value;
    }
  }
  config.categories = (await getLocalCategories()).map(category => category.name);
  return config;
}

/** 保存单项配置 */
export async function setConfigItem(key: string, value: unknown): Promise<void> {
  await db.config.put({ key, value });
}

// ==================== 数据导入/导出 ====================

/** 导出所有数据为 JSON */
export async function exportData(): Promise<string> {
  const entries = await getAllEntries();
  const config = await getConfig();
  return JSON.stringify({ entries, config, exportedAt: new Date().toISOString() }, null, 2);
}

/** 从 JSON 导入数据 */
export async function importData(jsonStr: string): Promise<{ count: number }> {
  const data = JSON.parse(jsonStr);
  if (!data.entries || !Array.isArray(data.entries)) {
    throw new Error('无效的数据格式');
  }
  const entries = data.entries.map((entry: unknown, index: number) => normalizeImportedEntry(entry, index));
  await db.entries.bulkPut(entries);
  return { count: entries.length };
}

function normalizeImportedEntry(raw: unknown, index: number): DiaryEntry {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`第 ${index + 1} 条日记格式无效`);
  }

  const item = raw as Partial<DiaryEntry>;
  const now = new Date().toISOString();
  const content = sanitizeDiaryContent(typeof item.content === 'string' ? item.content : '');
  const plainText = typeof item.plainText === 'string' ? item.plainText : htmlToText(content);
  const mood = isMoodType(item.mood) ? item.mood : 'none';
  const weather = isWeatherType(item.weather) ? item.weather : 'none';
  const location = typeof item.location === 'string' ? item.location.trim().slice(0, 100) : '';
  const dateFor = isDateString(item.dateFor) ? item.dateFor : toDateString(new Date());
  const timeFor = typeof item.timeFor === 'string' && isTimeString(item.timeFor) ? item.timeFor : undefined;
  const title = typeof item.title === 'string' ? item.title.trim().slice(0, 100) : '';
  const tags = Array.isArray(item.tags)
    ? Array.from(new Set(item.tags.filter((tag): tag is string => typeof tag === 'string').map(tag => tag.trim()).filter(Boolean)))
    : [];

  return {
    id: typeof item.id === 'string' && item.id.trim() ? item.id : generateImportId(),
    title: title || plainText.slice(0, 30).trim() || '无标题',
    content,
    plainText,
    mood,
    tags,
    wordCount: typeof item.wordCount === 'number' && Number.isFinite(item.wordCount)
      ? Math.max(0, Math.floor(item.wordCount))
      : countWords(plainText),
    isLocked: Boolean(item.isLocked),
    createdAt: typeof item.createdAt === 'string' && !Number.isNaN(Date.parse(item.createdAt)) ? item.createdAt : now,
    updatedAt: typeof item.updatedAt === 'string' && !Number.isNaN(Date.parse(item.updatedAt)) ? item.updatedAt : now,
    dateFor,
    timeFor,
    weather,
    location,
  };
}

function isMoodType(value: unknown): value is MoodType {
  return typeof value === 'string' && value in MOOD_CONFIG;
}

function isWeatherType(value: unknown): value is WeatherType {
  return typeof value === 'string' && value in WEATHER_CONFIG;
}

function isDateString(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isTimeString(value: string): boolean {
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) return false;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

function htmlToText(html: string): string {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.innerText;
}

function generateImportId(): string {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ==================== 垃圾箱/回收站核心操作 ====================

/** 获取所有已删除日记（按时间倒序） */
export async function getTrashedEntries(): Promise<DiaryEntry[]> {
  const all = await db.entries.orderBy('dateFor').reverse().toArray();
  return all.filter(e => e.isDeleted === true);
}

/** 将日记移入回收站（软删除） */
export async function trashEntry(id: string): Promise<void> {
  const entry = await db.entries.get(id);
  if (entry) {
    entry.isDeleted = true;
    entry.updatedAt = new Date().toISOString();
    await db.entries.put(entry);
  }
}

/** 从回收站恢复日记 */
export async function restoreEntry(id: string): Promise<void> {
  const entry = await db.entries.get(id);
  if (entry) {
    entry.isDeleted = false;
    entry.updatedAt = new Date().toISOString();
    await db.entries.put(entry);
  }
}

/** 清空回收站（永久物理删除所有已删除日记） */
export async function clearTrash(): Promise<void> {
  const trashed = await getTrashedEntries();
  const ids = trashed.map(e => e.id);
  if (ids.length > 0) {
    await db.entries.bulkDelete(ids);
  }
}
