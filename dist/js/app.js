/* 聚仁 · 应用主逻辑
 * 单页 PWA，无构建依赖。视图用模板字符串渲染，交互用事件委托。
 */

import * as store from './store.js';
import { fontSizeControlHTML, glassFracturePickerHTML, initTheme, themePickerHTML } from './theme.js?v=38';
import * as remember from './remember.js';
import { icon, weatherMeta, weatherIcon, weatherTip } from './icons.js';
import {
  addDays, buildICS, EVENT_CATEGORIES, findConflicts, hhmmOf, layoutDay,
  minutesOf, parseCSV, parseICS, parseScheduleText, startOfWeek, toISODate, weekdayCN,
} from './parser.js';
import * as ai from './ai.js';
import { cropQuestionPhoto, loadMathRenderer, normalizePhoto, recognizeQuestion, renderQuestionMath } from './question-image.js';
import { ensureWeather, searchCity, weatherFor, demoWeather, DEFAULT_CITY } from './weather.js';

/* ---------------- 基础工具 ---------------- */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (value = '') => String(value).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

const CATEGORY_TONE = {
  course: '#5ea8ff',
  deadline: '#a48cff',
  exam: '#ff7a9a',
  meeting: '#8493ff',
  activity: '#63d6e8',
  personal: '#a99cff',
};
const CATEGORY_NAMES = EVENT_CATEGORIES;
const VIEW_TITLES = { timeline: '时间轴', coach: '错题教练', book: '错题本', settings: '设置与扩展' };
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const SUBJECTS = [
  '高等数学', '线性代数', '大学物理', '程序设计', '大学英语', '电路原理',
  '生理学', '系统解剖学', '生物化学', '有机化学', '分析化学', '医学统计学',
  '数据结构', '数字电路', '微观经济学', '管理学', '法学', '心理学',
  '教育学', '中国文学', '大学语文', '中国近现代史纲要', '其他',
];
const MAJORS = [
  '计算机科学与技术', '软件工程', '人工智能', '电子信息工程', '通信工程', '自动化',
  '机械工程', '土木工程', '生物医学工程', '临床医学', '护理学', '药学',
  '数学与应用数学', '物理学', '化学', '生物科学', '经济学', '金融学', '会计学',
  '工商管理', '法学', '汉语言文学', '英语', '新闻传播学', '心理学', '教育学',
  '历史学', '哲学', '艺术设计', '体育教育', '其他',
];
const ERROR_TYPES = ['概念不清', '计算失误', '审题偏差', '思路卡住', '时间不够', '粗心'];
const IMPORTANCE = {
  normal: { label: '普通', rank: 0 },
  important: { label: '重要', rank: 1 },
  critical: { label: '关键', rank: 2 },
};
const ALARM_OPTIONS = [
  { value: 0, label: '不提醒' },
  { value: 10, label: '提前 10 分钟' },
  { value: 30, label: '提前 30 分钟' },
  { value: 60, label: '提前 1 小时' },
  { value: 180, label: '提前 3 小时' },
  { value: 1440, label: '提前 1 天' },
];

function isNativeApp() {
  if (window.Capacitor?.isNativePlatform?.()) return true;
  // Capacitor 的 WebView 兜底：极少数旧壳未注入全局对象时仍能识别。
  return location.hostname === 'localhost' && /; wv\b/i.test(navigator.userAgent);
}

let nativeBridgePromise = null;
function nativeBridge() {
  if (!isNativeApp()) return Promise.resolve(null);
  nativeBridgePromise ||= import('./native.js').catch((err) => {
    console.warn('[juren] native bridge', err);
    return null;
  });
  return nativeBridgePromise;
}

async function initNativeShell() {
  if (!isNativeApp()) return;
  const bridge = await nativeBridge();
  if (!bridge) return;
  try {
    await bridge.initNative({ onResume: () => scheduleEventAlarms() });
  } catch (err) {
    console.warn('[juren] native init', err);
  }
}

const MAX_DAY_MINUTES = 10 * 60;

let state = null;
let deferredInstall = null;
const savedFocusMinutes = (() => {
  try {
    const value = Number(localStorage.getItem('juren.focus.minutes'));
    return Number.isInteger(value) && value >= 1 && value <= 180 ? value : 25;
  } catch (_) { return 25; }
})();

const MOTIVATION_QUOTES = [
  { text: '世上无难事，只要肯登攀。', author: '毛泽东', work: '《水调歌头·重上井冈山》', url: 'https://cpc.people.com.cn/n1/2025/1102/c443712-40594863.html' },
  { text: '一万年太久，只争朝夕。', author: '毛泽东', work: '《满江红·和郭沫若同志》', url: 'https://zhouenlai.people.com.cn/n1/2020/1229/c409117-31983180.html' },
  { text: '雄关漫道真如铁，而今迈步从头越。', author: '毛泽东', work: '《忆秦娥·娄山关》', url: 'https://cpc.people.com.cn/n1/2026/1024/c443712-40820665.html' },
  { text: '红军不怕远征难，万水千山只等闲。', author: '毛泽东', work: '《七律·长征》', url: 'https://dangshi.people.com.cn/n1/2016/1002/c85037-28755236.html' },
  { text: '更喜岷山千里雪，三军过后尽开颜。', author: '毛泽东', work: '《七律·长征》', url: 'https://dangshi.people.com.cn/n1/2016/0824/c85037-28662162-2.html' },
  { text: '不到长城非好汉，屈指行程二万。', author: '毛泽东', work: '《清平乐·六盘山》', url: 'https://dangshi.people.com.cn/n1/2016/0824/c85037-28662162-2.html' },
  { text: '苍山如海，残阳如血。', author: '毛泽东', work: '《忆秦娥·娄山关》', url: 'https://cpc.people.com.cn/GB/68742/70427/70428/4984124.html' },
  { text: '俱往矣，数风流人物，还看今朝。', author: '毛泽东', work: '《沁园春·雪》', url: 'https://culture.people.com.cn/GB/n1/2018/1226/c1013-30489094.html' },
  { text: '为有牺牲多壮志，敢教日月换新天。', author: '毛泽东', work: '《七律·到韶山》', url: 'https://culture.people.com.cn/GB/n1/2018/1226/c1013-30489094.html' },
  { text: '牢骚太盛防肠断，风物长宜放眼量。', author: '毛泽东', work: '《七律·和柳亚子先生》', url: 'https://dangshi.people.com.cn/n1/2016/1226/c85037-28977241.html' },
  { text: '天若有情天亦老，人间正道是沧桑。', author: '毛泽东', work: '《七律·人民解放军占领南京》', url: 'https://dangshi.people.com.cn/n/2014/0409/c85037-24856844-5.html' },
  { text: '自信人生二百年，会当水击三千里。', author: '毛泽东', work: '诗句（见《对〈毛主席诗词〉若干词句的解释》）', url: 'https://tj.people.com.cn/n2/2020/0817/c375366-34232353.html' },
  { text: '万类霜天竞自由。', author: '毛泽东', work: '《沁园春·长沙》', url: 'https://cpc.people.com.cn/n1/2023/0508/c443712-32680914.html' },
  { text: '踏遍青山人未老，风景这边独好。', author: '毛泽东', work: '《清平乐·会昌》', url: 'https://cpc.people.com.cn/n1/2026/1026/c443712-40821591.html' },
  { text: '到中流击水，浪遏飞舟。', author: '毛泽东', work: '《沁园春·长沙》', url: 'https://cpc.people.com.cn/n1/2023/0908/c443712-40073122.html' },
  { text: '可上九天揽月，可下五洋捉鳖，谈笑凯歌还。', author: '毛泽东', work: '《水调歌头·重上井冈山》', url: 'https://theory.people.com.cn/n1/2024/1217/c40764-40383872.html' },
  { text: '独有英雄驱虎豹，更无豪杰怕熊罴。', author: '毛泽东', work: '《七律·冬云》', url: 'https://cpc.people.com.cn/n1/2023/0908/c443712-40073122.html' },
  { text: '五岭逶迤腾细浪，乌蒙磅礴走泥丸。', author: '毛泽东', work: '《七律·长征》', url: 'https://dangshi.people.com.cn/n1/2020/0909/c85037-31854569.html' },
  { text: '地上本没有路，走的人多了，也便成了路。', author: '鲁迅', work: '《故乡》', url: 'https://dangshi.people.com.cn/n/2015/0914/c85037-27580735.html' },
  { text: '愿中国青年都摆脱冷气，只是向上走。', author: '鲁迅', work: '《热风·随感录四十一》', url: 'https://opinion.people.com.cn/n1/2021/0914/c438450-32226046.html' },
  { text: '长风破浪会有时，直挂云帆济沧海。', author: '李白', work: '《行路难》', url: 'https://paper.people.com.cn/rmrbhwb/html/2016-03/24/content_1663613.htm' },
  { text: '会当凌绝顶，一览众山小。', author: '杜甫', work: '《望岳》', url: 'https://paper.people.com.cn/rmrbhwb/html/2016-01/15/content_1647882.htm' },
];

const ui = {
  view: 'timeline',
  weekStart: startOfWeek(new Date()),
  selectedDay: todayISO(),
  filter: 'all',
  wrongMode: false,
  wrongPhoto: null,
  ocrPhoto: null,
  cropActive: false,
  cropRect: null,
  photoMode: 'image',
  ocrDraft: '',
  ocrAlternative: '',
  photoBusy: false,
  photoVerified: false,
  typing: false,
  busy: false,
  importTab: 'text',
  importDraft: '',
  importImage: null,
  pendingImports: [],
  pendingBackup: null,
  aiStatus: { checked: false, ok: false, llm: false, model: null },
  weatherBusy: false,
  focus: { remaining: savedFocusMinutes * 60, running: false, timer: null, total: savedFocusMinutes * 60 },
  quoteIndex: Math.floor(Math.random() * MOTIVATION_QUOTES.length),
  quoteSwapping: false,
  lockTimer: null,
  clockTimer: null,
  alarmTimers: new Map(),
  notificationBusy: false,
  remembered: false,
};

/* ---------------- 时间 / 格式 ---------------- */

function todayISO() {
  return toISODate(new Date());
}

function parseLocal(iso, time = '00:00') {
  return new Date(`${iso}T${time.length === 5 ? time : '00:00'}:00`);
}

function fmtDate(iso, withWeekday = false) {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  const base = `${d.getMonth() + 1}月${d.getDate()}日`;
  return withWeekday ? `${base} ${WEEKDAYS[d.getDay()]}` : base;
}

function fmtShort(iso) {
  const d = new Date(`${iso}T00:00:00`);
  return `${d.getMonth() + 1}.${String(d.getDate()).padStart(2, '0')}`;
}

function relativeDay(iso) {
  if (!iso) return '';
  const today = todayISO();
  const diff = Math.round((parseLocal(iso) - parseLocal(today)) / 86400000);
  if (diff === 0) return '今天';
  if (diff === 1) return '明天';
  if (diff === 2) return '后天';
  if (diff === -1) return '昨天';
  return fmtDate(iso, true);
}

function timeAgo(isoDateTime) {
  if (!isoDateTime) return '';
  const diff = Date.now() - new Date(isoDateTime).getTime();
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
  return `${Math.floor(diff / 86400000)} 天前`;
}

function hhmm(date = new Date()) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function durationLabel(start, end) {
  const m = Math.max(0, minutesOf(end) - minutesOf(start));
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const rest = m % 60;
    return rest ? `${h} 小时 ${rest} 分` : `${h} 小时`;
  }
  return `${m} 分钟`;
}

function kickerFor(date = new Date()) {
  const month = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][date.getMonth()];
  const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  return `${days[date.getDay()]}, ${date.getDate()} ${month}`;
}

function isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function isToday(iso) {
  return iso === todayISO();
}

function isPastEvent(ev) {
  return parseLocal(ev.date, ev.end || ev.start) < new Date();
}

function currentTimeMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function id(prefix = 'x') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function download(filename, content, mime = 'application/json') {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function showToast(message, type = 'ok') {
  const root = $('#toastRoot');
  const el = document.createElement('div');
  el.className = `toast${type === 'error' ? ' is-error' : ''}`;
  el.innerHTML = `${icon(type === 'error' ? 'alert' : 'check', 15)}<span>${esc(message)}</span>`;
  root.appendChild(el);
  setTimeout(() => {
    el.classList.add('is-out');
    setTimeout(() => el.remove(), 320);
  }, 3200);
}

function masteryOf(q) {
  return Math.max(0, Math.min(100, Math.round(Number(q?.mastery) || 0)));
}

function initials(name) {
  return String(name || '同学').trim().slice(0, 1) || '知';
}

function mdLite(text = '') {
  const lines = esc(text).split('\n');
  let html = '';
  let list = null;
  const flush = () => {
    if (list) { html += `</${list}>`; list = null; }
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { flush(); continue; }
    const ul = line.match(/^\s*[-·]\s+(.*)$/);
    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ul || ol) {
      const tag = ul ? 'ul' : 'ol';
      if (list !== tag) { flush(); html += `<${tag}>`; list = tag; }
      html += `<li>${inline(line.replace(/^\s*(?:[-·]|\d+\.)\s+/, ''))}</li>`;
      continue;
    }
    flush();
    if (/^###\s+/.test(line)) {
      html += `<h4>${inline(line.replace(/^###\s+/, ''))}</h4>`;
    } else {
      html += `<p>${inline(line)}</p>`;
    }
  }
  flush();
  return html;
}

