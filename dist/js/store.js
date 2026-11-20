/* 聚仁 · 本地保险箱
 * - 账号索引只保存 salt / 昵称，不保存密码或密码哈希；
 * - 业务数据整体 AES-256-GCM 加密后写入 localStorage；
 * - 默认解密密钥只存在内存；用户可以另外主动启用此设备的免密登录；
 * - 提供版本迁移与"合并导入"，避免升级/换设备时丢数据。
 */

import {
  decryptJSON, decryptPortable, deriveKey, encryptJSON, encryptPortable,
  PBKDF2_ITERATIONS, randomSalt,
} from './crypto.js';
import { createInitialState, SCHEMA_VERSION } from './data.js';

const ACCOUNTS_KEY = 'zhixu.accounts.v1';
const VAULT_PREFIX = 'zhixu.vault.v1.';
const LAST_USER_KEY = 'zhixu.lastUser.v1';
const AAD_PREFIX = 'zhixu-vault-v1:';

let session = null;
let saveTimer = null;
let saveChain = Promise.resolve();
let lastError = null;

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function listAccounts() {
  const accounts = readJSON(ACCOUNTS_KEY, []);
  return Array.isArray(accounts) ? accounts : [];
}

function saveAccounts(accounts) {
  writeJSON(ACCOUNTS_KEY, accounts);
}

export function findAccount(username) {
  const u = String(username || '').trim();
  return listAccounts().find((a) => a.username.toLowerCase() === u.toLowerCase()) || null;
}

export function lastUsername() {
  return localStorage.getItem(LAST_USER_KEY) || '';
}

function vaultKey(username) {
  return `${VAULT_PREFIX}${encodeURIComponent(username.toLowerCase())}`;
}

function aad(username) {
  return `${AAD_PREFIX}${username.toLowerCase()}`;
}

function clone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

/** 向前迁移；只加字段，不删数据。 */
export function migrateState(input) {
  if (!input || typeof input !== 'object') throw new Error('数据为空或格式不正确');
  let s = clone(input);
  const from = Number(s.schemaVersion || 0);
  if (from > SCHEMA_VERSION) {
    throw new Error(`备份来自更新版本（v${from}），请先升级聚仁`);
  }
  if (from < 1) {
    s.schemaVersion = 1;
    s.profile = s.profile || {};
    s.profile.settings = s.profile.settings || {};
    s.profile.learner = s.profile.learner || {};
    s.events = Array.isArray(s.events) ? s.events : [];
    s.questions = Array.isArray(s.questions) ? s.questions : [];
    s.chats = Array.isArray(s.chats) ? s.chats : [];
    s.focusSessions = Array.isArray(s.focusSessions) ? s.focusSessions : [];
    s.modules = s.modules || { weather: true, deadline: true, focus: false };
    s.meta = s.meta || {};
  }
  if (from < 2) {
    s.profile = s.profile || {};
    s.profile.major = s.profile.major || '';
    s.profile.grade = s.profile.grade || '';
    s.profile.goal = s.profile.goal || '';
    s.profile.studyWindow = s.profile.studyWindow || '';
    s.profile.memoryNotes = s.profile.memoryNotes || '';
    s.profile.onboardingDone = Boolean(s.profile.onboardingDone || s.profile.major);
    s.profile.settings = s.profile.settings || {};
    s.profile.settings.apiBaseUrl = s.profile.settings.apiBaseUrl || 'https://api.deepseek.com';
    s.profile.settings.apiKey = s.profile.settings.apiKey || '';
    s.profile.settings.defaultAlarm = Number(s.profile.settings.defaultAlarm || 30);
    s.profile.settings.notifyEnabled = Boolean(s.profile.settings.notifyEnabled);
    s.profile.learner = s.profile.learner || {};
    s.profile.learner.sessions = Number(s.profile.learner.sessions || 0);
    s.profile.learner.lastActiveAt = s.profile.learner.lastActiveAt || null;
    s.events = (s.events || []).map((e) => ({
      ...e,
      importance: e.importance || 'normal',
      alarm: Number(e.alarm || 0),
      alarmFiredAt: e.alarmFiredAt || null,
    }));
    s.schemaVersion = 2;
  }
  s.schemaVersion = SCHEMA_VERSION;
  return s;
}

