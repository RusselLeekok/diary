import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { openDatabase, type Database } from './db.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerSettingsRoutes } from './routes/settings.js';
import { registerCategoryRoutes } from './routes/categories.js';
import { registerEntryRoutes } from './routes/entries.js';
import { registerTrashRoutes } from './routes/trash.js';
import { registerStatsRoutes } from './routes/stats.js';
import { registerImportExportRoutes } from './routes/importExport.js';

export interface BuildAppOptions {
  db?: Database;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });
  const db = options.db ?? openDatabase();
  app.decorate('db', db);

  app.addHook('onRequest', async (request, reply) => {
    reply.header('Access-Control-Allow-Origin', request.headers.origin ?? '*');
    reply.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    reply.header('Access-Control-Allow-Headers', 'Content-Type');
    reply.header('Access-Control-Allow-Credentials', 'true');
    if (request.method === 'OPTIONS') {
      return reply.status(204).send();
    }
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: 'VALIDATION_ERROR',
        message: '请求参数无效',
        issues: error.issues,
      });
    }

    app.log.error(error);
    return reply.status(500).send({
      error: 'INTERNAL_SERVER_ERROR',
      message: '服务端处理失败',
    });
  });

  await registerHealthRoutes(app);
  await registerSettingsRoutes(app);
  await registerCategoryRoutes(app);
  await registerEntryRoutes(app);
  await registerTrashRoutes(app);
  await registerStatsRoutes(app);
  await registerImportExportRoutes(app);

  return app;
}
