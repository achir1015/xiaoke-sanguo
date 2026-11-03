// 小柯機器人三國志：主程式（畫面切換、開局設定、遊戲流程、戰鬥畫面、AI 軍師、遠端對戰）
import { $, $$, h, toast, modal, sleep } from './util.js';
import { engine, host, engineStatus } from './bridge.js';
import { MapView } from './map3d.js';
import { BattleView } from './battle3d.js';
import { MusicPlayer } from './music.js';
import { sfx, setSfxVolume } from './sfx.js';
import { narrator } from './tts.js';
import { Room, Link } from './net.js';
import { pickPortrait, pickAdvisor, pickOfficers, amountRow, portraitUrl, officerUrl, statLine } from './pickers.js';

const DEFAULTS = {
  profile: { name: '主公', portrait: 'm01', advisor: 'adv01' },
  music: { volume: 0.5, enabled: true, shuffle: false, track: 0 },
  sfx: 0.7, voice: { on: true, uri: '', rate: 1 }, speed: 'normal', watchAi: false,
  net: { server: { mode: 'default' } }, lastUpdateCheck: 0,
};
const SPEED = { slow: ['🐢 慢速', 500], normal: ['⏩ 普通', 110], fast: ['⏭ 快速', 0] };
const KIND_NAME = { farm: '開墾', trade: '商業', defense: '城防', order: '民心' };
const TERRAIN = { plain: '平原', hill: '丘陵', mount: '山地', water: '水鄉' };

const S = {
  stat: null, settings: structuredClone(DEFAULTS), hasKey: false, info: {},
  view: null, mode: 'pva', role: 'local', myFid: null, room: null, link: null,
  pumping: false, paused: false, chain: Promise.resolve(), selCity: null, battle: null, bv: null,
  setup: null, logSeq: 0, skip: false,
};
window.__xk = S;

// ---------------- 開機 ----------------
async function boot() {
  const msg = $('#bootMsg');
  engineStatus.onProgress = (t) => { msg.textContent = t; msg.classList.toggle('hidden', !t); };
  if (!engineStatus.ready) engineStatus.onProgress('正在載入遊戲引擎…');
  $$('.home-btns button').forEach((b) => { b.disabled = true; });
  const [st, sg, info] = await Promise.all([engine('static'), host('settings_get'), host('app_info')]);
  $$('.home-btns button').forEach((b) => { b.disabled = false; });
  msg.classList.add('hidden');
  document.documentElement.classList.toggle('mobile', info.platform === 'android' || info.platform === 'ios');
  S.stat = st.static;
  S.info = info;
  S.hasKey = sg.has_key;
  mergeSettings(sg.settings || {});
  $('#verText').textContent = 'v' + info.version;
  narrator.on = S.settings.voice.on;
  narrator.rate = S.settings.voice.rate;
  narrator.setVoice(S.settings.voice.uri);
  setSfxVolume(S.settings.sfx);
  S.map = new MapView($('#mapWrap'), S.stat, { onPick: (cid) => onPickCity(cid) });
  S.map.controls.autoRotate = true;
  S.map.controls.autoRotateSpeed = 0.35;
  initTopbar();
  initHome();
  initSetup();
  initGameUI();
  renderProfile();
  showScreen('home');
  setInterval(tickClock, 1000);
  tickClock();
  autoUpdateCheck();
}

function mergeSettings(s) {
  for (const [k, v] of Object.entries(s)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && S.settings[k] && typeof S.settings[k] === 'object') Object.assign(S.settings[k], v);
    else S.settings[k] = v;
  }
}
function saveSettings(patch) {
  mergeSettings(patch);
  host('settings_set', { patch });
}

function showScreen(name) {
  for (const id of ['home', 'setup', 'game']) $('#' + id).classList.toggle('hidden', id !== name);
  S.screen = name;
  if (S.map) S.map.controls.autoRotate = name !== 'game';
  $('#gameDate').classList.toggle('hidden', name !== 'game');
  $('#turnBanner').textContent = name === 'game' ? $('#turnBanner').textContent : '';
}

function tickClock() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const wk = '日一二三四五六'[d.getDay()];
  $('#clock').textContent = `西元 ${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())}（${wk}）${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// ---------------- 上方列：音樂、音效 ----------------
function initTopbar() {
  S.music = new MusicPlayer($('#musicPanel'), S.settings, (patch) => saveSettings(patch));
  S.music.onVolume = (v) => { $('#musicVol').value = Math.round(v * 100); $('#musicVal').textContent = Math.round(v * 100); };
  S.music.load().then(() => {
    S.music.onVolume(S.music.cfg.volume);
    if (S.settings.music.enabled !== false) {
      S.music.play();
      // 瀏覽器可能擋自動播放：第一次點畫面時再播
      const kick = () => { if (S.settings.music.enabled !== false && !S.music.playing) S.music.play(); };
      document.addEventListener('pointerdown', kick, { once: true });
    }
    S.music.renderState();
    syncMusicBtn();
  });
  S.music.audio.addEventListener('play', syncMusicBtn);
  S.music.audio.addEventListener('pause', syncMusicBtn);
  $('#btnMusic').onclick = () => { S.music.toggle(); };
  $('#musicVol').addEventListener('input', (e) => S.music.setVolume(e.target.value / 100));
  $('#btnMusicList').onclick = () => $('#musicPanel').classList.toggle('hidden');
  document.addEventListener('pointerdown', (e) => {
    if (!$('#musicPanel').classList.contains('hidden') && !e.target.closest('#musicPanel') && !e.target.closest('#btnMusicList')) $('#musicPanel').classList.add('hidden');
  });
  const sv = Math.round(S.settings.sfx * 100);
  $('#sfxVol').value = sv; $('#sfxVal').textContent = sv;
  $('#sfxVol').addEventListener('input', (e) => { const v = e.target.value / 100; setSfxVolume(v); $('#sfxVal').textContent = e.target.value; });
  $('#sfxVol').addEventListener('change', (e) => { saveSettings({ sfx: e.target.value / 100 }); sfx('clash'); });
  $('#btnSfx').onclick = () => { const v = Number($('#sfxVol').value) > 0 ? 0 : 70; $('#sfxVol').value = v; $('#sfxVal').textContent = v; setSfxVolume(v / 100); saveSettings({ sfx: v / 100 }); };
  $('#btnSettings').onclick = openSettings;
}
function syncMusicBtn() { $('#btnMusic').classList.toggle('on', S.music.playing); }

// ---------------- 首頁 ----------------
function initHome() {
  $('#hNew').onclick = () => openSetup('pva');
  $('#hLoad').onclick = openLoad;
  $('#hNet').onclick = openNetMenu;
  $('#hGuide').onclick = () => startGuide('game');
  $('#hHelp').onclick = () => startGuide('system');
  $('#hSettings').onclick = openSettings;
  $('#hUpdate').onclick = () => checkUpdate(true);
  $('#hAbout').onclick = openAbout;
}

function renderProfile() {
  const p = S.settings.profile;
  const adv = S.stat.advisors.find((a) => a.id === p.advisor);
  $('#homeProfile').replaceChildren(
    h('img', { src: portraitUrl(p.portrait), alt: '' }), h('span', {}, `主公：${p.name}`),
    adv ? h('img', { src: portraitUrl(adv.id), alt: '' }) : '', adv ? h('span', {}, `軍師：${adv.name}`) : '',
    h('button', { class: 'small ghost', onclick: openSettings }, '更換'));
}

async function startGuide(book) {
  try {
    const mod = await import('./guide.js');
    S.music.setDuck(true);
    mod.openGuide(book, { onClose: () => S.music.setDuck(false) });
  } catch (e) {
    console.error(e);
    toast('教學載入失敗：' + e.message, 'err');
  }
}

function openAbout() {
  modal('關於', h('div', {},
    h('p', {}, h('b', {}, '小柯機器人三國志遊戲'), `　版本 ${S.info.version}`),
    h('p', {}, '3D 沙盤三國策略遊戲：群雄割據與三分天下兩個劇本、AI 對 AI、真人對 AI、遠端真人對戰、AI 軍師陪同與代打、動畫語音教學、20 首原創背景音樂。'),
    h('p', {}, '系統開發：吳玉柱 先生 與 Claude AI Opus 5.5'),
    h('p', { class: 'small' }, '人物以《三國志》史實人物為題材，能力數值、頭像、音樂皆為本遊戲原創。'),
    h('button', { class: 'link', onclick: () => host('open_url', { url: `https://github.com/${S.info.repo}` }) }, `github.com/${S.info.repo}`)));
}

