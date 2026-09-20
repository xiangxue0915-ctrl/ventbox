import { useEffect, useRef, useState } from 'react';
import { SUPABASE_URL } from '../lib/supabase.js';

const SYS = '你是 VentBox 的「解压陪聊搭子」。用户正在职场里吐槽、解压。请共情倾听、陪他们一起吐槽、帮他们缓解情绪；不要说教、不要评判、不要过度鸡汤；必要时温和地引导他们照顾好自己。用轻松口语化的中文，适当用 emoji。';

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
  const listRef = useRef(null);

  const hasKey = !!loadKey();

  useEffect(() => {
    if (view === 'settings') { setSp(loadProvider()); setSk(loadKey()); }
  }, [view]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, open]);

  function openSettings() { setHint(''); setView('settings'); }
  function saveSettings() {
    try {
      window.localStorage.setItem('ventbox:ai_provider', sp);
      window.localStorage.setItem('ventbox:ai_key', sk.trim());
    } catch { /* ignore */ }
    setView('chat');
  }

  async function send() {
    const text = input.trim();
    if (!text || streaming) return;
    const provider = loadProvider();
    const userKey = loadKey();
    const next = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setStreaming(true);
    setHint('');
    setMode(null);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-companion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, userKey, messages: [{ role: 'system', content: SYS }, ...next] }),
      });
      const m = res.headers.get('x-ai-mode');
      if (m) setMode(m);
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
        title="AI 解压搭子"
        className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-40 w-14 h-14 rounded-full bg-rose-500 text-white text-2xl shadow-lg shadow-rose-200 flex items-center justify-center active:scale-95 transition hover:bg-rose-600"
      >
        🤖
      </button>

      {open && (
        <div className="fixed inset-x-0 bottom-0 z-50 md:max-w-md md:mx-auto bg-white rounded-t-2xl shadow-2xl border-t border-rose-100 flex flex-col h-[74vh]">
          {/* 头部 */}
          <div className="flex items-center gap-2 px-4 h-14 border-b border-slate-100 shrink-0">
            <span className="text-xl">🤖</span>
            <span className="font-bold text-slate-800">AI 解压搭子</span>
            <div className="flex-1" />
            <button className="text-slate-400 hover:text-rose-500 text-sm" onClick={openSettings} title="设置">⚙️</button>
            <button className="text-slate-400 hover:text-slate-600 text-sm ml-1" onClick={() => setOpen(false)} title="关闭">✕</button>
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
                  <option value="deepseek">DeepSeek（deepseek-chat，免费额度）</option>
                  <option value="qwen">通义千问（qwen-plus，免费额度）</option>
                </select>
              </div>
              <div>
                <label className="text-sm text-slate-600">API Key（以 sk- 开头）</label>
                <input className="input mt-1" type="password" placeholder="sk-..." value={sk} onChange={(e) => setSk(e.target.value)} />
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
                    <p className="font-semibold text-rose-600 mb-1">嗨，我是你的解压搭子 🤗</p>
                    <p>把今天憋屈的事跟我说说吧，我陪你一起吐槽、帮你顺顺气。</p>
                    {!hasKey && (
                      <div className="mt-3 text-xs text-slate-500 bg-white rounded-xl p-3 leading-relaxed">
                        <p className="font-semibold text-slate-600">💡 想用 AI，先填你自己的模型 key</p>
                        <p>免费申请、流量算你自己的账号、本工具不收钱。也可以先试试下方的「共享免费池」（有限额）。</p>
                        <button className="btn-ghost text-xs mt-2" onClick={openSettings}>去设置填 key</button>
                      </div>
                    )}
                  </div>
                )}
                {messages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] px-3 py-2 rounded-2xl whitespace-pre-wrap break-words text-sm ${m.role === 'user' ? 'bg-rose-500 text-white rounded-br-sm' : 'bg-slate-100 text-slate-700 rounded-bl-sm'}`}>
                      {m.content || '…'}
                    </div>
                  </div>
                ))}
              </div>

              {mode && (
                <div className="px-4 pb-1 text-[11px] text-slate-400">
                  {mode === 'byok' ? '你正在用自己的 key（流量算你自己的账号）' : '你正在使用共享免费额度（有限），建议去设置填你自己的免费 key 永久免费'}
                </div>
              )}
              {hint && (
                <div className="px-4 pb-1 text-[11px] text-rose-500">{hint}</div>
              )}

              <div className="flex items-center gap-2 p-3 border-t border-slate-100 shrink-0">
                <input
                  className="input flex-1"
                  placeholder={streaming ? '搭子正在回…' : '说点什么解解压吧～'}
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
