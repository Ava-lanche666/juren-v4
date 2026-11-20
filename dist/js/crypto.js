/* 聚仁 · 本地加密
 * 账号密码 -> PBKDF2-SHA256 -> AES-256-GCM。
 * 密码与明文都不落盘；页面刷新后内存中的密钥即丢失。
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

export const PBKDF2_ITERATIONS = 310000;

export function bytesToB64(bytes) {
  let bin = '';
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const chunk = 0x8000;
  for (let i = 0; i < arr.length; i += chunk) {
    bin += String.fromCharCode(...arr.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function randomSalt() {
  return bytesToB64(crypto.getRandomValues(new Uint8Array(16)));
}

export async function deriveKey(password, saltB64, iterations = PBKDF2_ITERATIONS) {
  const material = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: b64ToBytes(saltB64),
      iterations,
      hash: 'SHA-256',
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** 加密任意 JSON。aad 用于把密文绑定到账号与版本，防止调包。 */
export async function encryptJSON(key, value, aad = '') {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = enc.encode(JSON.stringify(value));
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: enc.encode(aad) },
    key,
    plaintext,
  );
  return {
    v: 1,
    alg: 'AES-256-GCM',
    kdf: 'PBKDF2-SHA256',
    iv: bytesToB64(iv),
    ct: bytesToB64(cipher),
  };
}

export async function decryptJSON(key, payload, aad = '') {
  if (!payload || !payload.iv || !payload.ct) throw new Error('密文格式不正确');
  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: b64ToBytes(payload.iv),
      additionalData: enc.encode(aad),
    },
    key,
    b64ToBytes(payload.ct),
  );
  return JSON.parse(dec.decode(plaintext));
}

/** 独立备份密码：自带 salt，与登录密码解耦。 */
export async function encryptPortable(value, password) {
  const salt = randomSalt();
  const key = await deriveKey(password, salt, PBKDF2_ITERATIONS);
  const payload = await encryptJSON(key, value, 'juren-backup-v1');
  return {
    format: 'juren-backup',
    version: 1,
    createdAt: new Date().toISOString(),
    kdf: { name: 'PBKDF2-SHA256', iterations: PBKDF2_ITERATIONS, salt },
    payload,
  };
}

export async function decryptPortable(file, password) {
  const legacy = file?.format === 'zhixu-backup';
  if (!file || (!legacy && file.format !== 'juren-backup') || !file.kdf?.salt) {
    throw new Error('不是有效的聚仁加密备份');
  }
  const key = await deriveKey(password, file.kdf.salt, file.kdf.iterations || PBKDF2_ITERATIONS);
  return decryptJSON(key, file.payload, legacy ? 'zhixu-backup-v1' : 'juren-backup-v1');
}
