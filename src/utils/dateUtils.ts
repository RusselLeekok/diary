/** 工具函数：日期格式化 */

/** 将 Date 或 ISO 字符串格式化为 YYYY-MM-DD */
export function toDateString(date: Date | string): string {
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return date;
  }
  const d = typeof date === 'string' ? new Date(date) : date;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 格式化为显示用日期：2025年6月11日 */
export function formatDisplayDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  return `${year}年${month}月${day}日`;
}

/** 格式化为简短日期：6月11日 */
export function formatShortDate(dateStr: string): string {
  const [, month, day] = dateStr.split('-').map(Number);
  return `${month}月${day}日`;
}

/** 格式化时间：HH:mm */
export function formatTime(isoStr: string): string {
  const d = new Date(isoStr);
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

/** 格式化为相对时间：刚刚、X分钟前、X小时前、X天前 */
export function formatRelativeTime(isoStr: string): string {
  const now = Date.now();
  const then = new Date(isoStr).getTime();
  const diff = now - then;
  if (diff < 60_000) return '刚刚';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} 小时前`;
  if (diff < 7 * 86400_000) return `${Math.floor(diff / 86400_000)} 天前`;
  return formatDisplayDate(isoStr.split('T')[0]);
}

/** 获取今天的 YYYY-MM-DD */
export function today(): string {
  return toDateString(new Date());
}

/** 获取某月的天数 */
export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** 获取某月第一天是星期几（0=周日） */
export function getFirstDayOfWeek(year: number, month: number): number {
  return new Date(year, month - 1, 1).getDay();
}

/** 获取星期几的中文简称 */
export const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

/** 计算字数（中文每字算1，英文每词算1） */
export function countWords(plainText: string): number {
  if (!plainText.trim()) return 0;
  // 中文字符
  const chineseCount = (plainText.match(/[\u4e00-\u9fff]/g) || []).length;
  // 英文单词
  const englishWords = plainText.replace(/[\u4e00-\u9fff]/g, ' ').trim().split(/\s+/).filter(Boolean).length;
  return chineseCount + englishWords;
}
