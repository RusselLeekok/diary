import Quill from 'quill';
import type { DiaryEntry, MoodType } from '../types';
import { MOOD_CONFIG } from '../types';
import { getEntryById, saveEntry } from '../services/databaseService';
import { refreshEntries, getAllTagsList, getEntries, addCategory } from '../store/appStore';
import { navigate } from '../router/router';
import { showCategoryModal } from '../components/categoryModal';
import { showToast } from '../components/toast';
import { today, countWords } from '../utils/dateUtils';
import { getCategoryColor, UNCATEGORIZED_COLOR, buildCategoryStats } from '../utils/categoryUtils';
import { DateTimePicker } from '../components/dateTimePicker';
import { escapeHtml, sanitizeDiaryContent } from '../utils/htmlUtils';

const SizeStyle = Quill.import('attributors/style/size') as any;
SizeStyle.whitelist = ['13px', '15px', '17px', '20px', '24px', '30px'];
Quill.register(SizeStyle, true);

let quill: Quill | null = null;
let autoSaveTimer: ReturnType<typeof setInterval> | null = null;
let dtPicker: DateTimePicker | null = null;
let editorDocumentClickHandler: ((e: MouseEvent) => void) | null = null;

/** 生成 UUID */
function generateId(): string {
  return crypto.randomUUID ? crypto.randomUUID() :
    Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** 渲染编辑器页面 */
export async function renderEditorPage(mainEl: HTMLElement, params?: Record<string, string>): Promise<void> {
  clearAutoSave();
  if (quill) { quill = null; }
  if (dtPicker) {
    dtPicker.destroy();
    dtPicker = null;
  }

  const editId = params?.id || null;
  let loadedEntry: DiaryEntry | null = null;
  if (editId) {
    loadedEntry = (await getEntryById(editId)) || null;
  }

  const dateValue = loadedEntry?.dateFor || params?.date || today();
  const titleValue = loadedEntry?.title || '';
  const moodValue: MoodType = loadedEntry?.mood && loadedEntry.mood in MOOD_CONFIG ? loadedEntry.mood : 'none';
  // 取第一个 tag 作为分类（单选分类系统）
  const currentCategory = loadedEntry?.tags[0] ?? '';

  const allTags = getAllTagsList();
  // 当前分类的颜色
  const catColor = currentCategory
    ? getCategoryColor(allTags, currentCategory)
    : UNCATEGORIZED_COLOR;
  const catLabel = currentCategory || '未分类';

  mainEl.innerHTML = `
    <div class="page-editor">
      <!-- 编辑器顶部工具栏 -->
      <div class="editor-topbar">
        <button class="btn btn-ghost editor-back" id="editor-back" title="返回列表">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          返回
        </button>
        <div class="editor-meta-bar">
          <!-- 日期选择 -->
          <div id="dt-picker-container" class="dt-picker-container"></div>
          <!-- 情绪选择 -->
          <div class="mood-selector" id="mood-selector">
            <button class="mood-current" id="mood-current" type="button" title="选择情绪">
              <span>${MOOD_CONFIG[moodValue].emoji}</span>
              <span class="mood-label-text">${MOOD_CONFIG[moodValue].label}</span>
            </button>
            <div class="mood-dropdown" id="mood-dropdown" hidden>
              ${(Object.entries(MOOD_CONFIG) as [MoodType, typeof MOOD_CONFIG[MoodType]][]).map(([key, cfg]) => `
                <button class="mood-option ${key === moodValue ? 'active' : ''}" data-mood="${key}" type="button">
                  <span>${cfg.emoji}</span> ${cfg.label}
                </button>
              `).join('')}
            </div>
          </div>
          <!-- 分类选择器（单选下拉） -->
          <div class="cat-picker" id="cat-picker">
            <button class="cat-picker-trigger" id="cat-picker-trigger" type="button" title="选择分类">
              <span class="cat-dot" style="background:${catColor}"></span>
              <span id="cat-picker-label">${escapeHtml(catLabel)}</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="10" height="10" class="cat-picker-caret">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
            <!-- 下拉列表 -->
            <div class="cat-picker-dropdown" id="cat-picker-dropdown" hidden></div>
          </div>
        </div>
        <div class="editor-actions">
          <span class="word-count" id="word-count">0 字</span>
          <span class="autosave-indicator" id="autosave-indicator" title="自动保存状态"></span>
          <button class="btn btn-primary" id="save-btn">保存</button>
        </div>
      </div>

      <!-- 标题输入 -->
      <input
        type="text"
        id="entry-title"
        class="entry-title-input"
        placeholder="标题（可选）"
        value="${escapeHtml(titleValue)}"
        maxlength="100"
        autocomplete="off"
      />

      <!-- Quill 富文本编辑器 -->
      <div class="quill-wrapper">
        <div id="quill-toolbar">
          <span class="ql-formats">
            <select class="ql-header">
              <option value="1">标题1</option>
              <option value="2">标题2</option>
              <option value="3">标题3</option>
              <option selected>正文</option>
            </select>
            <select class="ql-size">
              <option value="13px">小字</option>
              <option value="15px" selected>正文</option>
              <option value="17px">稍大</option>
              <option value="20px">重点</option>
              <option value="24px">大字</option>
              <option value="30px">标题字</option>
            </select>
          </span>
          <span class="ql-formats">
            <button class="ql-bold" title="加粗"></button>
            <button class="ql-italic" title="斜体"></button>
            <button class="ql-underline" title="下划线"></button>
            <button class="ql-strike" title="删除线"></button>
          </span>
          <span class="ql-formats">
            <select class="ql-color">
              <option selected></option>
              <option value="#7a5f33"></option>
              <option value="#b94040"></option>
              <option value="#2f7d62"></option>
              <option value="#3f6f96"></option>
              <option value="#8e5f6e"></option>
              <option value="#6b5c44"></option>
            </select>
            <select class="ql-background">
              <option selected></option>
              <option value="#f0e4c8"></option>
              <option value="#f9e8e8"></option>
              <option value="#e2ede1"></option>
              <option value="#def0fa"></option>
              <option value="#faecf0"></option>
            </select>
          </span>
          <span class="ql-formats">
            <button class="ql-blockquote" title="引用"></button>
            <button class="ql-list" value="ordered" title="有序列表"></button>
            <button class="ql-list" value="bullet" title="无序列表"></button>
            <select class="ql-align">
              <option selected></option>
              <option value="center"></option>
              <option value="right"></option>
              <option value="justify"></option>
            </select>
            <button class="ql-indent" value="-1" title="减少缩进"></button>
            <button class="ql-indent" value="+1" title="增加缩进"></button>
          </span>
          <span class="ql-formats">
            <button class="ql-link" title="链接"></button>
            <button class="ql-clean" title="清除格式"></button>
          </span>
          <!-- 自定义图片上传 -->
          <span class="ql-formats">
            <button class="custom-image-button" id="ql-image-btn" title="插入图片">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="16" height="16">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21 15 16 10 5 21"/>
              </svg>
            </button>
          </span>
          <!-- 隐藏的 file input -->
          <input type="file" id="ql-image-input" accept="image/*" style="display:none" />
        </div>
        <div id="quill-editor"></div>
      </div>
    </div>
  `;

  quill = new Quill('#quill-editor', {
    theme: 'snow',
    modules: { toolbar: '#quill-toolbar' },
    placeholder: '今天发生了，有什么想法……',
  });

  if (loadedEntry?.content) {
    quill.root.innerHTML = sanitizeDiaryContent(loadedEntry.content);
  }

  bindEmptyEditorCaret(quill);

  // 绑定图片上传按钮
  const imageBtn   = mainEl.querySelector('#ql-image-btn') as HTMLButtonElement | null;
  const imageInput = mainEl.querySelector('#ql-image-input') as HTMLInputElement | null;
  if (imageBtn && imageInput) {
    imageBtn.addEventListener('click', (e) => {
      e.preventDefault();
      imageInput.value = '';   // 允许重复选同一文件
      imageInput.click();
    });
    imageInput.addEventListener('change', () => {
      const file = imageInput.files?.[0];
      if (!file) return;
      // 限制文件大小 5MB
      if (file.size > 5 * 1024 * 1024) {
        alert('图片不能超过 5MB');
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        const base64 = ev.target?.result as string;
        if (!base64 || !quill) return;
        const range = quill.getSelection(true);
        const index = range ? range.index : 0;
        quill.insertEmbed(index, 'image', base64, 'user');
        quill.setSelection(index + 1, 0, 'silent');
      };
      reader.readAsDataURL(file);
    });
  }

  updateWordCount();
  bindEditorEvents(mainEl, loadedEntry, currentCategory, dateValue);
}

function bindEmptyEditorCaret(editor: Quill): void {
  const placeCaretAtStart = (event?: Event) => {
    if (editor.getLength() > 1) return;
    event?.preventDefault();
    editor.focus();
    editor.setSelection(0, 0, 'silent');
  };

  editor.root.addEventListener('mousedown', (event) => {
    placeCaretAtStart(event);
  });
  editor.root.addEventListener('focus', () => {
    placeCaretAtStart();
  });
}

/** 更新字数显示 */
function updateWordCount(): void {
  if (!quill) return;
  const count = countWords(quill.getText());
  const el = document.getElementById('word-count');
  if (el) el.textContent = `${count} 字`;
}

/** 绑定编辑器事件 */
function bindEditorEvents(
  container: HTMLElement,
  loadedEntry: DiaryEntry | null,
  initCategory: string,
  initialDate: string,
): void {
  if (!quill) return;

  let savedEntry: DiaryEntry | null = loadedEntry;
  let selectedMood: MoodType = loadedEntry?.mood && loadedEntry.mood in MOOD_CONFIG ? loadedEntry.mood : 'none';
  // 单选分类（存入 tags[0]）
  let selectedCategory: string = initCategory;

  const moodCurrent = container.querySelector('#mood-current')!;
  const moodDropdown = container.querySelector('#mood-dropdown') as HTMLElement;
  const catPickerDropdown = container.querySelector('#cat-picker-dropdown') as HTMLElement;
  const catPickerLabel = container.querySelector('#cat-picker-label') as HTMLElement;
  const catPickerDot = container.querySelector('.cat-picker-trigger .cat-dot') as HTMLElement;

  // 初始化自定义日期时间选择器
  const dtContainer = container.querySelector('#dt-picker-container') as HTMLElement;
  const initialTime = loadedEntry?.timeFor || '';
  dtPicker = new DateTimePicker({
    initialDate,
    initialTime,
    container: dtContainer,
    onChange: () => {
      // 变更时不立即触发保存，依赖 15s 定时器
    }
  });

  // --------- 保存函数 ---------
  async function doSave(showIndicator: boolean = false): Promise<DiaryEntry | null> {
    if (!quill || !dtPicker) return null;
    // 若编辑器容器已不在 DOM 中（页面已切换），自动清除定时器并跳过保存
    if (!document.body.contains(container)) {
      clearAutoSave();
      return null;
    }
    const titleEl = container.querySelector('#entry-title') as HTMLInputElement | null;
    if (!titleEl) return null;

    const title    = titleEl.value.trim();
    const dateFor  = dtPicker.getDate() || today();
    const timeFor  = dtPicker.getTime();
    const content  = sanitizeDiaryContent(quill.root.innerHTML);
    const plainText = quill.getText();
    const wordCount = countWords(plainText);
    const hasImage = content.includes('<img');
    if (!plainText.trim() && !title && !hasImage) return null;

    const entry: DiaryEntry = {
      id: savedEntry?.id || generateId(),
      title: title || plainText.slice(0, 30).trim() || '无标题',
      content, plainText,
      mood: selectedMood,
      tags: selectedCategory ? [selectedCategory] : [],
      wordCount,
      isLocked: savedEntry?.isLocked || false,
      createdAt: savedEntry?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      dateFor,
      timeFor,
    };
    await saveEntry(entry);
    await refreshEntries();
    savedEntry = entry;
    if (showIndicator) {
      showAutoSaveIndicator();
    }
    return entry;
  }

  function showAutoSaveIndicator(): void {
    const el = document.getElementById('autosave-indicator');
    if (!el) return;
    el.textContent = '已保存 ✓';
    el.classList.add('visible');
    setTimeout(() => el.classList.remove('visible'), 2000);
  }

  function getSaveErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message) return error.message;
    return '保存失败，请稍后再试';
  }

  // 仅在输入文字时更新字数，不再触发防抖保存
  quill.on('text-change', () => { updateWordCount(); });

  // 开启每 15 秒一次的后台悄悄保存（无提示，页面切走后自动停止）
  autoSaveTimer = setInterval(async () => {
    try {
      await doSave(false);
    } catch (error) {
      console.warn('自动保存失败', error);
    }
  }, 15000);

  // 返回按钮行为：返回阅读页（若以前有日记）或列表页
  container.querySelector('#editor-back')!.addEventListener('click', () => {
    clearAutoSave();
    if (loadedEntry && loadedEntry.id) {
      navigate('view', { id: loadedEntry.id });
    } else {
      navigate('list');
    }
  });

  container.querySelector('#save-btn')!.addEventListener('click', async () => {
    try {
      const entry = await doSave(false); // 保存日记但不要显示小气泡提示，因为马上要全局提示和跳转了
      if (!entry) {
        showToast('请先输入标题、正文或插入图片', { type: 'warning' });
        return;
      }
      clearAutoSave();
      showToast('日记已保存 ✓', { type: 'success' });
      if (savedEntry && savedEntry.id) {
        navigate('view', { id: savedEntry.id });
      } else {
        navigate('list');
      }
    } catch (error) {
      showToast(getSaveErrorMessage(error), { type: 'error' });
    }
  });

  // --------- 情绪选择器 ---------
  moodCurrent.addEventListener('click', (e) => {
    e.stopPropagation();
    moodDropdown.hidden = !moodDropdown.hidden;
    catPickerDropdown.hidden = true;
  });
  container.querySelectorAll('.mood-option').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedMood = (btn as HTMLElement).dataset.mood as MoodType;
      const cfg = MOOD_CONFIG[selectedMood];
      moodCurrent.innerHTML = `<span>${cfg.emoji}</span><span class="mood-label-text">${cfg.label}</span>`;
      container.querySelectorAll('.mood-option').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      moodDropdown.hidden = true;
      // 情绪变更不触发 3 秒自动保存，由 15 秒定时器抓取
    });
  });

  // --------- 分类下拉选择器 ---------
  container.querySelector('#cat-picker-trigger')!.addEventListener('click', (e) => {
    e.stopPropagation();
    catPickerDropdown.hidden = !catPickerDropdown.hidden;
    moodDropdown.hidden = true;
  });

  /** 更新触发器显示 */
  const updateTrigger = () => {
    const allTags = getAllTagsList();
    const color = selectedCategory ? getCategoryColor(allTags, selectedCategory) : UNCATEGORIZED_COLOR;
    catPickerLabel.textContent = selectedCategory || '未分类';
    catPickerDot.style.background = color;
  };

  /** 动态渲染并绑定下拉选项和事件 */
  const renderDropdownOptions = () => {
    const allTags = getAllTagsList();
    const allEntries = getEntries();
    const stats = buildCategoryStats(allEntries, allTags);

    catPickerDropdown.innerHTML = `
      <!-- 未分类 -->
      <button class="cat-option ${!selectedCategory ? 'active' : ''}" data-cat="" id="cat-opt-none">
        <span class="cat-opt-dot" style="background:${UNCATEGORIZED_COLOR}"></span>
        <span class="cat-opt-name">未分类</span>
        <span class="cat-opt-count">${stats.find(s => s.name === '__none__')?.count ?? 0}篇</span>
      </button>
      <!-- 各分类 -->
      ${allTags.map(tag => {
        const color = getCategoryColor(allTags, tag);
        const count = stats.find(s => s.name === tag)?.count ?? 0;
        const safeTag = escapeHtml(tag);
        return `
          <button class="cat-option ${tag === selectedCategory ? 'active' : ''}" data-cat="${safeTag}" style="--cat-color:${color}">
            <span class="cat-opt-dot" style="background:${color}"></span>
            <span class="cat-opt-name">${safeTag}</span>
            <span class="cat-opt-count">${count}篇</span>
          </button>
        `;
      }).join('')}
      <!-- 新建分类 -->
      <div class="cat-new-wrap">
        <input type="text" id="cat-new-input" class="cat-new-input" placeholder="+ 新建分类…" maxlength="20" autocomplete="off" />
      </div>
      <!-- 管理分类 -->
      <div class="cat-manage-wrap">
        <button class="cat-manage-btn" id="cat-manage-btn" type="button">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
          管理分类...
        </button>
      </div>
    `;

    // 重新绑定选项点击
    catPickerDropdown.querySelectorAll('.cat-option').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedCategory = (btn as HTMLElement).dataset.cat!;
        catPickerDropdown.querySelectorAll('.cat-option').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        catPickerDropdown.hidden = true;
        updateTrigger();
      });
    });

    // 重新绑定新建输入
    const catNewInput = catPickerDropdown.querySelector('#cat-new-input') as HTMLInputElement | null;
    if (catNewInput) {
      catNewInput.addEventListener('keydown', async (e) => {
        if ((e as KeyboardEvent).key !== 'Enter') return;
        const newCat = catNewInput.value.trim().replace(/^#/, '');
        if (!newCat) return;
        catNewInput.value = '';
        
        // 调用全局新建分类
        await addCategory(newCat);
        selectedCategory = newCat;
        catPickerDropdown.hidden = true;
        updateTrigger();
        renderDropdownOptions(); // 刷新
        await doSave(false);
      });
    }

    // 重新绑定管理按钮
    const catManageBtn = catPickerDropdown.querySelector('#cat-manage-btn') as HTMLButtonElement | null;
    if (catManageBtn) {
      catManageBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        // 弹出弹窗
        showCategoryModal(async () => {
          // 弹窗关闭后，刷新 entries
          await refreshEntries();
          
          // 如果当前选择的分类已经不在列表中了，将其设为“未分类”
          const allTagsNow = getAllTagsList();
          if (selectedCategory && !allTagsNow.includes(selectedCategory)) {
            selectedCategory = '';
          }

          updateTrigger();
          renderDropdownOptions(); // 刷新下拉选项
        });
      });
    }
  };

  // 初次渲染下拉框选项
  renderDropdownOptions();

  // 点击外部关闭下拉
  editorDocumentClickHandler = (e: MouseEvent) => {
    if (!container.querySelector('#mood-selector')?.contains(e.target as Node)) {
      moodDropdown.hidden = true;
    }
    if (!container.querySelector('#cat-picker')?.contains(e.target as Node)) {
      catPickerDropdown.hidden = true;
    }
  };
  document.addEventListener('click', editorDocumentClickHandler);
}

function clearAutoSave(): void {
  if (autoSaveTimer) { clearInterval(autoSaveTimer); autoSaveTimer = null; }
  if (editorDocumentClickHandler) {
    document.removeEventListener('click', editorDocumentClickHandler);
    editorDocumentClickHandler = null;
  }
  if (dtPicker) {
    dtPicker.destroy();
    dtPicker = null;
  }
}
