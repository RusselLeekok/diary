import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';
import { nowIso } from './shared/date.js';

export type Database = DatabaseSync;

export function openDatabase(dbPath = config.dbPath): Database {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON;');
  migrate(db);
  seedDefaultUser(db);
  return db;
}

function migrate(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE,
      display_name TEXT NOT NULL,
      password_hash TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      user_id TEXT PRIMARY KEY,
      theme TEXT NOT NULL DEFAULT 'light',
      font_size TEXT NOT NULL DEFAULT 'md',
      auto_save_interval INTEGER NOT NULL DEFAULT 30,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(user_id, name),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS entries (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      content_html TEXT NOT NULL,
      plain_text TEXT NOT NULL,
      mood TEXT NOT NULL,
      category_id TEXT,
      word_count INTEGER NOT NULL,
      is_locked INTEGER NOT NULL DEFAULT 0,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      date_for TEXT NOT NULL,
      time_for TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      weather TEXT,
      location TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_entries_user_date ON entries(user_id, is_deleted, date_for DESC, time_for DESC, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_entries_user_mood ON entries(user_id, is_deleted, mood);
    CREATE INDEX IF NOT EXISTS idx_entries_user_category ON entries(user_id, is_deleted, category_id);
  `);

  try {
    db.exec('ALTER TABLE users ADD COLUMN username TEXT;');
  } catch (e) {
    // column already exists
  }
  try {
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username);');
  } catch (e) {
    // index already exists
  }
  try {
    db.exec("UPDATE users SET username = 'local-user' WHERE username IS NULL;");
  } catch (e) {
    // handle error
  }
  try {
    db.exec('ALTER TABLE entries ADD COLUMN weather TEXT;');
  } catch (e) {
    // column already exists
  }
  try {
    db.exec('ALTER TABLE entries ADD COLUMN location TEXT;');
  } catch (e) {
    // column already exists
  }
}

function seedDefaultUser(db: Database): void {
  const now = nowIso();
  db.prepare(`
    INSERT OR IGNORE INTO users (id, username, display_name, password_hash, created_at, updated_at)
    VALUES (?, ?, ?, NULL, ?, ?)
  `).run(config.defaultUserId, 'local-user', 'Local User', now, now);

  db.prepare(`
    INSERT OR IGNORE INTO settings (user_id, theme, font_size, auto_save_interval, updated_at)
    VALUES (?, 'light', 'md', 30, ?)
  `).run(config.defaultUserId, now);

  const defaults = ['生活', '工作', '心情', '随笔'];
  const insertCategory = db.prepare(`
    INSERT OR IGNORE INTO categories (id, user_id, name, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  defaults.forEach((name, index) => {
    insertCategory.run(`cat_default_${index + 1}`, config.defaultUserId, name, index, now, now);
  });
}
