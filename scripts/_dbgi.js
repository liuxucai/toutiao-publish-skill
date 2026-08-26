const fs = require('fs');
const { connectToutiaoPage } = require('./lib');
const wait = ms => new Promise(r => setTimeout(r, ms));
(async()=>{
  let browser; const {browser:b,page}=await connectToutiaoPage(); browser=b;
  await page.click('.ProseMirror'); await wait(150);
  const log=await page.evaluate(()=>{
    const pm=document.querySelector('.ProseMirror');
    const keys=Object.keys(pm).filter(k=>k.startsWith('__')||k==='pmView'||k.toLowerCase().includes('view'));
    const res={pmKeys:keys};
    // try to find a view with state.doc
    for(const k of Object.keys(pm)){
      try{ const v=pm[k]; if(v && v.state && v.state.doc && typeof v.dispatch==='function'){ res.found=k; break; } }catch(e){}
    }
    return res;
  });
  fs.writeFileSync('E:/skills/toutiao-publish/content/_dbgi.log',JSON.stringify(log,null,2)+'\n');
  await browser.close(); process.exit(0);
})();
