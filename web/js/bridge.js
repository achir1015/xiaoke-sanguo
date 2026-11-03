// 與 Python 溝通：engine＝遊戲引擎（sanguo/），host＝電腦功能（設定、音樂、存檔、更新、Claude 軍師）
// 桌面版：desktop/app.py 的本機伺服器提供 /api/engine 與 /api/host
// 網頁版／手機版（window.XK_WEB）：引擎在 Pyodide Worker 裡跑，電腦功能由 webhost.js 在瀏覽器裡完成
import { webHost } from './webhost.js';

const WEB = window.XK_WEB || null;

async function post(url, method, params) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ method, params: params || {} }) });
  if (!r.ok) throw new Error('連線錯誤 ' + r.status);
  return r.json();
}

let worker = null;
let seq = 0;
const waiting = new Map();
export const engineStatus = { ready: !WEB, progress: '', onProgress: null };

function startWorker() {
  worker = new Worker('js/engine-worker.js');
  worker.onmessage = (e) => {
    const m = e.data;
    if ('progress' in m) { engineStatus.progress = m.progress; if (engineStatus.onProgress) engineStatus.onProgress(m.progress); return; }
    if (m.ready) { engineStatus.ready = true; if (engineStatus.onProgress) engineStatus.onProgress(''); return; }
    if (m.fatal) { engineStatus.progress = '遊戲引擎載入失敗：' + m.fatal; if (engineStatus.onProgress) engineStatus.onProgress(engineStatus.progress); return; }
    const f = waiting.get(m.id);
    if (f) { waiting.delete(m.id); f(JSON.parse(m.result)); }
  };
  worker.postMessage({ init: { base: new URL(WEB.pyodide, location.href).href, py: new URL(WEB.py || 'py/', location.href).href } });
}

function workerCall(method, params) {
  if (!worker) startWorker();
  return new Promise((resolve) => {
    const id = ++seq;
    waiting.set(id, resolve);
    worker.postMessage({ id, method, params: params || {} });
  });
}

export const engine = WEB ? workerCall : (method, params) => post('/api/engine', method, params);
export const host = WEB ? webHost : (method, params) => post('/api/host', method, params);

// 音樂播放器沿用小柯象棋的介面
window.xk = window.xk || {};
window.xk.music = {
  list: async () => (await host('music_list')).tracks || [],
  add: async () => (await host('music_add')).added || 0,
  remove: (file) => host('music_remove', { file }),
};
