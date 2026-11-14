// Скриншоты для README: docs/img/*.jpg (нужен Pillow). Нужен dev-сервер (npm run dev) — сцены выставляются через состояние S.
//   node tools/check/readme-shots.cjs
const path = require('path');
const fs = require('fs');
const { launch, ROOT } = require('./_env.cjs');
const URL = process.env.DEV_URL || 'http://localhost:8000/';
const IMG = path.join(ROOT, 'docs/img');
fs.mkdirSync(IMG, { recursive: true });
(async () => {
  const b = await launch();
  const p = await b.newPage({ viewport: { width: 412, height: 860 }, deviceScaleFactor: 2 });
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  await p.addInitScript(() => {
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = cb => raf(t => cb(window.__freeze ?? (t + (window.__tOff || 0))));
  });
  await p.goto(URL); await p.waitForTimeout(1500);
  const S = (code) => p.evaluate(async (code) => { const m = await import('/state.js'); const ts = await import('/ui/timeControls.js'); return new Function('S', 'selectStarById', code)(m.S, ts.selectStarById); }, code);
  const view = (v) => p.click(`#viewModeGroup [data-view="${v}"]`);
  const planet = (pl) => p.evaluate((pl) => document.querySelector(`[data-planet="${pl}"]`).click(), pl);
  const tod = (v) => p.evaluate((v) => { const d = document.getElementById('timeOfDaySlider'); d.value = v; d.dispatchEvent(new Event('input', { bubbles: true })); }, v);
  const at = async (now, name) => {
    await p.evaluate((n) => { window.__freeze = undefined; window.__tOff = n - 1600 - performance.now(); }, now);
    await p.waitForTimeout(1600);
    await p.evaluate((n) => { window.__freeze = n; }, now);
    await p.waitForTimeout(400);
    await p.locator('#mainCanvas').screenshot({ path: path.join(IMG, `${name}.png`) });
  };
  await S('S.isPlaying = false;');
  // 1. Чёрная дыра
  await view('space');
  await S('selectStarById("rigel"); S.isPlaying = false; S.currentAge = 0.02; S.camZoom = 2.5; S.camPitchDeg = 78;');
  await at(20000, 'black_hole');
  // 2. Солнце-гигант в «Космосе»
  await S('selectStarById("sun"); S.isPlaying = false; S.currentAge = 12.1; S.camZoom = 1; S.camPitchDeg = 50;');
  await at(20000, 'red_giant');
  // 3. Земля-шар
  await view('orbit'); await planet('earth');
  await S('S.currentAge = 4.6;');
  await at(20000, 'earth');
  // 4. Галактика
  await view('galaxy');
  await at(20000, 'galaxy');
  // 5. Закат
  await view('surface'); await planet('earth');
  await S('S.currentAge = 4.6; S.dayOfYear = 172;');
  await tod(20.2); await at(30000, 'sunset');
  // 6. Полярное сияние
  await S('S.dayOfYear = 300;');
  await tod(0.5); await at(41470, 'aurora');
  // 7. Красный гигант с Земли
  await S('S.currentAge = 11.9; S.dayOfYear = 172;');
  await tod(9); await at(20000, 'giant_sky');
  await b.close();
  // PNG ×2 → JPEG 400 px (лёгкие картинки для README)
  require('child_process').execFileSync('python3', ['-c', `
import glob, os
from PIL import Image
for f in glob.glob('${IMG}/*.png'):
    im = Image.open(f).convert('RGB'); w = 400
    im.resize((w, round(im.height * w / im.width)), Image.LANCZOS).save(f[:-4] + '.jpg', quality=82, optimize=True)
    os.remove(f)
`], { stdio: 'inherit' });
  console.log(errs.length ? 'errors:\n' + errs.join('\n') : 'errors: none');
})();
