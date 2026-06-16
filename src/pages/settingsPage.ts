import { getAppConfig, updateConfig } from '../store/appStore';
import { clearAllEntries, getAllEntries, filterEntries, importData, exportData, getSyncStatusSnapshot, syncNow } from '../services/databaseService';
import { exportAsMarkdown } from '../utils/exportUtils';
import { showToast } from '../components/toast';
import { showModal } from '../components/modal';
import { navigate } from '../router/router';
import { getCurrentUser, changePassword, updateProfile } from '../store/authStore';
import { getPresetAvatarSvg } from '../utils/avatarUtils';
import { renderTopbar } from '../components/sidebar';
import { today } from '../utils/dateUtils';

/** 格式化日期为 YYYY-MM-DD */
function formatDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 获取 N 天前的日期 YYYY-MM-DD */
function getNDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return formatDateString(d);
}

/** 渲染顶部欢迎卡片的头像 */
function renderBannerAvatar(avatar: string | null | undefined, displayName: string, username: string): string {
  if (!avatar) {
    return `<div class="avatar-svg-container" style="background:var(--accent-bg);color:var(--accent);display:flex;align-items:center;justify-content:center;font-size:1.8rem;font-weight:500;font-family:var(--font-content)">${(displayName || username || 'U').charAt(0).toUpperCase()}</div>`;
  }
  if (avatar.startsWith('avatar:')) {
    const idx = parseInt(avatar.split(':')[1], 10);
    return `<div class="avatar-svg-container">${getPresetAvatarSvg(idx)}</div>`;
  }
  return `<div class="avatar-svg-container" style="background-image:url(${avatar});background-size:cover;background-position:center;width:100%;height:100%"></div>`;
}

/** 下载文本文件 */
function downloadTextFile(content: string, filename: string, mimeType = 'text/plain;charset=utf-8'): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function parseDateValue(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function addMonths(date: Date, count: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + count, 1);
}

function getYearDropdownOptions(selectedYear: number, field: 'start' | 'end'): string {
  const currentYear = new Date().getFullYear();
  const startYear = Math.min(2000, selectedYear);
  const endYear = Math.max(currentYear + 1, selectedYear);
  let options = '';

  for (let year = endYear; year >= startYear; year--) {
    options += `
      <button type="button" class="dt-select-option export-range-dropdown-option ${year === selectedYear ? 'active' : ''}"
        data-calendar-field="${field}" data-picker-type="year" data-picker-value="${year}">
        ${year}年
      </button>
    `;
  }

  return options;
}

function getMonthDropdownOptions(selectedMonth: number, field: 'start' | 'end'): string {
  return Array.from({ length: 12 }, (_, index) => `
    <button type="button" class="dt-select-option export-range-dropdown-option ${index === selectedMonth ? 'active' : ''}"
      data-calendar-field="${field}" data-picker-type="month" data-picker-value="${index}">
      ${index + 1}月
    </button>
  `).join('');
}

function getCalendarDropdownHtml(type: 'year' | 'month', field: 'start' | 'end', value: number): string {
  const label = type === 'year' ? `${value}年` : `${value + 1}月`;
  const options = type === 'year'
    ? getYearDropdownOptions(value, field)
    : getMonthDropdownOptions(value, field);

  return `
    <div class="dt-select-wrapper export-range-dropdown" data-calendar-field="${field}" data-picker-type="${type}" style="position:relative">
      <button type="button" class="dt-select-trigger export-range-dropdown-trigger" data-dropdown-trigger="true"
        data-calendar-field="${field}" data-picker-type="${type}" aria-haspopup="listbox" aria-expanded="false"
        style="font-family:var(--font-content);font-size:0.78rem;font-weight:600;padding:0 12px;min-height:28px">
        <span>${label}</span>
      </button>
      <div class="dt-select-dropdown export-range-dropdown-menu" role="listbox" style="min-width:80px">
        ${options}
      </div>
    </div>
  `;
}

function getDateRangePickerHtml(customId: string, startId: string, endId: string): string {
  const defaultStart = getNDaysAgo(29);
  const defaultEnd = today();
  const startMonth = parseDateValue(defaultStart);
  const endMonth = parseDateValue(defaultEnd);

  return `
    <div class="custom-date-section export-date-section" id="custom-container-${customId}">
      <input type="hidden" id="${startId}" value="${defaultStart}" />
      <input type="hidden" id="${endId}" value="${defaultEnd}" />
      <div class="export-date-range-card" id="range-picker-${customId}"
        data-start-year="${startMonth.getFullYear()}"
        data-start-month="${startMonth.getMonth()}"
        data-end-year="${endMonth.getFullYear()}"
        data-end-month="${endMonth.getMonth()}">
        <div class="export-date-range-fields">
          <div class="export-range-field">
            <span>开始日期</span>
            <strong data-range-label="start">${defaultStart}</strong>
          </div>
          <span class="export-range-arrow">至</span>
          <div class="export-range-field">
            <span>结束日期</span>
            <strong data-range-label="end">${defaultEnd}</strong>
          </div>
        </div>
        <div class="export-range-quick">
          <button type="button" class="export-range-quick-btn" data-quick-days="7">最近7天</button>
          <button type="button" class="export-range-quick-btn active" data-quick-days="30">最近30天</button>
          <button type="button" class="export-range-quick-btn" data-quick-days="180">最近180天</button>
          <button type="button" class="export-range-clear-btn" id="export-clear-btn-${customId}">清空</button>
        </div>
        <div class="export-range-calendars"></div>
      </div>
    </div>
  `;
}

