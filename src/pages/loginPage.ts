import { login, register } from '../store/authStore';
import { navigate } from '../router/router';
import { showToast } from '../components/toast';

export function renderLoginPage(container: HTMLElement): void {
  container.innerHTML = `
    <div class="login-page-container">
      <div class="login-glow-bg"></div>
      <div class="login-card">
        <div class="login-header">
          <div class="login-logo">📔</div>
          <h1 class="login-title">专属记忆空间</h1>
          <p class="login-subtitle">记录点滴生活，留存美好瞬间</p>
        </div>

        <!-- Tab 切换 -->
        <div class="login-tabs">
          <button class="login-tab-btn active" id="tab-login">账户登录</button>
          <button class="login-tab-btn" id="tab-register">新友注册</button>
        </div>

        <!-- 错误提示 -->
        <div class="login-error-box hidden" id="login-error"></div>

        <!-- 登录表单 -->
        <form class="login-form" id="login-form">
          <div class="form-group">
            <label for="username">用户名</label>
            <div class="input-wrapper">
              <input type="text" id="username" placeholder="请输入字母/数字组合 (2-30位)" required autocomplete="username">
            </div>
          </div>

          <div class="form-group hidden" id="group-nickname">
            <label for="nickname">昵称</label>
            <div class="input-wrapper">
              <input type="text" id="nickname" placeholder="例如：旅人" autocomplete="nickname">
            </div>
          </div>

          <div class="form-group">
            <label for="password">密码</label>
            <div class="input-wrapper">
              <input type="password" id="password" placeholder="请输入您的密码 (至少6位)" required autocomplete="current-password">
              <button type="button" class="password-toggle-btn" id="password-toggle" tabindex="-1">👁️</button>
            </div>
          </div>

          <button type="submit" class="login-submit-btn" id="submit-btn">
            <span class="btn-text" id="submit-text">登录</span>
            <span class="btn-loader hidden" id="submit-loader">
              <svg viewBox="0 0 50 50" class="spinner"><circle cx="25" cy="25" r="20" fill="none" stroke-width="5"></circle></svg>
            </span>
          </button>
        </form>
      </div>
    </div>
  `;

  // DOM 元素获取
  const tabLogin = container.querySelector('#tab-login') as HTMLButtonElement;
  const tabRegister = container.querySelector('#tab-register') as HTMLButtonElement;
  const groupNickname = container.querySelector('#group-nickname') as HTMLDivElement;
  const inputNickname = container.querySelector('#nickname') as HTMLInputElement;
  const inputUsername = container.querySelector('#username') as HTMLInputElement;
  const inputPassword = container.querySelector('#password') as HTMLInputElement;
  const passwordToggle = container.querySelector('#password-toggle') as HTMLButtonElement;
  const errorBox = container.querySelector('#login-error') as HTMLDivElement;
  const form = container.querySelector('#login-form') as HTMLFormElement;
  const submitText = container.querySelector('#submit-text') as HTMLSpanElement;
  const submitLoader = container.querySelector('#submit-loader') as HTMLSpanElement;
  const submitBtn = container.querySelector('#submit-btn') as HTMLButtonElement;

  let isRegisterMode = false;

  // 模式切换：登录
  tabLogin.addEventListener('click', () => {
    if (!isRegisterMode) return;
    isRegisterMode = false;
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
    groupNickname.classList.add('hidden');
    inputNickname.removeAttribute('required');
    submitText.textContent = '登录';
    errorBox.classList.add('hidden');
    inputUsername.placeholder = '请输入您的用户名';
  });

  // 模式切换：注册
  tabRegister.addEventListener('click', () => {
    if (isRegisterMode) return;
    isRegisterMode = true;
    tabRegister.classList.add('active');
    tabLogin.classList.remove('active');
    groupNickname.classList.remove('hidden');
    inputNickname.setAttribute('required', 'true');
    submitText.textContent = '创建账户';
    errorBox.classList.add('hidden');
    inputUsername.placeholder = '请输入字母/数字组合 (2-30位)';
  });

  // 密码显示/隐藏切换
  passwordToggle.addEventListener('click', () => {
    const type = inputPassword.getAttribute('type') === 'password' ? 'text' : 'password';
    inputPassword.setAttribute('type', type);
    passwordToggle.textContent = type === 'password' ? '👁️' : '🔒';
  });

  // 表单提交
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.classList.add('hidden');

    const username = inputUsername.value.trim();
    const password = inputPassword.value;
    const nickname = inputNickname.value.trim();

    if (username.length < 2) {
      showError('用户名至少需要 2 位字符');
      return;
    }
    if (password.length < 6) {
      showError('密码至少需要 6 位字符');
      return;
    }

    // 设置加载状态
    setLoading(true);

    try {
      if (isRegisterMode) {
        // 执行注册
        await register(username, password, nickname || username);
        showToast('注册成功！正在为您自动登录...', { type: 'success' });
        // 注册成功后自动执行登录
        await login(username, password);
      } else {
        // 执行登录
        await login(username, password);
        showToast('登录成功，欢迎回来！', { type: 'success' });
      }

      // 重新渲染顶栏以显示当前登录的用户信息
      const topbarEl = document.getElementById('app-topbar');
      if (topbarEl) {
        const { loadUserData } = await import('../store/appStore');
        await loadUserData();
        
        const { renderTopbar } = await import('../components/sidebar');
        renderTopbar(topbarEl);
      }

      // 获取跳转的 redirect 路径
      const urlParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
      const redirect = urlParams.get('redirect');
      if (redirect) {
        // 解析重定向参数并跳转
        const [page, query] = decodeURIComponent(redirect).split('?');
        const params: Record<string, string> = {};
        if (query) {
          new URLSearchParams(query).forEach((v, k) => { params[k] = v; });
        }
        navigate(page as any, params);
      } else {
        navigate('list');
      }
    } catch (err: any) {
      showError(err?.message || '操作失败，请重试');
    } finally {
      setLoading(false);
    }
  });

  function showError(msg: string) {
    errorBox.textContent = msg;
    errorBox.classList.remove('hidden');
  }

  function setLoading(loading: boolean) {
    if (loading) {
      submitBtn.setAttribute('disabled', 'true');
      submitLoader.classList.remove('hidden');
      submitText.classList.add('faded');
    } else {
      submitBtn.removeAttribute('disabled');
      submitLoader.classList.add('hidden');
      submitText.classList.remove('faded');
    }
  }
}
