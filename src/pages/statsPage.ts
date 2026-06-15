import { getStats, type StatsPeriodResponse, type StatsResponse } from '../services/databaseService';
import { MOOD_CONFIG } from '../types';
import type { MoodType } from '../types';
import { Chart, registerables, Tooltip } from 'chart.js';

Chart.register(...registerables);

// Register custom tooltip positioner to display tooltips at a stable vertical height at the top of the chart area
(Tooltip.positioners as any).fixedTop = function(this: any, elements: any[]) {
  if (!elements || !elements.length) return false;
  const chart = this.chart;
  const x = elements[0].element.x;
  const y = chart.chartArea.top + 8;
  return {
    x,
    y,
    xAlign: 'center',
    yAlign: 'top',
  };
};

// Custom plugin to draw a semi-transparent column background on hover
const hoverHighlightPlugin = {
  id: 'hoverHighlight',
  beforeDatasetsDraw(chart: any) {
    const { ctx, chartArea: { top, bottom }, scales: { x } } = chart;
    const activeElements = chart.getActiveElements();

    if (activeElements && activeElements.length > 0) {
      const activePoint = activeElements[0];
      const datasetIndex = activePoint.datasetIndex;
      const index = activePoint.index;
      
      const meta = chart.getDatasetMeta(datasetIndex);
      const element = meta.data[index];
      if (element) {
        const xPos = element.x;
        let colWidth = 36;
        if (x.ticks && x.ticks.length > 1) {
          colWidth = Math.abs(x.getPixelForTick(1) - x.getPixelForTick(0)) * 0.8;
        }
        
        ctx.save();
        ctx.fillStyle = 'rgba(156, 124, 74, 0.08)'; // Light gold-tinted semi-transparent color matching the accent
        ctx.fillRect(xPos - colWidth / 2, top, colWidth, bottom - top);
        ctx.restore();
      }
    }
  }
};

type RangeKey = 'all' | 'last30' | 'last180' | 'year';
type StatsViewState = { range: RangeKey; year: number };

let chartInstances: Chart<any, any, any>[] = [];
let cachedStats: StatsResponse | null = null;
let statsRequestPromise: Promise<StatsResponse> | null = null;

const rangeOptions: Array<{ key: RangeKey; label: string; description: string }> = [
  { key: 'all', label: '全部', description: '所有日记' },
  { key: 'last30', label: '最近30天', description: '近 30 天' },
  { key: 'last180', label: '最近半年', description: '近 180 天' },
  { key: 'year', label: '年份', description: '按年查看' },
];

const weekdayOrder = [1, 2, 3, 4, 5, 6, 0];
const weekdayLabels: Record<number, string> = {
  0: '周日',
  1: '周一',
  2: '周二',
  3: '周三',
  4: '周四',
  5: '周五',
  6: '周六',
};

function destroyCharts(): void {
  chartInstances.forEach(chart => chart.destroy());
  chartInstances = [];
}

export async function renderStatsPage(mainEl: HTMLElement): Promise<void> {
  destroyCharts();
  if (cachedStats) {
    renderStatsView(mainEl, cachedStats, { range: 'all', year: getInitialYear(cachedStats) });
  } else {
    renderStatsLoadingView(mainEl);
  }

  const stats = await loadStats();
  if (mainEl.querySelector('.page-stats')) {
    renderStatsView(mainEl, stats, { range: 'all', year: getInitialYear(stats) });
  }
}

function loadStats(): Promise<StatsResponse> {
  if (statsRequestPromise) return statsRequestPromise;

  statsRequestPromise = getStats()
    .then(stats => {
      cachedStats = stats;
      return stats;
    })
    .finally(() => {
      statsRequestPromise = null;
    });

  return statsRequestPromise;
}

