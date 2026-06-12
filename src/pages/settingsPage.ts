import { getAppConfig, updateConfig } from '../store/appStore';
import { clearAllEntries, getAllEntries } from '../services/databaseService';
import { exportAsJson, exportAsMarkdown, importFromJson } from '../utils/exportUtils';
import { showToast } from '../components/toast';
import { showModal, showInputModal } from '../components/modal';
import CryptoJS from 'crypto-js';
import { navigate } from '../router/router';

/** 设置页面 */
export async function renderSettingsPage(mainEl: HTMLElement): Promise<void> {
  const config = getAppConfig();

  mainEl.innerHTML = `
    <div class="page-settings">
      <div class="page-header">
        <h1 class="page-title">设置</h1>
      </div>

      <div class="settings-sections">

        <!-- 外观 -->
        <section class="settings-section">
          <h2 class="settings-section-title">🎨 外观</h2>
          <div class="settings-item">
            <div class="settings-item-info">
              <span class="settings-item-label">主题配色</span>
              <span class="settings-item-desc">选择契合此刻心境的色彩纸质主题</span>
            </div>
            <div class="theme-picker-group">
              <button class="theme-picker-btn ${config.theme === 'light' ? 'active' : ''}" data-theme="light" title="雅致暖米">
                <span class="theme-color-preview" style="background:#f7f3eb;border-color:#9c7c4a"></span>
                雅致暖米
              </button>
              <button class="theme-picker-btn ${config.theme === 'green' ? 'active' : ''}" data-theme="green" title="清幽森绿">
                <span class="theme-color-preview" style="background:#edf3ec;border-color:#5a7860"></span>
                清幽森绿
              </button>
              <button class="theme-picker-btn ${config.theme === 'blue' ? 'active' : ''}" data-theme="blue" title="静谧天蓝">
                <span class="theme-color-preview" style="background:#ebf3f7;border-color:#53778a"></span>
                静谧天蓝
              </button>
              <button class="theme-picker-btn ${config.theme === 'pink' ? 'active' : ''}" data-theme="pink" title="温柔樱粉">
                <span class="theme-color-preview" style="background:#f7edf0;border-color:#8e5f6e"></span>
                温柔樱粉
              </button>
              <button class="theme-picker-btn ${config.theme === 'dark' ? 'active' : ''}" data-theme="dark" title="沉静暗夜">
                <span class="theme-color-preview" style="background:#1c1812;border-color:#c4a46e"></span>
                沉静暗夜
              </button>
            </div>
          </div>
          <div class="settings-item">
            <div class="settings-item-info">
              <span class="settings-item-label">字体大小</span>
              <span class="settings-item-desc">调整正文显示字号</span>
            </div>
            <div class="font-size-group">
              <button class="font-size-btn ${config.fontSize === 'sm' ? 'active' : ''}" data-size="sm" id="fs-sm-btn">小</button>
              <button class="font-size-btn ${config.fontSize === 'md' ? 'active' : ''}" data-size="md" id="fs-md-btn">中</button>
              <button class="font-size-btn ${config.fontSize === 'lg' ? 'active' : ''}" data-size="lg" id="fs-lg-btn">大</button>
              <button class="font-size-btn ${config.fontSize === 'xl' ? 'active' : ''}" data-size="xl" id="fs-xl-btn">超大</button>
            </div>
          </div>
        </section>

        <!-- 隐私与安全 -->
        <section class="settings-section">
          <h2 class="settings-section-title">🔒 隐私与安全</h2>
          <div class="settings-item">
            <div class="settings-item-info">
              <span class="settings-item-label">应用密码</span>
              <span class="settings-item-desc">${config.hasPassword ? '已设置，启动时需要输入密码' : '未设置，任何人可访问'}</span>
            </div>
            <div class="settings-item-actions">
              ${config.hasPassword
                ? `<button class="btn btn-ghost" id="change-pwd-btn">修改密码</button>
                   <button class="btn btn-danger-ghost" id="remove-pwd-btn">取消密码</button>`
                : `<button class="btn btn-primary" id="set-pwd-btn">设置密码</button>`
              }
            </div>
          </div>
        </section>

        <!-- 数据管理 -->
        <section class="settings-section">
          <h2 class="settings-section-title">💾 数据管理</h2>
          <div class="settings-item">
            <div class="settings-item-info">
              <span class="settings-item-label">导出数据（JSON）</span>
              <span class="settings-item-desc">导出所有日记和配置，可用于备份和恢复</span>
            </div>
            <button class="btn btn-ghost" id="export-json-btn">📥 导出</button>
          </div>
          <div class="settings-item">
            <div class="settings-item-info">
              <span class="settings-item-label">导出为 Markdown</span>
              <span class="settings-item-desc">将所有日记导出为可读的 Markdown 文件</span>
            </div>
            <button class="btn btn-ghost" id="export-md-btn">📄 导出</button>
          </div>
          <div class="settings-item">
            <div class="settings-item-info">
              <span class="settings-item-label">导入数据</span>
              <span class="settings-item-desc">从 JSON 备份文件恢复数据（不会覆盖现有数据）</span>
            </div>
            <label class="btn btn-ghost" for="import-file-input" style="cursor:pointer">📤 导入</label>
            <input type="file" id="import-file-input" accept=".json" style="display:none" />
          </div>
          <div class="settings-item settings-item-danger">
            <div class="settings-item-info">
              <span class="settings-item-label">清空所有数据</span>
              <span class="settings-item-desc danger-text">删除所有日记，此操作不可撤销</span>
            </div>
            <button class="btn btn-danger" id="clear-all-btn">🗑️ 清空</button>
          </div>
        </section>

        <!-- 关于 -->
        <section class="settings-section">
          <h2 class="settings-section-title">ℹ️ 关于</h2>
          <div class="about-card">
            <div class="about-logo">📔</div>
            <div class="about-info">
              <p class="about-name">我的日记</p>
              <p class="about-version">版本 1.0.0</p>
              <p class="about-desc">一款简洁、私密的个人日记应用。所有数据存储在您的浏览器本地，不上传服务器。</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  `;

  bindSettingsEvents(mainEl);
}

