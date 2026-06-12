import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getUserId, rowToEntry, selectEntryById, type EntryRow } from '../repositories.js';
import { nowIso } from '../shared/date.js';

const idParamsSchema = z.object({ id: z.string().min(1) });

export async function registerTrashRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/trash/entries', async () => {
    const rows = app.db.prepare(`
      SELECT e.*, c.name AS category_name
      FROM entries e
      LEFT JOIN categories c ON c.id = e.category_id
      WHERE e.user_id = ? AND e.is_deleted = 1
      ORDER BY e.deleted_at DESC, e.updated_at DESC
    `).all(getUserId()) as unknown as EntryRow[];

    return { entries: rows.map(rowToEntry) };
  });

  app.post('/api/v1/trash/entries/:id/restore', async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    const existing = selectEntryById(app.db, id);
    if (!existing || !existing.is_deleted) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: '回收站中不存在该日记' });
    }

    app.db.prepare(`
      UPDATE entries
      SET is_deleted = 0, deleted_at = NULL, updated_at = ?
      WHERE user_id = ? AND id = ?
    `).run(nowIso(), getUserId(), id);

    const row = selectEntryById(app.db, id);
    return { entry: row ? rowToEntry(row) : null };
  });

  app.delete('/api/v1/trash/entries/:id', async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    const existing = selectEntryById(app.db, id);
    if (!existing || !existing.is_deleted) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: '回收站中不存在该日记' });
    }

    app.db.prepare('DELETE FROM entries WHERE user_id = ? AND id = ? AND is_deleted = 1')
      .run(getUserId(), id);
    return reply.status(204).send();
  });

  app.delete('/api/v1/trash/entries', async (request, reply) => {
    const result = app.db.prepare('DELETE FROM entries WHERE user_id = ? AND is_deleted = 1')
      .run(getUserId());
    return reply.send({ deleted: result.changes });
  });
}
