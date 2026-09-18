// 匿名身份生成工具
// 生成形如「匿名·迷路小恐龙」的随机昵称 + emoji 头像

const ADJECTIVES = [
  '迷路', '暴躁', '摸鱼', '咸鱼', '快乐', '迷糊', '佛系', '干饭', '社恐', '熬夜',
  '躺平', 'emo', '元气', '社牛', '隐形', '柠檬', '勇敢', '摆烂',
];

const ANIMALS = [
  '小恐龙', '小猫咪', '水豚', '柴犬', '柯基', '企鹅', '树懒', '仓鼠', '刺猬', '海豚',
  '章鱼', '熊猫', '兔兔', '狐狸', '羊驼', '小鸭子',
];

const EMOJIS = [
  '🦕', '🐱', '🦫', '🐕', '🐶', '🐧', '🦥', '🐹', '🦔', '🐬',
  '🐙', '🐼', '🐰', '🦊', '🦙', '🦆',
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * 随机生成一个匿名身份。
 * @returns {{name: string, emoji: string, key: string}}
 */
export function randomAnon() {
  const idx = Math.floor(Math.random() * ANIMALS.length);
  const adjective = pick(ADJECTIVES);
  const animal = ANIMALS[idx];
  const emoji = EMOJIS[idx];
  const name = `匿名·${adjective}${animal}`;
  const key = `${name}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  return { name, emoji, key };
}
