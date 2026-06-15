/**
 * 自定义日期时间选择器组件
 * 替换浏览器原生 input[type=date]，支持精确到分钟
 * 风格：与应用主题一致的下拉日历面板
 */

export interface DateTimePickerOptions {
  /** 初始日期，YYYY-MM-DD 格式 */
  initialDate?: string;
  /** 初始时间，HH:MM 格式 */
  initialTime?: string;
  /** 挂载到的容器（用于定位） */
  container: HTMLElement;
  /** 值变更回调 */
  onChange: (date: string, time: string) => void;
  /** 是否只选择日期 */
  dateOnly?: boolean;
  /** 是否允许清空 */
  allowEmpty?: boolean;
  /** 占位符文本 */
  placeholder?: string;
  /** 触发器额外类名 */
  triggerClass?: string;
}

/** 月份名称 */
const MONTH_NAMES = ['一月', '二月', '三月', '四月', '五月', '六月',
  '七月', '八月', '九月', '十月', '十一月', '十二月'];

const WEEKDAY_NAMES = ['日', '一', '二', '三', '四', '五', '六'];

export class DateTimePicker {
  private date: Date;
  private viewYear: number;
  private viewMonth: number;  // 0-indexed
  private selectedDate: string;  // YYYY-MM-DD
  private selectedTime: string;  // HH:MM
  private panel: HTMLElement | null = null;
  private triggerEl: HTMLButtonElement;
  private options: DateTimePickerOptions;
  private _clickOutsideHandler: ((e: MouseEvent) => void) | null = null;

  constructor(options: DateTimePickerOptions) {
    this.options = options;
    const now = new Date();

    // 解析初始日期
    if (options.initialDate && /^\d{4}-\d{2}-\d{2}$/.test(options.initialDate)) {
      const [y, m, d] = options.initialDate.split('-').map(Number);
      this.date = new Date(y, m - 1, d);
      this.selectedDate = options.initialDate;
    } else {
      this.date = now;
      this.selectedDate = options.allowEmpty ? '' : this.toDateStr(now);
    }

    // 解析初始时间
    if (options.initialTime && /^\d{2}:\d{2}$/.test(options.initialTime)) {
      this.selectedTime = options.initialTime;
    } else {
      const h = String(now.getHours()).padStart(2, '0');
      const m2 = String(now.getMinutes()).padStart(2, '0');
      this.selectedTime = `${h}:${m2}`;
    }

    this.viewYear = this.date.getFullYear();
    this.viewMonth = this.date.getMonth();

    // 创建触发器按钮
    this.triggerEl = document.createElement('button');
    this.triggerEl.type = 'button';
    this.triggerEl.className = `dt-trigger ${options.triggerClass || 'meta-input'}`;
    this.triggerEl.innerHTML = this.renderTriggerContent();
    options.container.appendChild(this.triggerEl);

    this.triggerEl.addEventListener('click', (e) => {
      e.stopPropagation();
      this.togglePanel();
    });
  }

