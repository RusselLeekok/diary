export function nowIso(): string {
  return new Date().toISOString();
}

export function toLocalDateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function countWords(plainText: string): number {
  if (!plainText.trim()) return 0;
  const chineseCount = (plainText.match(/[\u4e00-\u9fff]/g) || []).length;
  const englishWords = plainText
    .replace(/[\u4e00-\u9fff]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  return chineseCount + englishWords;
}