function getCalendarMonthHtml(field: 'start' | 'end', year: number, month: number, startDate: string, endDate: string): string {
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayValue = today();
  let days = '';

  for (let i = 0; i < firstDay; i++) {
    days += '<span class="export-calendar-day export-calendar-day-empty"></span>';
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateValue = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const isStart = dateValue === startDate;
    const isEnd = dateValue === endDate;
    const isInRange = startDate && endDate && dateValue > startDate && dateValue < endDate;
    const classes = [
      'export-calendar-day',
      dateValue === todayValue ? 'today' : '',
      isStart ? 'range-start' : '',
      isEnd ? 'range-end' : '',
      isInRange ? 'in-range' : '',
    ].filter(Boolean).join(' ');
    days += `<button type="button" class="${classes}" data-date="${dateValue}">${day}</button>`;
  }

  return `
    <div class="export-calendar-month" data-calendar-field="${field}">
      <div class="export-calendar-title">${field === 'start' ? '开始日期' : '结束日期'}</div>
      <div class="export-range-toolbar">
        <button type="button" class="export-range-nav-btn" data-calendar-field="${field}" data-month-dir="-1" aria-label="上个月">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="12" height="12"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div class="export-range-month-selectors">
          ${getCalendarDropdownHtml('year', field, year)}
          ${getCalendarDropdownHtml('month', field, month)}
        </div>
        <button type="button" class="export-range-nav-btn" data-calendar-field="${field}" data-month-dir="1" aria-label="下个月">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="12" height="12"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>
      <div class="export-calendar-weekdays">
        ${weekdays.map(day => `<span>${day}</span>`).join('')}
      </div>
      <div class="export-calendar-grid">${days}</div>
    </div>
  `;
}

function bindExportDateRangePicker(modalEl: HTMLElement, customId: string, startId: string, endId: string): void {
  const picker = modalEl.querySelector(`#range-picker-${customId}`) as HTMLElement | null;
  const startInput = modalEl.querySelector(`#${startId}`) as HTMLInputElement | null;
  const endInput = modalEl.querySelector(`#${endId}`) as HTMLInputElement | null;
  if (!picker || !startInput || !endInput) return;

  const renderCalendars = () => {
    const startYear = Number(picker.dataset.startYear);
    const startMonth = Number(picker.dataset.startMonth);
    const endYear = Number(picker.dataset.endYear);
    const endMonth = Number(picker.dataset.endMonth);
    const calendars = picker.querySelector('.export-range-calendars') as HTMLElement;

    calendars.innerHTML = [
      getCalendarMonthHtml('start', startYear, startMonth, startInput.value, endInput.value),
      getCalendarMonthHtml('end', endYear, endMonth, startInput.value, endInput.value),
    ].join('');

    picker.querySelector('[data-range-label="start"]')!.textContent = startInput.value || '--';
    picker.querySelector('[data-range-label="end"]')!.textContent = endInput.value || '--';
  };

  picker.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const navBtn = target.closest('.export-range-nav-btn') as HTMLElement | null;
    const quickBtn = target.closest('.export-range-quick-btn') as HTMLElement | null;
    const clearBtn = target.closest('.export-range-clear-btn') as HTMLElement | null;
    const dropdownTrigger = target.closest('.export-range-dropdown-trigger') as HTMLElement | null;
    const dropdownOption = target.closest('.export-range-dropdown-option') as HTMLElement | null;
    const dayBtn = target.closest('[data-date]') as HTMLElement | null;

    if (!dropdownTrigger) {
      picker.querySelectorAll('.export-range-dropdown.open').forEach(item => {
        item.classList.remove('open');
        item.querySelector('.export-range-dropdown-trigger')?.setAttribute('aria-expanded', 'false');
      });
    }

    if (clearBtn) {
      startInput.value = '';
      endInput.value = '';
      picker.querySelectorAll('.export-range-quick-btn').forEach(btn => btn.classList.remove('active'));
      renderCalendars();
      return;
    }

    if (dropdownTrigger) {
      const dropdown = dropdownTrigger.closest('.export-range-dropdown') as HTMLElement | null;
      const isOpen = dropdown?.classList.contains('open');
      picker.querySelectorAll('.export-range-dropdown.open').forEach(item => {
        item.classList.remove('open');
        item.querySelector('.export-range-dropdown-trigger')?.setAttribute('aria-expanded', 'false');
      });
      if (dropdown && !isOpen) {
        dropdown.classList.add('open');
        dropdownTrigger.setAttribute('aria-expanded', 'true');
      }
      return;
    }

    if (dropdownOption) {
      const field = dropdownOption.dataset.calendarField === 'end' ? 'end' : 'start';
      const type = dropdownOption.dataset.pickerType === 'month' ? 'month' : 'year';
      const value = dropdownOption.dataset.pickerValue || '0';

      if (field === 'start') {
        if (type === 'year') picker.dataset.startYear = value;
        else picker.dataset.startMonth = value;
      } else {
        if (type === 'year') picker.dataset.endYear = value;
        else picker.dataset.endMonth = value;
      }

      renderCalendars();
      return;
    }

    if (navBtn) {
      const field = navBtn.dataset.calendarField === 'end' ? 'end' : 'start';
      const yearKey = field === 'start' ? 'startYear' : 'endYear';
      const monthKey = field === 'start' ? 'startMonth' : 'endMonth';
      const current = new Date(Number(picker.dataset[yearKey]), Number(picker.dataset[monthKey]), 1);
      const next = addMonths(current, Number(navBtn.dataset.monthDir || 0));
      picker.dataset[yearKey] = String(next.getFullYear());
      picker.dataset[monthKey] = String(next.getMonth());
      renderCalendars();
      return;
    }

    if (quickBtn) {
      const days = Number(quickBtn.dataset.quickDays || 30);
      startInput.value = getNDaysAgo(days - 1);
      endInput.value = today();
      const nextStartMonth = parseDateValue(startInput.value);
      const nextEndMonth = parseDateValue(endInput.value);
      picker.dataset.startYear = String(nextStartMonth.getFullYear());
      picker.dataset.startMonth = String(nextStartMonth.getMonth());
      picker.dataset.endYear = String(nextEndMonth.getFullYear());
      picker.dataset.endMonth = String(nextEndMonth.getMonth());
      picker.querySelectorAll('.export-range-quick-btn').forEach(btn => btn.classList.remove('active'));
      quickBtn.classList.add('active');
      renderCalendars();
      return;
    }

    if (dayBtn?.dataset.date) {
      const dateValue = dayBtn.dataset.date;
      const calendar = dayBtn.closest('.export-calendar-month') as HTMLElement | null;
      const field = calendar?.dataset.calendarField === 'end' ? 'end' : 'start';
      picker.querySelectorAll('.export-range-quick-btn').forEach(btn => btn.classList.remove('active'));
      if (field === 'start') {
        startInput.value = dateValue;
        if (!endInput.value || startInput.value > endInput.value) {
          endInput.value = dateValue;
        }
      } else {
        endInput.value = dateValue;
        if (!startInput.value || endInput.value < startInput.value) {
          startInput.value = dateValue;
        }
      }
      renderCalendars();
    }
  });

  renderCalendars();
}

