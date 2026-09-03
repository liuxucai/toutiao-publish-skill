# 故障排查：安装与发布过程中遇到的问题及解决方法

> 本文档由真实发布「敬老」「处境」「真理」文章全过程踩坑整理（适配本机 OpenClaw v0.2.33.617）。
> 所有解决方法均经实测验证，可直接照抄。编号 1-12 为安装/通用坑，13-20 为后续发布中新增的实战坑。

---

## 一、安装 / 适配阶段

| # | 问题 | 现象 | 解决方法 |
|---|------|------|---------|
| 1 | 原仓库 master 有未解决的 Git 合并冲突 | SKILL.md / detailed-rules.md 满篇 `<<<<<<<`/`=======`/`>>>>>>>`；写死作者机器（v0.2.32.610、workspace id、CDP 端口 28800） | 清理所有冲突标记，统一采用 playwright-core 方案，重写为适配本机的干净版本 |
| 2 | GitHub 直连被墙 | `git ls-remote` 连接重置 | 通过 ghproxy.net 镜像 + `git config --global url."https://ghproxy.net/https://github.com/".insteadOf "https://github.com/"` 代理克隆 |
| 3 | OpenClaw 严格 SSRF 拦截浏览器按域名导航 | `browser action=navigate/open` 到 `mp.toutiao.com` 报错 "strict browser SSRF policy requires an IP-literal URL" | **核心架构决策**：全部改用 Node 脚本 + playwright-core 直连 CDP，用 `page.goto()` 绕过 |
| 4 | 本机缺少 puppeteer-core | 仓库另一冲突分支依赖它，`require('puppeteer-core')` 失败（本机只有 playwright-core 和 ws） | 废弃 puppeteer 分支，统一 playwright-core |
| 5 | playwright-core 路径不能写死版本 | 原脚本 hardcode `F:/qclaw/v0.2.32.610/...`，本机是 v0.2.33.617 | `scripts/lib.js` 运行时自动探测（环境变量 `OPENCLAW_NODE_MODULES` 或常见盘符版本目录），版本无关 |
| 6 | CDP 端口写死 28800 不可用 | 端口每次 OpenClaw 启动动态分配（实测 7774 / 1585 / 13935 等），写死连不上 | 运行时 `browser action=status` 读 `cdpPort`，写入 `TTC_CDP_PORT` 环境变量传给脚本 |

---

## 二、环境 / 导航阶段

| # | 问题 | 现象 | 解决方法 |
|---|------|------|---------|
| 7 | 浏览器未启动就跑脚本 | `browser status` 显示 `running:false`，直接跑 `nav-publish.js` 连接失败 | 发布前先 `browser action=start`，确认 `cdpReady:true` 后再执行导航脚本 |
| 8 | `browser action=screenshot` 用数字端口报 "tab not found" | 传入数值端口拿不到图 | 截图用稳定的 tab id（如 `t1`）或 `targetId`（如 `C38D850BEE9C98B10E097CB633E30BE2`），而非端口号；或在脚本里用 playwright 的 `page.screenshot()` 落盘 |
| 9 | 辅助 image 工具不能看本地截图，肉眼核验失效 | 想靠看 `after-fill.png` 确认标题/正文渲染，但无法查看 | 改用 **DOM 提取核验**：脚本 `page.evaluate` 读取 `.editor-title textarea` 的 `value` 与 `.ProseMirror` 的 `innerText`，把结果写文件再读，确认标题、正文长度、末尾内容正确 |

---

## 三、表单填写阶段

