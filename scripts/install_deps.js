const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const skillDir = path.resolve(__dirname, '..');
const packageJson = path.join(skillDir, 'package.json');

if (!fs.existsSync(packageJson)) {
  fs.writeFileSync(packageJson, JSON.stringify({ name: 'toutiao-publish', private: true }));
}

console.log('Installing puppeteer-core in', skillDir);
execSync('npm install puppeteer-core', { cwd: skillDir, stdio: 'inherit' });
console.log('Done');
