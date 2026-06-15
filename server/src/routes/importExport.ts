import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  getCategoryIdByName,
  getUserId,
  normalizeEntryPayload,
  rowToEntry,
  upsertEntry,
  type EntryPayload,
  type EntryRow,
} from '../repositories.js';
import { nowIso, toLocalDateString } from '../shared/date.js';

const themeValues = ['light', 'dark', 'green', 'blue', 'pink', 'plain'] as const;

const importEntrySchema = z.object({
  id: z.string().optional(),
  title: z.string().optional(),
  content: z.string().optional(),
  contentHtml: z.string().optional(),
  plainText: z.string().optional(),
  mood: z.string().optional(),
  tags: z.array(z.string()).optional(),
  categoryId: z.string().nullable().optional(),
  wordCount: z.number().optional(),
  isLocked: z.boolean().optional(),
  isDeleted: z.boolean().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  dateFor: z.string().optional(),
  timeFor: z.string().optional(),
  weather: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
}).passthrough();

const importSchema = z.object({
  entries: z.array(importEntrySchema),
  config: z.object({
    theme: z.enum(themeValues).optional(),
    fontSize: z.enum(['sm', 'md', 'lg', 'xl']).optional(),
    autoSaveInterval: z.number().int().optional(),
    categories: z.array(z.string()).optional(),
  }).optional(),
}).passthrough();

