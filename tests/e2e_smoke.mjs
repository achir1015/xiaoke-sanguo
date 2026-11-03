// 畫面自動測試：開本機伺服器＋Edge，走一遍開局、內政、出征、戰鬥、結束回合、存讀檔、教學
// 用法：node tests/e2e_smoke.mjs   （需要 playwright-core：PW=路徑 指到 playwright-core 套件）
import { spawn } from 'child_process';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PW = process.env.PW || 'E:/AI Agent/Claude Code/xiaoke-chess/node_modules/playwright-core/index.mjs';
const { chromium } = await import(pathToFileURL(PW).href);
const PORT = 48297;
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'xks-e2e-'));
// URL=網址：測網頁版（已啟動的靜態伺服器）；沒給就啟動桌面版伺服器
const URL0 = process.env.URL;
const srv = URL0 ? null : spawn('python', [path.join(ROOT, 'desktop', 'app.py'), '--serve', '--port', String(PORT), '--data-dir', data], { stdio: 'pipe' });
if (srv) await new Promise((r) => srv.stdout.once('data', r));

const results = [];
const check = async (name, fn) => {
  try { const v = await fn(); results.push([true, name, v]); console.log('✔', name, v ?? ''); } catch (e) { results.push([false, name, e.message]); console.log('✘', name, e.message); }
};
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'] });
const page = await browser.newPage({ viewport: { width: Number(process.env.W || 1440), height: Number(process.env.H || 860) } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) errors.push(m.text()); });
const ev = (fn, arg) => page.evaluate(fn, arg);
const wait = (ms) => page.waitForTimeout(ms);

try {
  await page.goto(URL0 || `http://127.0.0.1:${PORT}/index.html`);
  await check('首頁載入', async () => { for (let i = 0; i < 240; i++) { if (await ev(() => !!(window.__xk && __xk.stat && __xk.map))) return '38 城'; await wait(250); } throw new Error('逾時'); });
  await check('背景音樂 20 首', async () => {
    let n = 0;
    for (let i = 0; i < 40 && n < 20; i++) { await wait(250); n = await ev(() => __xk.music.tracks.length); }
    if (n !== 20) throw new Error(n);
    return n;
  });
  await check('開新遊戲（真人對 AI）', async () => {
    await page.click('#hNew'); await wait(300);
    const seats = await ev(() => document.querySelectorAll('#seatList .seat').length);
    if (seats !== 12) throw new Error('勢力數 ' + seats);
    await page.click('#sStart'); await wait(2000);
    const b = await ev(() => document.querySelector('#turnBanner').textContent);
    if (b !== '輪到您下令') throw new Error(b);
    return b;
  });
  await check('城池面板與開墾', async () => {
    await ev(() => __xk.map.onPick('chenliu')); await wait(300);
    const before = await ev(() => __xk.view.state.cities.chenliu.farm);
    await page.click('#cityPanel .cmds button:has-text("開墾")'); await wait(200);
    await page.click('.modal-back button.primary'); await wait(1200);
    const after = await ev(() => __xk.view.state.cities.chenliu.farm);
    if (!(after > before)) throw new Error(`${before}→${after}`);
    return `${before}→${after}`;
  });
  await check('軍師建議', async () => {
    await page.click('#advisorCard button:has-text("請教軍師")'); await wait(1200);
    const t = await ev(() => document.querySelector('#advBubble').innerText);
    if (!/以為/.test(t)) throw new Error(t);
    return t.split('\n')[0];
  });
  await check('出征與 3D 戰鬥', async () => {
    await ev(() => __xk.map.onPick('chenliu')); await wait(200);
    await page.click('#cityPanel .cmds button:has-text("出征")'); await wait(300);
    await page.click('.modal-back .target-list button:has-text("洛陽")');
    await page.click('.modal-back button.primary'); await wait(3500);
    if (await ev(() => document.querySelector('#battle').classList.contains('hidden'))) throw new Error('沒有戰鬥畫面');
    await ev(() => { __xk.skip = true; });
    for (let i = 0; i < 40; i++) {
      if (await ev(() => document.querySelector('#battle').classList.contains('hidden'))) break;
      await ev(() => { const b = document.querySelector('#bTactics button.suggest') || document.querySelector('#bTactics button'); if (b) b.click(); });
      await wait(600);
    }
    const r = await ev(() => ({ owner: __xk.view.state.cities.luoyang.owner, phase: __xk.view.state.phase }));
    if (r.phase !== 'command') throw new Error(JSON.stringify(r));
    return `洛陽歸 ${r.owner}`;
  });
  await check('結束回合，電腦行動後輪回玩家', async () => {
    await ev(() => { __xk.settings.speed = 'fast'; });
    await page.click('#gEnd');
    for (let i = 0; i < 240; i++) {
      await wait(500);
      const ok = await ev(() => __xk.view.state.month === 2 && __xk.view.pending[0] && __xk.view.pending[0].kind === 'command' && __xk.view.ctrl[__xk.view.pending[0].fid] === 'human' && !__xk.pumping);
      if (ok) return '已到 2 月';
      // 電腦攻打我方時要選戰術
      await ev(() => { const b = document.querySelector('#bTactics button.suggest') || document.querySelector('#bTactics button'); if (b) b.click(); });
    }
    throw new Error('逾時');
  });
  await check('存檔', async () => {
    await page.click('#gSave'); await wait(200);
    await page.click('.modal-back button.primary'); await wait(600);
    const r = await ev(async () => (await (await import('./js/bridge.js')).host('save_list')).saves.length);
    if (r !== 1) throw new Error(r);
    return r;
  });
  await check('軍師代打與取回', async () => {
    await page.click('#advisorCard button:has-text("軍師代打")');
    for (let i = 0; i < 60; i++) { await wait(500); if (await ev(() => __xk.view.state.month === 3 || __xk.view.state.order[__xk.view.state.cur] !== 'cao')) break; }
    await page.click('#advisorCard button:has-text("取回主位")'); await wait(800);
    const p = await ev(() => __xk.view.state.players.cao.proxy);
    if (p) throw new Error('沒有取回');
    return '可以換回主位';
  });
  await check('遊戲教學可開啟', async () => {
    await ev(() => import('./js/guide.js').then((m) => m.openGuide('game', {})));
    await wait(800);
    const n = await ev(() => document.querySelectorAll('[class^="gd-"], [class*=" gd-"]').length);
    if (!n) throw new Error('沒有教學畫面');
    return n + ' 個元素';
  });
  await check('沒有程式錯誤', async () => { if (errors.length) throw new Error(errors.slice(0, 3).join(' | ')); return 0; });
} finally {
  await browser.close();
  if (srv) srv.kill();
  fs.rmSync(data, { recursive: true, force: true });
}
const bad = results.filter((r) => !r[0]).length;
console.log(`\n${results.length - bad}/${results.length} 通過`);
process.exit(bad ? 1 : 0);
