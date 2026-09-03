/**
 * publish.js — 点击发布并验证（带发布状态机 + 重试前先核验「已发布」列表）
 *
 * 用法：
 *   TTC_CDP_PORT=<port> node scripts/publish.js
 *
 * 头条发布是「两步」：
 *   1) 点「预览并发布」→ 弹出预览模态框（等 6s）
 *   2) 模态框内点「确认发布」→ 真正发布
 * 注意：不要误点旁边的「定时发布」。
 *
 * 发布状态机（关键）：
 *   IDLE        初始
 *   PUBLISHING  已点击发布按钮（预览并发布 + 确认发布）
 *   SUCCESS     页面跳转到 /articles，或在「内容管理 → 已发布」列表核验到该文章已在列
 *   RETRYING    未跳转且核验未发布，准备重新尝试
 *   FAILED      超过最大尝试次数仍无法确认发布成功
 *
 * 重试规则（已实测，防重复发布）：
 *   - 两次点击发布按钮间隔 ≥ 10 秒（最快 10 秒 1 次）
 *   - 页面未跳转时，**先去「内容管理 → 已发布」列表核验**，确认未发布才重试；
 *     绝不直接补点（卡很久后补点会发重复，第一次往往已成功）
 *   - 即使再次发布失败，也按此规则继续尝试（循环，直到确认成功或超过上限）
 */

const { connectToutiaoPage } = require('./lib');
const wait = ms => new Promise(r => setTimeout(r, ms));

const PUBLISH_URL = 'https://mp.toutiao.com/profile_v4/graphic/publish';
const ARTICLES_URL = 'https://mp.toutiao.com/profile_v4/graphic/articles';
const MAX_ATTEMPTS = 6;          // 含首次共最多 6 次尝试
const RETRY_INTERVAL = 10000;    // 重试间隔 10 秒（符合「最快 10 秒 1 次」）

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

// 取编辑器标题前若干字作为核验特征（避免整串过长匹配不到；标题短则用全长）
async function getTitleFragment(page) {
  const title = await page.evaluate(() => {
    const t = document.querySelector('.editor-title textarea') || document.querySelector('textarea[placeholder*="标题"]');
    return t ? t.value.trim() : '';
  });
  if (!title) return '';
  return title.slice(0, Math.min(12, title.length));
}

// 用独立页签核验「已发布」列表是否已有该文章（不离开当前发布页，避免编辑器内容丢失）
async function verifyPublished(browser, fragment) {
  if (!fragment) return false;
  try {
    const ctx = browser.contexts()[0];
    const vpage = await ctx.newPage();
    try {
      await vpage.goto(ARTICLES_URL, { waitUntil: 'load', timeout: 20000 });
      await wait(3500);
      const found = await vpage.evaluate((frag) => {
        const body = document.body ? document.body.innerText : '';
        return body.includes(frag);
      }, fragment);
      return found;
    } finally {
      await vpage.close().catch(() => {});
    }
  } catch (e) {
    return false;
  }
}

// 重试前回到发布编辑态：关弹窗、确保在发布页、编辑器有内容
async function ensurePublishPage(page) {
  await page.keyboard.press('Escape').catch(() => {});
  await wait(800);
  await dismissDrawer(page);
  const url = page.url();
  if (!url.includes('/graphic/publish')) {
    await page.goto(PUBLISH_URL, { waitUntil: 'load', timeout: 30000 });
    await wait(3000);
  }
  await page.waitForSelector('.ProseMirror', { timeout: 8000 }).catch(() => {});
  const hasBody = await page.evaluate(() => {
    const pm = document.querySelector('.ProseMirror');
    return !!(pm && pm.innerText.trim().length > 0);
  });
  return hasBody;
}

(async () => {
  let browser;
  try {
    const { browser: b, page } = await connectToutiaoPage();
    browser = b;
    console.log('STATE:IDLE');

    await dismissDrawer(page);
    const fragment = await getTitleFragment(page);
    let attempt = 0;

    while (attempt < MAX_ATTEMPTS) {
      attempt++;
      console.log('STATE:PUBLISHING attempt=' + attempt);

      // 1) 预览并发布
      await dismissDrawer(page);
      const c1 = await clickByText(page, '预览并发布');
      if (!c1) { console.error('ERROR: 未找到「预览并发布」'); process.exit(1); }
      console.log('CLICKED_PREVIEW attempt=' + attempt);
      await wait(6000); // 等预览弹窗渲染

      // 2) 确认发布（二次弹窗）
      await dismissDrawer(page);
      const c2 = await clickByText(page, '确认发布');
      if (!c2) {
        console.log('WARN: 未找到「确认发布」(二次弹窗可能未出现)，继续等待跳转');
      } else {
        console.log('CLICKED_CONFIRM attempt=' + attempt);
      }
      await wait(5000);

      // 3) 页面跳转即成功
      const url = page.url();
      if (url.includes('/articles')) {
        console.log('STATE:SUCCESS reason=url_jump url=' + url);
        process.exit(0);
      }

      // 4) 未跳转 → 先核验「已发布」列表
      console.log('STATE:NOT_JUMPED_VERIFYING');
      const published = await verifyPublished(browser, fragment);
      if (published) {
        console.log('STATE:SUCCESS reason=list_found');
        process.exit(0);
      }

      // 5) 核验未发布 → 重新尝试（先回到编辑态）
      if (attempt >= MAX_ATTEMPTS) {
        console.log('STATE:FAILED reason=max_attempts titleFragment=' + fragment);
        process.exit(2);
      }
      console.log('STATE:RETRYING nextAttempt=' + (attempt + 1) + ' (wait ' + (RETRY_INTERVAL / 1000) + 's)');
      await wait(RETRY_INTERVAL);

      const ok = await ensurePublishPage(page);
      if (!ok) {
        console.error('ERROR: 编辑器内容丢失，无法重试，请重新 fill 后再发布');
        process.exit(1);
      }
    }
  } catch (error) {
    console.error('ERROR:', error.message);
    process.exit(1);
  }
})();
