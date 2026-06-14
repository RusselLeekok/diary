import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  getUserId,
  extractFirstImageSrc,
  moods,
  normalizeEntryPayload,
  rowToEntry,
  rowToEntrySummary,
  selectEntryById,
  upsertEntry,
  type EntryPayload,
  type EntryRow,
} from '../repositories.js';
import { nowIso } from '../shared/date.js';

const entryBodySchema = z.object({
  id: z.string().optional(),
  title: z.string().max(100).optional(),
  contentHtml: z.string().optional(),
  content: z.string().optional(),
  mood: z.enum(moods).optional(),
  categoryId: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  dateFor: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  timeFor: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  isLocked: z.boolean().optional(),
  weather: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
});

const listQuerySchema = z.object({
  keyword: z.string().optional(),
  mood: z.enum(moods).optional(),
  categoryId: z.string().optional(),
  uncategorized: z.enum(['true', 'false']).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  includeDeleted: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  sort: z.enum(['dateFor_desc', 'updatedAt_desc']).optional(),
  view: z.enum(['summary', 'full']).optional(),
});

const idParamsSchema = z.object({ id: z.string().min(1) });

function parseDataImage(src: string): { mime: string; bytes: Buffer } | null {
  const match = src.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  if (!match) return null;

  const mime = match[1] || 'application/octet-stream';
  if (!mime.startsWith('image/')) return null;

  const isBase64 = Boolean(match[2]);
  const payload = match[3] || '';
  const bytes = isBase64
    ? Buffer.from(payload, 'base64')
    : Buffer.from(decodeURIComponent(payload), 'utf8');

  return { mime, bytes };
}

export async function registerEntryRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/entries', async (request) => {
    const query = listQuerySchema.parse(request.query);
    const userId = request.userId!;
    const where = ['e.user_id = ?'];
    const params: Array<string | number> = [userId];

    if (query.includeDeleted !== 'true') {
      where.push('e.is_deleted = 0');
    }
    if (query.keyword?.trim()) {
      const keyword = `%${query.keyword.trim().toLowerCase()}%`;
      where.push('(LOWER(e.title) LIKE ? OR LOWER(e.plain_text) LIKE ? OR LOWER(COALESCE(c.name, "")) LIKE ? OR LOWER(COALESCE(e.weather, "")) LIKE ? OR LOWER(COALESCE(e.location, "")) LIKE ?)');
      params.push(keyword, keyword, keyword, keyword, keyword);
    }
    if (query.mood) {
      where.push('e.mood = ?');
      params.push(query.mood);
    }
    if (query.categoryId) {
      where.push('e.category_id = ?');
      params.push(query.categoryId);
    }
    if (query.uncategorized === 'true') {
      where.push('e.category_id IS NULL');
    }
    if (query.date) {
      where.push('e.date_for = ?');
      params.push(query.date);
    }
    if (query.dateFrom) {
      where.push('e.date_for >= ?');
      params.push(query.dateFrom);
    }
    if (query.dateTo) {
      where.push('e.date_for <= ?');
      params.push(query.dateTo);
    }

    const orderBy = query.sort === 'updatedAt_desc'
      ? 'e.updated_at DESC'
      : 'e.date_for DESC, e.time_for DESC, e.updated_at DESC';
    const limit = query.limit ?? 200;
    const offset = query.offset ?? 0;
    params.push(limit + 1, offset);

    const rows = app.db.prepare(`
      SELECT e.*, c.name AS category_name
      FROM entries e
      LEFT JOIN categories c ON c.id = e.category_id
      WHERE ${where.join(' AND ')}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `).all(...params) as unknown as EntryRow[];
    const pageRows = rows.slice(0, limit);

    return {
      entries: query.view === 'summary'
        ? pageRows.map(rowToEntrySummary)
        : pageRows.map(rowToEntry),
      hasMore: rows.length > limit,
      nextOffset: offset + pageRows.length,
    };
  });

  app.post('/api/v1/entries', async (request, reply) => {
    const body = entryBodySchema.parse(request.body) as EntryPayload;
    const userId = request.userId!;
    const normalized = normalizeEntryPayload(app.db, body, undefined, userId);
    upsertEntry(app.db, normalized);
    const row = selectEntryById(app.db, normalized.id, userId);
    return reply.status(201).send({ entry: row ? rowToEntry(row) : null });
  });

  app.delete('/api/v1/entries', async (request, reply) => {
    const userId = request.userId!;
    const result = app.db.prepare('DELETE FROM entries WHERE user_id = ?').run(userId);
    return reply.send({ deleted: result.changes });
  });

  app.get('/api/v1/entries/:id/first-image', async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    const userId = request.userId!;
    const row = selectEntryById(app.db, id, userId);
    if (!row || row.is_deleted) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Entry not found' });
    }

    const src = extractFirstImageSrc(row.content_html);
    if (!src) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Entry has no image' });
    }

    if (src.startsWith('data:')) {
      const image = parseDataImage(src);
      if (!image) {
        return reply.status(415).send({ error: 'UNSUPPORTED_IMAGE', message: 'Unsupported image format' });
      }

      return reply
        .header('Content-Type', image.mime)
        .header('Cache-Control', 'private, max-age=86400')
        .send(image.bytes);
    }

    if (/^https?:\/\//i.test(src) || src.startsWith('/')) {
      return reply.redirect(src);
    }

    return reply.status(415).send({ error: 'UNSUPPORTED_IMAGE', message: 'Unsupported image source' });
  });

  app.get('/api/v1/entries/:id', async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    const userId = request.userId!;
    const row = selectEntryById(app.db, id, userId);
    if (!row || row.is_deleted) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: '日记不存在' });
    }
    return { entry: rowToEntry(row) };
  });

  app.put('/api/v1/entries/:id', async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    const userId = request.userId!;
    const existing = selectEntryById(app.db, id, userId);
    if (!existing) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: '日记不存在' });
    }

    const body = entryBodySchema.parse(request.body) as EntryPayload;
    const normalized = normalizeEntryPayload(app.db, body, { id, created_at: existing.created_at }, userId);
    upsertEntry(app.db, normalized);
    const row = selectEntryById(app.db, id, userId);
    return { entry: row ? rowToEntry(row) : null };
  });

  app.delete('/api/v1/entries/:id', async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    const userId = request.userId!;
    const existing = selectEntryById(app.db, id, userId);
    if (!existing || existing.is_deleted) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: '日记不存在' });
    }

    const now = nowIso();
    app.db.prepare(`
      UPDATE entries
      SET is_deleted = 1, deleted_at = ?, updated_at = ?
      WHERE user_id = ? AND id = ?
    `).run(now, now, userId, id);
    return reply.status(204).send();
  });
}
