import { useEffect, useRef, useState } from 'react';
import { get, set } from '../lib/storage.js';
import { supabase } from '../lib/supabase.js';
import { getRoomKey, encryptText, decryptText } from '../lib/crypto.js';
import { getNotes, addNote, clearNotes } from '../lib/notes.js';

const HITS_KEY = 'effigy.hits'; // 离线回退：{ 对象: 总次数 }
const DETAIL_KEY = 'effigy.detail'; // 离线回退：{ 对象: { parts, pp } }
const UNKNOWN_TARGET = '❓未知对象'; // 无法解密的历史密文记录统一归并到这儿
const NOTE_MAX_SHOWN = 3; // 纸人身上最多同时展示的纸条数
// 可爱便签配色：粉 / 薄荷 / 奶油黄 按索引轮换
const NOTE_STYLES = [
  { fill: '#ffe1ec', stroke: '#f7a8c4', text: '#9d3b63', tape: '#fbcfe8' },
  { fill: '#dcf5ea', stroke: '#86dcc0', text: '#1f7a5e', tape: '#bbf0da' },
  { fill: '#fff6cf', stroke: '#f0d27a', text: '#8a6516', tape: '#fde68a' },
];
// 纸人身上 3 张纸条的错落摆放：x,y 为左上角，rot 为旋转角（度）
const NOTE_SLOTS = [
  { x: 90, y: 100, rot: -5 },
  { x: 94, y: 140, rot: 5 },
  { x: 90, y: 178, rot: -4 },
];

const VIEW = { w: 160, h: 220 };
const CARD = { w: 320, scale: 2, ox: (320 - 160 * 2) / 2, oy: 78 };

