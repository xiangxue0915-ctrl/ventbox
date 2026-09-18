// 本机房间管理：记录加入过的房间，支持切换与销毁
const LIST_KEY = 'ventbox:room_list';
const CUR_KEY = 'ventbox:room';

export function genRoomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export function getRoomList() {
  try {
    const raw = window.localStorage.getItem(LIST_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveRoomList(list) {
  try {
    window.localStorage.setItem(LIST_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
}

// 加入/新建房间：写入列表（去重），并置为当前
export function addRoom(code) {
  const c = String(code).toUpperCase();
  const list = getRoomList().filter((r) => r !== c);
  list.unshift(c);
  saveRoomList(list.slice(0, 30));
  setCurrentRoom(c);
  return c;
}

// 从列表移除（销毁）：若销毁的是当前房间，切到列表里下一个
export function removeRoom(code) {
  const c = String(code).toUpperCase();
  const list = getRoomList().filter((r) => r !== c);
  saveRoomList(list);
  if (getCurrentRoom() === c) setCurrentRoom(list[0] || '');
  return list;
}

export function getCurrentRoom() {
  try {
    return window.localStorage.getItem(CUR_KEY) || '';
  } catch {
    return '';
  }
}

export function setCurrentRoom(code) {
  try {
    window.localStorage.setItem(CUR_KEY, code || '');
  } catch {
    // ignore
  }
}
