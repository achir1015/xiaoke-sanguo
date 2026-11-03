// 語音旁白：用系統內建的中文語音（Windows：Yating／Hanhan／Zhiwei；Mac：Mei-Jia）
// 手機版會由原生程式提供 window.xk.tts（之後的版本）
import { sleep } from './util.js';

class Narrator {
  constructor() {
    this.on = true;       // 語音開關（設定）
    this.rate = 1;
    this.voice = null;
    this.voiceURI = '';   // 使用者指定的語音
    this.listeners = [];
    this.pick();
    if ('speechSynthesis' in window) {
      speechSynthesis.addEventListener('voiceschanged', () => { this.pick(); this.listeners.forEach((f) => f()); });
      let n = 0;
      const poll = () => { if (this.voice || ++n > 30) { this.listeners.forEach((f) => f()); return; } this.pick(); setTimeout(poll, 200); };
      poll();
    }
  }
  onReady(f) { this.listeners.push(f); }
  voices() {
    if (!('speechSynthesis' in window)) return [];
    return speechSynthesis.getVoices().filter((v) => /^zh/i.test(v.lang));
  }
  pick() {
    if (!('speechSynthesis' in window)) return;
    const vs = speechSynthesis.getVoices();
    if (this.voiceURI) {
      const v = vs.find((x) => x.voiceURI === this.voiceURI);
      if (v) { this.voice = v; return; }
    }
    const pref = [/Yating/i, /Hanhan/i, /Mei-?Jia/i, /Zhiwei/i];
    this.voice = pref.map((re) => vs.find((v) => re.test(v.name))).find(Boolean)
      || vs.find((v) => /zh[-_]TW/i.test(v.lang)) || vs.find((v) => /zh[-_]HK/i.test(v.lang)) || vs.find((v) => /^zh/i.test(v.lang)) || null;
  }
  setVoice(uri) { this.voiceURI = uri || ''; this.pick(); }
  get native() { return window.xk && window.xk.tts && window.xk.tts.available() ? window.xk.tts : null; }
  get available() { if (this.native) return true; if (!this.voice) this.pick(); return 'speechSynthesis' in window && !!this.voice; }
  get voiceName() { return this.native ? this.native.voiceName() : this.voice ? this.voice.name : ''; }
  stop() {
    this.token = (this.token || 0) + 1;
    if (this.native) this.native.stop(); else if ('speechSynthesis' in window) speechSynthesis.cancel();
  }
  // 說完才 resolve；沒有語音或關閉語音時依字數等待（force：教學一定要等）
  speak(text, { force = false, rate } = {}) {
    const plain = String(text).replace(/[「」（）()《》]/g, ' ');
    const r = rate || this.rate;
    if (!this.on || !this.available) return force ? sleep(Math.min(9000, 900 + plain.length * 95)) : Promise.resolve();
    if (this.native) { this.native.stop(); return this.native.speak(plain, r); }
    const est = 700 + plain.length * 210 / r;
    const my = (this.token = (this.token || 0) + 1);
    return new Promise((resolve) => {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(plain);
      u.voice = this.voice; u.lang = this.voice.lang; u.rate = r; u.pitch = 1;
      let done = false;
      const fin = () => { if (!done) { done = true; clearTimeout(t); resolve(my === this.token); } };
      const t = setTimeout(fin, est * 2 + 4000);
      u.onend = fin; u.onerror = fin;
      speechSynthesis.speak(u);
    });
  }
  // 不等待、不打斷正在說的重要內容（遊戲事件旁白用）
  say(text) { if (this.on) this.speak(text); }
}

export const narrator = new Narrator();
