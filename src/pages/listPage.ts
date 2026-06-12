import { getEntries, refreshEntries, getAllTagsList } from '../store/appStore';
import { renderDiaryCard, bindCardEvents } from '../components/diaryCard';
import { navigate } from '../router/router';
import type { DiaryEntry, MoodType } from '../types';
import { MOOD_CONFIG } from '../types';
import { buildCategoryStats } from '../utils/categoryUtils';
import { showCategoryModal } from '../components/categoryModal';
import { escapeHtml } from '../utils/htmlUtils';

// ====================================================
// 列表页状态
// ====================================================
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth();
let selectedDate: string | null = null;
let selectedCategory: string | null = null;  // null=全部, ''=未分类, 'xxx'=具体分类
let currentEntries: DiaryEntry[] = [];
let sidebarTab: 'calendar' | 'category' = 'category';

// 搜索筛选状态
let searchKeyword = '';
let searchMood: MoodType | '' = '';
let searchDateFrom = '';
let searchDateTo = '';
let searchTags: string[] = [];
let isFilterExpanded = false;

// 防抖计时器
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
function debounce(fn: () => void, delay: number) {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(fn, delay);
}

export async function renderListPage(mainEl: HTMLElement, params?: Record<string, string>): Promise<void> {
  await refreshEntries();
  currentEntries = getEntries();

  // 解析是否需要调起搜索
  const shouldSearch = params?.search === 'true';
  const initKeyword = params?.keyword || '';

  if (shouldSearch || initKeyword) {
    isFilterExpanded = true;
    searchKeyword = initKeyword;
  } else {
    // 正常进入时清除筛选状态
    searchKeyword = '';
    searchMood = '';
    searchDateFrom = '';
    searchDateTo = '';
    searchTags = [];
    isFilterExpanded = false;
  }

  selectedDate = null;
  selectedCategory = null;
  buildPage(mainEl);

  // 自动聚焦搜索框
  if (shouldSearch || initKeyword) {
    const searchInput = mainEl.querySelector('#search-keyword') as HTMLInputElement | null;
    if (searchInput) {
      searchInput.focus();
      const len = searchInput.value.length;
      searchInput.setSelectionRange(len, len);
    }
  }

  // 恢复之前滚动的滚动位置（同步设置消除闪屏）
  const savedScroll = sessionStorage.getItem('list-scroll-top');
  if (savedScroll) {
    const scrollEl = document.getElementById('list-content');
    if (scrollEl) {
      scrollEl.scrollTop = parseInt(savedScroll, 10);
    }
  }

  // 延迟一帧让浏览器完成滚动定位后，再移除隐藏类，开始淡入动画
  requestAnimationFrame(() => {
    const pageListEl = mainEl.querySelector('.page-list');
    if (pageListEl) {
      pageListEl.classList.remove('is-restoring');
    }
  });
}

// ====================================================
// 构建整体页面结构
// ====================================================
function buildPage(mainEl: HTMLElement): void {
  mainEl.innerHTML = `
    <div class="page-list is-restoring">
      <div class="list-layout">
        <!-- 左侧面板 -->
        <aside class="list-sidebar" aria-label="筛选面板">
          <div class="sidebar-tabs">
            <button class="sidebar-tab ${sidebarTab === 'category' ? 'active' : ''}" data-tab="category">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="13" height="13">
                <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
                <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
              </svg>
              分类视图
            </button>
            <button class="sidebar-tab ${sidebarTab === 'calendar' ? 'active' : ''}" data-tab="calendar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="13" height="13">
                <rect x="3" y="4" width="18" height="18" rx="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              日历视图
            </button>
          </div>

          <!-- 分类面板 -->
          <div class="sidebar-panel ${sidebarTab === 'category' ? 'active' : ''}" id="panel-category">
            ${buildCategoryPanelHTML()}
          </div>

          <!-- 日历面板 -->
          <div class="sidebar-panel ${sidebarTab === 'calendar' ? 'active' : ''}" id="panel-calendar">
            <div class="cal-card" id="cal-widget">
              ${buildCalendarHTML()}
            </div>
          </div>
        </aside>

        <!-- 右侧：日记内容区 -->
        <main class="list-content" id="list-content" aria-label="日记列表">
          ${buildSearchPanelHTML()}
          <div class="list-entries-wrap" id="list-entries-wrap">
            ${buildEntriesHTML(getFilteredEntries())}
          </div>
        </main>
      </div>
    </div>
  `;

  bindPageEvents(mainEl);
}

