import type { FastifyInstance } from 'fastify';
import { toLocalDateString } from '../shared/date.js';
import { getUserId, type EntryRow } from '../repositories.js';

export async function registerStatsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/stats/overview', async () => {
    const rows = app.db.prepare(`
      SELECT e.*, c.name AS category_name
      FROM entries e
      LEFT JOIN categories c ON c.id = e.category_id
      WHERE e.user_id = ? AND e.is_deleted = 0
      ORDER BY e.date_for ASC
    `).all(getUserId()) as unknown as EntryRow[];

    const total = rows.length;
    const totalWords = rows.reduce((sum, row) => sum + row.word_count, 0);
    const moodCount: Record<string, number> = {};
    rows.forEach(row => {
      moodCount[row.mood] = (moodCount[row.mood] ?? 0) + 1;
    });

    const today = new Date();
    const dailyWords: Array<{ date: string; count: number }> = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const date = toLocalDateString(d);
      dailyWords.push({
        date,
        count: rows.filter(row => row.date_for === date).reduce((sum, row) => sum + row.word_count, 0),
      });
    }

    const dateSet = new Set(rows.map(row => row.date_for));
    let streak = 0;
    const cursor = new Date(today);
    while (dateSet.has(toLocalDateString(cursor))) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }

    let maxStreak = 0;
    let current = 0;
    const sortedDates = Array.from(dateSet).sort();
    for (let i = 0; i < sortedDates.length; i++) {
      if (i === 0) {
        current = 1;
      } else {
        const prev = new Date(`${sortedDates[i - 1]}T00:00:00`);
        const curr = new Date(`${sortedDates[i]}T00:00:00`);
        current = (curr.getTime() - prev.getTime()) / 86_400_000 === 1 ? current + 1 : 1;
      }
      maxStreak = Math.max(maxStreak, current);
    }

    return { total, totalWords, moodCount, dailyWords, streak, maxStreak };
  });
}
