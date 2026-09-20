import { useEffect, useState } from 'react';
import { get } from '../lib/storage.js';
import { supabase } from '../lib/supabase.js';

const POSTS_KEY = 'board.posts';
const HITS_KEY = 'effigy.hits';

function BarChart({ data, unit, emptyText }) {
  const max = data.length ? data[0].count : 0;
  if (data.length === 0) {
    return <p className="text-sm text-slate-400 py-6 text-center">{emptyText}</p>;
  }
  return (
    <ul className="space-y-3">
      {data.map((d, i) => (
        <li key={d.name}>
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-slate-600"><span className="text-slate-400 mr-1">{i + 1}.</span>{d.name}</span>
            <span className="font-semibold text-rose-500">{d.count}{unit}</span>
          </div>
          <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-rose-400 to-amber-400 transition-all" style={{ width: max > 0 ? `${(d.count / max) * 100}%` : '0%' }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function Ranking({ room }) {
  // 三张榜分开统计，互不相加（均限本房间）
  const [hitRanking, setHitRanking] = useState([]); // 挨打榜：effigy_hits 按 target
  const [targetRanking, setTargetRanking] = useState([]); // 吐槽对象榜：board_posts.target 非空
  const [posterRanking, setPosterRanking] = useState([]); // 发帖活跃榜：board_posts 按 anon_name

  useEffect(() => {
    let alive = true;
    async function load() {
      const key = await getRoomKey(room);
      const [{ data: posts, error: e1 }, { data: hits, error: e2 }] = await Promise.all([
        supabase.from('board_posts').select('*').eq('room_code', room),
        supabase.from('effigy_hits').select('*').eq('room_code', room),
      ]);
      // 解密 target 后再做分组统计（target 在库里是密文）
      const pList = !e1 && posts ? await Promise.all(posts.map(async (p) => ({ ...p, target: await decryptText(key, p.target) }))) : get(POSTS_KEY, []);
      const hitRows = !e2 && hits ? await Promise.all(hits.map(async (h) => ({ ...h, target: await decryptText(key, h.target) }))) : [];

      // 卡1：挨打榜 = 打小人 effigy_hits 按 target 计数（被揍次数）
      const hitMap = {};
      hitRows.forEach((h) => { if (h.target) hitMap[h.target] = (hitMap[h.target] || 0) + 1; });
      // 离线回退：合并本机 hits
      const localHits = get(HITS_KEY, {});
      Object.entries(localHits).forEach(([name, count]) => { hitMap[name] = (hitMap[name] || 0) + count; });

      // 卡2：吐槽对象榜 = 多人吐槽 board_posts.target 非空计数
      const targetMap = {};
      pList.forEach((p) => { if (p.target) targetMap[p.target] = (targetMap[p.target] || 0) + 1; });

      // 卡3：发帖活跃榜 = 多人吐槽 board_posts 按 anon_name 计数
      const posterMap = {};
      pList.forEach((p) => { if (p.anon_name) posterMap[p.anon_name] = (posterMap[p.anon_name] || 0) + 1; });

      if (!alive) return;
      setHitRanking(Object.entries(hitMap).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 5));
      setTargetRanking(Object.entries(targetMap).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 5));
      setPosterRanking(Object.entries(posterMap).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 5));
    }
    load();
    const ch = supabase
      .channel('rank-' + room)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'board_posts', filter: `room_code=eq.${room}` }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'effigy_hits', filter: `room_code=eq.${room}` }, () => load())
      .subscribe();
    return () => { alive = false; supabase.removeChannel(ch); };
    // eslint-disable-next-line
  }, [room]);

  return (
    <div>
      <h2 className="text-xl font-bold text-slate-800 mb-4">🏆 排名（本房间）</h2>

      <div className="card mb-4">
        <h3 className="font-semibold text-slate-700 mb-1">🥊 挨打榜</h3>
        <p className="text-xs text-slate-400 mb-3">打小人 · 按被揍次数排序</p>
        <BarChart data={hitRanking} unit=" 下" emptyText="还没人挨打，去打小人页出出气 🔨" />
      </div>

      <div className="card mb-4">
        <h3 className="font-semibold text-slate-700 mb-1">💬 吐槽对象榜</h3>
        <p className="text-xs text-slate-400 mb-3">多人吐槽 · 按 #标签 被提及次数</p>
        <BarChart data={targetRanking} unit=" 帖" emptyText="还没人给对象贴标签，去多人吐槽加个 #标签吧 🏷️" />
      </div>

      <div className="card">
        <h3 className="font-semibold text-slate-700 mb-1">⚡ 发帖活跃榜</h3>
        <p className="text-xs text-slate-400 mb-3">谁在多人吐槽里发言最多</p>
        <BarChart data={posterRanking} unit=" 帖" emptyText="还没人发言，去多人吐槽说点什么吧 💬" />
      </div>
    </div>
  );
}
