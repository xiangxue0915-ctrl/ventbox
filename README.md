# 吐槽解压箱 · VentBox

> 一个**纯前端、全程匿名**的同事间解压小工具：打小人、私密树洞、多人匿名吐槽、AI 解压搭子。
> 打开网页即用，不用注册登录；树洞与聊天内容**只存本机 / 会话**，服务器永远看不到。

**在线体验：** https://xiangxue0915-ctrl.github.io/ventbox/

---

## ✨ 功能

| 模块 | 说明 |
|---|---|
| 👊 打小人 | 点哪打哪，给对象贴个名字出气，记录命中部位与排名 |
| 🌳 私密树洞 | 本机 PIN 加密（PBKDF2 + AES‑GCM），只有你自己能看 |
| 💬 多人吐槽 | 与同房间的人匿名互吐，公共广场全员可见 |
| 🏆 排名 | 聚合各房间的吐槽对象 / 命中次数 |
| 🎭 我的马甲 | 一键切换匿名身份（名字 + 头像 + emoji） |
| 🤖 AI 解压搭子 | 陪你一起吐槽的 AI，支持共享免费池与自带 key（BYOK） |
| 🧭 新人引导 | 首次访问弹出 3 步引导（只看一次） |

## 🧱 技术栈

- **前端**：Vite 5 + React 18 + Tailwind CSS 3（纯静态 SPA，无后端框架）
- **客户端加密**：Web Crypto API（PBKDF2 12 万次 + AES‑GCM 256）
- **后端即服务**：Supabase（Postgres + Realtime + Edge Functions）
- **AI 中转**：Supabase Edge Function `ai-companion`（Deno / TypeScript）
- **部署**：GitHub Actions → GitHub Pages

## 🚀 快速开始

```bash
npm install      # 安装依赖
npm run dev      # 本地开发（默认 http://localhost:5173）
npm run build    # 生产构建，产物在 dist/
npm run preview  # 本地预览构建产物
```

> 依赖：Node.js 18+（CI 使用 Node 20）。

## 📁 目录结构

```
tucao-app/
├─ index.html                 # 入口（含 SEO / OG / CSP）
├─ package.json
├─ vite.config.js             # base: './'（适配 GitHub Pages 子路径）
├─ tailwind.config.js
├─ postcss.config.js
├─ .github/workflows/deploy.yml   # push main 自动构建并部署到 Pages
├─ public/                    # 原样拷贝到 dist 根（robots.txt / og-cover.svg）
├─ src/
│  ├─ App.jsx                 # 外壳：顶栏 + 侧/底导航 + 路由级懒加载
│  ├─ main.jsx
│  ├─ index.css
│  ├─ components/             # 各功能模块
│  │  ├─ HitEffigy.jsx        # 打小人
│  │  ├─ TreeHole.jsx         # 私密树洞（本机加密）
│  │  ├─ PublicBoard.jsx      # 多人吐槽
│  │  ├─ Ranking.jsx          # 排名
│  │  ├─ AnonymousPanel.jsx   # 我的马甲
│  │  ├─ RoomBar.jsx          # 房间胶囊
│  │  ├─ AiCompanion.jsx      # AI 解压搭子
│  │  └─ Onboarding.jsx       # 新人引导
│  └─ lib/
│     ├─ supabase.js          # Supabase 客户端（URL + publishable key）
│     ├─ crypto.js            # 房间内容 AES‑GCM 加解密
│     ├─ rooms.js             # 本机房间列表（两段式房间号）
│     ├─ anon.js              # 匿名身份生成
│     └─ storage.js           # localStorage 封装
└─ dev/_push.cjs              # 通过 GitHub REST API 推送（本地工具，不入库）
```

## 🛰 部署

- 推送到 `main` 后，GitHub Actions 自动 `npm ci && npm run build`，并把 `dist/` 发布到 GitHub Pages。
- Supabase 侧需手动完成一次：① SQL Editor 跑 RLS 脚本；② Edge Functions 新建 `ai-companion` 并粘贴代码 + 配置密钥。详见本机 `docs/DEPLOY.md`。
- `vite.config.js` 的 `base: './'` 为 Pages 子路径适配，勿删。

## 🔒 隐私与安全（三层）

1. **房间号两段式**：友好名 + 6 位随机后缀，不可枚举，房间号即访问令牌。
2. **客户端加密**：树洞本机 PIN 加密；房间内帖子 / 对象名 AES‑GCM 加密后入库，数据库仅存密文。
3. **RLS 默认拒绝**：匿名仅可读写房间数据；AI 额度表对匿名不可见。

- AI 聊天**不落库**（仅当前页面会话）；用户 key 仅存 `sessionStorage`，关闭标签页即失效。
- AI 中转函数已启用 **CORS 白名单**，仅允许本站来源调用。

## 📄 许可

内部专有软件，仅限内部使用。详见 [LICENSE](./LICENSE)。