// ---------------- 設定 ----------------
function openSettings() {
  const st = S.settings;
  const prof = { ...st.profile };
  const pimg = h('img', { src: portraitUrl(prof.portrait), style: { width: '46px', height: '58px', objectFit: 'cover', borderRadius: '6px' } });
  const aimg = h('img', { src: portraitUrl(prof.advisor), style: { width: '46px', height: '58px', objectFit: 'cover', borderRadius: '6px' } });
  const advName = () => (S.stat.advisors.find((a) => a.id === prof.advisor) || {}).name || '';
  const aname = h('span', {}, advName());
  const nameIn = h('input', { value: prof.name, maxLength: 12 });
  const voiceSel = h('select', {});
  const fillVoices = () => {
    voiceSel.replaceChildren(h('option', { value: '' }, '自動（中文語音）'), ...narrator.voices().map((v) => h('option', { value: v.voiceURI, selected: v.voiceURI === st.voice.uri }, v.name)));
  };
  fillVoices();
  const voiceOn = h('input', { type: 'checkbox', checked: st.voice.on });
  const rate = h('select', {}, ...[0.8, 1, 1.2, 1.4].map((r) => h('option', { value: r, selected: r === st.voice.rate }, r + '×')));
  const speed = h('select', {}, ...Object.entries(SPEED).map(([k, v]) => h('option', { value: k, selected: k === st.speed }, v[0])));
  const watch = h('input', { type: 'checkbox', checked: !!st.watchAi });
  const key = h('input', { type: 'password', placeholder: S.hasKey ? '已設定（輸入新金鑰可更換）' : 'sk-ant-…', style: { width: '100%' } });
  const srvMode = h('select', {}, h('option', { value: 'default', selected: st.net.server.mode !== 'custom' }, 'PeerJS 公用伺服器（預設）'), h('option', { value: 'custom', selected: st.net.server.mode === 'custom' }, '自訂伺服器'));
  const srvHost = h('input', { value: st.net.server.host || '', placeholder: '主機名稱，例如 peer.example.com' });
  const body = h('div', {},
    h('div', { class: 'form-row' }, h('span', {}, '主公名稱'), nameIn),
    h('div', { class: 'form-row' }, h('span', {}, '半身照'), h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, pimg,
      h('button', { onclick: async () => { const v = await pickPortrait(S.stat, prof.portrait); if (v) { prof.portrait = v; pimg.src = portraitUrl(v); } } }, '選擇半身照'))),
    h('div', { class: 'form-row' }, h('span', {}, 'AI 軍師'), h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, aimg, aname,
      h('button', { onclick: async () => { const v = await pickAdvisor(S.stat, prof.advisor); if (v) { prof.advisor = v; aimg.src = portraitUrl(v); aname.textContent = advName(); } } }, '選擇軍師'))),
    h('div', { class: 'form-row' }, h('span', {}, '語音旁白'), h('label', {}, voiceOn, ' 開啟　', rate)),
    h('div', { class: 'form-row' }, h('span', {}, '語音聲音'), h('div', { style: { display: 'flex', gap: '6px' } }, voiceSel, h('button', { onclick: () => { narrator.setVoice(voiceSel.value); narrator.on = true; narrator.speak('主公，臣在此聽候差遣。'); } }, '試聽'))),
    h('div', { class: 'form-row' }, h('span', {}, '電腦速度'), speed),
    h('div', { class: 'form-row' }, h('span', {}, 'AI 之間的戰鬥'), h('label', {}, watch, ' 也播放 3D 戰鬥畫面（觀戰模式一定播放）')),
    h('div', { class: 'form-row' }, h('span', {}, 'Claude 金鑰'), h('div', {}, key, h('div', { class: 'small' }, '選填。輸入 Anthropic API 金鑰後，可以直接用文字問 AI 軍師（使用 Claude Opus 5.5），金鑰加密存在這台電腦。'))),
    h('div', { class: 'form-row' }, h('span', {}, '連線伺服器'), h('div', {}, srvMode, srvHost)),
    h('div', { class: 'form-row' }, h('span', {}, '版本'), h('div', {}, `v${S.info.version}　`, h('button', { onclick: () => checkUpdate(true) }, '檢查更新'))),
    h('p', { class: 'small' }, '系統開發：吳玉柱 先生 與 Claude AI Opus 5.5'));
  narrator.onReady(fillVoices);
  modal('設定', body, [{ label: '取消', value: false }, { label: '儲存', value: true, primary: true }]).then(async (ok) => {
    if (!ok) return;
    prof.name = nameIn.value.trim() || '主公';
    const voice = { on: voiceOn.checked, uri: voiceSel.value, rate: Number(rate.value) };
    narrator.on = voice.on; narrator.rate = voice.rate; narrator.setVoice(voice.uri);
    saveSettings({ profile: prof, voice, speed: speed.value, watchAi: watch.checked, net: { server: { mode: srvMode.value, host: srvHost.value.trim(), port: 443, secure: true, path: '/' } } });
    if (key.value.trim()) { const r = await host('set_api_key', { key: key.value.trim() }); S.hasKey = r.has_key; toast('Claude 金鑰已儲存', 'ok'); }
    renderProfile();
    updateSpeedBtn();
    if (S.view) renderAdvisor();
  });
}

// ---------------- 更新 ----------------
const verNum = (v) => String(v || '0').split('.').map((x) => parseInt(x, 10) || 0).reduce((a, b) => a * 1000 + b, 0);
async function autoUpdateCheck() {
  if (Date.now() - (S.settings.lastUpdateCheck || 0) < 6 * 3600e3) return;
  saveSettings({ lastUpdateCheck: Date.now() });
  const r = await host('update_check').catch(() => null);
  if (r && r.status === 'ok' && verNum(r.latest) > verNum(S.info.version)) showUpdate(r);
}
async function checkUpdate(manual) {
  toast('正在檢查更新…');
  const r = await host('update_check').catch((e) => ({ status: 'error', message: e.message }));
  if (r.status !== 'ok') { toast('檢查更新失敗：' + (r.message || ''), 'err'); return; }
  if (verNum(r.latest) > verNum(S.info.version)) showUpdate(r);
  else if (manual) modal('檢查更新', `目前已是最新版本（v${S.info.version}）。`);
}
async function showUpdate(r) {
  const ok = await modal(`有新版本 v${r.latest}`, h('div', {},
    h('p', {}, `目前版本 v${S.info.version}，最新版本 v${r.latest}${r.date ? `（${r.date}）` : ''}。`),
    r.notes ? h('pre', { style: { whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '13.5px', maxHeight: '40vh', overflow: 'auto', background: 'rgba(0,0,0,.25)', padding: '8px', borderRadius: '8px' } }, r.notes) : '',
    h('p', { class: 'small' }, '按「立即更新」會自動下載並安裝，完成後重新開啟遊戲。')),
  [{ label: '稍後', value: false }, { label: '立即更新', value: true, primary: true }]);
  if (!ok) return;
  if (r.reload) { location.reload(); return; }
  if (!r.url) { host('open_url', { url: r.page }); return; }
  await host('update_install', { url: r.url, version: r.latest });
  const bar = h('div', { class: 'bar' }, h('span', {}, '下載'), h('i', {}, h('em', { style: { width: '0%' } })), h('span', {}, '0%'));
  const back = h('div', { class: 'modal-back' }, h('div', { class: 'modal' }, h('h3', {}, '正在更新…'), bar, h('p', { class: 'small' }, '下載完成後會自動安裝並重新開啟。')));
  document.body.append(back);
  const t = setInterval(async () => {
    const s = await host('update_status').catch(() => null);
    if (!s) return;
    bar.querySelector('em').style.width = s.pct + '%';
    bar.lastChild.textContent = s.pct + '%';
    if (s.state === 'error') { clearInterval(t); back.remove(); toast('更新失敗：' + (s.message || ''), 'err'); }
    if (s.state === 'manual') { clearInterval(t); back.remove(); modal('更新', '已開啟安裝檔，請把 App 拖到「應用程式」資料夾覆蓋舊版。'); }
    if (s.state === 'installing') { clearInterval(t); back.remove(); modal('更新', '下載完成，請在跳出的畫面按「安裝」。'); }
  }, 500);
}

// ---------------- 開新遊戲 ----------------
function initSetup() {
  $('#sBack').onclick = () => { closeNet(); showScreen('home'); };
  $$('#modeBtns button').forEach((b) => b.onclick = () => setMode(b.dataset.mode));
  $('#limitSel').onchange = () => { S.setup.limit = Number($('#limitSel').value); broadcastLobby(); };
  $('#sStart').onclick = startGame;
}

function openSetup(mode) {
  S.setup = { mode, scenario: 's194', limit: 0, seats: {} };
  $('#limitSel').value = '0';
  showScreen('setup');
  renderScenarios();
  setMode(mode);
}

function defaultSeats(mode) {
  const sc = S.stat.scenarios[S.setup.scenario];
  const prof = S.settings.profile;
  const seats = {};
  sc.factions.forEach((f, i) => { seats[f.key] = { kind: 'ai', level: 'normal' }; });
  const first = sc.factions[0].key, second = sc.factions[1].key;
  if (mode === 'pva' || mode === 'net' || mode === 'hot') seats[first] = { kind: 'human', level: 'normal', name: prof.name, portrait: prof.portrait, advisor: prof.advisor };
  if (mode === 'net') seats[second] = { kind: 'remote', level: 'normal' };
  if (mode === 'hot') seats[second] = { kind: 'human', level: 'normal', name: '玩家二', portrait: 'f01', advisor: 'adv22' };
  return seats;
}

async function setMode(mode) {
  if (S.setup.mode === 'net' && mode !== 'net') closeNet();
  S.setup.mode = mode;
  $$('#modeBtns button').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
  S.setup.seats = defaultSeats(mode);
  $('#seatHint').textContent = { pva: '（點「控制」選擇您要扮演的勢力，其餘由電腦控制）', ava: '（全部由電腦對戰，您在旁觀戰）', net: '（設為「遠端玩家」的勢力由朋友加入）', hot: '（多位玩家在同一台電腦輪流下令）' }[mode];
  renderSeats();
  $('#netBox').classList.toggle('hidden', mode !== 'net');
  if (mode === 'net') await openRoom();
}

function renderScenarios() {
  $('#scenBtns').replaceChildren(...Object.values(S.stat.scenarios).map((sc) => h('button', {
    class: 'scen' + (sc.id === S.setup.scenario ? ' on' : ''),
    onclick: () => { S.setup.scenario = sc.id; S.setup.seats = defaultSeats(S.setup.mode); renderScenarios(); renderSeats(); },
  }, h('b', {}, `${sc.name}`), h('small', {}, `　西元 ${sc.year} 年・${sc.factions.length} 個勢力`), h('p', {}, sc.desc))));
}

function renderSeats() {
  const sc = S.stat.scenarios[S.setup.scenario];
  const mode = S.setup.mode;
  const list = $('#seatList');
  list.replaceChildren(...sc.factions.map((f) => {
    const seat = S.setup.seats[f.key];
    const opts = [['human', '🧑 玩家'], ...(mode === 'net' ? [['remote', '🌐 遠端玩家']] : []), ['ai:easy', '🤖 電腦・簡單'], ['ai:normal', '🤖 電腦・普通'], ['ai:hard', '🤖 電腦・困難']];
    const cur = seat.kind === 'ai' ? 'ai:' + seat.level : seat.kind;
    const sel = h('select', { onchange: () => changeSeat(f.key, sel.value), disabled: mode === 'ava' && false }, ...opts.filter(([v]) => !(mode === 'ava' && v === 'human')).map(([v, t]) => h('option', { value: v, selected: v === cur }, t)));
    const who = h('div', { class: 'who' });
    if (seat.kind === 'human') {
      const nm = h('input', { value: seat.name || '', maxLength: 10, style: { width: '90px' }, oninput: () => { seat.name = nm.value; } });
      who.append(
        h('button', { class: 'pick small', onclick: async () => { const v = await pickPortrait(S.stat, seat.portrait); if (v) { seat.portrait = v; renderSeats(); } } }, h('img', { src: portraitUrl(seat.portrait || 'm01') }), '半身照'),
        nm,
        h('button', { class: 'pick small', onclick: async () => { const v = await pickAdvisor(S.stat, seat.advisor); if (v) { seat.advisor = v; renderSeats(); } } }, h('img', { src: portraitUrl(seat.advisor || 'adv01') }), '軍師：' + advName(seat.advisor)));
    } else if (seat.kind === 'remote') {
      if (seat.peer) who.append(h('img', { src: portraitUrl(seat.portrait || 'm01'), style: { width: '26px', height: '32px', borderRadius: '4px' } }), `${seat.name || '遠端玩家'} 已加入`, `・軍師：${advName(seat.advisor)}`);
      else who.append(h('span', { style: { color: 'var(--gold2)' } }, '⏳ 等待朋友用房號加入…'));
    }
    const ruler = S.stat.rulerIds[f.ruler];
    return h('div', { class: 'seat' + (seat.kind !== 'ai' ? ' human' : ''), style: { '--fc': f.color } },
      h('img', { class: 'rp', src: officerUrl(ruler), alt: '' }),
      h('div', {}, h('div', { class: 'sn' }, f.name, h('small', {}, `　君主 ${f.ruler}`)), h('div', { class: 'sm' }, `${f.cities.length} 座城：${f.cities.slice(0, 4).map((c) => S.stat.cities[c].name).join('、')}${f.cities.length > 4 ? '…' : ''}`), sel),
      who);
  }));
  const humans = Object.values(S.setup.seats).filter((s) => s.kind === 'human').length;
  const waiting = Object.values(S.setup.seats).filter((s) => s.kind === 'remote' && !s.peer).length;
  let msg = '';
  if (mode === 'pva' && humans !== 1) msg = '請選擇一個由您扮演的勢力。';
  if (mode === 'net' && waiting) msg = `還有 ${waiting} 位遠端玩家沒有加入。`;
  if (mode === 'hot' && humans < 2) msg = '同機多人至少要兩位玩家。';
  $('#setupMsg').textContent = msg;
  $('#sStart').disabled = !!msg && !(mode === 'pva' && humans > 0);
  broadcastLobby();
}
const advName = (id) => (S.stat.advisors.find((a) => a.id === id) || {}).name || '未選';

