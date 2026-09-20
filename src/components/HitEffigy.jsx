import { useEffect, useRef, useState } from 'react';
import { get, set } from '../lib/storage.js';
import { supabase } from '../lib/supabase.js';
import { getRoomKey, encryptText, decryptText } from '../lib/crypto.js';

const HITS_KEY = 'effigy.hits'; // 离线回退：{ 对象: 总次数 }
const DETAIL_KEY = 'effigy.detail'; // 离线回退：{ 对象: { parts, pp } }
const NOTE_KEY = 'effigy.note'; // 骂Ta纸条：按 房间+对象 隔离，仅存本机

const VIEW = { w: 160, h: 220 };
const CARD = { w: 320, scale: 2, ox: (320 - 160 * 2) / 2, oy: 78 };

// 道具（顺序即道具栏显示顺序；战果图统计沿用同一顺序，保证上下一致）
// 说明：统一走「卡通解压」路线，不使用血腥/酷刑类元素
const PROPS = [
  { id: 'hammer', name: '榔头', icon: '🔨', dmg: 2 },
  { id: 'needle', name: '针', icon: '📍', dmg: 1 },
  { id: 'knife', name: '刀', icon: '🔪', dmg: 2 },
  { id: 'gun', name: '枪', icon: '🔫', dmg: 3 },
  { id: 'slipper', name: '拖鞋', icon: '👡', dmg: 1 },
  { id: 'pan', name: '平底锅', icon: '🍳', dmg: 2 },
  { id: 'chain', name: '铁链', icon: '⛓️', dmg: 2 },
  { id: 'banana', name: '香蕉皮', icon: '🍌', dmg: 1 },
  { id: 'chicken', name: '橡胶鸡', icon: '🐔', dmg: 2 },
  { id: 'ice', name: '冰块', icon: '🧊', dmg: 1 },
  { id: 'feather', name: '羽毛', icon: '🪶', dmg: 1 },
  { id: 'balloon', name: '气球锤', icon: '🎈', dmg: 1 },
];

// 部位：拆得更细，让台词与伤痕都贴合「实际打中的位置」，更有成就感
const PARTS = {
  backhead: { name: '后脑勺', anchors: [[80, 28], [73, 30], [87, 30]] },
  face: { name: '脸', anchors: [[71, 47], [89, 47], [80, 53], [71, 53], [89, 53]] },
  nose: { name: '鼻梁', anchors: [[80, 50]] },
  ear: { name: '耳朵', anchors: [[62, 46], [98, 46]] },
  neck: { name: '脖子', anchors: [[80, 70], [74, 67], [86, 67], [68, 70], [92, 70]] },
  chest: { name: '胸口', anchors: [[70, 86], [90, 86], [80, 96]] },
  belly: { name: '肚子', anchors: [[70, 112], [90, 112], [80, 126], [67, 134], [93, 134]] },
  butt: { name: '屁股', anchors: [[58, 158], [102, 158], [58, 170], [102, 170], [80, 164]] },
  thigh: { name: '大腿', anchors: [[64, 176], [96, 176], [58, 184], [102, 184]] },
  knee: { name: '膝盖', anchors: [[63, 166], [97, 166], [63, 175], [97, 175], [80, 182], [68, 186], [92, 186]] },
  shin: { name: '小腿', anchors: [[66, 196], [94, 196], [70, 200], [90, 200]] },
  foot: { name: '脚', anchors: [[58, 200], [102, 200], [58, 208], [102, 208], [80, 205]] },
  arm: { name: '胳膊', anchors: [[40, 104], [120, 104], [30, 112], [130, 112], [46, 100], [114, 100]] },
};
const PART_IDS = Object.keys(PARTS);
const PART_ANCHORS = Object.fromEntries(Object.entries(PARTS).map(([k, v]) => [k, v.anchors]));

// 兜底：点击落点没有精确热区时，找最近的部位（保证小人范围内点哪都有反应）
function nearestPart(x, y) {
  let best = null, bd = Infinity;
  for (const pid of PART_IDS) {
    for (const [ax, ay] of PART_ANCHORS[pid]) {
      const d = (ax - x) * (ax - x) + (ay - y) * (ay - y);
      if (d < bd) { bd = d; best = pid; }
    }
  }
  return best || PART_IDS[Math.floor(Math.random() * PART_IDS.length)];
}

const RELIEF_LINES = [
  '啪！这一下，解气。', '感受到 Ta 的颤抖了吗？', '出气 +1，心情舒畅。',
  '打得好！继续！', '把它打服为止。', '深呼吸，你已经爽到了。',
];
const CRY_WORDS = ['啊！', '哦…', '呜呜', '疼！', '饶命！', '我错了！'];

// 飘字台词：第一人称（小人自己疼），绑「实际部位」+「实际道具」。随机组合不重复
// 工具动作（每个道具 2~3 种说法）
const PROP_ACTION = {
  hammer: ['榔头狠狠砸下', '大锤抡圆了落下', '铁锤当头棒喝'],
  needle: ['针猛地扎了进来', '银针精准刺入', '针尖顶了上来'],
  knife: ['刀锋划了过去', '尖刀蹭了一下', '刀背拍在身上'],
  gun: ['一枪正中要害', '子弹呼啸而来', '砰地挨了一下'],
  slipper: ['拖鞋迎面糊上', '拖鞋啪地拍脸', '鞋底横扫过来'],
  pan: ['平底锅横拍过来', '铁锅当头罩下', '锅底狠狠一磕'],
  chain: ['铁链甩了过来', '锁链缠了上来', '铁链抽在身上'],
  banana: ['香蕉皮精准滑铲', '香蕉皮啪地贴脸', '黄皮一个趔趄'],
  chicken: ['橡胶鸡猛地啄来', '玩具鸡疯狂乱啄', '鸡嘴顶了过来'],
  ice: ['冰块贴了上来', '寒冰啪地撞上', '冷块糊在身上'],
  feather: ['羽毛轻轻拂过（奇痒）', '羽毛扫了一下（钻心的痒）', '毛尖撩了一下'],
  balloon: ['气球锤弹了过来', '充气锤咚地砸下', '气球棒槌一顶'],
};
// 部位痛感（每个部位 3 种第一人称吐槽，对应伤痕实际显示的位置）
const PART_PAIN = {
  backhead: ['我的后脑勺在替我喊疼', '后脑勺一震，记忆开始断片', '我的后脑勺开了朵小花'],
  face: ['我的脸瞬间肿成发面馒头', '脸上当场印出个五指山', '我的脸成了抽象派画作'],
  nose: ['鼻梁发出清脆的咔嚓', '我的鼻子在抗议', '鼻血还没流先喊了冤'],
  ear: ['耳朵里全是蜜蜂开会', '我的耳朵替我红了', '一耳朵下去世界静音三秒'],
  neck: ['我的脖子咔地拧了一下', '脖子当场缩成了乌龟', '领口都在替我喊疼'],
  chest: ['胸口像被敲了鼓', '我的胸膛在打拍子', '心脏隔着肋骨喊救命'],
  belly: ['我的肚子被扎得漏水了', '肚子当场表演喷泉', '一击正中，肚子咕咕求救'],
  butt: ['屁股替我记住了这一下', '我的屁股学会了发抖', '臀部在连夜写检讨书'],
  thigh: ['大腿一根筋在跳迪斯科', '我的腿软成了面条', '大腿当场申请工伤'],
  knee: ['膝盖在和地面打招呼', '我的膝盖想提前退休', '髌骨发出了投降信号'],
  shin: ['小腿酸爽直冲天灵盖', '我的小腿在打哆嗦', '胫骨表示这锅它不背'],
  foot: ['我的脚原地起飞三厘米', '脚趾头集体抗议', '脚底板在练咏春'],
  arm: ['胳膊自己举起了白旗', '我的手臂在打颤', '肱二头肌当场辞职'],
};
function pickFlavor(prop, part) {
  const acts = PROP_ACTION[prop] || ['一下打中'];
  const pains = PART_PAIN[part] || ['我疼得直跳'];
  const a = acts[Math.floor(Math.random() * acts.length)];
  const p = pains[Math.floor(Math.random() * pains.length)];
  return `哎哟！${a}，${p}`;
}

