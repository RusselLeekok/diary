import type { PageName } from '../types';

type RouteHandler = (params?: Record<string, string>) => void;

// 路由表
const routes: Map<PageName, RouteHandler> = new Map();
const VALID_PAGES = new Set<PageName>(['list', 'editor', 'calendar', 'trash', 'stats', 'settings', 'view']);

// 当前页面
let currentPage: PageName = 'list';

/** 注册路由 */
export function registerRoute(page: PageName, handler: RouteHandler): void {
  routes.set(page, handler);
}

/** 跳转到指定页面 */
export function navigate(page: PageName, params?: Record<string, string>): void {
  // 清理可能残留的图片灯箱
  const activeLightbox = document.querySelector('.image-lightbox') as any;
  if (activeLightbox && typeof activeLightbox.closeLightbox === 'function') {
    activeLightbox.closeLightbox();
  }

  currentPage = page;
  // 更新 hash
  const paramStr = params ? '?' + new URLSearchParams(params).toString() : '';
  const nextHash = `#/${page}${paramStr}`;
  if (window.location.hash === nextHash) {
    render(page, params);
    updateNavHighlight(page);
  } else {
    window.location.hash = nextHash;
  }
}

/** 渲染当前页面 */
function render(page: PageName, params?: Record<string, string>): void {
  const handler = routes.get(page);
  if (!handler) {
    console.warn(`未找到页面路由: ${page}`);
    return;
  }

  const mainEl = document.getElementById('main-content');
  const currentChild = mainEl?.firstElementChild as HTMLElement | null;

  // 如果当前有页面在展示，先播放退出动画再渲染新页面
  if (currentChild && !currentChild.classList.contains('page-exit')) {
    currentChild.classList.add('page-exit');

    let completed = false;
    const done = () => {
      if (completed) return;
      completed = true;
      currentChild.removeEventListener('animationend', done);
      handler(params);
    };

    currentChild.addEventListener('animationend', done);
    // 170ms 兜底，确保退出过渡必定能顺利完成并切页
    setTimeout(done, 170);
  } else {
    handler(params);
  }
}

/** 解析 hash 中的参数 */
function parseHash(): { page: PageName; params: Record<string, string> } {
  const hash = window.location.hash.replace('#/', '');
  const [pagePart, queryPart] = hash.split('?');
  const candidate = (pagePart || 'list') as PageName;
  const page = VALID_PAGES.has(candidate) ? candidate : 'list';
  const params: Record<string, string> = {};
  if (queryPart) {
    new URLSearchParams(queryPart).forEach((v, k) => { params[k] = v; });
  }
  return { page, params };
}

/** 初始化路由（监听 hashchange） */
export function initRouter(): void {
  window.addEventListener('hashchange', () => {
    const { page, params } = parseHash();
    currentPage = page;
    render(page, params);
    updateNavHighlight(page);
  });
  // 初始渲染
  const { page, params } = parseHash();
  currentPage = page;
  render(page, params);
  updateNavHighlight(page);
}

export function getCurrentPage(): PageName { return currentPage; }

/** 更新侧边栏导航高亮 */
function updateNavHighlight(page: PageName): void {
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.remove('active');
    if ((el as HTMLElement).dataset.page === page) {
      el.classList.add('active');
    }
  });
}
