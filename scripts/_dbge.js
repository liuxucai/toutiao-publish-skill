const fs = require('fs');
const { connectToutiaoPage } = require('./lib');
const wait = ms => new Promise(r => setTimeout(r, ms));
async function clickBold(page){ await page.click('.syl-toolbar-tool.bold'); await wait(150); }
async function typeInline(page, text){
  // 存储标记法：用工具栏 bold 的"开/关"切换，不依赖选区，避免删字
  // 假设进入本函数时光标处于「非加粗」态（caller 在每个 block 开头 resetBold 过）
  const re=/\*\*(.+?)\*\*/g; let last=0,m; const parts=[];
  while((m=re.exec(text))!==null){ if(m.index>last) parts.push({t:text.slice(last,m.index),b:false}); parts.push({t:m[1],b:true}); last=re.lastIndex; }
  if(last<text.length) parts.push({t:text.slice(last),b:false});
  for(const p of parts){
    if(p.b){
      await clickBold(page);            // 开
      await page.keyboard.type(p.t);    // 加粗输入
      await clickBold(page);            // 关
    } else {
      await page.keyboard.type(p.t);    // 普通输入
    }
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
  log.after=await page.evaluate(()=>document.querySelector('.ProseMirror').innerHTML.slice(0,600));
  fs.writeFileSync('E:/skills/toutiao-publish/content/_dbge.log',JSON.stringify(log,null,2)+'\n');
  await browser.close(); process.exit(0);
})();