export async function registerImportExportRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/export/json', async (request) => {
    const userId = request.userId!;
    const { startDate, endDate } = (request.query as { startDate?: string; endDate?: string }) || {};
    const entries = getAllEntries(app, userId, startDate, endDate);
    const categories = getAllCategories(app, userId);
    const settings = app.db.prepare(`
      SELECT theme, font_size, auto_save_interval
      FROM settings
      WHERE user_id = ?
    `).get(userId) as { theme: string; font_size: string; auto_save_interval: number } | undefined;

    const configTheme = settings?.theme ?? 'light';
    const configFontSize = settings?.font_size ?? 'md';
    const configAutoSave = settings?.auto_save_interval ?? 30;

    return {
      entries,
      categories,
      config: {
        theme: configTheme,
        fontSize: configFontSize,
        autoSaveInterval: configAutoSave,
        categories: categories.map(category => category.name),
      },
      exportedAt: nowIso(),
    };
  });

  app.get('/api/v1/export/markdown', async (request, reply) => {
    const userId = request.userId!;
    const { startDate, endDate } = (request.query as { startDate?: string; endDate?: string }) || {};
    const entries = getAllEntries(app, userId, startDate, endDate);
    const lines: string[] = [];
    for (const entry of entries) {
      lines.push(`# ${entry.title || '无标题'}`);
      lines.push('');
      lines.push(`> 日期：${entry.dateFor}  情绪：${entry.mood}  分类：${entry.tags.join(', ') || '无'}`);
      lines.push('');
      lines.push(entry.plainText);
      lines.push('');
      lines.push('---');
      lines.push('');
    }

    return reply
      .header('content-type', 'text/markdown; charset=utf-8')
      .header('content-disposition', `attachment; filename="diary-export-${toLocalDateString(new Date())}.md"`)
      .send(lines.join('\n'));
  });

  app.post('/api/v1/import/json', async (request) => {
    const body = importSchema.parse(request.body);
    const userId = request.userId!;
    const now = nowIso();
    let count = 0;

    app.db.exec('BEGIN');
    try {
      if (body.config?.categories) {
        const insertCategory = app.db.prepare(`
          INSERT OR IGNORE INTO categories (id, user_id, name, sort_order, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        body.config.categories
          .map(name => name.trim())
          .filter(Boolean)
          .forEach((name, index) => {
            insertCategory.run(`cat_${userId}_${slug(name)}`, userId, name, index, now, now);
          });
      }

      if (body.config?.theme || body.config?.fontSize || body.config?.autoSaveInterval) {
        const current = app.db.prepare('SELECT theme, font_size, auto_save_interval FROM settings WHERE user_id = ?')
          .get(userId) as { theme: string; font_size: string; auto_save_interval: number } | undefined;
        
        const currentTheme = current?.theme ?? 'light';
        const currentFontSize = current?.font_size ?? 'md';
        const currentAutoSave = current?.auto_save_interval ?? 30;

        app.db.prepare(`
          UPDATE settings
          SET theme = ?, font_size = ?, auto_save_interval = ?, updated_at = ?
          WHERE user_id = ?
        `).run(
          body.config.theme ?? currentTheme,
          body.config.fontSize ?? currentFontSize,
          body.config.autoSaveInterval ?? currentAutoSave,
          now,
          userId,
        );
      }

      for (const raw of body.entries) {
        const tags = raw.tags?.map(tag => tag.trim()).filter(Boolean) ?? [];
        for (const tag of tags) {
          ensureCategory(app, tag, userId);
        }

        const payload: EntryPayload = {
          ...raw,
          mood: isKnownMood(raw.mood) ? raw.mood : 'none',
          categoryId: raw.categoryId ?? (tags[0] ? getCategoryIdByName(app.db, tags[0], userId) : null),
          dateFor: raw.dateFor && /^\d{4}-\d{2}-\d{2}$/.test(raw.dateFor) ? raw.dateFor : toLocalDateString(new Date()),
          timeFor: raw.timeFor && /^\d{2}:\d{2}$/.test(raw.timeFor) ? raw.timeFor : null,
        };
        const normalized = normalizeEntryPayload(
          app.db,
          payload,
          raw.id ? { id: raw.id, created_at: raw.createdAt ?? now } : undefined,
          userId,
        );
        upsertEntry(app.db, normalized);
        count++;
      }

      app.db.exec('COMMIT');
    } catch (error) {
      app.db.exec('ROLLBACK');
      throw error;
    }

    return { count };
  });
}

function getAllEntries(app: FastifyInstance, userId: string, startDate?: string, endDate?: string) {
  let query = `
    SELECT e.*, c.name AS category_name
    FROM entries e
    LEFT JOIN categories c ON c.id = e.category_id
    WHERE e.user_id = ? AND e.is_deleted = 0
  `;
  const params: any[] = [userId];

  if (startDate) {
    query += ' AND e.date_for >= ?';
    params.push(startDate);
  }
  if (endDate) {
    query += ' AND e.date_for <= ?';
    params.push(endDate);
  }

  query += ' ORDER BY e.date_for DESC, e.time_for DESC, e.updated_at DESC';

  const rows = app.db.prepare(query).all(...params) as unknown as EntryRow[];
  return rows.map(rowToEntry);
}

function getAllCategories(app: FastifyInstance, userId: string) {
  return app.db.prepare(`
    SELECT id, name, sort_order AS sortOrder, created_at AS createdAt, updated_at AS updatedAt
    FROM categories
    WHERE user_id = ?
    ORDER BY sort_order ASC, name ASC
  `).all(userId) as Array<{ id: string; name: string; sortOrder: number; createdAt: string; updatedAt: string }>;
}

function ensureCategory(app: FastifyInstance, name: string, userId: string): void {
  if (getCategoryIdByName(app.db, name, userId)) return;
  const now = nowIso();
  app.db.prepare(`
    INSERT OR IGNORE INTO categories (id, user_id, name, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, (SELECT COUNT(*) FROM categories WHERE user_id = ?), ?, ?)
  `).run(`cat_${userId}_${slug(name)}`, userId, name, userId, now, now);
}

function slug(value: string): string {
  return Buffer.from(value).toString('base64url').slice(0, 32);
}

function isKnownMood(value: unknown): value is EntryPayload['mood'] {
  return typeof value === 'string'
    && ['happy', 'calm', 'sad', 'angry', 'anxious', 'excited', 'tired', 'grateful', 'none'].includes(value);
}
