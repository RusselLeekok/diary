import type { DiaryEntry } from '../types';
import { exportData, importData } from '../services/databaseService';
import { today } from './dateUtils';

/** 下载文本文件 */
function downloadText(content: string, filename: string, mimeType = 'text/plain;charset=utf-8'): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** 导出为 JSON */
export async function exportAsJson(): Promise<void> {
  const data = await exportData();
  const date = today();
  downloadText(data, `diary-backup-${date}.json`, 'application/json;charset=utf-8');
}

/** 导出为 Markdown */
export async function exportAsMarkdown(entries: DiaryEntry[]): Promise<void> {
  const lines: string[] = [];
  for (const entry of entries) {
    lines.push(`# ${entry.title || '无标题'}`);
    lines.push('');
    const metaParts = [`日期：${entry.dateFor}`];
    if (entry.mood && entry.mood !== 'none') metaParts.push(`情绪：${entry.mood}`);
    if (entry.weather && entry.weather !== 'none') metaParts.push(`天气：${entry.weather}`);
    if (entry.location) metaParts.push(`位置：${entry.location}`);
    metaParts.push(`标签：${entry.tags.join(', ') || '无'}`);
    lines.push(`> ${metaParts.join('  ')}`);
    lines.push('');
    // 将 HTML 内容转为纯文本
    const tmp = document.createElement('div');
    tmp.innerHTML = entry.content;
    lines.push(tmp.innerText);
    lines.push('');
    lines.push('---');
    lines.push('');
  }
  const date = today();
  downloadText(lines.join('\n'), `diary-export-${date}.md`);
}

/** 从 JSON 文件导入 */
export async function importFromJson(file: File): Promise<{ count: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string;
        const result = await importData(content);
        resolve(result);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsText(file, 'utf-8');
  });
}
