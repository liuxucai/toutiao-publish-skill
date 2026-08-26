const fs = require('fs');
const { connectToutiaoPage } = require('./lib');
const wait = ms => new Promise(r => setTimeout(r, ms));
const charLen = s => [...s].length;
async function resetBold(page){
  await page.click('.syl-toolbar-tool.bold'); await wait(120);
  await page.click('.syl-toolbar-tool.bold'); await wait(120);
}
async function typeInline(page, text){
  await resetBold(page);
  const re=/\*\*(.+?)\*\*/g; let last=0,m; const parts=[];
  while((m=re.exec(text))!==null){ if(m.index>last) parts.push({t:text.slice(last,m.index),b:false}); parts.push({t:m[1],b:true}); last=re.lastIndex; }
  if(last<text.length) parts.push({t:text.slice(last),b:false});
  let prev=false;
  for(const p of parts){
    await page.keyboard.type(p.t);
    if(p.b&&p.t){ const len=charLen(p.t); await page.keyboard.down('Shift'); for(let k=0;k<len;k++)await page.keyboard.press('ArrowLeft'); await page.keyboard.up('Shift'); await page.click('.syl-toolbar-tool.bold'); await wait(180); await page.keyboard.press('ArrowRight'); prev=true; }
    else { if(prev&&p.t){ const len=charLen(p.t); await page.keyboard.down('Shift'); for(let k=0;k<len;k++)await page.keyboard.press('ArrowLeft'); await page.keyboard.up('Shift'); await page.click('.syl-toolbar-tool.bold'); await wait(180); await page.keyboard.press('ArrowRight'); } prev=false; }
  }
}
(async()=>{
  let browser; const {browser:b,page}=await connectToutiaoPage(); browser=b;
  await page.click('.ProseMirror'); await wait(150);
  for(let c=0;c<3;c++){await page.keyboard.down('Control');await page.keyboard.press('A');await page.keyboard.up('Control');await page.keyboard.press('Delete');await wait(150);}
  const log={};
  await typeInline(page,'A说**B海**C');
  log.after1=await page.evaluate(()=>document.querySelector('.ProseMirror').innerHTML.slice(0,200));
  await page.keyboard.press('Enter');
  await typeInline(page,'D说**E月**');
  log.after2=await page.evaluate(()=>document.querySelector('.ProseMirror').innerHTML.slice(0,300));
  fs.writeFileSync('E:/skills/toutiao-publish/content/_dbgb.log',JSON.stringify(log,null,2)+'\n');
  await browser.close(); process.exit(0);
})();
