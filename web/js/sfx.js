// 音效（WebAudio 即時合成）：戰鼓、刀劍、放箭、火計、銅鑼、錢幣、凱旋
let ctx = null;
let master = null;
let volume = 0.7;
const ac = () => (ctx ||= new (window.AudioContext || window.webkitAudioContext)());
const out = () => {
  const c = ac();
  if (!master) { master = c.createGain(); master.gain.value = volume; master.connect(c.destination); }
  return master;
};

export function setSfxVolume(v) {
  volume = Math.max(0, Math.min(1, Number(v) || 0));
  if (master) master.gain.value = volume;
}
export const sfxVolume = () => volume;

function tone(freq, dur, { type = 'sine', gain = 0.3, attack = 0.002, when = 0, slide = 0 } = {}) {
  const c = ac();
  const t = c.currentTime + when;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out());
  o.start(t); o.stop(t + dur + 0.05);
}

function noise(dur, { gain = 0.3, freq = 2000, q = 1, when = 0, type = 'bandpass', slideTo = 0 } = {}) {
  const c = ac();
  const t = c.currentTime + when;
  const n = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, n, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (slideTo) f.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(out());
  src.start(t);
}

const SOUNDS = {
  click: () => tone(880, 0.06, { type: 'triangle', gain: 0.12 }),
  drum: () => { for (let i = 0; i < 3; i++) { tone(70, 0.45, { gain: 0.55, when: i * 0.32, slide: 0.6 }); noise(0.12, { gain: 0.15, freq: 300, when: i * 0.32 }); } },
  gong: () => { tone(196, 2.2, { type: 'sine', gain: 0.25 }); tone(293, 1.8, { type: 'sine', gain: 0.12 }); tone(415, 1.4, { type: 'triangle', gain: 0.06 }); noise(0.4, { gain: 0.08, freq: 900 }); },
  clash: () => { noise(0.18, { gain: 0.35, freq: 3500, q: 3 }); tone(1800, 0.25, { type: 'square', gain: 0.05, slide: 0.7 }); tone(2600, 0.2, { type: 'triangle', gain: 0.06 }); },
  charge: () => { for (let i = 0; i < 8; i++) tone(90 + Math.random() * 30, 0.2, { gain: 0.3, when: i * 0.13, slide: 0.7 }); noise(1.2, { gain: 0.12, freq: 500, slideTo: 200 }); },
  arrows: () => { for (let i = 0; i < 6; i++) noise(0.35, { gain: 0.14, freq: 4000, q: 2, when: i * 0.07, slideTo: 1200 }); },
  shield: () => { for (let i = 0; i < 3; i++) { tone(160, 0.2, { type: 'square', gain: 0.06, when: i * 0.12 }); noise(0.1, { gain: 0.2, freq: 700, when: i * 0.12 }); } },
  fire: () => { noise(1.4, { gain: 0.22, freq: 600, q: 0.5, slideTo: 2000 }); noise(1.0, { gain: 0.1, freq: 150, type: 'lowpass', when: 0.2 }); },
  coin: () => { tone(1320, 0.12, { type: 'triangle', gain: 0.12 }); tone(1760, 0.18, { type: 'triangle', gain: 0.1, when: 0.07 }); },
  build: () => { for (let i = 0; i < 3; i++) tone(320 - i * 40, 0.08, { type: 'square', gain: 0.07, when: i * 0.11 }); },
  march: () => { for (let i = 0; i < 6; i++) tone(110, 0.12, { gain: 0.18, when: i * 0.2 }); },
  capture: () => { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.35, { type: 'triangle', gain: 0.14, when: i * 0.12 })); },
  defeat: () => { [392, 330, 262].forEach((f, i) => tone(f, 0.5, { type: 'sine', gain: 0.14, when: i * 0.22 })); },
  victory: () => { [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => tone(f, 0.45, { type: 'triangle', gain: 0.13, when: i * 0.16 })); SOUNDS.drum(); },
  turn: () => { tone(660, 0.18, { type: 'triangle', gain: 0.1 }); tone(990, 0.3, { type: 'triangle', gain: 0.08, when: 0.12 }); },
  error: () => tone(180, 0.2, { type: 'square', gain: 0.07 }),
};

export function sfx(name) {
  try {
    if (volume <= 0.001 || !SOUNDS[name]) return;
    if (ac().state === 'suspended') ac().resume();
    SOUNDS[name]();
  } catch {}
}