function renderStatsLoadingView(mainEl: HTMLElement): void {
  mainEl.innerHTML = `
    <div class="page-stats">
      <div class="stats-hero">
        <div class="stats-title-block">
          <span class="stats-kicker">写作范围</span>
          <h1 class="page-title">数据统计</h1>
        </div>
      </div>
      <section class="stats-year-summary">
        <div class="stats-year-main">
          <span class="entry-skeleton-line entry-skeleton-line-date"></span>
          <div class="entry-skeleton-line entry-skeleton-line-title"></div>
          <div class="entry-skeleton-line entry-skeleton-line-text"></div>
        </div>
        <div class="stats-overview stats-overview-compact">
          ${Array.from({ length: 6 }, () => `
            <div class="stat-card">
              <div class="entry-skeleton-line entry-skeleton-line-title"></div>
              <div class="entry-skeleton-line entry-skeleton-line-short"></div>
            </div>
          `).join('')}
        </div>
      </section>
      <div class="charts-grid stats-charts-grid">
        ${Array.from({ length: 3 }, (_, index) => `
          <div class="chart-card ${index === 0 ? 'chart-wide' : ''}">
            <div class="chart-heading">
              <div class="entry-skeleton-line entry-skeleton-line-title"></div>
            </div>
            <div class="chart-container">
              <div class="entry-skeleton-card" aria-hidden="true"></div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderStatsView(mainEl: HTMLElement, stats: StatsResponse, state: StatsViewState): void {
  destroyCharts();
  mainEl.innerHTML = buildStatsHTML(stats, state);
  bindRangeControls(mainEl, stats, state);
  renderCharts(getActiveStats(stats, state));
}

function buildStatsHTML(stats: StatsResponse, state: StatsViewState): string {
  const activeStats = getActiveStats(stats, state);
  const activeLabel = getActiveLabel(state);
  const activeDescription = getActiveDescription(state);
  const topMood = getTopMood(activeStats.moodCount);
  const strongestPeriod = getStrongestPeriod(activeStats);
  return `
    <div class="page-stats">
      <div class="stats-hero">
        <div class="stats-title-block">
          <span class="stats-kicker">写作范围</span>
          <h1 class="page-title">数据统计</h1>
        </div>
        <div class="stats-controls">
          <div class="stats-range-tabs" role="tablist" aria-label="统计范围">
            ${rangeOptions.slice(0, 3).map(option => `
              <button
                class="stats-range-btn ${option.key === state.range ? 'active' : ''}"
                type="button"
                role="tab"
                aria-selected="${option.key === state.range}"
                data-range="${option.key}"
              >${option.label}</button>
            `).join('')}
            <div class="stats-year-dropdown-wrapper">
              <button
                id="stats-year-dropdown-btn"
                class="stats-range-btn ${state.range === 'year' ? 'active' : ''}"
                type="button"
                aria-haspopup="listbox"
                aria-expanded="false"
              >
                ${state.range === 'year' ? `${state.year} 年` : '年份'}
              </button>
              <div class="stats-year-dropdown-menu" role="listbox" id="stats-year-dropdown-menu">
                ${getYears(stats).map(year => `
                  <div
                    class="stats-year-dropdown-item ${state.range === 'year' && state.year === year ? 'selected' : ''}"
                    role="option"
                    data-year="${year}"
                  >${year} 年</div>
                `).join('')}
              </div>
            </div>
          </div>
        </div>
      </div>

      <section class="stats-year-summary">
        <div class="stats-year-main">
          <span class="stats-year-label">${activeLabel}</span>
          <div class="stats-year-count">
            <strong>${activeStats.total.toLocaleString()}</strong>
            <span>篇</span>
          </div>
          <p>${activeStats.activeDays.toLocaleString()} 个写作日，平均每篇 ${activeStats.avgWordsPerEntry.toLocaleString()} 字</p>
        </div>
        <div class="stats-overview stats-overview-compact">
          <div class="stat-card">
            <div class="stat-value">${stats.total.toLocaleString()}</div>
            <div class="stat-label">累计篇数</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${stats.totalWords.toLocaleString()}</div>
            <div class="stat-label">累计字数</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${activeStats.totalWords.toLocaleString()}</div>
            <div class="stat-label">范围字数</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${strongestPeriod}</div>
            <div class="stat-label">高产时段</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${topMood ? `${MOOD_CONFIG[topMood].emoji} ${MOOD_CONFIG[topMood].label}` : '暂无'}</div>
            <div class="stat-label">常见心情</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${stats.maxStreak.toLocaleString()}</div>
            <div class="stat-label">最长连续天数</div>
          </div>
        </div>
      </section>

      <div class="charts-grid stats-charts-grid">
        <div class="chart-card chart-wide">
          <div class="chart-heading">
            <h3 class="chart-title">篇数趋势</h3>
            <span class="chart-meta">${activeDescription}</span>
          </div>
          <div class="chart-container chart-year-container">
            <canvas id="chart-entry-trend"></canvas>
          </div>
        </div>
        <div class="chart-card">
          <div class="chart-heading">
            <h3 class="chart-title">星期分布</h3>
            <span class="chart-meta">按篇数统计</span>
          </div>
          <div class="chart-container">
            <canvas id="chart-weekday-entries"></canvas>
          </div>
        </div>
        <div class="chart-card">
          <div class="chart-heading">
            <h3 class="chart-title">心情分布</h3>
            <span class="chart-meta">${activeLabel}</span>
          </div>
          <div class="chart-container chart-pie-container">
            ${hasMoodEntries(activeStats.moodCount)
              ? '<canvas id="chart-mood-pie"></canvas>'
              : '<div class="stats-empty-note">这个范围还没有可统计的心情记录</div>'}
          </div>
        </div>
      </div>
    </div>
  `;
}

function bindRangeControls(mainEl: HTMLElement, stats: StatsResponse, state: StatsViewState): void {
  document.querySelectorAll<HTMLButtonElement>('.stats-range-btn').forEach(button => {
    const range = button.dataset.range as RangeKey | undefined;
    if (!range) return;
    button.addEventListener('click', () => {
      renderStatsView(mainEl, stats, { ...state, range });
    });
  });

  const dropdownBtn = document.getElementById('stats-year-dropdown-btn') as HTMLButtonElement | null;
  const dropdownMenu = document.getElementById('stats-year-dropdown-menu') as HTMLDivElement | null;

  dropdownBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    const isShowing = dropdownMenu?.classList.toggle('show');
    dropdownBtn.setAttribute('aria-expanded', isShowing ? 'true' : 'false');
  });

  dropdownMenu?.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const item = target.closest('.stats-year-dropdown-item') as HTMLElement | null;
    if (item) {
      const year = Number(item.dataset.year);
      renderStatsView(mainEl, stats, { range: 'year', year });
    }
  });

  // Close dropdown when clicking outside
  const closeDropdown = () => {
    if (dropdownMenu?.classList.contains('show')) {
      dropdownMenu.classList.remove('show');
      dropdownBtn?.setAttribute('aria-expanded', 'false');
    }
  };

  document.addEventListener('click', closeDropdown);
}

