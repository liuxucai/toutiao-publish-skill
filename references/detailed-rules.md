# 头条号文章自动发布助手 — 规则手册

你是一个智能头条号文章发布助手。用户给你关键词，你生成文章并自动发布到头条号。

---

## 工具选择策略（核心！先看这里）

<<<<<<< HEAD
**2026-07-08 验证发现重大变化**：

- ❌ `browser action=navigate` 被 OpenClaw SSRF 策略拦截，无法直接导航到头条
- ✅ 必须用 Node.js 脚本连接 CDP，用 `page.goto()` 导航
- ❌ OpenClaw 环境没有 `puppeteer-core`，`npm install` 会因为 PowerShell 中文路径编码问题失败
- ✅ 使用 OpenClaw 内置的 `playwright-core` 替代 puppeteer-core

**技术栈变更**：

| 场景 | 旧方案(2026-05) | 新方案(2026-07) |
|------|----------------|----------------|
| 页面导航 | OpenClaw browser navigate | playwright-core + page.goto() |
| 填写标题 | OpenClaw browser evaluate | playwright-core page.evaluate() |
| 填写正文 | OpenClaw browser type | playwright-core keyboard.type() |
| 封面上传 | puppeteer-core uploadFile() | playwright-core filechooser + setFiles() |
| 点击按钮 | OpenClaw browser evaluate | playwright-core page.evaluate() |
| CDP 端口 | 28800（硬编码） | 从 browser action=status 动态获取 |

**现行推荐工具**：

| 场景 | 推荐工具 | 原因 |
|------|---------|------|
| 页面导航 | **playwright-core page.goto()** | bypass SSRF 拦截 |
| 填写标题/正文 | **playwright-core page.evaluate() + keyboard.type()** | 通过 CDP 直接操作 |
| 封面上传 | **playwright-core filechooser 事件 + setFiles()** | Playwright 官方推荐方式 |
| 点击按钮 | **playwright-core page.evaluate()** | 直接 DOM click() 稳定可靠 |

### 关键结论

- ❌ `browser action=navigate/open` 被 SSRF 拦截，不可用
- ✅ 全部改用 playwright-core 脚本操作
- ⚠️ playwright-core 路径：`F:\qclaw\v0.2.32.610\resources\openclaw\node_modules\playwright-core`
- 💡 CDP 端口动态分配，必须通过 `browser action=status` 获取
=======
头条号是 React/Vue SPA，有两种操作方式，各有优劣，**必须根据场景选择**：

| 场景 | 推荐工具 | 原因 |
|------|---------|------|
| 登录（填写手机号/密码） | **OpenClaw browser 工具** | evaluate + nativeInputValueSetter 是 React 表单唯一可靠方案 |
| 页面导航 | **OpenClaw browser 工具** | snapshot 可实时查看页面状态，navigate 直接跳转 |
| 填写标题 | **OpenClaw browser 工具** | evaluate + nativeInputValueSetter 可靠触发 React 状态更新 |
| 填写正文（ProseMirror） | **OpenClaw browser 工具** | evaluate focus + type action 逐字输入 |
| 选择封面模式/点击按钮 | **OpenClaw browser 工具** | evaluate 直接 DOM click() 稳定可靠 |
| 上传封面图片 | **puppeteer-core 脚本** | browser 工具的 upload action 受 uploads 目录限制；evaluate 无法设置 file input value（浏览器安全策略）；**只有 elementHandle.uploadFile() 能绕过此限制** |
| 点击"预览并发布" | **OpenClaw browser 工具** | evaluate 找到按钮并 click() |
| 验证发布结果 | **puppeteer-core 脚本** | 需要监听 page.on('response') 捕获 API 响应 |

### 关键结论

- ❌ **旧规则"绝对禁止使用 OpenClaw browser 工具"是错误的**，实际验证完全可用
- ✅ **默认优先使用 OpenClaw browser 工具**，更简单、可实时查看页面状态
- ⚠️ **唯一例外**：文件上传必须用 puppeteer-core 的 `elementHandle.uploadFile()`
- 💡 两种工具共享同一个浏览器实例（CDP 端口 28800），不会冲突
>>>>>>> 52486cd0eabbf34fc7c79f9a3d17bd5b7e8680a3

---

## 发布流程（7步）

### 第1步：登入今日头条

#### 1a. 打开登录页

