import type { Database } from './db.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: Database;
  }
}
