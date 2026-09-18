import { useState } from 'react';
import { get, set, remove } from '../lib/storage.js';

const PIN_KEY = 'treehole.pin';
const ITEMS_KEY = 'treehole.items';

// 简单的非加密哈希（仅用于本地校验，不存储明文 PIN）
function hashPin(pin) {
  let h = 5381;
  for (let i = 0; i < pin.length; i++) {
    h = ((h << 5) + h + pin.charCodeAt(i)) >>> 0;
  }
  return h.toString(16);
}

function nowStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function TreeHole() {
  const storedPin = get(PIN_KEY, null);
  const [hasPin, setHasPin] = useState(storedPin !== null);
  const [locked, setLocked] = useState(storedPin !== null);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [items, setItems] = useState(() => get(ITEMS_KEY, []));
  const [text, setText] = useState('');

  function setupPin() {
    if (!/^\d{4}$/.test(pinInput)) {
      setPinError('请输入 4 位数字 PIN');
      return;
    }
    set(PIN_KEY, hashPin(pinInput));
    setHasPin(true);
    setLocked(false);
    setPinInput('');
    setPinError('');
  }

  function unlock() {
    if (pinInput.length === 0) {
      setPinError('请输入 PIN');
      return;
    }
    if (hashPin(pinInput) === storedPin) {
      setLocked(false);
      setPinError('');
    } else {
      setPinError('PIN 错误，请重试');
    }
    setPinInput('');
  }

  function addItem() {
    const t = text.trim();
    if (!t) return;
    const next = [
      {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        text: t,
        createdAt: nowStr(),
        released: false,
      },
      ...items,
    ];
    setItems(next);
    set(ITEMS_KEY, next);
    setText('');
  }

  function deleteItem(id) {
    const next = items.filter((it) => it.id !== id);
    setItems(next);
    set(ITEMS_KEY, next);
  }

  function toggleReleased(id) {
    const next = items.map((it) => (it.id === id ? { ...it, released: !it.released } : it));
    setItems(next);
    set(ITEMS_KEY, next);
  }

  function forgetPin() {
    if (!window.confirm('确定要清空本机树洞数据并忘记 PIN 吗？此操作不可恢复。')) return;
    remove(PIN_KEY);
    remove(ITEMS_KEY);
    setHasPin(false);
    setLocked(false);
    setItems([]);
    setPinInput('');
    setPinError('');
  }

  // 首次设置 PIN
  if (!hasPin) {
    return (
      <div className="card max-w-md mx-auto">
        <h2 className="text-lg font-bold text-slate-800 mb-1">🔐 设置你的私密 PIN</h2>
        <p className="text-sm text-slate-500 mb-4">树洞内容只存你本机，设置 4 位数字 PIN 来保护它。</p>
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
          已私密保存 {items.length} 条
        </span>
      </div>

      <div className="card mb-4">
        <textarea
          className="input resize-none"
          rows={3}
          placeholder="把憋在心里的话写下来，只有你自己看得到……"
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