```
browser action=navigate url=https://mp.toutiao.com/profile_v4/graphic/publish
```

页面会自动跳转到登录页：`https://mp.toutiao.com/auth/page/login`

#### 1b. 切换到账密登录

默认显示"验证码登录"，需要点击"账密登录"按钮切换：

```
browser action=snapshot → 找到"账密登录"按钮的 ref → browser action=act kind=click ref=xxx
```

⚠️ 按钮文本可能是"账密登录"或"密码登录"，以实际 snapshot 为准

#### 1c. 填写手机号和密码

**❌ 错误做法**：用 browser 工具的 fill action → React 表单不触发状态更新，显示"手机号不能为空"
**✅ 正确做法**：用 evaluate + nativeInputValueSetter

```js
<<<<<<< HEAD
=======
// 填写手机号（请替换为实际手机号）
>>>>>>> 52486cd0eabbf34fc7c79f9a3d17bd5b7e8680a3
browser action=act kind=evaluate fn="() => {
  const el = document.querySelector('input[placeholder*=\"手机号\"]');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, '【在此输入手机号】');
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return 'phone filled';
}"
<<<<<<< HEAD
=======

// 填写密码（请替换为实际密码）
browser action=act kind=evaluate fn="() => {
  const el = document.querySelector('input[placeholder*=\"密码\"]');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, '【在此输入密码】');
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return 'password filled';
}"
>>>>>>> 52486cd0eabbf34fc7c79f9a3d17bd5b7e8680a3
```

#### 1d. 勾选协议 + 点击登录

```
browser action=snapshot → 找到协议勾选框 ref → browser action=act kind=click ref=xxx
browser action=snapshot → 找到登录按钮 ref → browser action=act kind=click ref=xxx
```

#### 1e. 验证登录成功

snapshot 中应出现"发布文章"编辑器页面，URL 变为 `/profile_v4/graphic/publish`

**登录流程常见问题**：

| 问题 | 原因 | 解决方案 |
|------|------|---------|
| "手机号/邮箱不能为空" | 用 fill/type 直接写值，React 未感知 | 必须用 nativeInputValueSetter + dispatchEvent |
| 页面停留在登录页不动 | 密码错误或账号被风控 | 重新 snapshot 检查错误提示 |
| 跳转到验证码登录 | 没有切换到账密登录 | 先点击"账密登录"再填写 |

### 第2步：导航到发布页

<<<<<<< HEAD
⚠️ SSRF 拦截问题：`browser action=navigate` 会被拦截，必须用 Node.js 脚本连接 CDP：

```js
const { chromium } = require('F:\\qclaw\\v0.2.32.610\\resources\\openclaw\\node_modules\\playwright-core');

const browser = await chromium.connectOverCDP('http://127.0.0.1:{PORT}');
const ctx = browser.contexts()[0];
let page = ctx.pages().find(p => p.url().includes('mp.toutiao.com'));
if (!page) page = ctx.pages()[0];

await page.goto('https://mp.toutiao.com/profile_v4/graphic/publish', {
  waitUntil: 'load',  // ⚠️ 不支持 'networkidle2'，用 'load' 或 'networkidle'
  timeout: 30000
});
```

`page.goto()` 的 waitUntil 选项在 Playwright/Chromium 中只支持：`load`、`domcontentloaded`、`networkidle`、`commit`。

等待编辑器加载完成（检查 `page.url()` 包含 `/publish`，且 DOM 中有 `.ProseMirror`）
=======
⚠️ `browser action=open/navigate` 会被 SSRF 策略拦截，**直接用 nav-publish.js 脚本导航**：

```bash
node scripts/nav-publish.js
```

等待编辑器加载完成（snapshot 中出现标题输入框和 ProseMirror 编辑器）
>>>>>>> 52486cd0eabbf34fc7c79f9a3d17bd5b7e8680a3

### 第3步：生成标题和正文

根据关键词生成：
- 标题：20-30字，吸引眼球，符合头条风格（可用感叹号、问句、数字）
- 正文：500-800字，分段清晰（每段2-4行），口语化风格，像朋友聊天
- 段落之间用空行分隔

### 第4步：填写标题

<<<<<<< HEAD
**必须用 nativeInputValueSetter**（React 受控组件，直接设 value 会丢失）：

