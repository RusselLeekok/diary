import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { hashPassword, verifyPassword, signToken } from '../shared/auth.js';
import { nowIso } from '../shared/date.js';

const registerSchema = z.object({
  username: z.string().trim().toLowerCase().min(2).max(30).regex(/^[a-zA-Z0-9_-]+$/),
  password: z.string().min(6).max(100),
  displayName: z.string().trim().min(1).max(50),
});

const loginSchema = z.object({
  username: z.string().trim().toLowerCase().min(1),
  password: z.string().min(1),
});

const changePasswordSchema = z.object({
  oldPassword: z.string().min(1),
  newPassword: z.string().min(6).max(100),
});

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  // 1. 注册接口
  app.post('/api/v1/auth/register', async (request, reply) => {
    const { username, password, displayName } = registerSchema.parse(request.body);

    // 检查用户名是否已存在
    const existing = app.db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
      return reply.status(409).send({ error: 'USERNAME_EXISTS', message: '用户名已被占用' });
    }

    const userId = randomUUID();
    const passwordHash = hashPassword(password);
    const now = nowIso();

    // 事务写入：创建用户、初始化默认设置和分类
    app.db.exec('BEGIN');
    try {
      // 写入用户表
      app.db.prepare(`
        INSERT INTO users (id, username, display_name, password_hash, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(userId, username, displayName, passwordHash, now, now);

      // 写入默认设置
      app.db.prepare(`
        INSERT INTO settings (user_id, theme, font_size, auto_save_interval, updated_at)
        VALUES (?, 'light', 'md', 30, ?)
      `).run(userId, now);

      // 写入默认分类
      const defaults = ['生活', '工作', '心情', '随笔'];
      const insertCategory = app.db.prepare(`
        INSERT INTO categories (id, user_id, name, sort_order, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      defaults.forEach((name, index) => {
        insertCategory.run(`cat_${userId}_${index + 1}`, userId, name, index, now, now);
      });

      app.db.exec('COMMIT');
    } catch (error) {
      app.db.exec('ROLLBACK');
      throw error;
    }

    return reply.status(201).send({ success: true, userId, username, displayName });
  });

  // 2. 登录接口
  app.post('/api/v1/auth/login', async (request, reply) => {
    const { username, password } = loginSchema.parse(request.body);

    const user = app.db.prepare('SELECT id, username, display_name, avatar, password_hash FROM users WHERE username = ?')
      .get(username) as { id: string; username: string; display_name: string; avatar: string | null; password_hash: string | null } | undefined;

    if (!user || !user.password_hash || !verifyPassword(password, user.password_hash)) {
      return reply.status(401).send({ error: 'INVALID_CREDENTIALS', message: '用户名或密码不正确' });
    }

    const token = signToken({ userId: user.id, username: user.username });

    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        avatar: user.avatar,
      },
    };
  });

  // 3. 登出接口（纯接口，告知客户端清除 Token）
  app.post('/api/v1/auth/logout', async () => {
    return { success: true };
  });

  // 4. 获取当前登录用户信息
  app.get('/api/v1/auth/me', async (request, reply) => {
    if (!request.userId) {
      return reply.status(401).send({ error: 'UNAUTHORIZED', message: '请先登录' });
    }

    const user = app.db.prepare('SELECT id, username, display_name, avatar, created_at FROM users WHERE id = ?')
      .get(request.userId) as { id: string; username: string; display_name: string; avatar: string | null; created_at: string } | undefined;

    if (!user) {
      return reply.status(404).send({ error: 'USER_NOT_FOUND', message: '用户不存在' });
    }

    return {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      avatar: user.avatar,
      createdAt: user.created_at,
    };
  });

  // 5. 修改密码
  app.post('/api/v1/auth/change-password', async (request, reply) => {
    if (!request.userId) {
      return reply.status(401).send({ error: 'UNAUTHORIZED', message: '请先登录' });
    }

    const { oldPassword, newPassword } = changePasswordSchema.parse(request.body);

    const user = app.db.prepare('SELECT password_hash FROM users WHERE id = ?')
      .get(request.userId) as { password_hash: string | null } | undefined;

    if (!user || !user.password_hash || !verifyPassword(oldPassword, user.password_hash)) {
      return reply.status(400).send({ error: 'INVALID_PASSWORD', message: '旧密码输入错误' });
    }

    const newHash = hashPassword(newPassword);
    app.db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
      .run(newHash, nowIso(), request.userId);

    return { success: true };
  });

  // 6. 修改个人资料
  app.post('/api/v1/auth/update-profile', async (request, reply) => {
    if (!request.userId) {
      return reply.status(401).send({ error: 'UNAUTHORIZED', message: '请先登录' });
    }

    const updateProfileSchema = z.object({
      username: z.string().trim().toLowerCase().min(2).max(30).regex(/^[a-zA-Z0-9_-]+$/).optional(),
      displayName: z.string().trim().min(1).max(50).optional(),
      avatar: z.string().nullable().optional(),
    });

    const { username, displayName, avatar } = updateProfileSchema.parse(request.body);

    // 如果修改了用户名，需要检查是否与其他用户冲突
    if (username) {
      const existing = app.db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, request.userId);
      if (existing) {
        return reply.status(409).send({ error: 'USERNAME_EXISTS', message: '用户名已被占用' });
      }
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (username !== undefined) {
      updates.push('username = ?');
      params.push(username);
    }
    if (displayName !== undefined) {
      updates.push('display_name = ?');
      params.push(displayName);
    }
    if (avatar !== undefined) {
      updates.push('avatar = ?');
      params.push(avatar);
    }

    if (updates.length > 0) {
      updates.push('updated_at = ?');
      params.push(nowIso());

      params.push(request.userId);

      app.db.prepare(`
        UPDATE users
        SET ${updates.join(', ')}
        WHERE id = ?
      `).run(...params);
    }

    // 获取并返回最新的用户信息
    const user = app.db.prepare('SELECT id, username, display_name, avatar FROM users WHERE id = ?').get(request.userId) as any;

    return {
      success: true,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        avatar: user.avatar,
      },
    };
  });
}
