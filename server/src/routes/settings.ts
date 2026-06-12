import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getUserId } from '../repositories.js';
import { nowIso } from '../shared/date.js';

const settingsSchema = z.object({
  theme: z.enum(['light', 'dark']).optional(),
  fontSize: z.enum(['sm', 'md', 'lg', 'xl']).optional(),
  autoSaveInterval: z.number().int().min(5).max(3600).optional(),
});

function getSettings(app: FastifyInstance) {
  const row = app.db.prepare(`
    SELECT theme, font_size, auto_save_interval, updated_at
    FROM settings
    WHERE user_id = ?
  `).get(getUserId()) as { theme: string; font_size: string; auto_save_interval: number; updated_at: string };

  return {
    theme: row.theme,
    fontSize: row.font_size,
    autoSaveInterval: row.auto_save_interval,
    updatedAt: row.updated_at,
  };
}

export async function registerSettingsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/settings', async () => getSettings(app));

  app.patch('/api/v1/settings', async (request) => {
    const body = settingsSchema.parse(request.body);
    const current = getSettings(app);
    const next = {
      theme: body.theme ?? current.theme,
      fontSize: body.fontSize ?? current.fontSize,
      autoSaveInterval: body.autoSaveInterval ?? current.autoSaveInterval,
      updatedAt: nowIso(),
    };

    app.db.prepare(`
      UPDATE settings
      SET theme = ?, font_size = ?, auto_save_interval = ?, updated_at = ?
      WHERE user_id = ?
    `).run(next.theme, next.fontSize, next.autoSaveInterval, next.updatedAt, getUserId());

    return next;
  });
}