function renderCharts(activeStats: StatsPeriodResponse): void {
  renderTrendChart(activeStats);
  renderWeekdayChart(activeStats);
  renderMoodChart(activeStats);
}

function renderTrendChart(activeStats: StatsPeriodResponse): void {
  const trendCtx = (document.getElementById('chart-entry-trend') as HTMLCanvasElement | null)?.getContext('2d');
  if (!trendCtx) return;

  let runningTotal = 0;
  const entryCounts = activeStats.timelineEntries.map(item => item.count);
  const isDenseTrend = activeStats.timelineEntries.length > 20;
  const cumulativeCounts = entryCounts.map(count => {
    runningTotal += count;
    return runningTotal;
  });

  const chart = new Chart(trendCtx, {
    plugins: [hoverHighlightPlugin],
    data: {
      labels: activeStats.timelineEntries.map(item => item.label),
      datasets: [
        {
          type: 'bar',
          label: '篇数',
          data: entryCounts,
          yAxisID: 'y',
          backgroundColor: isDenseTrend ? 'rgba(156, 124, 74, 0.18)' : 'rgba(156, 124, 74, 0.28)',
          borderColor: '#9c7c4a',
          borderWidth: isDenseTrend ? 0 : 1,
          borderRadius: isDenseTrend ? 3 : 6,
          maxBarThickness: isDenseTrend ? 12 : 28,
          categoryPercentage: isDenseTrend ? 0.72 : 0.82,
          barPercentage: isDenseTrend ? 0.72 : 0.86,
          order: 2,
        },
        {
          type: 'line',
          label: '累计篇数',
          data: cumulativeCounts,
          yAxisID: 'y1',
          borderColor: '#7a5f33',
          backgroundColor: 'rgba(122, 95, 51, 0.08)',
          borderWidth: 2,
          pointRadius: activeStats.timelineEntries.length > 20 ? 0 : 3,
          pointHoverRadius: 5,
          tension: 0.35,
          fill: true,
          order: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: {
          position: 'top',
          align: 'end',
          labels: { boxWidth: 10, boxHeight: 10, color: getCssVar('--text-secondary') },
        },
        tooltip: {
          position: 'fixedTop',
          callbacks: { label: (context: any) => `${context.dataset.label}: ${context.parsed.y} 篇` }
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: getCssVar('--text-muted'),
            font: { size: 11 },
            maxTicksLimit: activeStats.timelineEntries.length > 14 ? 8 : 12,
          },
        },
        y: {
          beginAtZero: true,
          suggestedMax: getReadableCountMax(entryCounts),
          ticks: { precision: 0, color: getCssVar('--text-muted'), font: { size: 11 } },
          grid: { color: 'rgba(0,0,0,0.06)' },
        },
        y1: {
          beginAtZero: true,
          position: 'right',
          ticks: { precision: 0, color: getCssVar('--text-muted'), font: { size: 11 } },
          grid: { drawOnChartArea: false },
        },
      },
    } as any,
  });
  chartInstances.push(chart);
}

