import type { DiaryEntrySummary } from '../types';
import { MOOD_CONFIG, WEATHER_CONFIG } from '../types';
import { formatDisplayDate, formatRelativeTime } from '../utils/dateUtils';
import { navigate } from '../router/router';
import { trashEntry } from '../services/databaseService';
import { refreshEntrySummaries, getAllTagsList, removeEntrySummary } from '../store/appStore';
import { getToken } from '../store/authStore';
import { getCategoryColor } from '../utils/categoryUtils';
import { showModal } from './modal';
import { showToast } from './toast';
import { escapeHtml } from '../utils/htmlUtils';

/** 渲染单张日记卡片 HTML */
export function renderDiaryCard(entry: DiaryEntrySummary): string {
  const mood = MOOD_CONFIG[entry.mood] ?? MOOD_CONFIG.none;
  const weather = entry.weather && entry.weather in WEATHER_CONFIG ? WEATHER_CONFIG[entry.weather] : null;

  const weatherBadge = weather && entry.weather !== 'none' ? `
    <span class="card-weather-tag" style="--raw-color:${weather.color}">
      <span class="badge-emoji">${weather.emoji}</span>
      <span class="badge-label">${weather.label}</span>
    </span>
  ` : '';

  const moodBadge = entry.mood && entry.mood !== 'none' ? `
    <span class="card-mood-tag" style="--raw-color:${mood.color}">
      <span class="badge-emoji">${mood.emoji}</span>
      <span class="badge-label">${mood.label}</span>
    </span>
  ` : '';

  const locationBadge = entry.location ? `
    <span class="card-location-badge-inline" title="${escapeHtml(entry.location)}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="10" height="10">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
        <circle cx="12" cy="9" r="2.5"/>
      </svg>
      <span>${escapeHtml(entry.location)}</span>
    </span>
  ` : '';

  const allTags = getAllTagsList();
  const tags = entry.tags.slice(0, 3).map(t => {
    const color = getCategoryColor(allTags, t);
    return `<span class="tag-chip"><span class="tag-chip-dot" style="background:${color}"></span>${escapeHtml(t)}</span>`;
  }).join('');
  const preview = entry.plainText.slice(0, 100).replace(/\n/g, ' ');
  const displayTime = entry.timeFor ? ` ${entry.timeFor}` : '';
  const displayDateText = `${formatDisplayDate(entry.dateFor)}${displayTime}`;
  const safeId = escapeHtml(entry.id);
  const safeTitle = escapeHtml(entry.title || '无标题');
  const safePreview = escapeHtml(preview);
  const safeDisplayDateText = escapeHtml(displayDateText);

  const imgUrl = entry.firstImageSrc || '';

  if (imgUrl) {
    // 有配图：左右分栏布局
    return `
      <article class="diary-card has-image" data-id="${safeId}" tabindex="0" role="button"
        aria-label="${safeTitle} - ${safeDisplayDateText}">
        <div class="card-body-left">
          <div class="card-header">
            <div class="card-date">
              <div class="card-header-top-row">
                <span class="card-date-text">${safeDisplayDateText}</span>
                ${locationBadge}
              </div>
              <span class="card-time">${formatRelativeTime(entry.updatedAt)}</span>
            </div>
          </div>
          ${entry.title ? `<h3 class="card-title">${escapeHtml(entry.title)}</h3>` : ''}
          ${preview ? `<p class="card-preview">${safePreview}${entry.plainText.length > 100 ? '…' : ''}</p>` : ''}
          <div class="card-footer">
            <div class="card-tags">${tags}${moodBadge}${weatherBadge}</div>
            <div class="card-meta">
              <span class="card-wordcount">${Number(entry.wordCount) || 0} 字</span>
              <button class="card-delete-btn" data-id="${safeId}" aria-label="删除">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
        <div class="card-image-right">
          ${renderCardImage(imgUrl, entry.updatedAt)}
        </div>
      </article>
    `;
  } else {
    // 无配图：常规纵排布局
    return `
      <article class="diary-card" data-id="${safeId}" tabindex="0" role="button"
        aria-label="${safeTitle} - ${safeDisplayDateText}">
        <div class="card-header">
          <div class="card-date">
            <div class="card-header-top-row">
              <span class="card-date-text">${safeDisplayDateText}</span>
              ${locationBadge}
            </div>
            <span class="card-time">${formatRelativeTime(entry.updatedAt)}</span>
          </div>
        </div>
        ${entry.title ? `<h3 class="card-title">${escapeHtml(entry.title)}</h3>` : ''}
        ${preview ? `<p class="card-preview">${safePreview}${entry.plainText.length > 100 ? '…' : ''}</p>` : ''}
        <div class="card-footer">
          <div class="card-tags">${tags}${moodBadge}${weatherBadge}</div>
          <div class="card-meta">
            <span class="card-wordcount">${Number(entry.wordCount) || 0} 字</span>
            <button class="card-delete-btn" data-id="${safeId}" aria-label="删除">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
              </svg>
            </button>
          </div>
        </div>
      </article>
    `;
  }
}

