import type { AppConfig, DiaryEntry, DiaryEntrySummary } from '../types';
import { DEFAULT_CONFIG } from '../types';
import {
  createCategory,
  deleteCategoryByName,
  ENTRY_SUMMARY_PAGE_SIZE,
  getAllEntries,
  getEntryById,
  getEntrySummaryPage,
  getConfig,
  renameCategoryByName,
  setConfigItem,
} from '../services/databaseService';

// ==================== 全局状态 ====================

interface AppState {
  config: AppConfig;
  allEntries: DiaryEntrySummary[];
  fullEntryCache: Map<string, DiaryEntry>;
  entrySummariesLoaded: boolean;
  entrySummariesHasMore: boolean;
  entrySummariesNextOffset: number;
  currentEditId: string | null;    // 当前正在编辑的日记 ID（null = 新建）
  isUnlocked: boolean;             // 应用是否已解锁
  allTags: string[];               // 所有已使用的标签
}

const state: AppState = {
  config: { ...DEFAULT_CONFIG },
  allEntries: [],
  fullEntryCache: new Map(),
  entrySummariesLoaded: false,
  entrySummariesHasMore: false,
  entrySummariesNextOffset: 0,
  currentEditId: null,
  isUnlocked: false,
  allTags: [],
};

let entrySummaryRefreshPromise: Promise<DiaryEntrySummary[]> | null = null;
const ENTRY_SUMMARIES_CACHE_KEY = 'diary-entry-summaries-v1';

// ==================== 初始化 ====================

/** 初始化状态（从 DB 加载配置和日记列表） */
export async function initStore(): Promise<void> {
  hydrateEntrySummariesCache();
  refreshTags();

  const token = localStorage.getItem('diary-token');
  if (token) {
    try {
      state.config = await getConfig();
      if (!state.config.categories) {
        state.config.categories = ['生活', '工作', '心情', '随笔'];
        await setConfigItem('categories', state.config.categories);
      }
      refreshTags();
      void refreshEntrySummaries().catch(error => {
        console.error('初始化日记摘要失败:', error);
      });
    } catch (error) {
      console.warn('获取配置失败 (凭证失效，等待 auth 拦截):', error);
      state.config = { ...DEFAULT_CONFIG };
    }
  } else {
    state.config = { ...DEFAULT_CONFIG };
  }

  // 如果没有密码则直接解锁
  if (!state.config.hasPassword) {
    state.isUnlocked = true;
  }
}

/** 登录成功后重新加载当前用户的配置和日记摘要列表 */
export async function loadUserData(): Promise<void> {
  try {
    state.config = await getConfig();
    if (!state.config.categories) {
      state.config.categories = ['生活', '工作', '心情', '随笔'];
      await setConfigItem('categories', state.config.categories);
    }
    refreshTags();
    await refreshEntrySummaries();
    if (!state.config.hasPassword) {
      state.isUnlocked = true;
    }
  } catch (error) {
    console.error('加载用户数据失败:', error);
  }
}

// ==================== Getters ====================

export function getAppConfig(): AppConfig { return state.config; }
export function getEntries(): DiaryEntrySummary[] { return state.allEntries; }
export function getCurrentEditId(): string | null { return state.currentEditId; }
export function isAppUnlocked(): boolean { return state.isUnlocked; }
export function getAllTagsList(): string[] { return state.allTags; }
export function hasEntrySummaries(): boolean { return state.entrySummariesLoaded; }
export function hasMoreEntrySummaries(): boolean { return state.entrySummariesHasMore; }
export function getEntrySummaryById(id: string): DiaryEntrySummary | undefined {
  return state.allEntries.find(entry => entry.id === id);
}

// ==================== Setters ====================

export function setCurrentEditId(id: string | null): void {
  state.currentEditId = id;
}

export function setUnlocked(value: boolean): void {
  state.isUnlocked = value;
}

export async function updateConfig(key: keyof AppConfig, value: unknown): Promise<void> {
  await setConfigItem(key, value);
  (state.config as unknown as Record<string, unknown>)[key] = value;
}

/** 重新从 DB 刷新日记列表 */
export async function refreshEntries(): Promise<DiaryEntry[]> {
  const fullEntries = await getAllEntries();
  state.allEntries = mergeRefreshedEntrySummaries(fullEntries.map(diaryEntryToSummary), false);
  state.fullEntryCache.clear();
  fullEntries.forEach(entry => state.fullEntryCache.set(entry.id, entry));
  state.entrySummariesLoaded = true;
  refreshTags();
  persistEntrySummariesCache();
  return fullEntries;
}