function renderWeekdayChart(activeStats: StatsPeriodResponse): void {
  const weekdayCtx = (document.getElementById('chart-weekday-entries') as HTMLCanvasElement | null)?.getContext('2d');
  if (!weekdayCtx) return;

  const byWeekday = Object.fromEntries(activeStats.weekdayEntries.map(item => [item.weekday, item.count]));
  const weekdayCounts = weekdayOrder.map(weekday => byWeekday[weekday] ?? 0);
  const chart = new Chart(weekdayCtx, {
    plugins: [hoverHighlightPlugin],
    type: 'bar',
    data: {
      labels: weekdayOrder.map(weekday => weekdayLabels[weekday]),
      datasets: [{
        label: '篇数',
        data: weekdayCounts,
        backgroundColor: weekdayOrder.map((_, index) => index >= 5 ? 'rgba(196, 164, 110, 0.32)' : 'rgba(156, 124, 74, 0.28)'),
        borderColor: '#9c7c4a',
        borderWidth: 1,
        borderRadius: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          position: 'fixedTop',
          callbacks: { label: (context: any) => `${context.parsed.y} 篇` }
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: getCssVar('--text-muted'), font: { size: 11 } } },
        y: {
          beginAtZero: true,
          suggestedMax: getReadableCountMax(weekdayCounts),
          ticks: { precision: 0, color: getCssVar('--text-muted'), font: { size: 11 } },
          grid: { color: 'rgba(0,0,0,0.06)' },
        },
      },
    } as any,
  });
  chartInstances.push(chart);
}

