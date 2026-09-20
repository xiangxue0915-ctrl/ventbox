// 本机房间管理：记录加入过的房间，支持切换与销毁
const LIST_KEY = 'ventbox:room_list';
const CUR_KEY = 'ventbox:room';

// 易读、好口口相传的中文/拼音房间名（替代难记的 6 位乱码）
const ROOM_WORDS = [
  '摸鱼屋', '老板别跑', '周一晨会', '甩锅侠', '背锅王', '画饼厂', '996小屋', '摸鱼基地',
  '团建地狱', '摸鱼大队', '加班狗窝', '甩锅现场', '画饼局', '汇报表演', '摸鱼星球', '摸鱼茶室',
  '离谱老板', '暴躁甲方', '画饼大师', '背锅小队', '带薪摸鱼', '续命咖啡', '摸鱼小组', '吐槽公社',
  '快乐摸鱼', '解压小屋', '暴走职场', '离职边缘', '摸鱼茶馆', '画饼车间', '甩锅联盟', '背锅驿站',
  '摸鱼营地', '续命工位', '吐槽小队', '摸鱼据点', '解压基地', '暴富幻想', '带薪发呆', '摸鱼广场',
  '摸鱼茶馆', '八卦小屋', '怨气回收站', '摸鱼便利店', '老板画饼铺', '背锅互助组', '摸鱼研究院', '吐槽收容所',
];

export function genRoomCode() {
  return ROOM_WORDS[Math.floor(Math.random() * ROOM_WORDS.length)];
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
