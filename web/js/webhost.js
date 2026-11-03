// 網頁版與手機版的「電腦功能」：沒有 Python 伺服器時，設定、存檔、音樂、更新、AI 軍師都在瀏覽器裡完成
// Android App 另外提供 window.XiaokeAndroid（語音、更新、開網頁）
const A = window.XiaokeAndroid || null;
const REPO = 'achir1015/xiaoke-sanguo';
const SKEY = 'xks-settings';
const KKEY = 'xks-key';

// ---------------- IndexedDB（存檔、自己加入的音樂）----------------
let dbp = null;
function db() {
  dbp ||= new Promise((resolve, reject) => {
    const r = indexedDB.open('xiaoke-sanguo', 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('saves'); r.result.createObjectStore('music'); };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  return dbp;
}
async function tx(store, mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req && req.result);
    t.onerror = () => reject(t.error);
  });
}
const idbGet = (s, k) => tx(s, 'readonly', (o) => o.get(k));
const idbPut = (s, k, v) => tx(s, 'readwrite', (o) => o.put(v, k));
const idbDel = (s, k) => tx(s, 'readwrite', (o) => o.delete(k));
const idbKeys = (s) => tx(s, 'readonly', (o) => o.getAllKeys());

function loadSettings() { try { return JSON.parse(localStorage.getItem(SKEY) || '{}'); } catch { return {}; } }
function getKey() { try { return atob(localStorage.getItem(KKEY) || ''); } catch { return ''; } }
let version = '0.0.0';
const musicUrls = {};

