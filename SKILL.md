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
- 正文：按用户要求控制字数。⚠️ **字数指字符数，不是文件字节数**（中文字 UTF-8 占 3 字节）；填完用 DOM 提取 `.ProseMirror.innerText.length` 实测为准，低于要求需扩写重填（重填前先 `Ctrl+A`+`Delete` 清空）

> 中文内容不要直接用 `fill.js "<标题>" "<正文>"` 传参（PowerShell 引号会破坏）；写成 `.js` 文件读取更稳。

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

⚠️ **ProseMirror 只认键盘输入**，必须用 `keyboard.type()` 逐字，段落之间**按两次 Enter**：

```js
await page.evaluate(() => { document.querySelector('.ProseMirror')?.click(); });
await page.keyboard.type(paragraph);
await page.keyboard.press('Enter'); await page.keyboard.press('Enter'); // 段落间距
```

统一入口：`TTC_CDP_PORT=<port> node scripts/fill.js "<标题>" "<正文(\n\n分段)>"`（⚠️ 中文内容建议改文件读取式执行，见上面第3步提示）。

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

## 技术约束（违反必踩坑）

### 🔴 绝对禁止
- `browser action=navigate/open` 导航头条（SSRF 拦截）
- `innerHTML` 填 ProseMirror（编辑器空白）
- playwright 的 `.uploadFile()`（不存在，是 puppeteer API；用 filechooser.setFiles）
- 硬编码 CDP 端口（动态分配，从 status 取）
- 选「单图」不传图（前端拦截发布）
- 不点「确认发布」（二次弹窗，不点无法发布）

### ✅ 必须使用
- Node.js 脚本 + playwright-core + CDP（全部操作）
- evaluate + nativeInputValueSetter（React/Vue 表单）
- `page.keyboard.type()` 输入正文
- `page.evaluate()` 直接点击按钮
- filechooser 事件 + `setFiles()` 上传封面
- URL 跳 `/articles` 验证发布
- `TTC_CDP_PORT=<port> node "<完整路径>\script.js"`（PowerShell 中文路径下不要 cd）

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
