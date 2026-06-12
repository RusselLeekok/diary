/** 通用模态框组件 */
import { escapeHtml } from '../utils/htmlUtils';

interface ModalOptions {
  title: string;
  content: string;
  confirmText?: string;
  cancelText?: string;
  confirmClass?: string;
  onConfirm?: () => void | Promise<void>;
  onCancel?: () => void;
}

/** 显示确认模态框 */
export function showModal(options: ModalOptions): void {
  const {
    title,
    content,
    confirmText = '确认',
    cancelText = '取消',
    confirmClass = 'btn-primary',
    onConfirm,
    onCancel,
  } = options;

  // 移除旧的模态框
  document.querySelector('.modal-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-box" role="dialog" aria-modal="true">
      <h3 class="modal-title">${escapeHtml(title)}</h3>
      <p class="modal-content">${content}</p>
      <div class="modal-actions">
        <button class="btn btn-ghost modal-cancel">${escapeHtml(cancelText)}</button>
        <button class="btn ${confirmClass} modal-confirm">${escapeHtml(confirmText)}</button>
      </div>
    </div>
  `;

  const closeModal = () => {
    overlay.classList.remove('modal-visible');
    overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
  };

  overlay.querySelector('.modal-cancel')!.addEventListener('click', () => {
    onCancel?.();
    closeModal();
  });
  overlay.querySelector('.modal-confirm')!.addEventListener('click', async () => {
    await onConfirm?.();
    closeModal();
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) { onCancel?.(); closeModal(); }
  });

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('modal-visible'));
}

/** 显示输入框模态框（用于密码） */
export function showInputModal(options: {
  title: string;
  placeholder?: string;
  inputType?: string;
  confirmText?: string;
  onConfirm?: (value: string) => void | Promise<void>;
}): void {
  const { title, placeholder = '', inputType = 'text', confirmText = '确认', onConfirm } = options;

  document.querySelector('.modal-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-box" role="dialog" aria-modal="true">
      <h3 class="modal-title">${escapeHtml(title)}</h3>
      <input class="modal-input" type="${escapeHtml(inputType)}" placeholder="${escapeHtml(placeholder)}" autocomplete="off" />
      <div class="modal-actions">
        <button class="btn btn-ghost modal-cancel">取消</button>
        <button class="btn btn-primary modal-confirm">${escapeHtml(confirmText)}</button>
      </div>
    </div>
  `;

  const input = overlay.querySelector('.modal-input') as HTMLInputElement;
  const closeModal = () => {
    overlay.classList.remove('modal-visible');
    overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
  };

  overlay.querySelector('.modal-cancel')!.addEventListener('click', closeModal);
  overlay.querySelector('.modal-confirm')!.addEventListener('click', async () => {
    await onConfirm?.(input.value);
    closeModal();
  });
  input.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') { await onConfirm?.(input.value); closeModal(); }
  });

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('modal-visible'));
  setTimeout(() => input.focus(), 100);
}
