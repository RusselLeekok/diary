import { trashEntry } from '../services/databaseService';
import { removeEntrySummary, refreshEntrySummaries, getFullEntryById, getAllTagsList } from '../store/appStore';
import { navigate } from '../router/router';
import { getFilteredEntries } from './listPage';

let viewPageKeyDownHandler: ((e: KeyboardEvent) => void) | null = null;
import { MOOD_CONFIG, WEATHER_CONFIG } from '../types';
import { formatDisplayDate, formatRelativeTime } from '../utils/dateUtils';
import { getCategoryColor, UNCATEGORIZED_COLOR } from '../utils/categoryUtils';
import { showModal } from '../components/modal';
import { showToast } from '../components/toast';
import { escapeHtml, sanitizeDiaryContent } from '../utils/htmlUtils';

/**
 * 渲染阅读日记页面
 * 布局：顶部操作栏固定（含返回/删除/编辑），下方内容区独立滚动
 * 页框大小与编辑器/列表页完全统一，不会动态扩缩
 */
export async function renderViewPage(mainEl: HTMLElement, params?: Record<string, string>): Promise<void> {
  const id = params?.id || '';

  const renderError = (msg = '未找到该日记') => {
    mainEl.innerHTML = `
      <div class="page-view">
        <div class="view-topbar">
          <button class="btn btn-ghost view-back" id="view-back-err">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            返回列表
          </button>
        </div>
        <div class="view-scroll">
          <div class="view-inner">
            <div class="view-error-state">
              <span style="font-size: 2.5rem; display: block; margin-bottom: 8px;">🔍</span>
              <h3>${escapeHtml(msg)}</h3>
              <button class="btn btn-primary" id="view-back-list">返回列表</button>
            </div>
          </div>
        </div>
      </div>
    `;
    mainEl.querySelector('#view-back-err')?.addEventListener('click', () => navigate('list'));
    mainEl.querySelector('#view-back-list')?.addEventListener('click', () => navigate('list'));
  };

  if (viewPageKeyDownHandler) {
    document.removeEventListener('keydown', viewPageKeyDownHandler);
    viewPageKeyDownHandler = null;
  }

  if (!id) { renderError(); return; }

  const entry = await getFullEntryById(id);
  if (!isCurrentView(id)) return;
  if (!entry) { renderError(); return; }

  const allEntries = getFilteredEntries();
  const currentIndex = allEntries.findIndex(e => e.id === id);
  const prevEntry = currentIndex > 0 ? allEntries[currentIndex - 1] : null;
  const nextEntry = currentIndex !== -1 && currentIndex < allEntries.length - 1 ? allEntries[currentIndex + 1] : null;

  const mood = MOOD_CONFIG[entry.mood] ?? MOOD_CONFIG.none;
  const weather = entry.weather && entry.weather in WEATHER_CONFIG ? WEATHER_CONFIG[entry.weather] : null;
  const currentCategory = entry.tags[0] ?? '';
  const allTags = getAllTagsList();
  const catColor = currentCategory ? getCategoryColor(allTags, currentCategory) : UNCATEGORIZED_COLOR;
  const safeTitle = escapeHtml(entry.title || '无标题');
  const safeDateText = escapeHtml(`${formatDisplayDate(entry.dateFor)}${entry.timeFor ? ' ' + entry.timeFor : ''}`);
  const safeCategory = escapeHtml(currentCategory || '未分类');
  const safeContent = entry.content
    ? sanitizeDiaryContent(entry.content)
    : '<p style="color:var(--text-muted);font-style:italic">这篇日记没有正文内容。</p>';

  mainEl.innerHTML = `
    <div class="page-view" style="position: relative;">

      <!-- ★ 顶部固定操作栏（与编辑器顶栏同款） -->
      <div class="view-topbar">
        <button class="btn btn-ghost view-back" id="view-back">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          返回列表
        </button>
        <div class="view-actions">
          <button class="btn btn-ghost view-action-btn view-delete" id="view-trash">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
            </svg>
            删除
          </button>
          <button class="btn btn-primary view-action-btn" id="view-edit">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            编辑日记
          </button>
        </div>
      </div>

      <!-- 页面切换按钮容器（限定 max-width 并居中，防止按钮在大屏下偏移过远） -->
      <div class="view-nav-container">
        <!-- 上一篇 (Newer) 按钮 -->
        ${prevEntry ? `
          <button class="view-nav-btn view-nav-prev" id="view-prev" title="上一篇：${escapeHtml(prevEntry.title || '无标题')}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="20" height="20">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
        ` : ''}

        <!-- 下一篇 (Older) 按钮 -->
        ${nextEntry ? `
          <button class="view-nav-btn view-nav-next" id="view-next" title="下一篇：${escapeHtml(nextEntry.title || '无标题')}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="20" height="20">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        ` : ''}
      </div>

      <!-- ★ 下方独立滚动区 -->
      <div class="view-scroll">
        <div class="view-inner">

          <!-- 日记主体卡片 -->
          <article class="view-card">
            <header class="view-header">
              <h1 class="view-title">${safeTitle}</h1>
              <div class="view-meta">
                <div class="view-meta-item">
                  <span class="view-meta-icon">📅</span>
                  <span>${safeDateText}</span>
                </div>
                <div class="view-meta-item">
                  <span class="view-meta-icon">⏱️</span>
                  <span>${formatRelativeTime(entry.updatedAt)}修改</span>
                </div>
                <div class="view-meta-item">
                  <span class="view-meta-icon">✍️</span>
                  <span>${Number(entry.wordCount) || 0} 字</span>
                </div>
              </div>
              <div class="view-status-row">
                ${entry.mood && entry.mood !== 'none' ? `
                  <div class="view-mood-tag" style="background:${mood.color}15;color:${mood.color}">
                    <span>${mood.emoji}</span>
                    <span>${mood.label}</span>
                  </div>
                ` : ''}
                ${weather && entry.weather !== 'none' ? `
                  <div class="view-weather-tag" style="background:${weather.color}15;color:${weather.color}">
                    <span>${weather.emoji}</span>
                    <span>${weather.label}</span>
                  </div>
                ` : ''}
                ${entry.location ? `
                  <div class="view-location-tag">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
                      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
                      <circle cx="12" cy="9" r="2.5"/>
                    </svg>
                    <span>${escapeHtml(entry.location)}</span>
                  </div>
                ` : ''}
                <div class="view-cat-tag">
                  <span class="view-cat-dot" style="background:${catColor}"></span>
                  <span>${safeCategory}</span>
                </div>
              </div>
            </header>

            <div class="view-divider"></div>

            <!-- 正文（继承 Quill 富文本排版样式） -->
            <div class="view-content ql-editor">${safeContent}</div>
          </article>

        </div>
      </div>

    </div>
  `;

  const cleanup = () => {
    if (viewPageKeyDownHandler) {
      document.removeEventListener('keydown', viewPageKeyDownHandler);
      viewPageKeyDownHandler = null;
    }
  };

  const onBack = () => {
    cleanup();
    navigate('list');
  };

  mainEl.querySelector('#view-back')?.addEventListener('click', onBack);

  mainEl.querySelector('#view-edit')?.addEventListener('click', () => {
    cleanup();
    navigate('editor', { id });
  });

  mainEl.querySelector('#view-trash')?.addEventListener('click', () => {
    showModal({
      title: '移入垃圾箱',
      content: '确定要将这篇日记移入垃圾箱吗？您可以在垃圾箱中找回它。',
      confirmText: '移入垃圾箱',
      confirmClass: 'btn-danger',
      onConfirm: () => {
        cleanup();
        removeEntrySummary(id);
        showToast('日记已移入垃圾箱', { type: 'success' });
        navigate('list');
        void trashEntry(id).catch(async error => {
          console.error('移入垃圾箱失败:', error);
          showToast(error instanceof Error ? error.message : '删除失败，请稍后再试', { type: 'error' });
          await refreshEntrySummaries();
        });
      },
    });
  });

  if (prevEntry) {
    mainEl.querySelector('#view-prev')?.addEventListener('click', () => {
      cleanup();
      navigate('view', { id: prevEntry.id });
    });
  }

  if (nextEntry) {
    mainEl.querySelector('#view-next')?.addEventListener('click', () => {
      cleanup();
      navigate('view', { id: nextEntry.id });
    });
  }

  // Keyboard navigation
  viewPageKeyDownHandler = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

    if (e.key === 'ArrowLeft' && prevEntry) {
      cleanup();
      navigate('view', { id: prevEntry.id });
    } else if (e.key === 'ArrowRight' && nextEntry) {
      cleanup();
      navigate('view', { id: nextEntry.id });
    }
  };
  document.addEventListener('keydown', viewPageKeyDownHandler);

  // 绑定图片点击大图预览 (Lightbox)
  const images = mainEl.querySelectorAll('.view-content img');
  images.forEach(img => {
    (img as HTMLElement).style.cursor = 'zoom-in';
    img.addEventListener('click', (e) => {
      e.stopPropagation();
      showImageLightbox((img as HTMLImageElement).src);
    });
  });
}

function isCurrentView(id: string): boolean {
  if (!window.location.hash.startsWith('#/view')) return false;
  const queryPart = window.location.hash.split('?')[1] || '';
  return new URLSearchParams(queryPart).get('id') === id;
}

/** 显示大图灯箱预览 */
function showImageLightbox(src: string): void {
  // 检查是否已有灯箱，如果有则先移除
  document.querySelector('.image-lightbox')?.remove();

  const lightbox = document.createElement('div');
  lightbox.className = 'image-lightbox';
  lightbox.innerHTML = `
    <div class="lightbox-overlay"></div>
    <div class="lightbox-content">
      <img src="${escapeHtml(src)}" class="lightbox-image" alt="大图预览" />
      <button class="lightbox-close-btn" title="关闭">✕</button>
    </div>
  `;

  document.body.appendChild(lightbox);

  // 强制重绘以触发入场动画
  lightbox.getBoundingClientRect();
  lightbox.classList.add('active');

  const closeLightbox = () => {
    lightbox.classList.remove('active');
    lightbox.classList.add('fade-out');
    // 渐隐动画结束后移除
    setTimeout(() => {
      lightbox.remove();
    }, 220);
    document.removeEventListener('keydown', handleEsc);
  };

  // 挂载关闭句柄到 DOM 节点上，以便路由跳转时自动清理
  (lightbox as any).closeLightbox = closeLightbox;

  const handleEsc = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeLightbox();
    }
  };

  // 绑定事件
  lightbox.querySelector('.lightbox-overlay')?.addEventListener('click', closeLightbox);
  lightbox.querySelector('.lightbox-close-btn')?.addEventListener('click', closeLightbox);
  lightbox.querySelector('.lightbox-image')?.addEventListener('click', closeLightbox); // 点击图片也可关闭
  document.addEventListener('keydown', handleEsc);
}

