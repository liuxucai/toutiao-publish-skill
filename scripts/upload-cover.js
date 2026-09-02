/**
 * upload-cover.js — 选「单图」并上传封面（头条真实交互）
 *
 * 用法：TTC_CDP_PORT=7774 node scripts/upload-cover.js <封面本地绝对路径>
 *
 * 头条封面上传真实机制（已在 2026-07-20 实测）：
 * 1. 点「单图」radio
 * 2. 点 .article-cover-add（虚线加号块）→ 弹出上传弹窗，弹窗内才有 file input(#upload-drag-input)
 * 3. 弹窗中点击「本地上传」按钮 → 触发系统选择框 → Playwright filechooser.setFiles()
 * 4. 等上传处理，点弹窗「确定」把图插入封面区
 * 注意：选「单图」但不传图 → 前端拦截发布，按钮点不动。
 */

const fs = require('fs');
const { connectToutiaoPage } = require('./lib');

// 同 publish.js：AI 助手抽屉即便隐藏也会拦截指针事件，点上傳按钮前先确定性隐藏它
async function dismissDrawer(page) {
  await page.evaluate(() => {
    const sel = ['.byte-drawer-wrapper', '.ai-assistant-drawer', '.byte-drawer-mask', '.byte-drawer-wrapper-hide'];
    for (const s of sel) {
      document.querySelectorAll(s).forEach(el => { el.style.display = 'none'; el.style.pointerEvents = 'none'; });
    }
    document.querySelectorAll('.ai-assistant-drawer textarea, .byte-drawer-wrapper textarea').forEach(t => {
      t.style.display = 'none'; t.style.pointerEvents = 'none';
    });
  });
  await new Promise(r => setTimeout(r, 300));
}

(async () => {
  const coverPath = process.argv[2];
  if (!coverPath) { console.error('ERROR: 缺少封面路径参数'); process.exit(1); }
  if (!fs.existsSync(coverPath)) { console.error('ERROR: 封面不存在:', coverPath); process.exit(1); }

  let browser;
  try {
    const { browser: b, page } = await connectToutiaoPage();
    browser = b;
    await dismissDrawer(page);

    // 幂等：封面区已有图片则跳过
    const already = await page.evaluate(() => {
      const wrap = document.querySelector('.article-cover-images-wrap');
      return !!(wrap && wrap.querySelector('img'));
    });
    if (already) { console.log('COVER_ALREADY_OK'); process.exit(0); }

    // 1) 选「单图」
    const sel = await page.evaluate(() => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
      let n;
      while ((n = walker.nextNode())) { if (n.textContent.trim() === '单图') { n.parentElement.click(); return true; } }
      return false;
    });
    console.log(sel ? 'SELECT_SINGLE_OK' : 'SELECT_SINGLE_NOT_FOUND');
    await new Promise(r => setTimeout(r, 600));

    // 2) 点 .article-cover-add 开弹窗
    await page.evaluate(() => { const el = document.querySelector('.article-cover-add'); if (el) el.click(); });
    console.log('OPEN_COVER_MODAL');
    await new Promise(r => setTimeout(r, 1500));

    // 3) 长按 filechooser：点「本地上传」(.upload-btn) 会触发 input[type=file] 的系统选择框
    const fcPromise = page.waitForEvent('filechooser', { timeout: 15000 }).catch(() => null);
    let clicked = false;
    for (let attempt = 0; attempt < 5 && !clicked; attempt++) {
      try {
        // 等元素稳定再点，避免弹窗重渲染导致 Element is not attached
        await page.waitForSelector('.upload-btn', { state: 'attached', timeout: 3000 });
        const btn = await page.$(`.upload-btn:visible, .upload-btn`);
        const handle = await page.waitForSelector('.upload-btn', { state: 'visible', timeout: 3000 }).catch(() => null);
        if (handle) { await handle.click({ timeout: 4000 }); clicked = true; }
      } catch (e) {
        await new Promise(r => setTimeout(r, 800));
      }
    }
    if (!clicked) { console.error('ERROR: 未能点击「本地上传」按钮(.upload-btn)'); process.exit(1); }
    const fc = await fcPromise;
    if (!fc) { console.error('ERROR: 未捕获 filechooser（本地上传未触发文件选择）'); process.exit(1); }
    await fc.setFiles(coverPath);
    console.log('COVER_UPLOADED');

    // 5) 等处理（上传+生成缩略图），再点弹窗「确定」
    await new Promise(r => setTimeout(r, 6000));
    const ok = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const btn = btns.find(b => ['确定', '使用', '插入', '保存'].includes(b.textContent.trim()));
      if (btn) { btn.click(); return btn.textContent.trim(); }
      return null;
    });
    console.log(ok ? ('COVER_CONFIRM_OK=' + ok) : 'COVER_CONFIRM_NOTFOUND(retry below)');
    if (!ok) {
      // 兜底：等更久再点一次
      await new Promise(r => setTimeout(r, 4000));
      const ok2 = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const btn = btns.find(b => ['确定', '使用', '插入', '保存'].includes(b.textContent.trim()));
        if (btn) { btn.click(); return btn.textContent.trim(); }
        return null;
      });
      console.log(ok2 ? ('COVER_CONFIRM_OK2=' + ok2) : 'COVER_CONFIRM_GAVEUP');
    }
    await new Promise(r => setTimeout(r, 1500));

    // 验证：封面区出现图片
    const hasImg = await page.evaluate(() => {
      const wrap = document.querySelector('.article-cover-images-wrap');
      return !!(wrap && wrap.querySelector('img'));
    });
    console.log(hasImg ? 'COVER_INSERTED_OK' : 'COVER_NOT_INSERTED(warn)');
    process.exit(0);
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exit(1);
  }
})();
