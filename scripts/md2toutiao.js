/**
 * md2toutiao.js — 把 Markdown 文章转换为头条号「可渲染」格式并填入编辑器。
 *
 * 问题背景（必读）：
 *   头条号编辑器（syl editor / ProseMirror）【不渲染 Markdown 语法】。
 *   直接键入 `# 标题`、`**加粗**`、`> 引用`、`- 列表` 会以原文原样显示，
 *   读者看到的是一堆 #、*、> 符号，而不是标题/加粗/引用/列表样式。
 *   本脚本把 Markdown 解析为结构化 block，再用编辑器自带工具栏工具
 *   （header / bold / block_quote）施加【真实样式】，列表降级为「· 」项目符号文本。
 *
 * 用法：
 *   # 仅预览转换结果（不连浏览器），用于核验结构：
 *   node scripts/md2toutiao.js content/article_poem.txt --preview
 *
 *   # 连接浏览器并真实填入（需先 nav-publish 到发布页，且设 TTC_CDP_PORT）：
 *   TTC_CDP_PORT=<port> node scripts/md2toutiao.js content/article_poem.txt --fill
 *
 * 输入文件格式（与 fill.js 兼容）：
 *   TITLE:::标题
 *   BODY:::正文（Markdown）
 *
 * 关于「加粗」的实现（踩坑后确定，勿改）：
 *   - 工具栏 bold 按钮：用「真实鼠标 page.click」有效；用 execCommand/选区折叠会丢字或删字。
 *   - 但 page.click 加粗依赖于「当前已有选区」。流程：先 type 纯文本 → 用 Selection API
 *     选中本块 [start,end] 字符区间 → 真实点击 bold → 收起选区。实测稳定（见 _probe_selclick）。
 *   - 【关键坑】发布页常驻「AI 助手抽屉」透明遮罩（.byte-drawer-mask）会拦截所有点击，
 *     每次操作前需先 click 该 mask 关闭抽屉（dismissDrawer）。
 *   - 【关键坑】bold 选区收尾后光标会停在加粗片段末尾（非整块末尾），
 *     后续 Enter 会从该处切断本块，导致文字错乱。因此所有结构操作前都用
 *     caretToEndOfLastBlock() 把光标确定性地移回最后一个非空块末尾。
 */
const fs = require('fs');
const path = require('path');
const { connectToutiaoPage, NATIVE_SETTER_HELPER } = require('./lib');

const wait = ms => new Promise(r => setTimeout(r, ms));
const charLen = s => [...s].length;

function parseArticle(txt) {
  const m = txt.match(/TITLE:::([\s\S]*?)\nBODY:::([\s\S]*)/);
  if (!m) return null;
  return { title: m[1].trim(), body: m[2].trim() };
}

// Markdown -> 结构化 block 列表
function parseBlocks(md) {
  const lines = md.split('\n');
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') { blocks.push({ type: 'blank' }); i++; continue; }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) { blocks.push({ type: 'heading', text: h[2].trim() }); i++; continue; }
    if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, '')); i++; }
      blocks.push({ type: 'quote', text: buf.join('') });
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) { items.push(lines[i].replace(/^[-*]\s+/, '')); i++; }
      blocks.push({ type: 'list', items });
      continue;
    }
    blocks.push({ type: 'text', text: line.trim() });
    i++;
  }
  return blocks;
}

// 解析行内 **加粗** 为纯文本 + 字符偏移段
function parseInline(md) {
  const segs = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0, m, plain = '';
  while ((m = re.exec(md)) !== null) {
    plain += md.slice(last, m.index);
    const s = plain.length;
    plain += m[1];
    const e = plain.length;
    segs.push({ start: s, end: e });
    last = re.lastIndex;
  }
  plain += md.slice(last);
  return { plain, segs };
}

// 关闭 AI 助手抽屉（透明遮罩拦截点击）
async function dismissDrawer(page) {
  await page.evaluate(() => { const m = document.querySelector('.byte-drawer-mask'); if (m) m.click(); });
  await wait(250);
}