export function getSession() {
  return session;
}

export function getState() {
  return session?.state || null;
}

export async function createAccount({
  username, displayName, password, major = '',
}) {
  const u = String(username || '').trim();
  const name = String(displayName || '').trim() || u;
  if (!u) throw new Error('请填写用户名');
  if (u.length > 32) throw new Error('用户名最多 32 个字符');
  if (!password || password.length < 8) throw new Error('密码至少 8 位');
  if (findAccount(u)) throw new Error('这个用户名已经存在，请直接登录');

  const salt = randomSalt();
  const key = await deriveKey(password, salt, PBKDF2_ITERATIONS);
  const state = createInitialState({ name, major });
  const enc = await encryptJSON(key, state, aad(u));
  const accounts = listAccounts();
  const account = {
    username: u,
    salt,
    iterations: PBKDF2_ITERATIONS,
    createdAt: new Date().toISOString(),
  };
  accounts.push(account);
  saveAccounts(accounts);
  writeJSON(vaultKey(u), { savedAt: new Date().toISOString(), enc });
  localStorage.setItem(LAST_USER_KEY, u);
  session = { account, key, state };
  return session;
}

export async function unlock(username, password) {
  const account = findAccount(username);
  if (!account) throw new Error('没有找到这个空间');
  let key;
  try {
    key = await deriveKey(password, account.salt, account.iterations || PBKDF2_ITERATIONS);
  } catch {
    throw new Error('无法派生密钥，请检查浏览器是否支持 WebCrypto');
  }
  const record = readJSON(vaultKey(account.username), null);
  if (!record?.enc) throw new Error('没有找到加密数据');
  let state;
  try {
    state = await decryptJSON(key, record.enc, aad(account.username));
  } catch {
    throw new Error('密码不正确，或数据已损坏');
  }
  state = migrateState(state);
  session = { account, key, state };
  localStorage.setItem(LAST_USER_KEY, account.username);
  return session;
}

export function touch() {
  if (session) session.state.updatedAt = new Date().toISOString();
}

/** 加密落盘（防抖）。返回的 Promise 可用于"立即保存"。 */
export function persistSoon(delay = 300) {
  if (!session) return Promise.resolve();
  touch();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    flush().catch((err) => {
      lastError = err;
      console.error('[juren] 保存失败', err);
    });
  }, delay);
  return saveChain;
}

export function flush() {
  if (!session) return Promise.resolve();
  clearTimeout(saveTimer);
  saveTimer = null;
  const { account, key, state } = session;
  const snapshot = clone(state);
  const previous = saveChain.catch(() => {});
  saveChain = previous.then(async () => {
    const enc = await encryptJSON(key, snapshot, aad(account.username));
    writeJSON(vaultKey(account.username), { savedAt: new Date().toISOString(), enc });
  }).catch((err) => {
    lastError = err;
    throw err;
  });
  return saveChain;
}

export async function lock() {
  try { await flush(); } catch { /* 保存失败也要允许锁定 */ }
  session = null;
  clearTimeout(saveTimer);
  saveTimer = null;
}

export function getLastError() {
  return lastError;
}

export function exportState() {
  if (!session) throw new Error('尚未登录');
  return clone(session.state);
}

export function storageBytes() {
  let bytes = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith('zhixu.')) bytes += (localStorage.getItem(k) || '').length * 2;
  }
  return bytes;
}

