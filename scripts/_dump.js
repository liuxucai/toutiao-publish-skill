const fs = require('fs');
const { connectToutiaoPage } = require('./lib');
(async () => {
  let browser;
  const { browser: b, page } = await connectToutiaoPage(); browser = b;
  const r = await page.evaluate(() => {
    const pm = document.querySelector('.ProseMirror');
    return { bodyLen: pm ? pm.innerText.length : 0, bodyText: pm ? pm.innerText : '' };
  });
  fs.writeFileSync('E:/skills/toutiao-publish/content/_dump.log', JSON.stringify(r, null, 2) + '\n');
  await browser.close();
  process.exit(0);
})();
