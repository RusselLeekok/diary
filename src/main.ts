import './style.css';
import 'quill/dist/quill.snow.css';
import { initStore, getAppConfig } from './store/appStore';
import { renderTopbar } from './components/sidebar';
import { registerRoute, initRouter } from './router/router';
import { renderListPage } from './pages/listPage';
import { renderEditorPage } from './pages/editorPage';
import { renderCalendarPage } from './pages/calendarPage';
import { renderStatsPage } from './pages/statsPage';
import { renderSettingsPage } from './pages/settingsPage';
import { renderViewPage } from './pages/viewPage';
import { renderTrashPage } from './pages/trashPage';
import { escapeHtml } from './utils/htmlUtils';

const THEME_VALUES = new Set(['light', 'dark', 'green', 'blue', 'pink', 'plain']);

function getInitialTheme(): string {
  const storedTheme = localStorage.getItem('diary-theme');
  if (storedTheme && THEME_VALUES.has(storedTheme)) return storedTheme;
  return getAppConfig().theme;
}

/** 应用入口 */
async function bootstrap(): Promise<void> {
  // 初始化状态
  await initStore();

  // 应用已保存的主题
  const savedTheme = getInitialTheme();
  document.documentElement.dataset.theme = savedTheme;
  localStorage.setItem('diary-theme', savedTheme);
  if (savedTheme !== 'dark') {
    localStorage.setItem('diary-last-light-theme', savedTheme);
  }
  if (savedTheme === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }

  // 应用字体大小
  document.documentElement.dataset.fontSize = getAppConfig().fontSize;

  // 构建永久固定的骨架结构（顶部导航 + 内容包裹层）
  // 内容包裹层(.app-main-wrap)固定不变，只替换内部的 #main-content
  document.getElementById('app')!.innerHTML = `
    <div class="app-layout">
      <div id="app-topbar"></div>
      <div class="app-main">
        <div class="app-main-wrap">
          <div id="main-content" role="main" aria-live="polite"></div>
        </div>
      </div>
    </div>
  `;

  // 渲染顶部导航
  renderTopbar(document.getElementById('app-topbar')!);

  // 获取主内容区域
  const mainEl = document.getElementById('main-content')!;

  // 注册路由
  registerRoute('list',     (_p) => renderListPage(mainEl));
  registerRoute('editor',   (p)  => renderEditorPage(mainEl, p));
  registerRoute('calendar', (_p) => renderCalendarPage(mainEl));
  registerRoute('trash',    (_p) => renderTrashPage(mainEl));
  registerRoute('stats',    (_p) => renderStatsPage(mainEl));
  registerRoute('settings', (_p) => renderSettingsPage(mainEl));
  registerRoute('view',     (p)  => renderViewPage(mainEl, p));

  // 启动路由
  initRouter();
}

bootstrap().catch(err => {
  console.error('应用启动失败:', err);
  document.getElementById('app')!.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#666">
      <div style="text-align:center">
        <div style="font-size:3rem;margin-bottom:1rem">😵</div>
        <h2>应用加载失败</h2>
        <p>请刷新页面重试</p>
        <pre style="font-size:12px;color:#999;margin-top:1rem">${escapeHtml(err?.message || '')}</pre>
      </div>
    </div>
  `;
});
