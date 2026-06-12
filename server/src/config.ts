import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, '..');

export const config = {
  host: process.env.DIARY_API_HOST ?? '127.0.0.1',
  port: Number(process.env.DIARY_API_PORT ?? 5174),
  dbPath: process.env.DIARY_DB_PATH ?? path.join(serverRoot, '..', 'data', 'diary.sqlite'),
  defaultUserId: 'local-user',
};