function mergeArrays(current, incoming, prefix) {
  const byId = new Map(current.map((x) => [x.id, x]));
  let added = 0;
  for (let item of incoming) {
    if (!item || typeof item !== 'object') continue;
    let id = item.id || `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    if (byId.has(id)) {
      const existing = byId.get(id);
      // 同 id 同内容视为重复导入；同 id 不同内容则换新 id，绝不覆盖
      if (JSON.stringify(existing) === JSON.stringify(item)) continue;
      id = `${id}_import_${Math.random().toString(36).slice(2, 6)}`;
      item = { ...item, id };
    }
    byId.set(id, item);
    added++;
  }
  return { list: [...byId.values()], added };
}

function mergeStats(a = {}, b = {}) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    if (typeof v === 'number') out[k] = Math.max(out[k] || 0, v);
    else if (v && typeof v === 'object') {
      out[k] = out[k] || {};
      for (const [sk, sv] of Object.entries(v)) {
        if (typeof sv === 'number') out[k][sk] = Math.max(out[k][sk] || 0, sv);
        else out[k][sk] = out[k][sk] ?? sv;
      }
    } else if (out[k] == null) out[k] = v;
  }
  return out;
}

/** 合并导入：保留现有数据，只新增；同 id 冲突时自动改 id。 */
export function mergeState(incoming) {
  if (!session) throw new Error('尚未登录');
  const inc = migrateState(incoming);
  const cur = session.state;
  const events = mergeArrays(cur.events || [], inc.events || [], 'ev');
  const questions = mergeArrays(cur.questions || [], inc.questions || [], 'q');
  const chats = mergeArrays(cur.chats || [], inc.chats || [], 'chat');
  const focus = mergeArrays(cur.focusSessions || [], inc.focusSessions || [], 'focus');
  const learner = {
    ...cur.profile.learner,
    tagStats: mergeStats(cur.profile.learner?.tagStats, inc.profile?.learner?.tagStats),
    errorTypes: mergeStats(cur.profile.learner?.errorTypes, inc.profile?.learner?.errorTypes),
    preferences: [...new Set([
      ...(cur.profile.learner?.preferences || []),
      ...(inc.profile?.learner?.preferences || []),
    ])],
    streak: Math.max(cur.profile.learner?.streak || 0, inc.profile?.learner?.streak || 0),
  };
  session.state = {
    ...cur,
    schemaVersion: SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    events: events.list,
    questions: questions.list,
    chats: chats.list,
    focusSessions: focus.list,
    profile: {
      ...cur.profile,
      learner,
      settings: { ...inc.profile?.settings, ...cur.profile?.settings },
    },
    meta: {
      ...cur.meta,
      ...inc.meta,
      lastBackupAt: cur.meta?.lastBackupAt || inc.meta?.lastBackupAt || null,
    },
  };
  persistSoon(0);
  return {
    events: events.added,
    questions: questions.added,
    chats: chats.added,
    focusSessions: focus.added,
  };
}

export function markBackup() {
  if (!session) return;
  session.state.meta.lastBackupAt = new Date().toISOString();
  persistSoon();
}

export async function makePortableBackup(password) {
  if (!session) throw new Error('尚未登录');
  if (!password || password.length < 8) throw new Error('备份密码至少 8 位');
  await flush();
  return encryptPortable(exportState(), password);
}

export async function restorePortableBackup(file, password) {
  const state = await decryptPortable(file, password);
  return state;
}

export function replaceState(incoming) {
  if (!session) throw new Error('尚未登录');
  session.state = migrateState(incoming);
  persistSoon(0);
}

export async function deleteCurrentAccount() {
  if (!session) return;
  try { await flush(); } catch { /* 删除优先 */ }
  const username = session.account.username;
  const accounts = listAccounts().filter((a) => a.username !== username);
  saveAccounts(accounts);
  localStorage.removeItem(vaultKey(username));
  if (localStorage.getItem(LAST_USER_KEY) === username) localStorage.removeItem(LAST_USER_KEY);
  session = null;
  clearTimeout(saveTimer);
  saveTimer = null;
}

export function accountSummary() {
  if (!session) return null;
  return {
    username: session.account.username,
    displayName: session.state?.profile?.name || session.account.username,
    createdAt: session.account.createdAt,
    bytes: storageBytes(),
  };
}
