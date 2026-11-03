// 頭像與軍師選擇器、武將選擇、數量選擇等對話框
import { h, modal } from './util.js';

export const portraitUrl = (id) => `assets/portraits/${id}.svg`;
export const officerUrl = (id) => `assets/officers/${id}.svg`;

// 選玩家半身照（20 男、20 女）
export function pickPortrait(stat, current) {
  return new Promise((resolve) => {
    let sel = current;
    let tab = current && current.startsWith('f') ? '女' : '男';
    const grid = h('div', { class: 'pick-grid' });
    const tabs = h('div', { class: 'tabs' });
    const draw = () => {
      tabs.replaceChildren(...['男', '女'].map((g) => h('button', { class: tab === g ? 'on' : '', onclick: () => { tab = g; draw(); } }, g === '男' ? '男性 20 位' : '女性 20 位')));
      grid.replaceChildren(...stat.players.filter((p) => p.gender === tab).map((p) => h('button', {
        class: 'pick-item' + (p.id === sel ? ' on' : ''), onclick: () => { sel = p.id; draw(); }, ondblclick: () => done(p.id),
      }, h('img', { src: portraitUrl(p.id), alt: '' }), p.title)));
    };
    const back = h('div', { class: 'modal-back' });
    const done = (v) => { back.remove(); resolve(v); };
    draw();
    back.append(h('div', { class: 'modal wide' }, h('h3', {}, '選擇您的半身照'), tabs, grid,
      h('div', { class: 'modal-btns' }, h('button', { onclick: () => done(null) }, '取消'), h('button', { class: 'primary', onclick: () => done(sel) }, '確定'))));
    document.body.append(back);
  });
}

// 選 AI 軍師（30 位）
export function pickAdvisor(stat, current, title = '選擇陪同的 AI 軍師') {
  return new Promise((resolve) => {
    let sel = current;
    let tab = '全部';
    const grid = h('div', { class: 'pick-grid' });
    const tabs = h('div', { class: 'tabs' });
    const STY = ['全部', '進攻', '守成', '內政', '謀略', '均衡'];
    const draw = () => {
      tabs.replaceChildren(...STY.map((g) => h('button', { class: tab === g ? 'on' : '', onclick: () => { tab = g; draw(); } }, g)));
      grid.replaceChildren(...stat.advisors.filter((a) => tab === '全部' || a.style_name === tab).map((a) => h('button', {
        class: 'pick-item' + (a.id === sel ? ' on' : ''), onclick: () => { sel = a.id; draw(); }, ondblclick: () => done(a.id),
      }, h('img', { src: portraitUrl(a.id), alt: '' }), a.name, h('span', { class: 'st' }, `${a.epithet}・${a.style_name}`))));
    };
    const back = h('div', { class: 'modal-back' });
    const done = (v) => { back.remove(); resolve(v); };
    draw();
    back.append(h('div', { class: 'modal wide' }, h('h3', {}, title),
      h('p', { class: 'small' }, '軍師的風格會影響建議與代打方式：進攻愛出兵、守成重防守、內政重發展、謀略重人才與奇襲、均衡則面面俱到。'),
      tabs, grid,
      h('div', { class: 'modal-btns' }, h('button', { onclick: () => done(null) }, '取消'), h('button', { class: 'primary', onclick: () => done(sel) }, '確定'))));
    document.body.append(back);
  });
}

const STAT_NAMES = { lead: '統', war: '武', int: '智', pol: '政', cha: '魅' };
export const statLine = (o) => `統${o.lead} 武${o.war} 智${o.int} 政${o.pol} 魅${o.cha}`;

// 選武將：multi=最多幾位；key=這個指令看哪項能力
export function pickOfficers(list, { title, key, multi = 1, note = '', extra = null }) {
  return new Promise((resolve) => {
    const sorted = [...list].sort((a, b) => (b[key] || 0) - (a[key] || 0));
    let sel = sorted.slice(0, multi === 1 ? 1 : Math.min(multi, sorted.length)).map((o) => o.id);
    const box = h('div', { class: 'choose-list' });
    const draw = () => {
      box.replaceChildren(...sorted.map((o) => h('button', {
        class: 'choose' + (sel.includes(o.id) ? ' on' : ''),
        onclick: () => {
          if (multi === 1) sel = [o.id];
          else if (sel.includes(o.id)) sel = sel.filter((x) => x !== o.id);
          else if (sel.length < multi) sel = [...sel, o.id];
          draw();
          if (extra && extra.update) extra.update(sel);
        },
        ondblclick: () => { if (multi === 1) done([o.id]); },
      }, h('img', { src: officerUrl(o.id), alt: '' }),
      h('div', {}, h('div', {}, o.name, key ? h('span', { class: 'key' }, `　${STAT_NAMES[key]} ${o[key]}`) : ''), h('div', { class: 'small' }, statLine(o))),
      h('span', { class: 'small' }, sel.includes(o.id) ? '✔' : ''))));
    };
    const back = h('div', { class: 'modal-back' });
    const done = (v) => { back.remove(); resolve(v); };
    draw();
    back.append(h('div', { class: 'modal' }, h('h3', {}, title), note ? h('p', { class: 'small' }, note) : '', box,
      extra ? extra.el : '',
      h('div', { class: 'modal-btns' }, h('button', { onclick: () => done(null) }, '取消'),
        h('button', { class: 'primary', onclick: () => done(sel.length ? sel : null) }, '執行'))));
    document.body.append(back);
    if (extra && extra.update) extra.update(sel);
    back.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(sel.length ? sel : null); if (e.key === 'Escape') done(null); });
  });
}

// 數量滑桿
export function amountRow(label, max, step, value, fmt = (v) => v.toLocaleString()) {
  const b = h('b', {}, fmt(value));
  const r = h('input', { type: 'range', min: 0, max: Math.max(0, max), step, value: Math.min(value, max) });
  r.addEventListener('input', () => { b.textContent = fmt(Number(r.value)); });
  b.textContent = fmt(Number(r.value));
  return { el: h('div', { class: 'amount' }, h('span', {}, label), r, b), get value() { return Number(r.value); }, input: r };
}

export { modal };