// 把光标确定性地放到「最后一个非空块」的末尾（Selection API，不依赖键盘导航状态）
async function caretToEndOfLastBlock(page) {
  await page.evaluate(() => {
    const pm = document.querySelector('.ProseMirror');
    if (!pm) return;
    const blocks = pm.querySelectorAll('.pgc-p, h1, h2, h3, blockquote, p');
    let block = null;
    for (const bl of blocks) { if (bl.textContent && bl.textContent.replace(/[\n\s]/g, '').length > 0) block = bl; }
    if (!block) return;
    const tns = [];
    const w = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) tns.push(n);
    const last = tns[tns.length - 1] || block;
    const off = last.nodeValue ? last.nodeValue.length : 0;
    const r = document.createRange();
    r.setStart(last, off);
    r.collapse(true);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
  });
  await wait(40);
}

// 另起一个全新空块（先确定性移光标到末尾，再 Enter）
async function newBlock(page) {
  await caretToEndOfLastBlock(page);
  await page.keyboard.press('Enter');
  await wait(60);
}

// 对「当前最后一块」按给定字符区间施加加粗（真实工具栏点击）
async function applyBold(page, segs) {
  for (const seg of [...segs].sort((a, b) => b.start - a.start)) {
    await page.evaluate((seg) => {
      const pm = document.querySelector('.ProseMirror');
      const blocks = pm.querySelectorAll('.pgc-p, h1, h2, h3, blockquote, p');
      let block = null;
      for (const bl of blocks) { if (bl.textContent && bl.textContent.replace(/[\n\s]/g, '').length > 0) block = bl; }
      if (!block) return;
      const tns = [];
      const w = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = w.nextNode())) tns.push(n);
      const nodeOff = (off) => {
        let acc = 0;
        for (const t of tns) {
          if (acc + t.nodeValue.length >= off) return { node: t, off: off - acc };
          acc += t.nodeValue.length;
        }
        const last = tns[tns.length - 1];
        return { node: last, off: last.nodeValue.length };
      };
      const a = nodeOff(seg.start), b = nodeOff(seg.end);
      const r = document.createRange();
      r.setStart(a.node, a.off);
      r.setEnd(b.node, b.off);
      const s = window.getSelection();
      s.removeAllRanges();
      s.addRange(r);
    }, seg);
    await wait(80);
    await dismissDrawer(page);
    await page.click('.syl-toolbar-tool.bold');
    await wait(150);
    await page.evaluate(() => { const s = window.getSelection(); s.collapseToEnd(); });
    await wait(50);
  }
  // 加粗后把光标确定性移回本块末尾，防止后续 Enter 在加粗处切断
  await caretToEndOfLastBlock(page);
}

async function typeBlock(page, text) {
  const { plain, segs } = parseInline(text);
  await page.keyboard.type(plain);
  if (segs.length) await applyBold(page, segs);
  await caretToEndOfLastBlock(page);
}