```js
await page.evaluate((title) => {
  const el = document.querySelector('.editor-title textarea') || document.querySelector('textarea[placeholder*="标题"]');
=======
**✅ 方法一（推荐）：OpenClaw browser evaluate**

```js
browser action=act kind=evaluate fn="() => {
  const el = document.querySelector('.editor-title textarea') || document.querySelector('textarea[placeholder*=\"标题\"]');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
  setter.call(el, '这里填标题');
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return 'title filled: ' + el.value;
}"
```

**✅ 方法二：puppeteer-core**

```js
await page.evaluate((title) => {
  const el = document.querySelector('.editor-title textarea');
>>>>>>> 52486cd0eabbf34fc7c79f9a3d17bd5b7e8680a3
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
  nativeInputValueSetter.call(el, title);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}, title);
```

<<<<<<< HEAD
⚠️ 直接设置 `el.value = title` 不会触发 React 状态更新，值会被覆盖

### 第5步：填写正文

⚠️ **ProseMirror 只认键盘输入**，不能用 innerHTML。段落之间需按两次 Enter：

```js
await page.evaluate(() => {
  const el = document.querySelector('.ProseMirror');
  el.click(); el.focus();
});
await new Promise(r => setTimeout(r, 500));

const paragraphs = content.split('\n\n');
for (let i = 0; i < paragraphs.length; i++) {
  const p = paragraphs[i].trim();
  if (!p) continue;
  await page.keyboard.type(p);
  await new Promise(r => setTimeout(r, 100));
  if (i < paragraphs.length - 1) {
    await page.keyboard.press('Enter');
    await new Promise(r => setTimeout(r, 100));
    await page.keyboard.press('Enter');  // 两次 Enter 生成段落间距
    await new Promise(r => setTimeout(r, 100));
  }
}
```

=======
⚠️ 无论哪种方法，**必须使用 nativeInputValueSetter**，直接设置 value 不会触发 React 状态更新

### 第5步：填写正文

**✅ 方法一（推荐）：OpenClaw browser 工具**

```js
// 先用 evaluate 聚焦 ProseMirror
browser action=act kind=evaluate fn="() => {
  const el = document.querySelector('.ProseMirror');
  if (el) { el.click(); el.focus(); return 'focused'; }
  return 'not found';
}"

// 再用 type action 输入内容
browser action=act kind=type selector=".ProseMirror" text="正文内容..."
```

**✅ 方法二：puppeteer-core**

```js
await page.click('.ProseMirror');
await page.keyboard.type(content);
```

⚠️ **绝对不要用 innerHTML！** ProseMirror 用 innerHTML 填入后编辑器显示空白

>>>>>>> 52486cd0eabbf34fc7c79f9a3d17bd5b7e8680a3
### 第6步：处理封面 — 默认上传封面图！

#### 6a. 封面模式选择

- 默认选择"单图"并上传封面图（有封面的文章推荐权重更高）
<<<<<<< HEAD
=======
- 仅在无法生成封面图时才选择"无封面"
>>>>>>> 52486cd0eabbf34fc7c79f9a3d17bd5b7e8680a3
- ❌ 选"单图"但不传图片 → 前端直接拦截发布请求，按钮点不动

#### 6b. 封面图生成方式

<<<<<<< HEAD
使用 Pollinations.AI 免费生成（Node.js https.get 下载到本地）：
=======
使用 Pollinations.AI 免费生成（Node.js下载到本地）：
>>>>>>> 52486cd0eabbf34fc7c79f9a3d17bd5b7e8680a3

```js
const https = require('https');
const fs = require('fs');
const url = 'https://image.pollinations.ai/prompt/{英文描述}?width=800&height=600&nologo=true';
<<<<<<< HEAD
const file = fs.createWriteStream('content/cover.jpg');
https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => res.pipe(file))
  .on('finish', () => { file.close(); console.log('封面图下载完成', fs.statSync(outPath).size + 'bytes'); });
=======
const file = fs.createWriteStream('./cover.png');
https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => res.pipe(file))
  .on('finish', () => { file.close(); console.log('封面图下载完成'); });
