// 遠端對戰：PeerJS（WebRTC）。房主（開房的人）執行遊戲引擎，其他人連到房主（星狀連線）。
// 房主把遊戲狀態廣播給大家；來賓只送出自己的指令。
import { Emitter, errMsg } from './util.js';

const PeerCtor = () => window.Peer || (window.peerjs && window.peerjs.Peer);
export const PREFIX = 'xksanguo-';
export const PROTOCOL = 1;

export function iceServers(s) {
  const list = String(s.stun || 'stun:stun.l.google.com:19302 stun:global.stun.twilio.com:3478').split(/\s+/).filter(Boolean).map((u) => ({ urls: u }));
  if (s.turn && s.turn.urls) list.push({ urls: s.turn.urls.split(/[\s,]+/).filter(Boolean), username: s.turn.username, credential: s.turn.credential });
  return list;
}

function peerOptions(s) {
  const o = { debug: 1, config: { iceServers: iceServers(s), sdpSemantics: 'unified-plan' } };
  if (s.server && s.server.mode === 'custom' && s.server.host) {
    Object.assign(o, { host: s.server.host, port: Number(s.server.port) || (s.server.secure ? 443 : 9000), path: s.server.path || '/', key: s.server.key || 'peerjs', secure: !!s.server.secure });
  }
  return o;
}

function openPeer(id, settings) {
  return new Promise((resolve, reject) => {
    const Peer = PeerCtor();
    if (!Peer) { reject(new Error('連線元件載入失敗')); return; }
    const peer = id ? new Peer(id, peerOptions(settings)) : new Peer(peerOptions(settings));
    let opened = false;
    const t = setTimeout(() => { if (!opened) { peer.destroy(); reject(new Error('連不上配對伺服器，請檢查網路或「設定」中的伺服器')); } }, 20000);
    peer.on('open', () => { opened = true; clearTimeout(t); resolve(peer); });
    peer.on('error', (e) => { if (!opened) { clearTimeout(t); peer.destroy(); reject(e); } });
  });
}

const randomCode = () => String(100000 + Math.floor(Math.random() * 900000));

// ---------------- 房主 ----------------
export class Room extends Emitter {
  constructor(settings) {
    super();
    this.settings = settings;
    this.guests = new Map(); // peerId → {conn, hello, lastSeen}
    this.code = '';
    this.closed = false;
  }

  async open() {
    for (let i = 0; i < 6 && !this.peer; i++) {
      const code = randomCode();
      try {
        this.peer = await openPeer(PREFIX + code, this.settings);
        this.code = code;
      } catch (e) {
        if (e && e.type === 'unavailable-id') continue;
        throw new Error(errMsg(e));
      }
    }
    if (!this.peer) throw new Error('無法建立房間，請稍後再試');
    this.peer.on('disconnected', () => { if (!this.closed) { try { this.peer.reconnect(); } catch {} } });
    this.peer.on('call', (call) => this.emit('call', call));
    this.peer.on('connection', (conn) => this._attach(conn));
    this.hb = setInterval(() => {
      const now = Date.now();
      for (const [id, g] of this.guests) {
        if (now - g.lastSeen > 15000) this._drop(id, '連線逾時');
        else try { g.conn.send({ t: 'ping' }); } catch {}
      }
    }, 3000);
    return this.code;
  }

  _attach(conn) {
    const id = conn.peer;
    const ready = () => {
      this.guests.set(id, { conn, hello: null, lastSeen: Date.now() });
    };
    conn.on('data', (m) => {
      const g = this.guests.get(id);
      if (g) g.lastSeen = Date.now();
      if (!m || typeof m !== 'object' || m.t === 'ping') return;
      if (m.t === 'bye') { this._drop(id, '對方已離開'); return; }
      if (m.t === 'hello') {
        if (m.proto !== PROTOCOL) { conn.send({ t: 'reject', reason: '雙方版本不同，請先更新到最新版' }); setTimeout(() => conn.close(), 300); return; }
        if (g) g.hello = m;
        this.emit('join', id, m);
        return;
      }
      this.emit('msg', id, m);
    });
    conn.on('close', () => this._drop(id));
    conn.on('error', (e) => console.warn('conn error', e));
    if (conn.open) ready(); else conn.on('open', ready);
  }

  _drop(id, reason = '連線中斷') {
    const g = this.guests.get(id);
    if (!g) return;
    this.guests.delete(id);
    try { g.conn.close(); } catch {}
    this.emit('leave', id, reason);
  }

  send(id, m) { const g = this.guests.get(id); if (g && g.conn.open) g.conn.send(m); }
  broadcast(m, mapFn) {
    for (const [id, g] of this.guests) if (g.conn.open) g.conn.send(mapFn ? mapFn(id, m) : m);
  }
  kick(id, reason) { this.send(id, { t: 'reject', reason }); setTimeout(() => this._drop(id, reason), 300); }

  call(id, stream) { return this.peer.call(id, stream, { metadata: { kind: 'voice' } }); }

  close() {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.hb);
    this.broadcast({ t: 'bye' });
    setTimeout(() => { try { this.peer && this.peer.destroy(); } catch {} }, 250);
  }
}

// ---------------- 來賓 ----------------
export class Link extends Emitter {
  constructor(settings) {
    super();
    this.settings = settings;
    this.conn = null;
    this.closed = false;
  }

  async join(code, hello) {
    this.code = String(code).replace(/\D/g, '');
    if (this.code.length !== 6) throw new Error('房間號碼是 6 位數字');
    this.peer = await openPeer(null, this.settings);
    this.peer.on('call', (call) => this.emit('call', call));
    this.peer.on('disconnected', () => { if (!this.closed) { try { this.peer.reconnect(); } catch {} } });
    await new Promise((resolve, reject) => {
      const conn = this.peer.connect(PREFIX + this.code, { reliable: true });
      const t = setTimeout(() => reject(new Error('找不到這個房間，請確認房號或請房主重新建立')), 20000);
      const onErr = (e) => { if (e && e.type === 'peer-unavailable') { clearTimeout(t); reject(new Error('找不到這個房間，請確認房號')); } };
      this.peer.on('error', onErr);
      conn.on('open', () => { clearTimeout(t); this.peer.off('error', onErr); this.conn = conn; resolve(); });
    });
    this.lastSeen = Date.now();
    this.conn.on('data', (m) => {
      this.lastSeen = Date.now();
      if (!m || typeof m !== 'object') return;
      if (m.t === 'ping') { this.send({ t: 'ping' }); return; }
      if (m.t === 'bye') { this._lost('房主已離開'); return; }
      this.emit('msg', m);
    });
    this.conn.on('close', () => this._lost());
    this.hb = setInterval(() => { if (Date.now() - this.lastSeen > 15000) this._lost('連線逾時'); }, 3000);
    this.send({ t: 'hello', proto: PROTOCOL, ...hello });
  }

  _lost(reason = '連線中斷') {
    if (!this.conn) return;
    clearInterval(this.hb);
    const c = this.conn;
    this.conn = null;
    try { c.close(); } catch {}
    this.emit('lost', reason);
  }

  get hostId() { return PREFIX + this.code; }
  send(m) { if (this.conn && this.conn.open) this.conn.send(m); }
  call(stream) { return this.peer.call(this.hostId, stream, { metadata: { kind: 'voice' } }); }

  close() {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.hb);
    try { this.send({ t: 'bye' }); } catch {}
    setTimeout(() => { try { this.conn && this.conn.close(); } catch {} try { this.peer && this.peer.destroy(); } catch {} }, 200);
  }
}
