const { spawnSync } = require('child_process');
spawnSync('npm.cmd', ['install', 'puppeteer-core'], {
  cwd: 'C:\\Users\\\u83e0\u841d\\.qclaw\\workspace-agent-67effa96\\skills\\toutiao-publish',
  stdio: 'inherit',
  shell: true
});