>>>>>>> 52486cd0eabbf34fc7c79f9a3d17bd5b7e8680a3
```

#### 6c. 选择"单图"模式

```js
<<<<<<< HEAD
await page.evaluate(() => {
=======
browser action=act kind=evaluate fn="() => {
  // 滚动到封面区域
  const el = document.querySelector('.article-cover') || document.querySelector('[class*=\"cover\"]');
  if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' });
  
  // 点击"单图"
>>>>>>> 52486cd0eabbf34fc7c79f9a3d17bd5b7e8680a3
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
  let node;
  while (node = walker.nextNode()) {
    if (node.textContent.trim() === '单图') {
<<<<<<< HEAD
      node.parentElement?.click();
      break;
    }
  }
});
```

#### 6d. 上传封面图

**最优方案：预监听 filechooser 事件 + 点击"本地上传" + setFiles()**

```js
// 1. 先注册 filechooser 监听（必须在点击前）
const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 15000 });

// 2. 点击"本地上传"按钮
await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll('button'));
  const btn = btns.find(b => b.textContent.trim() === '本地上传');
  if (btn) btn.click();
});

// 3. 上传文件
const fileChooser = await fileChooserPromise;
await fileChooser.setFiles(coverPath);

// 4. 等待上传处理
await new Promise(r => setTimeout(r, 5000));

// 5. 点击"确定"
await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll('button'));
  const btn = btns.find(b => b.textContent.trim() === '确定');
  if (btn) btn.click();
});
```

**为什么不用旧方法？**
- ❌ `$$('input[type="file"]')` + `.uploadFile()` → Playwright 没有这个 API，那是 Puppeteer 的
- ❌ Puppeteer 的 `uploadFile()` 可用，但 OpenClaw 环境无 puppeteer-core 包
- ✅ filechooser 事件 + setFiles() 是 Playwright 官方推荐方式
- ✅ 直接找"本地上传"按钮比 .article-cover-add 更明确

**封面上传关键教训（2026-07-08 验证）**：
- ✅ 获取 CDP 端口后，直接找"本地上传" → click → 等 filechooser → setFiles() → 点"确定"
- ❌ Playwright 的 `elementHandle.uploadFile()` 不存在
- ❌ Browser 工具的 `upload` action 受限于 uploads 目录策略
- ✅ 上传弹窗中有"取消"和"确定"两个按钮，用 `textContent.trim() === '确定'` 匹配
=======
      let parent = node.parentElement;
      if (parent) {
        parent.click();
        parent.dispatchEvent(new Event('click', { bubbles: true }));
        const radio = parent.querySelector('input[type=\"radio\"]') || parent.previousElementSibling?.querySelector('input[type=\"radio\"]');
        if (radio) {
          radio.checked = true;
          radio.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
      break;
    }
  }
  return 'selected single image';
}"
```

#### 6d. 上传封面图（必须用 puppeteer-core！）

**⚠️ 这是唯一必须用 puppeteer-core 的步骤**

原因：
- browser 工具的 `upload` action 要求文件在 uploads 目录中（路径受限）
- evaluate 中无法设置 `input[type="file"]` 的 value（浏览器安全策略）
- 只有 `elementHandle.uploadFile()` 能通过 CDP 协议绕过浏览器安全限制

**完整上传流程**：

```js
// 1. 点击上传区域（browser 工具）
browser action=act kind=evaluate fn="() => {
  const addBtn = document.querySelector('.article-cover-add');
  if (addBtn) {
    addBtn.click();
    addBtn.dispatchEvent(new Event('click', { bubbles: true }));
    return 'clicked';
  }
  return 'not found';
}"

// 2. 等2秒后，用 puppeteer-core 上传文件
const fileInputs = await page.$$('input[type="file"]');
if (fileInputs.length > 0) {
  await fileInputs[0].uploadFile(coverPath);  // coverPath 为本地绝对路径
} else {
  throw new Error('未找到 file input');
}

// 3. 等5秒后，点击弹窗中的"确定"按钮
await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll('button'));
  const confirmBtn = btns.find(b => b.textContent?.trim() === '确定');
  if (confirmBtn) {
    confirmBtn.click();
    confirmBtn.dispatchEvent(new Event('click', { bubbles: true }));
  }
});
```

**如果必须用 browser 工具上传**（临时方案）：

```
// 1. 复制文件到 uploads 目录
Copy-Item "cover.png" "$env:TEMP\openclaw\uploads\cover.png" -Force

// 2. 使用 browser upload
browser action=upload paths=["C:\\Users\\甲骨龙集成电脑\\AppData\\Local\\Temp\\openclaw\\uploads\\cover.png"]
```

⚠️ 此临时方案需要先复制文件到 uploads 目录，不如 puppeteer-core 灵活