// ====================================================
// 搜索和高级筛选面板 HTML
// ====================================================
function buildSearchPanelHTML(): string {
  const moodOptions = (Object.entries(MOOD_CONFIG) as [MoodType, typeof MOOD_CONFIG[MoodType]][])
    .map(([key, cfg]) => {
      const isActive = searchMood === key;
      return `
        <button class="filter-mood-btn ${isActive ? 'active' : ''}" data-mood="${key}" type="button" title="${cfg.label}">
          <span>${cfg.emoji}</span>
          <span class="filter-mood-label">${cfg.label}</span>
        </button>
      `;
    })
    .join('');

  const allTags = getAllTagsList();
  const tagFiltersHTML = allTags.length > 0
    ? `
      <div class="filter-field">
        <label class="filter-label">标签</label>
        <div class="filter-tags-list">
          ${allTags.map(t => {
            const isActive = searchTags.includes(t);
            return `<button class="filter-tag-btn ${isActive ? 'active' : ''}" data-tag="${escapeHtml(t)}" type="button">#${escapeHtml(t)}</button>`;
          }).join('')}
        </div>
      </div>
    ` : '';

  const hasActiveFilters = !!(
    selectedDate ||
    selectedCategory !== null ||
    searchKeyword ||
    searchMood ||
    searchDateFrom ||
    searchDateTo ||
    searchTags.length > 0
  );

  return `
    <div class="search-filter-panel">
      <!-- 搜索框主行 -->
      <div class="search-main-row">
        <div class="search-input-container">
          <svg class="search-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input type="text" id="search-keyword" class="search-keyword-input" placeholder="搜索日记标题或正文内容…" value="${escapeHtml(searchKeyword)}" />
          ${searchKeyword ? `<button class="search-clear-btn" id="search-clear-keyword" title="清空搜索词" type="button">✕</button>` : ''}
        </div>
        <button class="btn btn-ghost filter-toggle-btn ${isFilterExpanded ? 'active' : ''}" id="filter-toggle-btn" type="button">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
          </svg>
          高级筛选
        </button>
      </div>

      <!-- 折叠的高级筛选区域 -->
      <div class="search-advanced-filters ${isFilterExpanded ? 'expanded' : ''}" id="search-advanced-filters">
        <div class="advanced-filters-inner">
          <!-- 情绪筛选 -->
          <div class="filter-field">
            <label class="filter-label">情绪</label>
            <div class="filter-moods-list">
              ${moodOptions}
            </div>
          </div>

          <!-- 日期区间 -->
          <div class="filter-field">
            <label class="filter-label">日期区间</label>
            <div class="filter-date-inputs">
              <input type="date" id="filter-date-from" class="filter-date-input" value="${escapeHtml(searchDateFrom)}" />
              <span class="filter-date-to-sep">至</span>
              <input type="date" id="filter-date-to" class="filter-date-input" value="${escapeHtml(searchDateTo)}" />
            </div>
          </div>

          <!-- 标签多选 -->
          ${tagFiltersHTML}
        </div>
      </div>

      <!-- 筛选状态反馈条 -->
      ${hasActiveFilters ? `
        <div class="filter-status-bar">
          <span class="filter-status-text">已启用条件筛选，找到 <strong id="filter-results-count">${getFilteredEntries().length}</strong> 篇日记</span>
          <button class="filter-reset-btn" id="filter-reset-all" type="button">清除全部筛选</button>
        </div>
      ` : ''}
    </div>
  `;
}

// ====================================================
// 分类面板 HTML
// ====================================================
function buildCategoryPanelHTML(): string {
  const allTags = getAllTagsList();
  const stats = buildCategoryStats(currentEntries, allTags);

  const items = stats
    .filter(s => s.name !== '__none__' || s.count > 0 || true) // 始终显示未分类
    .map(s => {
      const isAll = s.name === '';
      const isNone = s.name === '__none__';
      const displayName = isAll ? '全部分类' : isNone ? '未分类' : s.name;
      const dataCat = isAll ? '__all__' : s.name;
      const isActive = isAll
        ? selectedCategory === null
        : s.name === '__none__'
          ? selectedCategory === ''
          : selectedCategory === s.name;

      const safeDisplayName = escapeHtml(displayName);
      const safeDataCat = escapeHtml(dataCat);

      return `
        <button class="cat-list-item ${isActive ? 'active' : ''}" data-cat="${safeDataCat}">
          <span class="cat-list-dot" style="background:${s.color}"></span>
          <span class="cat-list-name">${safeDisplayName}</span>
          <span class="cat-list-count">${s.count}篇</span>
        </button>
      `;
    }).join('');

  return `
    <div class="cat-list" id="cat-list">
      ${items}
    </div>
    <div class="cat-edit-row">
      <button class="cat-edit-btn" id="cat-edit-btn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="13" height="13">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
        编辑分类
      </button>
    </div>
  `;
}

// ====================================================
// 日历 HTML
// ====================================================
function buildCalendarHTML(): string {
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const datesWithEntries = new Set<string>();
  currentEntries.forEach(e => datesWithEntries.add(e.dateFor));

  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const prevDays = new Date(calYear, calMonth, 0).getDate();
  const monthNames = ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'];
  const weekDays = ['日','一','二','三','四','五','六'];

  let cells = '';
  for (let i = firstDay - 1; i >= 0; i--) {
    cells += `<div class="cal-day other-month"><span class="cal-day-num">${prevDays - i}</span></div>`;
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const isToday = dateStr === todayStr;
    const hasDiary = datesWithEntries.has(dateStr);
    const isSelected = dateStr === selectedDate;
    const cls = ['cal-day', isToday ? 'today' : '', hasDiary ? 'has-diary' : '', isSelected ? 'selected' : ''].filter(Boolean).join(' ');
    cells += `
      <div class="${cls}" data-date="${dateStr}" role="button" tabindex="0">
        <span class="cal-day-num">${d}</span>
        ${hasDiary ? '<span class="cal-dot"></span>' : ''}
      </div>`;
  }
  const remain = (7 - ((firstDay + daysInMonth) % 7)) % 7;
  for (let d = 1; d <= remain; d++) {
    cells += `<div class="cal-day other-month"><span class="cal-day-num">${d}</span></div>`;
  }

  return `
    <div class="cal-header">
      <button class="cal-nav-btn" id="cal-prev">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <div class="cal-title-wrap">
        <span class="cal-title">${calYear}年 ${monthNames[calMonth]}</span>
        <button class="btn cal-today-btn" id="cal-goto-today">今天</button>
      </div>
      <button class="cal-nav-btn" id="cal-next">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
    </div>
    <div class="cal-weekdays">
      ${weekDays.map(d => `<div class="cal-weekday">${d}</div>`).join('')}
    </div>
    <div class="cal-grid">${cells}</div>
    <div class="cal-legend">
      <span class="cal-dot"></span><span>有日记</span>
    </div>
  `;
}

// ====================================================
// 日记列表 HTML
// ====================================================
function buildEntriesHTML(entries: DiaryEntry[]): string {
  if (currentEntries.length === 0) {
    return `
      <div class="empty-state">
        <div class="empty-hero">
          <img src="/hero.png" alt="日记本插图" class="empty-hero-img" />
        </div>
        <h2 class="empty-title">开始记录你的故事</h2>
        <p class="empty-desc">每一天都值得被温柔地记住。<br>写下此刻的心情、想法与感悟。</p>
        <button class="btn btn-primary empty-cta" id="empty-new-btn">写第一篇日记</button>
      </div>
    `;
  }

  if (entries.length === 0) {
    const label = selectedDate
      ? `${selectedDate} 没有日记`
      : selectedCategory === ''
        ? '没有未分类的日记'
        : selectedCategory
          ? `分类「${escapeHtml(selectedCategory)}」没有日记`
          : '没有找到符合条件的日记';
    return `
      <div class="list-no-result">
        <span class="list-no-result-icon">📭</span>
        <p>${label}</p>
      </div>
    `;
  }

  // 按日期分组
  const groups = new Map<string, DiaryEntry[]>();
  entries.forEach(e => {
    if (!groups.has(e.dateFor)) groups.set(e.dateFor, []);
    groups.get(e.dateFor)!.push(e);
  });

  return Array.from(groups.entries()).map(([date, items]) => {
    const [y, m, dd] = date.split('-');
    return `
      <div class="entry-group">
        <div class="group-header">
          <span class="group-date">${y}年${parseInt(m)}月${parseInt(dd)}日</span>
          <span class="group-count">${items.length}篇</span>
        </div>
        <div class="cards-grid">
          ${items.map(e => renderDiaryCard(e)).join('')}
        </div>
      </div>
    `;
  }).join('');
}

// ====================================================
// 筛选
// ====================================================
function getFilteredEntries(): DiaryEntry[] {
  let result = currentEntries;

  // 1. 左侧日期筛选
  if (selectedDate) {
    result = result.filter(e => e.dateFor === selectedDate);
  }

  // 2. 左侧分类筛选（单选）
  if (selectedCategory !== null) {
    if (selectedCategory === '') {
      result = result.filter(e => !e.tags[0]);
    } else {
      result = result.filter(e => e.tags[0] === selectedCategory);
    }
  }

  // 3. 关键词过滤
  if (searchKeyword) {
    const kw = searchKeyword.toLowerCase();
    result = result.filter(e =>
      e.title.toLowerCase().includes(kw) ||
      e.plainText.toLowerCase().includes(kw)
    );
  }

  // 4. 情绪过滤
  if (searchMood) {
    result = result.filter(e => e.mood === searchMood);
  }

  // 5. 开始日期过滤
  if (searchDateFrom) {
    result = result.filter(e => e.dateFor >= searchDateFrom);
  }

  // 6. 结束日期过滤
  if (searchDateTo) {
    result = result.filter(e => e.dateFor <= searchDateTo);
  }

  // 7. 标签多选过滤
  if (searchTags.length > 0) {
    result = result.filter(e =>
      searchTags.every(t => e.tags.includes(t))
    );
  }

  return result;
}

// ====================================================
// 事件绑定
// ====================================================
function bindPageEvents(container: HTMLElement): void {
  container.querySelector('#empty-new-btn')?.addEventListener('click', () => navigate('editor'));

  // 绑定搜索输入框与防抖
  const searchInput = container.querySelector('#search-keyword') as HTMLInputElement | null;
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      debounce(() => {
        searchKeyword = searchInput.value.trim();
        updateFilteredResults(container);
      }, 200);
    });
  }

  // 绑定高级筛选折叠切换
  const filterToggleBtn = container.querySelector('#filter-toggle-btn');
  const advancedFilters = container.querySelector('#search-advanced-filters') as HTMLElement;
  filterToggleBtn?.addEventListener('click', () => {
    isFilterExpanded = !isFilterExpanded;
    filterToggleBtn.classList.toggle('active', isFilterExpanded);
    advancedFilters?.classList.toggle('expanded', isFilterExpanded);
  });

  // 绑定情绪微标点击
  container.querySelectorAll('.filter-mood-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mood = (btn as HTMLElement).dataset.mood as MoodType;
      if (searchMood === mood) {
        searchMood = '';
        btn.classList.remove('active');
      } else {
        searchMood = mood;
        container.querySelectorAll('.filter-mood-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      }
      updateFilteredResults(container);
    });
  });

  // 绑定日期区间
  const dateFromEl = container.querySelector('#filter-date-from') as HTMLInputElement | null;
  const dateToEl = container.querySelector('#filter-date-to') as HTMLInputElement | null;
  dateFromEl?.addEventListener('change', () => {
    searchDateFrom = dateFromEl.value;
    updateFilteredResults(container);
  });
  dateToEl?.addEventListener('change', () => {
    searchDateTo = dateToEl.value;
    updateFilteredResults(container);
  });

  // 绑定标签多选
  container.querySelectorAll('.filter-tag-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tag = (btn as HTMLElement).dataset.tag!;
      if (searchTags.includes(tag)) {
        searchTags = searchTags.filter(t => t !== tag);
        btn.classList.remove('active');
      } else {
        searchTags.push(tag);
        btn.classList.add('active');
      }
      updateFilteredResults(container);
    });
  });

  // 绑定清除关键词按钮
  container.querySelector('#search-clear-keyword')?.addEventListener('click', (e) => {
    searchKeyword = '';
    if (searchInput) searchInput.value = '';
    (e.target as HTMLElement).remove();
    updateFilteredResults(container);
  });

  // 绑定清除全部筛选
  container.querySelector('#filter-reset-all')?.addEventListener('click', () => {
    resetAllFilters(container);
  });

  // Tab 切换
  container.querySelectorAll('.sidebar-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = (btn as HTMLElement).dataset.tab as 'calendar' | 'category';
      sidebarTab = tab;
      if (tab === 'category') { selectedDate = null; }
      else { selectedCategory = null; }
      container.querySelectorAll('.sidebar-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      container.querySelectorAll('.sidebar-panel').forEach(p => p.classList.remove('active'));
      container.querySelector(`#panel-${tab}`)?.classList.add('active');
      refreshContent(container);
    });
  });

  // 分类列表点击
  bindCategoryEvents(container);

  // 编辑分类（直接弹出分类管理模态框）
  container.querySelector('#cat-edit-btn')?.addEventListener('click', () => {
    showCategoryModal(async () => {
      await refreshEntries();
      currentEntries = getEntries();
      refreshContent(container);
      refreshCategoryPanel(container);
    });
  });

  // 日历事件
  bindCalendarEvents(container);

  // 日记卡片事件
  bindCardEvents(container, async () => {
    await refreshEntries();
    currentEntries = getEntries();
    refreshContent(container);
    refreshCalendar(container);
    refreshCategoryPanel(container);
  });
}

