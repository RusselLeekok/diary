import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  normalizeEntryPayload,
  rowToEntry,
  selectEntryById,
  type EntryPayload,
  type EntryRow,
} from '../repositories.js';
import { nowIso } from '../shared/date.js';

const mutationSchema = z.object({
  mutationId: z.string().min(1),
  entityType: z.enum(['entry', 'category', 'setting']),
  entityId: z.string().min(1),
  op: z.enum(['create', 'update', 'delete']),
  baseVersion: z.coerce.number().int().min(0).optional(),
  clientUpdatedAt: z.string().optional(),
  payload: z.unknown().optional(),
});

const syncSchema = z.object({
  deviceId: z.string().min(1),
  sinceCursor: z.string().optional(),
  mutations: z.array(mutationSchema).max(200).default([]),
});

type SyncMutation = z.infer<typeof mutationSchema>;

interface CategoryRow {
  id: string;
  user_id: string;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  server_version: number;
}

interface SettingRow {
  user_id: string;
  theme: string;
  font_size: string;
  auto_save_interval: number;
  updated_at: string;
  server_version: number;
}

function rowToCategory(row: CategoryRow) {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? undefined,
    serverVersion: row.server_version,
  };
}

function rowToSettings(row: SettingRow) {
  return [
    { key: 'theme', value: row.theme, updatedAt: row.updated_at, serverVersion: row.server_version },
    { key: 'fontSize', value: row.font_size, updatedAt: row.updated_at, serverVersion: row.server_version },
    { key: 'autoSaveInterval', value: row.auto_save_interval, updatedAt: row.updated_at, serverVersion: row.server_version },
  ];
}

export async function registerSyncRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/sync/status', async (request) => {
    const userId = request.userId!;
    const cursor = getCurrentCursor(app, userId);
    return { cursor: String(cursor), serverTime: nowIso() };
  });

  app.post('/api/v1/sync', async (request, reply) => {
    const body = syncSchema.parse(request.body);
    const userId = request.userId!;
    const sinceCursor = Number(body.sinceCursor || 0) || 0;
    const applied: Array<{ mutationId: string; entityType: string; entityId: string; serverVersion: number }> = [];
    const conflicts: Array<{
      mutationId: string;
      entityType: string;
      entityId: string;
      serverVersion: number;
      serverValue?: unknown;
    }> = [];

    const now = nowIso();
    app.db.prepare(`
      INSERT INTO devices (id, user_id, created_at, last_seen_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET last_seen_at = excluded.last_seen_at
    `).run(body.deviceId, userId, now, now);

    app.db.exec('BEGIN');
    try {
      for (const mutation of body.mutations) {
        const existingLog = app.db.prepare(`
          SELECT server_version FROM sync_log WHERE user_id = ? AND mutation_id = ?
        `).get(userId, mutation.mutationId) as { server_version: number } | undefined;
        if (existingLog) {
          applied.push({
            mutationId: mutation.mutationId,
            entityType: mutation.entityType,
            entityId: mutation.entityId,
            serverVersion: existingLog.server_version,
          });
          continue;
        }

        const result = applyMutation(app, userId, body.deviceId, mutation);
        if (result.conflict) {
          conflicts.push(result.conflict);
        } else {
          applied.push(result.applied);
        }
      }
      app.db.exec('COMMIT');
    } catch (error) {
      app.db.exec('ROLLBACK');
      throw error;
    }

    const cursor = getCurrentCursor(app, userId);
    return reply.send({
      cursor: String(cursor),
      serverTime: nowIso(),
      applied,
      conflicts,
      changes: sinceCursor <= 0
        ? getFullSnapshot(app, userId)
        : getChangesSince(app, userId, body.deviceId, sinceCursor),
    });
  });
}