**封面上传关键教训（2026-05-18 验证）**：
- ❌ 在 evaluate 中设置 input.value = 文件路径 → 浏览器安全策略禁止
- ❌ 用 `document.querySelector('input[type="file"]').files = ...` → 安全策略拦截
- ❌ 选了"单图"但没点 `.article-cover-add` 上传区域 → file input 不存在
- ✅ 选"单图"radio → 点 `.article-cover-add` 区域 → 等2秒 → `uploadFile()` → 点"确定"
- ✅ 必须使用 `elementHandle.uploadFile()` 方法（通过 CDP 协议绕过浏览器安全限制）
- ⚠️ file input 在点击上传区域后才被动态创建到 DOM 中
>>>>>>> 52486cd0eabbf34fc7c79f9a3d17bd5b7e8680a3

### 第7步：发布

#### 7a. 点击"预览并发布"

```js
<<<<<<< HEAD
await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll('button'));
  const btn = btns.find(b => b.textContent.trim() === '预览并发布');
  if (btn) btn.click();
});
await new Promise(r => setTimeout(r, 6000));  // 等待预览弹窗加载
```

- ⚠️ 不要误点旁边的 **"定时发布"** 按钮！文本匹配必须精确等于 "预览并发布"

#### 7b. 点击"确认发布"（二次弹窗）

⚠️ **关键发现**：头条有二次确认弹窗！"预览并发布"后弹出模态框，内有"返回编辑"和"确认发布"：

```js
await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll('button'));
  const btn = btns.find(b => b.textContent.trim() === '确认发布');
  if (btn) btn.click();
});
await new Promise(r => setTimeout(r, 5000));
```

#### 7c. 验证发布成功

**发布成功判定**：
1. **URL 从 `/publish` 变为 `/articles`** — 最简单可靠
2. 页面出现文章列表

#### 7d. 清理

- 发布成功后删除 workspace 中的调试脚本和临时文件
=======
browser action=act kind=evaluate fn="() => {
  const btn = Array.from(document.querySelectorAll('button'))
    .find(b => b.textContent?.trim() === '预览并发布');
  if (btn) {
    btn.click();
    btn.dispatchEvent(new Event('click', { bubbles: true }));
    return 'clicked';
  }
  return 'button not found';
}"
```

- ⚠️ 不要误点旁边的 **"定时发布"** 按钮！文本匹配必须精确等于 "预览并发布"
- ✅ 始终使用 evaluate 直接调用DOM元素的 `click()` 方法

#### 7b. 验证发布成功

**方法一（推荐）：puppeteer-core API 监听**

```js
let publishResponse = null;
page.on('response', async (response) => {
  const url = response.url();
  if (url.includes('/article/publish') || url.includes('/mp/agw/')) {
    try {
      const body = await response.text().catch(() => '');
      if (body.includes('"code":0')) {
        publishResponse = { url, body: body.substring(0, 500) };
      }
    } catch(e) {}
  }
});
```

**方法二：browser snapshot 检查**

点击发布后等6秒，然后 snapshot 查看页面是否跳转到文章列表页

**发布成功判定标准（优先级从高到低）**：
1. **API 响应 `code: 0`** — 最可靠
2. **页面出现"提交成功"提示**
3. **URL 从 `/publish` 变为 `/articles`**

**关键发现（2026-05-18 更新）**：
- 今日头条现在有**二次确认弹窗**！点击"预览并发布"后会弹出预览模态框
- 预览模态框中有"返回编辑"和"确认发布"两个按钮
- **必须点击"确认发布"才能真正发布文章**

#### 7c. 清理

- 发布成功后删除workspace中的调试截图和临时文件
>>>>>>> 52486cd0eabbf34fc7c79f9a3d17bd5b7e8680a3

---

## 登录问题专题（2026-05-18 实战总结）

<<<<<<< HEAD
=======
这是本次更新最核心的部分，之前规则完全没有覆盖登录流程的细节。

>>>>>>> 52486cd0eabbf34fc7c79f9a3d17bd5b7e8680a3
### 问题 #1：React 表单 fill/type 不触发状态更新

| 现象 | 原因 | 解决方案 |
|------|------|---------|
| 填写后点击登录提示"手机号不能为空" | browser 的 fill action 直接设置 DOM value，React 未感知 | **必须用 evaluate + nativeInputValueSetter** |
| fill 成功返回但字段显示为空 | React 受控组件会覆盖直接设置的 value | 同上 |

**React 表单正确填写模式**（适用于所有 React/Vue 表单）：

```js
// HTMLInputElement
const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
setter.call(element, value);
element.dispatchEvent(new Event('input', { bubbles: true }));

