/**
 * md2toutiao.js — 把 Markdown 文章转换为头条号「可渲染」格式并填入编辑器。
 *
 * 问题背景（必读）：
 *   头条号编辑器（syl editor / ProseMirror）【不渲染 Markdown 语法】。
 *   直接 typescript 进 `# 标题`、`**加粗**`、`> 引用`、`- 列表` 会以原文原样显示，
 *   读者看到的是一堆 #、*、> 符号，而不是标题/加粗/引用/列表样式。
 *   本脚本把 Markdown 解析为结构化 block，再用编辑器自带工具栏工具
 *   （header / bold / block_quote）施加【真实样式】，列表降级为「• 」项目符号文本。
 *
 * 用法：
 *   # 仅预览转换结果（不连浏览器），用于核验：
 *   node scripts/md2toutiao.js content/article_neon.txt --preview
 *
 *   # 连接浏览器并真实填入（需先 nav-publish 到发布页，且设 TTC_CDP_PORT）：
 *   TTC_CDP_PORT=12257 node scripts/md2toutiao.js content/article_neon.txt --fill
 *
 * 输入文件格式（与 fill.js 兼容）：
 *   TITLE:::标题
 *   BODY:::正文（Markdown）
 */
const fs = require('fs');
const path = require('path');
const { connectToutiaoPage } = require('./lib');

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

// 确保当前光标处不是加粗态（每次 block 开头调用，清除上一段遗留的 stored marks）
async function resetBold(page) {
  // 空块内连点两次 bold：第一次置存储标记=加粗，第二次清除，净效果=非加粗
  await page.click('.syl-toolbar-tool.bold');
  await wait(120);
  await page.click('.syl-toolbar-tool.bold');
  await wait(120);
}

// 把含 **加粗** 的文本逐段键入，加粗部分用工具栏真实施加
async function typeWithInline(page, text) {
  await resetBold(page); // 每个 block 开头清掉继承来的加粗
  const re = /\*\*(.+?)\*\*/g;
  let last = 0, m;
  const parts = [];
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ t: text.slice(last, m.index), b: false });
    parts.push({ t: m[1], b: true });
    last = re.lastIndex;
  }
  if (last < text.length) parts.push({ t: text.slice(last), b: false });

  let prevWasBold = false;
  for (const p of parts) {
    await page.keyboard.type(p.t);
    if (p.b && p.t) {
      const len = charLen(p.t);
      await page.keyboard.down('Shift');
      for (let k = 0; k < len; k++) await page.keyboard.press('ArrowLeft');
      await page.keyboard.up('Shift');
      await page.click('.syl-toolbar-tool.bold'); // 真实鼠标点击，施加加粗
      await wait(180);
      await page.keyboard.press('ArrowRight'); // 收起选区（落在加粗段末尾）
      prevWasBold = true;
    } else {
      // 纯文字段：若前一段是加粗，则本段会被 ProseMirror 继承加粗标记 → 重新选中关掉
      if (prevWasBold && p.t) {
        const len = charLen(p.t);
        await page.keyboard.down('Shift');
        for (let k = 0; k < len; k++) await page.keyboard.press('ArrowLeft');
        await page.keyboard.up('Shift');
        await page.click('.syl-toolbar-tool.bold'); // 再次点击 = 切换关闭加粗
        await wait(180);
        await page.keyboard.press('ArrowRight');
      }
      prevWasBold = false;
    }
  }
}

async function nextBlock(page) {
  // 段落间单 Enter 即另起一段（编辑器 <p> 自带间距，无需双 Enter 制造空段）
  await page.keyboard.press('Enter');
}

async function fillEditor(page, blocks) {
  // 清空（稳健）：聚焦 -> Ctrl+A -> Delete，失败重试
  await page.click('.ProseMirror');
  await wait(150);
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

  for (const blk of blocks) {
    if (blk.type === 'blank') { continue; }
    if (blk.type === 'heading') {
      // 关键：不要选中整行再点工具——ProseMirror 在「选中态」下按 Enter 会删掉文字。
      // 正确做法：打完字光标在行尾，直接点 header 工具，整块变标题，再 Enter 换行。
      await typeWithInline(page, blk.text);
      await page.click('.syl-toolbar-tool.header');
      await wait(250);
      await nextBlock(page);
    } else if (blk.type === 'quote') {
      await typeWithInline(page, blk.text);
      await page.click('.syl-toolbar-tool.block_quote');
      await wait(250);
      await nextBlock(page);
    } else if (blk.type === 'list') {
      for (const it of blk.items) {
        await typeWithInline(page, '• ' + it);
        await nextBlock(page);
      }
    } else {
      await typeWithInline(page, blk.text);
      await nextBlock(page);
    }
  }
}

function preview(blocks) {
  const lines = [];
  for (const blk of blocks) {
    if (blk.type === 'heading') lines.push('【标题】' + blk.text);
    else if (blk.type === 'quote') lines.push('【引用】' + blk.text);
    else if (blk.type === 'list') blk.items.forEach(it => lines.push('• ' + it));
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
    }, { t: art.title, helper: require('./lib').NATIVE_SETTER_HELPER });
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
