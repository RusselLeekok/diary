import type { FastifyInstance } from 'fastify';
import { toLocalDateString } from '../shared/date.js';
import { getUserId, type EntryRow } from '../repositories.js';

interface TimelineEntry {
  key: string;
  label: string;
  count: number;
  words: number;
}

interface PeriodStats {
  total: number;
  totalWords: number;
  activeDays: number;
  avgWordsPerEntry: number;
  moodCount: Record<string, number>;
  timelineEntries: TimelineEntry[];
  weekdayEntries: Array<{ weekday: number; count: number; words: number }>;
}

export async function registerStatsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/stats/overview', async (request) => {
    const userId = request.userId!;
    const rows = app.db.prepare(`
      SELECT e.*, c.name AS category_name
      FROM entries e
      LEFT JOIN categories c ON c.id = e.category_id
      WHERE e.user_id = ? AND e.is_deleted = 0
      ORDER BY e.date_for ASC
    `).all(userId) as unknown as EntryRow[];

    const total = rows.length;
    const totalWords = rows.reduce((sum, row) => sum + row.word_count, 0);
    const moodCount: Record<string, number> = {};
    rows.forEach(row => {
      moodCount[row.mood] = (moodCount[row.mood] ?? 0) + 1;
    });

    const today = new Date();
    const currentYear = today.getFullYear();
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

    const entryYears = rows
      .map(row => Number(row.date_for.slice(0, 4)))
      .filter(year => Number.isInteger(year));
    const minYear = Math.min(currentYear - 1, currentYear, ...entryYears);
    const maxYear = Math.max(currentYear, ...entryYears);
    const years: number[] = [];
    for (let year = maxYear; year >= minYear; year--) {
      years.push(year);
    }

    const yearStats = Object.fromEntries(years.map(year => {
      const yearRows = rows.filter(row => row.date_for.startsWith(`${year}-`));
      const timelineEntries = buildYearMonthTimeline(rows, year);
      const summary = summarizeRows(yearRows, timelineEntries);

      return [String(year), {
        year,
        ...summary,
        monthlyEntries: timelineEntries.map(entry => ({
          month: Number(entry.key.slice(5, 7)),
          count: entry.count,
          words: entry.words,
        })),
      }];
    }));

    const last30Start = toLocalDateString(addDays(today, -29));
    const last180Start = toLocalDateString(addDays(today, -179));
    const todayString = toLocalDateString(today);
    const allStart = rows[0]?.date_for ?? todayString;
    const allEnd = rows.at(-1)?.date_for ?? todayString;

    const periodStats = {
      all: summarizeRows(rows, buildYearlyTimeline(rows, allStart, allEnd)),
      last30: summarizeRows(
        rows.filter(row => row.date_for >= last30Start && row.date_for <= todayString),
        buildDailyTimeline(rows, today, 30),
      ),
      last180: summarizeRows(
        rows.filter(row => row.date_for >= last180Start && row.date_for <= todayString),
        buildMonthlyTimeline(rows, last180Start, todayString),
      ),
    };

    return { total, totalWords, moodCount, dailyWords, streak, maxStreak, years, currentYear, yearStats, periodStats };
  });
}

function summarizeRows(rows: EntryRow[], timelineEntries: TimelineEntry[]): PeriodStats {
  const total = rows.length;
  const totalWords = rows.reduce((sum, row) => sum + row.word_count, 0);
  const moodCount: Record<string, number> = {};
  const weekdays = Array.from({ length: 7 }, (_, weekday) => ({ weekday, count: 0, words: 0 }));
  const activeDateSet = new Set<string>();

  rows.forEach(row => {
    moodCount[row.mood] = (moodCount[row.mood] ?? 0) + 1;
    activeDateSet.add(row.date_for);

    const weekday = new Date(`${row.date_for}T00:00:00`).getDay();
    weekdays[weekday].count += 1;
    weekdays[weekday].words += row.word_count;
  });

  return {
    total,
    totalWords,
    activeDays: activeDateSet.size,
    avgWordsPerEntry: total > 0 ? Math.round(totalWords / total) : 0,
    moodCount,
    timelineEntries,
    weekdayEntries: weekdays,
  };
}

function buildDailyTimeline(rows: EntryRow[], today: Date, days: number): TimelineEntry[] {
  return Array.from({ length: days }, (_, index) => {
    const date = toLocalDateString(addDays(today, index - days + 1));
    const dayRows = rows.filter(row => row.date_for === date);
    return {
      key: date,
      label: date.slice(5),
      count: dayRows.length,
      words: dayRows.reduce((sum, row) => sum + row.word_count, 0),
    };
  });
}

function buildMonthlyTimeline(rows: EntryRow[], startDate: string, endDate: string): TimelineEntry[] {
  const start = new Date(`${startDate.slice(0, 7)}-01T00:00:00`);
  const end = new Date(`${endDate.slice(0, 7)}-01T00:00:00`);
  const entries: TimelineEntry[] = [];
  const cursor = new Date(start);

  while (cursor <= end) {
    const year = cursor.getFullYear();
    const month = cursor.getMonth() + 1;
    const key = `${year}-${String(month).padStart(2, '0')}`;
    const monthRows = rows.filter(row => row.date_for.startsWith(key));
    entries.push({
      key,
      label: `${year}年${month}月`,
      count: monthRows.length,
      words: monthRows.reduce((sum, row) => sum + row.word_count, 0),
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return entries;
}

function buildYearlyTimeline(rows: EntryRow[], startDate: string, endDate: string): TimelineEntry[] {
  const startYear = Number(startDate.slice(0, 4));
  const endYear = Number(endDate.slice(0, 4));

  return Array.from({ length: endYear - startYear + 1 }, (_, index) => {
    const year = startYear + index;
    const yearRows = rows.filter(row => row.date_for.startsWith(`${year}-`));
    return {
      key: String(year),
      label: `${year}年`,
      count: yearRows.length,
      words: yearRows.reduce((sum, row) => sum + row.word_count, 0),
    };
  });
}

function buildYearMonthTimeline(rows: EntryRow[], year: number): TimelineEntry[] {
  return Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const key = `${year}-${String(month).padStart(2, '0')}`;
    const monthRows = rows.filter(row => row.date_for.startsWith(key));
    return {
      key,
      label: `${month}月`,
      count: monthRows.length,
      words: monthRows.reduce((sum, row) => sum + row.word_count, 0),
    };
  });
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}