// 道具（顺序即道具栏显示顺序；战果图统计沿用同一顺序，保证上下一致）
// 说明：统一走「卡通解压」路线，不使用血腥/酷刑类元素
const PROPS = [
  { id: 'hammer', name: '榔头', icon: '🔨', dmg: 2 },
  { id: 'needle', name: '针', icon: '📍', dmg: 1, ranged: true },
  { id: 'knife', name: '刀', icon: '🔪', dmg: 2 },
  { id: 'gun', name: '枪', icon: '🔫', dmg: 3, ranged: true },
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

// 从数据库拉取并按本机钥匙解密；统一供 load() 与 refresh() 使用（修「首屏满屏 enc:」）。
// 解密后仍带 enc: 前缀 = 本机没有对应钥匙的历史密文 → 全部归并为 UNKNOWN_TARGET 一条。
async function fetchDecryptedRows(room) {
  const { data, error } = await supabase.from('effigy_hits').select('*').eq('room_code', room);
  if (error || !data) return null; // null = 拉取失败，调用方保留原数据
  const key = await getRoomKey(room);
  const rows = await Promise.all(
    data.map(async (r) => {
      let t = await decryptText(key, r.target);
      if (typeof t === 'string' && t.startsWith('enc:')) t = UNKNOWN_TARGET;
      return { ...r, target: t };
    })
  );
  return rows;
}

// 单张可爱便签（SVG 主舞台用）。x,y 为左上角，rot 为旋转角（度）；样式按索引轮换
function NoteSticker({ x, y, rot, text, idx }) {
  const s = NOTE_STYLES[idx % NOTE_STYLES.length];
  const lines = noteLines(text);
  return (
    <g transform={`rotate(${rot} ${x + 32} ${y + 21})`}>
      {/* 和纸胶带 */}
      <rect x={x + 14} y={y - 4} width="36" height="10" rx="3" fill={s.tape} opacity="0.85" transform={`rotate(-3 ${x + 32} ${y + 1})`} />
      {/* 便签纸 */}
      <rect x={x} y={y} width="64" height="42" rx="7" fill={s.fill} stroke={s.stroke} strokeWidth="1.2" />
      {/* 图钉 */}
      <text x={x + 6} y={y + 14} fontSize="11">📌</text>
      {lines.map((ln, i) => (
        <text key={i} x={x + 33} y={y + 17 + i * 9} textAnchor="middle" fontSize="8.5" fill={s.text}>{ln}</text>
      ))}
    </g>
  );
}

// 单张可爱便签（canvas 战果图用，参数同 NoteSticker；s 为 CARD.scale）
function drawNoteSticker(ctx, slot, text, idx, s) {
  const ox = CARD.ox, oy = CARD.oy;
  const style = NOTE_STYLES[idx % NOTE_STYLES.length];
  const w = 64 * s, h = 42 * s, hw = w / 2, hh = h / 2;
  ctx.save();
  // 与 SVG 主舞台保持同一 viewBox 坐标系（drawEffigy 已 translate(ox,oy)，故此处再加一次 ox/oy 抵消双偏移）
  ctx.translate(ox + slot.x * s + 32 * s, oy + slot.y * s + 21 * s);
  ctx.rotate((slot.rot * Math.PI) / 180);
  // 和纸胶带
  ctx.save();
  ctx.rotate((-3 * Math.PI) / 180);
  ctx.fillStyle = style.tape; ctx.globalAlpha = 0.85;
  roundRect(ctx, -18 * s, -hh - 4 * s, 36 * s, 10 * s, 3 * s); ctx.fill();
  ctx.globalAlpha = 1; ctx.restore();
  // 便签纸
  ctx.fillStyle = style.fill; ctx.strokeStyle = style.stroke; ctx.lineWidth = 1.2 * s;
  roundRect(ctx, -hw, -hh, w, h, 7 * s); ctx.fill(); ctx.stroke();
  // 图钉
  ctx.font = `${11 * s}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('📌', -hw + 6 * s, -hh + 14 * s);
  // 文字
  ctx.fillStyle = style.text; ctx.font = `${8.5 * s}px sans-serif`;
  noteLines(text).forEach((ln, li) => ctx.fillText(ln, 0, -hh + 17 * s + li * 9 * s));
  ctx.restore();
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
function drawEffigy(ctx, { target, total, marks, mouth, down, crying, pose = {}, notes = [] }) {
  const s = CARD.scale, ox = CARD.ox, oy = CARD.oy;
  const P = (x, y) => [ox + x * s, oy + y * s];
  ctx.save();
  ctx.translate(ox, oy);
  // 落地阴影（伪立体轻量同步：半透明黑椭圆，与 SVG 主视图风格一致）
  ctx.save(); ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.beginPath(); ctx.ellipse(80 * s, 212 * s, 34 * s, 6 * s, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
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
  // 身体（伪立体轻量同步：径向渐变叠加，保留受伤变色）
  const [bx, by] = P(BODY.body.x, BODY.body.y);
  const bgrad = ctx.createRadialGradient(bx + 14 * s, by + 18 * s, 4 * s, bx + (BODY.body.w * s) / 2, by + (BODY.body.h * s) / 2, BODY.body.w * s);
  bgrad.addColorStop(0, '#fffdf5'); bgrad.addColorStop(1, marks.bodyFill);
  ctx.fillStyle = bgrad; ctx.strokeStyle = '#e7d8a8'; ctx.lineWidth = 2 * s;
  roundRect(ctx, bx, by, BODY.body.w * s, BODY.body.h * s, BODY.body.r * s); ctx.fill(); ctx.stroke();
  // 头
  const [hx, hy] = P(BODY.head.cx, BODY.head.cy);
  const hgrad = ctx.createRadialGradient(hx - 10 * s, hy - 12 * s, 3 * s, hx, hy, BODY.head.r * s);
  hgrad.addColorStop(0, '#fffdf5'); hgrad.addColorStop(1, marks.bodyFill);
  ctx.fillStyle = hgrad;
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
  // 骂Ta纸条（与页面 SVG 同款样式）：最多展示最新 3 张，错落旋转摆放
  if (notes && notes.length) {
    notes.slice(0, NOTE_MAX_SHOWN).forEach((nt, i) => drawNoteSticker(ctx, NOTE_SLOTS[i], nt, i, s));
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

// 武器/子弹飞行体（overlay 层用绝对定位 div + CSS transform，比 SVG 跨坐标系更顺）
// 挂载后下一帧再位移，触发 CSS transition 飞向目标
function WeaponShot({ shot }) {
  const [go, setGo] = useState(false);
  useEffect(() => {
    const r = requestAnimationFrame(() => setGo(true));
    return () => cancelAnimationFrame(r);
  }, []);
  const TRAVEL = shot.melee ? 260 : 320;
  const dx = shot.to.x - shot.from.x;
  const dy = shot.to.y - shot.from.y;
  if (shot.melee) {
    // 近战：道具大 emoji 直接飞向目标并轻微旋转
    return (
      <div
        className="absolute will-change-transform"
        style={{
          left: shot.from.x, top: shot.from.y,
          transform: go ? `translate(${dx}px, ${dy}px) rotate(380deg)` : 'translate(0px, 0px)',
          transition: `transform ${TRAVEL}ms ease-out`,
          fontSize: 30, lineHeight: 1, pointerEvents: 'none',
        }}
      >
        {shot.icon}
      </div>
    );
  }
  // 远程：枪口火光 + 红点子弹 + 拖尾
  return (
    <>
      <div
        className="absolute"
        style={{ left: shot.from.x - 8, top: shot.from.y - 8, fontSize: 16, animation: 'effMuzzle .3s ease-out forwards', pointerEvents: 'none' }}
      >🔥</div>
      <div
        className="absolute will-change-transform"
        style={{
          left: shot.from.x, top: shot.from.y,
          transform: go ? `translate(${dx}px, ${dy}px)` : 'translate(0px, 0px)',
          transition: `transform ${TRAVEL}ms ease-in`,
          pointerEvents: 'none',
        }}
      >
        {/* 子弹：红点 */}
        <span style={{ position: 'absolute', left: -2, top: -2, width: 4, height: 4, borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 6px 2px rgba(239,68,68,.7)' }} />
        {/* 拖尾 */}
        <span style={{ position: 'absolute', left: -16, top: -1, width: 16, height: 2, background: 'linear-gradient(90deg, transparent, #ef4444)', borderRadius: 2 }} />
      </div>
    </>
  );
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
  const [notes, setNotes] = useState([]); // 当前对象身上的纸条数组（最新在前）
  const [cardImg, setCardImg] = useState('');
  const [hitFx, setHitFx] = useState(null); // { x, y, id }
  const [floaters, setFloaters] = useState([]); // 飘字：{ id, text, side, top }
  const floatTimerRef = useRef({});
  const [pose, setPose] = useState({});
  const lastHitRef = useRef(0);
  const poseTimerRef = useRef(null);
  const svgRef = useRef(null);
  const canvasRef = useRef(null);
  // 武器/子弹飞行动画
  const [lurch, setLurch] = useState(false); // 受击 3D 前倾后仰
  const [shots, setShots] = useState([]); // 飞行中的武器/子弹 [{ id, propId, icon, from, to, melee }]
  const stageRef = useRef(null); // 舞台卡片 ref，用于把 viewBox 坐标映射到卡片内像素坐标
  const shotSeqRef = useRef(0); // shot 自增 id

  useEffect(() => {
    let alive = true;
    async function load() {
      const rows = await fetchDecryptedRows(room);
      if (!alive) return;
      if (rows) {
        setRows(rows);
        // 进入已有记录的房间时自动选中第一个对象，免得白屏要重新贴名
        // 优先选非「未知对象」的条目，避免把历史密文（enc:...）当成当前对象
        if (rows.length) {
          const agg = aggregate(rows);
          const names = Object.keys(agg);
          const pick = names.find((n) => n !== UNKNOWN_TARGET) || names[0] || '';
          setTarget((t) => t || pick);
        }
      }
      setLoaded(true);
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

  // 纸条按 房间+对象 隔离：切对象自动换纸条；同时把「当前对象」存起来，
  // 这样用户在别的页签（如 AI 聊天）点「📌 贴到小人身上」也能贴对人
  useEffect(() => {
    setNotes(target ? getNotes(room, target) : []);
    setNoteInput('');
    if (target) set('effigy.currentTarget:' + room, target);
    // eslint-disable-next-line
  }, [room, target]);

  // 全局层（App）贴好纸条后通知这里即时刷新（App 是唯一写纸条的地方，这里只刷新显示）
  useEffect(() => {
    function onApplied(e) {
      const d = (e && e.detail) || {};
      if (d.target && d.target === target) {
        setNotes(getNotes(room, target));
        setNameHint(`📌 已把一句话贴到「${d.target}」身上（第 ${getNotes(room, target).length} 张）`);
        setTimeout(() => setNameHint(''), 2600);
      }
    }
    window.addEventListener('ventbox:note-applied', onApplied);
    return () => window.removeEventListener('ventbox:note-applied', onApplied);
  }, [target, room]);

  function pasteNote() {
    const n = noteInput.trim();
    if (!n || !target) return;
    const before = getNotes(room, target).length;
    const arr = addNote(room, target, n);
    setNotes(arr); setNoteInput('');
    if (arr.length > before) setNameHint(`📌 已贴上第 ${arr.length} 张纸条`);
    else setNameHint('📌 这条已经贴过啦');
    setTimeout(() => setNameHint(''), 2600);
  }

  async function refresh() {
    const rows = await fetchDecryptedRows(room);
    if (!rows) return;
    setRows(rows);
    // 注意：不做「本地乐观计数向下对齐云端」。显示层用 Math.max(云端聚合, 本机乐观)
    // 已保证计数不落后；而 refresh 的云端快照可能落后于本机尚未落库的击打
    //（网络往返 / 并发 refresh），若在此把 localHits 向下重置为旧快照，会回拨计数、
    // 复活「连打计数滞后」Bug。罕见场景「云端被清」的虚高由 max 自然兜住，不影响正确性。
  }

  const shared = loaded ? aggregate(rows) : null;
  const names = Array.from(new Set([...(shared ? Object.keys(shared) : []), ...Object.keys(localHits)]));
  // 计数即时（修「连打计数滞后」）：total 取 服务器聚合 与 本机乐观 的较大值
  function infoFor(t) {
    const sh = shared && shared[t];
    const sTotal = sh ? sh.total : 0;
    const total = Math.max(sTotal, localHits[t] || 0);
    const detail = sh ? sh : (localDetail[t] || { parts: {}, pp: {} });
    return { total, detail };
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

  // 受击表现层（抽离）：武器/子弹到达后才调用，保证「到达瞬间才出受击」（pose/血/飘字同步）
  function applyImpact(part, prop, fx) {
    playSmack(prop.dmg);
    const m = ['啊', '哦', '呜'][Math.floor(Math.random() * 3)];
    setMouth(m); playVoice(m);
    setBubble(CRY_WORDS[Math.floor(Math.random() * CRY_WORDS.length)]);
    setShaking(true); setTimeout(() => setShaking(false), 500);
    // 受击 3D 前倾后仰（lurch），与 shaking 的 animate-shake 并存
    setLurch(true); setTimeout(() => setLurch(false), 500);
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
  }

  // 依据「点击部位」推断：用鼠标实际坐标定位特效（100% 对得上）
  // 时序：立即做乐观计数 + 加密落库（数据一致性不等动画）；同时发射武器飞行动画，
  // 子弹到达（TRAVEL_MS）后才触发受击表现，多个 shot 各自独立移除，互不干扰。
  async function doHit(part, fx) {
    if (!target) return;
    // 「未知对象」是丢失钥匙的历史密文归并出的伪对象，不允许打击，避免把密文再加密一层写库
    if (target === UNKNOWN_TARGET) {
      setNameHint('❓未知对象是丢失钥匙的历史密文，无法打击，请换一个对象');
      setTimeout(() => setNameHint(''), 3000);
      return;
    }
    const prop = PROPS.find((x) => x.id === activeProp) || PROPS[0];
    // 离线乐观更新（用函数式更新，连点同一 tick 也不丢计数）
    setLocalHits((h) => {
      const nh = { ...h, [target]: (h[target] || 0) + 1 };
      set(hitsKey, nh);
      return nh;
    });
    setLocalDetail((d) => {
      const curD = d[target] || { parts: {}, pp: {} };
      const nextParts = { ...curD.parts, [part]: (curD.parts[part] || 0) + 1 };
      const k = part + '__' + prop.id;
      const nextPP = { ...curD.pp, [k]: (curD.pp[k] || 0) + 1 };
      const nd = { ...d, [target]: { parts: nextParts, pp: nextPP } };
      set(detailKey, nd);
      return nd;
    });
    // 武器/子弹飞行：把点击的 viewBox 坐标映射到舞台卡片内的像素坐标
    const melee = !prop.ranged;
    const TRAVEL = melee ? 260 : 320;
    const id = ++shotSeqRef.current;
    const stageEl = stageRef.current;
    const svgEl = svgRef.current;
    const stageW = stageEl ? stageEl.clientWidth : 160;
    const stageH = stageEl ? stageEl.clientHeight : 240;
    let to;
    try {
      if (svgEl && stageEl) {
        const rect = svgEl.getBoundingClientRect();
        const sRect = stageEl.getBoundingClientRect();
        const lx = fx && Number.isFinite(fx.x) ? fx.x : 80;
        const ly = fx && Number.isFinite(fx.y) ? fx.y : 110;
        to = { x: rect.left - sRect.left + (lx / VIEW.w) * rect.width, y: rect.top - sRect.top + (ly / VIEW.h) * rect.height };
      }
    } catch { /* ignore */ }
    if (!to) to = { x: stageW / 2, y: stageH / 2 };
    const from = melee
      ? { x: stageW - 20, y: stageH / 2 } // 近战：从右侧中部飞入
      : { x: stageW - 30, y: stageH - 26 }; // 远程：卡片右下角（枪口）
    setShots((prev) => [...prev, { id, propId: prop.id, icon: prop.icon, from, to, melee }]);
    // 子弹到达瞬间触发受击表现
    setTimeout(() => { applyImpact(part, prop, fx); }, TRAVEL);
    // 飞行体移除（与受击表现错开，避免闪退），多 shot 各自独立
    setTimeout(() => { setShots((prev) => prev.filter((s) => s.id !== id)); }, TRAVEL + 120);

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
    if (target === UNKNOWN_TARGET) {
      setNameHint('❓未知对象无法单独清空，可在右侧「清空全部」移除历史记录');
      setTimeout(() => setNameHint(''), 3000);
      return;
    }
    const nh = { ...localHits }; const nd = { ...localDetail };
    delete nh[target]; delete nd[target];
    setLocalHits(nh); setLocalDetail(nd); set(hitsKey, nh); set(detailKey, nd);
    // 库里 target 是密文（历史房间可能是明文），两种都删一次
    const enc = await encryptText(await getRoomKey(room), target);
    await supabase.from('effigy_hits').delete().eq('room_code', room).eq('target', enc);
    await supabase.from('effigy_hits').delete().eq('room_code', room).eq('target', target);
    clearNotes(room, target);
    setRows([]); setLoaded(false); refresh().then(() => setLoaded(true));
    setTarget(''); setRelief(''); setCardImg(''); setNotes([]);
  }

  async function clearAll() {
    if (!window.confirm('确定清空本房间所有打击记录？')) return;
    setLocalHits({}); setLocalDetail({}); set(hitsKey, {}); set(detailKey, {});
    names.forEach((n) => clearNotes(room, n));
    await supabase.from('effigy_hits').delete().eq('room_code', room);
    setRows([]); setTarget(''); setRelief(''); setCardImg(''); setNotes([]);
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
    drawEffigy(ctx, { target, total, marks, mouth: null, down: st.down, crying: st.crying, pose, notes });
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
        <div className="card mb-3 relative" ref={stageRef}>
          {/* 武器/子弹飞行 overlay：绝对定位覆盖舞台卡片，pointer-events:none 不挡点击（点击层仍在 SVG 内可点） */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 15 }}>
            {shots.map((s) => <WeaponShot key={s.id} shot={s} />)}
          </div>
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
            <div className="shrink-0" style={{ perspective: '600px' }}>
              <svg ref={svgRef} width="150" height="206" viewBox="0 0 160 220" className="drop-shadow select-none">
                <defs>
                  <radialGradient id="effSheen" cx="35%" cy="28%" r="78%">
                    <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
                    <stop offset="55%" stopColor="#ffffff" stopOpacity="0.10" />
                    <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                  </radialGradient>
                </defs>
                {/* 落地阴影：受击时压扁增强“砸下去”感（在身体组之前、更底层） */}
                <ellipse cx="80" cy="212" rx={lurch ? 26 : 34} ry="6" fill="#000" opacity={lurch ? 0.2 : 0.12} />
                {/* lurch：受击 3D 前倾后仰（外层 g，CSS 3D transform；perspective 在父容器 .shrink-0 上） */}
                <g style={{ transition: 'transform .12s ease-out', transform: lurch ? 'perspective(600px) rotateX(14deg) translateY(4px)' : 'none', transformOrigin: '50% 100%', transformBox: 'view-box' }}>
                <g transform={st.down ? 'rotate(-18 80 120)' : ''}>
              {/* 四肢（可摆动，末端圆头） */}
              {(() => { const [a, b, c, d] = limbLine('armL'); return <line x1={a} y1={b} x2={c} y2={d} stroke="#e7d8a8" strokeWidth="6" strokeLinecap="round" />; })()}
              {(() => { const [a, b, c, d] = limbLine('armR'); return <line x1={a} y1={b} x2={c} y2={d} stroke="#e7d8a8" strokeWidth="6" strokeLinecap="round" />; })()}
              {(() => { const [a, b, c, d] = limbLine('legL'); return <line x1={a} y1={b} x2={c} y2={d} stroke="#e7d8a8" strokeWidth="6" strokeLinecap="round" />; })()}
              {(() => { const [a, b, c, d] = limbLine('legR'); return <line x1={a} y1={b} x2={c} y2={d} stroke="#e7d8a8" strokeWidth="6" strokeLinecap="round" />; })()}
              {/* 身体 / 头（伪立体：先画向右下偏移的深色背板挤出体积，再画亮面 + 高光） */}
              <rect x="54" y="74" width="60" height="110" rx="14" fill="#d9c79a" />
              <rect x="50" y="70" width="60" height="110" rx="14" fill={marks ? marks.bodyFill : '#fdf6e3'} stroke="#e7d8a8" strokeWidth="2" />
              <rect x="50" y="70" width="60" height="110" rx="14" fill="url(#effSheen)" />
              <ellipse cx="66" cy="90" rx="9" ry="15" fill="#fff" opacity="0.30" />
              <circle cx="84" cy="49" r="28" fill="#d9c79a" />
              <circle cx="80" cy="45" r="28" fill={marks ? marks.bodyFill : '#fdf6e3'} stroke="#e7d8a8" strokeWidth="2" />
              <circle cx="80" cy="45" r="28" fill="url(#effSheen)" />
              <circle cx="74" cy="38" r="6" fill="#fff" opacity="0.40" />
              {st.down ? (
                <g stroke="#7f1d1d" strokeWidth="2">
                  <line x1="66" y1="38" x2="74" y2="46" /><line x1="74" y1="38" x2="66" y2="46" />
                  <line x1="86" y1="38" x2="94" y2="46" /><line x1="94" y1="38" x2="86" y2="46" />
                </g>
              ) : (<g><circle cx="71" cy="42" r="3" fill="#b08968" /><circle cx="89" cy="42" r="3" fill="#b08968" /></g>)}
              {mouthShape}
              {target && (<g><rect x="52" y="105" width="56" height="26" rx="6" fill="#fff1f2" stroke="#fda4af" strokeWidth="1.5" />
                <text x="80" y="122" textAnchor="middle" fontSize="13" fill="#e11d48" fontWeight="bold">{target.length > 6 ? target.slice(0, 6) + '…' : target}</text></g>)}
              {/* 骂Ta纸条：纸人身上展示最新的 3 张，错落旋转摆放，随瘫倒一起旋转 */}
              {notes.slice(0, NOTE_MAX_SHOWN).map((nt, i) => (
                <NoteSticker key={i} x={NOTE_SLOTS[i].x} y={NOTE_SLOTS[i].y} rot={NOTE_SLOTS[i].rot} text={nt} idx={i} />
              ))}
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
                onClick={() => doHit(PART_IDS[Math.floor(Math.random() * PART_IDS.length)])} disabled={!target || target === UNKNOWN_TARGET}>
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
          {names.includes(UNKNOWN_TARGET) && (
            <p className="text-[11px] text-slate-400 mt-1">❓未知对象 = 曾用丢失钥匙加密的历史记录，无法显示真名，不能打击</p>
          )}
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