export async function refreshEntrySummaries(): Promise<DiaryEntrySummary[]> {
  if (entrySummaryRefreshPromise) return entrySummaryRefreshPromise;

  entrySummaryRefreshPromise = getEntrySummaryPage({ offset: 0, limit: ENTRY_SUMMARY_PAGE_SIZE })
    .then(page => {
      state.allEntries = mergeRefreshedEntrySummaries(page.entries);
      state.entrySummariesLoaded = true;
      state.entrySummariesHasMore = page.hasMore;
      state.entrySummariesNextOffset = page.nextOffset;
      refreshTags();
      persistEntrySummariesCache();
      return state.allEntries;
    })
    .finally(() => {
      entrySummaryRefreshPromise = null;
    });

  return entrySummaryRefreshPromise;
}

export async function loadMoreEntrySummaries(): Promise<DiaryEntrySummary[]> {
  if (!state.entrySummariesHasMore) return state.allEntries;

  const page = await getEntrySummaryPage({
    offset: state.entrySummariesNextOffset,
    limit: ENTRY_SUMMARY_PAGE_SIZE,
  });
  const existingIds = new Set(state.allEntries.map(entry => entry.id));
  state.allEntries = [
    ...state.allEntries,
    ...page.entries.filter(entry => !existingIds.has(entry.id)),
  ];
  state.entrySummariesHasMore = page.hasMore;
  state.entrySummariesNextOffset = page.nextOffset;
  state.entrySummariesLoaded = true;
  refreshTags();
  persistEntrySummariesCache();
  return state.allEntries;
}

export async function getFullEntryById(id: string): Promise<DiaryEntry | undefined> {
  const cached = state.fullEntryCache.get(id);
  if (cached) return cached;

  const entry = await getEntryById(id);
  if (entry) state.fullEntryCache.set(id, entry);
  return entry;
}

export function cacheFullEntry(entry: DiaryEntry): void {
  state.fullEntryCache.set(entry.id, entry);
}

export function upsertEntrySummary(entry: DiaryEntry): void {
  const summary = diaryEntryToSummary(entry);
  const existingIndex = state.allEntries.findIndex(item => item.id === summary.id);
  if (existingIndex >= 0) {
    state.allEntries[existingIndex] = summary;
  } else {
    state.allEntries.unshift(summary);
  }
  state.allEntries.sort(compareEntrySummaries);
  state.entrySummariesLoaded = true;
  refreshTags();
  persistEntrySummariesCache();
}

export function removeEntrySummary(id: string): void {
  state.allEntries = state.allEntries.filter(entry => entry.id !== id);
  state.fullEntryCache.delete(id);
  refreshTags();
  persistEntrySummariesCache();
}

export function invalidateEntryCache(id?: string): void {
  if (id) state.fullEntryCache.delete(id);
  else state.fullEntryCache.clear();
}

function mergeRefreshedEntrySummaries(nextEntries: DiaryEntrySummary[], keepRecentLocal = true): DiaryEntrySummary[] {
  const previousEntries = state.allEntries;
  const previousById = new Map(previousEntries.map(entry => [entry.id, entry]));
  const merged = nextEntries.map(entry => mergeEntrySummaryPreview(entry, previousById.get(entry.id)));
  const mergedIds = new Set(merged.map(entry => entry.id));

  if (keepRecentLocal) {
    previousEntries.forEach(entry => {
      if (!mergedIds.has(entry.id) && isRecentLocalSummary(entry)) {
        merged.push(entry);
        mergedIds.add(entry.id);
      }
    });
  }

  return merged.sort(compareEntrySummaries);
}

function mergeEntrySummaryPreview(next: DiaryEntrySummary, previous?: DiaryEntrySummary): DiaryEntrySummary {
  if (!previous?.firstImageSrc || !next.firstImageSrc) return next;
  if (!previous.firstImageSrc.startsWith('data:')) return next;
  if (!isServerFirstImageSrc(next.firstImageSrc)) return next;
  return {
    ...next,
    firstImageSrc: previous.firstImageSrc,
  };
}

function isRecentLocalSummary(entry: DiaryEntrySummary): boolean {
  const updatedAt = Date.parse(entry.updatedAt);
  return Number.isFinite(updatedAt) && Date.now() - updatedAt < 90_000;
}

function diaryEntryToSummary(entry: DiaryEntry): DiaryEntrySummary {
  const firstImageSrc = extractFirstImageSrc(entry.content);
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
    firstImageSrc: firstImageSrc
      ? getOptimisticFirstImageSrc(entry.id, firstImageSrc)
      : '',
  };
}

function getOptimisticFirstImageSrc(entryId: string, src: string): string {
  if (src.startsWith('data:') || /^https?:\/\//i.test(src) || src.startsWith('/')) {
    return src;
  }
  return `/api/v1/entries/${encodeURIComponent(entryId)}/first-image`;
}

