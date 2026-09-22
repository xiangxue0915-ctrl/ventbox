# 更新日志 · VentBox

本项目遵循语义化版本（MAJOR.MINOR.PATCH）。日期为约略记录。

## [1.3.3] — 2026-09-22 · QA 独立复查修复
- **问题2 补全（关键）**：1.3.2 中 `App.jsx` 的 `freshStart` 与 `RoomBar.jsx` 的 `inviteLink` 仅被 JSX/onClick 引用却**从未声明**，导致首屏 `ReferenceError` 白屏、点击「复制链接」报错。本次补上 `freshStart` 状态（静默新建随机房时置位，经 `?room=` 进入不弹提示）与 `inviteLink` 异步 state（经 `crypto.js` 的 `ensureRoomKeyB64()` 生成 `?room=xxx#k=yyy` 邀请链接，hash 在 query 之后）。
- **问题5 防回归**：移除 `HitEffigy.jsx` 中 `refresh()`「本地乐观计数无条件向下对齐云端」的逻辑。该逻辑在快速连打时若遇到落后的云端快照（网络往返 / 并发 refresh），会把 `localHits` 重置为落后值，与 `Math.max(云端, 本机)` 叠加后造成永久「连打计数滞后」；删掉后仍由 `max` 保证计数不落后。另将 `doHit` 的乐观更新改为函数式，避免同一 tick 连点丢计数。

## [1.3.2] — 2026-09-22 · 线上 5 项 Bug 修复
- **问题1｜通缉墙/打击榜满屏 `enc:xxxx`**：`HitEffigy.jsx` 首屏 `load()` 之前不解密，导致按密文分组、每条各 1 下。新增 `fetchDecryptedRows()` 统一供 `load()` 与 `refresh()` 解密；无法解密的历史密文（仍为 `enc:` 前缀）全部归并为常量 `UNKNOWN_TARGET = '❓未知对象'` 一条，自动选中优先非「未知」对象，且对伪对象禁止打击。
- **问题1/2｜邀请链接不带房间钥匙**：`RoomBar.jsx` 的 `inviteLink` 改为异步 state，`useEffect([room])` 内通过 `crypto.js` 新增的 `ensureRoomKeyB64()` 取得钥匙，链接格式升级为 `?room=xxx#k=yyy`（hash 在 query 之后）。同事点链接即可拿到钥匙、能解密也能被正确解密；微信清 localStorage 后凭链接可恢复房间。
- **问题2｜房间忽然消失**：`App.jsx` 初始化时若「非 URL 进房 且 无当前房间 且 列表为空」判定为 `freshStart`，页面顶部显示可关闭提示条引导用邀请链接回到原房间（房间仍静默新建，不白屏）。
- **问题5｜连打计数滞后**：`infoFor()` 的 total 改为 `Math.max(服务器聚合, 本机乐观计数)`，连打即时 +1；`refresh()` 成功后对齐本地计数（云端被清过时以云端为准，避免虚高永久驻留）。
- **问题3/4｜纸条只能贴一张 / 太小 / 不可爱**：纸条存储由单条字符串改为 JSON 数组（最新在前，最多 6 张，兼容旧字符串），新增 `src/lib/notes.js` 的 `getNotes/addNote/clearNotes` 供 `HitEffigy.jsx` 与 `App.jsx` 共用（同内容去重）；贴纸条改为追加并提示「已贴上第 N 张」。纸人身上展示最新 3 张，错落旋转摆放，便签加大到 64×42、字号 8.5px；SVG 与 canvas（含战果图）统一粉/薄荷/奶油黄轮换、和纸胶带 + 📌图钉 + 圆角旋转的可爱样式。`clearCurrent`/`clearAll` 同步清空纸条数组。

## [1.3.1] — 2026-09-21 · 工程规范化
- 新增 `README.md` / `LICENSE` / `CHANGELOG.md`
- 项目整体迁移至 `D:\99-AI-application\ventbox`

## [1.3.0] — 2026-09-21 · 安全与体验加固
- **安全**：Edge Function `ai-companion` 的 CORS 收紧为来源白名单
- **SEO/分享**：`index.html` 补 `description` / Open Graph / `theme-color` / **CSP**；新增 `robots.txt` 与 OG 封面
- **隐私**：AI key 由 `localStorage` 迁移到 `sessionStorage`（关闭标签页即失效）
- **性能**：App 路由级代码分割（`React.lazy` + `Suspense`）
- **无障碍**：图标按钮补 `aria-label`，提示条补 `role=status`
- **新功能**：首次访问的 3 步新人引导弹窗（`Onboarding.jsx`）

## [1.2.0] — 2026-09-20 · 隐私加固 & AI 解压搭子
- 房间号两段式（友好名 + 6 位随机后缀），不可枚举
- 客户端加密：房间内容 AES‑GCM；私密树洞 PBKDF2(12 万次) + AES‑GCM
- AI 解压搭子：Supabase Edge Function 中转；共享免费池 + 用户自带 key（BYOK）
- AI 人格调优：先站队跟着骂，不给建议、不说教

## [1.1.0] — 2026-09-18 · 多人房间 & 打小人重做
- 接入 Supabase：多人吐槽实时同步、打小人命中上云、房间码分享
- 打小人重写：点哪打哪（头/脸/肚子/屁股/膝盖/脚），命中肢体摆动 + 音效
- 房间管理 `RoomBar` + 本机房间列表 `rooms.js`

## [1.0.0] — 2026-09-17 · 初版
- 5 大模块：👊 打小人 / 🌳 私密树洞 / 💬 多人吐槽 / 🏆 排名 / 🎭 我的马甲
- Vite + React 18 + Tailwind，纯前端 + localStorage 持久化