function bindCategoryEvents(container: HTMLElement): void {
  container.querySelectorAll('.cat-list-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const cat = (btn as HTMLElement).dataset.cat!;
      if (cat === '__all__') {
        selectedCategory = null;
      } else if (cat === '__none__') {
        selectedCategory = '';
      } else {
        selectedCategory = cat;
      }
      container.querySelectorAll('.cat-list-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      refreshContent(container);
    });
  });
}

function bindCalendarEvents(container: HTMLElement): void {
  container.querySelector('#cal-prev')?.addEventListener('click', () => {
    calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; }
    refreshCalendar(container);
  });
  container.querySelector('#cal-next')?.addEventListener('click', () => {
    calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; }
    refreshCalendar(container);
  });
  container.querySelector('#cal-goto-today')?.addEventListener('click', () => {
    const now = new Date(); calYear = now.getFullYear(); calMonth = now.getMonth();
    selectedDate = null;
    refreshCalendar(container); refreshContent(container);
  });
  bindCalDayClick(container);
}

function bindCalDayClick(container: HTMLElement): void {
  container.querySelectorAll('.cal-day[data-date]').forEach(cell => {
    cell.addEventListener('click', () => {
      const date = (cell as HTMLElement).dataset.date!;
      selectedDate = selectedDate === date ? null : date;
      container.querySelectorAll('.cal-day').forEach(c => c.classList.remove('selected'));
      if (selectedDate) cell.classList.add('selected');
      refreshContent(container);
    });
    cell.addEventListener('keydown', e => { if ((e as KeyboardEvent).key === 'Enter') (cell as HTMLElement).click(); });
  });
}

