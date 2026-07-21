/**
 * gen-cover.js — 用 Pollinations.AI 免费生成封面图
 *
 * 用法：
 *   node scripts/gen-cover.js "<英文画面描述>" [输出路径，默认 ./content/cover.jpg]
 *
 * 注意：依赖 image.pollinations.ai 外网访问。本机若直连该域名被墙可能失败，
 * 失败时可手动准备一张本地 jpg 作为封面，传给 upload-cover.js。
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const prompt = process.argv[2] || 'news headline background, modern, clean';
const outPath = process.argv[3] || path.resolve(__dirname, '..', 'content', 'cover.jpg');

(async () => {
  try {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=800&height=600&nologo=true`;
    console.log('请求封面图:', url);
    const file = fs.createWriteStream(outPath);
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      if (res.statusCode !== 200) {
        console.error('ERROR: 封面图 HTTP', res.statusCode);
        process.exit(1);
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); console.log('COVER_OK', outPath, fs.statSync(outPath).size + 'bytes'); process.exit(0); });
    }).on('error', e => { console.error('ERROR:', e.message); process.exit(1); });
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exit(1);
  }
})();