function changeSeat(fid, v) {
  const seats = S.setup.seats;
  const prof = S.settings.profile;
  const old = seats[fid];
  if (v === 'human') {
    if (S.setup.mode === 'pva' || S.setup.mode === 'net') {
      // 只有一位本機玩家：把原本的玩家位置換成電腦
      for (const [k, s] of Object.entries(seats)) if (s.kind === 'human' && k !== fid) seats[k] = { kind: 'ai', level: 'normal' };
      seats[fid] = { kind: 'human', level: 'normal', name: prof.name, portrait: prof.portrait, advisor: prof.advisor };
    } else {
      const n = Object.values(seats).filter((s) => s.kind === 'human').length;
      const pics = ['m01', 'f01', 'm05', 'f04', 'm09', 'f08'];
      seats[fid] = { kind: 'human', level: 'normal', name: n === 0 ? prof.name : `玩家${'一二三四五六'[n] || n + 1}`, portrait: n === 0 ? prof.portrait : pics[n % pics.length], advisor: n === 0 ? prof.advisor : `adv${String(n * 3 + 1).padStart(2, '0')}` };
    }
  } else if (v === 'remote') {
    seats[fid] = { kind: 'remote', level: 'normal' };
  } else {
    if (old.kind === 'remote' && old.peer && S.room) S.room.kick(old.peer, '房主改變了座位設定');
    seats[fid] = { kind: 'ai', level: v.split(':')[1] };
  }
  renderSeats();
}

async function startGame() {
  const su = S.setup;
  const players = {};
  for (const [fid, s] of Object.entries(su.seats)) players[fid] = { ...s };
  S.mode = su.mode;
  S.role = su.mode === 'net' ? 'host' : 'local';
  const r = await engine('new_game', { scenario: su.scenario, players, seed: Math.floor(Math.random() * 1e9), limit_months: su.limit, spectate: su.mode === 'ava' });
  if (!r.ok) { toast(r.error, 'err'); return; }
  if (S.room) S.room.broadcast({ t: 'start' });
  enterGame(r);
}

// ---------------- 遊戲畫面 ----------------
function initGameUI() {
  $('#gEnd').onclick = () => doAct({ type: 'end' });
  $('#gHome').onclick = leaveGame;
  $('#gSave').onclick = saveGame;
  $('#gSpeed').onclick = () => {
    const keys = Object.keys(SPEED);
    saveSettings({ speed: keys[(keys.indexOf(S.settings.speed) + 1) % keys.length] });
    updateSpeedBtn();
  };
  $('#gPause').onclick = () => { S.paused = !S.paused; $('#gPause').textContent = S.paused ? '▶ 繼續' : '⏸ 暫停'; if (!S.paused) pump(); };
  $('#gRanking').onclick = showRanking;
  $('#gVoice').onclick = toggleVoice;
  $('#bSkip').onclick = () => { S.skip = true; $('#bSkip').textContent = '⏭ 加快中'; };
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && S.screen === 'game' && !document.querySelector('.modal-back')) closeCity();
  });
  updateSpeedBtn();
}
function updateSpeedBtn() { $('#gSpeed').textContent = (SPEED[S.settings.speed] || SPEED.normal)[0]; }

function enterGame(r) {
  S.view = r;
  S.paused = false;
  S.leaving = false;
  S.logSeq = 0;
  S.selCity = null;
  S.battle = null;
  $('#logBox').replaceChildren();
  showScreen('game');
  closeCity();
  $('#gPause').classList.toggle('hidden', S.mode !== 'ava');
  $('#gVoice').classList.toggle('hidden', !(S.room || S.link));
  $('#gSave').classList.toggle('hidden', S.role === 'guest');
  for (const e of (r.state.log || []).slice(-30)) addLog(e.text, e.kind, e.fid);
  S.map.resetView();
  render();
  const me = viewer();
  if (me) {
    const cap = r.state.factions[me].capital;
    setTimeout(() => S.map.focus(cap, 85), 400);
  }
  if (r.state.battle) openBattleFromState();
  sfx('drum');
  pump();
}

async function leaveGame() {
  const ok = await modal('回首頁', S.role === 'guest' ? '確定要離開這場遠端對戰嗎？' : '確定要結束這局回到首頁嗎？（尚未存檔的進度會遺失）', [{ label: '取消', value: false }, { label: '回首頁', value: true, primary: true }]);
  if (!ok) return;
  S.leaving = true;
  S.view = null;
  closeBattle(true);
  closeNet();
  narrator.stop();
  S.map.battleMark(null, false);
  S.map.highlightTargets(null);
  S.map.select(null);
  showScreen('home');
}

// 誰在操作：本機玩家（host/local）或遠端來賓自己
function localCtl(fid) {
  if (!S.view || !fid) return false;
  const c = S.view.ctrl[fid];
  if (S.role === 'guest') return fid === S.myFid && c === 'remote';
  return c === 'human';
}
function localFids() {
  if (!S.view) return [];
  if (S.role === 'guest') return [S.myFid];
  return Object.entries(S.view.state.players).filter(([, p]) => p.kind === 'human').map(([f]) => f);
}
// 畫面以哪個勢力的角度顯示
function viewer() {
  const st = S.view.state;
  const mine = localFids();
  const cur = st.order[st.cur];
  if (mine.includes(cur)) return cur;
  return mine.find((f) => st.factions[f].alive) || mine[0] || null;
}
function myCommandTurn() {
  if (!S.view) return null;
  const p = S.view.pending.find((x) => x.kind === 'command');
  return p && localCtl(p.fid) ? p.fid : null;
}

// 依序執行：所有狀態更新排隊，避免動畫交錯
function enqueue(fn) {
  S.chain = S.chain.then(fn).catch((e) => console.error(e));
  return S.chain;
}

async function applyView(r, { broadcast = true } = {}) {
  if (!r) return;
  if (!r.ok && r.error) { toast(r.error, 'err'); sfx('error'); }
  if (!r.state) return;
  if (broadcast && S.room) broadcastView(r);
  await playEvents(r.events || []);
  if (S.leaving) return;
  S.view = r;
  render();
}

async function doAct(action) {
  if (S.role === 'guest') {
    S.link.send({ t: 'act', action });
    return;
  }
  const fid = action.type === 'tactic' ? S.battleMine : myCommandTurn();
  if (!fid) return;
  setBusy(true);
  const r = await engine('act', { fid, action });
  await enqueue(() => applyView(r));
  setBusy(false);
  pump();
}
function setBusy(on) { S.busy = on; $('#gEnd').disabled = on || !myCommandTurn(); }

// 讓電腦（含軍師代打、無主守軍）一步步行動
async function pump() {
  if (S.pumping || S.role === 'guest') return;
  S.pumping = true;
  try {
    while (S.view && !S.leaving) {
      const v = S.view;
      if (v.state.phase === 'over') break;
      const p = v.pending.find((x) => !x.fid || v.ctrl[x.fid] === 'ai');
      if (!p || S.paused) break;
      // 牽涉到玩家的行動放慢一點讓人看清楚；電腦之間的行動快速帶過
      const watched = p.kind === 'tactic' ? (S.battle && S.battle.show) : (involvesLocal(p.fid) || S.mode === 'ava');
      const base = (SPEED[S.settings.speed] || SPEED.normal)[1];
      const delay = p.kind === 'tactic' ? (watched ? 250 : 0) : (watched ? base * 2.5 : base * 0.4);
      await sleep(delay);
      if (S.paused || S.leaving || !S.view) break;
      const r = await engine('ai_step');
      if (r.idle) break;
      await enqueue(() => applyView(r));
    }
  } finally {
    S.pumping = false;
  }
  if (S.view && !S.leaving) render();
}

// ---------------- 事件動畫 ----------------
const fname = (fid) => (fid && S.view.state.factions[fid] ? S.view.state.factions[fid].name : '無主');
const fcolor = (fid) => (fid && S.view.state.factions[fid] ? S.view.state.factions[fid].color : '#9a9488');
const cname = (cid) => S.stat.cities[cid].name;
const involvesLocal = (...fids) => fids.some((f) => f && localFids().includes(f));

function addLog(text, kind = '', fid = null) {
  if (!text) return;
  const box = $('#logBox');
  const cls = kind === 'month' ? 'month' : ['battle_start', 'capture', 'repelled', 'eliminated', 'duel', 'march'].includes(kind) ? 'war' : (fid && localFids().includes(fid) ? 'mine' : '');
  box.append(h('div', { class: cls }, text));
  while (box.children.length > 80) box.firstChild.remove();
  box.scrollTop = box.scrollHeight;
}

