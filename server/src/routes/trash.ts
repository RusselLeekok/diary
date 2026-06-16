import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { extractFirstImageSrc, rowToEntry, selectEntryById } from '../repositories.js';
import { nowIso } from '../shared/date.js';

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

interface TrashSummaryRow {
  id: string;
  title: string;
  plain_text: string;
  mood: string;
  category_name: string | null;
  word_count: number;
  is_locked: 0 | 1;
  is_deleted: 0 | 1;
  date_for: string;
  time_for: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  weather: string | null;
  location: string | null;
  has_image: 0 | 1;
}

function rowToTrashSummary(row: TrashSummaryRow) {
  return {
    id: row.id,
    title: row.title,
    plainText: row.plain_text.slice(0, 240),
    mood: row.mood,
    tags: row.category_name ? [row.category_name] : [],
    wordCount: row.word_count,
    isLocked: Boolean(row.is_locked),
    isDeleted: Boolean(row.is_deleted),
    dateFor: row.date_for,
    timeFor: row.time_for ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? undefined,
    weather: row.weather ?? undefined,
    location: row.location ?? undefined,
    firstImageSrc: row.has_image
      ? `/api/v1/trash/entries/${encodeURIComponent(row.id)}/first-image`
      : '',
  };
}

export async function registerTrashRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/trash/entries', async (request) => {
    const userId = request.userId!;
    const rows = app.db.prepare(`
      SELECT
        e.id,
        e.title,
        e.plain_text,
        e.mood,
        e.word_count,
        e.is_locked,
        e.is_deleted,
        e.date_for,
        e.time_for,
        e.created_at,
        e.updated_at,
        e.deleted_at,
        e.weather,
        e.location,
        INSTR(e.content_html, '<img') > 0 AS has_image,
        c.name AS category_name
      FROM entries e
      LEFT JOIN categories c ON c.id = e.category_id
      WHERE e.user_id = ? AND e.is_deleted = 1
      ORDER BY e.deleted_at DESC, e.updated_at DESC
    `).all(userId) as unknown as TrashSummaryRow[];

    return { entries: rows.map(rowToTrashSummary) };
  });

  app.get('/api/v1/trash/entries/:id/first-image', async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    const userId = request.userId!;
    const row = selectEntryById(app.db, id, userId);
    if (!row || !row.is_deleted) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Trash entry not found' });
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

  app.post('/api/v1/trash/entries/:id/restore', async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    const userId = request.userId!;
    const existing = selectEntryById(app.db, id, userId);
    if (!existing || !existing.is_deleted) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: '回收站中不存在该日记' });
    }

    app.db.prepare(`
      UPDATE entries
      SET is_deleted = 0, deleted_at = NULL, updated_at = ?, server_version = server_version + 1
      WHERE user_id = ? AND id = ?
    `).run(nowIso(), userId, id);

    const row = selectEntryById(app.db, id, userId);
    return { entry: row ? rowToEntry(row) : null };
  });

  app.delete('/api/v1/trash/entries/:id', async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    const userId = request.userId!;
    const existing = selectEntryById(app.db, id, userId);
    if (!existing || !existing.is_deleted) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: '回收站中不存在该日记' });
    }

    app.db.prepare('DELETE FROM entries WHERE user_id = ? AND id = ? AND is_deleted = 1')
      .run(userId, id);
    return reply.status(204).send();
  });

  app.delete('/api/v1/trash/entries', async (request, reply) => {
    const userId = request.userId!;
    const result = app.db.prepare('DELETE FROM entries WHERE user_id = ? AND is_deleted = 1')
      .run(userId);
    return reply.send({ deleted: result.changes });
  });
}
