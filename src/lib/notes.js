// 骂Ta纸条：按 房间+对象 隔离，仅存本机。
// 数组化（修「只能贴一张 / 覆盖」）：最新在前，最多保留 MAX_NOTES 张。
// 兼容旧版单条字符串格式（读到字符串则包装成 [str]）。
import { get, set } from './storage.js';

const NOTE_KEY = 'effigy.note';
export const MAX_NOTES = 6;

function noteKey(room, target) {
  return `${NOTE_KEY}:${room}:${target}`;
}

export function getNotes(room, target) {
  const raw = get(noteKey(room, target), []);
  if (Array.isArray(raw)) return raw.filter((x) => typeof x === 'string' && x.length);
  if (typeof raw === 'string' && raw.length) return [raw]; // 旧格式兼容
  return [];
}

// 追加一张纸条；与已有条目完全相同则不重复添加。返回最新数组（最多 MAX_NOTES 张）。
export function addNote(room, target, text) {
  const t = String(text || '').trim();
  if (!t) return getNotes(room, target);
  const cur = getNotes(room, target);
  if (cur.includes(t)) return cur; // 去重：相同则不重复添加
  const next = [t, ...cur].slice(0, MAX_NOTES);
  set(noteKey(room, target), next);
  return next;
}

export function clearNotes(room, target) {
  set(noteKey(room, target), []);
}