async function playEvents(events) {
  const fast = S.settings.speed === 'fast';
  for (const ev of events) {
    if (S.leaving) return;
    const mine = ev.fid && localFids().includes(ev.fid);
    if (ev.text && ev.type !== 'turn' && !ev.type.startsWith('battle_')) addLog(ev.text, ev.type, ev.fid);
    switch (ev.type) {
      case 'turn': {
        if (localCtl(ev.fid)) {
          sfx('turn');
          const p = S.view.state.players[ev.fid];
          narrator.say(`${S.mode === 'hot' ? (p.name || fname(ev.fid)) + '，' : ''}輪到您下令了`);
          if (S.mode === 'hot') toast(`${p.name || ''}（${fname(ev.fid)}）請下令`, 'ok');
          S.map.focus(S.view.state.factions[ev.fid].capital, 85);
        }
        break;
      }
      case 'develop': S.map.pop(ev.city, `${KIND_NAME[ev.kind]} +${ev.delta}`, 'good'); if (mine) sfx(ev.kind === 'trade' ? 'coin' : 'build'); break;
      case 'recruit': S.map.pop(ev.city, `徵兵 +${ev.delta.toLocaleString()}`, 'good'); if (mine) sfx('march'); break;
      case 'train': S.map.pop(ev.city, `訓練 +${ev.delta}`, 'good'); if (mine) sfx('shield'); break;
      case 'search': S.map.pop(ev.city, ev.found ? '發現人才！' : ev.gold ? `+${ev.gold} 金` : ev.food ? `+${ev.food} 糧` : '一無所獲', ev.found || ev.gold || ev.food ? 'good' : ''); if (mine && ev.found) { sfx('capture'); narrator.say(ev.text); } break;
      case 'hire': S.map.pop(ev.city, ev.ok ? '登用成功' : '登用失敗', ev.ok ? 'good' : 'bad'); if (mine) { sfx(ev.ok ? 'capture' : 'error'); narrator.say(ev.text); } break;
      case 'reward': S.map.pop(ev.city, '褒賞', 'good'); if (mine) sfx('coin'); break;
      case 'move': case 'transport':
        if (mine || S.mode === 'ava') await S.map.march(ev.city, ev.to, fcolor(ev.fid), { ms: fast ? 500 : 900 });
        else S.map.march(ev.city, ev.to, fcolor(ev.fid), { ms: 700 });
        break;
      case 'march': {
        if (mine || involvesLocal(S.view.state.cities[ev.to].owner)) { sfx('march'); S.map.focus(ev.to, 75); }
        const watch = mine || involvesLocal(S.view.state.cities[ev.to].owner) || S.mode === 'ava';
        await S.map.march(ev.city, ev.to, fcolor(ev.fid), { ms: watch ? (fast ? 700 : 1300) : 600 });
        break;
      }
      case 'battle_start': await openBattle(ev); break;
      case 'battle_round': await battleRound(ev); break;
      case 'duel': await battleDuel(ev); break;
      case 'battle_end': await finishBattle(ev); break;
      case 'capture': {
        if (involvesLocal(ev.fid, ev.from_fid)) { sfx(involvesLocal(ev.fid) ? 'capture' : 'defeat'); narrator.say(ev.text); }
        await S.map.capture(ev.city, fcolor(ev.fid));
        break;
      }
      case 'repelled': {
        S.map.pop(ev.city, '守住了！', 'good');
        if (involvesLocal(ev.fid, ev.def_fid)) narrator.say(ev.text);
        break;
      }
      case 'month': {
        updateDate(true);
        break;
      }
      case 'eliminated': case 'succession': case 'death': case 'leave': case 'escape':
        toast(ev.text, ev.type === 'eliminated' ? 'err' : 'info', 4200);
        if (involvesLocal(ev.fid)) narrator.say(ev.text);
        break;
      case 'famine': if (mine) { toast(ev.text, 'err'); S.map.pop(ev.city, '糧荒！', 'bad'); } break;
      case 'harvest': if (localFids().length) toast('🌾 ' + ev.text, 'ok'); break;
      case 'gameover': await showGameOver(ev); break;
      default: break;
    }
  }
}

// ---------------- 畫面更新 ----------------
function render() {
  if (!S.view || S.screen !== 'game') return;
  const st = S.view.state;
  const me = viewer();
  S.map.setState(st, me);
  updateDate(false);
  renderBanner();
  renderFactions();
  renderAdvisor();
  if (S.selCity) renderCity(S.selCity);
  $('#gEnd').disabled = S.busy || !myCommandTurn() || st.phase !== 'command';
  renderTactics();
}

function updateDate() {
  const st = S.view.state;
  const season = ['冬', '春', '春', '春', '夏', '夏', '夏', '秋', '秋', '秋', '冬', '冬', '冬'][st.month];
  $('#gameDate').textContent = `西元 ${st.year} 年 ${st.month} 月（${season}）`;
}

function renderBanner() {
  const st = S.view.state;
  const b = $('#turnBanner');
  b.classList.remove('mine');
  if (st.phase === 'over') { b.textContent = st.winner ? `🏆 ${fname(st.winner)} 一統天下` : '遊戲結束'; return; }
  if (st.phase === 'battle') { b.textContent = `⚔ ${cname(st.battle.to)} 攻防戰`; return; }
  const cur = st.order[st.cur];
  const p = st.players[cur];
  if (localCtl(cur)) {
    b.textContent = S.mode === 'hot' ? `${p.name || fname(cur)}（${fname(cur)}），輪到您下令` : '輪到您下令';
    b.classList.add('mine');
  } else if (p.proxy && involvesLocal(cur)) b.textContent = `軍師代打中…（${fname(cur)}）`;
  else if (S.view.ctrl[cur] === 'remote' || (S.role === 'guest' && p.kind !== 'ai')) b.textContent = `等待 ${p.name || fname(cur)} 下令…　換您觀戰`;
  else b.textContent = `${fname(cur)} 思考中…${localFids().length ? '　換您觀戰' : ''}`;
}

function score(fid) {
  const st = S.view.state;
  let s = 0;
  for (const c of Object.values(st.cities)) if (c.owner === fid) s += 100 + Math.floor(c.pop / 2000) + Math.floor(c.soldiers / 300) + Math.floor(c.farm / 50) + Math.floor(c.trade / 50);
  return s + 5 * Object.values(st.officers).filter((o) => o.faction === fid && o.status === 'serve').length;
}

function renderFactions() {
  const st = S.view.state;
  const cur = st.order[st.cur];
  const rows = st.order.map((fid) => {
    const f = st.factions[fid];
    const p = st.players[fid];
    const cities = Object.values(st.cities).filter((c) => c.owner === fid);
    const sol = cities.reduce((a, c) => a + c.soldiers, 0);
    const tag = p.kind === 'ai' ? (p.proxy ? '' : '電腦') : (p.name || '玩家');
    return h('div', { class: 'fcard' + (fid === cur && st.phase !== 'over' ? ' cur' : '') + (f.alive ? '' : ' dead'), style: { '--fc': f.color }, onclick: () => f.alive && S.map.focus(f.capital, 80) },
      h('img', { src: p.kind !== 'ai' && p.portrait ? portraitUrl(p.portrait) : officerUrl(f.ruler), alt: '' }),
      h('div', {}, h('div', { class: 'fn' }, f.name), h('div', { class: 'fm' }, f.alive ? `${cities.length} 城・兵 ${(sol / 10000).toFixed(1)} 萬` : '已滅亡')),
      h('div', {}, p.proxy ? h('span', { class: 'tag proxy' }, '軍師代打') : '', localFids().includes(fid) ? h('span', { class: 'tag me' }, S.mode === 'hot' ? p.name || '我' : '我方') : h('span', { class: 'tag' }, tag)));
  });
  $('#factionList').replaceChildren(...rows);
}

// ---------------- AI 軍師 ----------------
function myAdvisor() {
  const me = viewer();
  if (!me) return null;
  const id = S.view.state.players[me].advisor || S.settings.profile.advisor;
  return S.stat.advisors.find((a) => a.id === id) || S.stat.advisors[0];
}

function renderAdvisor() {
  const box = $('#advisorCard');
  const me = viewer();
  if (!me || !S.view.state.factions[me]) { box.classList.add('hidden'); return; }
  box.classList.remove('hidden');
  const adv = myAdvisor();
  const p = S.view.state.players[me];
  const key = `${adv.id}|${p.proxy}|${S.hasKey}|${me}`;
  if (box.dataset.key === key) return;
  box.dataset.key = key;
  const bubble = h('div', { class: 'adv-bubble', id: 'advBubble' });
  const askIn = h('input', { placeholder: `問 ${adv.name}…（例如：下一步該打哪裡？）`, onkeydown: (e) => { if (e.key === 'Enter') askClaude(askIn); } });
  box.replaceChildren(
    h('div', { class: 'adv-head' }, h('img', { src: portraitUrl(adv.id), alt: '' }),
      h('div', {}, h('div', { class: 'an' }, adv.name), h('div', { class: 'as' }, `${adv.epithet}・${adv.style_name}型軍師`), h('div', { class: 'as' }, p.proxy ? '🔵 目前由軍師代打' : '陪同主公左右'))),
    h('div', { class: 'adv-btns' },
      h('button', { onclick: askAdvice }, '💡 請教軍師'),
      h('button', { class: p.proxy ? 'proxy-on' : '', onclick: toggleProxy }, p.proxy ? '🙋 取回主位' : '🤖 軍師代打'),
      h('button', { onclick: changeAdvisor }, '🔄 換軍師'),
      h('button', { onclick: () => { $('#advBubble').replaceChildren(); narrator.stop(); } }, '🔇 安靜')),
    bubble,
    S.hasKey ? h('div', { class: 'adv-ask' }, askIn, h('button', { class: 'small', onclick: () => askClaude(askIn) }, '問')) : '');
}

async function getAdvice() {
  const me = viewer();
  if (S.role === 'guest') {
    return new Promise((resolve) => { S.adviceWait = resolve; S.link.send({ t: 'advise' }); setTimeout(() => { if (S.adviceWait === resolve) { S.adviceWait = null; resolve(null); } }, 8000); });
  }
  return engine('advise', { fid: me, limit: 3 });
}

async function askAdvice() {
  const adv = myAdvisor();
  const bubble = $('#advBubble');
  bubble.replaceChildren(h('div', {}, `${adv.name} 沉思中…`));
  const r = await getAdvice();
  if (!r) { bubble.replaceChildren(h('div', {}, '軍師暫時沒有回應。')); return; }
  if (r.tactic) {
    bubble.replaceChildren(h('div', {}, `${adv.say}：用「${r.tactic.tactic}」。${r.tactic.reason}`));
    narrator.speak(`${adv.say}，${r.tactic.reason}建議使用${r.tactic.tactic}。`);
    return;
  }
  const items = r.advice || [];
  if (!items.length) { bubble.replaceChildren(h('div', {}, `${adv.say}：眼下按兵不動，可以結束回合。`)); narrator.speak(`${adv.say}，眼下按兵不動，可以結束回合。`); return; }
  const canDo = !!myCommandTurn();
  bubble.replaceChildren(...items.map((it, i) => h('div', { class: 'adv-item' },
    h('div', {}, `${i === 0 ? adv.say + '：' : '另外，'}${it.reason}`),
    canDo ? h('button', { class: 'small', onclick: async () => { if (it.action.type === 'attack' && !(await confirmAttack(it.action))) return; doAct(it.action); bubble.replaceChildren(); } }, '照辦') : '')));
  narrator.speak(`${adv.say}，${items[0].reason}`);
}

async function confirmAttack(a) {
  return modal('出征', `確定派 ${a.officers.map((o) => S.view.state.officers[o].name).join('、')} 率 ${a.soldiers.toLocaleString()} 兵攻打 ${cname(a.to)} 嗎？`, [{ label: '取消', value: false }, { label: '出征', value: true, primary: true }]);
}

async function toggleProxy() {
  const me = viewer();
  const p = S.view.state.players[me];
  const on = !p.proxy;
  if (S.role === 'guest') { S.link.send({ t: 'proxy', on }); return; }
  const r = await engine('set_player', { fid: me, patch: { proxy: on } });
  await enqueue(() => applyView(r));
  const adv = myAdvisor();
  narrator.say(on ? `${adv.name}遵命，接下來由${adv.say.replace('以為', '')}代為下令。` : '主公親自坐鎮，臣退居幕後。');
  toast(on ? `已由 ${adv.name} 代打，按「取回主位」可以換回` : '已取回主位', 'ok');
  pump();
}

