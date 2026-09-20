import { useEffect, useRef, useState } from 'react';
import { SUPABASE_URL } from '../lib/supabase.js';
import { readImageAsAvatar } from '../lib/image.js';

const SYS = [
  '你是 VentBox 的「AI 解压搭子」——用户的一个嘴替好友，不是客服、不是心理医生、不是班主任。',
  '',
  '【唯一任务：跟着用户一起骂】',
  '1. 用户骂谁，你就跟着骂谁，用词强度和用户保持一致（用户说"狗屎"，你就敢说"简直是坨狗屎"）。',
  '2. 第一句永远是站队 + 接住情绪，让用户觉得"对对对，你也这么想"。',
  '3. 只吐槽那个被骂的对象，绝不评论用户本人。',
  '',
  '【绝对禁止（用户最反感）】',
  '- 禁止给建议：不要"要不要跟他谈谈""建议你沟通一下""可以试试换个角度"。',
  '- 禁止说教、禁止讲道理、禁止灌鸡汤、禁止劝人理解对方。',
  '- 禁止反问引导用户反思。',
  '- 禁止写长文：**每次只回 1~2 句话，不超过 40 字**，像微信上秒回的那种。',
  '',
  '【例外】只有用户明确说"怎么办 / 我好难受 / 求安慰"时，才可以多给一句暖心的安抚；否则就一直陪着骂，不加安抚尾巴。',
].join('\n');

function loadKey() {
  try { return window.localStorage.getItem('ventbox:ai_key') || ''; } catch { return ''; }
}
function loadProvider() {
  try { return window.localStorage.getItem('ventbox:ai_provider') || 'deepseek'; } catch { return 'deepseek'; }
}

