import { useState, useRef } from 'react';
import { get, set, remove } from '../lib/storage.js';

const PIN_KEY = 'treehole.pin';   // 旧版兼容：djb2 哈希，仅用于迁移时校验 PIN
const ITEMS_KEY = 'treehole.items';

// ===== 真·客户端加密：PBKDF2(12万次) + AES-GCM 256 =====
// 密钥只存在于本次会话内存（keyRef），绝不落盘；PIN 仅用于推导密钥，本身不存储。
const te = new TextEncoder();
const td = new TextDecoder();

function b64(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s);
}
function unb64(s) {
  const b = atob(s);
  const o = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) o[i] = b.charCodeAt(i);
  return o;
}
async function makeKey(pin, salt) {
  const base = await crypto.subtle.importKey('raw', te.encode(pin), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 120000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}
async function sealItems(key, salt, items) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, te.encode(JSON.stringify(items)));
  return 'th1:' + JSON.stringify({ s: b64(salt), i: b64(iv), c: b64(new Uint8Array(ct)) });
}
async function openItems(key, envStr) {
  const env = JSON.parse(envStr.slice(4));
  const iv = unb64(env.i);
  const ct = unb64(env.c);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return JSON.parse(td.decode(pt));
}

// 旧版 PIN 校验（仅迁移时用）
function hashPin(pin) {
  let h = 5381;
  for (let i = 0; i < pin.length; i++) h = ((h << 5) + h + pin.charCodeAt(i)) >>> 0;
  return h.toString(16);
}

function nowStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function TreeHole() {
  const storedPin = get(PIN_KEY, null);                 // 旧版 djb2 哈希或 null
  const raw = get(ITEMS_KEY, null);                     // null | 数组(旧明文) | 'th1:...' 信封
  const isEnvelope = typeof raw === 'string' && raw.startsWith('th1:');
  const isLegacy = Array.isArray(raw);
  const [hasPin, setHasPin] = useState(storedPin !== null || isEnvelope);
  const [locked, setLocked] = useState(storedPin !== null || isEnvelope);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [items, setItems] = useState([]);
  const [text, setText] = useState('');
  const keyRef = useRef(null);
  const saltRef = useRef(null);

  async function persist(next) {
    if (!keyRef.current || !saltRef.current) return;
    const env = await sealItems(keyRef.current, saltRef.current, next);
    set(ITEMS_KEY, env);
  }

  async function setupPin() {
    if (!/^\d{4}$/.test(pinInput)) { setPinError('请输入 4 位数字 PIN'); return; }
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await makeKey(pinInput, salt);
    keyRef.current = key; saltRef.current = salt;
    set(ITEMS_KEY, await sealItems(key, salt, []));
    remove(PIN_KEY);                 // 不再需要旧哈希
    setHasPin(true); setLocked(false); setPinInput(''); setPinError('');
  }

  async function unlock() {
    if (pinInput.length === 0) { setPinError('请输入 PIN'); return; }
    try {
      if (isLegacy) {
        // 旧版明文迁移：先用 djb2 校验 PIN，再把明文用 AES-GCM 重新加密
        if (hashPin(pinInput) !== storedPin) { setPinError('PIN 错误，请重试'); setPinInput(''); return; }
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const key = await makeKey(pinInput, salt);
        keyRef.current = key; saltRef.current = salt;
        set(ITEMS_KEY, await sealItems(key, salt, raw));   // raw 是旧明文数组
        remove(PIN_KEY);
        setItems(raw); setLocked(false); setPinError(''); setPinInput('');
        return;
      }
      const envObj = JSON.parse(raw.slice(4));
      const salt = unb64(envObj.s);
      const key = await makeKey(pinInput, salt);
      const opened = await openItems(key, raw);            // PIN 错会抛错 → 走 catch
      keyRef.current = key; saltRef.current = salt;
      setItems(opened); setLocked(false); setPinError(''); setPinInput('');
    } catch {
      setPinError('PIN 错误，请重试'); setPinInput('');
    }
  }

  function addItem() {
    const t = text.trim(); if (!t) return;
    const next = [
      {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        text: t,
        createdAt: nowStr(),
        released: false,
      },
      ...items,
    ];
    setItems(next); persist(next); setText('');
  }
  function deleteItem(id) {
    const next = items.filter((it) => it.id !== id);
    setItems(next); persist(next);
  }
  function toggleReleased(id) {
    const next = items.map((it) => (it.id === id ? { ...it, released: !it.released } : it));
    setItems(next); persist(next);
  }
  function forgetPin() {
    if (!window.confirm('确定要清空本机树洞数据并忘记 PIN 吗？此操作不可恢复。')) return;
    remove(PIN_KEY); remove(ITEMS_KEY);
    keyRef.current = null; saltRef.current = null;
    setHasPin(false); setLocked(true); setItems([]); setPinInput(''); setPinError('');
  }

  // 首次设置 PIN
  if (!hasPin) {
    return (
      <div className="card max-w-md mx-auto">
        <h2 className="text-lg font-bold text-slate-800 mb-1">🔐 设置你的私密 PIN</h2>
        <p className="text-sm text-slate-500 mb-4">树洞内容会用 PIN 在<strong>本机加密</strong>后保存，只有输入正确 PIN 才能解开。请务必记牢，忘记无法找回。</p>
        <input
          className="input text-center tracking-[0.5em] text-lg"
          type="password"
          inputMode="numeric"
          maxLength={4}
          placeholder="••••"
          value={pinInput}
          onChange={(e) => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
        />
        {pinError && <p className="text-rose-500 text-sm mt-2">{pinError}</p>}
        <button className="btn-primary w-full mt-4" onClick={setupPin}>
          设定并进入
        </button>
      </div>
    );
  }

  // 已锁
  if (locked) {
    return (
      <div className="card max-w-md mx-auto">
        <h2 className="text-lg font-bold text-slate-800 mb-1">🔒 输入 PIN 解锁树洞</h2>
        <input
          className="input text-center tracking-[0.5em] text-lg"
          type="password"
          inputMode="numeric"
          maxLength={4}
          placeholder="••••"
          value={pinInput}
          onChange={(e) => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
          onKeyDown={(e) => e.key === 'Enter' && unlock()}
        />
        {pinError && <p className="text-rose-500 text-sm mt-2">{pinError}</p>}
        <button className="btn-primary w-full mt-4" onClick={unlock}>
          解锁
        </button>
        <button className="btn-ghost w-full mt-2 text-rose-500" onClick={forgetPin}>
          忘记 PIN？清空本机树洞
        </button>
      </div>
    );
  }

  // 已解锁：列表
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-slate-800">🌳 私密树洞</h2>
        <span className="text-sm text-rose-500 font-semibold bg-rose-50 px-3 py-1 rounded-full">
          已加密保存 {items.length} 条
        </span>
      </div>

      <div className="card mb-4">
        <textarea
          className="input resize-none"
          rows={3}
          placeholder="把憋在心里的话写下来，PIN 加密后才落盘……"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="flex justify-end mt-2">
          <button className="btn-primary" onClick={addItem} disabled={!text.trim()}>
            悄悄写下来
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="card text-center text-slate-400 text-sm py-10">还没有吐槽，写下第一条吧 🌱</div>
      ) : (
        <ul className="space-y-3">
          {items.map((it) => (
            <li key={it.id} className="card flex items-start gap-3">
              <div className="flex-1">
                <p className={`whitespace-pre-wrap break-words ${it.released ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                  {it.text}
                </p>
                <p className="text-xs text-slate-400 mt-1">{it.createdAt}</p>
              </div>
              <div className="flex flex-col gap-2 shrink-0">
                <button className="btn-ghost text-xs px-2 py-1" onClick={() => toggleReleased(it.id)}>
                  {it.released ? '↩ 撤销' : '✓ 已释怀'}
                </button>
                <button
                  className="btn-ghost text-xs px-2 py-1 text-rose-500"
                  onClick={() => deleteItem(it.id)}
                >
                  🗑 删除
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6 text-center">
        <button className="text-xs text-slate-400 hover:text-rose-500" onClick={forgetPin}>
          忘记 PIN / 清空本机树洞数据
        </button>
      </div>
    </div>
  );
}
