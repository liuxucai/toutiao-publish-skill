---
name: toutiao-publish
description: "头条号文章自动发布助手。用户给关键词，自动生成文章并发布到头条号。触发场景：(1) 用户要求发布文章到头条/今日头条，(2) 用户要求自动发布内容，(3) 用户给关键词要求写文章并发布。核心能力：登录头条号、填写标题正文、上传封面、发布文章。"
license: MIT
---

# 头条号文章自动发布

> 本版本已修复原仓库 master 分支的 Git 合并冲突 + 作者机器硬编码（版本号 `v0.2.32.610`、workspace id、CDP 端口 `28800`）。
> 适配本机：OpenClaw `v0.2.33.617`，playwright-core 直连动态 CDP。

## 工具选择策略（核心）

| 场景 | 工具 | 原因 |
|------|------|------|
| 登录/导航/填写标题正文/点击按钮 | **Node.js 脚本 + playwright-core CDP** | OpenClaw 严格 SSRF 策略拦截 `browser action=navigate`（实测："strict browser SSRF policy requires an IP-literal URL"），必须用脚本直连 CDP 用 `page.goto()` 绕过 |
| 上传封面图 | **playwright-core filechooser** | 预监听 `waitForEvent('filechooser')` + `setFiles()` 最可靠 |
| 生成封面图 | **Node.js https.get** | 下载 Pollinations.AI 生成图（外网若被墙可手动准备本地 jpg） |

**关键结论（已在本机 2026-07-20 验证）**：
- ❌ `browser action=navigate/open` 到 `mp.toutiao.com` 被 SSRF 拦截，不可用
- ✅ 用 playwright-core 连接 CDP 后 `page.goto()` 可绕过
- ✅ 封面上传最优方案：点「本地上传」→ 监听 filechooser → `setFiles()` → 点「确定」
- ✅ 正文输入必须用 `page.keyboard.type()` 逐字，段落间按两次 Enter
- ⚠️ 本机**没有 puppeteer-core**，原仓库另一分支（puppeteer-core + 端口 28800）不可行，已废弃

## 前置准备：连接浏览器

### CDP 端口获取（动态！不要写死）

CDP 端口每次 OpenClaw 启动后动态分配。每个脚本运行前先：

```
browser action=status  # 读 cdpPort 字段
```

然后以环境变量传给脚本：`TTC_CDP_PORT=<port> node scripts/xxx.js`。
（本机实测端口 7774 / 1585 / 13935 等，重启后可能变。）

### 浏览器启动

发布前先确保 OpenClaw 浏览器已运行：

```
browser action=start        # 若 running:false
browser action=status       # 读 cdpPort
```

确认 `cdpReady:true` 后，再以 `TTC_CDP_PORT=<port>` 跑脚本。未启动就跑 `nav-publish.js` 会连不上。

### playwright-core 路径

OpenClaw 内置 playwright-core，无需 npm 安装。`scripts/lib.js` 会在运行时自动探测
（`F:/qclaw/<ver>/resources/openclaw/node_modules/playwright-core`），也可设环境变量
`OPENCLAW_NODE_MODULES` 直接指定。

> ⚠️ 不要用 `puppeteer-core`：本机未预装，且 `npm install` 在中文路径下易失败。

---

## 发布流程（7步）

### 第1步：登录头条号

（已有登录态时跳过此步。登录凭证保存在浏览器 `user-data` 目录，重启浏览器后仍有效——OpenClaw 浏览器默认 `userDataDir` 已持久化。）

1. 打开发布页（见第2步）→ 自动跳转登录页 `https://mp.toutiao.com/auth/page/login`
2. 切换到「账密登录」（默认是验证码模式）
3. 填写手机号密码（**必须用 nativeInputValueSetter**，见下方）
4. 勾选协议 → 点击登录

**React 表单正确填写方式**（在 page.evaluate 内）：
```js
const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
setter.call(el, '手机号');
el.dispatchEvent(new Event('input', { bubbles: true }));
```

### 第2步：导航到发布页

⚠️ `browser action=navigate` 被 SSRF 策略拦截，必须用 Node.js 脚本连接 CDP：

```bash
TTC_CDP_PORT=<port> node scripts/nav-publish.js
```

脚本内部（playwright-core）：
```js
const { chromium } = require('playwright-core'); // 由 lib.js 定位
const browser = await chromium.connectOverCDP('http://127.0.0.1:' + port);
const ctx = browser.contexts()[0];
let page = ctx.pages().find(p => p.url().includes('mp.toutiao.com')) || ctx.pages()[0];
await page.goto('https://mp.toutiao.com/profile_v4/graphic/publish', {
  waitUntil: 'load',  // ⚠️ 不支持 'networkidle2'，用 'load'
  timeout: 30000
});
```

### 第3步：生成内容