async function changeAdvisor() {
  const me = viewer();
  const v = await pickAdvisor(S.stat, S.view.state.players[me].advisor, '中途更換 AI 軍師');
  if (!v) return;
  if (S.role === 'guest') { S.link.send({ t: 'advisor', advisor: v }); return; }
  const r = await engine('set_player', { fid: me, patch: { advisor: v } });
  await enqueue(() => applyView(r));
  const adv = myAdvisor();
  narrator.say(`在下${adv.name}，願為主公效犬馬之勞。`);
}

function situation() {
  const st = S.view.state;
  const me = viewer();
  const lines = [`西元 ${st.year} 年 ${st.month} 月，我方勢力：${fname(me)}。`];
  for (const c of Object.values(st.cities)) {
    if (c.owner !== me) continue;
    const offs = Object.values(st.officers).filter((o) => o.city === c.id && o.status === 'serve' && o.faction === me);
    const nb = S.stat.adj[c.id].filter((n) => st.cities[n].owner !== me).map((n) => `${cname(n)}(${fname(st.cities[n].owner)} 兵${st.cities[n].soldiers})`);
    lines.push(`${cname(c.id)}：金${c.gold} 糧${c.food} 兵${c.soldiers} 訓練${c.training} 士氣${c.morale} 城防${c.defense} 農${c.farm} 商${c.trade} 民心${c.order}；武將 ${offs.map((o) => `${o.name}${o.acted ? '(已行動)' : ''}[統${o.lead}武${o.war}智${o.int}政${o.pol}魅${o.cha}]`).join('、') || '無'}；鄰近 ${nb.join('、') || '無敵城'}`);
  }
  const others = st.order.filter((f) => f !== me && st.factions[f].alive).map((f) => `${fname(f)} ${Object.values(st.cities).filter((c) => c.owner === f).length} 城`);
  lines.push('其他勢力：' + others.join('、'));
  if (st.battle) {
    const b = st.battle;
    lines.push(`正在 ${cname(b.to)} 交戰：攻方 ${fname(b.att.fid)} 兵${b.att.soldiers} 士氣${b.att.morale}；守方 ${fname(b.def.fid)} 兵${b.def.soldiers} 士氣${b.def.morale}；城防${b.wall}；第 ${b.round} 回合。`);
  }
  return lines.join('\n');
}

async function askClaude(input) {
  const q = input.value.trim();
  if (!q) return;
  input.value = '';
  const adv = myAdvisor();
  const bubble = $('#advBubble');
  bubble.replaceChildren(h('div', {}, `主公問：${q}`), h('div', {}, `${adv.name} 思考中…`));
  const r = await host('advisor_ask', { question: q, context: situation(), persona: adv }).catch((e) => ({ ok: false, error: e.message }));
  if (!r.ok) { bubble.lastChild.textContent = r.error === 'no_key' ? '請先在「設定」輸入 Claude 金鑰。' : '軍師暫時無法回答：' + r.error; return; }
  bubble.lastChild.textContent = `${adv.name}：${r.text}`;
  narrator.speak(r.text);
}

// ---------------- 城池面板與指令 ----------------
function onPickCity(cid) {
  if (S.screen !== 'game' || !S.view) return;
  if (S.pickTarget) { S.pickTarget(cid); return; }
  if (!cid) { closeCity(); return; }
  S.selCity = cid;
  S.map.select(cid);
  renderCity(cid);
  sfx('click');
}
function closeCity() {
  S.selCity = null;
  if (S.map) S.map.select(null);
  $('#cityPanel').classList.add('hidden');
}

function bar(label, v, max) {
  return h('div', { class: 'bar' }, h('span', {}, label), h('i', {}, h('em', { style: { width: Math.min(100, (v / Math.max(1, max)) * 100) + '%' } })), h('span', {}, `${v}／${max}`));
}

function renderCity(cid) {
  const st = S.view.state;
  const c = st.cities[cid];
  const sc = S.stat.cities[cid];
  const panel = $('#cityPanel');
  panel.classList.remove('hidden');
  const me = viewer();
  const turn = myCommandTurn();
  const mineCity = c.owner && c.owner === turn;
  const offs = Object.values(st.officers).filter((o) => o.city === cid && o.status === 'serve');
  const free = Object.values(st.officers).filter((o) => o.city === cid && ((o.status === 'free' && o.found) || o.status === 'prisoner'));
  const ready = offs.filter((o) => !o.acted && o.faction === turn);
  const kids = [
    h('div', { class: 'cp-head', style: { '--fc': fcolor(c.owner) } }, h('h2', {}, sc.name), h('span', { class: 'own' }, fname(c.owner)), h('span', { class: 'small' }, TERRAIN[sc.terrain]),
      h('button', { class: 'x ghost small', onclick: closeCity }, '✕')),
    h('div', { class: 'stats' },
      ...[['金錢', c.gold], ['糧食', c.food], ['人口', c.pop], ['士兵', c.soldiers], ['訓練', c.training], ['士氣', c.morale]].map(([k, v]) => h('div', { class: 'stat' }, h('span', {}, k), h('b', {}, v.toLocaleString()))),
      bar('農業', c.farm, sc.max_farm), bar('商業', c.trade, sc.max_trade), bar('城防', c.defense, sc.max_def), bar('民心', c.order, 100)),
    h('div', { class: 'cp-sec' }, `城中武將（${offs.length}）`),
    h('div', { class: 'off-list' }, ...(offs.length ? offs.sort((a, b) => (b.lead + b.war + b.int) - (a.lead + a.war + a.int)).map((o) => {
      const isRuler = st.factions[o.faction] && st.factions[o.faction].ruler === o.id;
      return h('div', { class: 'off' + (o.acted && o.faction === turn ? ' acted' : '') },
        h('img', { src: officerUrl(o.id), alt: '' }),
        h('div', {}, h('div', { class: 'on' }, o.name, isRuler ? h('span', { class: 'ruler' }, '君主') : ''), h('div', { class: 'os' }, statLine(o) + (isRuler ? '' : `　忠${o.loyalty}`))),
        mineCity && !isRuler && o.faction === turn ? h('button', { class: 'small ghost', title: '褒賞 100 金，忠誠 +8', disabled: o.rewarded || o.loyalty >= 100 || c.gold < 100, onclick: () => doAct({ type: 'reward', target: o.id }) }, '💰') : (o.acted && o.faction === turn ? h('span', { class: 'done' }, '已行動') : ''));
    }) : [h('div', { class: 'small' }, '沒有武將')])),
  ];
  if (free.length) {
    kids.push(h('div', { class: 'cp-sec' }, '在野人才與俘虜'));
    kids.push(h('div', { class: 'off-list' }, ...free.map((o) => {
      const pris = o.status === 'prisoner';
      const canHire = mineCity && ready.length && (!pris || o.captor === turn);
      return h('div', { class: 'off' }, h('img', { src: officerUrl(o.id), alt: '' }),
        h('div', {}, h('div', { class: 'on' }, o.name, h('span', { class: 'ruler' }, pris ? `俘虜（${fname(o.captor)}）` : '在野')), h('div', { class: 'os' }, statLine(o))),
        h('div', {}, canHire ? h('button', { class: 'small', onclick: () => cmdHire(cid, o) }, '登用') : '',
          mineCity && pris && o.captor === turn ? h('button', { class: 'small ghost', onclick: () => doAct({ type: 'release', target: o.id }) }, '釋放') : ''));
    })));
  }
  if (mineCity) {
    const nbOwn = S.stat.adj[cid].filter((n) => st.cities[n].owner === turn);
    const nbEnemy = S.stat.adj[cid].filter((n) => st.cities[n].owner !== turn);
    const B = (label, fn, dis, title) => h('button', { onclick: fn, disabled: !ready.length || dis, title }, label);
    kids.push(h('div', { class: 'cp-sec' }, `下達指令（可行動武將 ${ready.length} 位）`));
    kids.push(h('div', { class: 'cmds' },
      h('div', { class: 'grp' }, '內政（各花 100 金；撫民花 100 糧）'),
      B('開墾', () => cmdSimple(cid, 'farm', 'pol', '開墾：農業提升，秋收更多糧食'), c.farm >= sc.max_farm || c.gold < 100),
      B('商業', () => cmdSimple(cid, 'trade', 'pol', '商業：每月金錢收入增加'), c.trade >= sc.max_trade || c.gold < 100),
      B('修城', () => cmdSimple(cid, 'defense', 'lead', '修城：城防越高，守城傷亡越少'), c.defense >= sc.max_def || c.gold < 100),
      B('撫民', () => cmdSimple(cid, 'order', 'cha', '撫民：民心提升，收入與人口成長變好'), c.order >= 100 || c.food < 100),
      h('div', { class: 'grp' }, '軍事'),
      B('徵兵', () => cmdRecruit(cid), c.gold < 75 || c.pop < 2000),
      B('訓練', () => cmdSimple(cid, 'train', 'lead', '訓練：提高訓練度與士氣'), c.training >= 100 && c.morale >= 100),
      B('出征', () => cmdAttack(cid), !nbEnemy.length || c.soldiers < 500, '攻打相鄰的城池'),
      B('運輸', () => cmdTransport(cid), !nbOwn.length, '運送金、糧、兵到相鄰的我方城'),
      B('移動', () => cmdMove(cid), !nbOwn.length, '武將移到相鄰的我方城'),
      h('div', { class: 'grp' }, '人事'),
      B('搜索', () => cmdSimple(cid, 'search', 'int', '搜索：可能找到在野人才、金錢或糧食')),
      B('登用', () => { const t = free.find((o) => o.status === 'free' || o.captor === turn); if (t) cmdHire(cid, t); }, !free.some((o) => o.status === 'free' || o.captor === turn), '先「搜索」發現在野人才，或登用俘虜'),
      h('button', { onclick: () => doAct({ type: 'end' }), class: 'ghost' }, '結束回合')));
  } else if (c.owner && localFids().includes(c.owner) && !turn) {
    kids.push(h('p', { class: 'cp-note' }, '輪到您的回合時，就可以在這裡下達指令。'));
  }
  panel.replaceChildren(...kids);
}

function readyIn(cid) {
  const turn = myCommandTurn();
  return Object.values(S.view.state.officers).filter((o) => o.city === cid && o.status === 'serve' && o.faction === turn && !o.acted);
}

async function cmdSimple(cid, type, key, note) {
  const ids = await pickOfficers(readyIn(cid), { title: `${{ farm: '開墾', trade: '商業', defense: '修城', order: '撫民', train: '訓練', search: '搜索' }[type]}：選擇武將`, key, note });
  if (ids) doAct({ type, city: cid, officer: ids[0] });
}

async function cmdRecruit(cid) {
  const c = S.view.state.cities[cid];
  const max = Math.max(500, Math.min(5000, Math.floor(c.gold / 0.15 / 500) * 500, Math.floor(c.pop / 4 / 500) * 500));
  const amt = amountRow('徵兵數', max, 500, Math.min(2000, max));
  const cost = h('div', { class: 'small' });
  const upd = () => { cost.textContent = `花費 ${Math.floor(amt.value * 3 / 20)} 金；人口與民心會下降，新兵訓練度較低。魅力高的武將能多徵一些兵。`; };
  amt.input.addEventListener('input', upd); upd();
  const ids = await pickOfficers(readyIn(cid), { title: '徵兵：選擇武將', key: 'cha', extra: { el: h('div', {}, amt.el, cost) } });
  if (ids) doAct({ type: 'recruit', city: cid, officer: ids[0], amount: amt.value });
}