function renderMoodChart(activeStats: StatsPeriodResponse): void {
  const pieCtx = (document.getElementById('chart-mood-pie') as HTMLCanvasElement | null)?.getContext('2d');
  const moodEntries = Object.entries(activeStats.moodCount)
    .filter(([mood, count]) => mood in MOOD_CONFIG && mood !== 'none' && count > 0) as [MoodType, number][];
  if (!pieCtx || moodEntries.length === 0) return;

  const chart = new Chart(pieCtx, {
    type: 'doughnut',
    data: {
      labels: moodEntries.map(([mood]) => `${MOOD_CONFIG[mood].emoji} ${MOOD_CONFIG[mood].label}`),
      datasets: [{
        data: moodEntries.map(([, count]) => count),
        backgroundColor: moodEntries.map(([mood]) => `${MOOD_CONFIG[mood].color}cc`),
        borderWidth: 2,
        borderColor: '#fff',
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { font: { size: 12 }, padding: 12, color: getCssVar('--text-secondary') },
        },
      },
      cutout: '58%',
    },
  });
  chartInstances.push(chart);
}

function getActiveStats(stats: StatsResponse, state: StatsViewState): StatsPeriodResponse {
  if (state.range === 'year') return getYearStats(stats, state.year);

  return getPeriodStats(stats)[state.range] ?? createEmptyStats();
}

function getPeriodStats(stats: StatsResponse): Partial<Record<Exclude<RangeKey, 'year'>, StatsPeriodResponse>> {
  return stats.periodStats ?? {};
}

function getInitialYear(stats: StatsResponse): number {
  const currentYear = stats.currentYear ?? new Date().getFullYear();
  if (getYearStatsMap(stats)[String(currentYear)]) return currentYear;
  return getYears(stats)[0] ?? currentYear;
}

function getYearStats(stats: StatsResponse, year: number): StatsPeriodResponse {
  return getYearStatsMap(stats)[String(year)] ?? createEmptyStats();
}

function getYearStatsMap(stats: StatsResponse): StatsResponse['yearStats'] {
  return stats.yearStats ?? {};
}

function getYears(stats: StatsResponse): number[] {
  const currentYear = stats.currentYear ?? new Date().getFullYear();
  const years = stats.years?.length ? stats.years : [currentYear, currentYear - 1];
  return Array.from(new Set(years)).sort((a, b) => b - a);
}

function getActiveLabel(state: StatsViewState): string {
  if (state.range === 'year') return `${state.year} 年`;
  return rangeOptions.find(option => option.key === state.range)?.label ?? '全部';
}

function getActiveDescription(state: StatsViewState): string {
  if (state.range === 'year') return '按月份查看这一年的篇数';
  return rangeOptions.find(option => option.key === state.range)?.description ?? '所有日记';
}

function getStrongestPeriod(activeStats: StatsPeriodResponse): string {
  const strongest = activeStats.timelineEntries.reduce(
    (best, item) => item.count > best.count ? item : best,
    { key: '', label: '暂无', count: 0, words: 0 },
  );
  return strongest.count > 0 ? strongest.label : '暂无';
}

function getTopMood(moodCount: Record<string, number>): MoodType | null {
  let topMood: MoodType | null = null;
  let topMoodCount = 0;

  Object.entries(moodCount).forEach(([mood, count]) => {
    if (!(mood in MOOD_CONFIG) || mood === 'none') return;
    if (count > topMoodCount) {
      topMood = mood as MoodType;
      topMoodCount = count;
    }
  });

  return topMood;
}

function hasMoodEntries(moodCount: Record<string, number>): boolean {
  return Object.entries(moodCount).some(([mood, count]) => mood in MOOD_CONFIG && mood !== 'none' && count > 0);
}

function createEmptyStats(): StatsPeriodResponse {
  return {
    total: 0,
    totalWords: 0,
    activeDays: 0,
    avgWordsPerEntry: 0,
    moodCount: {},
    timelineEntries: [],
    weekdayEntries: Array.from({ length: 7 }, (_, weekday) => ({ weekday, count: 0, words: 0 })),
  };
}

function getReadableCountMax(counts: number[]): number {
  const max = Math.max(0, ...counts);
  if (max <= 1) return 5;
  if (max <= 3) return 6;
  return Math.ceil(max * 1.2);
}

function getCssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