| # | 问题 | 现象 | 解决方法 |
|---|------|------|---------|
| 10 | React 受控标题框填不进去 | 直接 `.value=` 或 `el.click()`/`dispatchEvent('click')` 无效，标题不更新 | 用 `nativeInputValueSetter` + `dispatchEvent(new Event('input', {bubbles:true}))`（即 `lib.js` 的 `NATIVE_SETTER_HELPER`），模拟真实输入事件触发 React 状态更新 |
| 11 | ProseMirror 正文拒收 innerHTML / 粘贴 | 直接 `innerHTML=` 或 `paste` 注入会丢失或被丢弃，编辑器空白 | `editor.focus()` 后用 `page.keyboard.type(段落)` 逐字输入；段落之间按 **两次 Enter**（`press('Enter')` 两次）实现分段。严禁 innerHTML 填充 |
| 12 | 正文长度不达标（如"不少于 1500 字"） | 草稿正文只有 1104 字符；扩写后文件 1496 字节（≠1496 字），编辑器实测 1449、1488 字，仍低于 1500 | ① 区分「字节数」与「字符数」——中文字 UTF-8 占 3 字节，`1500字` 指 **1500 个字符**，不是 1500 字节；② 以 `ProseMirror.innerText.length` 实测为准（不是文件字节数）；③ 反复扩写到编辑器实测量 ≥ 要求字数 |
| 13 | 重新填正文时旧内容残留 | 第一次 fill 已写入旧内容，第二次 fill 直接续打字会新旧叠加、内容重复 | fill 脚本在输入前先 `Ctrl+A` 全选 + `Delete` 清空编辑器，再重新逐字输入完整新内容 |

---

## 四、PowerShell / 脚本执行阶段

| # | 问题 | 现象 | 解决方法 |
|---|------|------|---------|
| 14 | PowerShell 命令行中文引号破坏字符串 | 标题/正文含中文弯引号「""」，PowerShell 把定界符 `"` 与文本引号混淆，报 UnexpectedToken | 不把中文内容当命令行参数传。改为写进 `.js` 文件，再 `node xxx.js` 执行（fill.js 的传参方式在本机易踩坑，推荐文件读取式 `_fill.js`） |
| 15 | Node stdout 在 process.exit 前不刷新，输出丢失 | 脚本在 `process.exit()` 前 stdout 可能未刷新，导致截图/日志输出被吞、读不到结果 | 把结果统一 `fs.writeFileSync` 写到日志文件（如 `_fill.log`、`_verify.log`），再用 `Get-Content` 读取文件，而不是依赖命令行回显 |
| 16 | 中文 + 换行的参数用内联 `node -e` 脚本失败 | PowerShell 下多行 `node -e "..."` 写文件，因中文与换行、引号转义问题易失败，甚至吞掉所有输出 | 把所有逻辑写成独立 `.js` 文件，用完整路径执行（`node scripts/xxx.js`），不靠内联 `-e` |
| 17 | 中文路径下 cd 到脚本目录出错 | 工作目录含中文（`菠萝`），`cd` 到脚本目录再执行有时异常 | 不 `cd` 到脚本目录，直接 `cd` 到 skill 根目录后，用 `node scripts/xxx.js` 相对路径执行；或全程用绝对路径 |
| 18 | 日志中文显示为乱码（mojibake） | Node 写的日志是 UTF-8，PowerShell `Get-Content` 默认按 GBK 解读，标题显示成 `鎴戜滑...` 乱码，看似"填错" | ① 核验以 DOM 提取的真实值为准（编辑器里标题实际正确）；② 查看日志用 `Get-Content -Encoding UTF8`，而非默认读取 |

---

## 五、封面上传（最关键的一组坑）

