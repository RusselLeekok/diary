/** Toast 通知组件 */

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastOptions {
  type?: ToastType;
  duration?: number;
}

let container: HTMLElement | null = null;

function getContainer(): HTMLElement {
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  return container;
}

const ICONS: Record<ToastType, string> = {
  success: '✓',
  error: '✕',
  info: 'ℹ',
  warning: '⚠',
};

/** 显示 Toast 通知 */
export function showToast(message: string, options: ToastOptions = {}): void {
  const { type = 'info', duration = 3000 } = options;
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  const icon = document.createElement('span');
  icon.className = 'toast-icon';
  icon.textContent = ICONS[type];
  const text = document.createElement('span');
  text.className = 'toast-message';
  text.textContent = message;
  el.append(icon, text);
  getContainer().appendChild(el);
  // 入场动画触发
  requestAnimationFrame(() => el.classList.add('toast-visible'));
  // 自动消失
  setTimeout(() => {
    el.classList.remove('toast-visible');
    el.addEventListener('transitionend', () => el.remove(), { once: true });
  }, duration);
}
