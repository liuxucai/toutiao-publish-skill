try {
  require('puppeteer-core');
  console.log('puppeteer-core OK');
} catch(e) {
  console.log('NOT_FOUND: ' + e.message);
}
