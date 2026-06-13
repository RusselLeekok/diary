import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  getUserId,
  moods,
  normalizeEntryPayload,
  rowToEntry,
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
  sort: z.enum(['dateFor_desc', 'updatedAt_desc']).optional(),
});

const idParamsSchema = z.object({ id: z.string().min(1) });

export async function registerEntryRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/entries', async (request) => {
    const query = listQuerySchema.parse(request.query);
    const where = ['e.user_id = ?'];
    const params: Array<string | number> = [getUserId()];

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
    params.push(limit);

    const rows = app.db.prepare(`
      SELECT e.*, c.name AS category_name
      FROM entries e
      LEFT JOIN categories c ON c.id = e.category_id
      WHERE ${where.join(' AND ')}
      ORDER BY ${orderBy}
      LIMIT ?
    `).all(...params) as unknown as EntryRow[];

    return { entries: rows.map(rowToEntry) };
  });

  app.post('/api/v1/entries', async (request, reply) => {
    const body = entryBodySchema.parse(request.body) as EntryPayload;
    const normalized = normalizeEntryPayload(app.db, body);
    upsertEntry(app.db, normalized);
    const row = selectEntryById(app.db, normalized.id);
    return reply.status(201).send({ entry: row ? rowToEntry(row) : null });
  });

  app.delete('/api/v1/entries', async (_request, reply) => {
    const result = app.db.prepare('DELETE FROM entries WHERE user_id = ?').run(getUserId());
    return reply.send({ deleted: result.changes });
  });

  app.get('/api/v1/entries/:id', async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    const row = selectEntryById(app.db, id);
    if (!row || row.is_deleted) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: '日记不存在' });
    }
    return { entry: rowToEntry(row) };
  });

  app.put('/api/v1/entries/:id', async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    const existing = selectEntryById(app.db, id);
    if (!existing) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: '日记不存在' });
    }

    const body = entryBodySchema.parse(request.body) as EntryPayload;
    const normalized = normalizeEntryPayload(app.db, body, { id, created_at: existing.created_at });
    upsertEntry(app.db, normalized);
    const row = selectEntryById(app.db, id);
    return { entry: row ? rowToEntry(row) : null };
  });

  app.delete('/api/v1/entries/:id', async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    const existing = selectEntryById(app.db, id);
    if (!existing || existing.is_deleted) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: '日记不存在' });
    }

    const now = nowIso();
    app.db.prepare(`
      UPDATE entries
      SET is_deleted = 1, deleted_at = ?, updated_at = ?
      WHERE user_id = ? AND id = ?
    `).run(now, now, getUserId(), id);
    return reply.status(204).send();
  });
}
