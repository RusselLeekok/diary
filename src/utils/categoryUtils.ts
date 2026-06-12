/**
 * 分类颜色系统
 * 每个标签/分类根据其在全局排序列表中的索引自动分配固定颜色
 */

export const CATEGORY_PALETTE = [
  '#6B9FD4', // 蓝
  '#52B788', // 绿
  '#E07A5F', // 珊瑚红
  '#9B5DE5', // 紫
  '#F59E0B', // 琥珀
  '#F15BB5', // 粉
  '#00BBF9', // 青
  '#FF6B6B', // 红
  '#A3C585', // 草绿
  '#7B7DB0', // 靛蓝
];

/** 未分类专用颜色 */
export const UNCATEGORIZED_COLOR = '#BDBDBD';

/**
 * 根据分类名获取对应颜色
 * @param allCategories 全部分类名列表（有序）
 * @param name 分类名
 */
export function getCategoryColor(allCategories: string[], name: string): string {
  const idx = allCategories.indexOf(name);
  if (idx === -1) return UNCATEGORIZED_COLOR;
  return CATEGORY_PALETTE[idx % CATEGORY_PALETTE.length];
}

/**
 * 统计各分类下的日记数量
 * @param entries 所有日记
 * @param allCategories 全部分类名（有序）
 */
export interface CategoryStat {
  name: string;        // 分类名（'' 代表全部，'__none__' 代表未分类）
  color: string;
  count: number;
}

export function buildCategoryStats(
  entries: { tags: string[] }[],
  allCategories: string[],
): CategoryStat[] {
  const countMap = new Map<string, number>();
  let uncategorized = 0;

  entries.forEach(e => {
    const cat = e.tags[0] ?? '';
    if (cat) {
      countMap.set(cat, (countMap.get(cat) ?? 0) + 1);
    } else {
      uncategorized++;
    }
  });

  const result: CategoryStat[] = [
    { name: '', color: UNCATEGORIZED_COLOR, count: entries.length },             // 全部
    { name: '__none__', color: UNCATEGORIZED_COLOR, count: uncategorized },      // 未分类
    ...allCategories.map(c => ({
      name: c,
      color: getCategoryColor(allCategories, c),
      count: countMap.get(c) ?? 0,
    })),
  ];

  return result;
}
