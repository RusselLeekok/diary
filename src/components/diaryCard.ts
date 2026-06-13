import type { DiaryEntry } from '../types';
import { MOOD_CONFIG, WEATHER_CONFIG } from '../types';
import { formatDisplayDate, formatRelativeTime } from '../utils/dateUtils';
import { navigate } from '../router/router';
import { trashEntry } from '../services/databaseService';
import { refreshEntries, getAllTagsList } from '../store/appStore';
import { getCategoryColor } from '../utils/categoryUtils';
import { showModal } from './modal';
import { showToast } from './toast';
import { escapeHtml, sanitizeDiaryContent } from '../utils/htmlUtils';

function extractFirstImageUrl(html: string): string | null {
  const match = html.match(/<img[^>]+src="([^">]+)"/i);
  return match ? match[1] : null;
}

/** 渲染单张日记卡片 HTML */
export function renderDiaryCard(entry: DiaryEntry): string {
  const mood = MOOD_CONFIG[entry.mood] ?? MOOD_CONFIG.none;
  const weather = entry.weather && entry.weather in WEATHER_CONFIG ? WEATHER_CONFIG[entry.weather] : null;

  const weatherBadge = weather && entry.weather !== 'none' ? `
    <span class="card-weather-badge-inline" data-tooltip="${weather.label}" style="background:${weather.color}20;color:${weather.color}">
      ${weather.emoji}
    </span>
  ` : '';

  const moodBadge = entry.mood && entry.mood !== 'none' ? `
    <span class="card-mood-badge-inline" data-tooltip="${mood.label}" style="background:${mood.color}20;color:${mood.color}">
      ${mood.emoji}
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

  const imgUrl = extractFirstImageUrl(sanitizeDiaryContent(entry.content));

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
                ${weatherBadge}
                ${moodBadge}
              </div>
              <span class="card-time">${formatRelativeTime(entry.updatedAt)}</span>
            </div>
          </div>
          ${entry.title ? `<h3 class="card-title">${escapeHtml(entry.title)}</h3>` : ''}
          ${preview ? `<p class="card-preview">${safePreview}${entry.plainText.length > 100 ? '…' : ''}</p>` : ''}
          <div class="card-footer">
            <div class="card-tags">${tags}</div>
            <div class="card-meta">
              <span class="card-wordcount">${Number(entry.wordCount) || 0} 字</span>
              <button class="card-delete-btn" data-id="${safeId}" title="删除此日记" aria-label="删除">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
        <div class="card-image-right">
          <img src="${escapeHtml(imgUrl)}" alt="日记配图" />
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
              ${weatherBadge}
              ${moodBadge}
            </div>
            <span class="card-time">${formatRelativeTime(entry.updatedAt)}</span>
          </div>
        </div>
        ${entry.title ? `<h3 class="card-title">${escapeHtml(entry.title)}</h3>` : ''}
        ${preview ? `<p class="card-preview">${safePreview}${entry.plainText.length > 100 ? '…' : ''}</p>` : ''}
        <div class="card-footer">
          <div class="card-tags">${tags}</div>
          <div class="card-meta">
            <span class="card-wordcount">${Number(entry.wordCount) || 0} 字</span>
            <button class="card-delete-btn" data-id="${safeId}" title="删除此日记" aria-label="删除">
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

/** 绑定日记卡片事件（点击编辑、删除） */
export function bindCardEvents(container: HTMLElement, onDelete?: () => void): void {
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
        onConfirm: async () => {
          await trashEntry(id);
          await refreshEntries();
          showToast('日记已移入垃圾箱', { type: 'success' });
          onDelete?.();
        },
      });
    });
  });
}