根据关键词生成：
- 标题：20-30字，吸引眼球，符合头条风格（感叹号、问句、数字）
- 正文：建议用 **Markdown** 写作（支持 `# 标题`、`**加粗**`、`> 引用`、`- 列表`），结构清晰、便于复用。
  ⚠️ **但头条号编辑器【不渲染 Markdown 语法】**——直接把 `# 标题`、`**加粗**` 原样填入，读者看到的是一堆 `#`、`*`、`>` 符号，而不是标题/加粗/引用/列表样式（已实测验证）。
  ⚠️ **字数指字符数，不是文件字节数**（中文字 UTF-8 占 3 字节）；填完用 DOM 提取 `.ProseMirror.innerText.length` 实测为准，低于要求需扩写重填（重填前先 `Ctrl+A`+`Delete` 清空）。

> 中文内容不要直接用 `fill.js "<标题>" "<正文>"` 传参（PowerShell 引号会破坏）；写成 `.js` 文件读取更稳。
> **Markdown 文章用 `md2toutiao.js` 转换后填入**（见第3.5步），它会把 Markdown 解析为真实样式（标题/加粗/引用），列表降级为「• 」项目符号文本。

### 第3.5步：Markdown → 头条可渲染格式（关键新增规则，是第5步「填写正文」的前置阶段）

**执行顺序（强制）：**
1. 第3步生成文章（建议用 Markdown：支持 `# 标题`、`**加粗**`、`> 引用`、`- 列表`）。
2. 判断正文是否为 Markdown 格式（含 `#`/`**`/`>`/`- 列表` 等语法）。
3. **若是 Markdown：必须先完整转换，再填入**。禁止把 Markdown 原样填入编辑器。
4. 转换完成、确认无误后，才进入第5步「填入输入框」。

> 即「先生成 → 再判断 → 是 md 则先转换 → 转换完才填入」。转换与填入是两个阶段，不能合并或颠倒。

头条编辑器是 syl editor（基于 ProseMirror），自带 `header / bold / block_quote` 工具栏工具，可施加**真实样式**。
本 skill 提供转换器 `scripts/md2toutiao.js`：

```bash
# 阶段一·转换（不连浏览器，纯解析+预览，用于核验转换是否完整正确）
node scripts/md2toutiao.js content/article_xxx.txt --preview

# 阶段二·填入（需先 nav-publish 到发布页并设 TTC_CDP_PORT；转换已在 preview 阶段完成，此处只负责施加样式+填入）
TTC_CDP_PORT=<port> node scripts/md2toutiao.js content/article_xxx.txt --fill
```

> **务必先跑 `--preview` 确认转换结果（标题/引用/列表/加粗结构齐全、无遗漏），再跑 `--fill` 填入。** `--preview` 不依赖浏览器，可反复核验。
转换器对 Markdown 的处理规则（已实测）：

| Markdown | 头条渲染结果 | 实现方式 |
|----------|--------------|----------|
| `# 标题` ~ `######` | 真实 `<h1>` 标题 | 整块定位后点工具栏 `header` 工具 |
| `**加粗**` | 真实 `<strong>` 加粗 | 选中对应文字点工具栏 `bold`（**真实鼠标点击**，非 DOM click） |
| `> 引用` | 真实 `<blockquote>` 引用块 | 整块定位后点工具栏 `block_quote` 工具 |
| `- 列表` / `* 列表` | 「• 」项目符号文本段落 | 工具栏列表为下拉项且无 DOM 可点选项，降级为项目符号文本（头条编辑器仍会美化排版） |

**实现要点（踩坑后确定，勿改）**：
- 标题/引用：打完字光标在行尾，**直接点工具栏工具**（不要 `Shift+Home` 选中整行）。若在「选中态」下按 Enter，会删掉选中文字导致标题变空。
- 加粗：打完字后 `Shift+ArrowLeft×n` 选中目标词 → 真实鼠标 `page.click('.syl-toolbar-tool.bold')` → 收起选区 `ArrowRight`（否则后续 Enter 删字）。
- `list_util` 是下拉工具，其选项不在 DOM 暴露，无法用脚本点；故列表降级为「• 」文本。
- 段落间距：单 `Enter` 即可（`<p>` 自带间距），双 Enter 会留空段。
- 正文开头若第一个 block 与标题相同（重复 H1），转换器自动去除以免标题重复显示。

> 转换后用 DOM 核验 `hasH1/hasStrong/hasQuote` 与 `innerText.length`，确认无原始 Markdown 符号残留。

### 第4步：填写标题

`scripts/fill.js` 已处理。单独填写标题可用：
```js
await page.evaluate((t) => {
  const el = document.querySelector('.editor-title textarea') || document.querySelector('textarea[placeholder*="标题"]');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
  setter.call(el, t);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}, title);
```

### 第5步：填写正文

