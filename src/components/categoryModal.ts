import { getAppConfig, addCategory, renameCategory, deleteCategory } from '../store/appStore';
import { getCategoryColor } from '../utils/categoryUtils';
import { showModal } from './modal';
import { showToast } from './toast';
import { escapeHtml } from '../utils/htmlUtils';

/**
 * 弹出“管理分类”对话框
 * @param onChanged 标签发生改变时的回调（关闭弹窗时触发）
 */
export function showCategoryModal(onChanged?: () => void): void {
  // 移除旧的模态框
  document.querySelector('.cat-modal-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay cat-modal-overlay';
  overlay.innerHTML = `
    <div class="modal-box cat-modal-box" role="dialog" aria-modal="true">
      <div class="cat-modal-header">
        <h3 class="modal-title">管理分类</h3>
        <button class="cat-modal-x" aria-label="关闭">&times;</button>
      </div>
      <div class="cat-modal-body">
        <div class="cat-modal-list" id="cat-modal-list">
          <!-- 动态渲染分类 -->
        </div>
      </div>
      <div class="cat-modal-footer">
        <div class="cat-modal-add-row">
          <input type="text" class="modal-input cat-modal-new-input" placeholder="新增分类名称..." autocomplete="off" />
          <button class="btn btn-primary cat-modal-add-btn">添加</button>
        </div>
        <div class="cat-modal-actions">
          <button class="btn btn-ghost cat-modal-close-btn" style="width: 100%">完成</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // 渲染函数
  const renderList = () => {
    const listEl = overlay.querySelector('#cat-modal-list');
    if (!listEl) return;

    const categories = getAppConfig().categories || [];
    if (categories.length === 0) {
      listEl.innerHTML = `
        <div class="cat-modal-empty">
          <span style="font-size: 1.5rem; display: block; margin-bottom: 4px;">🏷️</span>
          <span>暂无自定义分类</span>
        </div>
      `;
      return;
    }

    listEl.innerHTML = categories.map(c => {
      const color = getCategoryColor(categories, c);
      const safeName = escapeHtml(c);
      return `
        <div class="cat-modal-item">
          <span class="cat-modal-dot" style="background: ${color}"></span>
          <input type="text" class="cat-modal-item-input" value="${safeName}" data-old="${safeName}" title="双击或修改进行重命名" />
          <button class="cat-modal-item-del" data-cat="${safeName}" title="删除此分类">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              <line x1="10" y1="11" x2="10" y2="17"/>
              <line x1="14" y1="11" x2="14" y2="17"/>
            </svg>
          </button>
        </div>
      `;
    }).join('');

    // 绑定列表中每一行的事件
    bindListEvents();
  };

  const bindListEvents = () => {
    // 重命名逻辑
    const inputs = overlay.querySelectorAll('.cat-modal-item-input');
    inputs.forEach(inputEl => {
      const input = inputEl as HTMLInputElement;
      const oldVal = input.dataset.old || '';

      const handleRename = async () => {
        const newVal = input.value.trim();
        if (newVal === oldVal) return;
        if (!newVal) {
          input.value = oldVal;
          return;
        }

        const categories = getAppConfig().categories || [];
        if (categories.includes(newVal)) {
          alert(`分类「${newVal}」已存在`);
          input.value = oldVal;
          return;
        }

        await renameCategory(oldVal, newVal);
        renderList();
      };

      input.addEventListener('blur', handleRename);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          input.blur();
        }
      });
    });

    // 删除逻辑
    const delBtns = overlay.querySelectorAll('.cat-modal-item-del');
    delBtns.forEach(btnEl => {
      const btn = btnEl as HTMLButtonElement;
      const catName = btn.dataset.cat || '';

      btn.addEventListener('click', () => {
        showModal({
          title: '删除分类',
          content: `确定要删除分类「${escapeHtml(catName)}」吗？<br><small style="color: var(--text-muted)">这不会删除该分类下的日记，日记将被归入“未分类”中。</small>`,
          confirmText: '确定删除',
          cancelText: '取消',
          confirmClass: 'btn-danger',
          onConfirm: () => {
            const deletion = deleteCategory(catName);
            renderList();
            void deletion
              .then(() => renderList())
              .catch(error => {
                console.error('删除分类失败:', error);
                showToast('删除分类失败，请稍后重试', { type: 'error' });
                renderList();
              });
          }
        });
      });
    });
  };

  // 绑定脚部添加逻辑
  const addInput = overlay.querySelector('.cat-modal-new-input') as HTMLInputElement;
  const addBtn = overlay.querySelector('.cat-modal-add-btn') as HTMLButtonElement;

  const handleAdd = async () => {
    const val = addInput.value.trim();
    if (!val) return;

    const categories = getAppConfig().categories || [];
    if (categories.includes(val)) {
      alert(`分类「${val}」已存在`);
      return;
    }

    await addCategory(val);
    addInput.value = '';
    renderList();
    addInput.focus();
  };

  addBtn.addEventListener('click', handleAdd);
  addInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      handleAdd();
    }
  });

  // 关闭逻辑
  let isClosed = false;
  const close = () => {
    if (isClosed) return;
    isClosed = true;
    overlay.classList.remove('modal-visible');
    overlay.addEventListener('transitionend', () => {
      overlay.remove();
      onChanged?.();
    }, { once: true });
  };

  overlay.querySelector('.cat-modal-x')!.addEventListener('click', close);
  overlay.querySelector('.cat-modal-close-btn')!.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  // 初次渲染
  renderList();

  // 显示动画
  requestAnimationFrame(() => overlay.classList.add('modal-visible'));
}