function targetPicker(cids, kind, onChange) {
  let sel = cids[0];
  const box = h('div', { class: 'target-list' });
  const draw = () => {
    box.replaceChildren(...cids.map((n) => {
      const c = S.view.state.cities[n];
      return h('button', { class: n === sel ? 'on' : '', onclick: () => { sel = n; draw(); onChange && onChange(n); } }, `${cname(n)}（${fname(c.owner)}・兵 ${c.soldiers.toLocaleString()}）`);
    }));
  };
  draw();
  S.map.highlightTargets(cids, kind);
  return { el: box, get value() { return sel; } };
}

async function cmdAttack(cid) {
  const st = S.view.state;
  const c = st.cities[cid];
  const turn = myCommandTurn();
  const targets = S.stat.adj[cid].filter((n) => st.cities[n].owner !== turn);
  const tp = targetPicker(targets, 'attack');
  const maxSol = Math.max(500, Math.min(c.soldiers, c.food * 10) - (Math.min(c.soldiers, c.food * 10) % 500));
  const amt = amountRow('出征兵數', maxSol, 500, Math.max(500, Math.floor(maxSol * 0.7 / 500) * 500));
  const info = h('div', { class: 'small' });
  const upd = () => { info.textContent = `需要糧食 ${Math.floor(amt.value / 10).toLocaleString()}（城中 ${c.food.toLocaleString()}）。最多派 3 位武將，戰場上以最高的統率、武力、智力計算。`; };
  amt.input.addEventListener('input', upd); upd();
  const ids = await pickOfficers(readyIn(cid), { title: '出征：選擇目標與武將（最多 3 位）', key: 'war', multi: 3, extra: { el: h('div', {}, h('div', { class: 'cp-sec' }, '攻打哪座城？'), tp.el, amt.el, info) } });
  S.map.highlightTargets(null);
  if (ids) doAct({ type: 'attack', city: cid, to: tp.value, officers: ids, soldiers: amt.value });
}

async function cmdTransport(cid) {
  const st = S.view.state;
  const c = st.cities[cid];
  const turn = myCommandTurn();
  const tp = targetPicker(S.stat.adj[cid].filter((n) => st.cities[n].owner === turn), 'move');
  const g = amountRow('金錢', c.gold, 50, 0), f = amountRow('糧食', c.food, 100, 0), s = amountRow('士兵', c.soldiers, 500, 0);
  const ids = await pickOfficers(readyIn(cid), { title: '運輸：選擇目的地與武將', key: 'lead', extra: { el: h('div', {}, h('div', { class: 'cp-sec' }, '送到哪座城？'), tp.el, g.el, f.el, s.el) } });
  S.map.highlightTargets(null);
  if (ids) doAct({ type: 'transport', city: cid, officer: ids[0], to: tp.value, gold: g.value, food: f.value, soldiers: s.value });
}

async function cmdMove(cid) {
  const st = S.view.state;
  const turn = myCommandTurn();
  const ready = readyIn(cid);
  const tp = targetPicker(S.stat.adj[cid].filter((n) => st.cities[n].owner === turn), 'move');
  const ids = await pickOfficers(ready, { title: '移動：選擇目的地與武將', key: 'lead', multi: ready.length, extra: { el: h('div', {}, h('div', { class: 'cp-sec' }, '移到哪座城？'), tp.el) } });
  S.map.highlightTargets(null);
  if (ids) doAct({ type: 'move', city: cid, to: tp.value, officers: ids });
}

function hireChance(o, x) {
  let p;
  if (x.status === 'prisoner') {
    if (Object.values(S.view.state.factions).some((f) => f.alive && f.ruler === x.id)) return 0;
    p = 0.3 + (o.cha - 50) / 120 - (x.loyalty - 50) / 150;
  } else p = 0.45 + (o.cha - 50) / 100;
  return Math.max(0.08, Math.min(0.92, p));
}

async function cmdHire(cid, target) {
  const ready = readyIn(cid);
  const info = h('div', { class: 'small' });
  const ids = await pickOfficers(ready, {
    title: `登用 ${target.name}：派誰去招攬？`, key: 'cha', note: `${target.name}　${statLine(target)}`,
    extra: { el: info, update: (sel) => { const o = ready.find((x) => x.id === sel[0]); info.textContent = o ? `成功率約 ${Math.round(hireChance(o, target) * 100)}%（看魅力${target.status === 'prisoner' ? '與俘虜的忠誠' : ''}）` : ''; } },
  });
  if (ids) doAct({ type: 'hire', city: cid, officer: ids[0], target: target.id });
}

// ---------------- 戰鬥畫面 ----------------
function battleShown(ev) {
  return involvesLocal(ev.fid, ev.def_fid) || S.mode === 'ava' || S.settings.watchAi;
}

function sideHud(role, b) {
  const st = S.view.state;
  const side = b[role];
  const fid = side.fid;
  const offs = side.officers.map((o) => st.officers[o]).filter(Boolean);
  const el = $(role === 'att' ? '#bAtt' : '#bDef');
  el.style.setProperty('--fc', fcolor(fid));
  el.replaceChildren(
    h('div', { class: 'bt' }, `${role === 'att' ? '攻' : '守'}・${fname(fid)}`, h('small', {}, localFids().includes(fid) ? '（我方）' : '')),
    h('div', { class: 'bofs' }, ...(offs.length ? offs.map((o) => h('figure', {}, h('img', { src: officerUrl(o.id), alt: '' }), o.name)) : [h('figure', {}, '守城士卒')])),
    h('div', { class: 'bbar sol' }, h('span', {}, '兵力'), h('i', {}, h('em', { style: { width: '100%' } })), h('b', {}, '')),
    h('div', { class: 'bbar mor' }, h('span', {}, '士氣'), h('i', {}, h('em', { style: { width: '100%' } })), h('b', {}, '')),
    h('div', { class: 'btac' }, ''));
}

function setHudNums(role, soldiers, start, morale) {
  const el = $(role === 'att' ? '#bAtt' : '#bDef');
  const [sb, mb] = el.querySelectorAll('.bbar');
  if (!sb) return;
  sb.querySelector('em').style.width = Math.max(0, Math.min(100, soldiers / Math.max(1, start) * 100)) + '%';
  sb.querySelector('b').textContent = Math.max(0, soldiers).toLocaleString();
  mb.querySelector('em').style.width = Math.max(0, morale) + '%';
  mb.querySelector('b').textContent = morale;
}

async function openBattle(ev) {
  const st = S.view.state;
  addLog(ev.text, 'battle_start', ev.fid);
  S.map.battleMark(ev.to, true);
  const show = battleShown(ev);
  const def = ev.def_fid;
  const b = {
    to: ev.to, from: ev.city, round: 0, wall: ev.wall,
    att: { fid: ev.fid, officers: ev.att_officers, soldiers: ev.att_soldiers, start: ev.att_soldiers, morale: S.view.state.cities[ev.city].morale },
    def: { fid: def, officers: ev.def_officers, soldiers: ev.def_soldiers, start: ev.def_soldiers, morale: Math.min(100, st.cities[ev.to].morale + 5) },
  };
  S.battle = { show, b, maxWall: S.stat.cities[ev.to].max_def };
  S.skip = false;
  $('#bSkip').textContent = '⏭ 加快';
  if (!show) return;
  if (involvesLocal(ev.fid, def)) narrator.say(ev.text);
  $('#battle').classList.remove('hidden');
  $('#bTactics').replaceChildren();
  $('#bAdvice').replaceChildren();
  $('#bWait').textContent = '';
  if (!S.bv) S.bv = new BattleView($('#battleCanvas'));
  S.bv.setup({ attColor: fcolor(ev.fid), defColor: fcolor(def), attSoldiers: ev.att_soldiers, defSoldiers: ev.def_soldiers, wall: ev.wall, cityDef: true, terrain: ev.terrain });
  S.bv.setWall(ev.wall / S.battle.maxWall);
  sideHud('att', b); sideHud('def', b);
  setHudNums('att', b.att.soldiers, b.att.start, b.att.morale);
  setHudNums('def', b.def.soldiers, b.def.start, b.def.morale);
  $('#bRound').textContent = `${cname(ev.to)} 攻防戰`;
  $('#bWall').textContent = `城防 ${ev.wall}／${S.battle.maxWall}`;
  $('#bMsg').textContent = ev.text;
  sfx('drum');
  await sleep(S.skip ? 200 : 1300);
}

function openBattleFromState() {
  const b = S.view.state.battle;
  const ev = { fid: b.att.fid, def_fid: b.def.fid, city: b.from, to: b.to, att_officers: b.att.officers, def_officers: b.def.officers, att_soldiers: b.att.soldiers, def_soldiers: b.def.soldiers, wall: b.wall, terrain: S.stat.cities[b.to].terrain, text: `${cname(b.to)} 戰鬥繼續` };
  openBattle(ev).then(() => { if (S.battle) { S.battle.b.att.start = b.att.start; S.battle.b.def.start = b.def.start; S.battle.b.round = b.round; } render(); });
}

async function battleRound(ev) {
  const B = S.battle;
  if (!B) return;
  addLog(ev.text, 'battle_round');
  B.b.round = ev.round;
  if (!B.show) return;
  $('#bTactics').replaceChildren();
  $('#bAdvice').replaceChildren();
  $('#bWait').textContent = '';
  $('#bRound').textContent = `第 ${ev.round}／10 回合`;
  $('#bAtt .btac').textContent = '戰術：' + ev.att_tactic + (ev.att_scheme === false ? '（失敗）' : ev.att_scheme ? '（成功）' : '');
  $('#bDef .btac').textContent = '戰術：' + ev.def_tactic + (ev.def_scheme === false ? '（失敗）' : ev.def_scheme ? '（成功）' : '');
  $('#bMsg').textContent = ev.text;
  for (const t of new Set([ev.att_tactic, ev.def_tactic])) sfx({ 突擊: 'charge', 齊射: 'arrows', 固守: 'shield', 計策: 'fire', 單挑: 'clash' }[t] || 'click');
  if (S.skip) {
    setHudNums('att', ev.att_soldiers, B.b.att.start, ev.att_morale);
    setHudNums('def', ev.def_soldiers, B.b.def.start, ev.def_morale);
    return;
  }
  await S.bv.play(ev);
  if (ev.att_tactic === '撤退') return;
  setHudNums('att', ev.att_soldiers, B.b.att.start, ev.att_morale);
  setHudNums('def', ev.def_soldiers, B.b.def.start, ev.def_morale);
  if (ev.wall != null) { $('#bWall').textContent = `城防 ${ev.wall}／${B.maxWall}`; S.bv.setWall(ev.wall / B.maxWall); }
}