async function fillEditor(page, blocks) {
  await dismissDrawer(page);
  await page.click('.ProseMirror');
  await dismissDrawer(page);
  await wait(150);
  // 清空（稳健）：聚焦 -> Ctrl+A -> Delete，失败重试
  for (let c = 0; c < 3; c++) {
    await page.keyboard.down('Control'); await page.keyboard.press('A'); await page.keyboard.up('Control');
    await page.keyboard.press('Delete');
    await wait(200);
    const empty = await page.evaluate(() => {
      const pm = document.querySelector('.ProseMirror');
      return pm ? pm.innerText.replace(/[\n\s]/g, '').length === 0 : true;
    });
    if (empty) break;
  }

  let firstWritten = false;
  for (let bi = 0; bi < blocks.length; bi++) {
    const blk = blocks[bi];
    if (blk.type === 'blank') continue;
    // 先 Enter 到「全新空块」再打字（首个块除外，避免顶部空段）
    if (firstWritten) { await newBlock(page); }
    firstWritten = true;
    if (blk.type === 'heading') {
      await typeBlock(page, blk.text);
      await caretToEndOfLastBlock(page);
      await dismissDrawer(page);
      await page.click('.syl-toolbar-tool.header'); // 光标已在当前块内，整块变标题
      await wait(220);
    } else if (blk.type === 'quote') {
      await typeBlock(page, blk.text);
      await caretToEndOfLastBlock(page);
      await dismissDrawer(page);
      await page.click('.syl-toolbar-tool.block_quote');
      await wait(220);
    } else if (blk.type === 'list') {
      for (const it of blk.items) {
        await newBlock(page);
        await typeBlock(page, '· ' + it);
      }
    } else {
      await typeBlock(page, blk.text);
    }
  }
  // 末尾收尾：移动光标到最后一个块末尾（避免尾部粘连到空块）
  await caretToEndOfLastBlock(page);
  await wait(100);
}

function preview(blocks) {
  const lines = [];
  for (const blk of blocks) {
    if (blk.type === 'heading') lines.push('【标题】' + blk.text);
    else if (blk.type === 'quote') lines.push('【引用】' + blk.text);
    else if (blk.type === 'list') blk.items.forEach(it => lines.push('· ' + it));
    else if (blk.type === 'text') lines.push(blk.text);
  }
  return lines.join('\n');
}

async function main() {
  const file = process.argv[2];
  const mode = process.argv[3] || (process.env.TTC_CDP_PORT ? '--fill' : '--preview');
  if (!file) { console.error('用法: node scripts/md2toutiao.js <md文件> [--preview|--fill]'); process.exit(1); }
  const txt = fs.readFileSync(path.resolve(file), 'utf8');
  const art = parseArticle(txt);
  if (!art) { console.error('解析失败：文件需含 TITLE::: 与 BODY::: 标记'); process.exit(1); }
  const blocks = parseBlocks(art.body);

  // 若正文第一个 block 与标题相同（重复 H1），去掉，避免标题重复显示
  if (blocks.length && blocks[0].type === 'heading' && blocks[0].text === art.title) {
    blocks.shift();
  }

  if (mode === '--preview' || !process.env.TTC_CDP_PORT) {
    console.log('=== 标题 ===\n' + art.title);
    console.log('=== 正文（转后预览，将真实施加样式） ===\n' + preview(blocks));
    console.log('\n[blocks] ' + blocks.map(b => b.type).join(','));
    return;
  }

  // fill 模式
  let browser;
  try {
    const { browser: b, page } = await connectToutiaoPage();
    browser = b;
    // 标题
    await page.evaluate(({ t, helper }) => {
      eval(helper);
      const el = document.querySelector('.editor-title textarea') ||
                 document.querySelector('textarea[placeholder*="标题"]');
      if (el) nativeSet(el, t);
    }, { t: art.title, helper: NATIVE_SETTER_HELPER });
    await fillEditor(page, blocks);
    // 核验
    const r = await page.evaluate(() => {
      const pm = document.querySelector('.ProseMirror');
      return {
        bodyLen: pm ? pm.innerText.length : 0,
        hasH1: !!(pm && pm.querySelector('h1')),
        hasStrong: !!(pm && pm.querySelector('strong')),
        hasQuote: !!(pm && pm.querySelector('blockquote')),
        html: pm ? pm.innerHTML.slice(0, 300) : ''
      };
    });
    fs.writeFileSync(path.resolve(path.dirname(file), '..', 'content', '_md2tt.log'),
      JSON.stringify({ title: art.title, ...r }, null, 2) + '\n');
    console.log('FILL_OK', JSON.stringify(r));
    process.exit(0);
  } catch (e) {
    console.error('FILL_ERROR:', e.message);
    process.exit(1);
  }
}
main();
