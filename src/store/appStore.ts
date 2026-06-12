import type { AppConfig, DiaryEntry } from '../types';
import { DEFAULT_CONFIG } from '../types';
import {
  createCategory,
  deleteCategoryByName,
  getAllEntries,
  getConfig,
  renameCategoryByName,
  setConfigItem,
} from '../services/databaseService';

// ==================== 全局状态 ====================

interface AppState {
  config: AppConfig;
  allEntries: DiaryEntry[];
  currentEditId: string | null;    // 当前正在编辑的日记 ID（null = 新建）
  isUnlocked: boolean;             // 应用是否已解锁
  allTags: string[];               // 所有已使用的标签
}

const state: AppState = {
  config: { ...DEFAULT_CONFIG },
  allEntries: [],
  currentEditId: null,
  isUnlocked: false,
  allTags: [],
};

// ==================== 初始化 ====================

/** 初始化状态（从 DB 加载配置和日记列表） */
export async function initStore(): Promise<void> {
  state.config = await getConfig();
  if (!state.config.categories) {
    state.config.categories = ['生活', '工作', '心情', '随笔'];
    await setConfigItem('categories', state.config.categories);
  }
  state.allEntries = await getAllEntries();
  // 合并配置中的分类以及日记中已经使用的标签并去重
  const tagSet = new Set<string>(state.config.categories);
  state.allEntries.forEach(e => e.tags.forEach(t => tagSet.add(t)));
  state.allTags = Array.from(tagSet).sort();
  // 如果没有密码则直接解锁
  if (!state.config.hasPassword) {
    state.isUnlocked = true;
  }
}

// ==================== Getters ====================

export function getAppConfig(): AppConfig { return state.config; }
export function getEntries(): DiaryEntry[] { return state.allEntries; }
export function getCurrentEditId(): string | null { return state.currentEditId; }
export function isAppUnlocked(): boolean { return state.isUnlocked; }
export function getAllTagsList(): string[] { return state.allTags; }

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
  state.allEntries = await getAllEntries();
  const tagSet = new Set<string>(state.config.categories || []);
  state.allEntries.forEach(e => e.tags.forEach(t => tagSet.add(t)));
  state.allTags = Array.from(tagSet).sort();
  return state.allEntries;
}

/** 添加新分类 */
export async function addCategory(name: string): Promise<void> {
  name = name.trim();
  if (!name) return;
  const categories = state.config.categories || [];
  if (!categories.includes(name)) {
    await createCategory(name);
    state.config.categories = [...categories, name];
    await refreshEntries();
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

  await refreshEntries();
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

  await refreshEntries();
}
