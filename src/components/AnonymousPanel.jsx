// 匿名模块：解释全局匿名机制（马甲），并支持一键切换

export default function AnonymousPanel({ anon, onReroll }) {
  return (
    <div>
      <h2 className="text-xl font-bold text-slate-800 mb-4">🎭 我的马甲</h2>

      <div className="card text-center">
        <div className="text-6xl mb-2">{anon.emoji}</div>
        <p className="text-lg font-bold text-slate-800">{anon.name}</p>
        <p className="text-sm text-slate-500 mt-1">这是你在「多人吐槽 / 公共广场 / 排名」里显示的匿名昵称</p>

        <button className="btn-primary mt-4 mx-auto" onClick={onReroll}>
          🎲 换一个马甲
        </button>
        <p className="text-xs text-slate-400 mt-2">点「换一个马甲」只影响以后发的帖，旧帖还挂着旧马甲。</p>
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