function inline(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

/* ---------------- 启动 / 登录 ---------------- */

async function init() {
  initTheme();
  bindGlobalEvents();
  const accounts = store.listAccounts();
  renderAuthMode(accounts.length ? 'login' : 'create');
  registerSW();
  initNativeShell();
  if (accounts.length && window.isSecureContext && crypto?.subtle) {
    try {
      const saved = await remember.restoreRemembered();
      if (saved) {
        await store.unlock(saved.username, saved.password);
        ui.remembered = true;
        await enterApp();
        return;
      }
    } catch (err) {
      console.warn('[juren] 自动解锁失败，改用密码登录', err);
      await remember.clearRemembered().catch(() => {});
    }
  }
  if (!window.isSecureContext || !crypto?.subtle) {
    const err = $('#authError');
    err.textContent = '当前页面不是安全上下文。请用 localhost 或 HTTPS 打开，浏览器才会允许本地加密。';
    err.hidden = false;
    $('#authSubmit').disabled = true;
  }
  $('#boot').classList.add('is-gone');
  $('#authView').hidden = false;
  $('#appView').hidden = true;
  if (accounts.length) {
    const last = store.lastUsername();
    const pick = accounts.find((a) => a.username === last) || accounts[0];
    $('#loginUser').value = pick?.username || '';
    setTimeout(() => $('#loginPass')?.focus(), 350);
  } else {
    setTimeout(() => $('#createName')?.focus(), 350);
  }

}

function renderAuthMode(mode) {
  const isCreate = mode === 'create';
  $('#loginFields').hidden = isCreate;
  $('#createFields').hidden = !isCreate;
  $('#authKicker').textContent = isCreate ? 'CREATE YOUR SPACE' : 'WELCOME BACK';
  $('#authTitle').textContent = isCreate ? '建一个只属于你的空间' : '回到你的学习空间';
  $('#authSub').textContent = isCreate
    ? '先设一个密码。它不会离开这台设备，也不会被我们知道。'
    : '输入密码，解开只属于你的本地保险箱。';
  $('#authSubmit span').textContent = isCreate ? '创建并进入' : '解锁空间';
  $('#authSwitch').textContent = isCreate ? '已有空间，去登录' : '创建新空间';
  $('#authSwitch').dataset.mode = isCreate ? 'login' : 'create';
  $('#authError').hidden = true;
  const secure = window.isSecureContext && Boolean(globalThis.crypto?.subtle);
  const submit = $('#authSubmit');
  submit.disabled = !secure;
  submit.innerHTML = `<span>${isCreate ? '创建并进入' : '解锁空间'}</span>${icon('arrow', 18)}`;
  if (!secure) {
    const err = $('#authError');
    err.textContent = '当前页面不是安全上下文。请用 localhost 或 HTTPS 打开，浏览器才会允许本地加密。';
    err.hidden = false;
  }
  $('#authForm').dataset.mode = mode;
}

async function submitAuth(e) {
  e.preventDefault();
  const mode = $('#authForm').dataset.mode;
  const err = $('#authError');
  err.hidden = true;
  const btn = $('#authSubmit');
  const old = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span>正在解开…</span>';
  try {
    const keepSignedIn = $('#rememberDevice').checked;
    let username;
    let password;
    if (mode === 'create') {
      password = $('#createPass').value;
      if (password !== $('#createPass2').value) throw new Error('两次输入的密码不一致');
      username = $('#createUser').value.trim();
      const displayName = $('#createName').value.trim() || username;
      if (!username) throw new Error('请填写用户名');
      if (password.length < 8) throw new Error('密码至少 8 位');
      await store.createAccount({
        username,
        displayName,
        password,
        major: $('#createMajor')?.value.trim() || '',
      });
    } else {
      username = $('#loginUser').value.trim();
      password = $('#loginPass').value;
      await store.unlock(username, password);
    }
    try {
      if (keepSignedIn) await remember.saveRemembered(username, password);
      else await remember.clearRemembered();
      ui.remembered = keepSignedIn;
    } catch (rememberError) {
      // 清除失败时保留原状态，避免把仍可自动解锁的设备误报为已关闭。
      if (keepSignedIn) ui.remembered = false;
      console.warn('[juren] 无法记住此设备', rememberError);
      showToast(keepSignedIn ? '已进入空间，但此浏览器无法保存免密登录' : '已进入空间，但未能清除旧的免密记录', 'error');
    }
    await enterApp();
    btn.disabled = false;
    btn.innerHTML = old;
  } catch (ex) {
    err.textContent = ex.message || '无法打开空间';
    err.hidden = false;
    btn.disabled = false;
    btn.innerHTML = old;
  }
}

async function enterApp() {
  state = store.getState();
  $('#authView').hidden = true;
  $('#appView').hidden = false;
  $('#boot').classList.add('is-gone');
  $('#loginPass').value = '';
  $('#createPass').value = '';
  $('#createPass2').value = '';
  ui.weekStart = startOfWeek(new Date());
  ui.wrongMode = false;
  ui.typing = false;
  ui.busy = false;
  ui.pendingImports = [];
  ui.importDraft = '';
  ui.importImage = null;
  ui.aiStatus = { checked: false, ok: false, llm: false, model: null };
  ui.view = ['timeline', 'coach', 'book', 'settings'].includes(location.hash.replace('#', ''))
    ? location.hash.replace('#', '') : 'timeline';
  renderShell();
  navigate(ui.view, true);
  startClock();
  scheduleAutoLock();
  refreshWeather();
  scheduleEventAlarms();
  checkDueAlarms();
  if (!state.profile.onboardingDone) setTimeout(openOnboardingSheet, 450);
  if (state.profile.settings.aiMode === 'server') refreshAiStatus();
}

/* ---------------- 外壳 ---------------- */

function renderShell() {
  if (!state) return;
  const name = state.profile.name || '同学';
  $('#userName').textContent = name;
  $('#userAvatar').textContent = initials(name);
  $('#sidebarFocusTitle').textContent = nextEventLabel();
  const load = loadOfDay(todayISO());
  $('#sidebarMeterBar').style.width = `${Math.min(100, load.pct)}%`;
  $('#sidebarFocusSub').textContent = load.pct > 80
    ? '今天排得很满，给自己留一点喘气。'
    : load.count
      ? `已排 ${load.hours} 小时 · 还有余量`
      : '留一点空白给意外。';
  updateWeatherChip();
  updateTopbar();
  $$('[data-nav]').forEach((el) => el.classList.toggle('is-active', el.dataset.nav === ui.view));
  document.title = `${VIEW_TITLES[ui.view] || '聚仁'} · 聚仁`;
}

function nextEventLabel() {
  const next = getNextEvent();
  if (!next) return '今天没有下一件事';
  return `${next.start} ${next.title}`;
}

function updateTopbar() {
  $('#topbarKicker').textContent = kickerFor(new Date());
  $('#topbarTitle').textContent = VIEW_TITLES[ui.view] || '聚仁';
}

function updateWeatherChip() {
  if (!state) return;
  const w = weatherFor(state.weather, todayISO());
  const meta = weatherMeta(w.code);
  $('#weatherChipIcon').innerHTML = weatherIcon(w.code, 18);
  $('#weatherChipTemp').textContent = `${w.max}°`;
  $('#weatherChipCity').textContent = state.profile.settings.city?.name || '北京';
  $('#weatherChip').title = `${meta.label} · ${state.profile.settings.city?.name || '北京'} · 点击更换城市`;
}

function navigate(view, replace = false) {
  if (!state) return;
  ui.view = view;
  if (location.hash !== `#${view}`) {
    if (replace) history.replaceState(null, '', `#${view}`);
    else history.pushState(null, '', `#${view}`);
  }
  $$('[data-nav]').forEach((el) => el.classList.toggle('is-active', el.dataset.nav === view));
  renderShell();
  renderView();
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function renderView() {
  if (!state) return;
  const root = $('#viewRoot');
  const preserveCoachScroll = ui.view === 'coach' && !!root.querySelector('.coach-page');
  const pageY = preserveCoachScroll ? window.scrollY : 0;
  const composerY = preserveCoachScroll ? root.querySelector('.composer')?.scrollTop : null;
  // 重建错题表单时先占住原高度，避免浏览器把当前页面位置夹回顶部。
  if (preserveCoachScroll) root.style.minHeight = `${root.offsetHeight}px`;
  const draft = ui.view === 'coach' && ui.wrongMode ? captureWrongForm() : null;
  if (ui.view === 'timeline') root.innerHTML = timelineHTML();
  else if (ui.view === 'coach') {
    root.innerHTML = coachHTML();
    if (draft) restoreWrongForm(draft);
    if (preserveCoachScroll) {
      const composer = root.querySelector('.composer');
      if (composer && composerY !== null) composer.scrollTop = composerY;
      window.scrollTo({ top: pageY, behavior: 'instant' });
      requestAnimationFrame(() => {
        window.scrollTo({ top: pageY, behavior: 'instant' });
        root.style.minHeight = '';
      });
    }
    requestAnimationFrame(scrollChat);
  } else if (ui.view === 'book') root.innerHTML = bookHTML();
  else root.innerHTML = settingsHTML();
  if (ui.view === 'settings') refreshAiStatus();
  updateTopbar();
}

const WRONG_FORM_IDS = ['wrongSubject', 'wrongType', 'wrongText', 'wrongMine', 'wrongCorrect', 'chatInput'];
function captureWrongForm() {
  return Object.fromEntries(WRONG_FORM_IDS.map((key) => [key, $(`#${key}`)?.value ?? '']));
}
function restoreWrongForm(draft) {
  for (const [key, value] of Object.entries(draft)) {
    const el = $(`#${key}`);
    if (el) el.value = value;
  }
}

async function updateQuestionMathPreview() {
  const target = $('#questionMathPreview');
  if (!target) return;
  const source = $('#wrongOcrDraft')?.value || '';
  if (!source.trim()) { target.textContent = '修正识别内容后，这里会预览题目和公式。'; return; }
  target.textContent = '正在排版公式…';
  try {
    const katex = await loadMathRenderer();
    if (target.isConnected) target.innerHTML = renderQuestionMath(source, katex);
  } catch (err) {
    if (target.isConnected) target.textContent = err.message;
  }
}

function showQuestionMath(root, source) {
  if (!/[\\$]/.test(source)) return;
  loadMathRenderer().then((katex) => {
    if (root.isConnected) root.innerHTML = renderQuestionMath(source, katex);
  }).catch(() => {});
}

/* ---------------- 时钟 / 天气 / 专注 / 锁定 ---------------- */

function startClock() {
  clearInterval(ui.clockTimer);
  ui.clockTimer = setInterval(() => {
    if (!state) return;
    const dot = $('.now-line');
    if (dot) {
      const min = currentTimeMinutes();
      if (min >= 360 && min <= 1440) {
        dot.style.left = `${((min - 360) / 1080) * 100}%`;
        const label = dot.querySelector('span');
        if (label) label.textContent = hhmm();
      }
    }
    checkDueAlarms();
    if (ui.view === 'timeline') {
      const count = $('#nextCountdown');
      if (count) count.innerHTML = nextCountdownHTML();
    }
  }, 30000);
}

async function refreshWeather(force = false) {
  if (!state || ui.weatherBusy) return;
  const city = state.profile.settings.city;
  const cached = state.weather;
  ui.weatherBusy = true;
  try {
    const weather = await ensureWeather(city, cached, force);
    if (!state) return;
    state.weather = weather;
    state.meta.lastWeatherAt = new Date().toISOString();
    store.persistSoon(1200);
    updateWeatherChip();
    if (ui.view === 'timeline') renderView();
  } catch (err) {
    console.warn('[juren] weather', err);
  } finally {
    ui.weatherBusy = false;
  }
}


/* ---------------- 日程闹钟 ---------------- */

function clearAlarmTimers() {
  for (const timer of ui.alarmTimers.values()) clearTimeout(timer);
  ui.alarmTimers.clear();
}

function notificationSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

async function requestNotificationPermission() {
  if (isNativeApp()) {
    const bridge = await nativeBridge();
    if (!bridge) return false;
    const ok = await bridge.requestNativePermission();
    if (ok) {
      state.profile.settings.notifyEnabled = true;
      store.persistSoon();
      await bridge.scheduleNative(state.events);
      showToast('系统闹钟已开启：重要日程到点会通知你');
    } else {
      showToast('没有拿到通知权限，请在系统设置里允许聚仁通知', 'error');
    }
    return ok;
  }
  if (!notificationSupported()) {
    showToast('当前浏览器不支持系统通知；可以导出 .ics 到系统日历提醒', 'error');
    return false;
  }
  if (Notification.permission === 'granted') {
    state.profile.settings.notifyEnabled = true;
    store.persistSoon();
    scheduleEventAlarms();
    return true;
  }
  if (Notification.permission === 'denied') {
    showToast('通知权限被浏览器拒绝，请在网站设置里重新开启', 'error');
    return false;
  }
  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      state.profile.settings.notifyEnabled = true;
      store.persistSoon();
      scheduleEventAlarms();
      showToast('提醒已开启：重要日程到点会通知你');
      return true;
    }
    showToast('没有开启通知；日程仍会保留，可随时在设置里开启', 'error');
  } catch {
    showToast('无法申请通知权限；可以导出 .ics 到系统日历', 'error');
  }
  return false;
}

function checkDueAlarms() {
  if (!state || isNativeApp()) return;
  const now = Date.now();
  for (const ev of state.events) {
    const minutes = Number(ev.alarm || 0);
    if (!minutes || !ev.date || !ev.start || ev.alarmFiredAt) continue;
    const at = parseLocal(ev.date, ev.start).getTime() - minutes * 60000;
    if (at <= now && now - at < 15 * 60000) {
      const importance = IMPORTANCE[ev.importance] || IMPORTANCE.normal;
      showToast(`提醒 · ${ev.start} ${ev.title}${ev.location ? ` @ ${ev.location}` : ''}（${importance.label}）`);
      if (navigator.vibrate) navigator.vibrate(ev.importance === 'critical' ? [180, 80, 180] : [120]);
      ev.alarmFiredAt = new Date().toISOString();
      store.persistSoon();
    }
  }
}

function scheduleEventAlarms() {
  clearAlarmTimers();
  if (!state) return;
  if (isNativeApp()) {
    nativeBridge().then((bridge) => bridge?.scheduleNative(state.events))
      .catch((err) => console.warn('[juren] native schedule', err));
    return;
  }
  if (!notificationSupported() || Notification.permission !== 'granted') return;
  const now = Date.now();
  for (const ev of state.events) {
    const minutes = Number(ev.alarm || 0);
    if (!minutes || !ev.date || !ev.start) continue;
    const at = parseLocal(ev.date, ev.start).getTime() - minutes * 60000;
    if (ev.alarmFiredAt && new Date(ev.alarmFiredAt).getTime() >= at) continue;
    const delay = at - now;
    if (delay > 0 && delay < 2147483647) {
      const timer = setTimeout(() => showEventNotification(ev), delay);
      ui.alarmTimers.set(ev.id, timer);
    } else if (delay <= 0 && delay > -15 * 60000 && !ev.alarmFiredAt) {
      const timer = setTimeout(() => showEventNotification(ev), 800);
      ui.alarmTimers.set(ev.id, timer);
    }
  }
}

async function showEventNotification(ev) {
  if (!state || isNativeApp() || !notificationSupported()) return;
  if (Notification.permission !== 'granted') return;
  if (ev.alarmFiredAt) return;
  const importance = IMPORTANCE[ev.importance] || IMPORTANCE.normal;
  const title = `聚仁 · ${importance.label}日程`;
  const body = `${ev.start} ${ev.title}${ev.location ? ` · ${ev.location}` : ''}`;
  const options = {
    body,
    icon: './icons/icon-192.png',
    badge: './icons/favicon-32.png',
    tag: `event-${ev.id}`,
    renotify: true,
    data: { url: './#timeline' },
    vibrate: ev.importance === 'critical' ? [220, 100, 220, 100, 220] : [180, 80, 180],
  };
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) await reg.showNotification(title, options);
      else new Notification(title, options);
    } else {
      new Notification(title, options);
    }
  } catch {
    try { new Notification(title, options); } catch { /* 浏览器限制 */ }
  }
  ev.alarmFiredAt = new Date().toISOString();
  store.persistSoon();
}

async function testNotification() {
  if (isNativeApp()) {
    const bridge = await nativeBridge();
    const ok = await bridge?.testNative();
    if (ok) showToast('测试通知已发出，约 1 秒后出现');
    else showToast('通知权限未开启，请到系统设置里允许聚仁通知', 'error');
    return;
  }
  const ok = await requestNotificationPermission();
  if (!ok) return;
  const options = {
    body: '这是一条测试提醒。重要日程到点会这样通知你。',
    icon: './icons/icon-192.png',
    tag: 'juren-test',
    data: { url: './#timeline' },
  };
  if ('serviceWorker' in navigator) {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) await reg.showNotification('聚仁 · 提醒测试', options);
    else new Notification('聚仁 · 提醒测试', options);
  } else {
    new Notification('聚仁 · 提醒测试', options);
  }
}

function focusStripHTML() {
  if (!state.modules.focus) return '';
  const today = todayISO();
  const sessions = (state.focusSessions || []).filter((s) => s.date === today);
  const minutes = sessions.reduce((sum, s) => sum + s.minutes, 0);
  return `
    <div class="focus-strip">
      <div class="focus-label">${icon('timer', 15)} 专注舱</div>
      <b id="focusClock">${focusClockText()}</b>
      <label class="focus-duration">时长 <input id="focusMinutes" type="number" inputmode="numeric" min="1" max="180" step="1" value="${ui.focus.total / 60}" ${ui.focus.running ? 'disabled' : ''} aria-label="专注时长，分钟"> 分钟</label>
      <button class="btn btn--sm btn--primary" data-action="focus-toggle" type="button">${ui.focus.running ? '暂停' : `开始 ${ui.focus.total / 60} 分钟`}</button>
      <button class="btn btn--sm btn--ghost" data-action="focus-reset" type="button">重置</button>
      <span class="focus-meta">今天 ${minutes} 分钟 · ${sessions.length} 段</span>
    </div>`;
}

function motivationQuoteContentHTML(quote) {
  return `<span class="motivation-kicker">今日一句 · 砥砺前行</span><blockquote>${esc(quote.text)}</blockquote>
    <figcaption>— ${esc(quote.author)} <a href="${quote.url}" target="_blank" rel="noopener noreferrer" title="查看原文出处">${esc(quote.work)}</a></figcaption>`;
}

function motivationQuoteHTML() {
  return `<figure class="motivation-quote">
    <span class="motivation-star" aria-hidden="true">★</span>
    <div class="motivation-copy" aria-live="polite">${motivationQuoteContentHTML(MOTIVATION_QUOTES[ui.quoteIndex])}</div>
    <button class="motivation-next" data-action="next-quote" type="button" aria-label="换一句名言">换一句</button>
  </figure>`;
}

async function flipMotivationQuote() {
  if (ui.quoteSwapping || MOTIVATION_QUOTES.length < 2) return;
  const nextIndex = (ui.quoteIndex + 1 + Math.floor(Math.random() * (MOTIVATION_QUOTES.length - 1))) % MOTIVATION_QUOTES.length;
  const card = $('.motivation-quote');
  const copy = card?.querySelector('.motivation-copy');
  const update = () => {
    ui.quoteIndex = nextIndex;
    if (copy?.isConnected) copy.innerHTML = motivationQuoteContentHTML(MOTIVATION_QUOTES[nextIndex]);
  };
  if (!card || !copy) {
    update();
    if (!copy) renderView();
    return;
  }

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const outClass = reducedMotion ? 'is-fading-out' : 'is-flipping-out';
  const inClass = reducedMotion ? 'is-fading-in' : 'is-flipping-in';
  ui.quoteSwapping = true;
  const button = card.querySelector('.motivation-next');
  button.disabled = true;
  button.textContent = '换卡中…';
  card.setAttribute('aria-busy', 'true');
  card.style.height = `${card.getBoundingClientRect().height}px`;
  try {
    card.classList.add(outClass);
    await new Promise((resolve) => setTimeout(resolve, reducedMotion ? 220 : 420));
    update();
    if (!card.isConnected) return;
    card.style.height = '';
    card.style.height = `${card.offsetHeight}px`;
    card.classList.remove(outClass);
    card.classList.add(inClass);
    await new Promise((resolve) => setTimeout(resolve, reducedMotion ? 260 : 480));
  } finally {
    card.classList.remove(outClass, inClass);
    card.style.height = '';
    card.removeAttribute('aria-busy');
    button.disabled = false;
    button.textContent = '换一句';
    ui.quoteSwapping = false;
  }
}

function focusClockText() {
  const m = Math.floor(ui.focus.remaining / 60);
  const s = ui.focus.remaining % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function toggleFocus() {
  if (ui.focus.running) {
    clearInterval(ui.focus.timer);
    ui.focus.running = false;
    ui.focus.timer = null;
  } else {
    ui.focus.running = true;
    ui.focus.timer = setInterval(() => {
      ui.focus.remaining -= 1;
      const el = $('#focusClock');
      if (el) el.textContent = focusClockText();
      if (ui.focus.remaining <= 0) {
        clearInterval(ui.focus.timer);
        ui.focus.running = false;
        ui.focus.timer = null;
        state.focusSessions.push({
          id: id('focus'), date: todayISO(), minutes: ui.focus.total / 60, label: '专注', at: new Date().toISOString(),
        });
        store.persistSoon();
        showToast(`${ui.focus.total / 60} 分钟完成，已记入今天的节奏`);
        ui.focus.remaining = ui.focus.total;
        if (ui.view === 'timeline') renderView();
      }
    }, 1000);
  }
  if (ui.view === 'timeline') renderView();
}

function resetFocus() {
  clearInterval(ui.focus.timer);
  ui.focus.running = false;
  ui.focus.timer = null;
  ui.focus.remaining = ui.focus.total;
  if (ui.view === 'timeline') renderView();
}

function scheduleAutoLock() {
  clearTimeout(ui.lockTimer);
  // 用户选择保持登录后，超时锁定会与下次免密进入冲突。
  // 保持登录期间暂停超时锁定；主动点击“锁定”仍会撤销免密。
  if (ui.remembered) return;
  const minutes = Number(state?.profile?.settings?.autoLockMin || 0);
  if (!minutes) return;
  ui.lockTimer = setTimeout(() => {
    if (state) lockApp(true);
  }, minutes * 60000);
}

async function lockApp(auto = false) {
  if (!state) return;
  clearTimeout(ui.lockTimer);
  clearInterval(ui.clockTimer);
  clearInterval(ui.focus.timer);
  ui.focus.running = false;
  ui.focus.timer = null;
  await store.lock();
  try {
    await remember.clearRemembered();
    ui.remembered = false;
    $('#rememberDevice').checked = false;
  } catch (err) {
    console.warn('[juren] 无法撤销设备免密', err);
    showToast('已锁定，但免密记录未能删除；再次打开可能自动进入', 'error');
  }
  state = null;
  $('#authView').hidden = false;
  $('#appView').hidden = true;
  renderAuthMode('login');
  const last = store.lastUsername();
  if (last) $('#loginUser').value = last;
  setTimeout(() => $('#loginPass')?.focus(), 200);
  if (auto) showToast('超过一段时间未操作，已自动锁定');
}

function registerSW() {
  if (isNativeApp()) return;
  if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
  navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('[juren] sw', err));
}

/* ---------------- 事件绑定（全局） ---------------- */

function bindGlobalEvents() {
  $('#authForm').addEventListener('submit', submitAuth);
  $('#authSwitch').addEventListener('click', () => {
    const next = $('#authSwitch').dataset.mode || 'create';
    renderAuthMode(next);
    if (next === 'create') $('#createName')?.focus();
  });
  $('#lockBtn').addEventListener('click', () => lockApp());
  $('#mobileLock').addEventListener('click', () => lockApp());
  $('#quickAddBtn').addEventListener('click', () => openEventSheet());
  $('#weatherChip').addEventListener('click', openCitySheet);
  $('#sheetClose').addEventListener('click', closeSheet);
  $('#sheet').addEventListener('click', handleSheetClick);
  $('#sheet').addEventListener('input', handleSheetInput);
  $('#sheet').addEventListener('change', handleSheetChange);
  $('#sheet').addEventListener('submit', handleSheetSubmit);
  document.addEventListener('click', (event) => {
    const nav = event.target.closest('[data-nav]');
    if (!nav || !state) return;
    event.preventDefault();
    navigate(nav.dataset.nav);
  });
  $('#viewRoot').addEventListener('click', handleViewClick);
  $('#viewRoot').addEventListener('keydown', handleViewKeydown);
  $('#viewRoot').addEventListener('input', handleViewInput);
  $('#viewRoot').addEventListener('change', handleViewChange);
  $('#viewRoot').addEventListener('pointerdown', handleQuestionCropPointerDown);
  $('#viewRoot').addEventListener('pointermove', handleQuestionCropPointerMove);
  $('#viewRoot').addEventListener('pointerup', handleQuestionCropPointerUp);
  $('#viewRoot').addEventListener('pointercancel', handleQuestionCropPointerUp);
  $('#viewRoot').addEventListener('scroll', () => {
    const top = $('#topbar');
    if (top) top.classList.toggle('is-scrolled', window.scrollY > 4);
  }, { passive: true });
  window.addEventListener('scroll', () => {
    const top = $('#topbar');
    if (top) top.classList.toggle('is-scrolled', window.scrollY > 4);
  }, { passive: true });
  window.addEventListener('hashchange', () => {
    if (!state) return;
    const v = location.hash.replace('#', '');
    if (VIEW_TITLES[v] && v !== ui.view) navigate(v, true);
  });
  document.addEventListener('paste', (event) => {
    if (!state || !$('#sheet').open || ui.importTab !== 'image') return;
    const item = [...(event.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
    if (!item) return;
    const file = item.getAsFile();
    if (file) {
      event.preventDefault();
      readImageFile(file);
    }
  });
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstall = e;
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && state) store.flush().catch(() => {});
    if (document.visibilityState === 'visible' && state) scheduleEventAlarms();
  });
  window.addEventListener('beforeunload', () => { if (state) store.flush().catch(() => {}); });
  ['pointerdown', 'keydown', 'touchstart', 'wheel'].forEach((evt) => {
    window.addEventListener(evt, () => { if (state) scheduleAutoLock(); }, { passive: true });
  });
}

