const fs = require('fs');
const { connectToutiaoPage } = require('./lib');
const wait = ms => new Promise(r => setTimeout(r, ms));
function stripAndSegments(md){
  const segs=[]; const re=/\*\*(.+?)\*\*/g; let last=0,m; let plain='';
  while((m=re.exec(md))!==null){
    plain+=md.slice(last,m.index);
    const s=plain.length; plain+=m[1]; const e=plain.length;
    segs.push({start:s,end:e});
    last=re.lastIndex;
  }
  plain+=md.slice(last);
  return {plain,segs};
}
async function applyBoldRanges(page, segs){
  await page.evaluate((segs)=>{
    const pm=document.querySelector('.ProseMirror');
    const blocks=pm.querySelectorAll('.pgc-p, h1, h2, h3, blockquote');
    let block=blocks[blocks.length-1]; // 当前最后一块
    if(!block) return;
    const textNodes=[]; const w=document.createTreeWalker(block, NodeFilter.SHOW_TEXT); let n;
    while((n=w.nextNode())) textNodes.push(n);
    function nodeAndOffset(off){
      let acc=0;
      for(const tn of textNodes){
        if(acc+tn.nodeValue.length>=off) return {node:tn, off:off-acc};
        acc+=tn.nodeValue.length;
      }
      const last=textNodes[textNodes.length-1];
      return {node:last, off:last.nodeValue.length};
    }
    function selectRange(start,end){
      const a=nodeAndOffset(start), b=nodeAndOffset(end);
      const r=document.createRange(); r.setStart(a.node,a.off); r.setEnd(b.node,b.off);
      const s=window.getSelection(); s.removeAllRanges(); s.addRange(r);
      document.execCommand('bold');
    }
    const sorted=[...segs].sort((a,b)=>b.start-a.start); // 右到左，避免分裂节点导致偏移漂移
    for(const seg of sorted) selectRange(seg.start, seg.end);
    // 收起选区到块尾
    const r=document.createRange(); r.selectNodeContents(block); r.collapse(false);
    const s=window.getSelection(); s.removeAllRanges(); s.addRange(r);
  }, segs);
  await wait(120);
}
(async()=>{
  let browser; const {browser:b,page}=await connectToutiaoPage(); browser=b;
  await page.click('.ProseMirror'); await wait(150);
  for(let c=0;c<3;c++){await page.keyboard.down('Control');await page.keyboard.press('A');await page.keyboard.up('Control');await page.keyboard.press('Delete');await wait(150);}
  const log={};
  let tests=['· 说思念，不直说想你，说**"海上生明月，天涯共此时"**','· 说豁达，不写无所谓，写**"竹杖芒鞋轻胜马，谁怕？一蓑烟雨任平生"**','A说**B海**C','它给情绪一个**出口**'];
  for(const t of tests){
    const {plain,segs}=stripAndSegments(t);
    await page.keyboard.type(plain);
    await applyBoldRanges(page, segs);
    await page.keyboard.press('Enter');
  }
  log.after=await page.evaluate(()=>document.querySelector('.ProseMirror').innerHTML.slice(0,900));
  fs.writeFileSync('E:/skills/toutiao-publish/content/_dbgg.log',JSON.stringify(log,null,2)+'\n');
  await browser.close(); process.exit(0);
})();
