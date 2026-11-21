/* 界面风格是设备偏好；不写进加密学习数据，也不需要登录即可更换。 */
export const THEMES = [
  { id: 'warm', name: '暖米黄', detail: '柔和纸感，适合日常阅读' },
  { id: 'sky', name: '清爽蓝', detail: '明亮清晰，适合整理计划' },
  { id: 'forest', name: '森林绿', detail: '自然平静，适合长时间学习' },
  { id: 'night', name: '深夜蓝', detail: '低亮度界面，适合夜间使用' },
  { id: 'aurora', name: '极光玻璃', detail: '轻盈的雾紫色与通透层次' },
  { id: 'graphite', name: '石墨黑', detail: '沉稳深灰，精细的薄荷色点缀' },
  { id: 'revolution', name: '东方红', detail: '镰刀锤子、红色版画与继续向前的力量' },
  { id: 'plum', name: '梅', detail: '飞雪红梅、暖色纸面与冬日的静心' },
];

const KEY = 'juren.ui.theme';
const FONT_KEY = 'juren.ui.fontSize';
const FRACTURE_KEY = 'juren.ui.glassFracture';
const FRACTURE_OPTIONS = [
  { id: 'off', name: '关闭', detail: '保持完整的液态玻璃' },
  { id: 'hairline', name: '细裂', detail: '轻微的裂纹线条' },
  { id: 'ice', name: '冰裂', detail: '放射状的冰面裂纹' },
  { id: 'crystal', name: '晶片', detail: '更明显的几何碎片' },
];
const COLORS = { warm: '#f4eedf', sky: '#eaf3fa', forest: '#e9f2e8', night: '#05091b', aurora: '#eeeaf7', graphite: '#0b0e11', revolution: '#f6ece3', plum: '#f6eee6' };
const DARK_THEMES = new Set(['night', 'graphite']);
const valid = (id) => THEMES.some((theme) => theme.id === id);

export function currentTheme() {
  return valid(document.documentElement.dataset.theme) ? document.documentElement.dataset.theme : 'warm';
}

function applyTheme(id) {
  const theme = valid(id) ? id : 'warm';
  document.documentElement.dataset.theme = theme;
  const warm = document.getElementById('warmStyles');
  if (warm) {
    warm.disabled = DARK_THEMES.has(theme);
    if (warm.sheet) warm.sheet.disabled = DARK_THEMES.has(theme);
  }
  document.documentElement.style.colorScheme = DARK_THEMES.has(theme) ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', COLORS[theme]);
  document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', DARK_THEMES.has(theme) ? 'dark' : 'light');
  document.querySelectorAll('[data-theme-choice]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.themeChoice === theme));
  });
}

export function setTheme(id) {
  if (!valid(id)) return;
  applyTheme(id);
  try { localStorage.setItem(KEY, id); } catch (_) { /* 无存储权限时仍可本次预览 */ }
}

export function initTheme() {
  applyTheme(currentTheme());
  try { if (localStorage.getItem(KEY) === 'mono') localStorage.setItem(KEY, 'warm'); } catch (_) { /* 本次仍使用暖米黄 */ }
  try { applyFontSize(Number(localStorage.getItem(FONT_KEY)) || 100); } catch (_) { applyFontSize(100); }
  try { applyGlassFracture(localStorage.getItem(FRACTURE_KEY)); } catch (_) { applyGlassFracture('off'); }
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-theme-choice]');
    if (button) setTheme(button.dataset.themeChoice);
    const fractureButton = event.target.closest('[data-fracture-choice]');
    if (fractureButton) setGlassFracture(fractureButton.dataset.fractureChoice);
  });
  window.addEventListener('storage', (event) => {
    if (event.key === KEY) applyTheme(event.newValue);
    if (event.key === FONT_KEY) applyFontSize(Number(event.newValue) || 100);
    if (event.key === FRACTURE_KEY) applyGlassFracture(event.newValue);
  });
  document.addEventListener('input', (event) => {
    if (event.target?.dataset?.fontSizeInput !== undefined) setFontSize(Number(event.target.value));
  });
}

function applyGlassFracture(id) {
  const effect = FRACTURE_OPTIONS.some((option) => option.id === id) ? id : 'off';
  document.documentElement.dataset.glassFracture = effect;
  document.querySelectorAll('[data-fracture-choice]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.fractureChoice === effect));
  });
}

export function setGlassFracture(id) {
  if (!FRACTURE_OPTIONS.some((option) => option.id === id)) return;
  applyGlassFracture(id);
  try { localStorage.setItem(FRACTURE_KEY, id); } catch (_) { /* 本次仍可预览 */ }
}

export function glassFracturePickerHTML() {
  const selected = document.documentElement.dataset.glassFracture || 'off';
  return `<div class="fracture-control" role="group" aria-label="玻璃破碎效果">
    <div class="fracture-heading"><b>玻璃破碎效果</b><small>选择玻璃表面的裂纹；不影响内容与操作。</small></div>
    <div class="fracture-options">
      ${FRACTURE_OPTIONS.map((option) => `<button class="fracture-option" type="button" data-fracture-choice="${option.id}" aria-pressed="${selected === option.id}" title="${option.detail}"><span class="fracture-sample fracture-sample--${option.id}" aria-hidden="true"></span><span class="fracture-label"><b>${option.name}</b><small>${option.detail}</small></span></button>`).join('')}
    </div>
  </div>`;
}

function applyFontSize(value) {
  const size = Number.isFinite(value) ? Math.min(160, Math.max(90, Math.round(value / 5) * 5)) : 100;
  document.documentElement.style.setProperty('--user-font-scale', String(size / 100));
  document.documentElement.dataset.fontSize = String(size);
  document.querySelectorAll('[data-font-size-output]').forEach((el) => { el.textContent = `${size}%`; });
  return size;
}

export function setFontSize(value) {
  const size = applyFontSize(value);
  try { localStorage.setItem(FONT_KEY, String(size)); } catch (_) { /* 本次预览仍有效 */ }
}

export function fontSizeControlHTML() {
  const size = Number(document.documentElement.dataset.fontSize) || 100;
  return `<div class="font-size-control">
    <div><b>字体大小</b><small>调整整个应用的文字，包括标题、日程、错题、按钮和设置</small></div>
    <label><span>小</span><input type="range" min="90" max="160" step="5" value="${size}" data-font-size-input aria-label="字体大小"><span>大</span><output data-font-size-output>${size}%</output></label>
  </div>`;
}

export function themePickerHTML() {
  return `<div class="theme-picker" role="group" aria-label="选择界面风格">
    <div class="theme-options theme-options--large">
      ${THEMES.map((theme) => `<button class="theme-option" type="button" data-theme-choice="${theme.id}" aria-pressed="${currentTheme() === theme.id}">
        <span class="theme-preview theme-preview--${theme.id}" aria-hidden="true"><i></i><i></i><i></i></span>
        <span class="theme-option-copy"><b>${theme.name}</b><small>${theme.detail}</small></span>
        <span class="theme-check" aria-hidden="true">✓</span>
      </button>`).join('')}
    </div>
  </div>`;
}
