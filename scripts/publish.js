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

// 强制隐藏 AI 助手抽屉（.ai-assistant-drawer 即便「hide」状态，其 textarea 仍驻留 DOM 并拦截指针事件，
// 会导致 page.click 被遮罩拦截、发布无反应）。点击前必须确定性地隐藏它。
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
    await dismissDrawer(page);
    const c1 = await clickByText(page, '预览并发布');
    if (!c1) { console.error('ERROR: 未找到「预览并发布」'); process.exit(1); }
    console.log('CLICKED_PREVIEW');
    await new Promise(r => setTimeout(r, 6000)); // 等预览弹窗渲染

    // 2) 确认发布（二次弹窗）
    await dismissDrawer(page);
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
