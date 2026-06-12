import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getUserId } from '../repositories.js';
import { nowIso } from '../shared/date.js';

const categoryBodySchema = z.object({
  name: z.string().trim().min(1).max(32),
  sortOrder: z.number().int().min(0).optional(),
});

const idParamsSchema = z.object({ id: z.string().min(1) });

function listCategories(app: FastifyInstance) {
  const rows = app.db.prepare(`
    SELECT
      c.id,
      c.name,
      c.sort_order,
      c.created_at,
      c.updated_at,
      COUNT(e.id) AS entry_count
    FROM categories c
    LEFT JOIN entries e ON e.category_id = c.id AND e.is_deleted = 0
    WHERE c.user_id = ?
    GROUP BY c.id
    ORDER BY c.sort_order ASC, c.name ASC
  `).all(getUserId()) as Array<{
    id: string;
    name: string;
    sort_order: number;
    created_at: string;
    updated_at: string;
    entry_count: number;
  }>;

  return rows.map(row => ({
    id: row.id,
    name: row.name,
    sortOrder: row.sort_order,
    entryCount: row.entry_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function registerCategoryRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/categories', async () => ({ categories: listCategories(app) }));

  app.post('/api/v1/categories', async (request, reply) => {
    const body = categoryBodySchema.parse(request.body);
    const exists = app.db.prepare('SELECT id FROM categories WHERE user_id = ? AND name = ?')
      .get(getUserId(), body.name);
    if (exists) {
      return reply.status(409).send({ error: 'CATEGORY_EXISTS', message: '分类已存在' });
    }

    const now = nowIso();
    const id = randomUUID();
    const sortOrder = body.sortOrder ?? listCategories(app).length;
    app.db.prepare(`
      INSERT INTO categories (id, user_id, name, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, getUserId(), body.name, sortOrder, now, now);

    return reply.status(201).send({ category: listCategories(app).find(category => category.id === id) });
  });

  app.put('/api/v1/categories/:id', async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    const body = categoryBodySchema.parse(request.body);
    const current = app.db.prepare('SELECT id FROM categories WHERE user_id = ? AND id = ?')
      .get(getUserId(), id);
    if (!current) return reply.status(404).send({ error: 'NOT_FOUND', message: '分类不存在' });

    const duplicate = app.db.prepare('SELECT id FROM categories WHERE user_id = ? AND name = ? AND id <> ?')
      .get(getUserId(), body.name, id);
    if (duplicate) {
      return reply.status(409).send({ error: 'CATEGORY_EXISTS', message: '分类已存在' });
    }

    app.db.prepare(`
      UPDATE categories
      SET name = ?, sort_order = COALESCE(?, sort_order), updated_at = ?
      WHERE user_id = ? AND id = ?
    `).run(body.name, body.sortOrder ?? null, nowIso(), getUserId(), id);

    return { category: listCategories(app).find(category => category.id === id) };
  });

  app.delete('/api/v1/categories/:id', async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    const current = app.db.prepare('SELECT id FROM categories WHERE user_id = ? AND id = ?')
      .get(getUserId(), id);
    if (!current) return reply.status(404).send({ error: 'NOT_FOUND', message: '分类不存在' });

    app.db.exec('BEGIN');
    try {
      app.db.prepare('UPDATE entries SET category_id = NULL, updated_at = ? WHERE user_id = ? AND category_id = ?')
        .run(nowIso(), getUserId(), id);
      app.db.prepare('DELETE FROM categories WHERE user_id = ? AND id = ?').run(getUserId(), id);
      app.db.exec('COMMIT');
    } catch (error) {
      app.db.exec('ROLLBACK');
      throw error;
    }

    return reply.status(204).send();
  });
}