/* =========================================================
   时间轴
   ========================================================= */

function getNextEvent() {
  const today = todayISO();
  const nowMin = currentTimeMinutes();
  const list = [...state.events]
    .filter((e) => !e.done)
    .sort((a, b) => `${a.date}T${a.start}`.localeCompare(`${b.date}T${b.start}`));
  return list.find((e) => e.date > today
    || (e.date === today && minutesOf(e.end || e.start) >= nowMin)) || null;
}

function nextCountdownHTML() {
  const next = getNextEvent();
  if (!next) return '这一周还没有安排，先加一件最重要的事。';
  const now = new Date();
  const start = parseLocal(next.date, next.start);
  const end = parseLocal(next.date, next.end || next.start);
  if (now >= start && now <= end) {
    return `<b>进行中</b><span>· 到 ${next.end} 结束</span>`;
  }
  const diff = Math.max(0, Math.round((start - now) / 60000));
  if (diff < 60) return `<b>${diff} 分钟</b><span>后开始</span>`;
  const days = Math.floor(diff / 1440);
  const hours = Math.floor((diff % 1440) / 60);
  const mins = diff % 60;
  const when = days > 0 ? `还有 ${days} 天 ${hours} 小时` : `还有 ${hours} 小时 ${mins} 分`;
  return `<b>${when}</b><span>· ${relativeDay(next.date)} ${next.start}</span>`;
}

function loadOfDay(iso) {
  const events = state.events.filter((e) => e.date === iso);
  const minutes = events.reduce((sum, e) => sum + Math.max(15, minutesOf(e.end) - minutesOf(e.start)), 0);
  const pct = Math.min(100, Math.round((minutes / MAX_DAY_MINUTES) * 100));
  return {
    count: events.length,
    minutes,
    hours: (minutes / 60).toFixed(minutes % 60 === 0 ? 0 : 1),
    free: Math.max(0, ((MAX_DAY_MINUTES - minutes) / 60)).toFixed(minutes > MAX_DAY_MINUTES ? 0 : 1),
    pct,
  };
}

function toneColor(tone) {
  return {
    sun: '#c08a2e',
    cloud: '#a8a18a',
    rain: '#8a8f80',
    storm: '#8f7f74',
    snow: '#c2b8a4',
    fog: '#b7ab95',
  }[tone] || '#b28433';
}

function timelineHTML() {
  const start = ui.weekStart;
  const days = [...Array(7)].map((_, i) => addDays(start, i));
  const startISO = toISODate(days[0]);
  const endISO = toISODate(days[6]);
  const weekEvents = state.events.filter((e) => e.date >= startISO && e.date <= endISO);
  const deadlines = weekEvents.filter((e) => e.category === 'deadline').length;
  const conflicts = findConflicts(weekEvents);
  const isCurrentWeek = toISODate(startOfWeek(new Date())) === startISO;
  const todayLoad = loadOfDay(todayISO());
  const todayWeather = weatherFor(state.weather, todayISO());
  const twMeta = weatherMeta(todayWeather.code);
  const next = getNextEvent();
  const nextStart = next ? parseLocal(next.date, next.start) : null;
  const nextRel = next ? relativeDay(next.date) : '';

  const headline = isCurrentWeek ? '这周，留点余量。' : '把下一周，先摆出来。';
  const summary = weekEvents.length
    ? `${weekEvents.length} 个日程 · ${deadlines} 个截止 · ${conflicts.length ? `${conflicts.length} 处时间冲突` : '没有冲突'}`
    : '这一周还空着。先放三件最重要的事，再让通知住进来。';

  const nextCard = next ? `
    <article class="next-card">
      <p class="eyebrow eyebrow--light">UP NEXT / 接下来</p>
      <div class="next-main">
        <div class="next-time">${esc(next.start)}</div>
        <div class="next-info">
          <h3>${esc(next.title)}</h3>
          <p>${esc(nextRel)}${next.location ? ` · ${esc(next.location)}` : ''}${next.end && next.end !== next.start ? ` · ${durationLabel(next.start, next.end)}` : ''}${next.importance && next.importance !== 'normal' ? ` · <b class="imp-text">${IMPORTANCE[next.importance]?.label || '重要'}</b>` : ''}</p>
        </div>
      </div>
      <div class="next-count" id="nextCountdown">${nextStart ? nextCountdownHTML() : ''}</div>
    </article>` : `
    <article class="next-card">
      <p class="eyebrow eyebrow--light">UP NEXT / 接下来</p>
      <div class="next-empty">
        <h3>这周还没有下一件事。</h3>
        <p>先放一件真正重要的事，其他的可以慢慢来。</p>
      </div>
      <button class="btn btn--sm btn--ghost next-add-button" data-action="add-event" type="button">${icon('plus', 14)} 添加日程</button>
    </article>`;

  return `
    <section class="view timeline-page">
      <div class="timeline-head">
        <div>
          <p class="eyebrow">TIME RIVER / WEEK ${isoWeek(start)}</p>
          <h2>${headline}</h2>
          <p>${summary}</p>
        </div>
        <div class="timeline-actions">
          <button class="btn btn--soft" data-action="go-coach-photo" type="button">${icon('scan', 16)} 拍照录错题</button>
          <button class="btn btn--primary" data-action="open-import" type="button">${icon('scan', 16)} 识别通知</button>
          <button class="btn btn--ghost" data-action="add-event" type="button">${icon('plus', 16)} 新日程</button>
        </div>
      </div>

      <div class="hero-grid">
        ${nextCard}

        <article class="metric-card">
          <div class="metric-top">
            <div>
              <p class="metric-label">今日负荷</p>
              <p class="metric-value">${todayLoad.pct}<small>%</small></p>
            </div>
            <div class="ring" style="--p:${todayLoad.pct}"><b>${todayLoad.hours}h</b></div>
          </div>
          <p class="metric-note">${todayLoad.count
            ? `${todayLoad.count} 件事 · 还有约 ${todayLoad.free} 小时空档`
            : '今天还空着。适合放一件重要但不紧急的事。'}</p>
        </article>

        <article class="metric-card">
          <div class="weather-mini-top">
            <div>
              <p class="metric-label">今天的天气</p>
              <p class="weather-mini-temp">${todayWeather.max}°<small> / ${todayWeather.min}°</small></p>
            </div>
            <span class="weather-mini-icon">${weatherIcon(todayWeather.code, 28)}</span>
          </div>
          <p class="weather-mini-desc">${twMeta.label}${todayWeather.precip >= 30 ? ` · 降水 ${todayWeather.precip}%` : ''}${state.weather?.source === 'demo' ? ' · 示例' : ''}</p>
          <p class="weather-mini-tip">${weatherTip(todayWeather.code, todayWeather.precip)}</p>
        </article>
      </div>

      ${motivationQuoteHTML()}
      <div class="mobile-glance" aria-label="今日概览">
        <div class="glance-item">
          <span>今日负荷</span>
          <b>${todayLoad.pct}%</b>
          <small>${todayLoad.hours}h · ${todayLoad.count} 件</small>
        </div>
        <div class="glance-item">
          <span>天气</span>
          ${weatherIcon(todayWeather.code, 18)}
          <b>${todayWeather.max}°</b>
          <small>${twMeta.label}${todayWeather.precip >= 30 ? ` · 降水 ${todayWeather.precip}%` : ''}</small>
        </div>
      </div>

      ${focusStripHTML()}

      <div class="timeline-toolbar">
        <div class="week-nav">
          <button class="btn btn--ghost btn--icon week-btn" data-action="week-prev" type="button" aria-label="上一周">${icon('chevronLeft', 16)}</button>
          <span class="week-label"><b>${fmtShort(startISO)}</b> — ${fmtShort(endISO)}</span>
          <button class="btn btn--ghost btn--icon week-btn" data-action="week-next" type="button" aria-label="下一周">${icon('chevronRight', 16)}</button>
          <button class="btn btn--ghost btn--sm week-today" data-action="week-today" type="button">本周</button>
        </div>
        <div class="layer-chips">
          <span class="layer-label">并行层</span>
          <button class="chip-toggle" data-action="toggle-layer" data-layer="weather" aria-pressed="${state.modules.weather}" type="button">天气</button>
          <button class="chip-toggle" data-action="toggle-layer" data-layer="deadline" aria-pressed="${state.modules.deadline}" type="button">截止日</button>
          <button class="chip-toggle" data-action="toggle-layer" data-layer="focus" aria-pressed="${state.modules.focus}" type="button">专注舱</button>
        </div>
      </div>

      <div class="week-strip" role="group" aria-label="选择本周日期">
        ${days.map((day) => {
          const iso = toISODate(day);
          const count = weekEvents.filter((event) => event.date === iso).length;
          const selected = ui.selectedDay === iso || (!days.some((d) => toISODate(d) === ui.selectedDay) && iso === (isCurrentWeek ? todayISO() : startISO));
          return `<button class="week-day ${isToday(iso) ? 'is-today' : ''} ${selected ? 'is-selected' : ''}" data-action="jump-day" data-date="${iso}" type="button" aria-pressed="${selected}" aria-label="${weekdayCN(day)} ${day.getMonth() + 1}月${day.getDate()}日，${count ? `${count}项日程` : '暂无日程'}">
            <span class="week-day-name">${weekdayCN(day)}</span><b>${day.getDate()}</b><span class="week-day-count">${count ? `${count} 件` : '留白'}</span>
          </button>`;
        }).join('')}
      </div>

      <div class="timeline-board ${state.modules.weather ? '' : 'layer-weather-off'} ${state.modules.deadline ? '' : 'layer-deadline-off'}">
        <div class="tl-scroll">
          <div class="tl-inner">
            ${timelineAxisHTML(start)}
            ${days.map((d, i) => timelineLaneHTML(d, i, conflicts)).join('')}
          </div>
        </div>
        <div class="timeline-foot">
          <div class="legend">
            ${Object.entries(CATEGORY_NAMES).map(([key, name]) => `<span><i style="--c:${CATEGORY_TONE[key]}"></i>${name}</span>`).join('')}
          </div>
          <span class="timeline-hint">${icon('plus', 11)} 单击空白新建 · 点日程查看 · 左右滚动</span>
        </div>
      </div>
      ${timelineAgendaHTML(days, weekEvents)}
    </section>`;
}

function timelineAgendaHTML(days, weekEvents) {
  return `<div class="week-agenda" aria-label="周一到周日日程">
    ${days.map((day) => {
      const iso = toISODate(day);
      const events = weekEvents.filter((event) => event.date === iso).sort((a, b) => a.start.localeCompare(b.start));
      const weather = weatherFor(state.weather, iso);
      const weekend = day.getDay() === 0 || day.getDay() === 6;
      return `<section class="agenda-day ${isToday(iso) ? 'is-today' : ''} ${weekend ? 'is-weekend' : ''}" data-date="${iso}">
        <div class="agenda-day-head">
          <div class="agenda-date"><span>${weekdayCN(day)}</span><b>${day.getDate()}</b><small>${day.getMonth() + 1}月</small></div>
          <div class="agenda-day-summary"><strong>${isToday(iso) ? '今天' : events.length ? `${events.length} 项安排` : '留给自己'}</strong><span>${state.modules.weather ? `${weatherIcon(weather.code, 15)} ${weather.max}°` : '日程概览'}</span></div>
          <button class="agenda-add" data-action="add-event-day" data-date="${iso}" type="button" aria-label="在${weekdayCN(day)}添加日程">${icon('plus', 17)}</button>
        </div>
        <div class="agenda-events">
          ${events.length ? events.map((event) => `<button class="agenda-event" data-action="open-event" data-id="${esc(event.id)}" type="button" style="--event-color:${CATEGORY_TONE[event.category] || CATEGORY_TONE.personal}">
            <span class="agenda-time">${esc(event.start)}</span><span class="agenda-event-info"><b>${esc(event.title)}</b><small>${esc(CATEGORY_NAMES[event.category] || '日程')}${event.location ? ` · ${esc(event.location)}` : ''}</small></span>${event.importance === 'critical' ? '<span class="agenda-important">重点</span>' : ''}
          </button>`).join('') : '<p class="agenda-empty">这一天还没有安排，可以留白，也可以添加一件重要的事。</p>'}
        </div>
      </section>`;
    }).join('')}
  </div>`;
}

function timelineAxisHTML(start) {
  const labels = [];
  for (let h = 6; h <= 24; h += 3) {
    labels.push(`<span class="tl-hour" style="left:${((h - 6) / 18) * 100}%">${String(h).padStart(2, '0')}:00</span>`);
  }
  return `<div class="tl-axis"><div class="tl-gutter">${start.getMonth() + 1} 月 / 时</div><div class="tl-hours">${labels.join('')}</div></div>`;
}

function timelineLaneHTML(day, index, conflicts) {
  const iso = toISODate(day);
  const dayEvents = state.events.filter((e) => e.date === iso);
  const { events, columns } = layoutDay(dayEvents);
  const laneH = Math.max(66, 18 + columns * 30 + 24);
  const w = weatherFor(state.weather, iso);
  const meta = weatherMeta(w.code);
  const conflictIds = new Set();
  conflicts.forEach(({ a, b }) => { conflictIds.add(a.id); conflictIds.add(b.id); });
  const today = isToday(iso);
  const weekend = day.getDay() === 0 || day.getDay() === 6;
  const precip = w.precip >= 30 ? `<span class="precip">降水 ${w.precip}%</span>` : '';

  const eventsHTML = events.map((ev) => {
    const rawStart = minutesOf(ev.start);
    const rawEnd = Math.max(rawStart + 15, minutesOf(ev.end));
    const startMin = Math.max(360, Math.min(1439, rawStart));
    const endMin = Math.max(startMin + 15, Math.min(1440, rawEnd));
    const left = ((startMin - 360) / 1080) * 100;
    const width = Math.max(1.2, ((endMin - startMin) / 1080) * 100);
    const isConflict = conflictIds.has(ev.id);
    const isShort = (endMin - startMin) < 45 || width < 3.8;
    const isCompact = width < 9.5;
    const isLate = startMin >= 23 * 60;
    const posStyle = isLate
      ? `right:2px;left:auto;width:62px;--col:${ev._col}`
      : `--left:${left}%;--width:${width}%;--col:${ev._col}`;
    const importance = ev.importance || 'normal';
    return `<button class="tl-event tl-event--${esc(ev.category)} imp-${esc(importance)} ${isConflict ? 'is-conflict' : ''} ${ev.done ? 'is-done' : ''} ${isShort ? 'is-short' : ''} ${isCompact ? 'is-compact' : ''} ${isLate ? 'is-late' : ''}"
      style="${posStyle}"
      data-action="open-event" data-id="${esc(ev.id)}"
      title="${esc(`${ev.start}–${ev.end} ${ev.title}${ev.location ? ` @ ${ev.location}` : ''}${importance !== 'normal' ? ` · ${IMPORTANCE[importance]?.label}` : ''}`)}"
      aria-label="${esc(`${ev.title}，${ev.start} 到 ${ev.end}${ev.location ? `，地点 ${ev.location}` : ''}`)}">
      <span class="ev-time">${esc(ev.start)}</span>
      <span class="ev-title">${esc(ev.title)}</span>
      ${importance !== 'normal' ? `<span class="ev-star" title="${IMPORTANCE[importance]?.label || '重要'}日程">${importance === 'critical' ? '!!' : '★'}</span>` : ''}
      ${isConflict ? '<span class="conflict-mark" title="与另一项日程重叠">!</span>' : ''}
    </button>`;
  }).join('');

  const now = new Date();
  const showNow = today && currentTimeMinutes() >= 360 && currentTimeMinutes() <= 1440;
  const nowPct = ((currentTimeMinutes() - 360) / 1080) * 100;
  const nowHTML = showNow
    ? `<div class="now-line ${nowPct > 78 ? 'is-right' : ''}" style="left:${nowPct}%"><span>${hhmm(now)}</span></div>`
    : '';

  return `
    <div class="tl-lane ${today ? 'is-today' : ''} ${weekend ? 'is-weekend' : ''}" style="--i:${index};--lane-h:${laneH}px" data-date="${iso}">
      <div class="lane-gutter">
        <div class="lane-date"><span class="dow">${weekdayCN(day)}</span><span class="num">${String(day.getDate()).padStart(2, '0')}</span></div>
        <span class="lane-weather">${weatherIcon(w.code, 14)} ${w.max}°</span>
        <div class="lane-meta">
          <span class="mini-dot"></span>${dayEvents.length ? `${dayEvents.length} 件` : '留白'}
          ${conflictIds.size && dayEvents.some((e) => conflictIds.has(e.id)) ? '<span class="conflict"> · 有冲突</span>' : ''}
          ${precip}
        </div>
      </div>
      <div class="lane-rail" data-date="${iso}" title="单击空白处，在这个时间新建日程">
        <i class="weather-ribbon" style="--ribbon:${toneColor(meta.tone)}"></i>
        ${eventsHTML}
        ${!events.length ? '<span class="empty-lane">留白，也是一种安排。</span>' : ''}
        ${nowHTML}
      </div>
    </div>`;
}

/* =========================================================
   错题教练
   ========================================================= */