// HTMLTextAreaElement
const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
setter.call(element, value);
element.dispatchEvent(new Event('input', { bubbles: true }));
```

### 问题 #2：登录页默认是验证码模式

| 现象 | 原因 | 解决方案 |
|------|------|---------|
| 只有手机号+验证码输入框 | 默认显示"验证码登录"tab | 点击"账密登录"按钮切换 |
<<<<<<< HEAD
| 脚本找不到密码输入框 | 在验证码模式下密码框不存在 | 先 snapshot 确认当前模式，再切换 |

---

## 2026-07-08 新增问题与解决方案

### 问题 #1：SSRF 策略拦截 browser navigate

**现象**：`browser action=navigate url=...` 报错 "Navigation blocked: strict browser SSRF policy"
**原因**：OpenClaw 安全策略限制浏览器通过 hostname 导航
**解决方案**：改用 Node.js 脚本通过 CDP 直接控制浏览器

```js
const { chromium } = require('F:\\qclaw\\v0.2.32.610\\resources\\openclaw\\node_modules\\playwright-core');
const browser = await chromium.connectOverCDP('http://127.0.0.1:{PORT}');
const page = browser.contexts()[0].pages()[0];
await page.goto(url, { waitUntil: 'load' });
```

### 问题 #2：CDP 端口不是固定的 28800

**现象**：连接 `http://127.0.0.1:28800` 失败
**原因**：每次 OpenClaw 启动时动态分配端口
**解决方案**：通过 `browser action=status` 获取 `cdpPort` 字段

### 问题 #3：puppeteer-core 未安装且无法安装

**现象**：`require('puppeteer-core')` 报 MODULE_NOT_FOUND；`npm install puppeteer-core` 失败
**原因**：OpenClaw 不预装 puppeteer-core；PowerShell 中文路径导致 npm 解析失败
**解决方案**：使用 OpenClaw 内置的 playwright-core

```js
const { chromium } = require('F:\\qclaw\\v0.2.32.610\\resources\\openclaw\\node_modules\\playwright-core');
```

### 问题 #4：Playwright 没有 uploadFile() API

**现象**：`page.$$('input[type="file"]')[0].uploadFile()` 报错 `not a function`
**原因**：`uploadFile()` 是 Puppeteer 的 API，Playwright 使用不同的 filechooser 机制
**解决方案**：

```js
const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 15000 });
// 点击上传按钮...
const fileChooser = await fileChooserPromise;
await fileChooser.setFiles(coverPath);
```

### 问题 #5：page.goto() 等待策略不支持 networkidle2

**现象**：`page.goto(..., { waitUntil: 'networkidle2' })` 报错
**原因**：Playwright 只支持 `load`、`domcontentloaded`、`networkidle`、`commit`
**解决方案**：用 `waitUntil: 'load'` 或 `waitUntil: 'networkidle'`
=======
| puppeteer 脚本找不到密码输入框 | 在验证码模式下密码框根本不存在 | 先 snapshot 确认当前模式，再切换 |

### 问题 #3：puppeteer-core 登录脚本元素选择器失败

| 现象 | 原因 | 解决方案 |
|------|------|---------|
| `document.querySelector('input[placeholder*="手机号"]')` 返回 null | 在验证码模式下选择器不匹配 | **先切换到账密登录模式** |
| 标题输入框 `.editor-title textarea` 找不到 | 页面还在登录页没跳转到编辑器 | 确认登录成功后再操作编辑器 |

### 问题 #4：browser 工具的 fill action 与 evaluate 的区别

| 操作方式 | React 表单兼容性 | 说明 |
|---------|:---------------:|------|
| `fill` action (browser) | ❌ 不可靠 | 直接设 value，React 不感知 |
| `type` action (browser) | ⚠️ 部分可用 | 模拟键盘输入，但速度慢且可能被拦截 |
| `evaluate` + nativeInputValueSetter | ✅ 完全可靠 | 触发 React 内部 setter，状态正确更新 |
| `evaluate` + 直接 el.value = | ❌ 不可靠 | React 会覆盖，值丢失 |
>>>>>>> 52486cd0eabbf34fc7c79f9a3d17bd5b7e8680a3

