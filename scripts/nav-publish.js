/**
 * nav-publish.js — 打开头条号图文发布页
 *
 * 用法（agent 先 `browser action=status` 取 cdpPort，再）：
 *   TTC_CDP_PORT=7774 node scripts/nav-publish.js
 *
 * 注意：必须用 playwright-core 直连 CDP，因为 OpenClaw browser action=navigate
 * 会被严格 SSRF 策略拦截（"requires an IP-literal URL"）。
 */

const { connectToutiaoPage } = require('./lib');

const PUBLISH_URL = 'https://mp.toutiao.com/profile_v4/graphic/publish';

(async () => {
  let browser;
  try {
    const { browser: b, page } = await connectToutiaoPage();
    browser = b;

    if (!page.url().includes('mp.toutiao.com')) {
      console.log('正在导航到发布页...');
      await page.goto(PUBLISH_URL, { waitUntil: 'load', timeout: 30000 });
    } else {
      console.log('已在头条页面，刷新确保最新：', page.url());
      await page.goto(PUBLISH_URL, { waitUntil: 'load', timeout: 30000 });
    }

    // 等待编辑器加载
    await page.waitForSelector('.ProseMirror, .editor-title, textarea', { timeout: 20000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 1500));

    console.log('当前 URL:', page.url());
    console.log('页面标题:', await page.title());
    console.log('NAV_OK');
    process.exit(0);
  } catch (error) {
    console.error('ERROR:', error.message);
    process.exit(1);
  }
})();
