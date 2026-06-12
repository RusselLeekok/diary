// 情绪类型
export type MoodType =
  | 'happy'      // 😊 开心
  | 'calm'       // 😌 平静
  | 'sad'        // 😢 悲伤
  | 'angry'      // 😠 愤怒
  | 'anxious'    // 😰 焦虑
  | 'excited'    // 🤩 兴奋
  | 'tired'      // 😴 疲惫
  | 'grateful'   // 🥰 感恩
  | 'none';      // 未选择

// 情绪配置
export interface MoodConfig {
  emoji: string;
  label: string;
  color: string;
}

// 所有情绪的配置映射
export const MOOD_CONFIG: Record<MoodType, MoodConfig> = {
  happy:    { emoji: '😊', label: '开心',  color: '#f59e0b' },
  calm:     { emoji: '😌', label: '平静',  color: '#6ee7b7' },
  sad:      { emoji: '😢', label: '悲伤',  color: '#93c5fd' },
  angry:    { emoji: '😠', label: '愤怒',  color: '#fca5a5' },
  anxious:  { emoji: '😰', label: '焦虑',  color: '#d8b4fe' },
  excited:  { emoji: '🤩', label: '兴奋',  color: '#fb923c' },
  tired:    { emoji: '😴', label: '疲惫',  color: '#94a3b8' },
  grateful: { emoji: '🥰', label: '感恩',  color: '#f9a8d4' },
  none:     { emoji: '📝', label: '未选择', color: '#cbd5e1' },
};

// 日记实体
export interface DiaryEntry {
  id: string;
  title: string;
  content: string;        // 富文本 HTML
  plainText: string;      // 纯文本（用于搜索）
  mood: MoodType;
  tags: string[];
  wordCount: number;
  isLocked: boolean;
  createdAt: string;      // ISO 8601
  updatedAt: string;
  dateFor: string;        // YYYY-MM-DD
  timeFor?: string;       // HH:MM
  isDeleted?: boolean;    // 是否已被删除到垃圾箱
}

// 应用配置
export interface AppConfig {
  theme: 'light' | 'dark' | 'green' | 'blue' | 'pink';
  fontSize: 'sm' | 'md' | 'lg' | 'xl';
  hasPassword: boolean;
  passwordHash: string;
  autoSaveInterval: number;
  categories: string[];
}

// 默认配置
export const DEFAULT_CONFIG: AppConfig = {
  theme: 'light',
  fontSize: 'md',
  hasPassword: false,
  passwordHash: '',
  autoSaveInterval: 30,
  categories: ['生活', '工作', '心情', '随笔'],
};

// 路由页面
export type PageName = 'list' | 'editor' | 'calendar' | 'trash' | 'stats' | 'settings' | 'view';

// 搜索过滤条件
export interface SearchFilter {
  keyword: string;
  mood: MoodType | '';
  tags: string[];
  dateFrom: string;
  dateTo: string;
}