function isServerFirstImageSrc(src: string): boolean {
  return /\/api\/v1\/entries\/[^/]+\/first-image(?:$|[?#])/i.test(src);
}

function compareEntrySummaries(a: DiaryEntrySummary, b: DiaryEntrySummary): number {
  const aKey = `${a.dateFor} ${a.timeFor ?? ''} ${a.updatedAt}`;
  const bKey = `${b.dateFor} ${b.timeFor ?? ''} ${b.updatedAt}`;
  return bKey.localeCompare(aKey);
}

function refreshTags(): void {
  const tagSet = new Set<string>(state.config.categories || []);
  state.allEntries.forEach(e => e.tags.forEach(t => tagSet.add(t)));
  state.allTags = Array.from(tagSet).sort();
}

function extractFirstImageSrc(html: string): string {
  return html.match(/<img[^>]+src=(["'])(.*?)\1/i)?.[2] ?? '';
}

function hydrateEntrySummariesCache(): void {
  if (typeof sessionStorage === 'undefined') return;

  try {
    const raw = sessionStorage.getItem(ENTRY_SUMMARIES_CACHE_KEY);
    if (!raw) return;

    const cached = JSON.parse(raw) as unknown;
    if (!Array.isArray(cached)) {
      sessionStorage.removeItem(ENTRY_SUMMARIES_CACHE_KEY);
      return;
    }

    state.allEntries = cached
      .map(normalizeCachedSummary)
      .filter((entry): entry is DiaryEntrySummary => Boolean(entry));
    state.entrySummariesLoaded = true;
    state.entrySummariesHasMore = state.allEntries.length >= ENTRY_SUMMARY_PAGE_SIZE;
    state.entrySummariesNextOffset = state.allEntries.length;
  } catch (error) {
    sessionStorage.removeItem(ENTRY_SUMMARIES_CACHE_KEY);
    console.warn('恢复日记摘要缓存失败:', error);
  }
}

function persistEntrySummariesCache(): void {
  if (typeof sessionStorage === 'undefined') return;

  try {
    sessionStorage.setItem(ENTRY_SUMMARIES_CACHE_KEY, JSON.stringify(state.allEntries.map(entry => ({
      ...entry,
      firstImageSrc: entry.firstImageSrc?.startsWith('data:') ? '' : entry.firstImageSrc,
    }))));
  } catch (error) {
    console.warn('保存日记摘要缓存失败:', error);
  }
}

function normalizeCachedSummary(value: unknown): DiaryEntrySummary | null {
  if (!value || typeof value !== 'object') return null;
  const entry = value as Partial<DiaryEntrySummary>;
  if (!entry.id || !entry.dateFor) return null;

  return {
    id: String(entry.id),
    title: String(entry.title ?? ''),
    plainText: String(entry.plainText ?? ''),
    mood: entry.mood ?? 'none',
    tags: Array.isArray(entry.tags) ? entry.tags.map(String) : [],
    wordCount: Number(entry.wordCount) || 0,
    isLocked: Boolean(entry.isLocked),
    isDeleted: Boolean(entry.isDeleted),
    createdAt: String(entry.createdAt ?? ''),
    updatedAt: String(entry.updatedAt ?? ''),
    dateFor: String(entry.dateFor),
    timeFor: entry.timeFor ? String(entry.timeFor) : undefined,
    weather: entry.weather,
    location: entry.location ? String(entry.location) : '',
    firstImageSrc: entry.firstImageSrc ? String(entry.firstImageSrc) : '',
  };
}

/** 添加新分类 */
export async function addCategory(name: string): Promise<void> {
  name = name.trim();
  if (!name) return;
  const categories = state.config.categories || [];
  if (!categories.includes(name)) {
    await createCategory(name);
    state.config.categories = [...categories, name];
    await refreshEntrySummaries();
  }
}

/** 重命名分类 */
export async function renameCategory(oldName: string, newName: string): Promise<void> {
  oldName = oldName.trim();
  newName = newName.trim();
  if (!oldName || !newName || oldName === newName) return;

  // 1. 更新后端分类
  await renameCategoryByName(oldName, newName);

  // 2. 更新本地 config.categories 快照
  let categories = state.config.categories || [];
  categories = categories.map(c => c === oldName ? newName : c);
  const uniqueCategories = Array.from(new Set(categories));
  state.config.categories = uniqueCategories;

  await refreshEntrySummaries();
}

/** 删除分类 */
export async function deleteCategory(name: string): Promise<void> {
  name = name.trim();
  if (!name) return;

  // 1. 从后端删除分类，后端会把相关日记置为未分类
  await deleteCategoryByName(name);

  // 2. 更新本地 config.categories 快照
  let categories = state.config.categories || [];
  categories = categories.filter(c => c !== name);
  state.config.categories = categories;

  await refreshEntrySummaries();
}
