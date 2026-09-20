// 客户端加密：房间内容在浏览器端加密后再上传，数据库只存密文（后台也看不到）。
// 每个房间一把 AES-GCM 256 密钥，仅存于本机 localStorage 与分享链接的 #k= 片段（永不发往数据库）。
// 老房间（房间号不含 '-' 且无本地密钥）不加密，保持向后兼容（明文）。

const KEY_PREFIX = 'ventbox:key:';
const ENC_TAG = 'enc:';

function bytesToB64url(b) {
  const bytes = b instanceof Uint8Array ? b : new Uint8Array(b);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s);
  const a = new Uint8Array(bin.length);
  for (let i = 0; i < a.length; i++) a[i] = bin.charCodeAt(i);
  return a;
}

async function importKey(b64) {
  const raw = b64urlToBytes(b64);
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

// 返回该房间的 CryptoKey（Promise）；老房间返回 null（不加密）
export async function getRoomKey(roomCode) {
  try {
    const stored = window.localStorage.getItem(KEY_PREFIX + roomCode);
    if (stored) return importKey(stored);
  } catch { /* ignore */ }
  if (!roomCode || !roomCode.includes('-')) return null; // 老房间：不加密
  // 尝试从分享链接的 #k= 片段导入（joiner 用）
  try {
    const m = /[#&]k=([^&]+)/.exec(window.location.hash || '');
    if (m) {
      const k = decodeURIComponent(m[1]);
      window.localStorage.setItem(KEY_PREFIX + roomCode, k);
      return importKey(k);
    }
  } catch { /* ignore */ }
  // 本房间尚无密钥 → 生成一把
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const k = bytesToB64url(raw);
  try { window.localStorage.setItem(KEY_PREFIX + roomCode, k); } catch { /* ignore */ }
  return importKey(k);
}

export async function encryptText(key, text) {
  if (!key || text == null) return text;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(String(text)));
  return ENC_TAG + bytesToB64url(iv) + '.' + bytesToB64url(ct);
}

// 永不抛错：无法解密（无 key / 老明文 / 损坏）时原样返回
export async function decryptText(key, val) {
  if (!val || typeof val !== 'string' || !val.startsWith(ENC_TAG)) return val;
  if (!key) return val;
  try {
    const body = val.slice(ENC_TAG.length);
    const [ivb, ctb] = body.split('.').map(b64urlToBytes);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivb }, key, ctb);
    return new TextDecoder().decode(pt);
  } catch {
    return val;
  }
}