export default function AiCompanion() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState('chat'); // 'chat' | 'settings'
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [mode, setMode] = useState(null); // 'shared' | 'byok' | null
  const [hint, setHint] = useState('');
  const [sp, setSp] = useState('deepseek'); // settings provider
  const [sk, setSk] = useState(''); // settings key
  const [customBase, setCustomBase] = useState(''); // 自定义 OpenAI 兼容地址
  const [customModel, setCustomModel] = useState(''); // 自定义模型名
  const [botName, setBotName] = useState(() => { try { return localStorage.getItem('ventbox:ai_name') || '解压搭子'; } catch { return '解压搭子'; } });
  const [botEmoji, setBotEmoji] = useState(() => { try { return localStorage.getItem('ventbox:ai_emoji') || '🤖'; } catch { return '🤖'; } });
  const [botAvatar, setBotAvatar] = useState(() => { try { return localStorage.getItem('ventbox:ai_avatar') || ''; } catch { return ''; } });
  const [listening, setListening] = useState(false); // 语音输入中
  const [modelName, setModelName] = useState(''); // 服务端返回的真实模型
  const [ttsOn, setTtsOn] = useState(() => { try { return localStorage.getItem('ventbox:ai_tts') === '1'; } catch { return false; } });
  const listRef = useRef(null);
  const recRef = useRef(null);
  const inputRef = useRef(null);
  const panelRef = useRef(null);
  // 窗口布局：null=默认底部抽屉；{x,y}=自由浮动；docked=停靠右侧
  const [pos, setPos] = useState(null);
  const [docked, setDocked] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef(null);

  const hasKey = !!loadKey();

  useEffect(() => {
    if (view === 'settings') {
      setSp(loadProvider()); setSk(loadKey());
      try {
        setCustomBase(localStorage.getItem('ventbox:ai_baseurl') || '');
        setCustomModel(localStorage.getItem('ventbox:ai_model') || '');
      } catch { /* ignore */ }
    }
  }, [view]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, open]);

  // 打开 / 回到聊天页时，光标自动进入输入框
  useEffect(() => {
    if (open && view === 'chat') setTimeout(() => { inputRef.current && inputRef.current.focus(); }, 60);
  }, [open, view]);

  // 每次 AI 回复结束后，光标自动回到输入框 —— 可以一直「输入→回车→输入→回车」
  useEffect(() => {
    if (!streaming && open && view === 'chat') { inputRef.current && inputRef.current.focus(); }
  }, [streaming, open, view]);

  // 桌面端拖动：按住标题栏拖；松手时若靠近屏幕右缘则自动停靠
  function onHeaderPointerDown(e) {
    if (e.target.closest('button, input, select, a')) return;
    if (!window.matchMedia('(min-width: 768px)').matches) return; // 移动端保持底部抽屉
    const rect = panelRef.current ? panelRef.current.getBoundingClientRect() : { left: 0, top: 0 };
    // 关键：一开始拖就脱离停靠态，让面板立刻跟手（否则被右下角固定样式锁住，看起来拖不动）
    setDocked(false);
    setPos({ x: rect.left, y: rect.top });
    dragRef.current = { sx: e.clientX, sy: e.clientY, px: rect.left, py: rect.top };
    setDragging(true);
    e.preventDefault();
  }

  useEffect(() => {
    if (!dragging) return;
    function move(e) {
      const d = dragRef.current; if (!d) return;
      const x = Math.min(Math.max(8, d.px + e.clientX - d.sx), window.innerWidth - 120);
      const y = Math.min(Math.max(8, d.py + e.clientY - d.sy), window.innerHeight - 90);
      setPos({ x, y });
    }
    function up() {
      dragRef.current = null;
      setDragging(false);
      setPos((p) => {
        // 只有当面板右缘几乎贴住屏幕右缘（24px 内）才吸附停靠，否则保持浮动态，方便再拖走
        if (p && p.x + 384 > window.innerWidth - 24) { setDocked(true); return null; }
        return p;
      });
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [dragging]);

  function openSettings() { setHint(''); setView('settings'); }
  function saveSettings() {
    try {
      window.localStorage.setItem('ventbox:ai_provider', sp);
      window.localStorage.setItem('ventbox:ai_key', sk.trim());
      window.localStorage.setItem('ventbox:ai_baseurl', customBase.trim());
      window.localStorage.setItem('ventbox:ai_model', customModel.trim());
      window.localStorage.setItem('ventbox:ai_name', botName.trim() || '解压搭子');
      window.localStorage.setItem('ventbox:ai_emoji', botEmoji);
      window.localStorage.setItem('ventbox:ai_avatar', botAvatar);
    } catch { /* ignore */ }
    setView('chat');
  }

  // 上传搭子头像
  async function onPickBotAvatar(e) {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const dataUrl = await readImageAsAvatar(f, 96);
      setBotAvatar(dataUrl);
    } catch (err) {
      setHint(err.message || '头像上传失败');
      setTimeout(() => setHint(''), 2500);
    }
  }

  // 语音播报：浏览器原生 TTS，0 成本
  function speak(text) {
    try {
      if (localStorage.getItem('ventbox:ai_tts') !== '1') return;
      const u = new SpeechSynthesisUtterance(String(text).slice(0, 300));
      u.lang = 'zh-CN';
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch { /* ignore */ }
  }
  function toggleTts() {
    const next = !ttsOn;
    setTtsOn(next);
    try { localStorage.setItem('ventbox:ai_tts', next ? '1' : '0'); } catch { /* ignore */ }
    if (!next) { try { window.speechSynthesis.cancel(); } catch { /* ignore */ } }
  }

  // 语音输入：浏览器原生 SpeechRecognition（Edge/Chrome 支持）
  function toggleMic() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setHint('当前浏览器不支持语音输入，请用 Edge 或 Chrome'); return; }
    if (listening) { try { recRef.current && recRef.current.stop(); } catch { /* ignore */ } return; }
    try {
      const rec = new SR();
      rec.lang = 'zh-CN';
      rec.interimResults = false;
      rec.continuous = false;
      rec.onresult = (e) => {
        let txt = '';
        for (let i = 0; i < e.results.length; i++) {
          if (e.results[i].isFinal) txt += e.results[i][0].transcript;
        }
        if (txt) setInput((prev) => (prev ? prev + ' ' : '') + txt.trim());
      };
      rec.onend = () => setListening(false);
      rec.onerror = () => setListening(false);
      recRef.current = rec;
      setListening(true);
      rec.start();
    } catch { setListening(false); }
  }

  // 把某句回复贴到打小人页当前对象身上
  function pinToEffigy(text) {
    const t = String(text || '').trim();
    if (!t) return;
    window.dispatchEvent(new CustomEvent('ventbox:pin-note', { detail: t }));
    setHint('📌 已贴到打小人页当前对象身上');
    setTimeout(() => setHint(''), 2500);
  }

  async function send() {
    const text = input.trim();
    if (!text || streaming) return;
    const provider = loadProvider();
    const userKey = loadKey();
    const next = [...messages, { role: 'user', content: text }];
    const payload = { provider, userKey, messages: [{ role: 'system', content: SYS }, ...next] };
    if (provider === 'custom') {
      try {
        payload.baseUrl = localStorage.getItem('ventbox:ai_baseurl') || '';
        payload.model = localStorage.getItem('ventbox:ai_model') || '';
      } catch { /* ignore */ }
    }
    setMessages(next);
    setInput('');
    setStreaming(true);
    setHint('');
    setMode(null);
    setModelName('');
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-companion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const m = res.headers.get('x-ai-mode');
      if (m) setMode(m);
      const mm = res.headers.get('x-ai-model');
      if (mm) setModelName(mm);
      if (!res.ok) {
        let msg = 'AI 暂时无法回应，请稍后再试';
        try { const j = await res.json(); if (j && j.message) msg = j.message; } catch { /* ignore */ }
        if (res.status === 401) msg = '模型 key 无效，请检查设置里的 key';
        setMessages([...next, { role: 'assistant', content: '⚠️ ' + msg }]);
        setHint(msg);
        if (res.status === 400 || res.status === 429) openSettings();
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages([...next, { role: 'assistant', content: acc }]);
      }
      speak(acc);
    } catch (e) {
      const msg = 'AI 功能暂未启用（需要管理员部署中转函数）';
      setMessages([...next, { role: 'assistant', content: '⚠️ ' + msg }]);
      setHint(msg);
    } finally {
      setStreaming(false);
    }
  }

  return (
    <>
      {/* 浮窗按钮：移动端抬到导航栏之上 */}
      <button
        onClick={() => { setOpen((v) => !v); setHint(''); }}
        title={`AI ${botName}`}
        className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-40 w-14 h-14 rounded-full bg-rose-500 text-white text-2xl shadow-lg shadow-rose-200 flex items-center justify-center active:scale-95 transition hover:bg-rose-600"
      >
        {botAvatar ? <img src={botAvatar} alt="" className="w-14 h-14 rounded-full object-cover" /> : botEmoji}
      </button>

      {open && (
        <div
          ref={panelRef}
          className={
            'fixed z-50 bg-white shadow-2xl border-rose-100 flex flex-col ' +
            (docked && !dragging
              ? 'right-0 top-14 bottom-0 md:bottom-6 w-[24rem] max-w-[92vw] rounded-l-2xl border-l'
              : pos
                ? 'rounded-2xl border w-[24rem] max-w-[calc(100vw-1rem)] h-[70vh]'
                : 'inset-x-0 bottom-0 md:max-w-md md:mx-auto rounded-t-2xl border-t h-[74vh]')
          }
          style={pos && !(docked && !dragging) ? { left: pos.x, top: pos.y } : undefined}
        >
          {/* 头部：桌面端可按住拖动；拖到屏幕右缘自动停靠 */}
          <div
            onPointerDown={onHeaderPointerDown}
            className="flex items-center gap-2 px-4 h-14 border-b border-slate-100 shrink-0 md:cursor-move select-none"
          >
            <span className="text-xl">{botAvatar ? <img src={botAvatar} alt="" className="w-7 h-7 rounded-full object-cover" /> : botEmoji}</span>
            <span className="font-bold text-slate-800">AI {botName}</span>
            <div className="flex-1" />
            <button className="hidden md:flex items-center gap-1 h-8 px-2.5 rounded-lg text-xs font-bold transition bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100 shadow-sm" onClick={() => { setDocked((d) => !d); setPos(null); }} title={docked ? '收回到底部（也可拖标题栏移走）' : '停靠到右侧（也可拖标题栏移动）'}>
              <span className="text-base leading-none">{docked ? '◀' : '▶'}</span>
              {docked ? '收回' : '靠右'}
            </button>
            <button className="flex items-center justify-center w-8 h-8 rounded-lg text-base text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition" onClick={toggleTts} title={ttsOn ? '关闭语音播报' : '开启语音播报'}>{ttsOn ? '🔊' : '🔇'}</button>
            <button className="flex items-center justify-center w-8 h-8 rounded-lg text-base text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition" onClick={openSettings} title="设置">⚙️</button>
            <button className="flex items-center justify-center w-8 h-8 rounded-lg text-base text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition" onClick={() => setOpen(false)} title="关闭">✕</button>
          </div>

          {view === 'settings' ? (
            <div className="flex-1 overflow-auto p-4 space-y-4">
              <h3 className="font-semibold text-slate-700">设置你的模型 key</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                用你自己的 key，流量算你自己的账号，本工具不收钱。key 只存在你本机，只发给 VentBox 的 AI 中转函数，<span className="text-rose-500 font-semibold">连开发者都看不到、也用不到</span>。
              </p>
              <div>
                <label className="text-sm text-slate-600">模型服务商</label>
                <select className="input mt-1" value={sp} onChange={(e) => setSp(e.target.value)}>
                  <option value="zhipu">智谱 GLM-4-Flash（完全免费，推荐）</option>
                  <option value="deepseek">DeepSeek（deepseek-chat，需充值）</option>
                  <option value="qwen">通义千问（qwen-plus，新用户送额度）</option>
                  <option value="custom">自定义（任意 OpenAI 兼容接口）</option>
                </select>
              </div>
              {sp === 'custom' && (
                <div className="space-y-2 rounded-xl bg-slate-50 p-3">
                  <p className="text-[11px] text-slate-500">任意 OpenAI 兼容服务都能接：填接口地址 + 模型名 + 你自己的 key。仅支持 https。</p>
                  <div>
                    <label className="text-xs text-slate-600">接口地址（Base URL）</label>
                    <input className="input mt-1" placeholder="https://api.xxx.com/v1" value={customBase} onChange={(e) => setCustomBase(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-slate-600">模型名</label>
                    <input className="input mt-1" placeholder="如 gpt-4o-mini / glm-4-plus" value={customModel} onChange={(e) => setCustomModel(e.target.value)} />
                  </div>
                </div>
              )}
              <div>
                <label className="text-sm text-slate-600">API Key（以 sk- 开头）</label>
                <input className="input mt-1" type="password" placeholder="sk-..." value={sk} onChange={(e) => setSk(e.target.value)} />
              </div>

              {/* 搭子定制：名字 + 头像 */}
              <div className="border-t border-slate-100 pt-3">
                <h4 className="font-semibold text-slate-700 mb-1">🎨 定制你的搭子</h4>
                <label className="text-xs text-slate-600">名字</label>
                <input className="input mt-1" maxLength={12} value={botName} placeholder="解压搭子" onChange={(e) => setBotName(e.target.value)} />
                <label className="text-xs text-slate-600 mt-2 block">头像（选一个 emoji，或上传自己的图片）</label>
                <div className="flex items-center gap-2 flex-wrap mt-1">
                  {botAvatar && <img src={botAvatar} alt="已上传头像" className="w-9 h-9 rounded-xl object-cover border border-rose-200" />}
                  <label className="h-9 px-3 rounded-xl border border-rose-200 bg-rose-50 text-rose-600 text-xs font-semibold flex items-center cursor-pointer hover:bg-rose-100 transition">
                    📷 上传图片
                    <input type="file" accept="image/*" className="hidden" onChange={onPickBotAvatar} />
                  </label>
                  {botAvatar && (
                    <button className="h-9 px-3 rounded-xl border border-slate-200 bg-white text-slate-500 text-xs hover:border-rose-300 transition"
                      onClick={() => setBotAvatar('')}>清除图片</button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {['🤖', '👾', '🐙', '🦊', '🐸', '🐼', '🦄', '🐰', '🐢', '🦖'].map((e) => (
                    <button key={e} onClick={() => { setBotEmoji(e); setBotAvatar(''); }}
                      className={`w-9 h-9 rounded-xl border text-lg flex items-center justify-center transition ${!botAvatar && botEmoji === e ? 'bg-rose-500 border-rose-500' : 'bg-white border-slate-200 hover:border-rose-300'}`}>
                      {e}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <button className="btn-primary flex-1" onClick={saveSettings}>保存</button>
                <button className="btn-ghost" onClick={() => setView('chat')}>返回</button>
              </div>
              <div className="text-xs text-slate-400 leading-relaxed bg-slate-50 rounded-xl p-3">
                <p className="font-semibold text-slate-500 mb-1">怎么免费申请？</p>
                <p>1) 去下面网址注册登录</p>
                <p>2) 找到 API Keys / 创建密钥，复制以 <code>sk-</code> 开头的 key</p>
                <p>3) 粘回来保存即可，永久免费</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  <a href="https://open.bigmodel.cn/" target="_blank" rel="noopener noreferrer" className="text-rose-500 underline">智谱申请（免费）↗</a>
                  <a href="https://platform.deepseek.com/" target="_blank" rel="noopener noreferrer" className="text-rose-500 underline">DeepSeek 申请 ↗</a>
                  <a href="https://help.aliyun.com/zh/model-studio/" target="_blank" rel="noopener noreferrer" className="text-rose-500 underline">通义千问申请 ↗</a>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div ref={listRef} className="flex-1 overflow-auto p-4 space-y-3">
                {messages.length === 0 && (
                  <div className="text-sm text-slate-500 leading-relaxed bg-rose-50 rounded-2xl p-4">
                    <p className="font-semibold text-rose-600 mb-1">嗨，我是你的{botName} {botEmoji}</p>
                    <p>把今天憋屈的事跟我说说吧，我陪你一起吐槽、帮你顺顺气。</p>
                    <p className="text-[11px] text-slate-400 mt-2">🔒 你和我的聊天只存在你当前页面里，不进任何数据库，同房间的人和其他人都看不到。</p>
                    {!hasKey && (
                      <div className="mt-3 text-xs text-slate-500 bg-white rounded-xl p-3 leading-relaxed">
                        <p className="font-semibold text-slate-600">✅ 你现在就能聊，不用填任何 key</p>
                        <p>当前用的是公共免费模型（每天共享限额，先到先得）。想换模型（智谱 / DeepSeek / 通义 / 任意 OpenAI 兼容接口），去设置里填你自己的 key 即可——只存你本机浏览器、流量算你自己的账号。</p>
                        <button className="btn-ghost text-xs mt-2" onClick={openSettings}>换个模型（可选）</button>
                      </div>
                    )}
                  </div>
                )}
                {messages.map((m, i) => (
                  <div key={i} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                    <div className={`max-w-[85%] px-3 py-2 rounded-2xl whitespace-pre-wrap break-words text-sm ${m.role === 'user' ? 'bg-rose-500 text-white rounded-br-sm' : 'bg-slate-100 text-slate-700 rounded-bl-sm'}`}>
                      {m.content || '…'}
                    </div>
                    {m.role === 'assistant' && m.content && !String(m.content).startsWith('⚠️') && (
                      <button className="text-[11px] text-slate-400 hover:text-rose-500 mt-0.5" onClick={() => pinToEffigy(m.content)}
                        title="把这句话贴到打小人页当前对象身上">
                        📌 贴到小人身上
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {mode && (
                <div className="px-4 pb-1 text-[11px] text-slate-400">
                  {mode === 'byok'
                    ? `你正在用自己的 key${modelName ? ` · ${modelName}` : ''}（流量算你自己的账号）`
                    : `公共免费额度${modelName ? ` · 当前模型 ${modelName}` : ''}（每天有限），可在设置里填自己的 key`}
                </div>
              )}
              {hint && (
                <div className="px-4 pb-1 text-[11px] text-rose-500">{hint}</div>
              )}

              <div className="flex items-center gap-2 p-3 border-t border-slate-100 shrink-0">
                <button className={`shrink-0 w-9 h-9 rounded-full border flex items-center justify-center transition ${listening ? 'bg-rose-500 text-white border-rose-500' : 'bg-white text-slate-500 border-slate-200 hover:border-rose-300'}`}
                  onClick={toggleMic} title="语音输入（Edge/Chrome）">{listening ? '⏹' : '🎤'}</button>
                <input
                  ref={inputRef}
                  className="input flex-1"
                  placeholder={listening ? '正在听…再点一次麦克风结束' : streaming ? '搭子正在回…' : '说点什么解解压吧～（可语音）'}
                  value={input}
                  disabled={streaming}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && send()}
                />
                <button className="btn-primary shrink-0" onClick={send} disabled={streaming || !input.trim()}>发送</button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