function coachHTML() {
  const total = state.questions.length;
  const due = state.questions.filter((q) => q.nextReview && q.nextReview <= todayISO()).length;
  const isServer = state.profile.settings.aiMode === 'server';
  const isDirect = state.profile.settings.aiMode === 'direct';
  return `
    <section class="view coach-page">
      <div class="page-lead">
        <div>
          <p class="eyebrow">DIALOGUE / 错题不是收藏</p>
          <h2>把错题，拆成下一次的判断。</h2>
          <p>${total ? `已记住 ${total} 道错题${due ? `，今天有 ${due} 道待复习` : ''}。` : '从第一道错题开始，我会慢慢记住你。'}</p>
        </div>
        <span class="pill ${isServer ? 'pill--server' : isDirect ? 'pill--local' : 'pill--local'}">${isServer ? 'MODEL GATEWAY' : isDirect ? 'YOUR API' : 'LOCAL ENGINE'}</span>
      </div>

      <div class="coach-layout">
        <section class="chat-panel" aria-label="与错题教练对话">
          <div class="chat-head">
            <span class="coach-avatar">序</span>
            <div class="chat-head-info">
              <b>聚仁教练</b>
              <small><i class="status-dot"></i>${isServer ? `模型网关 · ${esc(state.profile.settings.aiModel || '默认模型')}` : isDirect ? `自己的 API · ${esc(state.profile.settings.aiModel || '模型')}` : '本地推演 · 数据不出设备'}</small>
            </div>
            <span class="pill ${isServer ? 'pill--server' : 'pill--local'}">${isServer ? 'API' : isDirect ? 'DIRECT' : 'LOCAL'}</span>
          </div>

          <div class="chat-scroll" id="chatScroll">
            <div class="chat-day">今天 · 对话</div>
            ${state.chats.map(chatMessageHTML).join('')}
            ${state.chats.length <= 1 && !ui.typing ? chatStartersHTML() : ''}
            ${ui.typing ? typingHTML() : ''}
          </div>

          <div class="composer">
            <div class="composer-top">
              <button class="wrong-toggle" data-action="wrong-toggle" aria-pressed="${ui.wrongMode}" type="button">标记为错题</button>
              <div class="photo-quick-actions">
                <label class="photo-picker" for="questionCamera">📷 拍照录题<input class="photo-file-input" id="questionCamera" type="file" accept="image/*" capture="environment" aria-label="拍摄题目"></label>
                <label class="photo-picker" for="questionGallery">选相册<input class="photo-file-input" id="questionGallery" type="file" accept="image/*" aria-label="选择题目图片"></label>
              </div>
            </div>
            <p class="photo-capture-tip">拍照时请对焦题目，让文字清晰、画面尽量拍正，避开反光和屏幕边框。</p>

            <div class="wrong-fields" id="wrongFields" ${ui.wrongMode ? '' : 'hidden'}>
              <div class="form-grid form-grid--2">
                <label class="field"><span>学科</span>
                  <input id="wrongSubject" list="subjectOptions" value="高等数学" placeholder="高数 / 生理学 / 法学…">
                  <datalist id="subjectOptions">${SUBJECTS.map((s) => `<option value="${esc(s)}"></option>`).join('')}</datalist>
                </label>
                <label class="field"><span>你觉得自己错在哪</span>
                  <select id="wrongType">${ERROR_TYPES.map((s) => `<option>${s}</option>`).join('')}</select>
                </label>
              </div>
              <label class="field"><span>题目（文字或照片）</span>
                <textarea id="wrongText" placeholder="可以直接输入题目，也可以拍照或从相册选择。"></textarea>
              </label>
              <div class="photo-entry">
                ${ui.wrongPhoto ? `
                  <div class="photo-crop-wrap ${ui.cropActive ? 'is-cropping' : ''}" id="questionCropWrap">
                    <img class="question-photo-preview" src="${ui.wrongPhoto}" alt="本次题目原图">
                    ${ui.cropActive ? '<div class="photo-crop-selection" id="photoCropSelection" hidden></div>' : ''}
                  </div>
                  <div class="photo-crop-controls">
                    <button class="btn btn--soft btn--sm" data-action="toggle-question-crop" type="button">${ui.cropActive ? '取消框选' : '框选题目区域'}</button>
                    ${ui.cropActive ? '<button class="btn btn--primary btn--sm" data-action="confirm-question-crop" type="button">使用框选区域识别</button>' : ''}
                    ${ui.ocrPhoto ? '<span class="crop-status">已框选识别区域 <button data-action="clear-question-crop" type="button">撤销</button></span>' : '<span class="crop-status">拍到边框或反光时，先框选题目。</span>'}
                  </div>
                  ${ui.ocrPhoto ? `<img class="crop-preview" src="${ui.ocrPhoto}" alt="本地识别使用的框选区域">` : ''}
                  <div class="photo-mode" role="group" aria-label="图片保存方式">
                    <button class="${ui.photoMode === 'image' ? 'is-selected' : ''}" data-action="question-photo-mode" data-mode="image" type="button">直接保存原图</button>
                    <button class="${ui.photoMode === 'text' ? 'is-selected' : ''}" data-action="question-photo-mode" data-mode="text" type="button">提取文字与公式</button>
                    <button data-action="remove-question-photo" type="button">移除图片</button>
                  </div>
                  ${ui.photoMode === 'text' ? `
                    <div class="photo-ocr-action" role="group" aria-label="从图片中提取文字">
                      <span class="photo-ocr-step">下一步 · 从图片识别题目</span>
                      <button class="btn btn--primary photo-ocr-start" data-action="recognize-question" type="button" ${ui.photoBusy ? 'disabled' : ''}>${ui.photoBusy ? '正在识别…' : '开始提取文字 →'}</button>
                      <span class="photo-ocr-hint">点击后，识别结果会出现在下方，可修改并核对。</span>
                    </div>
                    <p class="photo-help">先框选题目并尽量拍正、拍清晰。首次识别会下载约 45 MB 的中文模型，之后在本机运行；公式请对照原图改成 LaTeX，例如 <code>$\\frac{1}{2}$</code>。识别稿必须核对。</p>
                    ${ui.ocrAlternative ? '<button class="btn btn--ghost btn--sm" data-action="switch-ocr-draft" type="button">比较另一版识别</button>' : ''}
                    <textarea id="wrongOcrDraft" class="ocr-draft" placeholder="识别结果会显示在这里，可手动修正文字和公式。">${esc(ui.ocrDraft)}</textarea>
                    <div id="questionMathPreview" class="math-preview" aria-live="polite"></div>
                    <label class="photo-check"><input id="photoVerified" type="checkbox" ${ui.photoVerified ? 'checked' : ''}> 我已对照原图核对题目文字和公式</label>
                  ` : '<p class="photo-help">原图会保存到错题本。图片模式不会假装已经读懂题目；需要分析题意，请先提取并核对文字。</p>'}
                ` : '<p class="photo-help">支持手机摄像头和相册，原图会随错题保存在当前设备。</p>'}
              </div>
              <div class="form-grid form-grid--2">
                <label class="field"><span>我的答案 / 思路</span>
                  <textarea id="wrongMine" placeholder="当时是怎么想的？"></textarea>
                </label>
                <label class="field"><span>正确答案</span>
                  <textarea id="wrongCorrect" placeholder="如果知道的话"></textarea>
                </label>
              </div>
            </div>

            <div class="composer-input">
              <textarea id="chatInput" rows="1" placeholder="${ui.wrongMode ? '补充你当时的思路，或直接发送…' : '贴一道题，或问我怎么安排时间…'}" aria-label="输入消息"></textarea>
              <button class="send-btn" data-action="send-chat" type="button" title="发送" ${ui.busy ? 'disabled' : ''}>${icon('send', 16)}</button>
            </div>
          </div>
        </section>

        ${profileHTML()}
      </div>
    </section>`;
}

function chatMessageHTML(m) {
  const q = m.questionId ? state.questions.find((x) => x.id === m.questionId) : null;
  if (m.role === 'assistant' && m.kind === 'analysis' && q) {
    return `
      <div class="msg msg--assistant">
        <span class="msg-avatar">序</span>
        <div class="msg-wrap">
          <div class="msg-meta"><b>聚仁教练</b><span>${timeAgo(m.createdAt)}</span></div>
          ${analysisCardHTML(q)}
        </div>
      </div>`;
  }
  const isUser = m.role === 'user';
  return `
    <div class="msg ${isUser ? 'msg--user' : 'msg--assistant'}">
      <span class="msg-avatar">${isUser ? esc(initials(state.profile.name)) : '序'}</span>
      <div class="msg-wrap">
        <div class="msg-meta"><b>${isUser ? esc(state.profile.name) : '聚仁教练'}</b><span>${timeAgo(m.createdAt)}</span></div>
        <div class="msg-bubble">
          ${isUser && m.kind === 'wrong' ? `<span class="wrong-badge">${icon('alert', 10)} 错题 · ${esc(m.subject || '未分类')}</span>` : ''}
          ${mdLite(m.content || '')}
          ${q?.imageDataUrl ? `<img class="chat-question-photo" src="${esc(q.imageDataUrl)}" alt="错题原图">` : ''}
        </div>
      </div>
    </div>`;
}

function analysisCardHTML(q) {
  const a = q.analysis || {};
  const engine = a.engine === 'image' ? '原图已保存' : a.engine === 'server' ? '大模型分析' : a.engine === 'direct' ? 'API 直连' : a.engine === 'server-fallback' || a.engine === 'direct-fallback' ? '模型格式回退' : '本地推演';
  const tags = (a.tags || q.tags || []).map((t) => `<span class="tag tag--forest">${esc(t)}</span>`).join('');
  const steps = (a.steps || []).map((s) => `<div class="analysis-step">${esc(s)}</div>`).join('');
  const review = q.nextReview ? `下次复习 ${relativeDay(q.nextReview)}` : '等待安排复习';
  return `
    <div class="analysis-card">
      <div class="analysis-top">
        <div class="analysis-tags">${tags}</div>
        <span class="pill pill--quiet">${engine}</span>
      </div>
      <div class="analysis-body">
        <p class="analysis-summary">${esc(a.summary || '这道题已经收进错题本。')}</p>
        ${a.memory ? `<div class="memory-note">${esc(a.memory)}</div>` : ''}
        ${a.diagnosis ? `<div class="analysis-block"><h4>错因诊断</h4><p>${esc(a.diagnosis)}</p></div>` : ''}
        ${steps ? `<div class="analysis-block"><h4>下一次这样做</h4><div class="analysis-steps">${steps}</div></div>` : ''}
        ${a.variant ? `<div class="variant-box"><b>变式训练 / TRANSFER</b><p>${esc(a.variant)}</p></div>` : ''}
        <div class="review-row">
          <span class="tag tag--gold">${esc(review)}</span>
          <span class="tag">掌握度 ${masteryOf(q)}%</span>
          <span class="tag">${esc(q.errorType || '未标注错因')}</span>
        </div>
        <div class="analysis-actions">
          <button class="btn btn--sm btn--soft" data-action="open-question" data-id="${esc(q.id)}" type="button">打开错题卡</button>
          <button class="btn btn--sm btn--ghost" data-action="explain-simple" data-id="${esc(q.id)}" type="button">再讲简单点</button>
        </div>
      </div>
    </div>`;
}


function chatStartersHTML() {
  return `
    <div class="chat-starters">
      <p>你可以这样开始</p>
      <div>
        <button data-action="chat-starter" data-mode="wrong" type="button">分析一道错题</button>
        <button data-action="chat-starter" data-mode="chat" data-text="这周事情很多，帮我看看怎么安排更合理。" type="button">这周怎么安排</button>
        <button data-action="chat-starter" data-mode="chat" data-text="我总是在计算题上丢分，有什么检查流程？" type="button">怎么减少粗心</button>
      </div>
    </div>`;
}

function typingHTML() {
  return `
    <div class="msg msg--assistant">
      <span class="msg-avatar">序</span>
      <div class="msg-wrap">
        <div class="msg-meta"><b>聚仁教练</b><span>正在整理</span></div>
        <div class="msg-bubble"><span class="typing"><i></i><i></i><i></i></span></div>
      </div>
    </div>`;
}

function profileHTML() {
  const learner = state.profile.learner || {};
  const total = state.questions.length;
  const due = state.questions.filter((q) => q.nextReview && q.nextReview <= todayISO());
  const tagRows = Object.entries(learner.tagStats || {})
    .map(([tag, stat]) => {
      const qs = state.questions.filter((q) => q.tags?.includes(tag));
      const mastery = qs.length
        ? Math.round(qs.reduce((sum, q) => sum + masteryOf(q), 0) / qs.length)
        : Math.max(12, 58 - (stat.wrong || 0) * 9);
      return { tag, stat, mastery };
    })
    .sort((a, b) => a.mastery - b.mastery)
    .slice(0, 3);

  const errorEntries = Object.entries(learner.errorTypes || {}).sort((a, b) => b[1] - a[1]);
  const errorTotal = errorEntries.reduce((sum, [, n]) => sum + n, 0) || 1;

  return `
    <aside class="profile-panel" aria-label="学习画像">
      <div class="profile-head">
        <p class="eyebrow">LEARNING PORTRAIT</p>
        <h3>学习画像</h3>
        <p>${esc(state.profile.major || '专业未填写')}${state.profile.grade ? ` · ${esc(state.profile.grade)}` : ''} · 已分析 ${total} 道错题 · ${Math.max(0, state.chats.length - 1)} 次对话 · 越用越懂你。</p>
      </div>

      <div class="profile-section">
        <div class="profile-section-title">这学期目标 <span>MEMORY</span></div>
        <p class="due-empty" style="font-size:calc(10px * var(--user-font-scale));line-height:1.7;color:var(--ink-2)">${esc(state.profile.goal || '还没有填写目标。去设置 → 我的档案里补一句。')}</p>
        <button class="link-btn" data-nav="settings" type="button" style="margin-top:5px">编辑档案 / 目标</button>
      </div>

      <div class="profile-section">
        <div class="profile-section-title">最需要回看 <span>${total ? '按掌握度' : '等待数据'}</span></div>
        ${tagRows.length ? tagRows.map((row) => `
          <div class="weak-item">
            <div class="weak-top"><b>${esc(row.tag)}</b><span>掌握 ${row.mastery}%</span></div>
            <div class="bar ${row.mastery < 45 ? 'bar--coral' : ''}"><i style="width:${Math.max(6, row.mastery)}%"></i></div>
          </div>`).join('') : '<p class="due-empty">贴第一道错题后，这里会出现你的高频卡点。</p>'}
      </div>

      <div class="profile-section">
        <div class="profile-section-title">错因分布 <span>累计 ${errorTotal} 次</span></div>
        ${errorEntries.length ? errorEntries.slice(0, 3).map(([type, count]) => `
          <div class="error-row">
            <span><i></i>${esc(type)}</span>
            <b>${Math.round((count / errorTotal) * 100)}%</b>
          </div>`).join('') : '<p class="due-empty">还没有足够的错因记录。</p>'}
      </div>

      <div class="profile-section">
        <div class="profile-section-title">教练记住的 <span>可调整</span></div>
        <div class="memory-chips">
          ${['步骤化讲解', '先提示后答案', '多给变式', '晚上复盘'].map((p) => `<button class="tag pref-chip ${(learner.preferences || []).includes(p) ? 'is-on' : ''}" data-action="toggle-pref" data-pref="${esc(p)}" aria-pressed="${(learner.preferences || []).includes(p)}" type="button">${esc(p)}</button>`).join('')}
        </div>
      </div>

      <div class="profile-section">
        <div class="profile-section-title">待复习 <span>${due.length} 道</span></div>
        ${due.length ? `<div class="due-list">${due.slice(0, 4).map((q) => `
          <button class="due-item" data-action="open-question" data-id="${esc(q.id)}" type="button">
            <span class="due-dot"></span>
            <span style="min-width:0"><b>${esc(q.tags?.[0] || q.subject)} · ${esc(q.subject)}</b><small>${q.nextReview <= todayISO() ? '今天到期' : relativeDay(q.nextReview)} · 掌握 ${masteryOf(q)}%</small></span>
          </button>`).join('')}</div>` : '<p class="due-empty">今天没有到期的错题。可以去时间轴看看下一步。</p>'}
      </div>

      <div class="profile-section">
        <div class="profile-section-title">连续记录 <span>STREAK</span></div>
        <p class="due-empty"><b style="font-family:var(--mono);font-size:calc(18px * var(--user-font-scale));color:var(--ink)">${learner.streak || 0}</b> 天 · 保持比用力更重要。</p>
      </div>
    </aside>`;
}

function scrollChat() {
  const el = $('#chatScroll');
  if (el) el.scrollTop = el.scrollHeight;
}

function scrollToLatestAnalysis() {
  const el = $('#chatScroll');
  if (!el) return;
  const turns = $$('.msg--user', el);
  const anchor = turns[turns.length - 1] || $$('.analysis-card', el).at(-1);
  if (!anchor) { scrollChat(); return; }
  const top = anchor.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop - 14;
  el.scrollTop = Math.max(0, top);
}

function captureMemory(text) {
  if (!state || !text) return [];
  const facts = [];
  let m = text.match(/(?:我的|这学期的|我这学期的)?目标(?:是|：|:)\s*([^。\n；;]{2,80})/);
  if (m) {
    state.profile.goal = m[1].trim();
    facts.push('目标');
  }
  m = text.match(/我(?:是|读|学)([\u4e00-\u9fa5A-Za-z]{2,20})(?:专业|系)/);
  if (m) {
    state.profile.major = m[1].trim();
    facts.push('专业');
  }
  m = text.match(/我(?:每天|通常|一般)([^。\n；;]{2,30})(?:学习|看书|复习)/);
  if (m) {
    state.profile.studyWindow = m[1].trim();
    facts.push('学习时段');
  }
  if (facts.length) {
    store.persistSoon(0);
    showToast(`记住了你的${facts.join('、')}，下次分析会带上`);
  }
  return facts;
}

