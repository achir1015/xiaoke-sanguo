// 手機實機測試：連到除錯版 App 的 WebView（先 adb forward tcp:9333 localabstract:webview_devtools_remote_<pid>）
// 用法：node tests/phone.mjs [截圖.png]
import { pathToFileURL } from 'url';

const PW = process.env.PW || 'E:/AI Agent/Claude Code/xiaoke-chess/node_modules/playwright-core/index.mjs';
const { chromium } = await import(pathToFileURL(PW).href);
const browser = await chromium.connectOverCDP('http://127.0.0.1:' + (process.env.CDP || 9333));
const page = browser.contexts()[0].pages()[0];
const ev = (fn, a) => page.evaluate(fn, a);
const wait = (ms) => page.waitForTimeout(ms);
const results = [];
const check = async (name, fn) => {
  try { const v = await fn(); results.push(true); console.log('✔', name, v ?? ''); } catch (e) { results.push(false); console.log('✘', name, e.message.split('\n')[0]); }
};
const muteAll = () => ev(() => { if (window.__xk && __xk.music) { __xk.music.audio.muted = true; __xk.music.audio.pause(); } if (window.xk && xk.tts) xk.tts.stop(); });

await check('引擎載入（Pyodide）', async () => {
  for (let i = 0; i < 240; i++) { await muteAll().catch(() => {}); if (await ev(() => !!(window.__xk && __xk.stat))) return await ev(() => `${__xk.info.platform} v${__xk.info.version}`); await wait(250); }
  throw new Error('逾時');
});
await check('版面寬度 1100', async () => {
  const r = await ev(() => ({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio, mobile: document.documentElement.classList.contains('mobile') }));
  if (r.w < 1080) throw new Error(JSON.stringify(r));
  return JSON.stringify(r);
});
await check('語音（手機 TTS）', async () => ev(() => (window.xk && xk.tts && xk.tts.available() ? xk.tts.voiceName() : '沒有原生語音')));
await check('背景音樂 20 首', async () => { let n = 0; for (let i = 0; i < 40 && n < 20; i++) { await wait(250); n = await ev(() => __xk.music.tracks.length); } await muteAll(); if (n !== 20) throw new Error(n); return n; });
await check('開新遊戲', async () => {
  await ev(() => document.querySelector('#hNew').click()); await wait(500);
  await ev(() => document.querySelector('#sStart').click());
  for (let i = 0; i < 40; i++) { await wait(300); if ((await ev(() => document.querySelector('#turnBanner').textContent)) === '輪到您下令') return '輪到您下令'; }
  throw new Error(await ev(() => document.querySelector('#turnBanner').textContent));
});
await check('開墾', async () => {
  await ev(() => __xk.map.onPick('chenliu')); await wait(400);
  const before = await ev(() => __xk.view.state.cities.chenliu.farm);
  await ev(() => [...document.querySelectorAll('#cityPanel .cmds button')].find((b) => b.textContent === '開墾').click()); await wait(300);
  await ev(() => document.querySelector('.modal-back button.primary').click()); await wait(2000);
  const after = await ev(() => __xk.view.state.cities.chenliu.farm);
  if (!(after > before)) throw new Error(`${before}→${after}`);
  return `${before}→${after}`;
});
await check('結束回合（電腦行動速度）', async () => {
  const t0 = Date.now();
  await ev(() => { __xk.settings.speed = 'normal'; document.querySelector('#gEnd').click(); });
  for (let i = 0; i < 400; i++) {
    await wait(500);
    await ev(() => { const b = document.querySelector('#bTactics button.suggest') || document.querySelector('#bTactics button'); if (b) b.click(); });
    if (await ev(() => __xk.view.state.month === 2 && __xk.view.pending[0].kind === 'command' && __xk.view.ctrl[__xk.view.pending[0].fid] === 'human' && !__xk.pumping)) return `一個月 ${((Date.now() - t0) / 1000).toFixed(0)} 秒`;
  }
  throw new Error('逾時');
});
if (process.argv[2]) await page.screenshot({ path: process.argv[2] });
await check('沒有錯誤提示', async () => { const t = await ev(() => [...document.querySelectorAll('.toast.err')].map((x) => x.textContent).join('|')); if (t) throw new Error(t); return 0; });
await muteAll();
console.log(`\n${results.filter(Boolean).length}/${results.length} 通過`);
await browser.close().catch(() => {});
process.exit(results.every(Boolean) ? 0 : 1);