async function battleDuel(ev) {
  const B = S.battle;
  addLog(ev.text, 'duel');
  if (!B || !B.show) return;
  const st = S.view.state;
  const A = st.officers[ev.a], D = st.officers[ev.b];
  const hp = (id) => h('div', { class: 'hp' }, h('em', { id: 'hp-' + id, style: { width: '100%' } }));
  const hud = $('#duelHud');
  hud.replaceChildren(
    h('div', { class: 'duel-p' }, h('img', { src: officerUrl(A.id) }), h('div', {}, h('div', { class: 'dn' }, A.name), h('div', { class: 'small' }, `武力 ${A.war}`), hp(A.id))),
    h('div', { class: 'duel-vs' }, 'VS'),
    h('div', { class: 'duel-p r' }, h('img', { src: officerUrl(D.id) }), h('div', {}, h('div', { class: 'dn' }, D.name), h('div', { class: 'small' }, `武力 ${D.war}`), hp(D.id))));
  hud.classList.remove('hidden');
  $('#bMsg').textContent = `${A.name} 與 ${D.name} 單挑！`;
  if (involvesLocal(B.b.att.fid, B.b.def.fid)) narrator.say(`${A.name}與${D.name}出陣單挑！`);
  sfx('drum');
  if (!S.skip) {
    await S.bv.duel(ev, (i, bt) => {
      sfx('clash');
      for (const [id, v] of Object.entries(bt.hp)) { const e = document.getElementById('hp-' + id); if (e) e.style.width = v + '%'; }
    });
  }
  $('#bMsg').textContent = ev.text;
  if (involvesLocal(B.b.att.fid, B.b.def.fid)) narrator.say(ev.text);
  setHudNums('att', B.b.att.soldiers, B.b.att.start, ev.att_morale);
  setHudNums('def', B.b.def.soldiers, B.b.def.start, ev.def_morale);
  await sleep(S.skip ? 300 : 1200);
  hud.classList.add('hidden');
}

async function finishBattle(ev) {
  const B = S.battle;
  S.map.battleMark(null, false);
  if (!B) return;
  if (B.show) {
    const word = { att_win: `${fname(ev.fid)} 攻陷 ${cname(ev.city)}！`, def_win: `${fname(ev.def_fid)} 守城成功！`, timeout: '久攻不下，退兵', retreat: '攻方撤退' }[ev.result];
    const mineWin = (ev.result === 'att_win' && involvesLocal(ev.fid)) || (ev.result !== 'att_win' && involvesLocal(ev.def_fid));
    const mineLose = involvesLocal(ev.fid, ev.def_fid) && !mineWin;
    sfx(mineLose ? 'defeat' : 'victory');
    const banner = h('div', { class: 'bresult' }, mineWin ? '大勝！' : mineLose ? '敗北…' : word);
    $('#battle').append(banner);
    $('#bTactics').replaceChildren();
    $('#bWait').textContent = '';
    if (!S.skip) await S.bv.finish(ev.result);
    $('#bMsg').textContent = word;
    await sleep(S.skip ? 500 : 1200);
    banner.remove();
  }
  closeBattle();
}

function closeBattle(force) {
  S.battle = null;
  $('#battle').classList.add('hidden');
  $('#duelHud').classList.add('hidden');
  clearTimeout(S.tacticTimer);
  if (force && S.bv) { S.bv.dispose(); S.bv = null; }
}

// 依目前狀態顯示我方的戰術按鈕
function battleOptions(b, role) {
  const st = S.view.state;
  const canDuel = (side) => side.officers.some((o) => !(side.dueled || []).includes(o) && st.officers[o] && st.officers[o].war >= 55);
  const opts = ['突擊', '齊射', '固守', '計策'];
  if (canDuel(b.att) && canDuel(b.def)) opts.push('單挑');
  if (role === 'att') opts.push('撤退');
  return opts;
}

async function renderTactics() {
  const st = S.view.state;
  if (st.phase !== 'battle' || !st.battle) { S.battleMine = null; return; }
  if (!S.battle) { if (involvesLocal(st.battle.att.fid, st.battle.def.fid)) openBattleFromState(); return; }
  const b = st.battle;
  const mineP = S.view.pending.find((p) => p.kind === 'tactic' && p.fid && localCtl(p.fid));
  const box = $('#bTactics');
  if (!mineP) {
    S.battleMine = null;
    box.replaceChildren();
    const waitRemote = S.view.pending.find((p) => p.kind === 'tactic' && p.fid && S.view.ctrl[p.fid] !== 'ai' && !localCtl(p.fid));
    $('#bWait').textContent = waitRemote ? `等待 ${st.players[waitRemote.fid].name || fname(waitRemote.fid)} 下令…` : '';
    // 房主：遠端玩家 45 秒沒下令就自動固守，遊戲不會卡住
    if (waitRemote && S.role === 'host' && S.view.ctrl[waitRemote.fid] === 'remote') {
      const k = `${b.round}|${waitRemote.role}`;
      if (S.tacticTimerKey !== k) {
        clearTimeout(S.tacticTimer);
        S.tacticTimerKey = k;
        S.tacticTimer = setTimeout(async () => {
          const cur = S.view && S.view.state.battle;
          if (!cur || cur.round !== b.round || cur.choice[waitRemote.role]) return;
          const r = await engine('act', { fid: waitRemote.fid, action: { type: 'tactic', tactic: '固守' } });
          toast('對方逾時未下令，自動固守', 'info');
          await enqueue(() => applyView(r));
          pump();
        }, 45000);
      }
    }
    return;
  }
  const key = `${b.round}|${mineP.role}`;
  if (S.battleMine === mineP.fid && box.dataset.key === key && box.children.length) return;
  S.battleMine = mineP.fid;
  box.dataset.key = key;
  $('#bWait').textContent = `第 ${b.round + 1} 回合：請下令！`;
  if (b.round === 0) narrator.say('請選擇戰術');
  const tips = S.stat.tactic_tips;
  box.replaceChildren(...battleOptions(b, mineP.role).map((t) => h('button', { 'data-t': t, onclick: () => chooseTactic(t) }, t, h('small', {}, tips[t]))));
  // 軍師建議
  const adv = myAdvisor();
  const r = await getAdvice();
  if (r && r.tactic && box.dataset.key === key) {
    const btn = box.querySelector(`[data-t="${r.tactic.tactic}"]`);
    if (btn) btn.classList.add('suggest');
    $('#bAdvice').replaceChildren(h('img', { src: portraitUrl(adv.id) }), h('span', {}, `${adv.name}：建議「${r.tactic.tactic}」。${r.tactic.reason}`));
  }
}

function chooseTactic(t) {
  $('#bTactics').replaceChildren();
  $('#bAdvice').replaceChildren();
  $('#bWait').textContent = '已下令，等待對方…';
  sfx('click');
  doAct({ type: 'tactic', tactic: t });
}

// ---------------- 存檔、國力、結束 ----------------
async function saveGame() {
  const st = S.view.state;
  const sc = S.stat.scenarios[st.scenario];
  const me = viewer();
  const nameIn = h('input', { value: `${sc.name} ${me ? fname(me) : '觀戰'} ${st.year}年${st.month}月`, style: { width: '100%' } });
  const ok = await modal('存檔', nameIn, [{ label: '取消', value: false }, { label: '存檔', value: true, primary: true }]);
  if (!ok) return;
  const r = await engine('save');
  await host('save_write', { name: nameIn.value, data: { meta: { scenario: sc.name, year: st.year, month: st.month, faction: me ? fname(me) : '', mode: S.mode }, mode: S.mode, state: r.state } });
  toast('已存檔', 'ok');
}

async function openLoad() {
  const r = await host('save_list');
  const list = h('div', { class: 'choose-list' });
  const back = h('div', { class: 'modal-back' });
  const draw = (saves) => {
    list.replaceChildren(...(saves.length ? saves.map((s) => h('div', { class: 'choose', style: { gridTemplateColumns: '1fr auto auto' } },
      h('div', {}, h('div', {}, s.name), h('div', { class: 'small' }, `${s.meta.scenario || ''}・${s.meta.faction || ''}・${s.meta.year || ''}年${s.meta.month || ''}月・存於 ${new Date(s.time * 1000).toLocaleString()}`)),
      h('button', { class: 'primary small', onclick: () => { back.remove(); loadGame(s.name); } }, '讀取'),
      h('button', { class: 'small ghost', onclick: async () => { if (await modal('刪除存檔', `確定刪除「${s.name}」？`, [{ label: '取消', value: false }, { label: '刪除', value: true, primary: true }])) { await host('save_delete', { name: s.name }); draw((await host('save_list')).saves); } } }, '刪除'))) : [h('p', {}, '還沒有存檔。遊戲中按「💾 存檔」就可以保存進度。')]));
  };
  draw(r.saves || []);
  back.append(h('div', { class: 'modal' }, h('h3', {}, '繼續遊戲'), list, h('div', { class: 'modal-btns' }, h('button', { onclick: () => back.remove() }, '關閉'))));
  document.body.append(back);
}

async function loadGame(name) {
  const r = await host('save_read', { name });
  if (!r.ok) { toast(r.error, 'err'); return; }
  const v = await engine('load', { state: r.data.state });
  if (!v.ok) { toast(v.error, 'err'); return; }
  // 存檔裡的遠端玩家改由電腦接手
  let view = v;
  for (const [fid, p] of Object.entries(v.state.players)) if (p.kind === 'remote') view = await engine('set_player', { fid, patch: { kind: 'ai' } });
  S.mode = r.data.mode === 'net' ? 'pva' : (r.data.mode || 'pva');
  S.role = 'local';
  enterGame(view);
}

function showRanking() {
  const st = S.view.state;
  const rows = st.order.filter((f) => st.factions[f].alive).map((f) => {
    const cs = Object.values(st.cities).filter((c) => c.owner === f);
    return { f, score: score(f), cities: cs.length, sol: cs.reduce((a, c) => a + c.soldiers, 0), offs: Object.values(st.officers).filter((o) => o.faction === f && o.status === 'serve').length };
  }).sort((a, b) => b.score - a.score);
  modal('國力排行', h('div', {},
    h('div', { class: 'rank-row small' }, h('span', {}, '名次'), h('span', {}), h('span', {}, '勢力'), h('span', {}, '城池'), h('span', {}, '武將'), h('span', {}, '國力')),
    ...rows.map((r, i) => h('div', { class: 'rank-row', style: { '--fc': fcolor(r.f) } }, h('span', {}, i + 1), h('i'), h('span', {}, fname(r.f) + (localFids().includes(r.f) ? '（我方）' : '')), h('span', {}, r.cities), h('span', {}, r.offs), h('b', {}, r.score))),
    st.limit_months ? h('p', { class: 'small' }, `期限：第 ${st.limit_months} 個月結束時國力最高者獲勝（目前第 ${st.turn} 個月）。`) : h('p', { class: 'small' }, '勝利條件：消滅所有其他勢力。')));
}

