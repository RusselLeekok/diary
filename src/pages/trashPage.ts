import { getTrashedEntries, restoreEntry, deleteEntry, clearTrash } from '../services/databaseService';
import { refreshEntrySummaries, removeEntrySummary, upsertEntrySummary } from '../store/appStore';
import { navigate } from '../router/router';
import { MOOD_CONFIG } from '../types';
import type { DiaryEntry } from '../types';
import { formatDisplayDate } from '../utils/dateUtils';
import { showModal } from '../components/modal';
import { showToast } from '../components/toast';

/**
 * 渲染垃圾箱页面
 */
export async function renderTrashPage(mainEl: HTMLElement): Promise<void> {
  const trashed = await getTrashedEntries();
  buildPage(mainEl, trashed);
}

/**
 * 构建垃圾箱页面 DOM 结构
 */
function buildPage(mainEl: HTMLElement, trashed: DiaryEntry[]): void {
  const count = trashed.length;

  mainEl.innerHTML = `
    <div class="page-trash">
      <!-- 垃圾箱顶栏 -->
      <div class="trash-topbar">
        <div class="trash-title-group">
          <h2 class="trash-title">垃圾箱</h2>
          <span class="trash-count">${count > 0 ? `共 ${count} 篇` : '空空如也'}</span>
        </div>
        <div class="trash-actions">
          ${count > 0 ? `
            <button class="btn btn-ghost trash-clear-btn" id="trash-clear-all" title="物理永久删除所有被删除日记">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              </svg>
              清空垃圾箱
            </button>
          ` : ''}
        </div>
      </div>

      <!-- 可滚动区域 -->
      <div class="trash-scroll">
        <div class="trash-inner">
          ${count === 0 ? `
            <!-- 垃圾箱空状态 -->
            <div class="trash-empty-state">
              <div class="trash-empty-icon">🗑️</div>
              <h3 class="trash-empty-title">垃圾箱是空的</h3>
              <p class="trash-empty-desc">在这里可以找回并恢复误删的日记。<br>日记在被移入垃圾箱后，随时可选择恢复。</p>
              <button class="btn btn-primary trash-go-list" id="trash-back-list">返回日记列表</button>
            </div>
          ` : `
            <!-- 垃圾箱卡片列表 -->
            <div class="trash-list-wrap">
              ${trashed.map(e => renderTrashCard(e)).join('')}
            </div>
          `}
        </div>
      </div>
    </div>
  `;

  bindPageEvents(mainEl, trashed);
}

/**
 * 渲染单篇垃圾日记的横排卡片
 */
function renderTrashCard(entry: DiaryEntry): string {
  const mood = MOOD_CONFIG[entry.mood];
  const dateStr = formatDisplayDate(entry.dateFor);
  const timeStr = entry.timeFor ? ' ' + entry.timeFor : '';
  const textPreview = entry.plainText.slice(0, 160).trim() || '这篇日记没有正文内容。';

  return `
    <article class="trash-card" data-id="${entry.id}">
      <div class="trash-card-body">
        <div class="trash-card-meta">
          ${entry.mood && entry.mood !== 'none' ? `
            <div class="trash-card-mood" style="background:${mood.color}15;color:${mood.color}">
              <span>${mood.emoji}</span>
              <span>${mood.label}</span>
            </div>
          ` : ''}
          <span class="trash-card-date">${dateStr}${timeStr}</span>
        </div>
        <h3 class="trash-card-title">${entry.title || '无标题'}</h3>
        <p class="trash-card-preview">${textPreview}</p>
      </div>
      <div class="trash-card-actions">
        <button class="btn btn-ghost trash-btn-restore" data-id="${entry.id}" title="将该日记移回普通日记列表">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13">
            <polyline points="23 4 23 10 17 10"/>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
          </svg>
          恢复
        </button>
        <button class="btn btn-ghost trash-btn-delete" data-id="${entry.id}" title="从存储中物理永久删除该日记，不可恢复">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
          </svg>
          彻底删除
        </button>
      </div>
    </article>
  `;
}

/**
 * 绑定按钮点击事件
 */
function bindPageEvents(container: HTMLElement, trashed: DiaryEntry[]): void {
  // 返回列表按钮
  container.querySelector('#trash-back-list')?.addEventListener('click', () => {
    navigate('list');
  });

  // 一键清空垃圾箱
  container.querySelector('#trash-clear-all')?.addEventListener('click', () => {
    showModal({
      title: '清空垃圾箱',
      content: '确定要清空垃圾箱吗？其中所有的日记都将被**物理永久删除**，此操作**不可撤销且无法恢复**！',
      confirmText: '永久清空',
      confirmClass: 'btn-danger',
      onConfirm: () => {
        buildPage(container, []);
        showToast('垃圾箱已彻底清空', { type: 'success' });
        void clearTrash().catch(async error => {
          console.error('清空垃圾箱失败:', error);
          showToast(error instanceof Error ? error.message : '清空失败，请稍后再试', { type: 'error' });
          const updated = await getTrashedEntries();
          buildPage(container, updated);
        });
      }
    });
  });

  // 单个日记的恢复与彻底删除
  container.querySelectorAll('.trash-card').forEach(card => {
    const id = (card as HTMLElement).dataset.id!;

    // 恢复日记
    card.querySelector('.trash-btn-restore')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      const entry = trashed.find(item => item.id === id);
      if (entry) {
        upsertEntrySummary({ ...entry, isDeleted: false, updatedAt: new Date().toISOString() });
      }
      removeTrashCard(container, id, trashed);
      showToast('日记已恢复 ✓', { type: 'success' });
      void restoreEntry(id)
        .then(() => refreshEntrySummaries())
        .catch(async error => {
          console.error('恢复日记失败:', error);
          showToast(error instanceof Error ? error.message : '恢复失败，请稍后再试', { type: 'error' });
          await refreshEntrySummaries();
          const updated = await getTrashedEntries();
          buildPage(container, updated);
        });
    });

    // 彻底删除
    card.querySelector('.trash-btn-delete')?.addEventListener('click', (e) => {
      e.stopPropagation();
      showModal({
        title: '永久彻底删除',
        content: '确定要彻底删除这篇日记吗？此操作会将数据从本地存储中彻底抹除，**无法再次找回**。',
        confirmText: '永久删除',
        confirmClass: 'btn-danger',
        onConfirm: () => {
          removeEntrySummary(id);
          removeTrashCard(container, id, trashed);
          showToast('日记已永久删除', { type: 'success' });
          void deleteEntry(id).catch(async error => {
            console.error('永久删除失败:', error);
            showToast(error instanceof Error ? error.message : '删除失败，请稍后再试', { type: 'error' });
            await refreshEntrySummaries();
            const updated = await getTrashedEntries();
            buildPage(container, updated);
          });
        }
      });
    });
  });
}

function removeTrashCard(container: HTMLElement, id: string, trashed: DiaryEntry[]): void {
  const card = Array.from(container.querySelectorAll('.trash-card'))
    .find(item => (item as HTMLElement).dataset.id === id) as HTMLElement | undefined;
  card?.classList.add('is-removing');
  window.setTimeout(() => {
    buildPage(container, trashed.filter(entry => entry.id !== id));
  }, 160);
}
