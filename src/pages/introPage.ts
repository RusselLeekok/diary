import { navigate } from '../router/router';

export function renderIntroPage(container: HTMLElement): void {
  document.title = '日记 - 应用介绍';

  container.innerHTML = `
    <div class="page-intro">
      <section class="intro-hero">
        <div class="intro-mark" aria-hidden="true">📔</div>
        <div class="intro-copy">
          <p class="intro-kicker">我的日记</p>
          <h1 class="intro-title">把今天轻轻放好</h1>
          <p class="intro-desc">
            这里适合写下日常、心情、地点、天气和那些不想马上忘掉的小片段。
          </p>
          <button class="btn btn-primary intro-write-btn" id="intro-write-btn" type="button">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="16" height="16">
              <path d="M12 20h9"/>
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>
            </svg>
            开始写日记
          </button>
        </div>
      </section>

      <section class="intro-grid" aria-label="应用能力">
        <article class="intro-feature">
          <span class="intro-feature-icon">✍️</span>
          <h2>快速记录</h2>
          <p>打开就写，正文、标题、情绪和天气都能顺手放进同一篇记录里。</p>
        </article>
        <article class="intro-feature">
          <span class="intro-feature-icon">🗂️</span>
          <h2>整理回看</h2>
          <p>通过分类、日期和搜索找到过去的片段，让回忆保持可抵达。</p>
        </article>
        <article class="intro-feature">
          <span class="intro-feature-icon">📈</span>
          <h2>看见习惯</h2>
          <p>统计页会把记录频率、字数和情绪变化整理成可读的节奏。</p>
        </article>
      </section>
    </div>
  `;

  container.querySelector('#intro-write-btn')?.addEventListener('click', () => {
    navigate('editor');
  });
}
