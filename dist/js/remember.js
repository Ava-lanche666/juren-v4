/* 设备本地免密：用不可导出的随机密钥加密登录密码，二者保存在 IndexedDB。
 * 持有同一浏览器配置的人可自动解锁，因此仅在用户主动勾选时启用。
 */
const DB_NAME = 'juren-trusted-device-v1';
const STORE = 'credentials';
const RECORD = 'last';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function openDB() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('此浏览器不支持记住密码')); return; }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('本地存储暂时不可用，请关闭其他页面后重试'));
  });
}

async function operation(mode, action) {
  const db = await openDB();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = action(tx.objectStore(STORE));
      let result;
      request.onsuccess = () => { result = request.result; };
      request.onerror = () => reject(request.error);
      tx.onabort = () => reject(tx.error);
      tx.oncomplete = () => resolve(result);
    });
  } finally { db.close(); }
}

async function read() { return operation('readonly', (store) => store.get(RECORD)); }

export async function rememberedUsername() {
  return (await read())?.username || null;
}

export async function saveRemembered(username, password) {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(username.toLowerCase()) }, key, encoder.encode(password),
  );
  await operation('readwrite', (store) => store.put({ username, iv, ciphertext, key }, RECORD));
}

export async function restoreRemembered() {
  const record = await read();
  if (!record) return null;
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: record.iv, additionalData: encoder.encode(record.username.toLowerCase()) },
    record.key, record.ciphertext,
  );
  return { username: record.username, password: decoder.decode(plaintext) };
}

export async function clearRemembered() {
  await operation('readwrite', (store) => store.delete(RECORD));
}