  private toDateStr(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  private renderTriggerContent(): string {
    if (!this.selectedDate) {
      return `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="13" height="13" style="flex-shrink:0;opacity:0.6">
          <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        <span class="dt-trigger-date" style="color:var(--text-placeholder);font-weight:normal">${this.options.placeholder || '年/月/日'}</span>
      `;
    }
    const [y, m, d] = this.selectedDate.split('-').map(Number);
    const displayDate = `${y}年${m}月${d}日`;
    if (this.options.dateOnly) {
      return `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="13" height="13" style="flex-shrink:0;opacity:0.6">
          <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        <span class="dt-trigger-date">${displayDate}</span>
      `;
    }
    const [h, min] = this.selectedTime.split(':');
    return `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="13" height="13" style="flex-shrink:0;opacity:0.6">
        <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
      <span class="dt-trigger-date">${displayDate}</span>
      <span class="dt-trigger-sep">·</span>
      <span class="dt-trigger-time">${h}:${min}</span>
    `;
  }

  private togglePanel(): void {
    if (this.panel) {
      this.closePanel();
    } else {
      this.openPanel();
    }
  }

  private openPanel(): void {
    this.closePanel(); // 先关闭旧的（防止重复）

    this.panel = document.createElement('div');
    this.panel.className = 'dt-panel';
    this.panel.innerHTML = this.buildPanelHTML();

    // 定位到触发器下方 (使用 absolute 定位 relative 于 options.container)
    this.panel.style.cssText = `
      position: absolute;
      top: 100%;
      left: 0;
      margin-top: 8px;
      z-index: 1000;
    `;

    this.options.container.appendChild(this.panel);

    this.bindPanelEvents();

    // 点击外部关闭
    this._clickOutsideHandler = (e: MouseEvent) => {
      if (!this.panel?.contains(e.target as Node) && e.target !== this.triggerEl) {
        this.closePanel();
      }
    };
    setTimeout(() => {
      document.addEventListener('click', this._clickOutsideHandler!);
    }, 0);
  }

  private closePanel(): void {
    if (this.panel) {
      this.panel.remove();
      this.panel = null;
    }
    if (this._clickOutsideHandler) {
      document.removeEventListener('click', this._clickOutsideHandler);
      this._clickOutsideHandler = null;
    }
  }

  private buildPanelHTML(): string {
    // 生成日历格子
    const firstDay = new Date(this.viewYear, this.viewMonth, 1).getDay();
    const daysInMonth = new Date(this.viewYear, this.viewMonth + 1, 0).getDate();
    const prevDays = new Date(this.viewYear, this.viewMonth, 0).getDate();

    let cells = '';
    // 上个月的尾部日子
    for (let i = firstDay - 1; i >= 0; i--) {
      cells += `<div class="dt-day dt-day-other">${prevDays - i}</div>`;
    }
    // 当月的日子
    const todayStr = this.toDateStr(new Date());
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${this.viewYear}-${String(this.viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isToday = dateStr === todayStr;
      const isSelected = dateStr === this.selectedDate;
      const cls = ['dt-day',
        isToday ? 'dt-day-today' : '',
        isSelected ? 'dt-day-selected' : '',
      ].filter(Boolean).join(' ');
      cells += `<div class="${cls}" data-date="${dateStr}">${d}</div>`;
    }
    // 下个月的开头日子
    const remain = (7 - ((firstDay + daysInMonth) % 7)) % 7;
    for (let d = 1; d <= remain; d++) {
      cells += `<div class="dt-day dt-day-other">${d}</div>`;
    }

    const timeRowHTML = this.options.dateOnly ? '' : `
      <!-- 分割线 -->
      <div class="dt-divider"></div>

      <!-- 时间选择器 -->
      <div class="dt-time-row">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="14" height="14" style="opacity:0.5;flex-shrink:0">
          <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
        </svg>
        <span class="dt-time-label">时间</span>
        <div class="dt-time-inputs">
          <div class="dt-spin-group">
            <button class="dt-spin-btn" data-target="hour" data-dir="+1" type="button">▲</button>
            <input class="dt-spin-input" id="dt-hour" type="number" min="0" max="23" value="${String(this.selectedTime.split(':')[0]).padStart(2,'0')}" />
            <button class="dt-spin-btn" data-target="hour" data-dir="-1" type="button">▼</button>
          </div>
          <span class="dt-time-colon">:</span>
          <div class="dt-spin-group">
            <button class="dt-spin-btn" data-target="minute" data-dir="+1" type="button">▲</button>
            <input class="dt-spin-input" id="dt-minute" type="number" min="0" max="59" value="${String(this.selectedTime.split(':')[1]).padStart(2,'0')}" />
            <button class="dt-spin-btn" data-target="minute" data-dir="-1" type="button">▼</button>
          </div>
        </div>
      </div>
    `;

    const clearBtnHTML = this.options.allowEmpty ? `
      <button class="dt-footer-btn dt-clear-btn" id="dt-clear" type="button">清除</button>
    ` : '';

    // 生成自定义年份选项，支持倒退 50 年，前进 15 年，轻松覆盖 1996 等早期年份
    const startYear = this.viewYear - 50;
    const endYear = this.viewYear + 15;
    let yearOptionsHTML = '';
    for (let y = startYear; y <= endYear; y++) {
      const isActive = y === this.viewYear;
      yearOptionsHTML += `
        <button class="dt-select-option ${isActive ? 'active' : ''}" data-value="${y}" type="button">${y}年</button>
      `;
    }

    // 生成自定义月份选项
    let monthOptionsHTML = '';
    MONTH_NAMES.forEach((name, index) => {
      const isActive = index === this.viewMonth;
      monthOptionsHTML += `
        <button class="dt-select-option ${isActive ? 'active' : ''}" data-value="${index}" type="button">${name}</button>
      `;
    });

    return `
      <div class="dt-panel-inner">
        <!-- 月份导航 -->
        <div class="dt-header">
          <button class="dt-nav-btn" id="dt-prev" type="button">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13" height="13"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div class="dt-month-year-selectors" style="display:flex;align-items:center;gap:6px">
            <!-- 年份 -->
            <div class="dt-select-wrapper" id="dt-year-wrapper">
              <button class="dt-select-trigger" id="dt-year-trigger" type="button">${this.viewYear}年</button>
              <div class="dt-select-dropdown" id="dt-year-dropdown" style="display:none;">
                ${yearOptionsHTML}
              </div>
            </div>
            <!-- 月份 -->
            <div class="dt-select-wrapper" id="dt-month-wrapper">
              <button class="dt-select-trigger" id="dt-month-trigger" type="button">${MONTH_NAMES[this.viewMonth]}</button>
              <div class="dt-select-dropdown" id="dt-month-dropdown" style="display:none;">
                ${monthOptionsHTML}
              </div>
            </div>
          </div>
          <button class="dt-nav-btn" id="dt-next" type="button">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13" height="13"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>

        <!-- 星期标题 -->
        <div class="dt-weekdays">
          ${WEEKDAY_NAMES.map(w => `<div class="dt-weekday">${w}</div>`).join('')}
        </div>

        <!-- 日历格子 -->
        <div class="dt-grid">${cells}</div>

        ${timeRowHTML}

        <!-- 底部按钮 -->
        <div class="dt-footer">
          ${clearBtnHTML}
          <button class="dt-footer-btn dt-today-btn" id="dt-today" type="button">今天</button>
          <button class="dt-footer-btn dt-confirm-btn" id="dt-confirm" type="button">确定</button>
        </div>
      </div>
    `;
  }

  private bindPanelEvents(): void {
    if (!this.panel) return;

    // 月份导航
    this.panel.querySelector('#dt-prev')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.viewMonth--;
      if (this.viewMonth < 0) { this.viewMonth = 11; this.viewYear--; }
      this.refreshPanel();
    });
    this.panel.querySelector('#dt-next')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.viewMonth++;
      if (this.viewMonth > 11) { this.viewMonth = 0; this.viewYear++; }
      this.refreshPanel();
    });

    // 自定义年份下拉展开与选择
    const yearTrigger = this.panel.querySelector('#dt-year-trigger') as HTMLButtonElement;
    const yearDropdown = this.panel.querySelector('#dt-year-dropdown') as HTMLElement;
    
    yearTrigger?.addEventListener('click', (e) => {
      e.stopPropagation();
      const isHidden = yearDropdown.style.display === 'none';
      const monthDropdown = this.panel?.querySelector('#dt-month-dropdown') as HTMLElement;
      if (monthDropdown) monthDropdown.style.display = 'none';
      
      if (isHidden) {
        yearDropdown.style.display = 'flex';
        const activeOpt = yearDropdown.querySelector('.dt-select-option.active') as HTMLElement;
        if (activeOpt) {
          setTimeout(() => activeOpt.scrollIntoView({ block: 'nearest' }), 0);
        }
      } else {
        yearDropdown.style.display = 'none';
      }
    });

    yearDropdown?.querySelectorAll('.dt-select-option').forEach(opt => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        const val = parseInt((opt as HTMLElement).dataset.value!, 10);
        if (!isNaN(val)) {
          this.viewYear = val;
          this.refreshPanel();
        }
      });
    });

    // 自定义月份下拉展开与选择
    const monthTrigger = this.panel.querySelector('#dt-month-trigger') as HTMLButtonElement;
    const monthDropdown = this.panel.querySelector('#dt-month-dropdown') as HTMLElement;
    
    monthTrigger?.addEventListener('click', (e) => {
      e.stopPropagation();
      const isHidden = monthDropdown.style.display === 'none';
      const yearDropdownEl = this.panel?.querySelector('#dt-year-dropdown') as HTMLElement;
      if (yearDropdownEl) yearDropdownEl.style.display = 'none';
      
      if (isHidden) {
        monthDropdown.style.display = 'flex';
        const activeOpt = monthDropdown.querySelector('.dt-select-option.active') as HTMLElement;
        if (activeOpt) {
          setTimeout(() => activeOpt.scrollIntoView({ block: 'nearest' }), 0);
        }
      } else {
        monthDropdown.style.display = 'none';
      }
    });

    monthDropdown?.querySelectorAll('.dt-select-option').forEach(opt => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        const val = parseInt((opt as HTMLElement).dataset.value!, 10);
        if (!isNaN(val)) {
          this.viewMonth = val;
          this.refreshPanel();
        }
      });
    });

    // 日期格子点击
    this.panel.querySelectorAll('.dt-day[data-date]').forEach(cell => {
      cell.addEventListener('click', (e) => {
        e.stopPropagation();
        const d = (cell as HTMLElement).dataset.date!;
        this.selectedDate = d;
        this.refreshPanel();
        this.updateTrigger();
        this.emitChange();
      });
    });

    // 清除按钮
    this.panel.querySelector('#dt-clear')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.selectedDate = '';
      this.refreshPanel();
      this.updateTrigger();
      this.emitChange();
      this.closePanel();
    });

    if (!this.options.dateOnly) {
      // 时间 spin 按钮
      this.panel.querySelectorAll('.dt-spin-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const target = (btn as HTMLElement).dataset.target!;
          const dir = parseInt((btn as HTMLElement).dataset.dir!);
          this.adjustTime(target as 'hour' | 'minute', dir);
        });
      });

      // 时间输入框直接修改
      const hourInput = this.panel.querySelector('#dt-hour') as HTMLInputElement;
      const minInput = this.panel.querySelector('#dt-minute') as HTMLInputElement;
      hourInput?.addEventListener('change', (e) => {
        e.stopPropagation();
        const v = parseInt(hourInput.value);
        const [, m] = this.selectedTime.split(':');
        const h = Math.max(0, Math.min(23, isNaN(v) ? 0 : v));
        this.selectedTime = `${String(h).padStart(2,'0')}:${m}`;
        hourInput.value = String(h).padStart(2,'0');
        this.updateTrigger();
        this.emitChange();
      });
      minInput?.addEventListener('change', (e) => {
        e.stopPropagation();
        const v = parseInt(minInput.value);
        const [h] = this.selectedTime.split(':');
        const m = Math.max(0, Math.min(59, isNaN(v) ? 0 : v));
        this.selectedTime = `${h}:${String(m).padStart(2,'0')}`;
        minInput.value = String(m).padStart(2,'0');
        this.updateTrigger();
        this.emitChange();
      });
    }

    // 今天按钮
    this.panel.querySelector('#dt-today')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const now = new Date();
      this.selectedDate = this.toDateStr(now);
      this.viewYear = now.getFullYear();
      this.viewMonth = now.getMonth();
      this.refreshPanel();
      this.updateTrigger();
      this.emitChange();
    });

    // 确定按钮
    this.panel.querySelector('#dt-confirm')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closePanel();
    });
  }

  private adjustTime(target: 'hour' | 'minute', dir: number): void {
    const [h, m] = this.selectedTime.split(':').map(Number);
    if (target === 'hour') {
      const nh = (h + dir + 24) % 24;
      this.selectedTime = `${String(nh).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
    } else {
      const nm = (m + dir + 60) % 60;
      this.selectedTime = `${String(h).padStart(2,'0')}:${String(nm).padStart(2,'0')}`;
    }
    // 更新输入框显示
    if (this.panel) {
      const hourEl = this.panel.querySelector('#dt-hour') as HTMLInputElement;
      const minEl = this.panel.querySelector('#dt-minute') as HTMLInputElement;
      if (hourEl) hourEl.value = this.selectedTime.split(':')[0];
      if (minEl) minEl.value = this.selectedTime.split(':')[1];
    }
    this.updateTrigger();
    this.emitChange();
  }

  private refreshPanel(): void {
    if (!this.panel) return;
    this.panel.innerHTML = this.buildPanelHTML();
    this.bindPanelEvents();
  }

  private updateTrigger(): void {
    this.triggerEl.innerHTML = this.renderTriggerContent();
  }

  private emitChange(): void {
    this.options.onChange(this.selectedDate, this.selectedTime);
  }

  /** 获取当前日期 YYYY-MM-DD */
  getDate(): string { return this.selectedDate; }

  /** 获取当前时间 HH:MM */
  getTime(): string { return this.selectedTime; }

  /** 设置日期，YYYY-MM-DD 格式，或空字符串表示清除 */
  setDate(dateStr: string): void {
    if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const [y, m, d] = dateStr.split('-').map(Number);
      this.date = new Date(y, m - 1, d);
      this.selectedDate = dateStr;
      this.viewYear = y;
      this.viewMonth = m - 1;
    } else {
      this.selectedDate = '';
    }
    this.updateTrigger();
    if (this.panel) {
      this.refreshPanel();
    }
  }

  /** 销毁组件 */
  destroy(): void {
    this.closePanel();
    this.triggerEl.remove();
  }
}
