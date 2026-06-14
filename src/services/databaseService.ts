import type { AppConfig, DiaryEntry, DiaryEntrySummary, MoodType, WeatherType } from '../types';
import { DEFAULT_CONFIG, MOOD_CONFIG, WEATHER_CONFIG } from '../types';
import { apiRequest, jsonBody, API_BASE_URL } from './apiClient';

interface EntryResponse {
  entry: ServerEntry;
}

interface EntriesResponse {
  entries: ServerEntry[];
  hasMore?: boolean;
  nextOffset?: number;
}

interface EntrySummariesResponse {
  entries: ServerEntry[];
  hasMore?: boolean;
  nextOffset?: number;
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
  firstImageSrc?: string;
}

const DEFAULT_ENTRY_LIST_LIMIT = 200;
export const ENTRY_SUMMARY_PAGE_SIZE = 120;

interface CategoriesResponse {
  categories: Array<{ id: string; name: string; entryCount?: number }>;
}

interface SettingsResponse {
  theme: AppConfig['theme'];
  fontSize: AppConfig['fontSize'];
  autoSaveInterval: number;
}

export interface StatsPeriodResponse {
  total: number;
  totalWords: number;
  activeDays: number;
  avgWordsPerEntry: number;
  moodCount: Record<string, number>;
  timelineEntries: { key: string; label: string; count: number; words: number }[];
  weekdayEntries: { weekday: number; count: number; words: number }[];
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

function toDiaryEntry(entry: ServerEntry): DiaryEntry {
  const mood = entry.mood in MOOD_CONFIG ? entry.mood as MoodType : 'none';
  const weather = entry.weather && entry.weather in WEATHER_CONFIG ? entry.weather as WeatherType : 'none';
  return {
    id: entry.id,
    title: entry.title,
    content: entry.contentHtml ?? entry.content ?? '',
    plainText: entry.plainText ?? '',
    mood,
    tags: entry.tags ?? [],
    wordCount: Number(entry.wordCount) || 0,
    isLocked: Boolean(entry.isLocked),
    isDeleted: Boolean(entry.isDeleted),
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    dateFor: entry.dateFor,
    timeFor: entry.timeFor,
    weather,
    location: entry.location ?? '',
  };
}

function toDiaryEntrySummary(entry: ServerEntry): DiaryEntrySummary {
  const mood = entry.mood in MOOD_CONFIG ? entry.mood as MoodType : 'none';
  const weather = entry.weather && entry.weather in WEATHER_CONFIG ? entry.weather as WeatherType : 'none';
  return {
    id: entry.id,
    title: entry.title,
    plainText: entry.plainText ?? '',
    mood,
    tags: entry.tags ?? [],
    wordCount: Number(entry.wordCount) || 0,
    isLocked: Boolean(entry.isLocked),
    isDeleted: Boolean(entry.isDeleted),
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    dateFor: entry.dateFor,
    timeFor: entry.timeFor,
    weather,
    location: entry.location ?? '',
    firstImageSrc: normalizeApiAssetSrc(entry.firstImageSrc ?? ''),
  };
}

function normalizeApiAssetSrc(src: string): string {
  const apiPrefix = '/api/v1';
  if (src.startsWith(apiPrefix)) {
    return `${API_BASE_URL}${src.slice(apiPrefix.length)}`;
  }
  return src;
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
    weather: entry.weather ?? 'none',
    location: entry.location ?? null,
  };
}

export async function getAllEntries(): Promise<DiaryEntry[]> {
  const data = await apiRequest<EntriesResponse>(`/entries?limit=${DEFAULT_ENTRY_LIST_LIMIT}`);
  return data.entries.map(toDiaryEntry);
}

export async function getEntrySummaries(): Promise<DiaryEntrySummary[]> {
  const data = await getEntrySummaryPage();
  return data.entries;
}

export async function getEntrySummaryPage(options: { limit?: number; offset?: number } = {}): Promise<{
  entries: DiaryEntrySummary[];
  hasMore: boolean;
  nextOffset: number;
}> {
  const params = new URLSearchParams({
    view: 'summary',
    limit: String(options.limit ?? ENTRY_SUMMARY_PAGE_SIZE),
  });
  if (options.offset) params.set('offset', String(options.offset));

  const data = await apiRequest<EntrySummariesResponse>(`/entries?${params.toString()}`);
  const entries = data.entries.map(toDiaryEntrySummary);
  return {
    entries,
    hasMore: Boolean(data.hasMore),
    nextOffset: typeof data.nextOffset === 'number'
      ? data.nextOffset
      : (options.offset ?? 0) + entries.length,
  };
}

export async function getEntryById(id: string): Promise<DiaryEntry | undefined> {
  try {
    const data = await apiRequest<EntryResponse>(`/entries/${encodeURIComponent(id)}`);
    return toDiaryEntry(data.entry);
  } catch (error) {
    if (isNotFound(error)) return undefined;
    throw error;
  }
}

export async function getEntriesByDate(dateFor: string): Promise<DiaryEntry[]> {
  const params = new URLSearchParams({ date: dateFor, limit: '500' });
  const data = await apiRequest<EntriesResponse>(`/entries?${params.toString()}`);
  return data.entries.map(toDiaryEntry);
}

