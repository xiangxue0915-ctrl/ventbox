# 贡献指南 · CONTRIBUTING

本项目为内部使用的前端应用。欢迎内部同学改进；请遵循以下约定。

## 一、开发环境
- Node.js 18+（CI 用 Node 20）。
- 常用命令：
  ```bash
  npm install     # 安装依赖
  npm run dev     # 本地开发 http://localhost:5173
  npm run build   # 生产构建（提交前必须通过）
  npm run preview # 预览构建产物
  ```

## 二、目录约定
- 组件放 `src/components/`，工具放 `src/lib/`。
- 新增功能优先做成独立 Tab 组件，并在 `src/App.jsx` 的 `TABS` 与渲染处注册（重组件建议 `React.lazy`）。
- 复用 `src/index.css` 里的 `.card / .btn-primary / .btn-ghost / .input` 组件类，保持视觉统一。

## 三、代码风格
- React 18 函数组件 + Hooks；不用 react-router（保持 Tab 状态切换）。
- 2 空格缩进，单引号，语句末尾分号。
- 文案用中文；用户可见的文案要口语、友好。
- 不引入非必要重依赖（会增大包体、拖慢 CI）。

## 四、提交信息
建议格式：`type: 简述`
- `feat:` 新功能
- `fix:` 修复
- `security:` 安全相关
- `docs:` 文档
- `chore:` 杂项

示例：`feat: 新增新人 3 步引导弹窗`

## 五、隐私 / 安全红线（务必遵守）
- **不得**将用户树洞 / 房间明文上传或打点。
- **不得**在代码里硬编码任何密钥（service_role、个人 API key 等）。
- 前端可公开的仅 `SUPABASE_URL` 与 publishable/anon key；权限靠 RLS。
- 新增网络请求目标时，同步更新 Edge Function 的 `ALLOWED_ORIGINS` 与 `index.html` 的 CSP。

## 六、发布流程
1. 本地 `npm run build` 通过。
2. `git push` 若被墙，使用 `dev/_push.cjs`（GitHub REST API 推送）：
   - 把改动文件加入其 `FILES` 数组；
   - 运行 `node dev/_push.cjs`，看到 `PUSHED_OK`。
3. 推送 `main` 后 GitHub Actions 自动构建并发布到 Pages。
4. 改了 Edge Function 需到 Supabase **手动重贴 + Deploy**。

## 七、提交前自测
- 参照 `docs/TESTING.md` 手动过一遍关键路径。
- 确认浏览器 Console 无报错（含无 CSP 拦截）。