function bindExportModalInteractions(customId: string, startId: string, endId: string): void {
  const modalEl = document.querySelector('.modal-overlay') as HTMLElement | null;
  if (!modalEl) return;

  const modalBox = modalEl.querySelector('.modal-box') as HTMLElement | null;
  const options = modalEl.querySelectorAll('.export-modal-option');
  const customContainer = modalEl.querySelector(`#custom-container-${customId}`) as HTMLElement | null;

  bindExportDateRangePicker(modalEl, customId, startId, endId);

  options.forEach(opt => {
    opt.addEventListener('click', () => {
      options.forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
      const isCustom = (opt as HTMLElement).dataset.range === 'custom';
      customContainer?.classList.toggle('active', isCustom);
      modalBox?.classList.toggle('modal-box-wide', isCustom);
    });
  });
}

/** 设置页面 */
export async function renderSettingsPage(mainEl: HTMLElement): Promise<void> {
  const config = getAppConfig();
  const user = getCurrentUser();
  const syncStatus = await getSyncStatusSnapshot();
  const syncStatusText = syncStatus.isSyncing
    ? '同步中'
    : syncStatus.lastError
      ? '同步失败'
      : syncStatus.pendingCount > 0
        ? `待同步 ${syncStatus.pendingCount} 条`
        : '已同步';
  const lastSyncText = syncStatus.lastSyncedAt
    ? new Date(syncStatus.lastSyncedAt).toLocaleString('zh-CN')
    : '尚未同步';

  // 根据时间获得问候语
  const hour = new Date().getHours();
  let greeting = '晚上好';
  if (hour >= 5 && hour < 11) greeting = '早上好';
  else if (hour >= 11 && hour < 13) greeting = '中午好';
  else if (hour >= 13 && hour < 18) greeting = '下午好';

  mainEl.innerHTML = `
    <div class="page-settings">
      <div class="page-header">
        <h1 class="page-title">设置</h1>
      </div>

      <!-- 个人资料欢迎 Banner -->
      <div class="settings-greeting-card">
        <div class="settings-greeting-left">
          <div class="settings-avatar-wrap" id="banner-avatar-wrap" title="点击更换头像">
            ${renderBannerAvatar(user?.avatar, user?.displayName || '', user?.username || '')}
            <div class="avatar-edit-overlay">更换头像</div>
          </div>
          <div class="settings-greeting-info">
            <span class="greeting-text">${greeting}，${user?.displayName || user?.username || '用户'}</span>
            <span class="user-meta-text">ID: @${user?.username || ''} ${user?.createdAt ? `| 加入时间: ${user.createdAt.substring(0, 10)}` : ''}</span>
          </div>
        </div>
        <div class="settings-greeting-actions">
          <button class="btn btn-ghost" id="edit-profile-btn">修改个人资料</button>
        </div>
      </div>

      <!-- 个人资料修改面板 (默认隐藏) -->
      <div class="profile-edit-panel" id="profile-edit-panel">
        <div class="profile-edit-title">
          <svg class="settings-sec-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
          修改个人资料
        </div>
        
        <div class="profile-edit-content">
          <!-- 头像选择 -->
          <div>
            <span class="avatar-selector-label">选择个人头像</span>
            <div class="avatar-grid" id="profile-avatar-grid">
              <div class="avatar-option avatar-empty-option" data-avatar="" title="使用昵称首字">
                <span>${(user?.displayName || user?.username || 'U').charAt(0).toUpperCase()}</span>
              </div>
              <div class="avatar-option" data-avatar="avatar:1">${getPresetAvatarSvg(1)}</div>
              <div class="avatar-option" data-avatar="avatar:2">${getPresetAvatarSvg(2)}</div>
              <div class="avatar-option" data-avatar="avatar:3">${getPresetAvatarSvg(3)}</div>
              <div class="avatar-option" data-avatar="avatar:4">${getPresetAvatarSvg(4)}</div>
              <div class="avatar-option" data-avatar="avatar:5">${getPresetAvatarSvg(5)}</div>
              <div class="avatar-option" data-avatar="avatar:6">${getPresetAvatarSvg(6)}</div>
              <div class="avatar-option" data-avatar="avatar:7">${getPresetAvatarSvg(7)}</div>
              <div class="avatar-option" data-avatar="avatar:8">${getPresetAvatarSvg(8)}</div>
              <div class="avatar-option avatar-upload-option" id="avatar-upload-trigger" title="上传本地图片">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                <input type="file" id="avatar-file-input" accept="image/*" style="display:none" />
              </div>
            </div>
          </div>
          
          <!-- 表单项 -->
          <div class="profile-form-grid">
            <div class="form-group-settings">
              <label for="edit-display-name">用户昵称</label>
              <input type="text" class="input-settings" id="edit-display-name" value="${user?.displayName || ''}" placeholder="请输入昵称" />
            </div>
            <div class="form-group-settings">
              <label for="edit-username">用户ID (用于登录/唯一标记)</label>
              <input type="text" class="input-settings" id="edit-username" value="${user?.username || ''}" placeholder="请输入只包含字母/数字/下划线的账号" />
            </div>
          </div>
          
          <div class="profile-edit-actions">
            <button class="btn btn-ghost" id="cancel-profile-btn">取消</button>
            <button class="btn btn-primary" id="save-profile-btn">保存修改</button>
          </div>
        </div>
      </div>

      <div class="settings-sections">

        <!-- 外观 -->
        <section class="settings-section">
          <div class="settings-section-title-wrap">
            <svg class="settings-sec-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 14.7255 3.09032 17.1962 4.85857 19C5.02874 19.1702 5.27506 19.2272 5.50085 19.1482C7.5492 18.4323 8.35825 16.5 10 16.5C11.6417 16.5 12.5 17.5 13.5 18.5C14.5 19.5 15 20.5 14 21.5C13.3853 22.1147 12.65 22 12 22Z"></path>
              <circle cx="7.5" cy="10.5" r="1" fill="currentColor"></circle>
              <circle cx="11.5" cy="7.5" r="1" fill="currentColor"></circle>
              <circle cx="16.5" cy="9.5" r="1" fill="currentColor"></circle>
              <circle cx="15.5" cy="14.5" r="1" fill="currentColor"></circle>
            </svg>
            <h2 class="settings-section-title">外观</h2>
          </div>
          <div class="settings-item">
            <div class="settings-item-info">
              <span class="settings-item-label">主题配色</span>
              <span class="settings-item-desc">选择契合此刻心境的色彩纸质主题</span>
            </div>
            <div class="theme-picker-group">
              <button class="theme-picker-btn ${config.theme === 'light' ? 'active' : ''}" data-theme="light">
                <span class="theme-color-preview" style="background:#f7f3eb;border-color:#9c7c4a"></span>
                雅致暖米
              </button>
              <button class="theme-picker-btn ${config.theme === 'plain' ? 'active' : ''}" data-theme="plain">
                <span class="theme-color-preview" style="background:#ffffff;border-color:#737373"></span>
                朴素白
              </button>
              <button class="theme-picker-btn ${config.theme === 'green' ? 'active' : ''}" data-theme="green">
                <span class="theme-color-preview" style="background:#edf3ec;border-color:#5a7860"></span>
                清幽森绿
              </button>
              <button class="theme-picker-btn ${config.theme === 'blue' ? 'active' : ''}" data-theme="blue">
                <span class="theme-color-preview" style="background:#ebf3f7;border-color:#53778a"></span>
                静谧天蓝
              </button>
              <button class="theme-picker-btn ${config.theme === 'pink' ? 'active' : ''}" data-theme="pink">
                <span class="theme-color-preview" style="background:#f7edf0;border-color:#8e5f6e"></span>
                温柔樱粉
              </button>
              <button class="theme-picker-btn ${config.theme === 'dark' ? 'active' : ''}" data-theme="dark">
                <span class="theme-color-preview" style="background:#1c1812;border-color:#c4a46e"></span>
                沉静暗夜
              </button>
            </div>
          </div>
          <div class="settings-item">
            <div class="settings-item-info">
              <span class="settings-item-label">字体大小</span>
              <span class="settings-item-desc">调整正文显示字号</span>
            </div>
            <div class="font-size-group">
              <button class="font-size-btn ${config.fontSize === 'sm' ? 'active' : ''}" data-size="sm" id="fs-sm-btn">小</button>
              <button class="font-size-btn ${config.fontSize === 'md' ? 'active' : ''}" data-size="md" id="fs-md-btn">中</button>
              <button class="font-size-btn ${config.fontSize === 'lg' ? 'active' : ''}" data-size="lg" id="fs-lg-btn">大</button>
              <button class="font-size-btn ${config.fontSize === 'xl' ? 'active' : ''}" data-size="xl" id="fs-xl-btn">超大</button>
            </div>
          </div>
        </section>

        <!-- 账户安全 -->
        <section class="settings-section">
          <div class="settings-section-title-wrap">
            <svg class="settings-sec-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
            <h2 class="settings-section-title">账户安全</h2>
          </div>
          <div class="settings-item" style="flex-direction:column;align-items:flex-start;gap:12px;">
            <div style="display:flex;justify-content:space-between;width:100%;align-items:center;">
              <div class="settings-item-info">
                <span class="settings-item-label">登录密码更改</span>
                <span class="settings-item-desc">定期更改强密码可有效保护个人日记隐私</span>
              </div>
              <div class="settings-item-actions">
                <button class="btn btn-ghost" id="change-pwd-btn">修改密码</button>
              </div>
            </div>
            
            <!-- 就地更改密码面板 (默认隐藏) -->
            <div class="password-panel-wrap" id="pwd-edit-panel" style="display:none;width:100%;">
              <div class="password-edit-card">
                <div class="password-form-grid">
                  <div class="form-group-settings">
                    <label for="edit-old-pwd">当前旧密码</label>
                    <input type="password" class="input-settings" id="edit-old-pwd" placeholder="请输入当前旧密码" />
                  </div>
                  <div class="form-group-settings">
                    <label for="edit-new-pwd">新密码（至少6位）</label>
                    <input type="password" class="input-settings" id="edit-new-pwd" placeholder="请输入新密码" />
                  </div>
                  <div class="form-group-settings">
                    <label for="edit-confirm-pwd">确认新密码</label>
                    <input type="password" class="input-settings" id="edit-confirm-pwd" placeholder="请再次输入新密码" />
                  </div>
                </div>
                <div class="password-actions">
                  <button class="btn btn-ghost btn-sm" id="cancel-pwd-btn">取消</button>
                  <button class="btn btn-primary btn-sm" id="save-pwd-btn">保存新密码</button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- 数据管理 -->
        <section class="settings-section">
          <div class="settings-section-title-wrap">
            <svg class="settings-sec-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
              <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path>
              <path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3"></path>
            </svg>
            <h2 class="settings-section-title">数据管理</h2>
          </div>
          <div class="settings-item">
            <div class="settings-item-info">
              <span class="settings-item-label">云同步</span>
              <span class="settings-item-desc" id="sync-status-desc">状态：${syncStatusText}；上次同步：${lastSyncText}</span>
              ${syncStatus.lastError ? `<span class="settings-item-desc danger-text">错误：${syncStatus.lastError}</span>` : ''}
            </div>
            <button class="btn btn-ghost" id="sync-now-btn" ${syncStatus.isSyncing ? 'disabled' : ''}>立即同步</button>
          </div>
          <div class="settings-item">
            <div class="settings-item-info">
              <span class="settings-item-label">导出数据（JSON备份）</span>
              <span class="settings-item-desc">导出所有日记和配置，可用于备份和恢复，支持按日期过滤</span>
            </div>
            <button class="btn btn-ghost" id="export-json-btn">📥 导出</button>
          </div>
          <div class="settings-item">
            <div class="settings-item-info">
              <span class="settings-item-label">导出为 Markdown</span>
              <span class="settings-item-desc">将日记导出为可读的 Markdown 文件，支持按日期过滤</span>
            </div>
            <button class="btn btn-ghost" id="export-md-btn">📄 导出</button>
          </div>
          <div class="settings-item">
            <div class="settings-item-info">
              <span class="settings-item-label">导入数据</span>
              <span class="settings-item-desc">从 JSON 备份文件恢复数据（支持过滤特定时间段导入）</span>
            </div>
            <label class="btn btn-ghost" for="import-file-input" style="cursor:pointer">📤 导入</label>
            <input type="file" id="import-file-input" accept=".json" style="display:none" />
          </div>
          <div class="settings-item settings-item-danger">
            <div class="settings-item-info">
              <span class="settings-item-label">清空所有数据</span>
              <span class="settings-item-desc danger-text">删除所有日记，此操作不可撤销</span>
            </div>
            <button class="btn btn-danger" id="clear-all-btn">🗑️ 清空</button>
          </div>
        </section>

        <!-- 关于 -->
        <section class="settings-section">
          <div class="settings-section-title-wrap">
            <svg class="settings-sec-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
            <h2 class="settings-section-title">关于</h2>
          </div>
          <div class="about-card">
            <div class="about-logo">📔</div>
            <div class="about-info">
              <p class="about-name">我的日记</p>
              <p class="about-version">版本 1.1.0</p>
              <p class="about-desc">一款简洁、私密的个人日记应用。数据优先保存在本地，登录后可通过云同步在多设备间保持一致。</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  `;

  bindSettingsEvents(mainEl, mainEl);
}