function applyMutation(app: FastifyInstance, userId: string, deviceId: string, mutation: SyncMutation):
  | { applied: { mutationId: string; entityType: string; entityId: string; serverVersion: number }; conflict?: never }
  | { conflict: { mutationId: string; entityType: string; entityId: string; serverVersion: number; serverValue?: unknown }; applied?: never } {
  if (mutation.entityType === 'entry') {
    return applyEntryMutation(app, userId, deviceId, mutation);
  }
  if (mutation.entityType === 'category') {
    return applyCategoryMutation(app, userId, deviceId, mutation);
  }
  return applySettingMutation(app, userId, deviceId, mutation);
}

function applyEntryMutation(app: FastifyInstance, userId: string, deviceId: string, mutation: SyncMutation) {
  const existing = selectEntryById(app.db, mutation.entityId, userId);
  const baseVersion = mutation.baseVersion ?? 0;
  if (existing && existing.server_version > baseVersion) {
    return {
      conflict: {
        mutationId: mutation.mutationId,
        entityType: mutation.entityType,
        entityId: mutation.entityId,
        serverVersion: existing.server_version,
        serverValue: rowToEntry(existing),
      },
    };
  }

  if (mutation.op === 'delete') {
    const nextVersion = existing ? existing.server_version + 1 : 1;
    if (existing) {
      const now = nowIso();
      app.db.prepare(`
        UPDATE entries
        SET is_deleted = 1, deleted_at = ?, updated_at = ?, server_version = ?
        WHERE user_id = ? AND id = ?
      `).run(now, now, nextVersion, userId, mutation.entityId);
    }
    logChange(app, userId, deviceId, mutation, nextVersion, {
      entityType: 'entry',
      entityId: mutation.entityId,
      deletedAt: nowIso(),
      serverVersion: nextVersion,
    });
    return { applied: appliedResult(mutation, nextVersion) };
  }

  const normalized = normalizeEntryPayload(
    app.db,
    mutation.payload as EntryPayload,
    existing ? { id: existing.id, created_at: existing.created_at } : undefined,
    userId,
  );
  const nextVersion = existing ? existing.server_version + 1 : 1;
  app.db.prepare(`
    INSERT INTO entries (
      id, user_id, title, content_html, plain_text, mood, category_id, word_count,
      is_locked, is_deleted, date_for, time_for, created_at, updated_at, deleted_at,
      weather, location, server_version, client_updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      content_html = excluded.content_html,
      plain_text = excluded.plain_text,
      mood = excluded.mood,
      category_id = excluded.category_id,
      word_count = excluded.word_count,
      is_locked = excluded.is_locked,
      is_deleted = excluded.is_deleted,
      date_for = excluded.date_for,
      time_for = excluded.time_for,
      updated_at = excluded.updated_at,
      deleted_at = excluded.deleted_at,
      weather = excluded.weather,
      location = excluded.location,
      server_version = excluded.server_version,
      client_updated_at = excluded.client_updated_at
  `).run(
    normalized.id,
    normalized.userId,
    normalized.title,
    normalized.contentHtml,
    normalized.plainText,
    normalized.mood,
    normalized.categoryId,
    normalized.wordCount,
    normalized.isLocked,
    normalized.isDeleted,
    normalized.dateFor,
    normalized.timeFor,
    normalized.createdAt,
    normalized.updatedAt,
    normalized.deletedAt,
    normalized.weather,
    normalized.location,
    nextVersion,
    mutation.clientUpdatedAt ?? normalized.updatedAt,
  );

  const row = selectEntryById(app.db, normalized.id, userId)!;
  logChange(app, userId, deviceId, mutation, nextVersion, rowToEntry(row));
  return { applied: appliedResult(mutation, nextVersion) };
}

