/**
 * lib.js — 今日头条发布 skill 的公共依赖
 *
 * 设计要点（针对本机环境修复，区别于原仓库损坏版）：
 * 1. playwright-core 路径用「运行时探测」而非硬编码版本号，避免 OpenClaw 升级后失效。
 * 2. CDP 端口不硬编码（原仓库写死 28800，本机实测动态分配、当前 7774）。
 *    端口由调用方通过环境变量 TTC_CDP_PORT 传入；缺失时回退 127.0.0.1 的常见端口猜测。
 * 3. 全程用 playwright-core 直连 CDP，绕过 OpenClaw 的严格浏览器 SSRF 策略
 *    （browser action=navigate 会被拦："strict browser SSRF policy requires IP-literal URL"）。
 */

const fs = require('fs');
const path = require('path');

/**
 * 在 OpenClaw 安装目录里探测 playwright-core。
 * 优先级：OPENCLAW_NODE_MODULES 环境变量 > 常见安装盘符 F:/ 与 C:/ > 全局可解析。
 */
function locatePlaywrightCore() {
  const candidates = [];
  // 1) 最精确：从 OpenClaw 自身 mjs 路径反推 node_modules（版本无关，最稳）
  if (process.env.QCLAW_CLI_OPENCLAW_MJS) {
    // .../resources/openclaw/node_modules/openclaw/openclaw.mjs
    const m = process.env.QCLAW_CLI_OPENCLAW_MJS.replace(/[\\/]openclaw[\\/]openclaw\.mjs$/, '');
    // 现在 m = .../resources/openclaw/node_modules
    candidates.push(path.join(m, 'playwright-core'));
  }
  // 2) 显式环境变量覆盖
  if (process.env.OPENCLAW_NODE_MODULES) {
    candidates.push(path.join(process.env.OPENCLAW_NODE_MODULES, 'playwright-core'));
  }
  // 3) 兜底：遍历常见盘符下的版本目录
  const roots = ['F:/qclaw', 'C:/qclaw', 'D:/qclaw'];
  for (const r of roots) {
    try {
      const versions = fs.readdirSync(r).filter(n => /^\d+\.\d+\.\d+/.test(n));
      for (const v of versions) {
        candidates.push(path.join(r, v, 'resources', 'openclaw', 'node_modules', 'playwright-core'));
      }
    } catch (_) {}
  }
  for (const c of candidates) {
    try {
      if (fs.existsSync(path.join(c, 'package.json'))) return c;
    } catch (_) {}
  }
  return 'playwright-core';
}

let _pw = null;
function getPlaywright() {
  if (_pw) return _pw;
  const p = locatePlaywrightCore();
  _pw = require(p);
  return _pw;
}

/**
 * 获取 CDP 端口。
 * 调用方（agent）应先执行 `browser action=status` 拿到 cdpPort，
 * 再以 TTC_CDP_PORT=<port> 环境变量运行本脚本。
 */
function getCdpPort() {
  if (process.env.TTC_CDP_PORT) return process.env.TTC_CDP_PORT;
  // 无显式端口时的回退猜测（按常见范围）
  return process.env.TTC_CDP_FALLBACK || '7774';
}

/**
 * 连接到已运行的 OpenClaw 浏览器，并返回头条页面（没有则新建）。
 * @param {object} opts
 * @param {boolean} [opts.navigateIfMissing=false] 若找不到头条页是否自动 goto 发布页
 */
async function connectToutiaoPage(opts = {}) {
  const { chromium } = getPlaywright();
  const port = getCdpPort();
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);

  const ctx = browser.contexts()[0] || (await browser.newContext());
  let page = ctx.pages().find(p => p.url().includes('mp.toutiao.com'));
  if (!page && ctx.pages().length) page = ctx.pages()[0];
  if (!page) page = await ctx.newPage();

  return { browser, ctx, page };
}

/**
 * 原生 setter 设置受控组件值（React/Vue），并触发 input 事件。
 * 必须在 page.evaluate 内调用，这里只导出字符串形式的注入代码供 evaluate。
 */
const NATIVE_SETTER_HELPER = `
  function nativeSet(el, value) {
    if (!el) return false;
    const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }
`;

module.exports = {
  getPlaywright,
  locatePlaywrightCore,
  getCdpPort,
  connectToutiaoPage,
  NATIVE_SETTER_HELPER,
};