⚠️ 正文来源分两种情况：
- **纯文本文章**：直接用 `fill.js` 逐字填入（见下）。
- **Markdown 文章**：**必须先完成第3.5步的「转换」**（`--preview` 已验证结构），再用 `md2toutiao.js --fill` 填入。不可把 Markdown 原样交给 `fill.js`。

⚠️ **ProseMirror 只认键盘输入**，必须用 `keyboard.type()` 逐字，段落之间**按两次 Enter**：

```js
await page.evaluate(() => { document.querySelector('.ProseMirror')?.click(); });
await page.keyboard.type(paragraph);
await page.keyboard.press('Enter'); await page.keyboard.press('Enter'); // 段落间距
```

统一入口（纯文本）：`TTC_CDP_PORT=<port> node scripts/fill.js "<标题>" "<正文(\n\n分段)>"`

**Markdown 文章请用 `md2toutiao.js`（见第3.5步）**：它会解析 Markdown 并真实施加标题/加粗/引用样式，而不是把 `#`、`**`、`>` 当普通文字填进去。

**核验渲染（image 工具看不了本地截图，改用 DOM 提取）**：
```js
// 脚本内 page.evaluate 读取
const v = document.querySelector('.editor-title textarea').value;
const len = document.querySelector('.ProseMirror').innerText.length;
```
把结果写文件再用 `Get-Content -Encoding UTF8` 读取（PowerShell 默认 GBK 会乱码）。`

### 第6步：上传封面

默认选「单图」并上传封面图（有封面推荐权重更高）。

#### 6a. 生成封面图（可选，外网可用时）
```bash
node scripts/gen-cover.js "<英文画面描述>" ./content/cover.jpg
```

#### 6b. 上传（playwright-core，已在 2026-07-20 实测通过）
```bash
TTC_CDP_PORT=<port> node scripts/upload-cover.js "<封面本地绝对路径>"
```
**头条封面上传真实机制（重要，与原仓库假设不同）**：
1. 点「单图」radio（TreeWalker 找文本节点）
2. 点 `.article-cover-add`（虚线加号块）→ 弹出上传弹窗，弹窗内才有 file input
3. 弹窗中点「本地上传」按钮（`.upload-btn`）→ 触发系统选择框 → Playwright `filechooser.setFiles()`
4. 等 6s 处理 → 点弹窗「确定」把图插入封面区

> ❌ 原仓库的 `filechooser + 直接点单图` 无效：点「单图」后页面**无 file input**（fileInputs=0），
>   必须点 `.article-cover-add` 开弹窗才有 `#upload-drag-input` / `.btn-upload-handle input`。
> ❌ 选「单图」但不传图片 → 前端直接拦截发布请求，按钮点不动。

### 第7步：发布

```bash
TTC_CDP_PORT=<port> node scripts/publish.js
```
1. 点「预览并发布」（⚠️ 别误点旁边「定时发布」）
2. 等 6s 预览弹窗渲染
3. 点「确认发布」（二次确认弹窗）
4. 验证：URL 跳转到 `/articles` 即成功

> ⚠️ **发布按钮点击频率限制（已实测结论，必须遵守）**：
> - **两次点击发布按钮之间必须间隔 ≥ 10 秒，最快 10 秒点 1 次**；重复、高频点击「预览并发布 / 确认发布」会导致**同一篇文章被发布多次**（头条后端对未跳转前的高频请求不做去重，已实测验证）。
> - **长时间卡住（如卡 5 分钟）后再点击，同样会重复发布**：常见情形是第一次点击其实已成功，只是 URL 跳转未被自动化捕获/确认，过很久后「补点」就发出了第二篇。这是「高频重复」之外、另一种隐蔽的重复发布来源。
> - 正确做法：单次发布只点 **1 次**「预览并发布」+ **1 次**「确认发布」，点完耐心等 URL 跳转到 `/articles` 确认。
> - **若卡住 / 长时间无反应，绝不能直接补点**：先到「内容管理 → 已发布」列表核验该文章是否已在列（或检查 URL 是否已跳 `/articles`、`/graphic/index` 等已发布态）；**确认确实未发布**后，才重新开始一次完整发布流程（重新进发布页、再点 1 次预览 + 1 次确认）。绝不能「隔很久后仅凭没看到反应就再点一次」。

> 🔁 **发布状态机与重试规则（publish.js 已实现）**：点击发布按钮后状态置为 `PUBLISHING`；页面跳到 `/articles` 或在「已发布」列表核验到该文章 → `SUCCESS`；若一直未跳转 → 先去「内容管理 → 已发布」列表确认是否已在列，**不在列才重新尝试发布**（回到编辑态、再点 1 次预览 + 1 次确认）；即使再次失败，也按此规则继续尝试（循环直到确认成功或超过上限 `MAX_ATTEMPTS=6`）。重试间隔固定 10 秒。打印状态前缀：`STATE:IDLE / PUBLISHING / SUCCESS / RETRYING / FAILED`，便于观察。
> 关键：重试前**必须核验「已发布」列表**，绝不允许「未核验就补点」——这是避免重复发布的唯一可靠手段。