function bindSettingsEvents(container: HTMLElement, mainEl: HTMLElement): void {
  const user = getCurrentUser();
  let tempAvatar = user?.avatar || null;

  // 1. 头像选择逻辑交互
  const profilePanel = container.querySelector('#profile-edit-panel') as HTMLElement;
  const avatarOptions = container.querySelectorAll('#profile-avatar-grid .avatar-option');
  const bannerAvatarWrap = container.querySelector('#banner-avatar-wrap') as HTMLElement;
  const displayNameInput = container.querySelector('#edit-display-name') as HTMLInputElement;
  const usernameInput = container.querySelector('#edit-username') as HTMLInputElement;

  const renderCurrentAvatarPreview = () => {
    const displayName = displayNameInput?.value.trim() || getCurrentUser()?.displayName || '';
    const username = usernameInput?.value.trim() || getCurrentUser()?.username || '';
    const emptyAvatarText = container.querySelector('.avatar-empty-option span') as HTMLElement | null;
    if (emptyAvatarText) {
      emptyAvatarText.textContent = (displayName || username || 'U').charAt(0).toUpperCase();
    }
    if (bannerAvatarWrap) {
      bannerAvatarWrap.innerHTML = `
        ${renderBannerAvatar(tempAvatar, displayName, username)}
        <div class="avatar-edit-overlay">更换头像</div>
      `;
    }
  };
  
  // 初始化已选中状态
  const initAvatarSelection = () => {
    avatarOptions.forEach(opt => {
      opt.classList.remove('active');
      if (opt.id === 'avatar-upload-trigger') return;
      const avatarVal = (opt as HTMLElement).dataset.avatar;
      if ((avatarVal || null) === tempAvatar) {
        opt.classList.add('active');
      }
    });

    const trigger = container.querySelector('#avatar-upload-trigger') as HTMLElement;
    if (tempAvatar && !tempAvatar.startsWith('avatar:')) {
      trigger.style.backgroundImage = `url(${tempAvatar})`;
      trigger.style.backgroundSize = 'cover';
      trigger.style.backgroundPosition = 'center';
      trigger.classList.add('active');
    } else {
      trigger.style.backgroundImage = '';
      trigger.classList.remove('active');
    }
  };

  // 点击预设头像
  avatarOptions.forEach(opt => {
    if (opt.id === 'avatar-upload-trigger') return;
    opt.addEventListener('click', () => {
      avatarOptions.forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
      tempAvatar = (opt as HTMLElement).dataset.avatar || null;
      renderCurrentAvatarPreview();
    });
  });

  // 点击自定义头像上传
  const fileInput = container.querySelector('#avatar-file-input') as HTMLInputElement;
  const uploadTrigger = container.querySelector('#avatar-upload-trigger');
  uploadTrigger?.addEventListener('click', (e) => {
    // 防止触发 grid item 上的其他事件
    e.stopPropagation();
    fileInput.click();
  });

  fileInput?.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('只能上传图片文件', { type: 'error' });
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.src = e.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 120;
        canvas.height = 120;
        const ctx = canvas.getContext('2d')!;

        // 居中裁切成 120x120 像素
        const minSize = Math.min(img.width, img.height);
        const sx = (img.width - minSize) / 2;
        const sy = (img.height - minSize) / 2;
        ctx.drawImage(img, sx, sy, minSize, minSize, 0, 0, 120, 120);

        // 压缩生成 jpeg 格式 Base64
        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
        tempAvatar = compressedDataUrl;

        // 更新 UI 展示
        const trigger = container.querySelector('#avatar-upload-trigger') as HTMLElement;
        trigger.style.backgroundImage = `url(${compressedDataUrl})`;
        trigger.style.backgroundSize = 'cover';
        trigger.style.backgroundPosition = 'center';

        avatarOptions.forEach(o => o.classList.remove('active'));
        trigger.classList.add('active');
        renderCurrentAvatarPreview();
      };
    };
    reader.readAsDataURL(file);
  });

  // 展开和收起修改资料面板
  const editProfileBtn = container.querySelector('#edit-profile-btn');
  const cancelProfileBtn = container.querySelector('#cancel-profile-btn');
  const saveProfileBtn = container.querySelector('#save-profile-btn');
  displayNameInput?.addEventListener('input', () => {
    if (!tempAvatar) renderCurrentAvatarPreview();
  });
  usernameInput?.addEventListener('input', () => {
    if (!tempAvatar) renderCurrentAvatarPreview();
  });

  const toggleProfilePanel = (show: boolean) => {
    if (show) {
      tempAvatar = getCurrentUser()?.avatar || null;
      initAvatarSelection();
      renderCurrentAvatarPreview();
      profilePanel.style.display = 'block';
    } else {
      profilePanel.style.display = 'none';
    }
  };

  editProfileBtn?.addEventListener('click', () => toggleProfilePanel(profilePanel.style.display !== 'block'));
  bannerAvatarWrap?.addEventListener('click', () => toggleProfilePanel(true));
  cancelProfileBtn?.addEventListener('click', () => toggleProfilePanel(false));

  saveProfileBtn?.addEventListener('click', async () => {
    const nextDisplayName = (container.querySelector('#edit-display-name') as HTMLInputElement).value.trim();
    const nextUsername = (container.querySelector('#edit-username') as HTMLInputElement).value.trim().toLowerCase();

    if (!nextDisplayName) {
      showToast('昵称不能为空', { type: 'error' });
      return;
    }
    if (!nextUsername) {
      showToast('用户ID不能为空', { type: 'error' });
      return;
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(nextUsername)) {
      showToast('用户ID仅支持英文字母、数字和下划线/减号', { type: 'error' });
      return;
    }
    if (nextUsername.length < 2 || nextUsername.length > 30) {
      showToast('用户ID长度需在 2 到 30 位之间', { type: 'error' });
      return;
    }

    try {
      await updateProfile({
        displayName: nextDisplayName,
        username: nextUsername,
        avatar: tempAvatar,
      });

      showToast('个人资料保存成功', { type: 'success' });
      
      // 刷新本页以同步欢迎文案和头像
      await renderSettingsPage(mainEl);

      // 刷新顶部导航栏
      const topbarEl = document.getElementById('app-topbar');
      if (topbarEl) {
        renderTopbar(topbarEl);
      }
    } catch (err: any) {
      if (err?.error === 'USERNAME_EXISTS') {
        showToast('该用户ID已被其他账号占用', { type: 'error' });
      } else {
        showToast(err?.message || '个人资料更新失败', { type: 'error' });
      }
    }
  });

  // 2. 主题切换
  container.querySelectorAll('.theme-picker-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const theme = (btn as HTMLElement).dataset.theme as any;
      try {
        await updateConfig('theme', theme);
        
        document.documentElement.dataset.theme = theme;
        const isDark = theme === 'dark';
        document.documentElement.classList.toggle('dark', isDark);
        localStorage.setItem('diary-theme', theme);
        if (!isDark) {
          localStorage.setItem('diary-last-light-theme', theme);
        }
        
        container.querySelectorAll('.theme-picker-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        const icon = document.getElementById('theme-icon');
        if (icon) icon.textContent = isDark ? '☀️' : '🌙';
        
        const themeNames: Record<string, string> = {
          light: '雅致暖米',
          plain: '朴素白',
          green: '清幽森绿',
          blue: '静谧天蓝',
          pink: '温柔樱粉',
          dark: '沉静暗夜'
        };
        showToast(`已切换为「${themeNames[theme] || theme}」主题`, { type: 'success' });
      } catch (error) {
        showToast(error instanceof Error ? error.message : '主题切换失败', { type: 'error' });
      }
    });
  });

  // 3. 字体大小切换
  container.querySelectorAll('.font-size-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const size = (btn as HTMLElement).dataset.size as 'sm' | 'md' | 'lg' | 'xl';
      await updateConfig('fontSize', size);
      localStorage.setItem('diary-font-size', size);
      document.documentElement.dataset.fontSize = size;
      container.querySelectorAll('.font-size-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      showToast('字体大小已更新', { type: 'success' });
    });
  });

  // 4. 就地更改密码交互逻辑
  const changePwdBtn = container.querySelector('#change-pwd-btn');
  const pwdPanel = container.querySelector('#pwd-edit-panel') as HTMLElement;
  const cancelPwdBtn = container.querySelector('#cancel-pwd-btn');
  const savePwdBtn = container.querySelector('#save-pwd-btn');

  const oldPwdInput = container.querySelector('#edit-old-pwd') as HTMLInputElement;
  const newPwdInput = container.querySelector('#edit-new-pwd') as HTMLInputElement;
  const confirmPwdInput = container.querySelector('#edit-confirm-pwd') as HTMLInputElement;

  changePwdBtn?.addEventListener('click', () => {
    if (pwdPanel.style.display === 'block') {
      pwdPanel.style.display = 'none';
    } else {
      oldPwdInput.value = '';
      newPwdInput.value = '';
      confirmPwdInput.value = '';
      pwdPanel.style.display = 'block';
      pwdPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  });

  cancelPwdBtn?.addEventListener('click', () => {
    pwdPanel.style.display = 'none';
  });

  savePwdBtn?.addEventListener('click', async () => {
    const oldPwd = oldPwdInput.value;
    const newPwd = newPwdInput.value;
    const confirmPwd = confirmPwdInput.value;

    if (!oldPwd) {
      showToast('请输入当前旧密码', { type: 'error' });
      return;
    }
    if (newPwd.length < 6) {
      showToast('新密码至少需要 6 位字符', { type: 'error' });
      return;
    }
    if (newPwd !== confirmPwd) {
      showToast('两次输入的新密码不一致', { type: 'error' });
      return;
    }

    try {
      await changePassword(oldPwd, newPwd);
      showToast('密码修改成功', { type: 'success' });
      pwdPanel.style.display = 'none';
      oldPwdInput.value = '';
      newPwdInput.value = '';
      confirmPwdInput.value = '';
    } catch (err: any) {
      showToast(err?.message || '密码修改失败，请检查旧密码是否正确', { type: 'error' });
    }
  });

  // 5. 导出 JSON 支持选择日期
  container.querySelector('#sync-now-btn')?.addEventListener('click', async () => {
    const button = container.querySelector('#sync-now-btn') as HTMLButtonElement | null;
    const desc = container.querySelector('#sync-status-desc') as HTMLElement | null;
    try {
      if (button) {
        button.disabled = true;
        button.textContent = '同步中';
      }
      const next = await syncNow();
      const nextText = next.lastError
        ? '同步失败'
        : next.pendingCount > 0
          ? `待同步 ${next.pendingCount} 条`
          : '已同步';
      if (desc) {
        desc.textContent = `状态：${nextText}；上次同步：${next.lastSyncedAt ? new Date(next.lastSyncedAt).toLocaleString('zh-CN') : '尚未同步'}`;
      }
      showToast(next.lastError ? next.lastError : '云同步完成', { type: next.lastError ? 'error' : 'success' });
    } catch (error) {
      showToast(error instanceof Error ? error.message : '云同步失败', { type: 'error' });
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = '立即同步';
      }
    }
  });

  // 6. 导出 JSON 支持选择日期
  container.querySelector('#export-json-btn')?.addEventListener('click', () => {
    const customId = `export-json-dates-${Math.floor(Math.random() * 1000)}`;
    const startId = `start-${customId}`;
    const endId = `end-${customId}`;

    showModal({
      title: '导出数据（JSON备份）',
      content: `
        <div class="modal-info-box">导出包含所有日记和配置的 JSON 备份包。可用于在其他浏览器中恢复。</div>
        <div class="export-modal-options" id="export-json-options">
          <div class="export-modal-option active" data-range="all">
            <span class="export-modal-option-radio"></span>
            导出全部日记
          </div>
          <div class="export-modal-option" data-range="custom">
            <span class="export-modal-option-radio"></span>
            自定义日期范围
          </div>
          ${getDateRangePickerHtml(customId, startId, endId)}
        </div>
      `,
      confirmText: '确认导出',
      onConfirm: async () => {
        const modalEl = document.querySelector('.modal-overlay') as HTMLElement;
        const activeOption = modalEl.querySelector('.export-modal-option.active') as HTMLElement;
        const range = activeOption?.dataset.range || 'all';

        let startDate: string | undefined;
        let endDate: string | undefined;

        if (range === 'custom') {
          startDate = (modalEl.querySelector(`#${startId}`) as HTMLInputElement).value;
          endDate = (modalEl.querySelector(`#${endId}`) as HTMLInputElement).value;
        }

        try {
          const data = await exportData(startDate, endDate);
          const dateLabel = range === 'all' ? today() : `${startDate}_to_${endDate}`;
          downloadTextFile(data, `diary-backup-${dateLabel}.json`, 'application/json;charset=utf-8');
          showToast('已开始下载备份 JSON 文件', { type: 'success' });
        } catch (err: any) {
          showToast(err?.message || '导出 JSON 失败', { type: 'error' });
        }
      }
    });

    // 绑定导出 Modal 内部事件
    setTimeout(() => {
      bindExportModalInteractions(customId, startId, endId);
    }, 50);
  });

  // 7. 导出 Markdown 支持选择日期
  container.querySelector('#export-md-btn')?.addEventListener('click', () => {
    const customId = `export-md-dates-${Math.floor(Math.random() * 1000)}`;
    const startId = `start-${customId}`;
    const endId = `end-${customId}`;

    showModal({
      title: '导出为 Markdown',
      content: `
        <div class="modal-info-box">将您的日记文章导出为便于阅读和在外部编辑器排版的 Markdown 格式文本。</div>
        <div class="export-modal-options">
          <div class="export-modal-option active" data-range="all">
            <span class="export-modal-option-radio"></span>
            导出全部日记
          </div>
          <div class="export-modal-option" data-range="custom">
            <span class="export-modal-option-radio"></span>
            自定义日期范围
          </div>
          ${getDateRangePickerHtml(customId, startId, endId)}
        </div>
      `,
      confirmText: '确认导出',
      onConfirm: async () => {
        const modalEl = document.querySelector('.modal-overlay') as HTMLElement;
        const activeOption = modalEl.querySelector('.export-modal-option.active') as HTMLElement;
        const range = activeOption?.dataset.range || 'all';

        let startDate: string | undefined;
        let endDate: string | undefined;

        if (range === 'custom') {
          startDate = (modalEl.querySelector(`#${startId}`) as HTMLInputElement).value;
          endDate = (modalEl.querySelector(`#${endId}`) as HTMLInputElement).value;
        }

        try {
          let entries = [];
          if (range === 'all') {
            entries = await getAllEntries();
          } else {
            entries = await filterEntries({ dateFrom: startDate, dateTo: endDate });
          }

          if (entries.length === 0) {
            showToast('选定范围内没有任何日记条目，无法导出', { type: 'error' });
            return;
          }

          await exportAsMarkdown(entries);
          showToast('Markdown 文件下载已开始', { type: 'success' });
        } catch (err: any) {
          showToast(err?.message || '导出 Markdown 失败', { type: 'error' });
        }
      }
    });

    // 绑定 Markdown 导出 Modal 内部事件
    setTimeout(() => {
      bindExportModalInteractions(customId, startId, endId);
    }, 50);
  });

  // 8. 导入 JSON，读取文件并询问是否过滤日期
  container.querySelector('#import-file-input')?.addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const fileContent = event.target?.result as string;
        const backupData = JSON.parse(fileContent);

        if (!backupData || !Array.isArray(backupData.entries)) {
          showToast('备份文件格式不正确（没有包含日记项）', { type: 'error' });
          return;
        }

        const entries = backupData.entries;
        if (entries.length === 0) {
          showToast('该备份文件中不含任何日记', { type: 'error' });
          return;
        }

        // 计算日期跨度
        let minDate = entries[0].dateFor || '2026-01-01';
        let maxDate = entries[0].dateFor || '2026-01-01';

        for (const entry of entries) {
          if (entry.dateFor) {
            if (entry.dateFor < minDate) minDate = entry.dateFor;
            if (entry.dateFor > maxDate) maxDate = entry.dateFor;
          }
        }

        const customId = `import-filter-dates-${Math.floor(Math.random() * 1000)}`;
        const startId = `start-${customId}`;
        const endId = `end-${customId}`;

        showModal({
          title: '导入备份数据',
          content: `
            <div class="modal-info-box">
              检测到该文件含有 <strong>${entries.length}</strong> 篇日记。<br>
              日记时间跨度：<strong>${minDate}</strong> 至 <strong>${maxDate}</strong>。
            </div>
            <div class="export-modal-options">
              <div class="export-modal-option active" data-range="all">
                <span class="export-modal-option-radio"></span>
                全部导入 (共 ${entries.length} 篇)
              </div>
              <div class="export-modal-option" data-range="custom">
                <span class="export-modal-option-radio"></span>
                导入指定日期段的日记
              </div>
              <div class="custom-date-section" id="custom-container-${customId}">
                <div class="date-picker-row">
                  <input type="date" class="input-settings" id="${startId}" value="${minDate}" min="${minDate}" max="${maxDate}" />
                  <span>至</span>
                  <input type="date" class="input-settings" id="${endId}" value="${maxDate}" min="${minDate}" max="${maxDate}" />
                </div>
              </div>
            </div>
          `,
          confirmText: '开始导入',
          onConfirm: async () => {
            const modalEl = document.querySelector('.modal-overlay') as HTMLElement;
            const activeOption = modalEl.querySelector('.export-modal-option.active') as HTMLElement;
            const range = activeOption?.dataset.range || 'all';

            let finalBackup = backupData;

            if (range === 'custom') {
              const startDate = (modalEl.querySelector(`#${startId}`) as HTMLInputElement).value;
              const endDate = (modalEl.querySelector(`#${endId}`) as HTMLInputElement).value;

              // 过滤日记条目
              const filteredEntries = entries.filter((entry: any) => {
                return entry.dateFor && entry.dateFor >= startDate && entry.dateFor <= endDate;
              });

              if (filteredEntries.length === 0) {
                showToast('在选定的日期范围内没有可导入的日记', { type: 'error' });
                return;
              }

              finalBackup = {
                ...backupData,
                entries: filteredEntries
              };
            }

            try {
              const result = await importData(JSON.stringify(finalBackup));
              showToast(`导入成功，共恢复了 ${result.count} 篇日记`, { type: 'success' });
            } catch (err) {
              showToast('导入失败，请检查数据格式', { type: 'error' });
            }
          }
        });

        // 绑定导入 Modal 内部的选项卡事件
        setTimeout(() => {
          const modalEl = document.querySelector('.modal-overlay') as HTMLElement;
          if (!modalEl) return;

          const options = modalEl.querySelectorAll('.export-modal-option');
          const customContainer = modalEl.querySelector(`#custom-container-${customId}`) as HTMLElement;

          options.forEach(opt => {
            opt.addEventListener('click', () => {
              options.forEach(o => o.classList.remove('active'));
              opt.classList.add('active');
              const range = (opt as HTMLElement).dataset.range;
              if (range === 'custom') {
                customContainer.classList.add('active');
              } else {
                customContainer.classList.remove('active');
              }
            });
          });
        }, 50);

      } catch (err) {
        showToast('解析备份文件失败，请确保您选择的是合法的备份 JSON 文件', { type: 'error' });
      }
    };
    reader.readAsText(file);
    // 重置 input 以允许再次选择同名文件
    fileInput.value = '';
  });

  // 9. 清空所有数据
  container.querySelector('#clear-all-btn')?.addEventListener('click', () => {
    showModal({
      title: '⚠️ 清空所有数据',
      content: '此操作将永久删除所有日记，无法恢复！建议先导出备份再清空。确定继续吗？',
      confirmText: '我已了解，确认清空',
      confirmClass: 'btn-danger',
      onConfirm: async () => {
        await clearAllEntries();
        showToast('所有数据已清空', { type: 'success' });
        navigate('list');
      },
    });
  });
}

