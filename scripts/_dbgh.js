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
    const block=blocks[blocks.length-1];
    const w=document.createTreeWalker(block, NodeFilter.SHOW_TEXT); let n; const nodes=[];
    while((n=w.nextNode())) nodes.push({txt:n.nodeValue, len:n.nodeValue.length});
    return {textContent:block.textContent, nodes};
  });
  fs.writeFileSync('E:/skills/toutiao-publish/content/_dbgh.log',JSON.stringify(log,null,2)+'\n');
  await browser.close(); process.exit(0);
})();
