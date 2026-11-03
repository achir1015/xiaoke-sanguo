// 檢查教學課程資料：每課要有標題與至少 2 步，每步要有旁白（say）；練習題的答案要合法。
// 用法：node tests/check_guide.mjs
import { mkdtempSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'web', 'js');
// web/js 沒有 package.json，先複製到暫存資料夾並標成 ES 模組再載入
const tmp = mkdtempSync(join(tmpdir(), 'xk-guide-'));
for (const f of ['guide.js', 'tts.js', 'util.js']) copyFileSync(join(root, f), join(tmp, f));
writeFileSync(join(tmp, 'package.json'), '{"type":"module"}');
globalThis.window = globalThis.window || {};

let failed = 0;
const fail = (m) => { failed++; console.error('✘ ' + m); };
try {
  const mod = await import(pathToFileURL(join(tmp, 'guide.js')).href);
  if (typeof mod.openGuide !== 'function') fail('openGuide 沒有匯出');
  for (const [name, lessons, min] of [['GAME_LESSONS', mod.GAME_LESSONS, 8], ['SYSTEM_LESSONS', mod.SYSTEM_LESSONS, 5]]) {
    if (!Array.isArray(lessons)) { fail(`${name} 不是陣列`); continue; }
    if (lessons.length < min) fail(`${name} 只有 ${lessons.length} 課（至少 ${min} 課）`);
    let steps = 0, quizzes = 0;
    lessons.forEach((l, i) => {
      const where = `${name}[${i}]`;
      if (!l || typeof l.title !== 'string' || !l.title.trim()) fail(`${where} 沒有標題`);
      if (!Array.isArray(l.steps) || l.steps.length < 2) { fail(`${where}「${l && l.title}」少於 2 步`); return; }
      l.steps.forEach((st, j) => {
        steps++;
        const w = `${where}.steps[${j}]`;
        if (typeof st.say !== 'string' || !st.say.trim()) fail(`${w} 沒有旁白 say`);
        else if (st.say.length > 140) fail(`${w} 旁白太長（${st.say.length} 字）`);
        if (st.scene != null && typeof st.scene !== 'function') fail(`${w} scene 不是函式`);
        if (st.quiz) {
          quizzes++;
          const q = st.quiz, ans = [].concat(q.answer);
          if (!Array.isArray(q.options) || q.options.length < 2) fail(`${w} 練習題選項不足`);
          else if (!ans.length || ans.some((a) => !Number.isInteger(a) || a < 0 || a >= q.options.length)) fail(`${w} 練習題答案不合法`);
          if (q.why && q.why.length !== q.options.length) fail(`${w} why 的數量和選項不一致`);
        }
      });
    });
    console.log(`${name}: ${lessons.length} 課、${steps} 步、${quizzes} 題練習`);
  }
} catch (e) {
  fail('載入 guide.js 失敗：' + (e && e.stack || e));
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
if (failed) { console.error(`共 ${failed} 個問題`); process.exit(1); }
console.log('✔ 教學資料檢查通過');
