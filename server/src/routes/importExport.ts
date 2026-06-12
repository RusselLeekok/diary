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
  app.get('/api/v1/export/json', async () => {
    const entries = getAllEntries(app);
    const categories = getAllCategories(app);
    const settings = app.db.prepare(`
      SELECT theme, font_size, auto_save_interval
      FROM settings
      WHERE user_id = ?
    `).get(getUserId()) as { theme: string; font_size: string; auto_save_interval: number };

    return {
      entries,
      categories,
      config: {
        theme: settings.theme,
        fontSize: settings.font_size,
        autoSaveInterval: settings.auto_save_interval,
        categories: categories.map(category => category.name),
      },
      exportedAt: nowIso(),
    };
  });

  app.get('/api/v1/export/markdown', async (_request, reply) => {
    const entries = getAllEntries(app);
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
            insertCategory.run(`cat_import_${slug(name)}`, getUserId(), name, index, now, now);
          });
      }

      if (body.config?.theme || body.config?.fontSize || body.config?.autoSaveInterval) {
        const current = app.db.prepare('SELECT theme, font_size, auto_save_interval FROM settings WHERE user_id = ?')
          .get(getUserId()) as { theme: string; font_size: string; auto_save_interval: number };
        app.db.prepare(`
          UPDATE settings
          SET theme = ?, font_size = ?, auto_save_interval = ?, updated_at = ?
          WHERE user_id = ?
        `).run(
          body.config.theme ?? current.theme,
          body.config.fontSize ?? current.font_size,
          body.config.autoSaveInterval ?? current.auto_save_interval,
          now,
          getUserId(),
        );
      }

      for (const raw of body.entries) {
        const tags = raw.tags?.map(tag => tag.trim()).filter(Boolean) ?? [];
        for (const tag of tags) {
          ensureCategory(app, tag);
        }

        const payload: EntryPayload = {
          ...raw,
          mood: isKnownMood(raw.mood) ? raw.mood : 'none',
          categoryId: raw.categoryId ?? (tags[0] ? getCategoryIdByName(app.db, tags[0]) : null),
          dateFor: raw.dateFor && /^\d{4}-\d{2}-\d{2}$/.test(raw.dateFor) ? raw.dateFor : toLocalDateString(new Date()),
          timeFor: raw.timeFor && /^\d{2}:\d{2}$/.test(raw.timeFor) ? raw.timeFor : null,
        };
        const normalized = normalizeEntryPayload(
          app.db,
          payload,
          raw.id ? { id: raw.id, created_at: raw.createdAt ?? now } : undefined,
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

function getAllEntries(app: FastifyInstance) {
  const rows = app.db.prepare(`
    SELECT e.*, c.name AS category_name
    FROM entries e
    LEFT JOIN categories c ON c.id = e.category_id
    WHERE e.user_id = ? AND e.is_deleted = 0
    ORDER BY e.date_for DESC, e.time_for DESC, e.updated_at DESC
  `).all(getUserId()) as unknown as EntryRow[];
  return rows.map(rowToEntry);
}

function getAllCategories(app: FastifyInstance) {
  return app.db.prepare(`
    SELECT id, name, sort_order AS sortOrder, created_at AS createdAt, updated_at AS updatedAt
    FROM categories
    WHERE user_id = ?
    ORDER BY sort_order ASC, name ASC
  `).all(getUserId());
}

function ensureCategory(app: FastifyInstance, name: string): void {
  if (getCategoryIdByName(app.db, name)) return;
  const now = nowIso();
  app.db.prepare(`
    INSERT OR IGNORE INTO categories (id, user_id, name, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, (SELECT COUNT(*) FROM categories WHERE user_id = ?), ?, ?)
  `).run(`cat_import_${slug(name)}`, getUserId(), name, getUserId(), now, now);
}

function slug(value: string): string {
  return Buffer.from(value).toString('base64url').slice(0, 32);
}

function isKnownMood(value: unknown): value is EntryPayload['mood'] {
  return typeof value === 'string'
    && ['happy', 'calm', 'sad', 'angry', 'anxious', 'excited', 'tired', 'grateful', 'none'].includes(value);
}