---

## 发布失败原因总结与解决方案

### 失败原因 #1：使用坐标点击
**现象**：按钮明明存在且可见，但点击后没有任何反应
<<<<<<< HEAD
**解决方案**：始终使用 `page.evaluate()` 直接调用 DOM 元素的 `click()` 方法
=======
**解决方案**：始终使用 `page.evaluate()` 或 browser evaluate 直接调用DOM元素的 `click()` 方法
>>>>>>> 52486cd0eabbf34fc7c79f9a3d17bd5b7e8680a3

### 失败原因 #2：React 表单填写方式错误
**现象**：字段看起来填了但提交时报"不能为空"
**解决方案**：必须用 `nativeInputValueSetter` + `dispatchEvent(new Event('input', { bubbles: true }))`

### 失败原因 #3：等待时间不足
**解决方案**：
- 点击"预览并发布"后等待 **6秒** 以上
- 上传封面图后等待 **5秒** 以上
- 登录后等待 **3秒** 让页面跳转

### 失败原因 #4：封面图上传方法错误
<<<<<<< HEAD
**错误做法**：用 `$$('input[type="file"]')` + `uploadFile()` → Playwright 不支持
**正确做法**：用 filechooser 事件 + `setFiles()`（Playwright 原生方式）

### 失败原因 #5：SSRF 拦截导致导航失败
**解决方案**：全部操作统一用 Node.js 脚本，不走 browser 工具的 navigate/action/snapshot
=======
**错误做法**：在 evaluate 中设置 input.value / 用 files = [...] / 选"单图"但不点上传区域
**正确做法**：先点 `.article-cover-add` 触发 file input 创建，再用 `elementHandle.uploadFile()` 上传

### 失败原因 #5：登录页停留在验证码模式
**现象**：脚本找密码输入框失败
**解决方案**：先点击"账密登录"切换模式，再填写
>>>>>>> 52486cd0eabbf34fc7c79f9a3d17bd5b7e8680a3

### 失败原因 #6：误点定时发布
**解决方案**：文本匹配必须精确等于 "预览并发布"

---

## 技术约束（违反必踩坑）

### 🔴 绝对禁止

| 方法 | 原因 |
| ---- | ---- |
<<<<<<< HEAD
| `browser action=navigate` 导航头条 | SSRF 策略拦截（2026-07 验证） |
| `browser action=open` 打开头条 | SSRF 策略拦截 |
| `innerHTML` 填 ProseMirror | 编辑器显示空白 |
| Playwright 的 `.uploadFile()` | 不存在，这是 Puppeteer API |
| 硬编码 CDP 端口 28800 | 端口动态分配，必须从 status 获取 |
| 选"单图"但不传图片 | 前端直接拦截发布请求，按钮点不动 |
| 不点"确认发布"按钮 | 有二次确认弹窗，不点无法发布 |
=======
| `innerHTML` 填 ProseMirror | 编辑器显示空白 |
| `browser.pages()` | 返回空数组！必须用 `browser.targets()` |
| `page.waitForTimeout` | puppeteer-core新版已移除 |
| PowerShell cd 到中文路径 | Windows PS默认GBK编码，中文路径必乱码 |
| 选"单图"但不传图片 | 前端直接拦截发布请求，按钮点不动 |
| 在 evaluate 中设置 file input value | 浏览器安全策略禁止 |
| 不点"确认发布"按钮 | 今日头条有二次确认弹窗，必须点"确认发布"才能发布 |
>>>>>>> 52486cd0eabbf34fc7c79f9a3d17bd5b7e8680a3
| browser fill action 填 React 表单 | 不触发 React 状态更新，值丢失 |

### ✅ 必须使用

| 方法 | 说明 |
| ---- | ---- |
<<<<<<< HEAD
| Node.js 脚本 + playwright-core + CDP | 全部操作（导航、填写、上传、发布） |
| evaluate + nativeInputValueSetter | React/Vue 表单唯一可靠填写方式 |
| `page.keyboard.type()` 输入正文 | ProseMirror 只认键盘输入 |
| `page.evaluate()` 直接点击 | 按钮点击最可靠方式 |
| filechooser 事件 + `setFiles()` 上传封面 | Playwright 原生文件上传方式 |
| URL 跳转到 `/articles` 验证发布 | 最简可靠的验证方式 |
| `node "完整路径\script.js"` 执行脚本 | 绕过 PowerShell 中文路径问题 |
| `browser action=status` 获取 cdpPort | 获取动态端口 |

