// 與 Python 溝通：engine＝遊戲引擎（sanguo/），host＝電腦功能（設定、音樂、存檔、更新、Claude 軍師）
// 桌面版由 desktop/app.py 的本機伺服器提供 /api/engine 與 /api/host
async function post(url, method, params) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ method, params: params || {} }) });
  if (!r.ok) throw new Error('連線錯誤 ' + r.status);
  return r.json();
}

export const engine = (method, params) => post('/api/engine', method, params);
export const host = (method, params) => post('/api/host', method, params);

// 音樂播放器沿用小柯象棋的介面
window.xk = window.xk || {};
window.xk.music = {
  list: async () => (await host('music_list')).tracks || [],
  add: async () => (await host('music_add')).added || 0,
  remove: (file) => host('music_remove', { file }),
};