const AUTH_IMAGE_MEMORY_LIMIT = 120;
const AUTH_IMAGE_STORAGE_LIMIT = 40;
const AUTH_IMAGE_STORAGE_MAX_CHARS = 700_000;
const AUTH_IMAGE_STORAGE_KEY = 'diary-card-auth-image-cache-v1';

interface AuthImageMemoryItem {
  src: string;
  lastUsed: number;
  promise?: Promise<string>;
}

interface AuthImageStoredItem {
  dataUrl: string;
  lastUsed: number;
}

const authImageMemoryCache = new Map<string, AuthImageMemoryItem>();
let authImageStorageCache: Record<string, AuthImageStoredItem> | null = null;

export function renderCardImage(src: string, version?: string): string {
  const imageSrc = withImageVersion(src, version);
  const safeSrc = escapeHtml(imageSrc);
  if (shouldFetchImageWithAuth(imageSrc)) {
    const cachedSrc = getCachedAuthImageSrc(imageSrc);
    if (cachedSrc) {
      return `<img src="${escapeHtml(cachedSrc)}" data-auth-src="${safeSrc}" alt="日记配图" loading="lazy" decoding="async" />`;
    }
    return `<img data-auth-src="${safeSrc}" alt="日记配图" loading="lazy" decoding="async" />`;
  }
  return `<img src="${safeSrc}" alt="日记配图" loading="lazy" decoding="async" />`;
}

function shouldFetchImageWithAuth(src: string): boolean {
  return /\/api\/v1\/(?:trash\/)?entries\/[^/]+\/first-image(?:$|[?#])/i.test(src);
}

function withImageVersion(src: string, version?: string): string {
  if (!version || !shouldFetchImageWithAuth(src)) return src;

  try {
    const url = new URL(src, window.location.origin);
    url.searchParams.set('v', version);
    return src.startsWith('http') ? url.href : `${url.pathname}${url.search}${url.hash}`;
  } catch {
    const separator = src.includes('?') ? '&' : '?';
    return `${src}${separator}v=${encodeURIComponent(version)}`;
  }
}

/** 绑定日记卡片事件（点击编辑、删除） */
export function bindCardEvents(container: HTMLElement, onDelete?: (id: string) => void): void {
  bindCardImagePreviews(container);

  container.querySelectorAll('.diary-card').forEach(card => {
    const id = (card as HTMLElement).dataset.id!;

    // 点击卡片进入阅读页面
    card.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('.card-delete-btn')) return;
      
      const scrollEl = document.getElementById('list-content');
      if (scrollEl) {
        sessionStorage.setItem('list-scroll-top', String(scrollEl.scrollTop));
      }
      
      navigate('view', { id });
    });

    // 键盘支持
    card.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') {
        const scrollEl = document.getElementById('list-content');
        if (scrollEl) {
          sessionStorage.setItem('list-scroll-top', String(scrollEl.scrollTop));
        }
        navigate('view', { id });
      }
    });
  });

  // 删除按钮
  container.querySelectorAll('.card-delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = (btn as HTMLElement).dataset.id!;
      showModal({
        title: '删除日记',
        content: '确定要将这篇日记移入垃圾箱吗？您可以在垃圾箱中找回它。',
        confirmText: '移入垃圾箱',
        confirmClass: 'btn-danger',
        onConfirm: () => {
          const card = (btn as HTMLElement).closest('.diary-card') as HTMLElement | null;
          card?.classList.add('is-removing');
          removeEntrySummary(id);
          window.setTimeout(() => onDelete?.(id), 160);
          showToast('日记已移入垃圾箱', { type: 'success' });
          void trashEntry(id).catch(async error => {
            console.error('移入垃圾箱失败:', error);
            showToast(error instanceof Error ? error.message : '删除失败，请稍后再试', { type: 'error' });
            await refreshEntrySummaries();
            onDelete?.(id);
          });
        },
      });
    });
  });
}

export function bindCardImagePreviews(container: HTMLElement): void {
  container.querySelectorAll<HTMLImageElement>('img[data-auth-src]').forEach(img => {
    const src = img.dataset.authSrc;
    if (!src) return;
    if (img.dataset.loadingAuthImage === 'true') return;

    const cachedSrc = getCachedAuthImageSrc(src);
    if (cachedSrc) {
      if (img.src !== cachedSrc) img.src = cachedSrc;
      img.classList.remove('is-loading', 'is-error');
      return;
    }
    if (img.src) return;

    img.dataset.loadingAuthImage = 'true';
    img.classList.add('is-loading');

    getAuthorizedImagePreview(src)
      .then(imageSrc => {
        img.src = imageSrc;
        img.classList.remove('is-loading');
      })
      .catch(error => {
        console.warn('日记预览图加载失败:', error);
        img.classList.remove('is-loading');
        img.classList.add('is-error');
        img.removeAttribute('alt');
      })
      .finally(() => {
        delete img.dataset.loadingAuthImage;
      });
  });
}