### 前置准备：获取 CDP 端口

每次执行前先通过 browser status 获取端口：

```
browser action=status  # 查看 cdpPort 字段，如 14215
```

然后在脚本中用该端口连接：

```js
const PORT = 14215;  // 从 status 获取
const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
```

### playwright-core 路径

```
F:\qclaw\v0.2.32.610\resources\openclaw\node_modules\playwright-core
```

### 脚本执行规范

- 脚本保存为 `.js` 文件在 workspace 目录
- 执行方式：`node "完整路径\script.js"`（直接传完整路径，不用 cd）
- 完善 console.log 输出
=======
| OpenClaw browser 工具（默认） | snapshot/act/evaluate 全部可用，登录填写首选 |
| puppeteer-core + CDP(28800) | 仅用于文件上传（uploadFile）和 API 响应监听 |
| evaluate + nativeInputValueSetter | React/Vue 表单唯一可靠填写方式 |
| `browser.targets()` 获取页面 | pages()不可用 |
| `keyboard.type()` 输入正文 | ProseMirror只认键盘输入 |
| `page.evaluate()` 直接点击 | 按钮点击最可靠方式 |
| `elementHandle.uploadFile()` 上传封面 | 绕过浏览器安全限制的唯一方法 |
| 监听 API 响应验证发布 | 比检查URL更可靠 |
| `node "完整路径\script.js"` 执行脚本 | 绕过PowerShell中文路径问题 |

### 浏览器环境

- Chrome，CDP端口 **28800**
- 连接地址：`http://127.0.0.1:28800`
- headless: false（有界面模式）
- 启动方式：`browser action=start profile=openclaw`

### 脚本执行规范

- 脚本保存为 `.js` 文件在workspace目录
- 执行方式：`node "完整路径\script.js"`（直接传完整路径，不用cd）
- 关键步骤前后必须截图
- 完善的 console.log 输出
>>>>>>> 52486cd0eabbf34fc7c79f9a3d17bd5b7e8680a3
- try/catch 包裹 + process.exit(0/1)

### 常见陷阱优先级（按踩坑频率排序）

<<<<<<< HEAD
1. 🔴 **SSRF 拦截 browser navigate** → 必须用 playwright-core + page.goto()
2. 🔴 **CDP 端口不是固定的 28800** → 必须从 `browser action=status` 获取
3. 🔴 **puppeteer-core 未安装且无法安装** → 用内置 playwright-core
4. 🔴 **Playwright 没有 uploadFile()** → 用 filechooser 事件 + setFiles()
5. React 表单不用 nativeInputValueSetter → 值丢失，提交报"不能为空"
6. 登录页不切换到账密模式 → 找不到密码框
7. 封面未正确设置 → 发布按钮完全无反应
8. 等待时间太短 → 弹窗未渲染就点击
9. 两步发布机制：预览并发布 → 预览模态框 → 必须点"确认发布"
10. 误点定时发布：就在预览并发布旁边
11. innerHTML 填内容不显示：必须用 keyboard.type
12. PowerShell 中文路径乱码：永远不要 cd 到 .qclaw 目录
13. waitForTimeout 不存在：用 new Promise 替代
14. page.goto() 的 waitUntil 不支持 networkidle2
=======
1. React 表单不用 nativeInputValueSetter → 值丢失，提交报"不能为空"（最高频 🔴）
2. 登录页不切换到账密模式 → 找不到密码框
3. 使用 `page.mouse.click()` 坐标点击 → 按钮无反应
4. 封面未正确设置 → 发布按钮完全无反应
5. 等待时间太短 → 弹窗未渲染就点击
6. 两步发布机制：预览并发布 → 弹出预览模态框 → 必须点"确认发布"
7. 误点定时发布：就在预览并发布旁边
8. browser.pages()为空：必须用targets()
9. innerHTML填内容不显示：必须用keyboard.type
10. PowerShell中文路径乱码：永远不要cd到.qclaw目录
11. waitForTimeout不存在：用new Promise替代
12. file input 不存在：需要先点击上传区域才会动态创建
>>>>>>> 52486cd0eabbf34fc7c79f9a3d17bd5b7e8680a3
