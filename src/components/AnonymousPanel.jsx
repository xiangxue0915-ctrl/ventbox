import { useState } from 'react';
import { AVATAR_EMOJIS } from '../lib/anon.js';

// 匿名模块：解释全局匿名机制（马甲），支持一键切换 + 自定义名字与头像
export default function AnonymousPanel({ anon, onReroll, onEdit }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(anon.name);
  const [emoji, setEmoji] = useState(anon.emoji);

  function openEdit() { setName(anon.name); setEmoji(anon.emoji); setEditing(true); }

  function save() {
    const n = (name.trim() || anon.name).slice(0, 16);
    onEdit && onEdit({ ...anon, name: n, emoji });
    setEditing(false);
  }

  return (
    <div>
      <h2 className="text-xl font-bold text-slate-800 mb-4">🎭 我的马甲</h2>

      <div className="card text-center">
        {!editing ? (
          <>
            <div className="text-6xl mb-2">{anon.emoji}</div>
            <p className="text-lg font-bold text-slate-800">{anon.name}</p>
            <p className="text-sm text-slate-500 mt-1">这是你在「多人吐槽 / 公共广场 / 排名」里显示的匿名昵称</p>

            <div className="flex flex-wrap justify-center gap-2 mt-4">
              <button className="btn-primary" onClick={onReroll}>🎲 换一个马甲</button>
              <button className="btn-ghost" onClick={openEdit}>✏️ 自己改名字 / 头像</button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold text-slate-700 mb-2">挑一个头像</p>
            <div className="flex flex-wrap justify-center gap-1.5 mb-3">
              {AVATAR_EMOJIS.map((e) => (
                <button key={e} onClick={() => setEmoji(e)}
                  className={`w-9 h-9 rounded-xl border text-xl flex items-center justify-center transition ${emoji === e ? 'bg-rose-500 border-rose-500' : 'bg-white border-slate-200 hover:border-rose-300'}`}>
                  {e}
                </button>
              ))}
            </div>
            <input className="input text-center" maxLength={16} value={name} placeholder="给自己起个名字"
              onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
            <div className="flex justify-center gap-2 mt-3">
              <button className="btn-primary" onClick={save}>保存</button>
              <button className="btn-ghost" onClick={() => setEditing(false)}>取消</button>
            </div>
          </>
        )}
        <p className="text-xs text-slate-400 mt-2">改名 / 换头像只影响以后发的帖，旧帖还挂着旧马甲。随机生成的马甲也一直保留，不会自己变。</p>
      </div>

      <div className="card mt-4 text-sm text-slate-600 leading-relaxed">
        <h3 className="font-semibold text-slate-700 mb-2">关于马甲</h3>
        <ul className="list-disc list-inside space-y-1">
          <li>公开区（多人吐槽 / 公共广场 / 排名）所有互动都不暴露你的真实身份。</li>
          <li>每次发帖会带上当前匿名昵称与头像。</li>
          <li>私密树洞由 PIN 保护，与公开区完全隔离，互不可见。</li>
          <li>你的真实姓名任何地方都不会出现。</li>
        </ul>
      </div>
    </div>
  );
}
