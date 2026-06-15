/**
 * 获取内置的精美 SVG 头像
 * @param index 头像索引，1 至 8
 */
export function getPresetAvatarSvg(index: number): string {
  const gradients = [
    // 1. Sunset Glow
    `<linearGradient id="avatar-grad-1" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FF5F6D"/>
      <stop offset="100%" stop-color="#FFC371"/>
    </linearGradient>`,
    // 2. Forest Walk
    `<linearGradient id="avatar-grad-2" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#11998e"/>
      <stop offset="100%" stop-color="#38ef7d"/>
    </linearGradient>`,
    // 3. Ocean Breeze
    `<linearGradient id="avatar-grad-3" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#00c6ff"/>
      <stop offset="100%" stop-color="#0072ff"/>
    </linearGradient>`,
    // 4. Cosmic Dream
    `<linearGradient id="avatar-grad-4" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#4568DC"/>
      <stop offset="100%" stop-color="#B06AB8"/>
    </linearGradient>`,
    // 5. Sakura Petal
    `<linearGradient id="avatar-grad-5" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ff9a9e"/>
      <stop offset="99%" stop-color="#fecfef"/>
    </linearGradient>`,
    // 6. Coffee Time
    `<linearGradient id="avatar-grad-6" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#8a5a36"/>
      <stop offset="100%" stop-color="#c69c6d"/>
    </linearGradient>`,
    // 7. Cat Paw
    `<linearGradient id="avatar-grad-7" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f093fb"/>
      <stop offset="100%" stop-color="#f5576c"/>
    </linearGradient>`,
    // 8. Book Worm
    `<linearGradient id="avatar-grad-8" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#4facfe"/>
      <stop offset="100%" stop-color="#00f2fe"/>
    </linearGradient>`,
  ];

  const paths = [
    // 1. Sunset Glow - 太阳与云山
    `<circle cx="12" cy="12" r="10" fill="url(#avatar-grad-1)"/>
     <circle cx="12" cy="10" r="4.2" fill="#ffffff" opacity="0.9"/>
     <path d="M4 17c3-3 5-1 7-3s3-1 6 1 3 2 3 2H4z" fill="#ffffff" opacity="0.5"/>
     <path d="M6 19c2-2 4 0 6-2s4-1 6 1c1.5 1.5 2 2 2 2H6z" fill="#ffffff" opacity="0.7"/>`,
    
    // 2. Forest Walk - 叶子
    `<circle cx="12" cy="12" r="10" fill="url(#avatar-grad-2)"/>
     <path d="M12 5c-4 4-4 8 0 13 4-5 4-9 0-13z" fill="#ffffff" opacity="0.95"/>
     <path d="M12 8l3 2m-3 3l2.5 1.5m-2.5-7l-3 2m3 3l-2.5 1.5" stroke="#11998e" stroke-width="0.8" stroke-linecap="round"/>
     <line x1="12" y1="5" x2="12" y2="18" stroke="#11998e" stroke-width="1" stroke-linecap="round"/>`,
    
    // 3. Ocean Breeze - 浪花
    `<circle cx="12" cy="12" r="10" fill="url(#avatar-grad-3)"/>
     <path d="M4 14c2-2 4-2 6 0s4 2 6 0 2-2 4-2v6H4v-4z" fill="#ffffff" opacity="0.5"/>
     <path d="M4 16c2-1.5 4-1.5 6 0s3 1.5 5 0 3-1.5 5 0v4H4v-4z" fill="#ffffff" opacity="0.8"/>
     <circle cx="8" cy="9" r="1" fill="#ffffff" opacity="0.9"/>
     <circle cx="15" cy="7" r="1.5" fill="#ffffff" opacity="0.9"/>
     <circle cx="18" cy="10" r="0.8" fill="#ffffff" opacity="0.9"/>`,
    
    // 4. Cosmic Dream - 土星
    `<circle cx="12" cy="12" r="10" fill="url(#avatar-grad-4)"/>
     <g transform="rotate(-15 12 12)">
       <ellipse cx="12" cy="12" rx="7" ry="1.5" fill="none" stroke="#ffffff" stroke-width="1.8" opacity="0.9"/>
       <circle cx="12" cy="12" r="4.2" fill="#ffffff"/>
       <path d="M6 12.5a7 1.5 0 0 1 12 0" fill="none" stroke="#ffffff" stroke-width="1.8"/>
     </g>
     <path d="M7 6l.5 1.5L9 8l-1.5.5L7 10l-.5-1.5L5 8l1.5-.5z" fill="#ffffff" opacity="0.9"/>
     <circle cx="17" cy="17" r="0.8" fill="#ffffff"/>`,
    
    // 5. Sakura Petal - 樱花
    `<circle cx="12" cy="12" r="10" fill="url(#avatar-grad-5)"/>
     <g transform="translate(12, 12) scale(0.9)">
       <path d="M0 0 C-3 -7 -7 -3 0 0" fill="#ffffff" opacity="0.95"/>
       <path d="M0 0 C3 -7 7 -3 0 0" fill="#ffffff" opacity="0.95" transform="rotate(72)"/>
       <path d="M0 0 C7 -3 3 7 0 0" fill="#ffffff" opacity="0.95" transform="rotate(144)"/>
       <path d="M0 0 C-3 7 -7 3 0 0" fill="#ffffff" opacity="0.95" transform="rotate(216)"/>
       <path d="M0 0 C-7 3 -3 -7 0 0" fill="#ffffff" opacity="0.95" transform="rotate(288)"/>
       <circle cx="0" cy="0" r="1.2" fill="#ff9a9e"/>
     </g>
     <path d="M6 6 C5 4 4 5 6 6" fill="#ffffff" opacity="0.7" transform="rotate(15 6 6)"/>`,
    
    // 6. Coffee Time - 咖啡杯
    `<circle cx="12" cy="12" r="10" fill="url(#avatar-grad-6)"/>
     <path d="M7 10h8v4a4 4 0 0 1-8 0v-4z" fill="#ffffff"/>
     <path d="M15 11c1 0 2 .5 2 1.5s-1 1.5-2 1.5" fill="none" stroke="#ffffff" stroke-width="1.5"/>
     <line x1="6" y1="16" x2="16" y2="16" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round"/>
     <path d="M9 8c0-1 .5-1 .5-2" fill="none" stroke="#ffffff" stroke-width="0.8" stroke-linecap="round"/>
     <path d="M11.5 8c0-1 .5-1 .5-2" fill="none" stroke="#ffffff" stroke-width="0.8" stroke-linecap="round"/>
     <path d="M14 8c0-1 .5-1 .5-2" fill="none" stroke="#ffffff" stroke-width="0.8" stroke-linecap="round"/>`,
    
    // 7. Cat Paw - 爪子
    `<circle cx="12" cy="12" r="10" fill="url(#avatar-grad-7)"/>
     <g transform="translate(12, 12.5) scale(0.9)">
       <path d="M-4 -1 C-4 -6 -1 -6 -1 -3 C-1 -6 2 -6 2 -3 C2 -6 5 -6 5 -1 C5 3 2 5 -1 5 C-4 5 -4 3 -4 -1z" fill="#ffffff"/>
       <path d="M-2 1 C-2-1.5 1-1.5 1 1 C1 3 -2 3 -2 1z" fill="#f5576c" opacity="0.8"/>
       <circle cx="-2.5" cy="-2" r="0.7" fill="#f5576c" opacity="0.8"/>
       <circle cx="-0.8" cy="-3.2" r="0.7" fill="#f5576c" opacity="0.8"/>
       <circle cx="1" cy="-3.2" r="0.7" fill="#f5576c" opacity="0.8"/>
       <circle cx="2.5" cy="-2" r="0.7" fill="#f5576c" opacity="0.8"/>
     </g>`,
    
    // 8. Book Worm - 书本
    `<circle cx="12" cy="12" r="10" fill="url(#avatar-grad-8)"/>
     <g transform="translate(12, 12.5) scale(0.85)">
       <path d="M-7-2c1-1 3-1 6 1 3-2 5-2 6-1v7c-1-1-3-1-6 1-3-2-5-2-6-1z" fill="#ffffff"/>
       <line x1="-1" y1="-1" x2="-1" y2="7" stroke="#00f2fe" stroke-width="1"/>
       <path d="M-5 1h3M-5 3h3M2 1h3M2 3h3" stroke="#4facfe" stroke-width="0.6" stroke-linecap="round"/>
     </g>`
  ];

  const grad = gradients[index - 1] || gradients[0];
  const path = paths[index - 1] || paths[0];

  const uniqueId = `avatar-grad-${index}-${Math.floor(Math.random() * 1000000)}`;
  const resolvedGrad = grad
    .replace(`id="avatar-grad-${index}"`, `id="${uniqueId}"`)
    .replace(`id='avatar-grad-${index}'`, `id='${uniqueId}'`);
  const resolvedPath = path.replace(`fill="url(#avatar-grad-${index})"`, `fill="url(#${uniqueId})"`);

  return `<svg viewBox="0 0 24 24" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
    <defs>${resolvedGrad}</defs>
    ${resolvedPath}
  </svg>`;
}
