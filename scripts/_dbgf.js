const fs = require('fs');
const { connectToutiaoPage } = require('./lib');
const wait = ms => new Promise(r => setTimeout(r, ms));
async function ensureBold(page, want){
  const isBold = await page.evaluate(()=>{ try { return document.queryCommandState('bold'); } catch(e){ return false; } });
  if (isBold !== want) { await page.click('.syl-toolbar-tool.bold'); await wait(140); }
}
async function typeInline(page, text){
  const re=/\*\*(.+?)\*\*/g; let last=0,m; const parts=[];
  while((m=re.exec(text))!==null){ if(m.index>last) parts.push({t:text.slice(last,m.index),b:false}); parts.push({t:m[1],b:true}); last=re.lastIndex; }
  if(last<text.length) parts.push({t:text.slice(last),b:false});
  for(const p of parts){
    if(p.b){ await ensureBold(page,true); await page.keyboard.type(p.t); await ensureBold(page,false); }
    else { await ensureBold(page,false); await page.keyboard.type(p.t); }
  }
}
(async()=>{
  let browser; const {browser:b,page}=await connectToutiaoPage(); browser=b;
  await page.click('.ProseMirror'); await wait(150);
  for(let c=0;c<3;c++){await page.keyboard.down('Control');await page.keyboard.press('A');await page.keyboard.up('Control');await page.keyboard.press('Delete');await wait(150);}
  const log={};
  await page.keyboard.press('Enter');
  await typeInline(page,'· 说思念，不直说想你，说**"海上生明月，天涯共此时"**');
  await page.keyboard.press('Enter');
  await typeInline(page,'· 说豁达，不写无所谓，写**"竹杖芒鞋轻胜马，谁怕？一蓑烟雨任平生"**');
  await page.keyboard.press('Enter');
  await typeInline(page,'A说**B海**C');
  await page.keyboard.press('Enter');
  await typeInline(page,'它给情绪一个**出口**');
  log.after=await page.evaluate(()=>document.querySelector('.ProseMirror').innerHTML.slice(0,800));
  fs.writeFileSync('E:/skills/toutiao-publish/content/_dbgf.log',JSON.stringify(log,null,2)+'\n');
  await browser.close(); process.exit(0);
})();