let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  return audioCtx;
}
function playSmack(dmg) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume();
  const now = ctx.currentTime;
  const len = Math.floor(ctx.sampleRate * 0.16);
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.4 * dmg * 0.5 + 0.1, now);
  ng.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
  noise.connect(ng).connect(ctx.destination);
  noise.start(now); noise.stop(now + 0.16);
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(200, now);
  osc.frequency.exponentialRampToValueAtTime(50, now + 0.12);
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.5, now);
  og.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
  osc.connect(og).connect(ctx.destination);
  osc.start(now); osc.stop(now + 0.12);
}
function playVoice(type) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume();
  const now = ctx.currentTime;
  const cfg = { 啊: [320, 220, 'sawtooth'], 哦: [240, 180, 'triangle'], 呜: [180, 120, 'sine'] }[type] || [260, 200, 'sawtooth'];
  const osc = ctx.createOscillator();
  osc.type = cfg[2];
  osc.frequency.setValueAtTime(cfg[0], now);
  osc.frequency.exponentialRampToValueAtTime(cfg[1], now + 0.25);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(0.25, now + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
  osc.connect(g).connect(ctx.destination);
  osc.start(now); osc.stop(now + 0.3);
}

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function aggregate(rows) {
  const map = {};
  for (const r of rows) {
    const t = map[r.target] || (map[r.target] = { total: 0, parts: {}, pp: {} });
    t.total += 1;
    t.parts[r.part] = (t.parts[r.part] || 0) + 1;
    const key = r.part + '__' + r.prop;
    t.pp[key] = (t.pp[key] || 0) + 1;
  }
  return map;
}

const BODY = { body: { x: 50, y: 70, w: 60, h: 110, r: 14 }, head: { cx: 80, cy: 45, r: 28 } };
// 四肢线段（可动）：上臂/前臂/大腿/小腿
const LIMBS = {
  armL: { a: [52, 92], b: [26, 116] },
  armR: { a: [108, 92], b: [134, 116] },
  legL: { a: [68, 178], b: [58, 208] },
  legR: { a: [92, 178], b: [102, 208] },
};

function buildMarks(target, total, detail) {
  const out = { bruises: [], marks: [], bandage: false, blood: [], bodyFill: '#fdf6e3' };
  out.bodyFill = total >= 15 ? '#fbcfe8' : total >= 8 ? '#fde7ec' : '#fdf6e3';
  const rnd = mulberry32(hashStr(target + '|b'));
  const n = Math.min(total, 16);
  for (let i = 0; i < n; i++) out.bruises.push({ x: 52 + rnd() * 56, y: 78 + rnd() * 100, r: 3 + rnd() * 4 });
  Object.entries((detail && detail.pp) || {}).forEach(([key, count]) => {
    const [part, prop] = key.split('__');
    const anchors = PART_ANCHORS[part] || [[80, 80]];
    // 用确定性抖动：同一部位超过锚点数时偏移错开，避免痕迹完全重叠「看起来没反应」
    const jr = mulberry32(hashStr(target + '|' + key));
    const c = Math.min(count, anchors.length + 6);
    for (let i = 0; i < c; i++) {
      const base = anchors[i % anchors.length];
      const jx = i < anchors.length ? 0 : (jr() - 0.5) * 8;
      const jy = i < anchors.length ? 0 : (jr() - 0.5) * 8;
      out.marks.push({ x: base[0] + jx, y: base[1] + jy, prop });
    }
  });
  const rb = mulberry32(hashStr(target + '|blood'));
  const bn = Math.min(Math.floor(total / 3), 8);
  for (let i = 0; i < bn; i++) out.blood.push({ x: 84 + rb() * 18, y: 62 + rb() * 46, r: 1 + rb() * 2.4, dy: 5 + rb() * 16 });
  out.bandage = total >= 10;
  return out;
}