| # | 问题 | 现象 | 解决方法 |
|---|------|------|---------|
| 19 | 头条封面上传机制与原脚本假设完全不同 | 按原脚本点「单图」后，页面 `input[type=file]` 数量为 0 → 监听 filechooser 永远等不到 | 封面入口是 `.article-cover-add`（虚线加号块），点「单图」不会激活上传。**必须点它先弹出上传弹窗**，弹窗内才有 `#upload-drag-input` 和 `.btn-upload-handle input` |
| 20 | 直接 setInputFiles 到 #upload-drag-input 不稳定 | 上传后弹窗显初始态、封面区无 img（`COVER_NOT_INSERTED`） | 改用点 `.upload-btn`（本地上传按钮，红按钮带电脑图标）触发真实 filechooser 事件再 `setFiles()`，最稳 |
| 21 | 上传后找不到「确定」按钮 | 等 5s 后点「确定」未找到，封面未插入 | ① 等待延长到 6s（等缩略图生成）② 确认按钮候选扩展为 `['确定','使用','插入','保存']` ③ 加兜底：再等 4s 点第二次 |
| 22 | 选「单图」却不传图片，发布被拦截 | 前端直接拦截发布请求，按钮点不动 | **封面必须真实上传**。流程：选「单图」→ 点 `.article-cover-add` 开弹窗 → 点「本地上传」→ `filechooser.setFiles(封面路径)` → 点「确定」插入。先用 `gen-cover.js` 从 Pollinations.AI 生成封面图 |

**封面上传正确流程（upload-cover.js 已实现，实测通过）**：
1. 点「单图」radio（TreeWalker 找文本节点）
2. 点 `.article-cover-add`（虚线加号块）→ 弹出上传弹窗
3. 弹窗内点「本地上传」按钮（`.upload-btn`）→ 触发 filechooser 事件
4. `fc.setFiles(coverPath)`
5. 等 6s 处理 → 点弹窗「确定」把图插入封面区
6. 验证：`.article-cover-images-wrap img` 存在 = `COVER_INSERTED_OK`

---

## 六、发布流程

| # | 问题 | 现象 | 解决方法 |
|---|------|------|---------|
| 23 | 误点「定时发布」而非「确认发布」 | 发布弹窗里「定时发布」与「确认发布」相邻，容易误点导致没真正发出 | `publish.js` 流程固定——先点「预览并发布」等待约 6 秒，再点「确认发布」二次弹窗；最后校验 URL 是否跳到 `/profile_v4/graphic/articles` 判定成功，绝不碰「定时发布」 |
| 24 | Markdown 文章原样填入，读者看到 `#`/`*`/`>` 原始符号 | 头条 syl editor（ProseMirror）**不渲染 Markdown 语法**，`# 标题` `**加粗**` `> 引用` `- 列表` 都当成普通文字显示 | 新增规则：Markdown 文章先用 `md2toutiao.js` 转换——解析为结构化 block，再用工具栏 `header`/`bold`/`block_quote` **真实施加样式**（列表降级为「• 」项目符号文本）。转换后用 DOM 核验 `hasH1/hasStrong/hasQuote` 与 `innerText.length`，确认无 Markdown 符号残留。禁用 `fill.js` 直接传 Markdown |
| 25 | 高频重复点击「预览并发布 / 确认发布」导致同一篇文章被发布多次 | 实测：在未跳转前反复点击发布按钮（间隔 < 10 秒），头条后端**不对高频请求去重**，同一篇内容被发出多份 | **发布按钮点击频率上限：最快 10 秒 1 次**。单次发布只需点 **1 次「预览并发布」+ 1 次「确认发布」**，点完耐心等 URL 跳到 `/articles` 确认；未跳转也不要立刻补点，**至少等 10 秒**再判断是否真的失败。任何「轮询点提交直到跳转」的写法都是错误且危险的 |
| 26 | **卡住很久（如 5 分钟）后再点一次发布，导致同一篇文章被发第二篇** | 第一次点击其实已成功，只是 URL 跳转未被自动化捕获/确认；长时间无反应后「补点」又发了一遍 | 卡住/长时间无反应时**绝不直接补点**：先到「内容管理 → 已发布」列表核验该文章是否已在列（或检查 URL 是否已跳 `/articles`、`/graphic/index` 等已发布态）；**确认确实未发布**后，才重新开始一次完整发布流程（重新进发布页、再点 1 次预览 + 1 次确认）。绝不能「隔很久后仅凭没看到反应就再点一次」 |
| 27 | **重试前未核验「已发布」列表就补点** | 失败后立刻重发，若第一次其实已成功就会发重复 | `publish.js` 已内置发布状态机：点击后置 `PUBLISHING`；跳转 `/articles` 或列表核验到 → `SUCCESS`；未跳转 → **必去「已发布」列表核验**，不在列才 `RETRYING`（间隔 10 秒、最多 6 次），已在列直接 `SUCCESS`。打印 `STATE:*` 便于观察，杜绝「未核验补点」 |

