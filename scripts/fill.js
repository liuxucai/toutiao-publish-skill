/**
 * fill.js — 填写标题与正文
 *
 * 用法：
 *   TTC_CDP_PORT=7774 node scripts/fill.js "<标题>" "<正文(用 \n\n 分段)>"
 *
 * 要点：
 * - 标题（React 受控 textarea）：用 nativeInputValueSetter + dispatchEvent，否则 React 不感知。
 * - 正文（ProseMirror）：只认键盘输入，必须 keyboard.type 逐字；段落间按两次 Enter。
 *   严禁 innerHTML 赋值（编辑器会显示空白）。
 */

const { connectToutiaoPage, NATIVE_SETTER_HELPER } = require('./lib');

(async () => {
  const title = process.argv[2] || '';
  const body = process.argv[3] || '';
  let browser;
  try {
    const { browser: b, page } = await connectToutiaoPage();
    browser = b;

    // 1) 标题
    if (title) {
      const ok = await page.evaluate(({ t, helper }) => {
        eval(helper);
        const el = document.querySelector('.editor-title textarea') ||
                   document.querySelector('textarea[placeholder*="标题"]');
        return nativeSet(el, t);
      }, { t: title, helper: NATIVE_SETTER_HELPER });
      console.log(ok ? 'TITLE_OK' : 'TITLE_NOT_FOUND');
    }

    // 2) 正文（ProseMirror 键盘输入）
    if (body) {
      await page.evaluate(() => {
        const el = document.querySelector('.ProseMirror');
        if (el) { el.click(); el.focus(); }
      });
      await new Promise(r => setTimeout(r, 400));

      const paragraphs = String(body).split('\n\n').map(p => p.trim()).filter(Boolean);
      for (let i = 0; i < paragraphs.length; i++) {
        await page.keyboard.type(paragraphs[i]);
        await new Promise(r => setTimeout(r, 80));
        if (i < paragraphs.length - 1) {
          await page.keyboard.press('Enter');
          await new Promise(r => setTimeout(r, 80));
          await page.keyboard.press('Enter'); // 双 Enter 产生段落间距
          await new Promise(r => setTimeout(r, 80));
        }
      }
      console.log('BODY_OK paragraphs=' + paragraphs.length);
    }

    process.exit(0);
  } catch (error) {
    console.error('ERROR:', error.message);
    process.exit(1);
  }
})();
