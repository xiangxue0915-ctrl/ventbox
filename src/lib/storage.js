// 轻量 localStorage 封装
// 所有键统一加前缀，避免与其它应用冲突；读写自动 JSON 序列化。

const PREFIX = 'ventbox:';

/**
 * 读取存储的值，自动 JSON.parse。
 * @param {string} key
 * @param {*} defaultValue 不存在时返回的默认值
 * @returns {*}
 */
export function get(key, defaultValue = null) {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (raw === null || raw === undefined) return defaultValue;
    return JSON.parse(raw);
  } catch (e) {
    return defaultValue;
  }
}

/**
 * 写入存储的值，自动 JSON.stringify。
 * @param {string} key
 * @param {*} value
 */
export function set(key, value) {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch (e) {
    // 忽略隐私模式 / 配额超限等异常
  }
}

/**
 * 删除指定键。
 * @param {string} key
 */
export function remove(key) {
  try {
    window.localStorage.removeItem(PREFIX + key);
  } catch (e) {
    // ignore
  }
}

/**
 * 清空本应用写入的所有数据。
 */
export function clearAll() {
  try {
    const keys = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(PREFIX)) keys.push(k);
    }
    keys.forEach((k) => window.localStorage.removeItem(k));
  } catch (e) {
    // ignore
  }
}
