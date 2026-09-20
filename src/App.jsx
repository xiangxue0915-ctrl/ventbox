import { useEffect, useState } from 'react';
import TreeHole from './components/TreeHole.jsx';
import HitEffigy from './components/HitEffigy.jsx';
import PublicBoard from './components/PublicBoard.jsx';
import Ranking from './components/Ranking.jsx';
import AnonymousPanel from './components/AnonymousPanel.jsx';
import RoomBar from './components/RoomBar.jsx';
import AiCompanion from './components/AiCompanion.jsx';
import { randomAnon } from './lib/anon.js';
import { getRoomList, getCurrentRoom, genRoomCode, addRoom } from './lib/rooms.js';

const ANON_KEY = 'anon.identity';

const TABS = [
  { id: 'effigy', icon: '👊', label: '打小人' },
  { id: 'treehole', icon: '🌳', label: '私密树洞' },
  { id: 'board', icon: '💬', label: '多人吐槽' },
  { id: 'ranking', icon: '🏆', label: '排名' },
  { id: 'anon', icon: '🎭', label: '我的马甲' },
];

export default function App() {
  const [active, setActive] = useState('effigy');
  const [room, setRoom] = useState(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('room');
    if (fromUrl) return addRoom(fromUrl);
    const list = getRoomList();
    return getCurrentRoom() || list[0] || addRoom(genRoomCode());
  });
  // 全局匿名身份：持久化，刷新不变；可在胶囊处一键切换
  const [anon, setAnon] = useState(() => {
    try {
      const raw = localStorage.getItem(ANON_KEY);
      if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return randomAnon();
  });
  // 贴纸条 / 提示的全局轻提示
  const [pinToast, setPinToast] = useState('');

  useEffect(() => { addRoom(room); }, [room]);
  useEffect(() => {
    try { localStorage.setItem(ANON_KEY, JSON.stringify(anon)); } catch { /* ignore */ }
  }, [anon]);

  // AI 搭子里的「📌 贴到小人身上」：在全局层处理，即使用户当时不在打小人页也能贴上
  useEffect(() => {
    function onPin(e) {
      const text = String((e && e.detail) || '').trim().slice(0, 30);
      if (!text) return;
      let tgt = '';
      try { tgt = localStorage.getItem('effigy.currentTarget:' + room) || ''; } catch { /* ignore */ }
      if (!tgt) {
        setPinToast('先在「打小人」页给对象「贴上去」一个名字，再回来贴纸条');
        setActive('effigy');
        return;
      }
      try { localStorage.setItem('effigy.note:' + room + ':' + tgt, text); } catch { /* ignore */ }
      setPinToast(`📌 已贴到「${tgt}」身上`);
      setActive('effigy');
      // 若打小人页已经挂载，通知它立刻刷新纸条
      window.dispatchEvent(new CustomEvent('ventbox:note-applied', { detail: { target: tgt, text } }));
    }
    window.addEventListener('ventbox:pin-note', onPin);
    return () => window.removeEventListener('ventbox:pin-note', onPin);
  }, [room]);

  useEffect(() => {
    if (!pinToast) return;
    const t = setTimeout(() => setPinToast(''), 3000);
    return () => clearTimeout(t);
  }, [pinToast]);

  const rerollAnon = () => setAnon(randomAnon());

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-rose-50 text-slate-800">
      {/* ===== 顶栏：所有全局状态一行收纳 ===== */}
      <header className="sticky top-0 z-30 backdrop-blur bg-white/80 border-b border-rose-100">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-3">
          <h1 className="flex items-center gap-1.5 font-extrabold text-slate-800 shrink-0">
            <span className="text-lg">📦</span>
            <span className="hidden sm:inline">吐槽解压箱</span>
            <span className="sm:hidden">VentBox</span>
          </h1>
          <div className="flex-1" />
          {/* 房间胶囊 */}
          <RoomBar room={room} onChange={setRoom} />
          {/* 匿名胶囊 */}
          <button
            onClick={rerollAnon}
            title="点击换一个匿名身份"
            className="flex items-center gap-1.5 px-3 h-9 rounded-full bg-rose-50 hover:bg-rose-100 border border-rose-100 text-rose-600 text-sm font-semibold transition shrink-0"
          >
            <span>{anon.avatar ? <img src={anon.avatar} alt="" className="w-5 h-5 rounded-full object-cover" /> : anon.emoji}</span>
            <span className="hidden md:inline max-w-[9rem] truncate">{anon.name}</span>
          </button>
        </div>
      </header>

      {/* 全局轻提示：贴纸条结果等 */}
      {pinToast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-slate-800 text-white text-sm shadow-xl animate-pop max-w-[90vw] text-center">
          {pinToast}
        </div>
      )}

      {/* 全部页签统一 max-w-4xl，切换时宽度不再跳动 */}
      <div className="max-w-4xl mx-auto px-4 py-5 flex gap-5">
        {/* ===== 桌面：左侧竖排导航 ===== */}
        <nav className="hidden md:flex flex-col gap-1 w-36 shrink-0 sticky top-20 self-start">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setActive(t.id)}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold text-left transition ${
                active === t.id
                  ? 'bg-rose-500 text-white shadow-sm shadow-rose-200'
                  : 'text-slate-600 hover:bg-white'
              }`}
            >
              <span className="text-base">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </nav>

        {/* ===== 主内容区：所有页签统一阅读宽度，杜绝切页跳动 ===== */}
        <main className="flex-1 min-w-0 pb-24 md:pb-6">
          <div className="max-w-2xl">
            {active === 'treehole' && <TreeHole />}
            {active === 'effigy' && <HitEffigy room={room} />}
            {active === 'board' && <PublicBoard anon={anon} room={room} />}
            {active === 'ranking' && <Ranking room={room} />}
            {active === 'anon' && <AnonymousPanel anon={anon} onReroll={rerollAnon} onEdit={setAnon} />}
            <footer className="text-xs text-slate-400 mt-8">
              多人房间 · 数据云端实时同步 · 全程匿名 · 私密树洞仍仅存本机
            </footer>
          </div>
        </main>
      </div>

      {/* ===== 手机：底部固定导航 ===== */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur border-t border-rose-100 flex">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActive(t.id)}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition ${
              active === t.id ? 'text-rose-600' : 'text-slate-400'
            }`}
          >
            <span className="text-lg">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>

      {/* AI 解压搭子：右下角浮窗（自包含，不动底部导航格数） */}
      <AiCompanion />
    </div>
  );
}
