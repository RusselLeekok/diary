import { navigate } from '../router/router';

/** 日历页（功能已整合到日记列表首页，此页跳转回首页） */
export async function renderCalendarPage(mainEl: HTMLElement): Promise<void> {
  void mainEl;
  navigate('list');
}