// ====================================================
// 刷新函数
// ====================================================
function refreshContent(container: HTMLElement): void {
  updateFilteredResults(container);
}

/** 局部更新筛选后的日记结果和反馈状态，避免重绘输入框使之失焦 */
function updateFilteredResults(container: HTMLElement): void {
  const entriesWrap = container.querySelector('#list-entries-wrap');
  if (entriesWrap) {
    entriesWrap.innerHTML = buildEntriesHTML(getFilteredEntries());
    entriesWrap.querySelector('#empty-new-btn')?.addEventListener('click', () => navigate('editor'));
    // 重新绑定卡片事件
    bindCardEvents(entriesWrap as HTMLElement, async () => {
      await refreshEntries();
      currentEntries = getEntries();
      updateFilteredResults(container);
      refreshCalendar(container);
      refreshCategoryPanel(container);
    });
  }

  // 动态更新反馈状态条
  const searchFilterPanel = container.querySelector('.search-filter-panel');
  if (searchFilterPanel) {
    const searchInput = container.querySelector('#search-keyword') as HTMLInputElement | null;
    
    // 1. 更新清空输入框按钮
    let clearKeywordBtn = container.querySelector('#search-clear-keyword');
    if (searchKeyword) {
      if (!clearKeywordBtn) {
        const inputContainer = container.querySelector('.search-input-container');
        if (inputContainer) {
          const btn = document.createElement('button');
          btn.className = 'search-clear-btn';
          btn.id = 'search-clear-keyword';
          btn.title = '清空搜索词';
          btn.textContent = '✕';
          btn.type = 'button';
          btn.addEventListener('click', () => {
            searchKeyword = '';
            if (searchInput) searchInput.value = '';
            btn.remove();
            updateFilteredResults(container);
          });
          inputContainer.appendChild(btn);
        }
      }
    } else {
      clearKeywordBtn?.remove();
    }

    // 2. 更新筛选状态反馈条
    let statusBar = container.querySelector('.filter-status-bar');
    const hasActiveFilters = !!(
      selectedDate ||
      selectedCategory !== null ||
      searchKeyword ||
      searchMood ||
      searchDateFrom ||
      searchDateTo ||
      searchTags.length > 0
    );

    if (hasActiveFilters) {
      if (!statusBar) {
        statusBar = document.createElement('div');
        statusBar.className = 'filter-status-bar';
        searchFilterPanel.appendChild(statusBar);
      }
      statusBar.innerHTML = `
        <span class="filter-status-text">已启用条件筛选，找到 <strong id="filter-results-count">${getFilteredEntries().length}</strong> 篇日记</span>
        <button class="filter-reset-btn" id="filter-reset-all" type="button">清除全部筛选</button>
      `;
      // 重新绑定清除事件
      statusBar.querySelector('#filter-reset-all')?.addEventListener('click', () => {
        resetAllFilters(container);
      });
    } else {
      statusBar?.remove();
    }
  }
}

