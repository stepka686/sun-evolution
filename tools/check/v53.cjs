// Снимки новых сцен 5.3: сумеречные лучи, серебристые облака, сияние, корона, чёрная дыра, раскалённая планета.
// Работает через dev-сервер (модули грузятся напрямую, состояние S доступно из страницы): npm run dev в соседнем окне.
const { launch, OUT } = require('./_env.cjs');
const URL = process.env.DEV_URL || 'http://localhost:8000/';
(async () => {
  const b = await launch();
  const p = await b.newPage({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 1 });
  const errs = [];
  p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
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
  // часы: сначала идут около нужного момента (глаз адаптируется), затем замирают
  const at = async (now, name) => {
    await p.evaluate((n) => { window.__freeze = undefined; window.__tOff = n - 1600 - performance.now(); }, now);
    await p.waitForTimeout(1600);
    await p.evaluate((n) => { window.__freeze = n; }, now);
    await p.waitForTimeout(400);
    await p.locator('#mainCanvas').screenshot({ path: `${OUT}/v53_${name}.png` });
  };
  await S('S.isPlaying = false;');
  await view('surface'); await planet('earth');
  await S('S.currentAge = 4.6; S.dayOfYear = 172;');
  await tod(20.9); await at(30000, 'rays_sunset');
  await tod(13); await at(30000, 'rays_day');
  await tod(21.9); await at(120000, 'nlc');
  await S('S.dayOfYear = 300;');
  await tod(0.5); await at(41470, 'aurora');
  await S('S.currentAge = 3.0; S.dayOfYear = 172;');
  await tod(12); await at(559292, 'eclipse');
  await S('S.currentAge = 4.6;');
  await tod(13); await at(20000, 'glare_day');
  await view('space');
  await S('selectStarById("rigel"); S.isPlaying = false; S.currentAge = 0.02; S.camZoom = 2.5; S.camPitchDeg = 80;');
  await at(20000, 'bh_edge');
  await S('S.camPitchDeg = 20; S.camZoom = 2.5;');
  await at(20000, 'bh_face');
  await b.close();
  console.log(errs.length ? 'errors:\n' + [...new Set(errs)].join('\n') : 'errors: none');
})();
