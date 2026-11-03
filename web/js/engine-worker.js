// 網頁版與手機版的遊戲引擎：用 Pyodide（瀏覽器裡的 Python）執行和桌面版同一份 sanguo/ 程式
// 主畫面送 {id, method, params}，這裡回 {id, result}；載入過程送 {progress}
let py = null;
let readyPromise = null;

function init(base, pyBase) {
  readyPromise ||= (async () => {
    postMessage({ progress: '正在下載 Python 引擎…' });
    importScripts(base + 'pyodide.js');
    py = await loadPyodide({ indexURL: base });
    postMessage({ progress: '正在載入遊戲規則…' });
    const files = await (await fetch(pyBase + 'files.json')).json();
    py.FS.mkdirTree('/home/pyodide/sanguo');
    for (const f of files) {
      const text = await (await fetch(pyBase + 'sanguo/' + f)).text();
      py.FS.writeFile('/home/pyodide/sanguo/' + f, text);
    }
    py.runPython(`
import sys, json
sys.path.insert(0, '/home/pyodide')
from sanguo.api import Engine
_engine = Engine()
def _call(method, params):
    return json.dumps(_engine.call(method, json.loads(params)), ensure_ascii=False)
`);
    postMessage({ progress: '' });
  })();
  return readyPromise;
}

onmessage = async (e) => {
  const m = e.data;
  if (m.init) {
    try { await init(m.init.base, m.init.py); postMessage({ ready: true }); } catch (err) { postMessage({ fatal: String(err && err.message || err) }); }
    return;
  }
  try {
    await readyPromise;
    const call = py.globals.get('_call');
    const out = call(m.method, JSON.stringify(m.params || {}));
    postMessage({ id: m.id, result: out });
  } catch (err) {
    postMessage({ id: m.id, result: JSON.stringify({ ok: false, error: '引擎錯誤：' + String(err && err.message || err).split('\n').slice(-2).join(' ') }) });
  }
};