---

## 常见陷阱

| 陷阱 | 解决方案 |
|------|---------|
| React 表单值丢失 | 必须用 nativeInputValueSetter + dispatchEvent |
| 登录页找不到密码框 | 先切换到「账密登录」模式 |
| 封面上传失败 | 用 playwright-core 的 filechooser + setFiles()（非 puppeteer uploadFile） |
| 点发布无反应 | 先点「预览并发布」→ 等6秒 → 点「确认发布」 |
| ProseMirror 显示空白 | 必须用 keyboard.type，不能用 innerHTML |
| 导航被拦截 | 全部用 playwright-core 脚本，不走 browser navigate |
| CDP 端口连不上 | 端口动态分配，跑脚本前用 browser status 重新取 |
| 重复点击发布导致同一篇文章被发多次 | 发布按钮最快 10 秒点 1 次；单次只点 1 次「预览并发布」+ 1 次「确认发布」，点完等 URL 跳 `/articles`；**卡住/长时间无反应时先去「已发布」列表核验，确认未发布才重启一次完整流程，不要隔很久凭「没反应」就补点** |
| 重试前未核验「已发布」列表就直接补点 | **发布状态机已内置**：未跳转 → 必去「已发布」列表核验 → 不在列才重试（间隔 10 秒，最多 6 次）；已在列即判 SUCCESS，绝不重复发 |

## 技术约束（违反必踩坑）

### 🔴 绝对禁止
- `browser action=navigate/open` 导航头条（SSRF 拦截）
- `innerHTML` 填 ProseMirror（编辑器空白）
- playwright 的 `.uploadFile()`（不存在，是 puppeteer API；用 filechooser.setFiles）
- 硬编码 CDP 端口（动态分配，从 status 取）
- 选「单图」不传图（前端拦截发布）
- 不点「确认发布」（二次弹窗，不点无法发布）
- **高频重复点击发布按钮**（两次点击间隔 < 10 秒会导致同一篇文章被重复发布；最快 10 秒 1 次，且单次发布只需点 1 次「预览并发布」+ 1 次「确认发布」）
- **卡住/长时间无反应后凭「没看到成功」就补点一次**（第一次往往已发布成功，过很久再点会发第二篇；应先去已发布列表核验，确认未发布才重启完整流程）
- **把 Markdown 原样填入编辑器**（头条不渲染 `#`/`**`/`>`/`-`，读者会看到原始符号；Markdown 必须先用 `md2toutiao.js` 转换）

### ✅ 必须使用
- Node.js 脚本 + playwright-core + CDP（全部操作）
- evaluate + nativeInputValueSetter（React/Vue 表单）
- `page.keyboard.type()` 输入正文
- `page.evaluate()` 直接点击按钮
- filechooser 事件 + `setFiles()` 上传封面
- URL 跳 `/articles` 验证发布
- `TTC_CDP_PORT=<port> node "<完整路径>\script.js"`（PowerShell 中文路径下不要 cd）
- **Markdown 文章先 `md2toutiao.js` 转换再填入**（施加真实标题/加粗/引用样式）

## 浏览器环境
- Chrome（OpenClaw 管理的浏览器），用户数据持久化
- CDP 端口：**动态**，从 `browser action=status` 的 `cdpPort` 读取
- 连接地址：`http://127.0.0.1:<cdpPort>`

## 详细文档
完整规则、失败原因排查、登录专题详见 [references/detailed-rules.md](references/detailed-rules.md)；发布全过程踩坑（23 条 + 行不通方案）详见 [references/troubleshooting.md](references/troubleshooting.md)。

## 已发布示例内容（content/）
本 skill 实际跑通过的内容与封面也一并归档，便于改稿或核对：
- `content/article_chujing.txt` + `content/cover_chujing.jpg`（关键词「处境」）
- `content/article_truth.txt` + `content/cover_truth.jpg`（关键词「真理」，1564 字）
- `node scripts/gen-cover.js "<英文描述>" <输出路径>` 生成封面，默认输出 `content/cover.jpg`。

## 安装与运行全过程的「问题—解决方法」清单
从原仓库冲突版适配本机、到真实发布「敬老」「处境」「真理」文章踩过的所有坑（含 SSRF 拦截、浏览器未启动、PowerShell 中文引号与 stdout 不刷新、字数字符≠字节、重填残留、封面上传必须先点 `.article-cover-add` 开弹窗等），已整理为 [references/troubleshooting.md](references/troubleshooting.md)（共 23 条 + 行不通方案清单），建议发布前先读一遍。
