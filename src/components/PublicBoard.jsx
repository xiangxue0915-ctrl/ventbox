import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { getRoomKey, encryptText, decryptText } from '../lib/crypto.js';

// 公共广场：跨房间共享，room_code 固定为 'PUBLIC'
const PUBLIC_CODE = 'PUBLIC';

// 房间内帖子用本机房间密钥加密，读出时统一解密（公共广场不加密，保持明文）
async function decryptPosts(code, rows) {
  if (code === PUBLIC_CODE) return rows;
  const key = await getRoomKey(code);
  if (!key) return rows;
  return Promise.all(rows.map(async (p) => ({
    ...p,
    content: await decryptText(key, p.content),
    target: await decryptText(key, p.target),
  })));
}

function nowStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function PublicBoard({ anon, room }) {
  const [posts, setPosts] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [content, setContent] = useState('');
  const [target, setTarget] = useState('');
  const [scope, setScope] = useState('room'); // 'room' | 'public'

  // 当前作用域对应的 room_code：公共广场固定为 'PUBLIC'，否则用传入的房间码
  const code = scope === 'public' ? PUBLIC_CODE : room;

  useEffect(() => {
    let alive = true;
    setPosts([]); // 切换作用域时先清空乐观列表，避免串数据
    setLoaded(false);
    async function load() {
      const { data, error } = await supabase
        .from('board_posts')
        .select('*')
        .eq('room_code', code)
        .order('created_at', { ascending: false });
      if (alive) {
        if (!error) setPosts(await decryptPosts(code, data || []));
        setLoaded(true);
      }
    }
    load();
    // 频道名带 scope，realtime 的 filter 也跟 scope 走；切换时 removeChannel 重建
    const ch = supabase
      .channel('board-' + scope + '-' + room)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'board_posts', filter: `room_code=eq.${code}` }, () => refresh())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'board_posts', filter: `room_code=eq.${code}` }, () => refresh())
      .subscribe();
    return () => { alive = false; supabase.removeChannel(ch); };
    // eslint-disable-next-line
  }, [scope, room]);

  async function refresh() {
    const { data, error } = await supabase
      .from('board_posts')
      .select('*')
      .eq('room_code', code)
      .order('created_at', { ascending: false });
    if (!error) setPosts(await decryptPosts(code, data || []));
  }

  async function publish() {
    const c = content.trim();
    if (!c) return;
    const t = target.trim();
    const key = code === PUBLIC_CODE ? null : await getRoomKey(code); // 公共广场不加密，房间内加密
    const post = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      room_code: code,
      anon_name: anon.name,
      anon_emoji: anon.emoji,
      content: key ? await encryptText(c, key) : c,
      target: key ? await encryptText(t, key) : t,
      created_at: nowStr(),
      likes: 0,
    };
    setPosts((p) => [{ ...post, content: c, target: t }, ...p]); // 乐观更新（作者本机先看到明文）
    setContent(''); setTarget('');
    await supabase.from('board_posts').insert(post);
    refresh();
  }

  async function like(id) {
    const post = posts.find((p) => p.id === id);
    if (!post) return;
    setPosts((p) => p.map((x) => (x.id === id ? { ...x, likes: x.likes + 1 } : x))); // 乐观
    await supabase.from('board_posts').update({ likes: post.likes + 1 }).eq('id', id);
    refresh();
  }

  return (
    <div>
      <h2 className="text-xl font-bold text-slate-800 mb-4">💬 多人吐槽</h2>

      {/* 分段切换：本房间 / 公共广场 */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-xl mb-3">
        <button
          onClick={() => setScope('room')}
          className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${scope === 'room' ? 'bg-rose-500 text-white shadow-sm' : 'text-slate-600'}`}
        >本房间</button>
        <button
          onClick={() => setScope('public')}
          className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${scope === 'public' ? 'bg-rose-500 text-white shadow-sm' : 'text-slate-600'}`}
        >🌐 公共广场</button>
      </div>
      <p className="text-xs text-slate-400 mb-3">
        本房间：只有输入同一房间码的人可见 ｜ 公共广场：所有打开这个网页的人都能看到
      </p>

      <div className="card mb-4">
        <div className="flex items-center gap-2 mb-2 text-sm text-slate-500">
          <span className="text-xl">{anon.emoji}</span>
          <span>以 <span className="font-semibold text-rose-500">{anon.name}</span> 的身份发布（匿名 · {scope === 'public' ? '公共广场所有人可见' : '仅本房间可见'}）</span>
        </div>
        <textarea className="input resize-none" rows={3} placeholder="说点什么解解压吧～（全程匿名）"
          value={content} onChange={(e) => setContent(e.target.value)} />
        <input className="input mt-2" placeholder="可选：吐槽对象标签，如「周一晨会」"
          value={target} onChange={(e) => setTarget(e.target.value)} />
        <div className="flex justify-end mt-2">
          <button className="btn-primary" onClick={publish} disabled={!content.trim()}>匿名发布</button>
        </div>
      </div>

      {loaded && posts.length === 0 ? (
        <p className="text-center text-sm text-slate-400 py-8">
          {scope === 'public' ? '公共广场还没有人说话，来当第一个吧 👀' : '这个房间还没人吐槽，来当第一个吧 👀'}
        </p>
      ) : (
        <ul className="space-y-3">
          {posts.map((p) => (
            <li key={p.id} className="card">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">{p.anon_emoji}</span>
                <span className="text-sm font-semibold text-slate-700">{p.anon_name}</span>
                {p.target && <span className="text-xs bg-rose-50 text-rose-500 px-2 py-0.5 rounded-full">#{p.target}</span>}
                <span className="text-xs text-slate-400 ml-auto">{p.created_at}</span>
              </div>
              <p className="text-slate-700 whitespace-pre-wrap break-words">{p.content}</p>
              <div className="mt-2">
                <button className="btn-ghost text-sm" onClick={() => like(p.id)}>👍 赞({p.likes})</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