const H = {
  async app_info() {
    try { version = (await (await fetch('version.json', { cache: 'no-store' })).json()).version; } catch {}
    let platform = 'web';
    if (A) { try { platform = JSON.parse(A.appInfo()).platform || 'android'; } catch { platform = 'android'; } }
    if (window.XiaokeIOS) platform = 'ios';
    return { name: '小柯機器人三國志遊戲', version, platform, desktop: false, repo: REPO };
  },
  settings_get() { return { settings: loadSettings(), has_key: !!getKey() }; },
  settings_set({ patch }) {
    const d = loadSettings();
    for (const [k, v] of Object.entries(patch || {})) {
      if (v && typeof v === 'object' && !Array.isArray(v) && d[k] && typeof d[k] === 'object') Object.assign(d[k], v);
      else d[k] = v;
    }
    localStorage.setItem(SKEY, JSON.stringify(d));
    return {};
  },
  set_api_key({ key }) {
    key = (key || '').trim();
    if (key) localStorage.setItem(KKEY, btoa(key)); else localStorage.removeItem(KKEY);
    return { has_key: !!key };
  },
  async advisor_ask({ question, context, persona }) {
    const key = getKey();
    if (!key) return { ok: false, error: 'no_key' };
    const { default: Anthropic } = await import('../vendor/anthropic.js');
    const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true, timeout: 60000, maxRetries: 1 });
    const name = persona.name || '軍師';
    const system = `你是三國時代的軍師「${name}」（${persona.epithet || ''}），風格偏向「${persona.style_name || '均衡'}」。你正在小柯機器人三國志遊戲中輔佐玩家。請用繁體中文、以${name}的口吻回答，開頭用「${persona.say || '臣以為'}」。回答要具體可行：指出該在哪座城、派哪位武將、做哪個指令（開墾、商業、修城、撫民、徵兵、訓練、搜索、登用、褒賞、移動、運輸、出征），或在戰鬥中建議哪個戰術（突擊、齊射、固守、計策、單挑、撤退）。三到六句即可，不要用 Markdown 標題或表格。`;
    try {
      const resp = await client.beta.messages.create({
        model: 'claude-opus-5-5', max_tokens: 2000, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
        output_config: { effort: 'low' }, system,
        messages: [{ role: 'user', content: `目前局勢：\n${context}\n\n主公的問題：${question}` }],
      });
      if (resp.stop_reason === 'refusal') return { ok: false, error: '軍師不便回答這個問題' };
      const text = resp.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
      return { ok: true, text: text || '……' };
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) return { ok: false, error: '金鑰無效，請到「設定」重新輸入' };
      if (e instanceof Anthropic.RateLimitError) return { ok: false, error: '請求太頻繁，請稍後再問' };
      if (e instanceof Anthropic.APIConnectionError) return { ok: false, error: '連不上網路' };
      if (e instanceof Anthropic.APIError) return { ok: false, error: `軍師暫時無法回答（${e.status}）` };
      return { ok: false, error: String(e.message || e) };
    }
  },
  async music_list() {
    const tracks = [];
    try {
      for (const t of await (await fetch('assets/music/tracks.json')).json()) tracks.push({ file: t.file, title: t.title, seconds: t.seconds, builtin: true, url: 'assets/music/' + t.file });
    } catch {}
    for (const k of (await idbKeys('music').catch(() => [])) || []) {
      if (!musicUrls[k]) { const b = await idbGet('music', k); if (b) musicUrls[k] = URL.createObjectURL(b); }
      if (musicUrls[k]) tracks.push({ file: k, title: k.replace(/\.[^.]+$/, ''), builtin: false, url: musicUrls[k] });
    }
    return { tracks };
  },
  music_add() {
    return new Promise((resolve) => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'audio/*'; inp.multiple = true;
      inp.onchange = async () => {
        let n = 0;
        for (const f of inp.files) { await idbPut('music', f.name, f); n++; }
        resolve({ added: n });
      };
      inp.click();
    });
  },
  async music_remove({ file }) { await idbDel('music', file); if (musicUrls[file]) { URL.revokeObjectURL(musicUrls[file]); delete musicUrls[file]; } return {}; },
  async save_list() {
    const out = [];
    for (const k of (await idbKeys('saves')) || []) { const v = await idbGet('saves', k); out.push({ name: k, time: (v && v.time) || 0, meta: (v && v.data && v.data.meta) || {} }); }
    out.sort((a, b) => b.time - a.time);
    return { saves: out };
  },
  async save_write({ name, data }) { name = String(name).replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 60) || 'save'; await idbPut('saves', name, { time: Date.now() / 1000, data }); return { name }; },
  async save_read({ name }) { const v = await idbGet('saves', name); return v ? { data: v.data } : { ok: false, error: '找不到這個存檔' }; },
  async save_delete({ name }) { await idbDel('saves', name); return {}; },
  async update_check() {
    if (A && A.checkUpdate) {
      try { const r = JSON.parse(A.checkUpdate()); return { status: r.ok === false ? 'error' : 'ok', ...r }; } catch (e) { return { status: 'error', message: String(e) }; }
    }
    // iPhone／iPad App：比對線上版的版本號，有新版就打開安裝頁重新安裝（存檔與設定會保留）
    if (window.XiaokeIOS) {
      try {
        const v = await (await fetch('https://achir1015.github.io/xiaoke-sanguo/online/version.json?t=' + Date.now(), { cache: 'no-store' })).json();
        return { status: 'ok', current: version, latest: v.version, notes: v.notes || '', url: '', page: 'https://achir1015.github.io/xiaoke-sanguo/ios/' };
      } catch (e) { return { status: 'error', message: String(e.message || e) }; }
    }
    // 網頁版：比對伺服器上的 version.json，新版只要重新整理
    try {
      const v = await (await fetch('version.json?t=' + Date.now(), { cache: 'no-store' })).json();
      return { status: 'ok', current: version, latest: v.version, notes: v.notes || '', url: '', page: location.href, reload: true };
    } catch (e) { return { status: 'error', message: String(e.message || e) }; }
  },
  update_install({ url, version: ver }) {
    if (A && A.installUpdate) { try { return JSON.parse(A.installUpdate(url, ver)); } catch (e) { return { status: 'error', message: String(e) }; } }
    location.reload();
    return { status: 'ok' };
  },
  update_status() {
    if (A && A.updateStatus) { try { return JSON.parse(A.updateStatus()); } catch {} }
    return { state: 'idle', pct: 0 };
  },
  open_url({ url }) {
    if (!String(url).startsWith('https://')) return { ok: false };
    if (A && A.openUrl) A.openUrl(url); else window.open(url, '_blank', 'noopener');
    return {};
  },
  quit() { return {}; },
};

export async function webHost(method, params) {
  const fn = H[method];
  if (!fn) return { ok: false, error: '這個版本沒有這個功能' };
  try {
    const r = await fn(params || {});
    if (r && typeof r === 'object' && !('ok' in r)) r.ok = true;
    return r;
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

// Android 原生語音（tts.js 會優先使用 window.xk.tts）
if (A && A.ttsSpeak) {
  const wait = {};
  let seq = 0;
  window.__xkTtsDone = (id) => { const f = wait[id]; if (f) { delete wait[id]; f(); } };
  window.xk = window.xk || {};
  window.xk.tts = {
    available: () => !!A.ttsAvailable && A.ttsAvailable(),
    voiceName: () => (A.ttsVoice ? A.ttsVoice() : '手機語音'),
    speak: (text, rate) => new Promise((res) => {
      const id = 't' + (++seq);
      wait[id] = res;
      A.ttsSpeak(String(text), rate || 1, id);
      setTimeout(() => window.__xkTtsDone(id), 3000 + String(text).length * 450);
    }),
    stop: () => { A.ttsStop(); Object.keys(wait).forEach(window.__xkTtsDone); },
  };
}
