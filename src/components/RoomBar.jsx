import { useEffect, useRef, useState } from 'react';
import { genRoomCode, getRoomList, addRoom, removeRoom } from '../lib/rooms.js';
import { supabase } from '../lib/supabase.js';

// 拉取每个房间的战绩概览（打了几下 / 吐槽几条）
function useRoomCounts(list) {
  const [counts, setCounts] = useState({});
  const key = list.join(',');
  useEffect(() => {
    let alive = true;
    (async () => {
      const next = {};
      for (const code of list) {
        const [{ count: hits }, { count: posts }] = await Promise.all([
          supabase.from('effigy_hits').select('id', { count: 'exact', head: true }).eq('room_code', code),
          supabase.from('board_posts').select('id', { count: 'exact', head: true }).eq('room_code', code),
        ]);
        next[code] = { hits: hits ?? 0, posts: posts ?? 0 };
      }
      if (alive) setCounts(next);
    })();
    return () => { alive = false; };
  }, [key]); // eslint-disable-line
  return counts;
}

export default function RoomBar({ room, onChange }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [list, setList] = useState(() => {
    const l = getRoomList();
    return l.includes(room) ? l : [room, ...l];
  });
  const [toast, setToast] = useState('');
  const boxRef = useRef(null);
  const counts = useRoomCounts(list);

  // 确保当前房间在列表里
  useEffect(() => {
    if (room && !list.includes(room)) setList([room, ...getRoomList()]);
    // eslint-disable-next-line
  }, [room]);

  // 点击外部关闭弹层
  useEffect(() => {
    if (!open) return;
    function onDoc(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  function flash(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 1500);
  }
  function switchTo(code) {
    addRoom(code); setList(getRoomList()); onChange(code); setOpen(false);
  }
  function create() {
    const c = genRoomCode(); addRoom(c); setList(getRoomList()); onChange(c); flash(`已新建房间 ${c}`);
  }
  function join() {
    const c = input.trim().toUpperCase();
    if (!c) return;
    switchTo(c); setInput('');
  }
  async function destroy(code) {
    if (!window.confirm(`确定销毁房间 ${code}？\n该房间的所有打小人记录与吐槽将被永久删除，且不可恢复。`)) return;
    await supabase.from('effigy_hits').delete().eq('room_code', code);
    await supabase.from('board_posts').delete().eq('room_code', code);
    const rest = removeRoom(code);
    if (code === room) {
      const next = rest[0] || genRoomCode();
      if (!rest[0]) addRoom(next);
      onChange(next);
    }
    setList(getRoomList());
  }
  function copyText(text, msg) {
    navigator.clipboard?.writeText(text).then(() => flash(msg));
  }
  const inviteLink = `${window.location.origin}${window.location.pathname}?room=${room}`;

  return (
    <div className="flex items-center gap-2 shrink-0">
      {/* 一键分享：复制当前房间的邀请链接（点开即进同一房间） */}
      <button
        onClick={() => copyText(inviteLink, '邀请链接已复制，发给同事吧')}
        title="复制本房间邀请链接，发给同事即可一起玩"
        className="hidden sm:flex items-center gap-1.5 px-3 h-9 rounded-full bg-white hover:bg-rose-50 border border-rose-100 text-slate-600 text-sm font-semibold transition"
      >
        <span>🔗</span>
        <span className="hidden lg:inline opacity-70 font-normal">复制链接</span>
      </button>

      <div className="relative shrink-0" ref={boxRef}>
      {/* 房间胶囊 */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="房间管理"
        className={`flex items-center gap-1.5 px-3 h-9 rounded-full border text-sm font-semibold transition ${
          open ? 'bg-rose-500 text-white border-rose-500' : 'bg-white hover:bg-rose-50 border-rose-100 text-slate-600'
        }`}
      >
        <span>🚪</span>
        <span className="hidden sm:inline opacity-70 font-normal">房间</span>
        <span className={open ? 'tracking-wider' : 'tracking-wider text-rose-500'}>{room}</span>
        <span className="text-xs opacity-60">{open ? '▲' : '▼'}</span>
      </button>

      {/* 弹层 */}
      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-xl border border-rose-100 p-3 z-40">
          {/* 当前房间操作 */}
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs text-slate-500 shrink-0">当前</span>
            <span className="font-bold text-rose-500 tracking-wider">{room}</span>
            <div className="flex-1" />
            <button className="text-xs btn-ghost" onClick={() => copyText(room, '房间码已复制')}>复制码</button>
            <button className="text-xs btn-ghost" onClick={() => copyText(inviteLink, '邀请链接已复制')}>复制链接</button>
          </div>

          {/* 加入 / 新建 */}
          <div className="flex items-center gap-2 mb-3">
            <input
              className="input !py-1.5 !text-sm flex-1"
              placeholder="输入房间码加入"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && join()}
            />
            <button className="text-xs btn-ghost shrink-0" onClick={join}>加入</button>
            <button className="text-xs btn-ghost shrink-0" onClick={create}>新建</button>
          </div>

          {/* 我的房间列表 */}
          <div className="border-t border-slate-100 pt-2">
            <p className="text-xs text-slate-400 mb-1.5">我的房间（点击切换，原房间数据保留）</p>
            <ul className="space-y-1 max-h-56 overflow-auto">
              {list.map((code) => {
                const c = counts[code] || {};
                const isActive = code === room;
                return (
                  <li key={code} className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm ${isActive ? 'bg-rose-50' : 'hover:bg-slate-50'}`}>
                    <button className="flex-1 text-left flex items-center gap-1.5 min-w-0" onClick={() => switchTo(code)}>
                      <span className={isActive ? 'font-bold text-rose-600 tracking-wider' : 'text-slate-600 tracking-wider'}>{code}</span>
                      {isActive && <span className="text-[10px] text-rose-400 shrink-0">当前</span>}
                      <span className="text-[11px] text-slate-400 ml-auto shrink-0">
                        {c.hits ?? '-'} 下 · {c.posts ?? '-'} 帖
                      </span>
                    </button>
                    <button className="text-slate-300 hover:text-rose-500 shrink-0" onClick={() => destroy(code)} title="销毁房间（不可恢复）">🗑️</button>
                  </li>
                );
              })}
            </ul>
          </div>

          <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
            多人玩的关键：<span className="text-rose-500 font-semibold">大家在同一房间</span>。发「房间码」或「邀请链接」给同事即可，点 🗑️ 才真正销毁。
          </p>
        </div>
      )}

      {/* 轻提示 */}
      {toast && (
        <div className="absolute right-0 top-11 mt-1 px-3 py-1.5 rounded-lg bg-slate-800 text-white text-xs whitespace-nowrap z-50 animate-pop">
          {toast}
        </div>
      )}
      </div>
    </div>
  );
}