function applyCategoryMutation(app: FastifyInstance, userId: string, deviceId: string, mutation: SyncMutation) {
  const payload = (mutation.payload ?? {}) as Partial<{ id: string; name: string; sortOrder: number; createdAt: string; updatedAt: string }>;
  const existing = selectCategory(app, userId, mutation.entityId);
  const duplicate = payload.name
    ? app.db.prepare('SELECT * FROM categories WHERE user_id = ? AND name = ? AND deleted_at IS NULL AND id <> ?')
      .get(userId, payload.name, mutation.entityId) as CategoryRow | undefined
    : undefined;
  const current = existing ?? duplicate;
  const baseVersion = mutation.baseVersion ?? 0;
  if (current && current.server_version > baseVersion) {
    return {
      conflict: {
        mutationId: mutation.mutationId,
        entityType: mutation.entityType,
        entityId: mutation.entityId,
        serverVersion: current.server_version,
        serverValue: rowToCategory(current),
      },
    };
  }

  const now = nowIso();
  if (mutation.op === 'delete') {
    const nextVersion = existing ? existing.server_version + 1 : 1;
    if (existing) {
      app.db.prepare('UPDATE entries SET category_id = NULL, updated_at = ?, server_version = server_version + 1 WHERE user_id = ? AND category_id = ?')
        .run(now, userId, existing.id);
      app.db.prepare('UPDATE categories SET deleted_at = ?, updated_at = ?, server_version = ? WHERE user_id = ? AND id = ?')
        .run(now, now, nextVersion, userId, existing.id);
    }
    logChange(app, userId, deviceId, mutation, nextVersion, {
      entityType: 'category',
      entityId: mutation.entityId,
      deletedAt: now,
      serverVersion: nextVersion,
    });
    return { applied: appliedResult(mutation, nextVersion) };
  }

  const id = current?.id ?? mutation.entityId;
  const nextVersion = current ? current.server_version + 1 : 1;
  const category = {
    id,
    name: (payload.name || current?.name || '未命名').trim().slice(0, 32),
    sortOrder: payload.sortOrder ?? current?.sort_order ?? 0,
    createdAt: current?.created_at ?? payload.createdAt ?? now,
    updatedAt: now,
  };
  app.db.prepare(`
    INSERT INTO categories (id, user_id, name, sort_order, created_at, updated_at, deleted_at, server_version, client_updated_at)
    VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      sort_order = excluded.sort_order,
      updated_at = excluded.updated_at,
      deleted_at = NULL,
      server_version = excluded.server_version,
      client_updated_at = excluded.client_updated_at
  `).run(id, userId, category.name, category.sortOrder, category.createdAt, category.updatedAt, nextVersion, mutation.clientUpdatedAt ?? now);

  const row = selectCategory(app, userId, id)!;
  logChange(app, userId, deviceId, mutation, nextVersion, rowToCategory(row));
  return { applied: { ...appliedResult(mutation, nextVersion), entityId: id } };
}

function applySettingMutation(app: FastifyInstance, userId: string, deviceId: string, mutation: SyncMutation) {
  const payload = (mutation.payload ?? {}) as { key?: string; value?: unknown };
  const current = selectSettings(app, userId);
  const now = nowIso();
  const next = {
    theme: current?.theme ?? 'light',
    fontSize: current?.font_size ?? 'md',
    autoSaveInterval: current?.auto_save_interval ?? 30,
    serverVersion: (current?.server_version ?? 0) + 1,
  };

  if (payload.key === 'theme' && typeof payload.value === 'string') next.theme = payload.value;
  if (payload.key === 'fontSize' && typeof payload.value === 'string') next.fontSize = payload.value;
  if (payload.key === 'autoSaveInterval' && typeof payload.value === 'number') next.autoSaveInterval = payload.value;

  app.db.prepare(`
    INSERT INTO settings (user_id, theme, font_size, auto_save_interval, updated_at, server_version, client_updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      theme = excluded.theme,
      font_size = excluded.font_size,
      auto_save_interval = excluded.auto_save_interval,
      updated_at = excluded.updated_at,
      server_version = excluded.server_version,
      client_updated_at = excluded.client_updated_at
  `).run(userId, next.theme, next.fontSize, next.autoSaveInterval, now, next.serverVersion, mutation.clientUpdatedAt ?? now);

  const row = selectSettings(app, userId)!;
  const serverValue = rowToSettings(row).find(setting => setting.key === payload.key) ?? rowToSettings(row)[0];
  logChange(app, userId, deviceId, mutation, next.serverVersion, serverValue);
  return { applied: appliedResult(mutation, next.serverVersion) };
}