async function sendChat() {
  if (!state || ui.busy) return;
  const main = $('#chatInput');
  const mainText = main?.value.trim() || '';
  ui.busy = true;
  ui.typing = true;

  if (ui.wrongMode) {
    const withPhoto = Boolean(ui.wrongPhoto);
    const useOCR = withPhoto && ui.photoMode === 'text';
    const inputText = $('#wrongText')?.value.trim() || mainText;
    const text = useOCR ? ui.ocrDraft.trim() : inputText || (withPhoto ? '【图片题目】' : '');
    if (!text || (useOCR && (!ui.ocrDraft.trim() || !ui.photoVerified))) {
      ui.busy = false;
      ui.typing = false;
      showToast(useOCR ? '请先核对识别结果，勾选确认后再保存' : '请填写题目或添加照片', 'error');
      return;
    }
    if (useOCR) {
      try {
        const katex = await loadMathRenderer();
        renderQuestionMath(text, katex);
      } catch (err) {
        ui.busy = false;
        ui.typing = false;
        showToast(`公式排版有误：${err.message}`, 'error');
        return;
      }
    }
    const payload = {
      subject: $('#wrongSubject')?.value || '其他',
      errorType: $('#wrongType')?.value || '思路卡住',
      text,
      myAnswer: $('#wrongMine')?.value.trim() || '',
      correctAnswer: $('#wrongCorrect')?.value.trim() || '',
    };
    const userMsg = {
      id: id('chat'),
      role: 'user',
      kind: 'wrong',
      content: text,
      subject: payload.subject,
      createdAt: new Date().toISOString(),
    };
    state.chats.push(userMsg);
    store.persistSoon(0);
    renderView();
    scrollChat();

    let pendingQuestion = null;
    const learnerBefore = structuredClone(state.profile.learner);
    try {
      const imageOnly = withPhoto && !useOCR;
      const analysis = imageOnly ? {
        summary: '题目原图已保存，复习时可以打开查看。',
        diagnosis: '图片模式不自动分析题意。需要具体分析，请选择“提取文字与公式”，对照原图核对后提交。',
        memory: '', steps: [], variant: '', nextActions: [], confidence: 'none', engine: 'image', tags: [],
      } : await ai.analyzeWrong(payload, state, state.profile.settings);
      if (!state) return;
      const tags = (analysis.tags && analysis.tags.length) ? analysis.tags : ai.detectTags(payload);
      const prior = state.questions.filter((q) => q.tags?.some((t) => tags.includes(t)));
      const no = state.questions.reduce((max, q) => Math.max(max, q.no || 0), 0) + 1;
      const mastery = Math.max(16, 34 - prior.length * 4);
      const question = {
        id: id('q'),
        no,
        subject: payload.subject,
        text: payload.text,
        imageDataUrl: withPhoto ? ui.wrongPhoto : null,
        myAnswer: payload.myAnswer,
        correctAnswer: payload.correctAnswer,
        errorType: payload.errorType,
        tags,
        mastery,
        nextReview: toISODate(addDays(new Date(), 1)),
        createdAt: new Date().toISOString(),
        analysis: {
          summary: analysis.summary,
          diagnosis: analysis.diagnosis,
          memory: analysis.memory,
          steps: analysis.steps,
          variant: analysis.variant,
          nextActions: analysis.nextActions,
          confidence: analysis.confidence,
          engine: analysis.engine,
          model: analysis.model,
        },
        reviews: [],
      };
      state.questions.push(question);
      pendingQuestion = question;
      userMsg.questionId = question.id;

      const learner = state.profile.learner;
      learner.tagStats = learner.tagStats || {};
      for (const tag of tags) {
        const s = learner.tagStats[tag] || { attempts: 0, wrong: 0, lastAt: null };
        s.attempts += 1;
        s.wrong += 1;
        s.lastAt = new Date().toISOString();
        learner.tagStats[tag] = s;
      }
      learner.errorTypes = learner.errorTypes || {};
      learner.errorTypes[payload.errorType] = (learner.errorTypes[payload.errorType] || 0) + 1;
      learner.streak = Math.max(1, learner.streak || 0);
      learner.sessions = (learner.sessions || 0) + 1;
      learner.lastActiveAt = new Date().toISOString();

      state.chats.push({
        id: id('chat'),
        role: 'assistant',
        kind: 'analysis',
        content: analysis.summary,
        questionId: question.id,
        createdAt: new Date().toISOString(),
      });
      await store.flush();
      ui.wrongPhoto = null;
      ui.ocrPhoto = null;
      ui.cropActive = false;
      ui.cropRect = null;
      ui.ocrDraft = '';
      ui.ocrAlternative = '';
      ui.photoVerified = false;
      ui.wrongMode = false;
      ui.typing = false;
      ui.busy = false;
      store.persistSoon(0);
      renderView();
      setTimeout(scrollToLatestAnalysis, 30);
      showToast(`错题 #${String(no).padStart(3, '0')} 已保存到错题本`);
    } catch (err) {
      if (pendingQuestion && state) {
        state.questions = state.questions.filter((q) => q.id !== pendingQuestion.id);
        state.chats = state.chats.filter((m) => m.questionId !== pendingQuestion.id || m.id === userMsg.id);
        userMsg.questionId = null;
        state.profile.learner = learnerBefore;
      }
      ui.typing = false;
      ui.busy = false;
      if (!state) return;
      state.chats.push({
        id: id('chat'), role: 'assistant', kind: 'text',
        content: `这次没有保存成功：${err.message}。请稍后重试或把照片裁剪得更小。`,
        createdAt: new Date().toISOString(),
      });
      store.persistSoon(0);
      renderView();
      showToast('保存失败，请重试', 'error');
    }
    return;
  }

  if (!mainText) {
    ui.busy = false;
    ui.typing = false;
    return;
  }
  state.chats.push({
    id: id('chat'), role: 'user', kind: 'text', content: mainText, createdAt: new Date().toISOString(),
  });
  captureMemory(mainText);
  store.persistSoon(0);
  renderView();
  scrollChat();
  try {
    const reply = await ai.chat(mainText, state, state.profile.settings);
    if (!state) return;
    state.chats.push({
      id: id('chat'), role: 'assistant', kind: 'text', content: reply.text, createdAt: new Date().toISOString(),
    });
    ui.typing = false;
    ui.busy = false;
    store.persistSoon(0);
    renderView();
    scrollChat();
  } catch (err) {
    ui.typing = false;
    ui.busy = false;
    if (!state) return;
    state.chats.push({
      id: id('chat'), role: 'assistant', kind: 'text',
      content: `我暂时没能回复：${err.message}。再试一次，或者切到本地推演模式。`,
      createdAt: new Date().toISOString(),
    });
    renderView();
    scrollChat();
  }
}

/* =========================================================
   错题本
   ========================================================= */

function bookHTML() {
  const total = state.questions.length;
  const due = state.questions.filter((q) => q.nextReview && q.nextReview <= todayISO()).length;
  const avg = total ? Math.round(state.questions.reduce((s, q) => s + masteryOf(q), 0) / total) : 0;
  const subjects = [...new Set(state.questions.map((q) => q.subject))];
  const filters = [
    { key: 'all', label: '全部' },
    { key: 'due', label: `待复习 ${due || ''}`.trim() },
    ...subjects.map((s) => ({ key: s, label: s })),
  ];
  let list = [...state.questions].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  if (ui.filter === 'due') list = list.filter((q) => q.nextReview && q.nextReview <= todayISO());
  else if (ui.filter !== 'all') list = list.filter((q) => q.subject === ui.filter);

  return `
    <section class="view book-page">
      <div class="page-lead">
        <div>
          <p class="eyebrow">ERROR BOOK / 让错误有下文</p>
          <h2>错题不是收藏，是下一次的判断。</h2>
          <p>${total ? `${total} 道错题 · ${due} 道今天到期 · 平均掌握度 ${avg}%` : '还没有错题。去教练那里贴第一道。'}</p>
        </div>
        ${total ? `<div class="book-stats">
          <div class="book-stat"><b>${total}</b><span>累计错题</span></div>
          <div class="book-stat"><b>${due}</b><span>待复习</span></div>
          <div class="book-stat"><b>${avg}%</b><span>平均掌握</span></div>
        </div>` : ''}
      </div>

      ${total ? `
      <div class="book-toolbar">
        <div class="filter-chips">
          ${filters.map((f) => `<button class="filter-chip ${ui.filter === f.key ? 'is-active' : ''}" data-action="filter" data-filter="${esc(f.key)}" type="button">${esc(f.label)}</button>`).join('')}
        </div>
        <button class="btn btn--ghost btn--sm" data-action="export-ics" type="button">${icon('download', 14)} 导出日历</button>
      </div>
      ${list.length ? `<div class="book-grid">${list.map(questionCardHTML).join('')}</div>` : `
        <div class="empty-state">
          <span class="empty-icon">${icon('check', 22)}</span>
          <h3>这个筛选下没有错题</h3>
          <p>换个筛选，或者去教练那里记录一道新的错题。</p>
        </div>`}
      ` : `
      <div class="empty-state">
        <span class="empty-icon">${icon('book', 22)}</span>
        <h3>错题本还是空的</h3>
        <p>去「错题教练」，点「标记为错题」，把题目、你的答案和正确答案填进去。它会自动进入复习计划。</p>
        <button class="btn btn--primary" data-action="go-coach" type="button">去贴一道错题 ${icon('arrow', 15)}</button>
      </div>`}
    </section>`;
}

function questionCardHTML(q) {
  const due = q.nextReview && q.nextReview <= todayISO();
  const mastery = masteryOf(q);
  const color = mastery >= 70 ? '#6f875b' : mastery >= 45 ? '#b28433' : '#bb5d3f';
  return `
    <article class="q-card" data-action="open-question" data-id="${esc(q.id)}" tabindex="0" role="button" aria-label="打开错题 ${esc(q.tags?.[0] || q.subject)}">
      <div class="q-card-top">
        <span class="q-no">#${String(q.no || 0).padStart(3, '0')}</span>
        <span class="q-subject" style="--c:${CATEGORY_TONE.course}">${esc(q.subject)}</span>
      </div>
      <h3>${q.imageDataUrl ? '<span class="photo-label">📷 图片题目</span> ' : ''}${esc(q.text)}</h3>
      ${q.imageDataUrl ? `<img class="book-question-photo" src="${esc(q.imageDataUrl)}" alt="错题原图" loading="lazy">` : ''}
      <div class="q-tags">
        ${(q.tags || []).slice(0, 3).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}
        <span class="tag tag--coral">${esc(q.errorType || '未标注')}</span>
      </div>
      <div class="q-card-foot">
        <div class="q-mastery">
          <div class="q-mastery-label"><span>掌握度</span><b>${mastery}%</b></div>
          <div class="bar ${mastery < 45 ? 'bar--coral' : ''}"><i style="width:${Math.max(4, mastery)}%"></i></div>
          <span class="q-due ${due ? 'is-due' : ''}">${due ? '今天复习' : q.nextReview ? `下次 ${relativeDay(q.nextReview)}` : '未安排复习'}</span>
        </div>
        <div class="mastery-ring" style="--p:${mastery};--c:${color}"><b>${mastery}</b></div>
        <span class="q-open">${icon('arrow', 13)}</span>
      </div>
    </article>`;
}

/* =========================================================
   设置与扩展
   ========================================================= */

function settingsHTML() {
  const s = state.profile.settings;
  const counts = {
    events: state.events.length,
    questions: state.questions.length,
    chats: state.chats.length,
    focus: state.focusSessions?.length || 0,
  };
  const bytes = store.accountSummary()?.bytes || 0;
  const isServer = s.aiMode === 'server';
  const isDirect = s.aiMode === 'direct';
  const notifyGranted = isNativeApp() ? Boolean(state.profile.settings.notifyEnabled) : (typeof Notification !== 'undefined' && Notification.permission === 'granted');
  return `
    <section class="view settings-page">
      <div class="page-lead">
        <div>
          <p class="eyebrow">SYSTEM / 你的空间</p>
          <h2>把边界设清楚，再谈智能。</h2>
          <p>模型、天气、模块都可以换；你的数据始终留在本机加密仓库里。</p>
        </div>
        <span class="pill pill--quiet">SCHEMA v${state.schemaVersion}</span>
      </div>

      <div class="settings-layout">
        <section class="settings-card settings-card--full appearance-card">
          <h3>界面风格</h3>
          <p>选一个适合当前学习状态的界面。点击即可预览，选择会保存在这台设备上。</p>
          ${themePickerHTML()}
          ${fontSizeControlHTML()}
          ${glassFracturePickerHTML()}
        </section>
        <section class="settings-card">
          <h3>账户与隐私</h3>
          <p>学习数据保持加密；仅在主动勾选“记住我”时，密码才会加密保存在此设备。</p>
          <div class="settings-section">
            <div class="settings-row">
              <div class="settings-row-info"><b>${esc(state.profile.name)}</b><small>@${esc(store.accountSummary()?.username || '')} · 本地空间 · ${(bytes / 1024).toFixed(1)} KB</small></div>
              <button class="btn btn--sm btn--ghost" data-action="lock" type="button">${icon('lock', 13)} 锁定</button>
            </div>
            <div class="settings-row">
              <div class="settings-row-info"><b>自动锁定</b><small>${ui.remembered ? '保持登录期间暂停；手动锁定仍会关闭免密' : '离开电脑或手机一段时间后自动上锁'}</small></div>
              <select id="autoLock" class="input" style="width:104px;min-height:32px;font-size:calc(12px * var(--user-font-scale))">
                ${[0, 15, 30, 60].map((m) => `<option value="${m}" ${Number(s.autoLockMin) === m ? 'selected' : ''}>${m ? `${m} 分钟` : '不自动'}</option>`).join('')}
              </select>
            </div>
            <div class="settings-row">
              <div class="settings-row-info"><b>在此设备上保持登录</b><small>${ui.remembered ? '已开启；暂停超时锁定，手动锁定会关闭免密' : '未开启；下次输入密码时可勾选“记住我”'}</small></div>
              ${ui.remembered ? '<button class="btn btn--sm btn--ghost" data-action="forget-device" type="button">关闭</button>' : '<span class="pill pill--quiet">未开启</span>'}
            </div>
            ${isNativeApp() ? '' : '<div class="settings-row"><div class="settings-row-info"><b>手机 App</b><small>添加到主屏幕，像 App 一样打开；iPhone 需 Safari 分享 → 添加到主屏幕</small></div><button class="btn btn--sm btn--ghost" data-action="install" type="button">安装</button></div>'}
            <div class="settings-row">
              <div class="settings-row-info"><b>日程闹钟</b><small>${notifyGranted ? (isNativeApp() ? '系统闹钟已开启：关掉应用也会提醒' : '已开启：重要日程到点通知') : (isNativeApp() ? '重要日程会通过 Android 系统通知提醒' : '重要日程可以设提醒；网页版需保持应用打开，导出 .ics 可交给系统日历')}</small></div>
              <div style="display:flex;gap:6px;flex-wrap:wrap">
                <button class="btn btn--sm btn--ghost" data-action="enable-notifications" type="button">${notifyGranted ? '已开启' : '开启提醒'}</button>
                <button class="btn btn--sm btn--ghost" data-action="test-notification" type="button">测试</button>
              </div>
            </div>
          </div>
          <div class="settings-actions" style="margin-top:13px">
            <button class="btn btn--sm btn--soft" data-action="export-backup" type="button">${icon('shield', 14)} 导出加密备份</button>
            <button class="btn btn--sm btn--ghost" data-action="import-backup" type="button">${icon('upload', 14)} 恢复备份</button>
            <button class="btn btn--sm btn--danger" data-action="delete-account" type="button">${icon('trash', 13)} 删除空间</button>
          </div>
          <p class="sheet-note">忘记登录密码无法找回；建议每月导出一次加密备份，备份密码可以单独设置。</p>
        </section>


        <section class="settings-card">
          <h3>我的档案</h3>
          <p>教练会把专业、目标和学习习惯写进长期记忆；这些内容不会离开你的加密仓库。</p>
          <div class="settings-section">
            <div class="form-grid form-grid--2">
              <label class="field"><span>称呼</span><input id="pfName" value="${esc(state.profile.name || '')}" maxlength="20"></label>
              <label class="field"><span>专业 / 方向</span><input id="pfMajor" list="majorOptions" value="${esc(state.profile.major || '')}" placeholder="计算机 / 临床医学 / 汉语言…"><datalist id="majorOptions">${MAJORS.map((m) => `<option value="${esc(m)}"></option>`).join('')}</datalist></label>
            </div>
            <div class="form-grid form-grid--2">
              <label class="field"><span>年级</span>
                <select id="pfGrade">${['大一', '大二', '大三', '大四', '研究生', '其他'].map((g) => `<option ${state.profile.grade === g ? 'selected' : ''}>${g}</option>`).join('')}</select>
              </label>
              <label class="field"><span>常用学习时段</span><input id="pfWindow" value="${esc(state.profile.studyWindow || '')}" placeholder="例如：19:30–22:00"></label>
            </div>
            <label class="field"><span>这学期最想达成的一件事</span><textarea id="pfGoal" placeholder="例如：把高数稳定在 85 分 / 通过六级 / 做完一个竞赛项目">${esc(state.profile.goal || '')}</textarea></label>
            <label class="field"><span>想让我额外记住的（可选）</span><textarea id="pfNotes" placeholder="例如：我晚上更容易专注；生理学要结合图谱；考试前一周不要排太满">${esc(state.profile.memoryNotes || '')}</textarea></label>
            <button class="btn btn--sm btn--primary" data-action="save-profile" type="button" style="justify-self:start">${icon('check', 14)} 保存记忆</button>
          </div>
        </section>

        <section class="settings-card">
          <h3>AI 引擎</h3>
          <p>默认本地推演，完全离线；也可以填写自己的 API Key，或使用服务器网关。</p>
          <div class="settings-section">
            <div class="settings-row" style="padding-top:0">
              <div class="settings-row-info"><b>当前引擎</b><small>${isDirect ? '浏览器直连模型服务，Key 加密存本机' : isServer ? '经由 /api/llm 网关，浏览器不接触 Key' : '规则 + 知识库推演，无外部请求'}</small></div>
              <span class="model-status ${(isServer && ui.aiStatus.ok) || (isDirect && s.apiKey) ? 'is-on' : (isServer || isDirect) ? 'is-err' : ''}" id="aiStatus">
                <i class="status-dot"></i>${isDirect ? (s.apiKey ? 'Key 已保存' : '未填 Key') : isServer ? (ui.aiStatus.checked ? (ui.aiStatus.ok ? '已连接' : '未连接') : '待检测') : '本地'}
              </span>
            </div>
            <div class="radio-row radio-row--3">
              <label class="radio-card"><input type="radio" name="aiMode" value="local" ${!isServer && !isDirect ? 'checked' : ''}><b>本地推演</b><small>隐私最好，无网可用</small></label>
              <label class="radio-card"><input type="radio" name="aiMode" value="direct" ${isDirect ? 'checked' : ''}><b>自己的 API</b><small>填 Key，直连模型</small></label>
              <label class="radio-card"><input type="radio" name="aiMode" value="server" ${isServer ? 'checked' : ''}><b>服务器网关</b><small>由部署者配置 Key</small></label>
            </div>
            ${isDirect ? `
            <div class="form-grid form-grid--2" style="margin-top:10px">
              <label class="field"><span>API Base URL</span><input id="apiBaseUrl" value="${esc(s.apiBaseUrl || 'https://api.deepseek.com')}" placeholder="https://api.deepseek.com"></label>
              <label class="field"><span>模型名称</span><input id="aiModel" value="${esc(s.aiModel || 'deepseek-chat')}" placeholder="deepseek-chat"></label>
            </div>
            <label class="field"><span>API Key</span><input id="apiKey" type="password" value="${esc(s.apiKey || '')}" placeholder="sk-..." autocomplete="off"></label>
            <div class="settings-actions" style="margin-top:8px">
              <button class="btn btn--sm btn--ghost" data-action="ai-test" type="button">测试连接</button>
              <button class="btn btn--sm btn--ghost" data-action="clear-api-key" type="button">清除 Key</button>
            </div>
            <p class="sheet-note">Key 只保存在本机加密仓库，直连时由浏览器发给模型服务。若服务不支持 CORS，会提示失败，可改用服务器网关。</p>` : ''}
            ${isServer ? `
            <div class="settings-row" style="align-items:flex-end">
              <label class="field" style="flex:1"><span>模型名称（由网关决定是否放行）</span><input id="aiModel" value="${esc(s.aiModel || '')}" placeholder="deepseek-chat"></label>
              <button class="btn btn--sm btn--ghost" data-action="ai-test" type="button">测试连接</button>
            </div>` : ''}
          </div>
          <p class="sheet-note">比赛演示建议先用本地推演；需要展示大模型时，可填自己的 Key，或在终端设置 <code style="font-family:var(--mono);font-size:calc(9px * var(--user-font-scale))">LLM_API_KEY</code> 后运行 <code style="font-family:var(--mono);font-size:calc(9px * var(--user-font-scale))">python3 scripts/serve.py</code>。</p>
        </section>

        <section class="settings-card">
          <h3>天气与位置</h3>
          <p>天气只用于时间轴的影响层。请求只包含城市经纬度，不包含你的错题或日程。</p>
          <div class="settings-section">
            <div class="city-current">
              <div><b>${esc(s.city?.name || '北京')}</b><small>${s.city?.lat?.toFixed?.(2) || '39.90'}, ${s.city?.lon?.toFixed?.(2) || '116.41'} · ${state.weather?.source === 'open-meteo' ? 'Open-Meteo 实时预报' : ui.weatherBusy ? '示例天气 · 正在获取实时预报' : '示例天气（实时获取失败）'}</small></div>
              <button class="btn btn--sm btn--ghost" data-action="open-city" type="button">更换</button>
            </div>
          </div>
        </section>

        <section class="settings-card">
          <h3>模块实验室</h3>
          <p>新功能以模块方式接入。开关只改变界面与计算，不删除已有数据。</p>
          <div class="module-grid">
            <div class="module-card ${state.modules.weather ? 'is-on' : ''}">
              <div class="module-card-head"><span class="module-icon">${icon('weather', 14)}</span><b>天气影响层</b></div>
              <p>把降水、温度并排放在每天的时间轴上。</p>
              <label class="switch"><input type="checkbox" data-module="weather" ${state.modules.weather ? 'checked' : ''}><i></i></label>
            </div>
            <div class="module-card ${state.modules.deadline ? 'is-on' : ''}">
              <div class="module-card-head"><span class="module-icon">${icon('alert', 14)}</span><b>截止日雷达</b></div>
              <p>截止日单独着色，冲突日程自动标出。</p>
              <label class="switch"><input type="checkbox" data-module="deadline" ${state.modules.deadline ? 'checked' : ''}><i></i></label>
            </div>
            <div class="module-card ${state.modules.focus ? 'is-on' : ''}">
              <div class="module-card-head"><span class="module-icon">${icon('timer', 14)}</span><b>专注舱</b></div>
              <p>自由设定 1–180 分钟，完成后写入时间轴。</p>
              <label class="switch"><input type="checkbox" data-module="focus" ${state.modules.focus ? 'checked' : ''}><i></i></label>
            </div>
          </div>
          <p class="sheet-note">扩展协议：模块声明 id / version / dataSchema / migrations，只新增字段，不删除旧数据。</p>
        </section>

        <section class="settings-card settings-card--full">
          <h3>数据与版本</h3>
          <p>所有记录都在本地加密仓库。升级、导入、换设备都走同一套迁移与合并逻辑。</p>
          <div class="data-grid">
            <div class="data-cell"><b>${counts.events}</b><span>日程</span></div>
            <div class="data-cell"><b>${counts.questions}</b><span>错题</span></div>
            <div class="data-cell"><b>${counts.chats}</b><span>对话</span></div>
            <div class="data-cell"><b>${counts.focus}</b><span>专注段</span></div>
          </div>
          <div class="schema-line"><span>SCHEMA <b>v${state.schemaVersion}</b> · 上次备份 <b>${state.meta.lastBackupAt ? timeAgo(state.meta.lastBackupAt) : '从未'}</b> · 加密仓库 <b>${(bytes / 1024).toFixed(1)} KB</b></span></div>
          <div class="settings-actions" style="margin-top:12px">
            <button class="btn btn--sm btn--soft" data-action="export-json" type="button">${icon('download', 14)} 导出明文 JSON</button>
            <button class="btn btn--sm btn--ghost" data-action="export-ics" type="button">${icon('calendar', 14)} 导出 .ics</button>
            <button class="btn btn--sm btn--ghost" data-action="import-backup" type="button">${icon('upload', 14)} 合并备份</button>
            <button class="btn btn--sm btn--ghost" data-action="install" type="button">${icon('download', 14)} 安装到设备</button>
            <button class="btn btn--sm btn--ghost" data-action="share-app" type="button">${icon('send', 14)} 分享给同学</button>
          </div>
          <p class="sheet-note">明文 JSON 会暴露题目和日程，只建议在本机临时排查问题时使用；跨设备迁移请用加密备份。</p>
        </section>
      </div>
    </section>`;
}