/** 一键清空所有筛选状态 */
function resetAllFilters(container: HTMLElement): void {
  selectedDate = null;
  selectedCategory = null;
  searchKeyword = '';
  searchMood = '';
  searchDateFrom = '';
  searchDateTo = '';
  searchTags = [];

  // 复位左侧 UI
  container.querySelectorAll('.cat-list-item').forEach(b => b.classList.remove('active'));
  container.querySelector('[data-cat="__all__"]')?.classList.add('active');
  container.querySelectorAll('.cal-day').forEach(c => c.classList.remove('selected'));

  // 复位高级筛选区 UI
  container.querySelectorAll('.filter-mood-btn').forEach(b => b.classList.remove('active'));
  container.querySelectorAll('.filter-tag-btn').forEach(b => b.classList.remove('active'));
  const dateFromEl = container.querySelector('#filter-date-from') as HTMLInputElement | null;
  const dateToEl = container.querySelector('#filter-date-to') as HTMLInputElement | null;
  if (dateFromEl) dateFromEl.value = '';
  if (dateToEl) dateToEl.value = '';

  const searchInput = container.querySelector('#search-keyword') as HTMLInputElement | null;
  if (searchInput) searchInput.value = '';

  updateFilteredResults(container);
  refreshCalendar(container);
  refreshCategoryPanel(container);
}

function refreshCalendar(container: HTMLElement): void {
  const el = container.querySelector('#cal-widget');
  if (!el) return;
  el.innerHTML = buildCalendarHTML();
  bindCalendarEvents(container);
}

function refreshCategoryPanel(container: HTMLElement): void {
  const el = container.querySelector('#panel-category');
  if (!el) return;
  el.innerHTML = buildCategoryPanelHTML();
  bindCategoryEvents(container);
  container.querySelector('#cat-edit-btn')?.addEventListener('click', () => {
    showCategoryModal(async () => {
      await refreshEntries();
      currentEntries = getEntries();
      refreshContent(container);
      refreshCategoryPanel(container);
    });
  });
}
