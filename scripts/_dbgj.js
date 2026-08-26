const fs = require('fs');
const { connectToutiaoPage } = require('./lib');
const wait = ms => new Promise(r => setTimeout(r, ms));
(async()=>{
  let browser; const {browser:b,page}=await connectToutiaoPage(); browser=b;
  await page.click('.ProseMirror'); await wait(150);
  for(let c=0;c<3;c++){await page.keyboard.down('Control');await page.keyboard.press('A');await page.keyboard.up('Control');await page.keyboard.press('Delete');await wait(150);}
  await page.keyboard.press('Enter'); await wait(100);
  await page.keyboard.type('A说B海C');
  const log=await page.evaluate(()=>{
    const pm=document.querySelector('.ProseMirror');
    const blocks=pm.querySelectorAll('.pgc-p, h1, h2, h3, blockquote');
    // 找最后一个有非空文本的块
    let block=null;
    for(const bl of blocks){ if(bl.textContent && bl.textContent.length>0) block=bl; }
    const r=document.createRange(); r.selectNodeContents(block);
    const s=window.getSelection(); s.removeAllRanges(); s.addRange(r);
    const before=block.innerHTML;
    const ok=document.execCommand('bold');
    const after=block.innerHTML;
    let qs=false; try{qs=document.queryCommandState('bold');}catch(e){}
    return {ok, before, after, queryState: qs, blockCount: blocks.length};
  });
  fs.writeFileSync('E:/skills/toutiao-publish/content/_dbgj.log',JSON.stringify(log,null,2)+'\n');
  await browser.close(); process.exit(0);
})();
