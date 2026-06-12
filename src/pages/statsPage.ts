import { getStats } from '../services/databaseService';
import { MOOD_CONFIG } from '../types';
import type { MoodType } from '../types';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

let chartInstances: Chart[] = [];

/** 销毁所有图表（防止重复渲染时报错） */
function destroyCharts(): void {
  chartInstances.forEach(c => c.destroy());
  chartInstances = [];
}

/** 统计面板页 */
export async function renderStatsPage(mainEl: HTMLElement): Promise<void> {
  destroyCharts();
  const stats = await getStats();

  mainEl.innerHTML = buildStatsHTML(stats);
  renderCharts(stats);
}

function buildStatsHTML(stats: Awaited<ReturnType<typeof getStats>>): string {
  const { total, totalWords, streak, maxStreak, moodCount } = stats;

  // 找出最多情绪
  let topMood: MoodType = 'none';
  let topMoodCount = 0;
  (Object.entries(moodCount)).forEach(([mood, count]) => {
    if (!(mood in MOOD_CONFIG)) return;
    if (count > topMoodCount) { topMoodCount = count as number; topMood = mood as MoodType; }
  });

  return `
    <div class="page-stats">
      <div class="page-header">
        <h1 class="page-title">数据统计</h1>
      </div>

      <!-- 数字统计卡片 -->
      <div class="stats-overview">
        <div class="stat-card">
          <div class="stat-icon">📚</div>
          <div class="stat-value">${total}</div>
          <div class="stat-label">总篇数</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">✍️</div>
          <div class="stat-value">${totalWords.toLocaleString()}</div>
          <div class="stat-label">总字数</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">🔥</div>
          <div class="stat-value">${streak}</div>
          <div class="stat-label">连续天数</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">🏆</div>
          <div class="stat-value">${maxStreak}</div>
          <div class="stat-label">最长连续</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">${topMood !== 'none' ? (MOOD_CONFIG as Record<string, typeof MOOD_CONFIG['none']>)[topMood].emoji : '😊'}</div>
          <div class="stat-value">${topMood !== 'none' ? (MOOD_CONFIG as Record<string, typeof MOOD_CONFIG['none']>)[topMood].label : '—'}</div>
          <div class="stat-label">最常情绪</div>
        </div>
      </div>

      <!-- 图表区域 -->
      <div class="charts-grid">
        <!-- 近30天字数趋势 -->
        <div class="chart-card chart-wide">
          <h3 class="chart-title">近 30 天写作字数</h3>
          <div class="chart-container">
            <canvas id="chart-daily-words"></canvas>
          </div>
        </div>
        <!-- 情绪分布 -->
        <div class="chart-card">
          <h3 class="chart-title">情绪分布</h3>
          <div class="chart-container chart-pie-container">
            <canvas id="chart-mood-pie"></canvas>
          </div>
        </div>
        <!-- 情绪条形图 -->
        <div class="chart-card">
          <h3 class="chart-title">情绪记录次数</h3>
          <div class="chart-container">
            <canvas id="chart-mood-bar"></canvas>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderCharts(stats: Awaited<ReturnType<typeof getStats>>): void {
  const { dailyWords, moodCount } = stats;

  // 近30天字数折线图
  const dailyCtx = (document.getElementById('chart-daily-words') as HTMLCanvasElement)?.getContext('2d');
  if (dailyCtx) {
    const chart = new Chart(dailyCtx, {
      type: 'bar',
      data: {
        labels: dailyWords.map(d => d.date.slice(5)), // MM-DD
        datasets: [{
          label: '字数',
          data: dailyWords.map(d => d.count),
          backgroundColor: 'rgba(139, 111, 71, 0.25)',
          borderColor: '#8b6f47',
          borderWidth: 2,
          borderRadius: 4,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: {
            grid: { display: false },
            ticks: { maxTicksLimit: 10, font: { size: 11 } },
          },
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(0,0,0,0.06)' },
            ticks: { font: { size: 11 } },
          },
        },
      },
    });
    chartInstances.push(chart);
  }

  // 情绪饼图
  const pieCtx = (document.getElementById('chart-mood-pie') as HTMLCanvasElement)?.getContext('2d');
  const moodEntries = Object.entries(moodCount)
    .filter(([k, v]) => k in MOOD_CONFIG && (v as number) > 0) as [MoodType, number][];
  if (pieCtx && moodEntries.length > 0) {
    const chart = new Chart(pieCtx, {
      type: 'doughnut',
      data: {
        labels: moodEntries.map(([k]) => `${MOOD_CONFIG[k].emoji} ${MOOD_CONFIG[k].label}`),
        datasets: [{
          data: moodEntries.map(([, v]) => v),
          backgroundColor: moodEntries.map(([k]) => MOOD_CONFIG[k].color + 'cc'),
          borderWidth: 2,
          borderColor: '#fff',
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { font: { size: 12 }, padding: 12 } },
        },
        cutout: '60%',
      },
    });
    chartInstances.push(chart);
  }

  // 情绪条形图
  const barCtx = (document.getElementById('chart-mood-bar') as HTMLCanvasElement)?.getContext('2d');
  if (barCtx && moodEntries.length > 0) {
    const chart = new Chart(barCtx, {
      type: 'bar',
      data: {
        labels: moodEntries.map(([k]) => MOOD_CONFIG[k].emoji + ' ' + MOOD_CONFIG[k].label),
        datasets: [{
          label: '次数',
          data: moodEntries.map(([, v]) => v),
          backgroundColor: moodEntries.map(([k]) => MOOD_CONFIG[k].color + 'bb'),
          borderRadius: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: { legend: { display: false } },
        scales: {
          x: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.06)' }, ticks: { font: { size: 11 } } },
          y: { grid: { display: false }, ticks: { font: { size: 12 } } },
        },
      },
    });
    chartInstances.push(chart);
  }
}
