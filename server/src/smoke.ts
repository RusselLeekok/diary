import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dbPath = path.join(os.tmpdir(), `diary-api-smoke-${Date.now()}.sqlite`);
process.env.DIARY_DB_PATH = dbPath;

const { buildApp } = await import('./app.js');
const app = await buildApp();

try {
  type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  type JsonPayload = Record<string, unknown>;

  const request = async (method: Method, url: string, payload?: JsonPayload) => {
    const response = await app.inject({ method, url, payload });
    const body = response.body ? JSON.parse(response.body) as any : {};
    if (response.statusCode >= 400) {
      throw new Error(`${method} ${url} failed: ${response.statusCode} ${response.body}`);
    }
    return { response, body };
  };

  const health = await request('GET', '/api/v1/health');
  assert(health.body.ok === true, 'health check failed');

  const categories = await request('GET', '/api/v1/categories');
  assert(categories.body.categories.length >= 4, 'default categories missing');
  const categoryId = categories.body.categories[0].id;

  const created = await request('POST', '/api/v1/entries', {
    title: '后端冒烟测试',
    contentHtml: '<p>今天开始做后端。</p><script>alert(1)</script>',
    mood: 'calm',
    categoryId,
    dateFor: '2026-06-12',
    timeFor: '16:30',
  });
  const entry = created.body.entry;
  assert(entry.title === '后端冒烟测试', 'entry title mismatch');
  assert(!entry.contentHtml.includes('script'), 'content was not sanitized');
  assert(entry.wordCount > 0, 'word count missing');

  const list = await request('GET', '/api/v1/entries');
  assert(list.body.entries.length === 1, 'list did not return created entry');

  const stats = await request('GET', '/api/v1/stats/overview');
  assert(stats.body.total === 1, 'stats total mismatch');

  await request('DELETE', `/api/v1/entries/${entry.id}`);
  const trash = await request('GET', '/api/v1/trash/entries');
  assert(trash.body.entries.length === 1, 'trash did not include deleted entry');

  const restored = await request('POST', `/api/v1/trash/entries/${entry.id}/restore`);
  assert(restored.body.entry.isDeleted === false, 'entry was not restored');

  const settings = await request('PATCH', '/api/v1/settings', { theme: 'dark', fontSize: 'lg' });
  assert(settings.body.theme === 'dark' && settings.body.fontSize === 'lg', 'settings update failed');

  console.log('server smoke passed');
} finally {
  await app.close();
  removeIfExists(dbPath);
  removeIfExists(`${dbPath}-shm`);
  removeIfExists(`${dbPath}-wal`);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function removeIfExists(filePath: string): void {
  try {
    fs.rmSync(filePath, { force: true });
  } catch {
    // best effort cleanup
  }
}