function getCachedAuthImageSrc(src: string): string | null {
  const memoryItem = authImageMemoryCache.get(src);
  if (memoryItem?.src) {
    memoryItem.lastUsed = Date.now();
    return memoryItem.src;
  }

  const storedItem = getAuthImageStorageCache()[src];
  if (storedItem?.dataUrl) {
    storedItem.lastUsed = Date.now();
    authImageMemoryCache.set(src, {
      src: storedItem.dataUrl,
      lastUsed: storedItem.lastUsed,
    });
    persistAuthImageStorageCache();
    return storedItem.dataUrl;
  }

  return null;
}

function getAuthorizedImagePreview(src: string): Promise<string> {
  const cachedSrc = getCachedAuthImageSrc(src);
  if (cachedSrc) return Promise.resolve(cachedSrc);

  const pending = authImageMemoryCache.get(src)?.promise;
  if (pending) return pending;

  const promise = fetchAuthorizedImage(src)
    .then(async ({ blob, objectUrl }) => {
      authImageMemoryCache.set(src, {
        src: objectUrl,
        lastUsed: Date.now(),
      });
      trimAuthImageMemoryCache();

      if (blob.size * 1.4 <= AUTH_IMAGE_STORAGE_MAX_CHARS) {
        try {
          const dataUrl = await blobToDataUrl(blob);
          rememberStoredAuthImage(src, dataUrl);
        } catch (error) {
          console.warn('保存日记预览图缓存失败:', error);
        }
      }

      return objectUrl;
    })
    .catch(error => {
      authImageMemoryCache.delete(src);
      throw error;
    });

  authImageMemoryCache.set(src, {
    src: '',
    promise,
    lastUsed: Date.now(),
  });
  return promise;
}

async function fetchAuthorizedImage(src: string): Promise<{ blob: Blob; objectUrl: string }> {
  const headers = new Headers();
  const token = getToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(src, {
    headers,
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error(`图片请求失败：${response.status}`);
  }

  const blob = await response.blob();
  return {
    blob,
    objectUrl: URL.createObjectURL(blob),
  };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result ?? '')));
    reader.addEventListener('error', () => reject(reader.error ?? new Error('Failed to read image blob')));
    reader.readAsDataURL(blob);
  });
}

function getAuthImageStorageCache(): Record<string, AuthImageStoredItem> {
  if (authImageStorageCache) return authImageStorageCache;

  try {
    const raw = sessionStorage.getItem(AUTH_IMAGE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    authImageStorageCache = parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    authImageStorageCache = {};
  }

  return authImageStorageCache ?? {};
}

function rememberStoredAuthImage(src: string, dataUrl: string): void {
  const cache = getAuthImageStorageCache();
  cache[src] = { dataUrl, lastUsed: Date.now() };

  const entries = Object.entries(cache)
    .sort(([, a], [, b]) => b.lastUsed - a.lastUsed);
  for (const [key] of entries.slice(AUTH_IMAGE_STORAGE_LIMIT)) {
    delete cache[key];
  }

  persistAuthImageStorageCache();
}

function persistAuthImageStorageCache(): void {
  if (!authImageStorageCache) return;

  try {
    sessionStorage.setItem(AUTH_IMAGE_STORAGE_KEY, JSON.stringify(authImageStorageCache));
  } catch {
    const entries = Object.entries(authImageStorageCache)
      .sort(([, a], [, b]) => b.lastUsed - a.lastUsed);
    authImageStorageCache = Object.fromEntries(entries.slice(0, Math.max(8, Math.floor(entries.length / 2))));
    try {
      sessionStorage.setItem(AUTH_IMAGE_STORAGE_KEY, JSON.stringify(authImageStorageCache));
    } catch {
      sessionStorage.removeItem(AUTH_IMAGE_STORAGE_KEY);
      authImageStorageCache = {};
    }
  }
}

function trimAuthImageMemoryCache(): void {
  if (authImageMemoryCache.size <= AUTH_IMAGE_MEMORY_LIMIT) return;

  const entries = Array.from(authImageMemoryCache.entries())
    .sort(([, a], [, b]) => a.lastUsed - b.lastUsed);
  for (const [key, item] of entries.slice(0, authImageMemoryCache.size - AUTH_IMAGE_MEMORY_LIMIT)) {
    if (item.src.startsWith('blob:')) URL.revokeObjectURL(item.src);
    authImageMemoryCache.delete(key);
  }
}