async function showGameOver(ev) {
  const st = S.view.state;
  const win = ev.winner;
  const mine = win && localFids().includes(win);
  sfx(mine || !localFids().length ? 'victory' : 'defeat');
  const ruler = win ? st.factions[win].ruler : null;
  narrator.say(mine ? `恭喜主公，${ev.text}` : ev.text);
  const again = await modal('遊戲結束', h('div', { class: 'over-box' },
    ruler ? h('img', { src: officerUrl(ruler) }) : '',
    h('h2', {}, mine ? '恭喜主公，一統天下！' : win ? `${fname(win)} 獲勝` : '天下大亂'),
    h('p', {}, ev.text)), [{ label: '留在地圖', value: false }, { label: '回首頁', value: true, primary: true }]);
  if (again) { S.leaving = true; S.view = null; closeNet(); showScreen('home'); }
}

// ---------------- 遠端對戰 ----------------
async function openNetMenu() {
  const code = h('input', { placeholder: '6 位數房號', maxLength: 6, inputMode: 'numeric', style: { fontSize: '24px', width: '180px', letterSpacing: '4px', textAlign: 'center' } });
  const v = await modal('遠端對戰', h('div', {},
    h('p', {}, '建立房間：您當房主，選好劇本與勢力後把房號告訴朋友。'),
    h('p', {}, '加入房間：輸入朋友給您的 6 位數房號。'), code,
    h('p', { class: 'small' }, `加入時使用您在「設定」選的半身照（${S.settings.profile.name}）與 AI 軍師（${advName(S.settings.profile.advisor)}）。`)),
  [{ label: '取消', value: null }, { label: '建立房間', value: 'host' }, { label: '加入房間', value: 'join', primary: true }]);
  if (v === 'host') openSetup('net');
  if (v === 'join') joinRoom(code.value);
}

async function openRoom() {
  const box = $('#netBox');
  if (S.room && S.room.code) { renderNetBox(); return; }
  box.replaceChildren(h('div', {}, '正在建立房間…'));
  try {
    S.room = new Room(S.settings.net);
    await S.room.open();
  } catch (e) {
    box.replaceChildren(h('div', { style: { color: '#ff9a8a' } }, '建立房間失敗：' + e.message), h('button', { class: 'small', onclick: () => { S.room = null; openRoom(); } }, '重試'));
    S.room = null;
    return;
  }
  bindRoom(S.room);
  renderNetBox();
}

function renderNetBox() {
  const code = S.room.code;
  $('#netBox').replaceChildren(
    h('div', {}, '房間號碼（告訴朋友）：'), h('div', { class: 'code' }, code),
    h('div', { class: 'small' }, '朋友在首頁按「🌐 遠端對戰 → 加入房間」輸入房號。加入的人依序坐上「遠端玩家」的勢力。'),
    h('button', { class: 'small', onclick: () => { navigator.clipboard.writeText(`來玩小柯機器人三國志！房號：${code}`).then(() => toast('已複製邀請文字', 'ok')); } }, '📋 複製邀請文字'));
}

function bindRoom(room) {
  room.on('join', (id, hello) => {
    if (S.screen === 'setup' && S.setup) {
      const seat = Object.entries(S.setup.seats).find(([, s]) => s.kind === 'remote' && !s.peer);
      if (!seat) { room.kick(id, '房間已滿'); return; }
      Object.assign(seat[1], { peer: id, name: hello.name || '遠端玩家', portrait: hello.portrait || 'm02', advisor: hello.advisor || 'adv01' });
      sfx('capture');
      toast(`${hello.name || '遠端玩家'} 加入了房間`, 'ok');
      renderSeats();
    } else room.kick(id, '遊戲已經開始');
  });
  room.on('leave', async (id, reason) => {
    if (S.screen === 'setup' && S.setup) {
      const seat = Object.values(S.setup.seats).find((s) => s.peer === id);
      if (seat) { delete seat.peer; delete seat.name; toast('遠端玩家離開了房間', 'err'); renderSeats(); }
    } else if (S.view) {
      const fid = Object.entries(S.view.state.players).find(([, p]) => p.peer === id);
      if (fid) {
        toast(`${fid[1].name || '遠端玩家'} ${reason}，改由電腦接手`, 'err');
        const r = await engine('set_player', { fid: fid[0], patch: { kind: 'ai' } });
        await enqueue(() => applyView(r));
        pump();
      }
    }
  });
  room.on('msg', (id, m) => onGuestMsg(id, m));
  room.on('call', (call) => answerCall(call));
}

function seatOf(id) {
  const e = Object.entries(S.view.state.players).find(([, p]) => p.peer === id && p.kind === 'remote');
  return e ? e[0] : null;
}

async function onGuestMsg(id, m) {
  if (!S.view) return;
  const fid = seatOf(id);
  if (!fid) return;
  if (m.t === 'act') {
    const r = await engine('act', { fid, action: m.action });
    if (!r.ok) S.room.send(id, { t: 'err', error: r.error });
    await enqueue(() => applyView(r));
    pump();
  } else if (m.t === 'proxy' || m.t === 'advisor') {
    const r = await engine('set_player', { fid, patch: m.t === 'proxy' ? { proxy: !!m.on } : { advisor: m.advisor } });
    await enqueue(() => applyView(r));
    pump();
  } else if (m.t === 'advise') {
    const r = await engine('advise', { fid, limit: 3 });
    S.room.send(id, { t: 'advice', data: r });
  } else if (m.t === 'chat') {
    S.room.broadcast({ t: 'chat', from: S.view.state.players[fid].name, text: m.text });
    toast(`${S.view.state.players[fid].name}：${m.text}`);
  }
}

// 遮住對手這回合已選的戰術，避免偷看
function maskFor(id, r) {
  const fid = seatOf(id);
  const v = { ok: r.ok, state: r.state, pending: r.pending, ctrl: r.ctrl, events: r.events };
  if (r.state && r.state.battle) {
    const b = r.state.battle;
    const st = { ...r.state, battle: { ...b, choice: { att: b.choice.att && b.att.fid !== fid ? '?' : b.choice.att, def: b.choice.def && b.def.fid !== fid ? '?' : b.choice.def } } };
    v.state = st;
  }
  return { t: 'view', you: fid, view: v };
}
function broadcastView(r) {
  if (!S.room || !S.view && !r.state) return;
  S.room.broadcast(r, (id) => maskFor(id, r));
}
function broadcastLobby() {
  if (!S.room || S.screen !== 'setup' || !S.setup) return;
  const sc = S.stat.scenarios[S.setup.scenario];
  S.room.broadcast({ t: 'lobby', scenario: sc.name, seats: Object.entries(S.setup.seats).map(([fid, s]) => ({ faction: sc.factions.find((f) => f.key === fid).name, kind: s.kind, name: s.name || '', peer: s.peer || '' })) });
}

async function joinRoom(code) {
  const prof = S.settings.profile;
  const wait = h('div', {}, h('p', {}, '正在連線…'));
  const back = h('div', { class: 'modal-back' }, h('div', { class: 'modal' }, h('h3', {}, '加入遠端對戰'), wait,
    h('div', { class: 'modal-btns' }, h('button', { onclick: () => { closeNet(); back.remove(); } }, '離開'))));
  document.body.append(back);
  try {
    S.link = new Link(S.settings.net);
    S.link.on('msg', (m) => onHostMsg(m, wait, back));
    S.link.on('lost', (reason) => { back.remove(); if (S.role === 'guest') { modal('連線中斷', reason + '。'); S.leaving = true; S.view = null; closeNet(); closeBattle(true); showScreen('home'); } });
    S.link.on('call', (call) => answerCall(call));
    await S.link.join(code, { name: prof.name, portrait: prof.portrait, advisor: prof.advisor });
    S.role = 'guest';
    wait.replaceChildren(h('p', {}, '✅ 已連上房間，等待房主開始遊戲…'));
  } catch (e) {
    wait.replaceChildren(h('p', { style: { color: '#ff9a8a' } }, '加入失敗：' + e.message));
    S.link = null;
  }
}

async function onHostMsg(m, wait, back) {
  if (m.t === 'lobby' && wait) {
    wait.replaceChildren(h('p', {}, `✅ 已連上房間（劇本：${m.scenario}），等待房主開始遊戲…`),
      ...m.seats.filter((s) => s.kind !== 'ai').map((s) => h('div', { class: 'small' }, `${s.faction}：${s.kind === 'human' ? '房主 ' + s.name : s.peer ? s.name : '（空位）'}`)));
  } else if (m.t === 'reject') {
    toast(m.reason, 'err');
    if (back) back.remove();
    closeNet();
  } else if (m.t === 'view') {
    if (back && back.isConnected) back.remove();
    S.myFid = m.you;
    if (S.screen !== 'game' || !S.view) {
      S.mode = 'net';
      S.role = 'guest';
      enterGame(m.view);
      await enqueue(() => playEvents(m.view.events || []));
      return;
    }
    await enqueue(() => applyView(m.view, { broadcast: false }));
  } else if (m.t === 'err') {
    toast(m.error, 'err'); sfx('error');
  } else if (m.t === 'advice') {
    if (S.adviceWait) { const f = S.adviceWait; S.adviceWait = null; f(m.data); }
  } else if (m.t === 'chat') {
    toast(`${m.from}：${m.text}`);
  }
}

function closeNet() {
  if (S.room) { S.room.close(); S.room = null; }
  if (S.link) { S.link.close(); S.link = null; }
  stopVoice();
  if (S.role !== 'local') S.role = 'local';
}

// 語音通話（房主與每位來賓）
async function toggleVoice() {
  if (S.voice) { stopVoice(); return; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    S.voice = { stream, calls: [] };
    $('#gVoice').textContent = '🎤 通話中';
    S.music.setDuck(true);
    if (S.room) for (const id of S.room.guests.keys()) setupCall(S.room.call(id, stream));
    if (S.link) setupCall(S.link.call(stream));
  } catch (e) { toast('無法使用麥克風：' + e.message, 'err'); }
}
function setupCall(call) {
  if (!call) return;
  S.voice.calls.push(call);
  call.on('stream', (rs) => { const a = new Audio(); a.srcObject = rs; a.play().catch(() => {}); call._audio = a; });
}
async function answerCall(call) {
  if (!S.voice) {
    const ok = await modal('語音通話', '對方邀請您語音通話，要開啟麥克風嗎？', [{ label: '拒絕', value: false }, { label: '接聽', value: true, primary: true }]);
    if (!ok) { call.close(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      S.voice = { stream, calls: [] };
      $('#gVoice').textContent = '🎤 通話中';
      S.music.setDuck(true);
    } catch { call.close(); return; }
  }
  call.answer(S.voice.stream);
  setupCall(call);
}
function stopVoice() {
  if (!S.voice) return;
  for (const c of S.voice.calls) { try { c.close(); } catch {} if (c._audio) c._audio.srcObject = null; }
  S.voice.stream.getTracks().forEach((t) => t.stop());
  S.voice = null;
  $('#gVoice').textContent = '🎤 語音';
  S.music.setDuck(false);
}

window.addEventListener('pagehide', () => { closeNet(); narrator.stop(); });

boot().catch((e) => { console.error(e); toast('啟動失敗：' + e.message, 'err', 10000); });