/* =========================================================
   弹层：日程 / 导入 / 错题 / 备份 / 城市
   ========================================================= */

function openSheet({ title, kicker = 'DETAIL', body }) {
  $('#sheetTitle').textContent = title;
  $('#sheetKicker').textContent = kicker;
  $('#sheetBody').innerHTML = body;
  const sheet = $('#sheet');
  if (!sheet.open) sheet.showModal();
  $('#sheetBody').scrollTop = 0;
}

function closeSheet() {
  const sheet = $('#sheet');
  if (sheet.open) sheet.close();
}


function openOnboardingSheet() {
  if (!state || state.profile.onboardingDone) return;
  const body = `
    <form id="onboardingForm" class="form-grid">
      <div class="encrypted-banner">
        ${icon('spark', 20)}
        <p><b>先花 20 秒，让我认识你。</b> 这些信息只存在你的加密仓库里；我会把它带进错题分析和每周建议，而不是每次从零开始。</p>
      </div>
      <div class="form-grid form-grid--2">
        <label class="field"><span>怎么称呼你</span><input id="obName" value="${esc(state.profile.name || '')}" placeholder="林同学"></label>
        <label class="field"><span>专业 / 方向</span><input id="obMajor" list="onboardMajorOptions" value="${esc(state.profile.major || '')}" placeholder="计算机 / 临床医学 / 汉语言…"><datalist id="onboardMajorOptions">${MAJORS.map((m) => `<option value="${esc(m)}"></option>`).join('')}</datalist></label>
      </div>
      <label class="field"><span>这学期最想达成的一件事</span><textarea id="obGoal" placeholder="例如：把高数稳定在 85 分 / 通过六级 / 做完一个竞赛项目">${esc(state.profile.goal || '')}</textarea></label>
      <label class="field"><span>你通常什么时候学习（可选）</span><input id="obWindow" value="${esc(state.profile.studyWindow || '')}" placeholder="例如：19:30–22:00"></label>
      <div class="sheet-actions">
        <button class="btn btn--ghost" data-action="skip-onboarding" type="button">先跳过</button>
        <span style="flex:1"></span>
        <button class="btn btn--primary" type="submit">开始使用 ${icon('arrow', 14)}</button>
      </div>
      <p class="sheet-note">之后可以在「设置 → 我的档案」里修改；也可以随时清空。专业只用于调整讲解例子，不会上传。</p>
    </form>`;
  openSheet({ title: '让教练记住你', kicker: 'WELCOME TO JUREN', body });
  setTimeout(() => $('#obMajor')?.focus(), 100);
}

function saveOnboarding(skip = false) {
  if (!state) return;
  if (!skip) {
    state.profile.name = $('#obName')?.value.trim() || state.profile.name;
    state.profile.major = $('#obMajor')?.value.trim() || '';
    if ($('#obGrade')) state.profile.grade = $('#obGrade').value || state.profile.grade;
    state.profile.studyWindow = $('#obWindow')?.value.trim() || state.profile.studyWindow;
    state.profile.goal = $('#obGoal')?.value.trim() || state.profile.goal;
    if ($('#obNotes')) state.profile.memoryNotes = $('#obNotes').value.trim() || state.profile.memoryNotes;
    state.chats.push({
      id: id('chat'),
      role: 'assistant',
      kind: 'text',
      content: `记住了：${state.profile.major || '你的专业'}，${state.profile.grade || '大学'}，目标是「${state.profile.goal || '先把手头的事做好'}」。\n\n以后分析错题、安排复习时，我会把这条目标带上。你随时可以在设置里改。`,
      createdAt: new Date().toISOString(),
    });
  }
  state.profile.onboardingDone = true;
  store.persistSoon(0);
  closeSheet();
  renderShell();
  renderView();
  showToast(skip ? '先跳过，之后可以在设置里补全' : '记忆已建立');
}

function openEventSheet(existing = null, defaults = {}) {
  const now = new Date();
  const ev = existing || {
    id: '',
    title: '',
    date: defaults.date || toISODate(now),
    start: defaults.start || '09:00',
    end: defaults.end || '10:00',
    category: 'activity',
    location: '',
    notes: '',
    importance: 'normal',
    alarm: 0,
    done: false,
  };
  const isEdit = Boolean(ev.id);
  const body = `
    <form id="eventForm" class="form-grid" data-id="${esc(ev.id || '')}">
      <label class="field"><span>这件事是什么</span>
        <input id="evTitle" value="${esc(ev.title)}" placeholder="例如：高数随堂测验 / 社团例会" required maxlength="60">
      </label>
      <div class="form-grid form-grid--3">
        <label class="field"><span>日期</span><input id="evDate" type="date" value="${esc(ev.date)}" required></label>
        <label class="field"><span>开始</span><input id="evStart" type="time" value="${esc(ev.start)}" required></label>
        <label class="field"><span>结束</span><input id="evEnd" type="time" value="${esc(ev.end)}" required></label>
      </div>
      <div class="form-grid form-grid--3">
        <label class="field"><span>类别</span>
          <select id="evCategory">${Object.entries(CATEGORY_NAMES).map(([k, v]) => `<option value="${k}" ${ev.category === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
        </label>
        <label class="field"><span>重要程度</span>
          <select id="evImportance">${Object.entries(IMPORTANCE).map(([k, v]) => `<option value="${k}" ${ev.importance === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select>
        </label>
        <label class="field"><span>闹钟提醒</span>
          <select id="evAlarm">${ALARM_OPTIONS.map((o) => `<option value="${o.value}" ${Number(ev.alarm) === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}</select>
        </label>
      </div>
      <label class="field"><span>地点（可选）</span><input id="evLocation" value="${esc(ev.location || '')}" placeholder="A301 / 线上"></label>
      <label class="field"><span>备注（可选）</span><textarea id="evNotes" placeholder="要带的东西、和谁一起、临时变化…">${esc(ev.notes || '')}</textarea></label>
      <div class="sheet-actions">
        ${isEdit ? `<button class="btn btn--danger" data-action="delete-event" data-id="${esc(ev.id)}" type="button">${icon('trash', 13)} 删除</button>` : ''}
        <span style="flex:1"></span>
        <button class="btn btn--ghost" data-action="close-sheet" type="button">取消</button>
        <button class="btn btn--primary" type="submit">${isEdit ? '保存修改' : '放进时间轴'} ${icon('check', 14)}</button>
      </div>
      <p class="sheet-note">${isEdit ? '修改会立即写入本地加密仓库。' : `将放在 ${fmtDate(ev.date, true)} ${ev.start}。重要日程可以设置闹钟；网页版需要保持应用打开，导出 .ics 可交给系统日历可靠提醒。`}</p>
    </form>`;
  openSheet({ title: isEdit ? '编辑日程' : '新日程', kicker: isEdit ? 'EDIT EVENT' : 'NEW EVENT', body });
  setTimeout(() => $('#evTitle')?.focus(), 80);
}

function openEventAt(rail, event) {
  const rect = rail.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  let minutes = 360 + ratio * 1080;
  minutes = Math.round(minutes / 30) * 30;
  minutes = Math.max(360, Math.min(1410, minutes));
  const start = hhmmOf(minutes);
  const end = hhmmOf(Math.min(1439, minutes + 60));
  openEventSheet(null, { date: rail.dataset.date, start, end });
}

function saveEventForm(form) {
  const title = $('#evTitle').value.trim();
  const date = $('#evDate').value;
  const start = $('#evStart').value;
  const end = $('#evEnd').value;
  if (!title) { showToast('给这件事起个名字', 'error'); return; }
  if (!date || !start || !end) { showToast('日期和时间要填完整', 'error'); return; }
  if (minutesOf(end) < minutesOf(start)) {
    showToast('结束时间不能早于开始时间', 'error');
    return;
  }
  const existing = form.dataset.id ? state.events.find((e) => e.id === form.dataset.id) : null;
  const payload = {
    title,
    date,
    start,
    end,
    category: $('#evCategory').value,
    importance: $('#evImportance').value || 'normal',
    alarm: Number($('#evAlarm').value || 0),
    location: $('#evLocation').value.trim(),
    notes: $('#evNotes').value.trim(),
    updatedAt: new Date().toISOString(),
  };
  if (existing) {
    if (Number(existing.alarm) !== payload.alarm || existing.start !== payload.start || existing.date !== payload.date) {
      existing.alarmFiredAt = null;
    }
    Object.assign(existing, payload);
    showToast('日程已更新');
  } else {
    state.events.push({
      id: id('ev'),
      ...payload,
      source: 'manual',
      alarmFiredAt: null,
      done: false,
      createdAt: new Date().toISOString(),
    });
    showToast('已放进时间轴');
  }
  store.persistSoon(0);
  if (payload.alarm > 0) requestNotificationPermission();
  scheduleEventAlarms();
  closeSheet();
  renderShell();
  if (ui.view === 'timeline') renderView();
  else navigate('timeline');
}

function deleteEvent(evId) {
  const ev = state.events.find((e) => e.id === evId);
  if (!ev) return;
  if (!confirm(`删除「${ev.title}」？`)) return;
  state.events = state.events.filter((e) => e.id !== evId);
  store.persistSoon(0);
  scheduleEventAlarms();
  closeSheet();
  renderShell();
  if (ui.view === 'timeline') renderView();
  showToast('日程已删除');
}

/* ---------------- 导入 ---------------- */

function openImportSheet() {
  ui.importTab = 'text';
  ui.importDraft = '';
  ui.importImage = null;
  ui.pendingImports = [];
  renderImportSheet();
}

function renderImportSheet() {
  const body = `
    <div class="tabs" role="tablist">
      <button class="tab ${ui.importTab === 'text' ? 'is-active' : ''}" data-action="import-tab" data-tab="text" type="button">粘贴文本</button>
      <button class="tab ${ui.importTab === 'image' ? 'is-active' : ''}" data-action="import-tab" data-tab="image" type="button">截图识别</button>
      <button class="tab ${ui.importTab === 'file' ? 'is-active' : ''}" data-action="import-tab" data-tab="file" type="button">日历文件</button>
    </div>
    <div class="tab-panel">${importPanelHTML()}</div>
    ${importPreviewHTML()}
    <div class="sheet-actions">
      <button class="btn btn--ghost" data-action="close-sheet" type="button">取消</button>
      <button class="btn btn--primary" data-action="do-import" type="button" ${ui.pendingImports.length ? '' : 'disabled'}>导入 ${ui.pendingImports.length || ''} 个日程 ${icon('arrow', 14)}</button>
    </div>
    <p class="sheet-note">识别结果只是草稿，导入前请核对日期、时间和地点。软件不会在后台自动写入你的日历。</p>`;
  openSheet({ title: '把通知变成日程', kicker: 'NOTICE CATCHER', body });
}

function importPanelHTML() {
  if (ui.importTab === 'image') {
    return `
      <div class="import-box">
        <label class="dropzone ${ui.importImage ? 'has-image' : ''}" for="importImageInput">
          ${ui.importImage ? `<img src="${ui.importImage}" alt="待识别的截图">` : `${icon('scan', 26)}<b>粘贴或放一张通知截图</b><small>课表、群通知、教务系统截图都可以<br>支持 Ctrl/⌘+V；识别需要模型网关，本地可先粘贴文字</small>`}
        </label>
        <input id="importImageInput" type="file" accept="image/png,image/jpeg,image/webp" hidden>
        <div class="import-tools">
          <span class="sheet-note" style="margin:0">${ui.importImage ? '图片已就绪，点击右侧识别。' : '支持 PNG / JPG / WebP。'}</span>
          <button class="btn btn--primary btn--sm" data-action="ocr-image" type="button" ${ui.importImage ? '' : 'disabled'}>${icon('scan', 14)} 识别截图文字</button>
        </div>
        <div id="ocrStatus"></div>
      </div>`;
  }
  if (ui.importTab === 'file') {
    return `
      <div class="import-box">
        <label class="dropzone" for="importICSInput">
          ${icon('calendar', 26)}
          <b>导入 .ics 日历文件</b>
          <small>支持 Apple 日历、Google Calendar、Outlook 导出<br>会先解析成草稿，再让你确认</small>
        </label>
        <input id="importICSInput" type="file" accept=".ics,.csv,text/calendar,text/csv" hidden>
        <p class="sheet-note">直接从喜鹊儿绑定需要学校/厂商开放接口；目前支持导出文件或截图，导入后仍会先让你确认。CSV 会生成未来 8 周课表。</p>
      </div>`;
  }
  return `
    <div class="import-box">
      <textarea id="importText" class="import-text input" placeholder="把群通知、教务通知直接粘进来。例如：&#10;【教务处】关于本周三高数随堂测验的安排&#10;时间：11月18日 上午10:00-11:00&#10;地点：A楼301教室">${esc(ui.importDraft)}</textarea>
      <div class="import-tools">
        <button class="btn btn--primary btn--sm" data-action="parse-import" type="button">${icon('scan', 14)} 识别时间与地点</button>
      </div>
      <p class="sheet-note">支持「11月18日 10:00」「下周三下午3点」「每周三 19:00」「今晚8点」等写法；识别不确定时会标出来。</p>
    </div>`;
}

function importPreviewHTML() {
  if (!ui.pendingImports.length) {
    return `<div class="import-preview"><div class="import-empty">还没有识别结果。粘贴一段通知，点「识别时间与地点」。</div></div>`;
  }
  return `
    <div class="import-preview">
      <div class="preview-head"><h3>识别草稿 · ${ui.pendingImports.length} 个</h3><span class="sheet-note" style="margin:0">可直接改，再导入</span></div>
      <div class="preview-list">
        ${ui.pendingImports.map((item) => `
          <div class="preview-item" data-preview-id="${esc(item.id)}">
            <button class="remove-preview" data-action="remove-preview" data-id="${esc(item.id)}" type="button" title="移除">${icon('close', 13)}</button>
            <div class="preview-main">
              <div class="preview-title">
                <input data-preview-field="title" value="${esc(item.title)}" aria-label="标题">
                <span class="confidence ${item.confidence >= 0.85 ? 'high' : item.confidence < 0.6 ? 'low' : ''}">${Math.round(item.confidence * 100)}%</span>
              </div>
              <div class="preview-fields">
                <input type="date" data-preview-field="date" value="${esc(item.date)}" aria-label="日期">
                <input type="time" data-preview-field="start" value="${esc(item.start)}" aria-label="开始">
                <input type="time" data-preview-field="end" value="${esc(item.end)}" aria-label="结束">
                <select data-preview-field="category" aria-label="类别">
                  ${Object.entries(CATEGORY_NAMES).map(([k, v]) => `<option value="${k}" ${item.category === k ? 'selected' : ''}>${v}</option>`).join('')}
                </select>
                <input data-preview-field="location" value="${esc(item.location || '')}" placeholder="地点" aria-label="地点" style="grid-column:span 2">
              </div>
              ${item.warnings?.length ? `<div class="preview-warnings">${item.warnings.map((w) => `<span>${esc(w)}</span>`).join('')}</div>` : ''}
            </div>
          </div>`).join('')}
      </div>
    </div>`;
}

function parseImportDraft() {
  const text = $('#importText')?.value ?? ui.importDraft;
  ui.importDraft = text;
  if (!text.trim()) {
    showToast('先粘贴一段通知', 'error');
    return;
  }
  const parsed = parseScheduleText(text);
  if (!parsed.length) {
    showToast('没有识别到日程，换一种写法试试', 'error');
    return;
  }
  ui.pendingImports = parsed;
  renderImportSheet();
  showToast(`识别到 ${parsed.length} 个日程，请核对`);
}

function doImport() {
  if (!ui.pendingImports.length) return;
  let added = 0;
  let skipped = 0;
  for (const item of ui.pendingImports) {
    if (!item.title || !item.date || !item.start) continue;
    const dup = state.events.some((e) => e.date === item.date && e.start === item.start && e.title === item.title);
    if (dup) { skipped++; continue; }
    state.events.push({
      id: id('ev'),
      title: item.title,
      date: item.date,
      start: item.start,
      end: item.end,
      category: item.category || 'activity',
      location: item.location || '',
      notes: item.notes || (item.recurrence === 'weekly' ? '每周重复（已生成 4 次）' : ''),
      source: item.source || 'text',
      confidence: item.confidence,
      importance: item.importance || (item.category === 'exam' ? 'critical' : item.category === 'deadline' ? 'important' : 'normal'),
      alarm: Number(item.alarm || 0) || (item.category === 'exam' ? 60 : item.category === 'deadline' ? 30 : 0),
      alarmFiredAt: null,
      done: false,
      createdAt: new Date().toISOString(),
    });
    added++;
  }
  store.persistSoon(0);
  scheduleEventAlarms();
  closeSheet();
  renderShell();
  if (ui.view !== 'timeline') navigate('timeline');
  const weekHas = state.events.some((e) => e.date >= toISODate(ui.weekStart) && e.date <= toISODate(addDays(ui.weekStart, 6)));
  if (!weekHas && ui.pendingImports[0]?.date) {
    ui.weekStart = startOfWeek(new Date(`${ui.pendingImports[0].date}T00:00:00`));
    renderView();
  } else if (ui.view === 'timeline') {
    renderView();
  }
  window.scrollTo({ top: 0, behavior: 'auto' });
  if (!weekHas) showToast(`已导入 ${added} 个日程，已跳到最近的导入周`);
  else showToast(`已导入 ${added} 个日程${skipped ? `，跳过 ${skipped} 个重复` : ''}`);
}

/* ---------------- 错题卡 ---------------- */

function openQuestionSheet(qid) {
  const q = state.questions.find((x) => x.id === qid);
  if (!q) return;
  const a = q.analysis || {};
  const due = q.nextReview && q.nextReview <= todayISO();
  const body = `
    <div class="q-detail">
      <div class="q-detail-meta">
        <span class="q-no">#${String(q.no || 0).padStart(3, '0')}</span>
        <span class="tag tag--forest">${esc(q.subject)}</span>
        <span class="tag tag--coral">${esc(q.errorType || '未标注')}</span>
        <span class="tag">掌握 ${masteryOf(q)}%</span>
        <span class="tag ${due ? 'tag--coral' : 'tag--gold'}">${q.nextReview ? (due ? '今天复习' : `下次 ${relativeDay(q.nextReview)}`) : '未安排复习'}</span>
      </div>
      <div class="analysis-block">
        <h4>题目</h4>
        <p id="questionDetailText" style="white-space:pre-wrap;font-size:calc(13px * var(--user-font-scale));color:var(--ink)">${esc(q.text)}</p>
        ${q.imageDataUrl ? `<img class="detail-question-photo" src="${esc(q.imageDataUrl)}" alt="错题原图">` : ''}
      </div>
      <div class="answer-grid">
        <div class="answer-box"><span>我的答案 / 思路</span><p>${esc(q.myAnswer || '（没有填写）')}</p></div>
        <div class="answer-box answer-box--correct"><span>正确答案</span><p>${esc(q.correctAnswer || '（没有填写）')}</p></div>
      </div>
      ${a.summary ? `<div class="analysis-block"><h4>一句话结论</h4><p>${esc(a.summary)}</p></div>` : ''}
      ${a.memory ? `<div class="memory-note">${esc(a.memory)}</div>` : ''}
      ${a.diagnosis ? `<div class="analysis-block"><h4>错因诊断</h4><p>${esc(a.diagnosis)}</p></div>` : ''}
      ${a.steps?.length ? `<div class="analysis-block"><h4>下一次这样做</h4><div class="analysis-steps">${a.steps.map((s) => `<div class="analysis-step">${esc(s)}</div>`).join('')}</div></div>` : ''}
      ${a.variant ? `<div class="variant-box"><b>变式训练 / TRANSFER</b><p>${esc(a.variant)}</p></div>` : ''}
      <div class="analysis-block">
        <h4>复习记录</h4>
        ${q.reviews?.length ? `<div class="review-history">${q.reviews.map((r) => `<span>${new Date(r.at).toLocaleDateString('zh-CN')} ${r.result === 'good' ? '做对了' : '又卡住'}</span>`).join('')}</div>` : '<p style="font-size:calc(10.5px * var(--user-font-scale))">还没有复习记录。第一次重做后，这里会开始积累。</p>'}
      </div>
      <div class="review-actions">
        <button class="btn btn--primary" data-action="review-question" data-result="good" data-id="${esc(q.id)}" type="button">${icon('check', 14)} 这次做对了</button>
        <button class="btn btn--ghost" data-action="review-question" data-result="again" data-id="${esc(q.id)}" type="button">还是没思路</button>
      </div>
      <p class="sheet-note">做对后掌握度 +12，下次复习间隔按掌握度自动拉长；还是不会则明天再来，并记一次错因。</p>
    </div>`;
  openSheet({ title: `错题 #${String(q.no || 0).padStart(3, '0')}`, kicker: `${q.subject} / ${q.errorType || '未标注错因'}`, body });
  showQuestionMath($('#questionDetailText'), q.text);
}

function reviewQuestion(qid, result) {
  const q = state.questions.find((x) => x.id === qid);
  if (!q) return;
  const good = result === 'good';
  q.mastery = Math.max(5, Math.min(96, (masteryOf(q) || 30) + (good ? 12 : -5)));
  q.reviews = q.reviews || [];
  q.reviews.push({ at: new Date().toISOString(), result: good ? 'good' : 'again' });
  q.nextReview = toISODate(addDays(new Date(), good ? ai.reviewInterval(q.mastery) : 1));
  const learner = state.profile.learner;
  for (const tag of q.tags || []) {
    const s = learner.tagStats[tag] || { attempts: 0, wrong: 0, lastAt: null };
    s.attempts += 1;
    if (!good) s.wrong += 1;
    s.lastAt = new Date().toISOString();
    learner.tagStats[tag] = s;
  }
  if (!good) {
    learner.errorTypes[q.errorType] = (learner.errorTypes[q.errorType] || 0) + 1;
  }
  store.persistSoon(0);
  openQuestionSheet(qid);
  if (ui.view === 'book' || ui.view === 'coach') renderView();
  renderShell();
  showToast(good ? '掌握度 +12，下次间隔已拉长' : '已安排明天再复习');
}

function explainSimple(qid) {
  const q = state.questions.find((x) => x.id === qid);
  if (!q) return;
  const step = q.analysis?.steps?.[0] || '先把题目条件逐条翻译成式子。';
  const text = `换个更简单的说法：\n\n这道题你只需要先做一件事——${step}\n\n你当时的答案「${q.myAnswer || '（未填写）'}」不一定是全错，先把「题目给的」和「题目问的」分开写，再决定用哪个公式。\n\n如果还是卡，明天重做时只写第一步，写完就停。`;
  state.chats.push({
    id: id('chat'), role: 'assistant', kind: 'text', content: text, createdAt: new Date().toISOString(),
  });
  store.persistSoon(0);
  closeSheet();
  navigate('coach');
  showToast('已把简化版讲解放进对话');
}

/* ---------------- 加密备份 ---------------- */

function openBackupExportSheet() {
  const body = `
    <form id="backupForm" class="form-grid">
      <div class="encrypted-banner">
        ${icon('shield', 20)}
        <p><b>备份会用独立密码重新加密。</b> 登录密码和备份密码可以不同；备份文件只有密码能解开，忘记无法恢复。</p>
      </div>
      <label class="field"><span>备份密码（至少 8 位）</span><input id="backupPass" type="password" autocomplete="new-password" placeholder="设置一个只有你知道的密码" required minlength="8"></label>
      <label class="field"><span>再输一次</span><input id="backupPass2" type="password" autocomplete="new-password" placeholder="确认密码" required></label>
      <div class="sheet-actions">
        <button class="btn btn--ghost" data-action="close-sheet" type="button">取消</button>
        <button class="btn btn--primary" type="submit">${icon('download', 14)} 生成 .juren 备份</button>
      </div>
      <p class="sheet-note">备份包含：日程、错题、对话、学习画像、专注记录。不会包含登录密码。</p>
    </form>`;
  openSheet({ title: '导出加密备份', kicker: 'ENCRYPTED BACKUP', body });
  setTimeout(() => $('#backupPass')?.focus(), 80);
}

async function exportBackup() {
  const pass = $('#backupPass').value;
  if (pass !== $('#backupPass2').value) { showToast('两次备份密码不一致', 'error'); return; }
  if (pass.length < 8) { showToast('备份密码至少 8 位', 'error'); return; }
  try {
    const file = await store.makePortableBackup(pass);
    const stamp = toISODate(new Date()).replace(/-/g, '');
    download(`juren-backup-${stamp}.juren`, JSON.stringify(file, null, 2), 'application/json');
    store.markBackup();
    closeSheet();
    showToast('加密备份已生成，请妥善保存');
    if (ui.view === 'settings') renderView();
  } catch (err) {
    showToast(err.message || '备份失败', 'error');
  }
}


function readImageFile(file) {
  if (!file.type.startsWith('image/')) return;
  if (file.size > 10 * 1024 * 1024) {
    showToast('图片超过 10MB，请压缩后再试', 'error');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    ui.importImage = reader.result;
    renderImportSheet();
    showToast('截图已放入，点「识别截图文字」');
  };
  reader.readAsDataURL(file);
}

function pickBackupFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.juren,.zhixu,application/json';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      if (!['juren-backup', 'zhixu-backup'].includes(json.format) || !json.payload) throw new Error('这不是聚仁加密备份');
      ui.pendingBackup = json;
      openRestoreSheet(json);
    } catch (err) {
      showToast(err.message || '无法读取备份', 'error');
    }
  };
  input.click();
}