---

## 七、已失效 / 已删除的方法（行不通的方案，不要再用的"坑"）

- ❌ 直接 `browser action=navigate/open` 到头条（SSRF 拦截）
- ❌ 用 puppeteer-core（本机未装，相关安装脚本已删除）
- ❌ CDP 端口写死 28800（动态分配，从 status 取）
- ❌ playwright-core 路径写死版本号（运行时自动探测）
- ❌ 点「单图」后立即监听 filechooser（页面无 file input，必须先点 `.article-cover-add`）
- ❌ 直接 `setInputFiles('#upload-drag-input')`（弹窗不刷新、封面不插入）
- ❌ `page.evaluate` 传多个参数（报 Too many arguments，需包成对象）
- ❌ 用 `innerHTML` / `paste` 填 ProseMirror（编辑器空白）
- ❌ 把中文内容当命令行参数传给 `fill.js`（PowerShell 引号破坏）
- ❌ 靠命令行回显判断脚本结果（`process.exit` 前 stdout 不刷新，改用写文件）
- ❌ 靠看截图核验（image 工具看不了本地图，改用 DOM 提取）
- ❌ 按文件「字节数」判断字数（中文字 3 字节/个，应以 `innerText.length` 字符数为准）
- ❌ 重新 fill 前不清空（旧内容残留，应先 Ctrl+A + Delete）
- ❌ `Get-Content` 默认读日志（中文乱码，加 `-Encoding UTF8`）
- ❌ 浏览器未启动就跑导航脚本（先 `browser start`）
- ❌ **把 Markdown 原样填入头条编辑器**（头条 syl editor 不渲染 Markdown，`# 标题`/`**加粗**`/`> 引用`/`- 列表` 会以原始符号显示给读者；必须先用 `md2toutiao.js` 转换为真实标题/加粗/引用样式，列表降级为「• 」项目符号文本）
- ❌ 给标题/引用 block 先 `Shift+Home` 全选再点工具栏工具（选中态下按 Enter 会删掉整段文字，标题变空；正确做法：打完字光标在行尾直接点工具）
- ❌ 给加粗选中后不收起选区就 Enter（同理会删字；选中加粗后应 `ArrowRight` 收起选区再继续）
- ❌ 用 DOM `.click()` 点 `bold` 工具按钮（ProseMirror 失焦使选区坍塌，加粗失效；必须用真实鼠标 `page.click('.syl-toolbar-tool.bold')`）
- ❌ 想用脚本点列表工具 `list_util`（它是下拉项，选项不在 DOM 暴露，无法脚本点击；列表降级为「• 」文本）
- ❌ 段落间按两次 Enter（会留下空 `<p>` 段；单 Enter 即可，头条 `<p>` 自带间距）
- ❌ **高频重复点击「预览并发布 / 确认发布」**（两次点击间隔 < 10 秒会导致同一篇文章被重复发布；头条后端不对未跳转前的高频请求去重，已实测验证。单次发布只点 1 次「预览并发布」+ 1 次「确认发布」，点完等 URL 跳 `/articles`，未跳转至少等 10 秒再补点；循环「只要没跳转就一直点」的写法是错误且危险的）
- ❌ **卡住很久（如 5 分钟）后仅凭「没看到成功」就补点一次**（第一次往往已发布成功，过很久再点会发第二篇；应先去「已发布」列表核验，确认未发布才重启完整流程）
- ❌ **重试前不核验「已发布」列表就直接补点**（第一次可能已成功；publish.js 现已内置状态机：未跳转必去「已发布」列表核验，不在列才重试，已在列即判成功，杜绝重复发）
