import { getCurrentPage, navigate } from '../router/router';
import type { PageName } from '../types';
import { getAppConfig, updateConfig } from '../store/appStore';
import { getCurrentUser, logout } from '../store/authStore';
import { showToast } from './toast';
import { clearListFilters } from '../pages/listPage';

// 导航项配置
const NAV_ITEMS: { page: PageName; icon: string; label: string }[] = [
  {
    page: 'list',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
      <polyline points="10 9 9 9 8 9"/>
    </svg>`,
    label: '日记',
  },
  {
    page: 'trash',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
      <line x1="10" y1="11" x2="10" y2="17"/>
      <line x1="14" y1="11" x2="14" y2="17"/>
    </svg>`,
    label: '垃圾箱',
  },
  {
    page: 'stats',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
    </svg>`,
    label: '统计',
  },
  {
    page: 'settings',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.85a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.85a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33 1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.85a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82 1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.85a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>`,
    label: '设置',
  },
];

/** 渲染顶部导航栏 */
export function renderTopbar(container: HTMLElement): void {
  const isDark = getAppConfig().theme === 'dark' ||
    document.documentElement.classList.contains('dark');
  const activePage = getCurrentPage();
  const user = getCurrentUser();

  const userHtml = user
    ? `
      <div class="topbar-user-menu" id="topbar-user-menu">
        <button class="topbar-user-btn" aria-label="用户菜单" aria-haspopup="true">
          <div class="user-avatar">${(user.displayName || user.username || 'U').charAt(0).toUpperCase()}</div>
          <span class="user-name">${user.displayName || user.username}</span>
        </button>
        <div class="user-dropdown-menu" role="menu">
          <button class="user-dropdown-item" id="user-menu-settings">
            ⚙️ 账户设置
          </button>
          <button class="user-dropdown-item dropdown-danger" id="user-menu-logout">
            🚪 退出登录
          </button>
        </div>
      </div>
    `
    : '';

  container.innerHTML = `
    <header class="app-topbar" role="banner">
      <!-- 左侧 Logo -->
      <div class="topbar-brand">
        <span class="brand-icon">📔</span>
        <span class="brand-name">日记</span>
        <button class="topbar-brand-hitbox" id="topbar-brand-hitbox" type="button" aria-label="打开应用介绍"></button>
      </div>

      <!-- 中间导航 -->
      <nav class="topbar-nav" role="navigation" aria-label="主导航">
        ${NAV_ITEMS.map(item => `
          <button class="nav-item ${item.page === activePage ? 'active' : ''}" data-page="${item.page}" aria-label="${item.label}">
            <span class="nav-icon">${item.icon}</span>
            <span class="nav-label">${item.label}</span>
          </button>
        `).join('')}
      </nav>

      <!-- 右侧操作区 -->
      <div class="topbar-actions">
        ${userHtml}
        <button class="theme-toggle-btn" id="theme-toggle" aria-label="切换深色/浅色主题">
          <span id="theme-icon">${isDark ? '☀️' : '🌙'}</span>
        </button>
        <button class="btn-new-entry" id="btn-new-entry" aria-label="新建日记">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="15" height="15">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          新建日记
        </button>
      </div>
    </header>
  `;

  // 绑定导航事件
  container.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const page = (btn as HTMLElement).dataset.page as PageName;
      if (page === 'list') {
        sessionStorage.removeItem('list-scroll-top');
        sessionStorage.removeItem('list-visible-entry-count');
        clearListFilters();
      }
      navigate(page);
    });
  });

  // 新建日记
  container.querySelector('#btn-new-entry')!.addEventListener('click', () => {
    navigate('editor');
  });

  // 左上角品牌区隐藏入口
  container.querySelector('#topbar-brand-hitbox')?.addEventListener('click', () => {
    navigate('intro');
  });

  // 主题切换
  container.querySelector('#theme-toggle')!.addEventListener('click', () => {
    toggleTheme();
  });

  // 用户菜单交互
  const userMenu = container.querySelector('#topbar-user-menu');
  const userBtn = container.querySelector('.topbar-user-btn');
  if (userMenu && userBtn) {
    userBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      userMenu.classList.toggle('active');
    });

    document.addEventListener('click', () => {
      userMenu.classList.remove('active');
    });
  }

  // 账户安全跳转
  const btnSettings = container.querySelector('#user-menu-settings');
  if (btnSettings) {
    btnSettings.addEventListener('click', () => {
      navigate('settings');
    });
  }

  // 退出登录
  const btnLogout = container.querySelector('#user-menu-logout');
  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      if (confirm('确认要退出登录吗？')) {
        logout();
      }
    });
  }
}

/** 切换主题 */
async function toggleTheme(): Promise<void> {
  const currentTheme = document.documentElement.dataset.theme || getAppConfig().theme || 'light';
  // 若当前是 dark 模式，切回上一次使用的浅色配色；若不是，则切为 dark
  const nextTheme = currentTheme === 'dark'
    ? (localStorage.getItem('diary-last-light-theme') || 'light') as any
    : 'dark';

  try {
    await updateConfig('theme', nextTheme);

    if (currentTheme !== 'dark') {
      localStorage.setItem('diary-last-light-theme', currentTheme);
    }

    localStorage.setItem('diary-theme', nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    const isDark = nextTheme === 'dark';
    document.documentElement.classList.toggle('dark', isDark);

    const icon = document.getElementById('theme-icon');
    if (icon) icon.textContent = isDark ? '☀️' : '🌙';

    // 如果当前就在设置页面，同步刷新按钮的 active 状态
    const activeBtn = document.querySelector(`.theme-picker-btn[data-theme="${nextTheme}"]`);
    if (activeBtn) {
      document.querySelectorAll('.theme-picker-btn').forEach(b => b.classList.remove('active'));
      activeBtn.classList.add('active');
    }
  } catch (error) {
    showToast(error instanceof Error ? error.message : '主题切换失败', { type: 'error' });
  }
}