function openRestoreSheet(file) {
  const body = `
    <form id="restoreForm" class="form-grid">
      <div class="encrypted-banner">
        ${icon('shield', 20)}
        <p><b>备份创建于 ${new Date(file.createdAt).toLocaleString('zh-CN')}。</b> 默认合并：保留当前数据，只新增备份里没有的记录。同 id 冲突会自动换新 id，不覆盖。</p>
      </div>
      <label class="field"><span>备份密码</span><input id="restorePass" type="password" autocomplete="current-password" placeholder="导出时设置的密码" required></label>
      <label class="field"><span>导入方式</span>
        <select id="restoreMode">
          <option value="merge">合并导入（推荐，保留现有数据）</option>
          <option value="replace">覆盖当前空间（先导出备份）</option>
        </select>
      </label>
      <div class="sheet-actions">
        <button class="btn btn--ghost" data-action="close-sheet" type="button">取消</button>
        <button class="btn btn--primary" type="submit">${icon('upload', 14)} 恢复</button>
      </div>
      <p class="sheet-note">覆盖模式会用备份替换当前空间的全部内容，登录账号与密码不变。</p>
    </form>`;
  openSheet({ title: '恢复加密备份', kicker: 'RESTORE BACKUP', body });
  setTimeout(() => $('#restorePass')?.focus(), 80);
}

async function restoreBackup() {
  const pass = $('#restorePass').value;
  const mode = $('#restoreMode').value;
  if (!pass) { showToast('请输入备份密码', 'error'); return; }
  if (mode === 'replace' && !confirm('覆盖当前空间的全部内容？建议先导出当前备份。')) return;
  try {
    const incoming = await store.restorePortableBackup(ui.pendingBackup, pass);
    let result;
    if (mode === 'merge') {
      result = store.mergeState(incoming);
    } else {
      store.replaceState(incoming);
      result = { replaced: true };
    }
    state = store.getState();
    ui.weekStart = startOfWeek(new Date());
    ui.filter = 'all';
    closeSheet();
    renderShell();
    renderView();
    showToast(mode === 'merge'
      ? `合并完成：新增 ${result.events} 个日程、${result.questions} 道错题`
      : '已用备份覆盖当前空间');
  } catch (err) {
    showToast(err.message || '恢复失败，密码可能不正确', 'error');
  }
}

/* ---------------- 城市 ---------------- */

function openCitySheet() {
  ui.cityResults = [];
  renderCitySheet();
}

function renderCitySheet(notice = '') {
  const city = state.profile.settings.city || DEFAULT_CITY;
  const body = `
    <form id="cityForm" class="form-grid">
      <label class="field"><span>搜索城市</span>
        <div style="display:flex;gap:7px">
          <input id="cityQuery" placeholder="例如：杭州 / 深圳 / 成都" autocomplete="off">
          <button class="btn btn--primary" type="submit">${icon('search', 14)} 搜索</button>
        </div>
      </label>
    </form>
    ${notice ? `<p class="sheet-note" style="color:var(--coral)">${esc(notice)}</p>` : ''}
    <div class="settings-section" style="margin-top:14px;padding-top:12px">
      <div class="city-current">
        <div><b>${esc(city.name)}</b><small>${city.lat.toFixed(2)}, ${city.lon.toFixed(2)} · ${state.weather?.source === 'open-meteo' ? '实时预报' : ui.weatherBusy ? '示例 · 正在获取' : '示例天气'}</small></div>
        <button class="btn btn--sm btn--ghost" data-action="use-location" type="button">${icon('pin', 13)} 当前位置</button>
      </div>
      <div class="city-results">
        ${(ui.cityResults || []).map((r, idx) => `
          <button class="city-result" data-action="choose-city" data-index="${idx}" type="button">
            <span><b>${esc(r.name)}</b><small> · ${esc(r.admin1)} ${esc(r.country)}</small></span>
            <span class="tag">选择</span>
          </button>`).join('')}
      </div>
      ${!ui.cityResults?.length ? '<p class="sheet-note">搜索后选择城市；天气只会上报经纬度，不会上传你的日程。</p>' : ''}
    </div>
    <div class="sheet-actions">
      <button class="btn btn--ghost" data-action="close-sheet" type="button">关闭</button>
      <button class="btn btn--primary" data-action="refresh-weather" type="button">${icon('refresh', 14)} 刷新天气</button>
    </div>`;
  openSheet({ title: '天气与位置', kicker: 'WEATHER LAYER', body });
}

async function doCitySearch() {
  const q = $('#cityQuery')?.value.trim();
  if (!q) return;
  const btn = $('#cityForm button[type=submit]');
  if (btn) btn.disabled = true;
  try {
    const results = await searchCity(q);
    ui.cityResults = results;
    if (!results.length) {
      renderCitySheet('没有找到这个城市，换个写法试试');
      return;
    }
    renderCitySheet();
  } catch (err) {
    renderCitySheet(`搜索失败：${err.message}`);
  }
}

async function chooseCity(index) {
  const city = ui.cityResults?.[index];
  if (!city) return;
  state.profile.settings.city = city;
  state.weather = demoWeather(city);
  store.persistSoon(0);
  closeSheet();
  renderShell();
  if (ui.view === 'settings') renderView();
  await refreshWeather(true);
  showToast(`已切换到 ${city.name}`);
}

function useLocation() {
  if (!navigator.geolocation) { showToast('这个浏览器不支持定位', 'error'); return; }
  showToast('正在读取位置…');
  navigator.geolocation.getCurrentPosition((pos) => {
    const city = {
      name: '当前位置',
      lat: Number(pos.coords.latitude.toFixed(4)),
      lon: Number(pos.coords.longitude.toFixed(4)),
    };
    state.profile.settings.city = city;
    state.weather = demoWeather(city);
    store.persistSoon(0);
    closeSheet();
    renderShell();
    refreshWeather(true);
    showToast('已使用当前位置');
  }, (err) => {
    showToast(`定位失败：${err.message}`, 'error');
  }, { timeout: 8000, maximumAge: 600000 });
}

/* ---------------- 截图 OCR ---------------- */

async function runOCR() {
  const box = $('#ocrStatus');
  if (!ui.importImage) { showToast('先选一张截图', 'error'); return; }
  if (state.profile.settings.aiMode !== 'server') {
    if (box) {
      box.className = 'ocr-status is-error';
      box.textContent = '截图识别需要模型网关。请先在「设置 → AI 引擎」切换到模型网关，或把通知文字直接粘到「粘贴文本」。';
    }
    return;
  }
  if (box) { box.className = 'ocr-status'; box.textContent = '正在识别截图，通常需要 5–20 秒…'; }
  try {
    const text = await ai.extractTextFromImage(ui.importImage);
    ui.importDraft = text;
    ui.pendingImports = parseScheduleText(text);
    ui.importTab = 'text';
    renderImportSheet();
    showToast(ui.pendingImports.length ? `识别到 ${ui.pendingImports.length} 个日程` : '已识别出文字，但没有找到时间');
  } catch (err) {
    if (box) { box.className = 'ocr-status is-error'; box.textContent = `识别失败：${err.message}`; }
  }
}

/* =========================================================
   交互路由
   ========================================================= */