export async function getDatesWithEntries(year: number, month: number): Promise<Set<string>> {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  const params = new URLSearchParams({ dateFrom: start, dateTo: end, limit: '500' });
  const data = await apiRequest<EntriesResponse>(`/entries?${params.toString()}`);
  return new Set(data.entries.map(entry => entry.dateFor));
}

export async function saveEntry(entry: DiaryEntry): Promise<void> {
  const existing = await getEntryById(entry.id);
  const method = existing ? 'PUT' : 'POST';
  const path = existing ? `/entries/${encodeURIComponent(entry.id)}` : '/entries';
  await apiRequest<EntryResponse>(path, {
    method,
    body: jsonBody(entryPayload(entry)),
  });
}

/** 彻底删除日记。普通删除请使用 trashEntry。 */
export async function deleteEntry(id: string): Promise<void> {
  await apiRequest<void>(`/trash/entries/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function trashEntry(id: string): Promise<void> {
  await apiRequest<void>(`/entries/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function getTrashedEntries(): Promise<DiaryEntry[]> {
  const data = await apiRequest<EntriesResponse>('/trash/entries');
  return data.entries.map(toDiaryEntry);
}

export async function restoreEntry(id: string): Promise<void> {
  await apiRequest<EntryResponse>(`/trash/entries/${encodeURIComponent(id)}/restore`, { method: 'POST' });
}

export async function clearTrash(): Promise<void> {
  await apiRequest<{ deleted: number }>('/trash/entries', { method: 'DELETE' });
}

export async function clearAllEntries(): Promise<void> {
  await apiRequest<{ deleted: number }>('/entries', { method: 'DELETE' });
}

export async function searchEntries(keyword: string): Promise<DiaryEntry[]> {
  const params = new URLSearchParams({ keyword, limit: '500' });
  const data = await apiRequest<EntriesResponse>(`/entries?${params.toString()}`);
  return data.entries.map(toDiaryEntry);
}

export async function filterEntries(params: {
  keyword?: string;
  mood?: string;
  tags?: string[];
  dateFrom?: string;
  dateTo?: string;
}): Promise<DiaryEntry[]> {
  const query = new URLSearchParams({ limit: '500' });
  if (params.keyword) query.set('keyword', params.keyword);
  if (params.mood) query.set('mood', params.mood);
  if (params.dateFrom) query.set('dateFrom', params.dateFrom);
  if (params.dateTo) query.set('dateTo', params.dateTo);
  if (params.tags?.[0]) {
    const categories = await getCategories();
    const category = categories.find(item => item.name === params.tags?.[0]);
    if (category) query.set('categoryId', category.id);
  }
  const data = await apiRequest<EntriesResponse>(`/entries?${query.toString()}`);
  return data.entries.map(toDiaryEntry);
}

export async function getAllTags(): Promise<string[]> {
  const categories = await getCategories();
  return categories.map(category => category.name).sort();
}

export async function getStats(): Promise<StatsResponse> {
  return await apiRequest<StatsResponse>('/stats/overview');
}

export async function getConfig(): Promise<AppConfig> {
  const [settings, categories] = await Promise.all([
    apiRequest<SettingsResponse>('/settings'),
    getAllTags(),
  ]);
  return {
    ...DEFAULT_CONFIG,
    theme: settings.theme,
    fontSize: settings.fontSize,
    autoSaveInterval: settings.autoSaveInterval,
    categories,
    hasPassword: false,
    passwordHash: '',
  };
}

export async function setConfigItem(key: string, value: unknown): Promise<void> {
  if (key === 'theme' || key === 'fontSize' || key === 'autoSaveInterval') {
    await apiRequest<SettingsResponse>('/settings', {
      method: 'PATCH',
      body: jsonBody({ [key]: value }),
    });
  }
}

export async function exportData(): Promise<string> {
  const data = await apiRequest<unknown>('/export/json');
  return JSON.stringify(data, null, 2);
}

export async function importData(jsonStr: string): Promise<{ count: number }> {
  return await apiRequest<{ count: number }>('/import/json', {
    method: 'POST',
    body: jsonStr,
  });
}

export async function getCategories(): Promise<Array<{ id: string; name: string; entryCount?: number }>> {
  const data = await apiRequest<CategoriesResponse>('/categories');
  return data.categories;
}

export async function createCategory(name: string): Promise<void> {
  await apiRequest('/categories', {
    method: 'POST',
    body: jsonBody({ name }),
  });
}

export async function renameCategoryByName(oldName: string, newName: string): Promise<void> {
  const category = (await getCategories()).find(item => item.name === oldName);
  if (!category) return;
  await apiRequest(`/categories/${encodeURIComponent(category.id)}`, {
    method: 'PUT',
    body: jsonBody({ name: newName }),
  });
}

export async function deleteCategoryByName(name: string): Promise<void> {
  const category = (await getCategories()).find(item => item.name === name);
  if (!category) return;
  await apiRequest(`/categories/${encodeURIComponent(category.id)}`, {
    method: 'DELETE',
  });
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'status' in error && (error as { status: unknown }).status === 404;
}

export function getApiBaseUrl(): string {
  return API_BASE_URL;
}
