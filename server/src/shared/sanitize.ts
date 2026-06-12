import sanitizeHtml from 'sanitize-html';

const SAFE_COLOR_PATTERN = /^(#[0-9a-f]{3,8}|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)|rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*(0|1|0?\.\d+)\s*\))$/i;

export function sanitizeDiaryHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      'a', 'b', 'blockquote', 'br', 'code', 'div', 'em', 'h1', 'h2', 'h3', 'h4',
      'h5', 'h6', 'i', 'img', 'li', 'ol', 'p', 'pre', 's', 'span', 'strong',
      'sub', 'sup', 'u', 'ul',
    ],
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel', 'class'],
      img: ['src', 'alt', 'title', 'class'],
      '*': ['class', 'style'],
    },
    allowedClasses: { '*': [/^ql-[\w-]+$/] },
    allowedStyles: {
      '*': {
        color: [SAFE_COLOR_PATTERN],
        'background-color': [SAFE_COLOR_PATTERN],
        'font-size': [/^(13|15|17|20|24|30)px$/],
        'text-align': [/^(center|right|justify)$/],
      },
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel', 'data'],
    allowedSchemesByTag: { img: ['http', 'https', 'data'] },
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', {
        target: '_blank',
        rel: 'noopener noreferrer',
      }),
    },
  });
}

export function htmlToPlainText(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [],
    allowedAttributes: {},
  }).replace(/\s+\n/g, '\n').trim();
}