async function handleAction(action, ds = {}, el = null) {
  switch (action) {
    case 'add-event':
      openEventSheet();
      break;
    case 'open-event': {
      const ev = state.events.find((e) => e.id === ds.id);
      if (ev) openEventSheet(ev);
      break;
    }
    case 'delete-event':
      deleteEvent(ds.id);
      break;
    case 'close-sheet':
      closeSheet();
      break;
    case 'open-import':
      openImportSheet();
      break;
    case 'week-prev':
      ui.weekStart = addDays(ui.weekStart, -7);
      ui.selectedDay = toISODate(ui.weekStart);
      renderView();
      break;
    case 'week-next':
      ui.weekStart = addDays(ui.weekStart, 7);
      ui.selectedDay = toISODate(ui.weekStart);
      renderView();
      break;
    case 'week-today':
      ui.weekStart = startOfWeek(new Date());
      ui.selectedDay = todayISO();
      renderView();
      break;
    case 'jump-day': {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ds.date || '')) break;
      ui.selectedDay = ds.date;
      $$('.week-day').forEach((button) => {
        const selected = button.dataset.date === ds.date;
        button.classList.toggle('is-selected', selected);
        button.setAttribute('aria-pressed', String(selected));
      });
      const mobile = window.matchMedia('(max-width: 760px)').matches;
      const lane = $(`${mobile ? '.agenda-day' : '.tl-lane'}[data-date="${ds.date}"]`);
      lane?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      break;
    }
    case 'add-event-day':
      if (/^\d{4}-\d{2}-\d{2}$/.test(ds.date || '')) openEventSheet(null, { date: ds.date });
      break;
    case 'toggle-layer': {
      const layer = ds.layer;
      if (layer === 'focus') {
        state.modules.focus = !state.modules.focus;
        if (!state.modules.focus) resetFocus();
      } else {
        state.modules[layer] = !state.modules[layer];
      }
      store.persistSoon(0);
      renderView();
      renderShell();
      if (ui.view === 'settings') renderView();
      break;
    }
    case 'focus-toggle':
      toggleFocus();
      break;
    case 'focus-reset':
      resetFocus();
      break;
    case 'next-quote':
      await flipMotivationQuote();
      break;
    case 'chat-starter':
      if (ds.mode === 'wrong') {
        ui.wrongMode = true;
        renderView();
        setTimeout(() => {
          if (window.innerWidth > 760) $('#wrongText')?.focus({ preventScroll: true });
          scrollChat();
        }, 80);
      } else {
        ui.wrongMode = false;
        renderView();
        setTimeout(() => {
          const input = $('#chatInput');
          if (input) { input.value = ds.text || ''; sendChat(); }
        }, 50);
      }
      break;
    case 'wrong-toggle':
      ui.wrongMode = !ui.wrongMode;
      renderView();
      setTimeout(() => {
        const field = ui.wrongMode ? $('#wrongText') : $('#chatInput');
        if (window.innerWidth > 760) field?.focus({ preventScroll: true });
        scrollChat();
      }, 60);
      break;
    case 'question-photo-mode':
      ui.photoMode = ds.mode === 'text' ? 'text' : 'image';
      renderView();
      if (ui.photoMode === 'text') updateQuestionMathPreview();
      break;
    case 'remove-question-photo':
      ui.wrongPhoto = null;
      ui.ocrPhoto = null;
      ui.cropActive = false;
      ui.cropRect = null;
      ui.ocrDraft = '';
      ui.ocrAlternative = '';
      ui.photoVerified = false;
      renderView();
      break;
    case 'toggle-question-crop':
      ui.cropActive = !ui.cropActive;
      ui.cropRect = null;
      renderView();
      if (ui.cropActive) showToast('用手指在照片上框选题目，再点“使用框选区域识别”');
      break;
    case 'confirm-question-crop':
      if (!ui.cropRect) { showToast('请先在照片上框选题目', 'error'); break; }
      try {
        ui.ocrPhoto = await cropQuestionPhoto(ui.wrongPhoto, ui.cropRect);
        ui.cropActive = false;
        ui.cropRect = null;
        ui.ocrDraft = '';
        ui.ocrAlternative = '';
        ui.photoVerified = false;
        ui.photoMode = 'text';
        renderView();
        showToast('已框选题目区域，可以开始提取文字');
      } catch (err) { showToast(err.message, 'error'); }
      break;
    case 'clear-question-crop':
      ui.ocrPhoto = null;
      ui.ocrDraft = '';
      ui.ocrAlternative = '';
      ui.photoVerified = false;
      renderView();
      break;
    case 'switch-ocr-draft': {
      const previous = ui.ocrDraft;
      ui.ocrDraft = ui.ocrAlternative;
      ui.ocrAlternative = previous;
      ui.photoVerified = false;
      renderView();
      updateQuestionMathPreview();
      break;
    }
    case 'recognize-question': {
      if (!ui.wrongPhoto || ui.photoBusy) break;
      ui.photoBusy = true;
      const button = $('[data-action="recognize-question"]');
      if (button) { button.disabled = true; button.textContent = '正在识别…'; }
      try {
        const result = await recognizeQuestion(ui.ocrPhoto || ui.wrongPhoto, (progress) => {
          if (button?.isConnected && progress.status === 'recognizing text') {
            button.textContent = `正在识别… ${Math.round((progress.progress || 0) * 100)}%`;
          } else if (button?.isConnected && progress.status === 'enhancing image') {
            button.textContent = '正在增强图片并复核…';
          } else if (button?.isConnected && progress.status === 'loading local model') {
            button.textContent = '正在加载本地中文模型（首次较慢）…';
          } else if (button?.isConnected && progress.status === 'falling back to lightweight OCR') {
            button.textContent = '正在使用轻量识别备用方案…';
          }
        });
        ui.ocrDraft = result.text;
        ui.ocrAlternative = result.alternative;
        ui.photoVerified = false;
        renderView();
        updateQuestionMathPreview();
        showToast(ui.ocrDraft ? `识别草稿已生成（参考置信度 ${result.confidence}%），请逐字核对` : '没有识别出文字，请手动填写或保存原图');
      } catch (err) {
        showToast(`文字提取失败：${err.message}`, 'error');
      } finally {
        ui.photoBusy = false;
        if (button?.isConnected) { button.disabled = false; button.textContent = '重新提取文字'; }
      }
      break;
    }
    case 'send-chat':
      await sendChat();
      break;
    case 'open-question':
      openQuestionSheet(ds.id);
      break;
    case 'explain-simple':
      explainSimple(ds.id);
      break;
    case 'review-question':
      reviewQuestion(ds.id, ds.result);
      break;
    case 'toggle-pref': {
      const prefs = state.profile.learner.preferences || [];
      const pref = ds.pref;
      state.profile.learner.preferences = prefs.includes(pref)
        ? prefs.filter((x) => x !== pref)
        : [...prefs, pref];
      store.persistSoon(0);
      renderView();
      showToast(state.profile.learner.preferences.includes(pref) ? `已记住：${pref}` : `已取消：${pref}`);
      break;
    }
    case 'filter':
      ui.filter = ds.filter;
      renderView();
      break;
    case 'go-coach':
      navigate('coach');
      break;
    case 'go-coach-photo':
      ui.wrongMode = true;
      navigate('coach');
      break;
    case 'export-ics': {
      if (!state.events.length) { showToast('还没有日程可以导出', 'error'); break; }
      download(`juren-calendar-${toISODate(new Date())}.ics`, buildICS(state.events), 'text/calendar');
      showToast('已导出 .ics，可导入系统日历');
      break;
    }
    case 'export-json':
      if (!confirm('明文 JSON 包含你的题目和日程，确定下载吗？')) break;
      download(`juren-data-${toISODate(new Date())}.json`, JSON.stringify(state, null, 2));
      showToast('已导出明文 JSON，请妥善保管');
      break;
    case 'export-backup':
      openBackupExportSheet();
      break;
    case 'import-backup':
      pickBackupFile();
      break;
    case 'delete-account':
      if (!confirm('这会删除当前空间的本机加密数据，且无法恢复。确定继续？')) break;
      if (!confirm('最后确认：删除后只能靠之前导出的备份恢复。')) break;
      await store.deleteCurrentAccount();
      await remember.clearRemembered().catch(() => {});
      state = null;
      location.reload();
      break;
    case 'lock':
      lockApp();
      break;
    case 'forget-device':
      try {
        await remember.clearRemembered();
        ui.remembered = false;
        scheduleAutoLock();
        renderView();
        showToast('已关闭此设备的免密登录');
      } catch (err) {
        console.warn('[juren] 无法关闭设备免密', err);
        showToast('关闭失败，请检查浏览器存储权限后重试', 'error');
      }
      break;
    case 'skip-onboarding':
      saveOnboarding(true);
      break;
    case 'save-profile': {
      state.profile.name = $('#pfName')?.value.trim() || state.profile.name;
      state.profile.major = $('#pfMajor')?.value.trim() || '';
      state.profile.grade = $('#pfGrade')?.value || '';
      state.profile.studyWindow = $('#pfWindow')?.value.trim() || '';
      state.profile.goal = $('#pfGoal')?.value.trim() || '';
      state.profile.memoryNotes = $('#pfNotes')?.value.trim() || '';
      state.profile.onboardingDone = true;
      store.persistSoon(0);
      renderShell();
      renderView();
      showToast('档案已保存，下一次分析会带上这些记忆');
      break;
    }
    case 'enable-notifications':
      await requestNotificationPermission();
      renderView();
      break;
    case 'test-notification':
      await testNotification();
      break;
    case 'clear-api-key':
      state.profile.settings.apiKey = '';
      store.persistSoon(0);
      renderView();
      showToast('API Key 已清除');
      break;
    case 'ai-test':
      await testAiConnection(true);
      break;
    case 'open-city':
      openCitySheet();
      break;
    case 'use-location':
      useLocation();
      break;
    case 'choose-city':
      chooseCity(Number(ds.index));
      break;
    case 'refresh-weather':
      closeSheet();
      await refreshWeather(true);
      showToast('天气已刷新');
      break;
    case 'share-app':
      try {
        const shareUrl = new URL('./', document.baseURI).href;
        if (navigator.share) {
          await navigator.share({ title: '聚仁 · 全能学习助手', url: shareUrl });
        } else {
          await navigator.clipboard.writeText(shareUrl);
          showToast('访问链接已复制，发给同学即可');
        }
      } catch (err) {
        if (err?.name !== 'AbortError') showToast(new URL('./', document.baseURI).href);
      }
      break;
    case 'install':
      if (deferredInstall) {
        deferredInstall.prompt();
        deferredInstall = null;
      } else {
        showToast('在浏览器菜单里选择「安装应用 / 添加到主屏幕」即可');
      }
      break;
    case 'import-tab':
      ui.importTab = ds.tab;
      renderImportSheet();
      break;
    case 'parse-import':
      parseImportDraft();
      break;
    case 'remove-preview':
      ui.pendingImports = ui.pendingImports.filter((x) => x.id !== ds.id);
      renderImportSheet();
      break;
    case 'do-import':
      doImport();
      break;
    case 'ocr-image':
      await runOCR();
      break;
    default:
      console.warn('[juren] unknown action', action);
  }
}

function handleViewClick(event) {
  const nav = event.target.closest('[data-nav]');
  if (nav) {
    navigate(nav.dataset.nav);
    return;
  }
  const action = event.target.closest('[data-action]');
  if (action) {
    event.preventDefault();
    handleAction(action.dataset.action, action.dataset, action).catch((err) => {
      console.error(err);
      showToast(err.message || '操作失败', 'error');
    });
    return;
  }
  const rail = event.target.closest('.lane-rail');
  if (rail && ui.view === 'timeline') {
    openEventAt(rail, event);
  }
}

function handleViewKeydown(event) {
  if (event.target.id === 'chatInput' && event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendChat();
    return;
  }
  if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('.q-card[data-action]')) {
    event.preventDefault();
    handleAction('open-question', event.target.dataset, event.target);
  }
}

function handleViewInput(event) {
  if (event.target.id === 'chatInput') {
    const el = event.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(110, el.scrollHeight)}px`;
  } else if (event.target.id === 'wrongOcrDraft') {
    ui.ocrDraft = event.target.value;
    ui.ocrAlternative = '';
    $('[data-action="switch-ocr-draft"]')?.remove();
    ui.photoVerified = false;
    const verified = $('#photoVerified');
    if (verified) verified.checked = false;
    updateQuestionMathPreview();
  }
}

let cropPointer = null;
function cropPoint(event, rect) {
  return {
    x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
    y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
  };
}
function handleQuestionCropPointerDown(event) {
  const wrap = event.target.closest?.('#questionCropWrap.is-cropping');
  if (!wrap || !ui.cropActive) return;
  event.preventDefault();
  wrap.setPointerCapture(event.pointerId);
  cropPointer = { pointerId: event.pointerId, start: cropPoint(event, wrap.getBoundingClientRect()) };
  ui.cropRect = null;
}
function handleQuestionCropPointerMove(event) {
  if (!cropPointer || event.pointerId !== cropPointer.pointerId) return;
  const wrap = $('#questionCropWrap');
  const box = $('#photoCropSelection');
  if (!wrap || !box) return;
  const end = cropPoint(event, wrap.getBoundingClientRect());
  const { start } = cropPointer;
  const region = { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) };
  box.hidden = false;
  Object.assign(box.style, { left: `${region.x * 100}%`, top: `${region.y * 100}%`, width: `${region.width * 100}%`, height: `${region.height * 100}%` });
  ui.cropRect = region;
}
function handleQuestionCropPointerUp(event) {
  if (!cropPointer || event.pointerId !== cropPointer.pointerId) return;
  handleQuestionCropPointerMove(event);
  cropPointer = null;
  if (ui.cropRect && (ui.cropRect.width < .04 || ui.cropRect.height < .025)) {
    ui.cropRect = null;
    const box = $('#photoCropSelection');
    if (box) box.hidden = true;
  }
}

async function handleViewChange(event) {
  const target = event.target;
  if (target.id === 'questionCamera' || target.id === 'questionGallery') {
    const file = target.files?.[0];
    if (!file) return;
    try {
      ui.wrongMode = true;
      ui.wrongPhoto = await normalizePhoto(file);
      ui.ocrPhoto = null;
      ui.cropActive = false;
      ui.cropRect = null;
      ui.photoMode = 'image';
      ui.ocrDraft = '';
      ui.ocrAlternative = '';
      ui.photoVerified = false;
      renderView();
      showToast('已添加照片。请确认文字清晰、无反光；识别前可框选题目区域');
    } catch (err) {
      showToast(err.message, 'error');
    }
  } else if (target.id === 'photoVerified') {
    ui.photoVerified = target.checked;
  } else if (target.id === 'focusMinutes') {
    const value = Number(target.value);
    if (!Number.isInteger(value) || value < 1 || value > 180) {
      target.value = String(ui.focus.total / 60);
      showToast('专注时长请输入 1–180 分钟', 'error');
      return;
    }
    if (ui.focus.running) return;
    ui.focus.total = value * 60;
    ui.focus.remaining = ui.focus.total;
    try { localStorage.setItem('juren.focus.minutes', String(value)); } catch (_) { /* 本次仍有效 */ }
    renderView();
  } else if (target.id === 'autoLock') {
    state.profile.settings.autoLockMin = Number(target.value);
    store.persistSoon(0);
    scheduleAutoLock();
    showToast(target.value === '0' ? '已关闭自动锁定' : `自动锁定：${target.value} 分钟`);
  } else if (target.name === 'aiMode') {
    state.profile.settings.aiMode = target.value;
    store.persistSoon(0);
    ui.aiStatus = { checked: false, ok: false, llm: false, model: null };
    renderView();
    showToast(target.value === 'server' ? '已切换到服务器网关，正在检测连接' : target.value === 'direct' ? '已切换到自己的 API，请填写 Key' : '已切换到本地推演');
  } else if (target.id === 'apiBaseUrl') {
    state.profile.settings.apiBaseUrl = target.value.trim() || 'https://api.deepseek.com';
    store.persistSoon();
    updateAiStatusDom();
    showToast('API 地址已保存');
  } else if (target.id === 'apiKey') {
    state.profile.settings.apiKey = target.value.trim();
    store.persistSoon(0);
    updateAiStatusDom();
    showToast(state.profile.settings.apiKey ? 'API Key 已加密保存' : 'API Key 为空');
  } else if (target.id === 'aiModel') {
    state.profile.settings.aiModel = target.value.trim();
    store.persistSoon();
    showToast('模型名称已保存');
  } else if (target.dataset.module) {
    const key = target.dataset.module;
    state.modules[key] = target.checked;
    if (key === 'focus' && !target.checked) resetFocus();
    store.persistSoon(0);
    renderView();
    showToast(target.checked ? '模块已开启，数据保留' : '模块已关闭，数据保留');
  }
}

function handleSheetClick(event) {
  if (event.target === $('#sheet')) { closeSheet(); return; }
  const close = event.target.closest('[data-action="close-sheet"]');
  if (close) {
    event.preventDefault();
    closeSheet();
    return;
  }
  const action = event.target.closest('[data-action]');
  if (action) {
    event.preventDefault();
    handleAction(action.dataset.action, action.dataset, action).catch((err) => {
      console.error(err);
      showToast(err.message || '操作失败', 'error');
    });
  }
}

function handleSheetInput(event) {
  const target = event.target;
  if (target.id === 'importText') {
    ui.importDraft = target.value;
    return;
  }
  const field = target.dataset.previewField;
  if (field) {
    const wrap = target.closest('[data-preview-id]');
    const item = ui.pendingImports.find((x) => x.id === wrap?.dataset.previewId);
    if (item) item[field] = target.value;
  }
}

async function handleSheetChange(event) {
  const target = event.target;
  if (target.id === 'importImageInput') {
    const file = target.files?.[0];
    if (file) readImageFile(file);
  }
  if (target.id === 'importICSInput') {
    const file = target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const isCSV = /\.csv$/i.test(file.name) || file.type.includes('csv');
      const events = isCSV ? parseCSV(text) : parseICS(text);
      if (!events.length) { showToast(isCSV ? 'CSV 里没有找到有效课表' : '这个 .ics 里没有找到日程', 'error'); return; }
      ui.pendingImports = events;
      renderImportSheet();
      showToast(`解析出 ${events.length} 个日程，请核对`);
    } catch (err) {
      showToast(`读取失败：${err.message}`, 'error');
    }
  }
  if (target.id === 'evImportance') {
    const alarm = $('#evAlarm');
    if (alarm && target.value !== 'normal' && Number(alarm.value) === 0) {
      alarm.value = '30';
      showToast('重要日程已默认提前 30 分钟提醒，可改回不提醒');
    }
  }
  if (target.dataset.previewField) {
    const field = target.dataset.previewField;
    const wrap = target.closest('[data-preview-id]');
    const item = ui.pendingImports.find((x) => x.id === wrap?.dataset.previewId);
    if (item) item[field] = target.value;
  }
}

function handleSheetSubmit(event) {
  if (event.target.id === 'eventForm') {
    event.preventDefault();
    saveEventForm(event.target);
  } else if (event.target.id === 'backupForm') {
    event.preventDefault();
    exportBackup();
  } else if (event.target.id === 'restoreForm') {
    event.preventDefault();
    restoreBackup();
  } else if (event.target.id === 'cityForm') {
    event.preventDefault();
    doCitySearch();
  } else if (event.target.id === 'onboardingForm') {
    event.preventDefault();
    saveOnboarding(false);
  }
}

async function refreshAiStatus(force = false) {
  if (!state) return;
  if (state.profile.settings.aiMode === 'direct') {
    ui.aiStatus = { checked: true, ok: Boolean(state.profile.settings.apiKey), llm: false, model: state.profile.settings.aiModel, direct: true };
    updateAiStatusDom();
    return;
  }
  if (state.profile.settings.aiMode !== 'server') {
    ui.aiStatus = { checked: true, ok: false, llm: false, model: null };
    updateAiStatusDom();
    return;
  }
  if (ui.aiStatus.checked && !force) return;
  ui.aiStatus = { checked: false, ok: false, llm: false, model: null, checking: true };
  updateAiStatusDom();
  const status = await ai.checkServer();
  ui.aiStatus = { checked: true, ...status };
  updateAiStatusDom();
}

function updateAiStatusDom() {
  const el = $('#aiStatus');
  if (!el) return;
  const mode = state?.profile?.settings?.aiMode;
  const isServer = mode === 'server';
  if (mode === 'direct') {
    const hasKey = Boolean(state?.profile?.settings?.apiKey);
    el.className = `model-status ${hasKey ? 'is-on' : 'is-err'}`;
    el.innerHTML = `<i class="status-dot"></i>${hasKey ? 'Key 已保存' : '未填 Key'}`;
    return;
  }
  if (!isServer) {
    el.className = 'model-status';
    el.innerHTML = '<i class="status-dot"></i>本地';
    return;
  }
  if (ui.aiStatus.checking) {
    el.className = 'model-status';
    el.innerHTML = '<i class="status-dot"></i>检测中';
  } else if (ui.aiStatus.ok) {
    el.className = 'model-status is-on';
    el.innerHTML = `<i class="status-dot"></i>已连接${ui.aiStatus.model ? ` · ${esc(ui.aiStatus.model)}` : ''}`;
  } else {
    el.className = 'model-status is-err';
    el.innerHTML = '<i class="status-dot"></i>未连接';
  }
}

async function testAiConnection(notify = false) {
  const mode = state.profile.settings.aiMode;
  if (mode === 'local') {
    showToast('当前是本地推演，不需要连接');
    return;
  }
  if (mode === 'direct') {
    if (!state.profile.settings.apiKey) { showToast('先填写 API Key', 'error'); return; }
    showToast('正在测试直连…');
    try {
      const result = await ai.testDirect(state.profile.settings);
      ui.aiStatus = { checked: true, ok: true, llm: true, model: result.model, direct: true };
      updateAiStatusDom();
      showToast(`直连成功：${result.model}`);
    } catch (err) {
      ui.aiStatus = { checked: true, ok: false, llm: false, model: null, direct: true };
      updateAiStatusDom();
      showToast(err.message || '直连失败', 'error');
    }
    return;
  }
  await refreshAiStatus(true);
  if (ui.aiStatus.ok) {
    showToast('模型网关已连接');
  } else {
    showToast('网关未连接，请检查服务是否启动、LLM_API_KEY 是否设置', 'error');
  }
  if (notify) renderView();
}

/* ---------------- 启动 ---------------- */

init().catch((err) => {
  console.error(err);
  const boot = $('#boot');
  if (boot) {
    boot.innerHTML = `<p style="max-width:420px;text-align:center;line-height:1.8">聚仁启动失败：${esc(err.message)}<br>请刷新页面重试。</p>`;
  }
});
