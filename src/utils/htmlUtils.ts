const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

const ALLOWED_FONT_SIZES = new Set(['13px', '15px', '17px', '20px', '24px', '30px']);
const ALLOWED_TEXT_ALIGN = new Set(['center', 'right', 'justify']);
const SAFE_COLOR_VALUE = /^(#[0-9a-f]{3,8}|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)|rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*(0|1|0?\.\d+)\s*\))$/i;

/** Escape text before interpolating it into HTML templates. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, char => HTML_ENTITIES[char]);
}

function isSafeUrl(value: string, allowedDataImage = false): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('#')) return true;
  if (allowedDataImage && /^data:image\/(?:png|jpe?g|gif|webp|bmp|svg\+xml);base64,/i.test(trimmed)) {
    return true;
  }
  if (allowedDataImage && trimmed.startsWith('blob:')) return true;

  try {
    const url = new URL(trimmed, window.location.origin);
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol);
  } catch {
    return false;
  }
}

/** Remove unsafe tags/attributes from persisted rich-text diary content. */
export function sanitizeDiaryContent(html: string): string {
  const template = document.createElement('template');
  template.innerHTML = html || '';

  const allowedTags = new Set([
    'A', 'B', 'BLOCKQUOTE', 'BR', 'CODE', 'DIV', 'EM', 'H1', 'H2', 'H3', 'H4',
    'H5', 'H6', 'I', 'IMG', 'LI', 'OL', 'P', 'PRE', 'S', 'SPAN', 'STRONG',
    'SUB', 'SUP', 'U', 'UL',
  ]);
  const dropWithChildren = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'VIDEO', 'AUDIO']);

  const cleanNode = (node: Node): void => {
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const el = node as HTMLElement;
    const tag = el.tagName;

    if (dropWithChildren.has(tag)) {
      el.remove();
      return;
    }

    for (const child of Array.from(el.childNodes)) {
      cleanNode(child);
    }

    if (!allowedTags.has(tag)) {
      el.replaceWith(...Array.from(el.childNodes));
      return;
    }

    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      const value = attr.value;

      if (name === 'class') {
        const safeClasses = value.split(/\s+/).filter(cls => /^ql-[\w-]+$/.test(cls));
        if (safeClasses.length) el.setAttribute('class', safeClasses.join(' '));
        else el.removeAttribute(attr.name);
        continue;
      }

      if (name === 'style') {
        const safeStyle = sanitizeInlineStyle(el);
        if (safeStyle) el.setAttribute('style', safeStyle);
        else el.removeAttribute(attr.name);
        continue;
      }

      if (tag === 'A' && name === 'href') {
        if (isSafeUrl(value)) {
          el.setAttribute('target', '_blank');
          el.setAttribute('rel', 'noopener noreferrer');
        } else {
          el.removeAttribute(attr.name);
        }
        continue;
      }

      if (tag === 'IMG' && name === 'src') {
        if (!isSafeUrl(value, true)) el.removeAttribute(attr.name);
        continue;
      }

      if ((tag === 'IMG' && ['alt', 'title'].includes(name)) || (tag === 'A' && name === 'title')) {
        continue;
      }

      el.removeAttribute(attr.name);
    }

    if (tag === 'A' && el.getAttribute('href')) {
      el.setAttribute('target', '_blank');
      el.setAttribute('rel', 'noopener noreferrer');
    }
  };

  for (const child of Array.from(template.content.childNodes)) {
    cleanNode(child);
  }

  trimEmptyEdgeBlocks(template.content);

  return template.innerHTML;
}

function sanitizeInlineStyle(el: HTMLElement): string {
  const safeRules: string[] = [];
  const color = el.style.getPropertyValue('color').trim();
  const backgroundColor = el.style.getPropertyValue('background-color').trim();
  const fontSize = el.style.getPropertyValue('font-size').trim();
  const textAlign = el.style.getPropertyValue('text-align').trim();

  if (isSafeColor(color)) safeRules.push(`color: ${color}`);
  if (isSafeColor(backgroundColor)) safeRules.push(`background-color: ${backgroundColor}`);
  if (ALLOWED_FONT_SIZES.has(fontSize)) safeRules.push(`font-size: ${fontSize}`);
  if (ALLOWED_TEXT_ALIGN.has(textAlign)) safeRules.push(`text-align: ${textAlign}`);

  return safeRules.join('; ');
}

function isSafeColor(value: string): boolean {
  return SAFE_COLOR_VALUE.test(value);
}

function trimEmptyEdgeBlocks(root: DocumentFragment): void {
  const isEmptyBlock = (node: ChildNode | null): boolean => {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
    const el = node as HTMLElement;
    if (!['P', 'DIV'].includes(el.tagName)) return false;
    if (el.querySelector('img')) return false;
    return el.textContent?.trim() === '';
  };

  while (isEmptyBlock(root.firstChild)) {
    root.firstChild?.remove();
  }
  while (isEmptyBlock(root.lastChild)) {
    root.lastChild?.remove();
  }
}
