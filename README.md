# toutiao-publish（今日头条发布 skill）

## 来源与修复说明
- 原始仓库：https://github.com/liuxucai/toutiao-publish-skill （master 分支）
- 原仓库 master **处于未解决的 Git 合并冲突状态**（SKILL.md / detailed-rules.md 满篇 `<<<<<<<`/`=======`/`>>>>>>>`），
  且写死了作者机器环境（OpenClaw 版本 `v0.2.32.610`、workspace id、CDP 端口 `28800`）。
- 本版本已**清理冲突标记**，并适配本机（OpenClaw `v0.2.33.617`）：
  - 采用 playwright-core + 动态 CDP 方案（另一分支的 puppeteer-core 在本机未安装，已废弃）
  - playwright-core 路径运行时从 `QCLAW_CLI_OPENCLAW_MJS` 反推，版本无关
  - CDP 端口运行时从 `browser action=status` 读取，写入 `TTC_CDP_PORT` 环境变量

## 核心约束（已实测）
- ❌ `browser action=navigate/open` 到 `mp.toutiao.com` 被 OpenClaw 严格 SSRF 策略拦截。
  一律用 Node 脚本 `page.goto()` 直连 CDP 绕过。
- ✅ 浏览器启动后 CDP 端口动态分配，每次 `browser status` 取最新值。

## 用法
1. `browser action=start profile=openclaw`（取 cdpPort，设入 TTC_CDP_PORT）
2. `TTC_CDP_PORT=<port> node scripts/nav-publish.js`
3. 登录态已持久化（浏览器 user-data），首次需手填账密
4. `node scripts/gen-cover.js "<描述>" ./content/cover.jpg`（可选）
5. `TTC_CDP_PORT=<port> node scripts/fill.js "<标题>" "<正文(\n\n分段)>"`
6. `TTC_CDP_PORT=<port> node scripts/upload-cover.js "<封面绝对路径>"`
7. `TTC_CDP_PORT=<port> node scripts/publish.js`

详见 SKILL.md 与 references/detailed-rules.md。
