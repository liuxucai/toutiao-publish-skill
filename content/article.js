const { connectToutiaoPage, NATIVE_SETTER_HELPER } = require('../scripts/lib');

const title = '九九敬老节将至：别让"忙"成为我们忽略父母的借口';

const body = `昨天路过小区凉亭，看见张姨一个人坐着，手机举得老高，对着屏幕反复点。我上前一看，她在翻儿子的朋友圈，最新一条是三个月前的。

她不好意思地笑："也不是想打扰，就是想看看他最近好不好。"

那一刻我突然鼻子一酸。我们总说忙，忙工作、忙孩子、忙自己的小日子，却忘了父母的世界里，我们就是最大的事。

敬老，从来不是什么隆重的仪式。它藏在很多不起眼的小事里。

一通电话，比什么礼物都踏实。不用汇报成绩，就说说今天吃了什么、天气凉了添件衣。对父母来说，听见你的声音，这一天就亮了。

一次耐心的教。他们学不会智能手机、搞不懂视频通话，不是笨，是没人慢慢教过。你少一点"怎么连这都不会"，多一点"来，我教你"，他们的晚年就能少一分孤单。

一顿家常饭。不必山珍海味，你回家吃的那顿饭，是他们盼了很久的节日。

其实父母要的很少。他们怕的不是清贫，是被遗忘；怕的不是年老，是成了子女的负担。

九九敬老节快到了。别等节日当天才想起来发个红包、转篇文章。真正的敬老，是把"等有时间"变成"现在就打"。

今天，就给爸妈打个电话吧。哪怕只说一句：妈，爸，我挺好的，你们也要注意身体。`;

(async () => {
  let browser;
  try {
    const { browser: b, page } = await connectToutiaoPage();
    browser = b;

    // 标题
    const ok = await page.evaluate(({ t, helper }) => {
      eval(helper);
      const el = document.querySelector('.editor-title textarea') ||
                 document.querySelector('textarea[placeholder*="标题"]');
      return nativeSet(el, t);
    }, { t: title, helper: NATIVE_SETTER_HELPER });
    console.log(ok ? 'TITLE_OK' : 'TITLE_NOT_FOUND');

    // 正文 ProseMirror 键盘输入
    await page.evaluate(() => { const el = document.querySelector('.ProseMirror'); if (el) { el.click(); el.focus(); } });
    await new Promise(r => setTimeout(r, 400));
    const paragraphs = String(body).split('\n\n').map(p => p.trim()).filter(Boolean);
    for (let i = 0; i < paragraphs.length; i++) {
      await page.keyboard.type(paragraphs[i]);
      await new Promise(r => setTimeout(r, 60));
      if (i < paragraphs.length - 1) {
        await page.keyboard.press('Enter');
        await new Promise(r => setTimeout(r, 60));
        await page.keyboard.press('Enter');
        await new Promise(r => setTimeout(r, 60));
      }
    }
    console.log('BODY_OK paragraphs=' + paragraphs.length);
    process.exit(0);
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exit(1);
  }
})();
