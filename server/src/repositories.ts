import { randomUUID } from 'node:crypto';
import type { Database } from './db.js';
import { config } from './config.js';
import { countWords, nowIso, toLocalDateString } from './shared/date.js';
import { htmlToPlainText, sanitizeDiaryHtml } from './shared/sanitize.js';

export const moods = ['happy', 'calm', 'sad', 'angry', 'anxious', 'excited', 'tired', 'grateful', 'none'] as const;
export type Mood = typeof moods[number];

export interface EntryPayload {
  id?: string;
  title?: string;
  contentHtml?: string;
  content?: string;
  mood?: Mood;
  categoryId?: string | null;
  tags?: string[];
  dateFor?: string;
  timeFor?: string | null;
  isLocked?: boolean;
  isDeleted?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface EntryRow {
  id: string;
  user_id: string;
  title: string;
  content_html: string;
  plain_text: string;
  mood: Mood;
  category_id: string | null;
  category_name: string | null;
  word_count: number;
  is_locked: 0 | 1;
  is_deleted: 0 | 1;
  date_for: string;
  time_for: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export function getUserId(): string {
  return config.defaultUserId;
}

export function rowToEntry(row: EntryRow) {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    contentHtml: row.content_html,
    content: row.content_html,
    plainText: row.plain_text,
    mood: row.mood,
    categoryId: row.category_id,
    categoryName: row.category_name,
    tags: row.category_name ? [row.category_name] : [],
    wordCount: row.word_count,
    isLocked: Boolean(row.is_locked),
    isDeleted: Boolean(row.is_deleted),
    dateFor: row.date_for,
    timeFor: row.time_for ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? undefined,
  };
}

export function getCategoryIdByName(db: Database, name: string, userId = getUserId()): string | null {
  const row = db.prepare('SELECT id FROM categories WHERE user_id = ? AND name = ?')
    .get(userId, name.trim()) as { id: string } | undefined;
  return row?.id ?? null;
}

export function getCategoryNameById(db: Database, id: string | null | undefined, userId = getUserId()): string | null {
  if (!id) return null;
  const row = db.prepare('SELECT name FROM categories WHERE user_id = ? AND id = ?')
    .get(userId, id) as { name: string } | undefined;
  return row?.name ?? null;
}

export function normalizeEntryPayload(db: Database, payload: EntryPayload, existing?: { id: string; created_at: string }, userId = getUserId()) {
  const rawHtml = payload.contentHtml ?? payload.content ?? '';
  const contentHtml = sanitizeDiaryHtml(rawHtml);
  const plainText = htmlToPlainText(contentHtml);
  const title = (payload.title?.trim() || plainText.slice(0, 30).trim() || '无标题').slice(0, 100);
  const mood = payload.mood && moods.includes(payload.mood) ? payload.mood : 'none';
  const dateFor = payload.dateFor ?? toLocalDateString(new Date());
  const timeFor = payload.timeFor || null;
  const categoryId = resolveCategoryId(db, payload, userId);
  const now = nowIso();

  return {
    id: existing?.id ?? payload.id ?? randomUUID(),
    userId,
    title,
    contentHtml,
    plainText,
    mood,
    categoryId,
    wordCount: countWords(plainText),
    isLocked: payload.isLocked ? 1 : 0,
    isDeleted: payload.isDeleted ? 1 : 0,
    dateFor,
    timeFor,
    createdAt: existing?.created_at ?? payload.createdAt ?? now,
    updatedAt: now,
    deletedAt: payload.isDeleted ? (payload.updatedAt ?? now) : null,
  };
}

function resolveCategoryId(db: Database, payload: EntryPayload, userId: string): string | null {
  if (payload.categoryId === null) return null;
  if (payload.categoryId) {
    return getCategoryNameById(db, payload.categoryId, userId) ? payload.categoryId : null;
  }

  const firstTag = Array.isArray(payload.tags) ? payload.tags.find(tag => tag.trim()) : undefined;
  if (!firstTag) return null;
  return getCategoryIdByName(db, firstTag, userId);
}

export function selectEntryById(db: Database, id: string, userId = getUserId()): EntryRow | undefined {
  return db.prepare(`
    SELECT e.*, c.name AS category_name
    FROM entries e
    LEFT JOIN categories c ON c.id = e.category_id
    WHERE e.user_id = ? AND e.id = ?
  `).get(userId, id) as EntryRow | undefined;
}

export function upsertEntry(db: Database, payload: ReturnType<typeof normalizeEntryPayload>): void {
  db.prepare(`
    INSERT INTO entries (
      id, user_id, title, content_html, plain_text, mood, category_id, word_count,
      is_locked, is_deleted, date_for, time_for, created_at, updated_at, deleted_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      content_html = excluded.content_html,
      plain_text = excluded.plain_text,
      mood = excluded.mood,
      category_id = excluded.category_id,
      word_count = excluded.word_count,
      is_locked = excluded.is_locked,
      is_deleted = excluded.is_deleted,
      date_for = excluded.date_for,
      time_for = excluded.time_for,
      updated_at = excluded.updated_at,
      deleted_at = excluded.deleted_at
  `).run(
    payload.id,
    payload.userId,
    payload.title,
    payload.contentHtml,
    payload.plainText,
    payload.mood,
    payload.categoryId,
    payload.wordCount,
    payload.isLocked,
    payload.isDeleted,
    payload.dateFor,
    payload.timeFor,
    payload.createdAt,
    payload.updatedAt,
    payload.deletedAt,
  );
}