function drawMark(ctx, x, y, prop, s = 1) {
  ctx.save();
  switch (prop) {
    case 'hammer': ctx.fillStyle = 'rgba(225,29,72,0.75)'; ctx.beginPath(); ctx.arc(x, y, 5 * s, 0, Math.PI * 2); ctx.fill(); break;
    case 'needle': ctx.fillStyle = '#7f1d1d'; ctx.beginPath(); ctx.arc(x, y, 1.6 * s, 0, Math.PI * 2); ctx.fill(); break;
    case 'knife': ctx.strokeStyle = '#b91c1c'; ctx.lineWidth = 2 * s; ctx.beginPath(); ctx.moveTo(x - 5 * s, y - 4 * s); ctx.lineTo(x + 5 * s, y + 4 * s); ctx.stroke(); break;
    case 'gun':
      ctx.fillStyle = '#1f2937'; ctx.beginPath(); ctx.arc(x, y, 4 * s, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 1.5 * s; ctx.beginPath(); ctx.arc(x, y, 6.5 * s, 0, Math.PI * 2); ctx.stroke(); break;
    case 'slipper': ctx.fillStyle = 'rgba(202,138,4,0.7)'; ctx.beginPath(); ctx.ellipse(x, y, 6 * s, 4 * s, 0, 0, Math.PI * 2); ctx.fill(); break;
    case 'pan': ctx.fillStyle = 'rgba(107,114,128,0.7)'; ctx.beginPath(); ctx.arc(x, y, 6 * s, 0, Math.PI * 2); ctx.fill(); break;
    case 'chain': ctx.strokeStyle = '#475569'; ctx.lineWidth = 1.8 * s;
      for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.arc(x + i * 3.5 * s, y + i * 2 * s, 2.4 * s, 0, Math.PI * 2); ctx.stroke(); } break;
    case 'banana': ctx.fillStyle = 'rgba(234,179,8,0.85)'; ctx.beginPath(); ctx.ellipse(x, y, 5.5 * s, 3 * s, 0.6, 0, Math.PI * 2); ctx.fill(); break;
    case 'chicken': ctx.fillStyle = '#dc2626'; ctx.beginPath(); ctx.arc(x, y, 4.5 * s, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#991b1b'; ctx.lineWidth = 1.2 * s; ctx.beginPath(); ctx.moveTo(x - 5 * s, y); ctx.lineTo(x + 5 * s, y); ctx.stroke(); break;
    case 'ice': ctx.fillStyle = 'rgba(96,165,250,0.55)'; ctx.beginPath(); ctx.arc(x, y, 5 * s, 0, Math.PI * 2); ctx.fill(); break;
    case 'feather': ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1.4 * s;
      ctx.beginPath(); ctx.moveTo(x - 4 * s, y + 3 * s); ctx.quadraticCurveTo(x, y - 4 * s, x + 4 * s, y - 2 * s); ctx.stroke(); break;
    case 'balloon': ctx.fillStyle = 'rgba(244,114,182,0.7)'; ctx.beginPath(); ctx.arc(x, y, 5 * s, 0, Math.PI * 2); ctx.fill(); break;
    default: break;
  }
  ctx.restore();
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}

// 纸条文案折行：每行 8 字，最多 3 行，超长截断
function noteLines(s) {
  const out = [];
  const t = String(s || '').trim();
  for (let i = 0; i < t.length && out.length < 3; i += 8) {
    let part = t.slice(i, i + 8);
    if (out.length === 2 && t.length > 24) part = part.slice(0, 7) + '…';
    out.push(part);
  }
  return out;
}

// 道具痕迹在 SVG 上的形状（主舞台与通缉墙缩略图共用，保证上下一致）
function markShape(m, i) {
  switch (m.prop) {
    case 'hammer': return <circle key={i} cx={m.x} cy={m.y} r={5} fill="#e11d48" opacity="0.75" />;
    case 'needle': return <circle key={i} cx={m.x} cy={m.y} r={1.6} fill="#7f1d1d" />;
    case 'knife': return <line key={i} x1={m.x - 5} y1={m.y - 4} x2={m.x + 5} y2={m.y + 4} stroke="#b91c1c" strokeWidth="2" />;
    case 'gun': return (<g key={i}><circle cx={m.x} cy={m.y} r={4} fill="#1f2937" /><circle cx={m.x} cy={m.y} r={6.5} fill="none" stroke="#ef4444" strokeWidth="1.5" /></g>);
    case 'slipper': return <ellipse key={i} cx={m.x} cy={m.y} rx={6} ry={4} fill="#ca8a04" opacity="0.7" />;
    case 'pan': return <circle key={i} cx={m.x} cy={m.y} r={6} fill="#6b7280" opacity="0.7" />;
    case 'chain': return (<g key={i} stroke="#475569" strokeWidth="1.8" fill="none">
      <circle cx={m.x - 3.5} cy={m.y - 2} r="2.4" /><circle cx={m.x} cy={m.y} r="2.4" /><circle cx={m.x + 3.5} cy={m.y + 2} r="2.4" /></g>);
    case 'banana': return <ellipse key={i} cx={m.x} cy={m.y} rx={5.5} ry={3} fill="#eab308" opacity="0.85" transform={`rotate(34 ${m.x} ${m.y})`} />;
    case 'chicken': return (<g key={i}><circle cx={m.x} cy={m.y} r={4.5} fill="#dc2626" /><line x1={m.x - 5} y1={m.y} x2={m.x + 5} y2={m.y} stroke="#991b1b" strokeWidth="1.2" /></g>);
    case 'ice': return <circle key={i} cx={m.x} cy={m.y} r={5} fill="#60a5fa" opacity="0.55" />;
    case 'feather': return <path key={i} d={`M${m.x - 4} ${m.y + 3} Q${m.x} ${m.y - 4} ${m.x + 4} ${m.y - 2}`} stroke="#94a3b8" strokeWidth="1.4" fill="none" />;
    case 'balloon': return <circle key={i} cx={m.x} cy={m.y} r={5} fill="#f472b6" opacity="0.7" />;
    default: return null;
  }
}

// 通缉墙：本房间每个对象一张「通缉照」缩略图，点击切换上台
function MiniEffigy({ target, total, marks, active, onClick }) {
  return (
    <button onClick={onClick}
      className={`relative flex flex-col items-center rounded-xl border p-1.5 transition ${active ? 'border-rose-400 bg-rose-50 ring-2 ring-rose-200' : 'border-slate-200 bg-white hover:border-rose-300'}`}>
      <svg viewBox="0 0 160 220" width="66" height="90" className="select-none">
        <rect x="50" y="70" width="60" height="110" rx="14" fill={marks.bodyFill} stroke="#e7d8a8" strokeWidth="2" />
        <circle cx="80" cy="45" r="28" fill={marks.bodyFill} stroke="#e7d8a8" strokeWidth="2" />
        <circle cx="71" cy="42" r="3" fill="#b08968" /><circle cx="89" cy="42" r="3" fill="#b08968" />
        <path d="M70 54 Q80 60 90 54" stroke="#b08968" strokeWidth="2" fill="none" />
        {target && (<g><rect x="52" y="105" width="56" height="26" rx="6" fill="#fff1f2" stroke="#fda4af" strokeWidth="1.5" />
          <text x="80" y="122" textAnchor="middle" fontSize="13" fill="#e11d48" fontWeight="bold">{target.length > 4 ? target.slice(0, 4) + '…' : target}</text></g>)}
        {marks.bruises.map((b, i) => (<circle key={i} cx={b.x} cy={b.y} r={b.r} fill="#a855f7" opacity="0.32" />))}
        {marks.marks.map((m, i) => markShape(m, i))}
      </svg>
      <span className="mt-0.5 text-[11px] font-semibold text-slate-700 truncate max-w-[64px]">{target}</span>
      <span className="text-[11px] text-rose-500 font-bold">{total} 下</span>
    </button>
  );
}

// 在 canvas 上绘制纸人（含四肢摆动 pose、伤痕、吐血、眼泪、绷带、X眼、封条）
function drawEffigy(ctx, { target, total, marks, mouth, down, crying, pose = {}, note = '' }) {
  const s = CARD.scale, ox = CARD.ox, oy = CARD.oy;
  const P = (x, y) => [ox + x * s, oy + y * s];
  ctx.save();
  ctx.translate(ox, oy);
  if (down) { ctx.translate(80 * s, 120 * s); ctx.rotate(-18 * Math.PI / 180); ctx.translate(-80 * s, -120 * s); }
  // 四肢（先画，位于身体之下）
  ctx.strokeStyle = '#e7d8a8'; ctx.lineWidth = 6 * s; ctx.lineCap = 'round';
  Object.entries(LIMBS).forEach(([k, L]) => {
    const off = pose[k] || 0;
    const [x1, y1] = L.a; let [x2, y2] = L.b;
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
    const ang = Math.atan2(dy, dx) + off;
    const nx = x1 + Math.cos(ang) * len, ny = y1 + Math.sin(ang) * len;
    const a = P(x1, y1), b = P(nx, ny);
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
  });
  // 身体
  const [bx, by] = P(BODY.body.x, BODY.body.y);
  ctx.fillStyle = marks.bodyFill; ctx.strokeStyle = '#e7d8a8'; ctx.lineWidth = 2 * s;
  roundRect(ctx, bx, by, BODY.body.w * s, BODY.body.h * s, BODY.body.r * s); ctx.fill(); ctx.stroke();
  // 头
  const [hx, hy] = P(BODY.head.cx, BODY.head.cy);
  ctx.beginPath(); ctx.arc(hx, hy, BODY.head.r * s, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  // 眼
  if (down) {
    ctx.strokeStyle = '#7f1d1d'; ctx.lineWidth = 2 * s;
    [[66, 38, 74, 46], [74, 38, 66, 46], [86, 38, 94, 46], [94, 38, 86, 46]].forEach(([x1, y1, x2, y2]) => {
      const a = P(x1, y1), b = P(x2, y2); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    });
  } else {
    ctx.fillStyle = '#b08968';
    [[71, 42], [89, 42]].forEach(([x, y]) => { const p = P(x, y); ctx.beginPath(); ctx.arc(p[0], p[1], 3 * s, 0, Math.PI * 2); ctx.fill(); });
  }
  // 嘴
  const [mx, my] = P(80, 55);
  if (mouth === '啊') { ctx.fillStyle = '#7f1d1d'; ctx.beginPath(); ctx.ellipse(mx, my + s, 7 * s, 9 * s, 0, 0, Math.PI * 2); ctx.fill(); }
  else if (mouth === '哦') { ctx.fillStyle = '#7f1d1d'; ctx.beginPath(); ctx.ellipse(mx, my, 5 * s, 4 * s, 0, 0, Math.PI * 2); ctx.fill(); }
  else { ctx.strokeStyle = '#7f1d1d'; ctx.lineWidth = 2.5 * s; const a = P(73, 56), b = P(80, 51), c = P(87, 56); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.quadraticCurveTo(b[0], b[1], c[0], c[1]); ctx.stroke(); }
  // 封条
  if (target) {
    const [sx, sy] = P(52, 105);
    ctx.fillStyle = '#fff1f2'; ctx.strokeStyle = '#fda4af'; ctx.lineWidth = 1.5 * s;
    roundRect(ctx, sx, sy, 56 * s, 26 * s, 6 * s); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e11d48'; ctx.font = `bold ${13 * s}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(target.length > 6 ? target.slice(0, 6) + '…' : target, sx + 28 * s, sy + 14 * s);
  }
  // 骂Ta纸条（与页面 SVG 同款样式）
  if (note) {
    const [nx, ny] = P(102, 132);
    ctx.save(); ctx.translate(nx + 26 * s, ny + 19 * s); ctx.rotate((6 * Math.PI) / 180);
    ctx.fillStyle = '#fef9c3'; ctx.strokeStyle = '#eab308'; ctx.lineWidth = 1.5 * s;
    roundRect(ctx, -26 * s, -19 * s, 52 * s, 38 * s, 4 * s); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#854d0e'; ctx.font = `${7.5 * s}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    noteLines(note).forEach((line, li) => ctx.fillText(line, 0, (-19 + 9 + li * 9) * s));
    ctx.restore();
  }
  // 淤青
  marks.bruises.forEach((b) => { const p = P(b.x, b.y); ctx.fillStyle = 'rgba(168,85,247,0.32)'; ctx.beginPath(); ctx.arc(p[0], p[1], b.r * s, 0, Math.PI * 2); ctx.fill(); });
  // 道具痕迹
  marks.marks.forEach((m) => { const p = P(m.x, m.y); drawMark(ctx, p[0], p[1], m.prop, s); });
  // 吐血
  marks.blood.forEach((b) => {
    const p = P(b.x, b.y); const e = P(b.x, b.y + b.dy);
    ctx.strokeStyle = 'rgba(185,28,28,0.85)'; ctx.lineWidth = 1.4 * s;
    ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(e[0], e[1]); ctx.stroke();
    ctx.fillStyle = '#b91c1c'; ctx.beginPath(); ctx.arc(e[0], e[1], b.r * s, 0, Math.PI * 2); ctx.fill();
  });
  // 绷带
  if (marks.bandage) {
    const p = P(62, 30);
    ctx.save(); ctx.translate(p[0] + 17 * s, p[1] + 6 * s); ctx.rotate((-18 * Math.PI) / 180);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = 1 * s;
    ctx.fillRect(-17 * s, -6 * s, 34 * s, 12 * s); ctx.strokeRect(-17 * s, -6 * s, 34 * s, 12 * s);
    ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 2 * s; ctx.beginPath(); ctx.moveTo(0, -7 * s); ctx.lineTo(0, 7 * s); ctx.stroke();
    ctx.restore();
  }
  // 眼泪
  if (crying) {
    ctx.fillStyle = '#60a5fa';
    [[71, 52], [89, 64]].forEach(([x, y]) => { const p = P(x, y); ctx.beginPath(); ctx.ellipse(p[0], p[1], 2.5 * s, 4 * s, 0, 0, Math.PI * 2); ctx.fill(); });
  }
  ctx.restore();
}

// 道具使用统计（按 PROPS 顺序，保证与道具栏一一对应）
function countByProp(detail) {
  const out = {};
  PROPS.forEach((p) => { out[p.id] = 0; });
  Object.entries((detail && detail.pp) || {}).forEach(([key, count]) => {
    const prop = key.split('__')[1];
    if (prop in out) out[prop] += count;
  });
  return out;
}

function statusOf(total) {
  if (total === 0) return { text: '完好', crying: false, down: false };
  if (total <= 3) return { text: '略显狼狈', crying: false, down: false };
  if (total <= 7) return { text: '鼻青脸肿', crying: false, down: false };
  if (total <= 14) return { text: '哭诉求饶', crying: true, down: false };
  return { text: '瘫倒不起', crying: true, down: true };
}

export default function HitEffigy({ room }) {
  const [rows, setRows] = useState([]);
  const [loaded, setLoaded] = useState(false);
  // 离线回退缓存按房间隔离：不同房间的对象与伤痕互不串
  const [localHits, setLocalHits] = useState({});
  const [localDetail, setLocalDetail] = useState({});
  const hitsKey = HITS_KEY + ':' + room;
  const detailKey = DETAIL_KEY + ':' + room;
  const [inputName, setInputName] = useState('');
  const [target, setTarget] = useState('');
  const [activeProp, setActiveProp] = useState(PROPS[0].id);
  const [shaking, setShaking] = useState(false);
  const [relief, setRelief] = useState('');
  const [mouth, setMouth] = useState(null);
  const [bubble, setBubble] = useState('');
  const [nameHint, setNameHint] = useState('');
  const [combo, setCombo] = useState(0);
  const [noteInput, setNoteInput] = useState(''); // 纸条输入
  const [note, setNote] = useState(''); // 当前对象身上的纸条内容
  const [cardImg, setCardImg] = useState('');
  const [hitFx, setHitFx] = useState(null); // { x, y, id }
  const [floaters, setFloaters] = useState([]); // 飘字：{ id, text, side, top }
  const floatTimerRef = useRef({});
  const [pose, setPose] = useState({});
  const lastHitRef = useRef(0);
  const poseTimerRef = useRef(null);
  const svgRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      const { data, error } = await supabase.from('effigy_hits').select('*').eq('room_code', room);
      if (alive) {
        if (!error) {
          setRows(data || []);
          // 进入已有记录的房间时自动选中第一个对象，免得白屏要重新贴名
          if (data && data.length) {
            const first = Object.keys(aggregate(data))[0];
            setTarget((t) => t || first);
          }
        }
        setLoaded(true);
      }
    }
    load();
    const ch = supabase
      .channel('effigy-' + room)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'effigy_hits', filter: `room_code=eq.${room}` }, () => refresh())
      .subscribe();
    return () => { alive = false; supabase.removeChannel(ch); };
    // eslint-disable-next-line
  }, [room]);

  // 切换房间：清空上个房间的对象与一切临时表现（名字、伤痕视图、特效），杜绝串房
  useEffect(() => {
    setLocalHits(get(hitsKey, {}));
    setLocalDetail(get(detailKey, {}));
    setTarget(''); setRelief(''); setMouth(null); setBubble(''); setCardImg(''); setHitFx(null); setPose({});
    // eslint-disable-next-line
  }, [room]);

  // 纸条按 房间+对象 隔离：切对象自动换纸条
  useEffect(() => {
    setNote(target ? get(NOTE_KEY + ':' + room + ':' + target, '') : '');
    setNoteInput('');
    // eslint-disable-next-line
  }, [room, target]);

  // 接收 AI 搭子发来的「贴到小人身上」事件
  useEffect(() => {
    function onPin(e) {
      const text = String(e.detail || '').trim().slice(0, 30);
      if (!text) return;
      if (!target) {
        setNameHint('先在上方给对象「贴上去」一个名字，再回来贴纸条');
        setTimeout(() => setNameHint(''), 3000);
        return;
      }
      setNote(text);
      set(NOTE_KEY + ':' + room + ':' + target, text);
      setNameHint(`📌 已把一句话贴到「${target}」身上`);
      setTimeout(() => setNameHint(''), 3000);
    }
    window.addEventListener('ventbox:pin-note', onPin);
    return () => window.removeEventListener('ventbox:pin-note', onPin);
  }, [room, target]);

  function pasteNote() {
    const n = noteInput.trim();
    if (!n || !target) return;
    setNote(n); setNoteInput('');
    set(NOTE_KEY + ':' + room + ':' + target, n);
  }

  async function refresh() {
    const key = await getRoomKey(room);
    const { data, error } = await supabase.from('effigy_hits').select('*').eq('room_code', room);
    if (!error && data) {
      const dec = await Promise.all(data.map(async (r) => ({ ...r, target: await decryptText(key, r.target) })));
      setRows(dec);
    }
  }

  const shared = loaded ? aggregate(rows) : null;
  const names = Array.from(new Set([...(shared ? Object.keys(shared) : []), ...Object.keys(localHits)]));
  function infoFor(t) {
    if (shared && shared[t]) return { total: shared[t].total, detail: shared[t] };
    return { total: localHits[t] || 0, detail: localDetail[t] || { parts: {}, pp: {} } };
  }

  const cur = target ? infoFor(target) : null;
  const total = cur ? cur.total : 0;
  const st = statusOf(total);
  const marks = target ? buildMarks(target, total, cur ? cur.detail : null) : null;
  const propCounts = countByProp(cur ? cur.detail : null);

  function pasteName() {
    const n = inputName.trim();
    if (!n) return;
    setTarget(n); setInputName(''); setRelief(''); setMouth(null); setBubble(''); setCardImg(''); setHitFx(null);
    setNameHint(`已切到「${n}」，原对象仍在下方通缉墙 / 打击榜`);
    setTimeout(() => setNameHint(''), 2600);
  }

  // 触发对应部位的挥动/踢腿动画
  function limbPose(part) {
    const R = (a) => (Math.random() - 0.5) * 2 * a;
    switch (part) {
      case 'head':
      case 'backhead': return { armL: R(0.6), armR: R(0.6) };
      case 'face':
      case 'nose':
      case 'ear':
      case 'neck':
      case 'chest': return { armL: R(0.5), armR: R(0.5) };
      case 'belly': return { armL: R(0.7) + 0.5, armR: R(0.7) - 0.5 };
      case 'butt': return { armL: R(0.4), armR: R(0.4) };
      case 'knee': return { legL: R(0.5), legR: R(0.5), armL: R(0.3) };
      case 'thigh': return { legL: R(0.4), legR: R(0.4) };
      case 'shin': return { legL: R(0.6), legR: R(0.6) };
      case 'foot': return { legL: R(0.6), legR: R(0.6) };
      case 'arm': return { armL: R(0.8), armR: R(0.8) };
      default: return {};
    }
  }

  // 依据「点击部位」推断：用鼠标实际坐标定位特效（100% 对得上）
  async function doHit(part, fx) {
    if (!target) return;
    const prop = PROPS.find((x) => x.id === activeProp) || PROPS[0];
    // 离线乐观更新
    const nextHits = { ...localHits, [target]: (localHits[target] || 0) + 1 };
    const curD = localDetail[target] || { parts: {}, pp: {} };
    const nextParts = { ...curD.parts, [part]: (curD.parts[part] || 0) + 1 };
    const k = part + '__' + prop.id;
    const nextPP = { ...curD.pp, [k]: (curD.pp[k] || 0) + 1 };
    const nextDetail = { ...localDetail, [target]: { parts: nextParts, pp: nextPP } };
    setLocalHits(nextHits); setLocalDetail(nextDetail);
    set(hitsKey, nextHits); set(detailKey, nextDetail);
    // 表现层
    playSmack(prop.dmg);
    const m = ['啊', '哦', '呜'][Math.floor(Math.random() * 3)];
    setMouth(m); playVoice(m);
    setBubble(CRY_WORDS[Math.floor(Math.random() * CRY_WORDS.length)]);
    setShaking(true); setTimeout(() => setShaking(false), 500);
    setRelief(RELIEF_LINES[Math.floor(Math.random() * RELIEF_LINES.length)]);
    // 特效位置：优先用真实鼠标坐标（viewBox 坐标），无坐标时退回部位锚点
    const anchors = PART_ANCHORS[part] || [[80, 110]];
    const p = fx && Number.isFinite(fx.x) ? fx : { x: anchors[0][0], y: anchors[0][1] };
    setHitFx({ x: p.x, y: p.y, id: Date.now() });
    setPose(limbPose(part));
    if (poseTimerRef.current) clearTimeout(poseTimerRef.current);
    poseTimerRef.current = setTimeout(() => setPose({}), 380);
    const now = Date.now();
    const isCombo = now - lastHitRef.current < 900;
    lastHitRef.current = now;
    setCombo(isCombo ? (c) => c + 1 : 1);
    // 飘字：第一人称痛感，随机左右飘出，连击可多条同屏叠飘
    const fl = { id: now + Math.random(), text: pickFlavor(prop.id, part), side: Math.random() < 0.5 ? 'left' : 'right', top: 14 + Math.random() * 56 };
    setFloaters((prev) => [...prev.slice(-3), fl]);
    clearTimeout(floatTimerRef.current[fl.id]);
    floatTimerRef.current[fl.id] = setTimeout(() => setFloaters((prev) => prev.filter((x) => x.id !== fl.id)), 1800);
    const encTarget = await encryptText(await getRoomKey(room), target);
    supabase.from('effigy_hits').insert({ room_code: room, target: encTarget, part, prop: prop.id }).then(() => refresh());
  }

  // 把鼠标事件坐标换算成 SVG viewBox 坐标（保证「点哪打哪」）
  function handleSvgClick(e, part) {
    if (!target) return;
    let fx = null;
    const svg = svgRef.current;
    if (svg) {
      const pt = svg.createSVGPoint();
      pt.x = e.clientX; pt.y = e.clientY;
      const ctm = svg.getScreenCTM();
      if (ctm) {
        const loc = pt.matrixTransform(ctm.inverse());
        fx = { x: loc.x, y: loc.y };
      }
    }
    // 兜底热区（part 为空）：按落点就近归到具体部位，杜绝「点了没反应」
    doHit(part || (fx ? nearestPart(fx.x, fx.y) : PART_IDS[Math.floor(Math.random() * PART_IDS.length)]), fx);
  }

  function switchTarget(name) { setTarget(name); setRelief(''); setMouth(null); setBubble(''); setCardImg(''); setHitFx(null); setPose({}); }

  async function clearCurrent() {
    if (!target) return;
    const nh = { ...localHits }; const nd = { ...localDetail };
    delete nh[target]; delete nd[target];
    setLocalHits(nh); setLocalDetail(nd); set(hitsKey, nh); set(detailKey, nd);
    // 库里 target 是密文（历史房间可能是明文），两种都删一次
    const enc = await encryptText(await getRoomKey(room), target);
    await supabase.from('effigy_hits').delete().eq('room_code', room).eq('target', enc);
    await supabase.from('effigy_hits').delete().eq('room_code', room).eq('target', target);
    setRows([]); setLoaded(false); refresh().then(() => setLoaded(true));
    setTarget(''); setRelief(''); setCardImg(''); setNote('');
    set(NOTE_KEY + ':' + room + ':' + target, '');
  }

  async function clearAll() {
    if (!window.confirm('确定清空本房间所有打击记录？')) return;
    setLocalHits({}); setLocalDetail({}); set(hitsKey, {}); set(detailKey, {});
    names.forEach((n) => set(NOTE_KEY + ':' + room + ':' + n, ''));
    await supabase.from('effigy_hits').delete().eq('room_code', room);
    setRows([]); setTarget(''); setRelief(''); setCardImg(''); setNote('');
  }

  // 战果图：复用同一套绘制函数 + 同一 pose + 道具统计，与画面完全一致
  function generateCard() {
    if (!target || !marks) return;
    const cv = canvasRef.current; if (!cv) return;
    const ctx = cv.getContext('2d');
    const statH = 26 * PROPS.length + 70;
    const W = CARD.w, H = CARD.oy + VIEW.h * CARD.scale + statH;
    cv.width = W; cv.height = H;
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#fff7ed'); grad.addColorStop(1, '#fee2e2');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#e11d48'; ctx.font = 'bold 24px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('⚔️ 解压战果 ⚔️', W / 2, 28);
    ctx.fillStyle = '#1f2937'; ctx.font = 'bold 18px sans-serif';
    ctx.fillText('对象：' + (target.length > 10 ? target.slice(0, 10) + '…' : target), W / 2, 56);
    // 纸人
    drawEffigy(ctx, { target, total, marks, mouth: null, down: st.down, crying: st.crying, pose, note });
    // 统计区
    let y = CARD.oy + VIEW.h * CARD.scale + 28;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#b91c1c'; ctx.font = 'bold 17px sans-serif';
    ctx.fillText(`已被打 ${total} 下 · ${st.text}`, 20, y); y += 26;
    ctx.fillStyle = '#334155'; ctx.font = '15px sans-serif';
    PROPS.forEach((p) => {
      ctx.fillText(`${p.icon} ${p.name}`, 24, y);
      ctx.fillText(`${propCounts[p.id]} 下`, 180, y);
      y += 26;
    });
    ctx.textAlign = 'center';
    ctx.fillStyle = '#64748b'; ctx.font = '13px sans-serif';
    ctx.fillText('群友齐心，正义执行 · 全程匿名', W / 2, y + 22);
    ctx.fillText('（本图不含任何真实身份信息）', W / 2, y + 42);
    setCardImg(cv.toDataURL('image/png'));
  }

  const mouthShape =
    mouth === '啊' ? <ellipse cx="80" cy="56" rx="7" ry="9" fill="#7f1d1d" /> :
    mouth === '哦' ? <ellipse cx="80" cy="55" rx="5" ry="4" fill="#7f1d1d" /> :
    mouth === '呜' ? <path d="M73 56 Q80 51 87 56" stroke="#7f1d1d" strokeWidth="2.5" fill="none" /> :
    <path d="M70 54 Q80 60 90 54" stroke="#b08968" strokeWidth="2" fill="none" />;

  // 四肢渲染（含受击摆动）
  function limbLine(key) {
    const L = LIMBS[key];
    const off = pose[key] || 0;
    const [x1, y1] = L.a; const [x2, y2] = L.b;
    const len = Math.hypot(x2 - x1, y2 - y1);
    const ang = Math.atan2(y2 - y1, x2 - x1) + off;
    const nx = x1 + Math.cos(ang) * len, ny = y1 + Math.sin(ang) * len;
    return [x1, y1, nx, ny];
  }

  return (
    <div>
      {/* 宽度跟随全局统一容器，不再单独铺开 */}
      <div>
        <div className="flex items-baseline gap-2 mb-4">
          <h2 className="text-xl font-bold text-slate-800">👊 打小人</h2>
          <span className="text-xs text-slate-400">{target ? `当前：${target} · 全房间已打 ${total} 下` : '先贴一个名字'}</span>
        </div>

        <div className="card mb-4">
          <div className="flex gap-2">
            <input className="input" placeholder="写下吐槽对象，如某领导 / 某部门 / 公司名" maxLength={20}
              value={inputName} onChange={(e) => setInputName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && pasteName()} />
            <button className="btn-ghost shrink-0" onClick={pasteName}>贴上去</button>
          </div>
          {target && (
            <div className="flex gap-2 mt-2">
              <input className="input" placeholder="骂Ta一句，贴成纸条钉在Ta身上（可选）" maxLength={30}
                value={noteInput} onChange={(e) => setNoteInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && pasteNote()} />
              <button className="btn-ghost shrink-0" onClick={pasteNote}>贴纸条</button>
            </div>
          )}
          {nameHint && (<p className="text-xs text-rose-500 mt-1.5 animate-pop">💡 {nameHint}</p>)}

          <div className="flex flex-wrap gap-2 mt-3">
            {PROPS.map((p) => (
              <button key={p.id} onClick={() => setActiveProp(p.id)}
                className={`px-2.5 py-1 rounded-full text-sm border transition ${activeProp === p.id ? 'bg-rose-500 text-white border-rose-500' : 'bg-white text-slate-600 border-slate-200 hover:border-rose-300'}`}>
                {p.icon} {p.name}{cur && propCounts[p.id] > 0 && <span className="ml-1 opacity-80">{propCounts[p.id]}</span>}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-1.5">选好道具后，<span className="text-rose-400">鼠标点纸人哪里就打哪里</span>；不点部位直接点「打！」则随机打一处。道具按钮上的数字是累计使用次数</p>
        </div>

        {/* 舞台：纸人为主，两侧刑具架 */}
        <div className="card mb-3">
          <div className={`relative flex items-center justify-center gap-1 sm:gap-3 py-2 ${shaking ? 'animate-shake' : ''}`}>
            {/* 左侧刑具架 */}
            <div className="hidden sm:flex flex-col items-center gap-1 w-10 shrink-0">
              <span className="text-[10px] text-slate-300">刑具架</span>
              <div className="flex flex-col gap-1">
                {PROPS.slice(0, 6).map((p) => (
                  <button key={'L' + p.id} onClick={() => setActiveProp(p.id)} title={p.name}
                    className={`w-8 h-8 rounded-xl border text-base flex items-center justify-center transition ${activeProp === p.id ? 'bg-rose-500 border-rose-500 shadow-sm shadow-rose-200' : 'bg-white/80 border-slate-200 hover:border-rose-300'}`}>
                    {p.icon}
                  </button>
                ))}
              </div>
            </div>

            {/* 纸人 */}
            <div className="shrink-0">
              <svg ref={svgRef} width="150" height="206" viewBox="0 0 160 220" className="drop-shadow select-none">
                <g transform={st.down ? 'rotate(-18 80 120)' : ''}>
              {/* 四肢（可摆动） */}
              {(() => { const [a, b, c, d] = limbLine('armL'); return <line x1={a} y1={b} x2={c} y2={d} stroke="#e7d8a8" strokeWidth="6" strokeLinecap="round" />; })()}
              {(() => { const [a, b, c, d] = limbLine('armR'); return <line x1={a} y1={b} x2={c} y2={d} stroke="#e7d8a8" strokeWidth="6" strokeLinecap="round" />; })()}
              {(() => { const [a, b, c, d] = limbLine('legL'); return <line x1={a} y1={b} x2={c} y2={d} stroke="#e7d8a8" strokeWidth="6" strokeLinecap="round" />; })()}
              {(() => { const [a, b, c, d] = limbLine('legR'); return <line x1={a} y1={b} x2={c} y2={d} stroke="#e7d8a8" strokeWidth="6" strokeLinecap="round" />; })()}
              {/* 身体 / 头 */}
              <rect x="50" y="70" width="60" height="110" rx="14" fill={marks ? marks.bodyFill : '#fdf6e3'} stroke="#e7d8a8" strokeWidth="2" />
              <circle cx="80" cy="45" r="28" fill={marks ? marks.bodyFill : '#fdf6e3'} stroke="#e7d8a8" strokeWidth="2" />
              {st.down ? (
                <g stroke="#7f1d1d" strokeWidth="2">
                  <line x1="66" y1="38" x2="74" y2="46" /><line x1="74" y1="38" x2="66" y2="46" />
                  <line x1="86" y1="38" x2="94" y2="46" /><line x1="94" y1="38" x2="86" y2="46" />
                </g>
              ) : (<g><circle cx="71" cy="42" r="3" fill="#b08968" /><circle cx="89" cy="42" r="3" fill="#b08968" /></g>)}
              {mouthShape}
              {target && (<g><rect x="52" y="105" width="56" height="26" rx="6" fill="#fff1f2" stroke="#fda4af" strokeWidth="1.5" />
                <text x="80" y="122" textAnchor="middle" fontSize="13" fill="#e11d48" fontWeight="bold">{target.length > 6 ? target.slice(0, 6) + '…' : target}</text></g>)}
              {/* 骂Ta纸条：钉在身上，随瘫倒一起旋转 */}
              {note && (<g transform="rotate(6 128 150)">
                <rect x="102" y="132" width="52" height="38" rx="4" fill="#fef9c3" stroke="#eab308" strokeWidth="1.5" />
                {noteLines(note).map((line, li) => (
                  <text key={li} x="128" y={141 + li * 9} textAnchor="middle" fontSize="7.5" fill="#854d0e">{line}</text>
                ))}
              </g>)}
              {marks && marks.bruises.map((b, i) => (<circle key={'b' + i} cx={b.x} cy={b.y} r={b.r} fill="#a855f7" opacity="0.32" />))}
              {marks && marks.marks.map(markShape)}
              {marks && marks.blood.map((b, i) => (
                <g key={'bl' + i}>
                  <line x1={b.x} y1={b.y} x2={b.x} y2={b.y + b.dy} stroke="#b91c1c" strokeWidth="1.4" opacity="0.85" />
                  <circle cx={b.x} cy={b.y + b.dy} r={b.r} fill="#b91c1c" />
                </g>
              ))}
              {marks && marks.bandage && (<g><rect x="62" y="30" width="34" height="12" rx="3" fill="#fff" stroke="#e5e7eb" strokeWidth="1" transform="rotate(-18 79 36)" /><line x1="79" y1="29" x2="79" y2="43" stroke="#ef4444" strokeWidth="2" /></g>)}
              {st.crying && (<g fill="#60a5fa">
                <ellipse cx="71" cy="50" rx="2.5" ry="4"><animate attributeName="cy" from="50" to="66" dur="1.2s" repeatCount="indefinite" /><animate attributeName="opacity" from="0.9" to="0" dur="1.2s" repeatCount="indefinite" /></ellipse>
                <ellipse cx="89" cy="50" rx="2.5" ry="4"><animate attributeName="cy" from="50" to="66" dur="1.2s" begin="0.6s" repeatCount="indefinite" /><animate attributeName="opacity" from="0.9" to="0" dur="1.2s" begin="0.6s" repeatCount="indefinite" /></ellipse>
              </g>)}
              {/* 打击点实时特效将移到 svg root 空间（见下方），此处仅闭合身体组 */}
            </g>
            {bubble && (<g><rect x="112" y="14" width="44" height="22" rx="8" fill="#fff" stroke="#fda4af" /><text x="134" y="29" textAnchor="middle" fontSize="13" fill="#e11d48" fontWeight="bold">{bubble}</text></g>)}
            {/* 点击层：部位拆细，点哪打哪；首个 rect 为兜底大区，小人范围内点任何位置都按「最近部位」命中，杜绝死区。
                全部加 pointer-events="all"：不完全依赖 fill 命中，兼容 iOS 微信（WKWebView）内核 */}
            {target && (
              <g className="cursor-pointer" transform={st.down ? 'rotate(-18 80 120)' : ''}>
                {/* 兜底大区：必须放在第一个（最底层），只接住其他热区都没命中的边角 */}
                <rect x="20" y="12" width="120" height="208" fill="transparent" pointerEvents="all" onClick={(e) => handleSvgClick(e, null)}><title>就近命中</title></rect>
                <ellipse cx="80" cy="28" rx="18" ry="12" fill="transparent" pointerEvents="all" onClick={(e) => handleSvgClick(e, 'backhead')}><title>后脑勺</title></ellipse>
                <circle cx="80" cy="52" r="16" fill="transparent" pointerEvents="all" onClick={(e) => handleSvgClick(e, 'face')}><title>脸</title></circle>
                <circle cx="80" cy="50" r="5" fill="transparent" pointerEvents="all" onClick={(e) => handleSvgClick(e, 'nose')}><title>鼻梁</title></circle>
                <circle cx="62" cy="46" r="7" fill="transparent" pointerEvents="all" onClick={(e) => handleSvgClick(e, 'ear')}><title>耳朵</title></circle>
                <circle cx="98" cy="46" r="7" fill="transparent" pointerEvents="all" onClick={(e) => handleSvgClick(e, 'ear')}><title>耳朵</title></circle>
                <rect x="52" y="70" width="56" height="22" fill="transparent" pointerEvents="all" onClick={(e) => handleSvgClick(e, 'chest')}><title>胸口</title></rect>
                {/* 脖子热区放在胸口之后：两者在 y70~74 重叠，靠后的元素优先命中脖子 */}
                <rect x="66" y="62" width="28" height="12" fill="transparent" pointerEvents="all" onClick={(e) => handleSvgClick(e, 'neck')}><title>脖子</title></rect>
                <rect x="52" y="92" width="56" height="44" fill="transparent" pointerEvents="all" onClick={(e) => handleSvgClick(e, 'belly')}><title>肚子</title></rect>
                <rect x="52" y="136" width="56" height="34" fill="transparent" pointerEvents="all" onClick={(e) => handleSvgClick(e, 'butt')}><title>屁股</title></rect>
                <rect x="52" y="170" width="56" height="12" fill="transparent" pointerEvents="all" onClick={(e) => handleSvgClick(e, 'thigh')}><title>大腿</title></rect>
                <rect x="52" y="182" width="56" height="12" fill="transparent" pointerEvents="all" onClick={(e) => handleSvgClick(e, 'knee')}><title>膝盖</title></rect>
                <rect x="52" y="194" width="56" height="14" fill="transparent" pointerEvents="all" onClick={(e) => handleSvgClick(e, 'shin')}><title>小腿</title></rect>
                <rect x="52" y="208" width="56" height="12" fill="transparent" pointerEvents="all" onClick={(e) => handleSvgClick(e, 'foot')}><title>脚</title></rect>
                {/* 手臂热区：不加则点胳膊完全无反应，违背「点哪打哪」 */}
                <line x1="52" y1="92" x2="26" y2="116" stroke="transparent" strokeWidth="16" strokeLinecap="round" pointerEvents="all" onClick={(e) => handleSvgClick(e, 'arm')}><title>手臂</title></line>
                <line x1="108" y1="92" x2="134" y2="116" stroke="transparent" strokeWidth="16" strokeLinecap="round" pointerEvents="all" onClick={(e) => handleSvgClick(e, 'arm')}><title>手臂</title></line>
              </g>
            )}
            {/* 打击点实时特效：用鼠标真实 viewBox 坐标（root 空间，不受瘫倒旋转影响），点哪爆哪；pointerEvents 防止特效吞掉快速连点 */}
            {hitFx && (
              <g key={hitFx.id} pointerEvents="none">
                <circle cx={hitFx.x} cy={hitFx.y} r="4" fill="#ef4444" opacity="0.9">
                  <animate attributeName="r" from="2" to="18" dur="0.45s" fill="freeze" />
                  <animate attributeName="opacity" from="0.9" to="0" dur="0.45s" fill="freeze" />
                </circle>
                <text x={hitFx.x} y={hitFx.y - 6} fontSize="15" textAnchor="middle" fill="#ef4444" fontWeight="bold">✳</text>
              </g>
            )}
            </svg>
            </div>

            {/* 右侧刑具架 */}
            <div className="hidden sm:flex flex-col items-center gap-1 w-10 shrink-0">
              <span className="text-[10px] text-slate-300">刑具架</span>
              <div className="flex flex-col gap-1">
                {PROPS.slice(6).map((p) => (
                  <button key={'R' + p.id} onClick={() => setActiveProp(p.id)} title={p.name}
                    className={`w-8 h-8 rounded-xl border text-base flex items-center justify-center transition ${activeProp === p.id ? 'bg-rose-500 border-rose-500 shadow-sm shadow-rose-200' : 'bg-white/80 border-slate-200 hover:border-rose-300'}`}>
                    {p.icon}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 飘字：在小人两侧空白区随机浮出，第一人称痛感 */}
          {floaters.map((f) => (
            <div key={f.id} className={`pointer-events-none absolute z-20 ${f.side === 'left' ? 'left-3 sm:left-10' : 'right-3 sm:right-10'}`} style={{ top: f.top + '%' }}>
              <span className="float-text block max-w-[150px] text-center text-sm font-bold text-rose-500 leading-snug">{f.text}</span>
            </div>
          ))}

          {/* 状态 + 出手按钮：同一行，保证 100% 缩放下按钮完整可见 */}
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-t border-slate-100 pt-2">
            <p className="text-sm text-slate-500">
              {target ? <>当前：<span className="font-semibold text-rose-500">{target}</span> ｜ 已打 <span className="font-bold text-rose-500">{total}</span> 下 ｜ <span className="text-rose-500">{st.text}</span></> : '先「贴上去」一个名字 👆'}
            </p>
            {combo > 1 && <p className="text-sm font-bold text-amber-500 animate-pop">🔥 连击 x{combo}！</p>}
            <div className="flex gap-2 ml-auto">
              <button className="text-base px-6 py-2 rounded-2xl shadow-lg shadow-red-200 text-white bg-red-500 hover:bg-red-600 active:scale-95 transition disabled:opacity-40 disabled:cursor-not-allowed font-semibold"
                onClick={() => doHit(PART_IDS[Math.floor(Math.random() * PART_IDS.length)])} disabled={!target}>
                {PROPS.find((p) => p.id === activeProp)?.icon} 打！
              </button>
              <button className="btn-ghost" onClick={generateCard} disabled={!target}>🖼️ 战果图</button>
            </div>
          </div>

          {relief && (<p key={relief} className="text-center text-rose-500 font-semibold mt-2 animate-pop">已为你出气 {total} 次！{relief}</p>)}
        </div>
      </div>

      {/* 战果图（生成后展示） */}
      {cardImg && (<div className="card mb-4 text-center">
        <img src={cardImg} alt="战果图" className="mx-auto rounded-xl shadow max-w-full" />
        <a href={cardImg} download={`解压战果_${target}.png`} className="btn-primary inline-block mt-2">⬇️ 保存图片</a>
        <p className="text-xs text-slate-400 mt-1">战果图与上方画面伤痕、吐血、姿势、道具统计完全一致</p>
      </div>)}

      {/* 通缉墙：本房间所有对象的缩略「通缉照」，点任意一张即可切换上台 */}
      {names.length > 0 && (
        <div className="card mb-4">
          <h3 className="font-semibold text-slate-700 mb-2">🚨 通缉墙（本房间 {names.length} 人）</h3>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
            {names.map((n) => {
              const info = infoFor(n);
              const m = buildMarks(n, info.total, info.detail);
              return <MiniEffigy key={n} target={n} total={info.total} marks={m} active={n === target} onClick={() => switchTarget(n)} />;
            })}
          </div>
          <p className="text-[11px] text-slate-400 mt-2">点任意一张「通缉照」就能把 Ta 请上台挨打；当前台上的人有高亮边框</p>
        </div>
      )}

      <div className="card">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-slate-700">📋 打击对象榜（本房间）</h3>
          <div className="flex gap-3">
            {target && <button className="text-xs text-slate-400 hover:text-rose-500" onClick={clearCurrent}>清空当前</button>}
            {names.length > 0 && <button className="text-xs text-slate-400 hover:text-rose-500" onClick={clearAll}>清空全部</button>}
          </div>
        </div>
        <p className="text-[11px] text-rose-400 mb-2">👆 点任意名字即可切换上台挨打，原对象仍保留在榜上</p>
        {names.length === 0 ? (<p className="text-sm text-slate-400">还没有打过任何人。</p>) : (
          <ul className="space-y-1">
            {names.map((n) => {
              const info = infoFor(n);
              const isActive = n === target;
              return (<li key={n}><button
                className={`w-full text-left text-sm px-3 py-2 rounded-lg flex justify-between items-center ${isActive ? 'bg-rose-50 text-rose-600 font-semibold ring-1 ring-rose-200' : 'hover:bg-slate-50 text-slate-600'}`}
                onClick={() => switchTarget(n)}>
                <span className="flex items-center gap-1.5 min-w-0"><span className="truncate">{n}</span>{isActive && <span className="text-[10px] bg-rose-500 text-white rounded px-1 py-0.5 shrink-0">台上</span>}</span>
                <span className="shrink-0">{info.total} 下</span>
              </button></li>);
            })}
          </ul>
        )}
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