function getFullSnapshot(app: FastifyInstance, userId: string) {
  const entries = app.db.prepare(`
    SELECT e.*, c.name AS category_name
    FROM entries e
    LEFT JOIN categories c ON c.id = e.category_id
    WHERE e.user_id = ?
  `).all(userId) as unknown as EntryRow[];
  const categories = app.db.prepare('SELECT * FROM categories WHERE user_id = ? AND deleted_at IS NULL')
    .all(userId) as unknown as CategoryRow[];
  const settings = selectSettings(app, userId);

  return {
    entries: entries.filter(row => !row.is_deleted).map(rowToEntry),
    categories: categories.map(rowToCategory),
    settings: settings ? rowToSettings(settings) : [],
    tombstones: entries.filter(row => row.is_deleted).map(row => ({
      entityType: 'entry',
      entityId: row.id,
      deletedAt: row.deleted_at ?? row.updated_at,
      serverVersion: row.server_version,
    })),
  };
}

function getChangesSince(app: FastifyInstance, userId: string, deviceId: string, sinceCursor: number) {
  const logs = app.db.prepare(`
    SELECT entity_type, op, payload_json
    FROM sync_log
    WHERE user_id = ? AND id > ? AND device_id <> ?
    ORDER BY id ASC
  `).all(userId, sinceCursor, deviceId) as Array<{ entity_type: string; op: string; payload_json: string | null }>;

  const entries: unknown[] = [];
  const categories: unknown[] = [];
  const settings: unknown[] = [];
  const tombstones: unknown[] = [];
  for (const log of logs) {
    const payload = log.payload_json ? JSON.parse(log.payload_json) : null;
    if (log.op === 'delete') {
      tombstones.push(payload);
    } else if (log.entity_type === 'entry') {
      entries.push(payload);
    } else if (log.entity_type === 'category') {
      categories.push(payload);
    } else if (log.entity_type === 'setting') {
      settings.push(payload);
    }
  }

  return { entries, categories, settings, tombstones };
}

function selectCategory(app: FastifyInstance, userId: string, id: string): CategoryRow | undefined {
  return app.db.prepare('SELECT * FROM categories WHERE user_id = ? AND id = ?')
    .get(userId, id) as CategoryRow | undefined;
}

function selectSettings(app: FastifyInstance, userId: string): SettingRow | undefined {
  return app.db.prepare('SELECT * FROM settings WHERE user_id = ?')
    .get(userId) as SettingRow | undefined;
}

function getCurrentCursor(app: FastifyInstance, userId: string): number {
  const row = app.db.prepare('SELECT COALESCE(MAX(id), 0) AS cursor FROM sync_log WHERE user_id = ?')
    .get(userId) as { cursor: number } | undefined;
  return row?.cursor ?? 0;
}

function logChange(
  app: FastifyInstance,
  userId: string,
  deviceId: string,
  mutation: SyncMutation,
  serverVersion: number,
  payload: unknown,
): void {
  app.db.prepare(`
    INSERT INTO sync_log (
      mutation_id, user_id, device_id, entity_type, entity_id, op,
      server_version, payload_json, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    mutation.mutationId,
    userId,
    deviceId,
    mutation.entityType,
    mutation.entityId,
    mutation.op,
    serverVersion,
    JSON.stringify(payload),
    nowIso(),
  );
}

function appliedResult(mutation: SyncMutation, serverVersion: number) {
  return {
    mutationId: mutation.mutationId,
    entityType: mutation.entityType,
    entityId: mutation.entityId,
    serverVersion,
  };
}
