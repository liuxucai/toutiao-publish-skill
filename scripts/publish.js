/**
 * publish.js — 点击发布并验证
 *
 * 用法：
 *   TTC_CDP_PORT=7774 node scripts/publish.js
 *
 * 头条发布是「两步」：
 *   1) 点「预览并发布」→ 弹出预览模态框（等 6s）
 *   2) 模态框内点「确认发布」→ 真正发布
 * 注意：不要误点旁边的「定时发布」。
 */

const { connectToutiaoPage } = require('./lib');

async function clickByText(page, text, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const clicked = await page.evaluate(({ t }) => {
      const btns = Array.from(document.querySelectorAll('button'));
      const btn = btns.find(b => b.textContent.trim() === t);
      if (btn) { btn.click(); return true; }
      return false;
    }, { t: text });
    if (clicked) return true;
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

(async () => {
  let browser;
  try {
    const { browser: b, page } = await connectToutiaoPage();
    browser = b;

    // 1) 预览并发布
    const c1 = await clickByText(page, '预览并发布');
    if (!c1) { console.error('ERROR: 未找到「预览并发布」'); process.exit(1); }
    console.log('CLICKED_PREVIEW');
    await new Promise(r => setTimeout(r, 6000)); // 等预览弹窗渲染

    // 2) 确认发布（二次弹窗）
    const c2 = await clickByText(page, '确认发布');
    if (!c2) { console.error('ERROR: 未找到「确认发布」(二次弹窗可能未出现)'); process.exit(1); }
    console.log('CLICKED_CONFIRM');
    await new Promise(r => setTimeout(r, 5000));

    // 3) 验证
    const url = page.url();
    console.log('FINAL_URL:', url);
    if (url.includes('/articles')) {
      console.log('PUBLISH_OK');
      process.exit(0);
    } else {
      console.log('PUBLISH_UNVERIFIED(url did not jump to /articles)');
      process.exit(2);
    }
  } catch (error) {
    console.error('ERROR:', error.message);
    process.exit(1);
  }
})();
