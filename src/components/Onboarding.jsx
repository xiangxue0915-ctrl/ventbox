import { useEffect, useState } from 'react';

const FLAG = 'ventbox:onboarded';

// 新人首次访问的 3 步引导：是什么 / 怎么用 / 小建议。只看一次（localStorage 标记）。
const STEPS = [
  {
    icon: '📦',
    title: '这是什么',
    body:
      '吐槽解压箱 VentBox 是一个纯前端、全程匿名的解压小工具，专门给同事之间互相吐槽、出气用。\n你写的东西不会暴露真实身份，放心倒。',
  },
  {
    icon: '🧭',
    title: '怎么用',
    body:
      '左侧 / 底部 5 个标签页随便逛：\n👊 打小人：点哪打哪，给对象贴个名字出气\n🌳 私密树洞：本机 PIN 加密，只你自己能看\n💬 多人吐槽：和同房间的人匿名互吐\n🏆 排名 / 🎭 我的马甲\n右下角 🤖 是 AI 解压搭子，陪你一起骂。',
  },
  {
    icon: '💡',
    title: '小建议',
    body:
      '· 房间码 = 访问钥匙，把同一房间码发给同事就能一起吐槽\n· 私密树洞只存你本机，忘了 PIN 不可找回\n· 全程匿名，但别写会伤害真人的实名信息\n点「开始解压」就把烦心事交出来吧 🎉',
  },
];

export default function Onboarding() {
  const [show, setShow] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    try {
      if (!localStorage.getItem(FLAG)) setShow(true);
    } catch {
      /* 极端情况下（隐私模式禁用存储）也先不弹，避免卡住 */
    }
  }, []);

  function finish() {
    try {
      localStorage.setItem(FLAG, '1');
    } catch {
      /* ignore */
    }
    setShow(false);
  }

  if (!show) return null;
  const s = STEPS[step];
  const last = step === STEPS.length - 1;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="新人引导"
    >
      <div className="card w-full max-w-md mx-auto bg-white rounded-2xl p-6 shadow-2xl">
        <div className="text-4xl mb-3" aria-hidden="true">{s.icon}</div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">{s.title}</h2>
        <p className="text-sm text-slate-600 whitespace-pre-line leading-relaxed mb-5">{s.body}</p>

        {/* 步骤指示点 */}
        <div className="flex items-center gap-1.5 mb-5" aria-hidden="true">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${i === step ? 'w-6 bg-rose-500' : 'w-1.5 bg-slate-200'}`}
            />
          ))}
        </div>

        <div className="flex items-center justify-between">
          <button onClick={finish} className="text-xs text-slate-400 hover:text-slate-600">
            跳过
          </button>
          <div className="flex gap-2">
            {step > 0 && (
              <button onClick={() => setStep(step - 1)} className="btn-ghost text-sm px-3 py-1.5">
                上一步
              </button>
            )}
            <button
              onClick={last ? finish : () => setStep(step + 1)}
              className="btn-primary text-sm px-4 py-1.5"
            >
              {last ? '开始解压' : '下一步'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
