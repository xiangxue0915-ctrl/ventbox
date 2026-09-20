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

  useEffect(() => { addRoom(room); }, [room]);
  useEffect(() => {
    try { localStorage.setItem(ANON_KEY, JSON.stringify(anon)); } catch { /* ignore */ }
  }, [anon]);

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
            <span>{anon.emoji}</span>
            <span className="hidden md:inline max-w-[9rem] truncate">{anon.name}</span>
          </button>
        </div>
      </header>

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