function bindSettingsEvents(container: HTMLElement): void {
  // 主题切换
  container.querySelectorAll('.theme-picker-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const theme = (btn as HTMLElement).dataset.theme as any;
      await updateConfig('theme', theme);
      
      document.documentElement.dataset.theme = theme;
      const isDark = theme === 'dark';
      document.documentElement.classList.toggle('dark', isDark);
      localStorage.setItem('diary-theme', theme);
      
      container.querySelectorAll('.theme-picker-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      const icon = document.getElementById('theme-icon');
      if (icon) icon.textContent = isDark ? '☀️' : '🌙';
      
      const themeNames: Record<string, string> = {
        light: '雅致暖米',
        green: '清幽森绿',
        blue: '静谧天蓝',
        pink: '温柔樱粉',
        dark: '沉静暗夜'
      };
      showToast(`已切换为「${themeNames[theme] || theme}」主题`, { type: 'success' });
    });
  });

  // 字体大小切换
  container.querySelectorAll('.font-size-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const size = (btn as HTMLElement).dataset.size as 'sm' | 'md' | 'lg' | 'xl';
      await updateConfig('fontSize', size);
      document.documentElement.dataset.fontSize = size;
      container.querySelectorAll('.font-size-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      showToast('字体大小已更新', { type: 'success' });
    });
  });

  // 设置密码
  container.querySelector('#set-pwd-btn')?.addEventListener('click', () => {
    showInputModal({
      title: '设置应用密码',
      placeholder: '请输入密码（至少4位）',
      inputType: 'password',
      confirmText: '确认设置',
      onConfirm: async (pwd) => {
        if (pwd.length < 4) { showToast('密码至少需要4位', { type: 'error' }); return; }
        const hash = CryptoJS.SHA256(pwd).toString();
        await updateConfig('hasPassword', true);
        await updateConfig('passwordHash', hash);
        showToast('密码已设置', { type: 'success' });
        await renderSettingsPage(container.querySelector('.page-settings')!.parentElement as HTMLElement);
      },
    });
  });

  // 修改密码
  container.querySelector('#change-pwd-btn')?.addEventListener('click', () => {
    showInputModal({
      title: '修改密码',
      placeholder: '请输入新密码（至少4位）',
      inputType: 'password',
      confirmText: '确认修改',
      onConfirm: async (pwd) => {
        if (pwd.length < 4) { showToast('密码至少需要4位', { type: 'error' }); return; }
        const hash = CryptoJS.SHA256(pwd).toString();
        await updateConfig('passwordHash', hash);
        showToast('密码已更新', { type: 'success' });
      },
    });
  });

  // 取消密码
  container.querySelector('#remove-pwd-btn')?.addEventListener('click', () => {
    showModal({
      title: '取消密码保护',
      content: '确定要取消应用密码吗？取消后任何人都可以访问您的日记。',
      confirmText: '取消密码',
      confirmClass: 'btn-danger',
      onConfirm: async () => {
        await updateConfig('hasPassword', false);
        await updateConfig('passwordHash', '');
        showToast('已取消密码保护', { type: 'success' });
        await renderSettingsPage(container.querySelector('.page-settings')!.parentElement as HTMLElement);
      },
    });
  });

  // 导出 JSON
  container.querySelector('#export-json-btn')?.addEventListener('click', async () => {
    await exportAsJson();
    showToast('已开始下载 JSON 备份', { type: 'success' });
  });

  // 导出 Markdown
  container.querySelector('#export-md-btn')?.addEventListener('click', async () => {
    const entries = await getAllEntries();
    await exportAsMarkdown(entries);
    showToast('已开始下载 Markdown 文件', { type: 'success' });
  });

  // 导入文件
  container.querySelector('#import-file-input')?.addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const result = await importFromJson(file);
      showToast(`成功导入 ${result.count} 篇日记`, { type: 'success' });
    } catch {
      showToast('导入失败，请检查文件格式', { type: 'error' });
    }
  });

  // 清空所有数据
  container.querySelector('#clear-all-btn')?.addEventListener('click', () => {
    showModal({
      title: '⚠️ 清空所有数据',
      content: '此操作将永久删除所有日记，无法恢复！建议先导出备份再清空。确定继续吗？',
      confirmText: '我已了解，确认清空',
      confirmClass: 'btn-danger',
      onConfirm: async () => {
        await clearAllEntries();
        showToast('所有数据已清空', { type: 'success' });
        navigate('list');
      },
    });
  });
}
