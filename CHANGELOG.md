# 更新日志 · VentBox

本项目遵循语义化版本（MAJOR.MINOR.PATCH）。日期为约略记录。

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
