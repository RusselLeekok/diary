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
  let token = '';

  const request = async (method: Method, url: string, payload?: JsonPayload) => {
    const headers: Record<string, string> = {};
    if (token) {
      headers.authorization = `Bearer ${token}`;
    }
    const response = await app.inject({ method, url, payload, headers });
    const body = response.body ? JSON.parse(response.body) as any : {};
    if (response.statusCode >= 400) {
      throw new Error(`${method} ${url} failed: ${response.statusCode} ${response.body}`);
    }
    return { response, body };
  };

  const health = await request('GET', '/api/v1/health');
  assert(health.body.ok === true, 'health check failed');

  // 注册测试用户
  const registerRes = await request('POST', '/api/v1/auth/register', {
    username: 'smoketestuser',
    password: 'password123',
    displayName: 'Smoke Tester',
  });
  assert(registerRes.body.success === true, 'registration failed');

  // 登录获取 Token
  const loginRes = await request('POST', '/api/v1/auth/login', {
    username: 'smoketestuser',
    password: 'password123',
  });
  assert(!!loginRes.body.token, 'login failed');
  token = loginRes.body.token;

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

  const syncCreatePayload = {
    deviceId: 'smoke-device-a',
    sinceCursor: '0',
    mutations: [{
      mutationId: 'smoke-mut-create-entry',
      entityType: 'entry',
      entityId: 'smoke-sync-entry',
      op: 'create',
      baseVersion: 0,
      clientUpdatedAt: new Date().toISOString(),
      payload: {
        id: 'smoke-sync-entry',
        title: '同步创建测试',
        contentHtml: '<p>来自设备 A。</p>',
        mood: 'happy',
        tags: [],
        dateFor: '2026-06-13',
        timeFor: '09:00',
        isLocked: false,
      },
    }],
  };

  const syncCreate = await request('POST', '/api/v1/sync', syncCreatePayload);
  assert(syncCreate.body.applied.length === 1, 'sync create was not applied');
  assert(syncCreate.body.applied[0].serverVersion === 1, 'sync create version mismatch');

  const syncCreateAgain = await request('POST', '/api/v1/sync', syncCreatePayload);
  assert(syncCreateAgain.body.applied.length === 1, 'sync idempotency did not return applied mutation');

  const deviceBPull = await request('POST', '/api/v1/sync', {
    deviceId: 'smoke-device-b',
    sinceCursor: '0',
    mutations: [],
  });
  assert(
    deviceBPull.body.changes.entries.some((item: any) => item.id === 'smoke-sync-entry'),
    'device B did not pull synced entry',
  );

  const staleUpdate = await request('POST', '/api/v1/sync', {
    deviceId: 'smoke-device-b',
    sinceCursor: deviceBPull.body.cursor,
    mutations: [{
      mutationId: 'smoke-mut-stale-update',
      entityType: 'entry',
      entityId: 'smoke-sync-entry',
      op: 'update',
      baseVersion: 0,
      clientUpdatedAt: new Date().toISOString(),
      payload: {
        id: 'smoke-sync-entry',
        title: '过期更新',
        contentHtml: '<p>这个更新应该冲突。</p>',
        mood: 'sad',
        tags: [],
        dateFor: '2026-06-13',
        isLocked: false,
      },
    }],
  });
  assert(staleUpdate.body.conflicts.length === 1, 'stale sync update did not return conflict');

  const beforeDeleteCursor = deviceBPull.body.cursor;
  const syncDelete = await request('POST', '/api/v1/sync', {
    deviceId: 'smoke-device-a',
    sinceCursor: beforeDeleteCursor,
    mutations: [{
      mutationId: 'smoke-mut-delete-entry',
      entityType: 'entry',
      entityId: 'smoke-sync-entry',
      op: 'delete',
      baseVersion: 1,
      clientUpdatedAt: new Date().toISOString(),
      payload: { id: 'smoke-sync-entry' },
    }],
  });
  assert(syncDelete.body.applied.length === 1, 'sync delete was not applied');

  const deviceBPullDelete = await request('POST', '/api/v1/sync', {
    deviceId: 'smoke-device-b',
    sinceCursor: beforeDeleteCursor,
    mutations: [],
  });
  assert(
    deviceBPullDelete.body.changes.tombstones.some((item: any) => item.entityId === 'smoke-sync-entry'),
    'device B did not pull delete tombstone',
  );

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
