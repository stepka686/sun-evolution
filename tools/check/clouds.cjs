// 5.5: объёмные кучевые и сумеречные лучи — кадры Земли в разное время суток при облачности хорошей погоды.
// node tools/check/clouds.cjs [часы через запятую] [версия сборки]
// Переменные: CU — облачность 0…1 (по умолчанию 0.45), NORAYS=1 — без сумеречных лучей (для сравнения), AWAY=1 — спиной к звезде
const { launch, buildUrl, OUT } = require('./_env.cjs');
const [tods = '12,17,18.7,19.0,19.3', ver] = process.argv.slice(2);
(async () => {
  const b = await launch();
  const p = await b.newPage({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 1 });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'warning' || m.type() === 'error') errs.push(m.text()); });
  // время сцены фиксировано: кучевые хорошей погоды в максимуме (sin(t·3e-5 + 2.1) = 1 при t ≈ 191.8 с)
  await p.addInitScript(() => { const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = cb => raf(t => cb(t + (window.__tOff || 0))); });
  await p.goto(buildUrl(ver)); await p.waitForTimeout(900);
  await p.evaluate(() => { window.__tOff = 191800 - performance.now(); });
  await p.click('#viewModeGroup [data-view="surface"]');
  const set = (id, v) => p.evaluate(([id, v]) => { const d = document.getElementById(id); d.value = v; d.dispatchEvent(new Event('input', { bubbles: true })); }, [id, v]);
  await set('dayOfYearSlider', 172);
  if (process.env.AWAY) await p.click('#lookAwayBtn');
  const cu = Number(process.env.CU || 0.45);
  await p.evaluate(([cu, off]) => { if (window.__S) { window.__S.cumulusOverride = cu; window.__S.raysOff = off; } }, [cu, !!process.env.NORAYS]);
  for (const t of tods.split(',')) {
    await set('timeOfDaySlider', t);
    await p.waitForTimeout(2500);
    await p.locator('#mainCanvas').screenshot({ path: OUT + `/clouds_${ver || 'cur'}${process.env.NORAYS ? '_norays' : ''}${process.env.AWAY ? '_away' : ''}_${t}.png` });
  }
  console.log(errs.length ? 'errors:\n' + [...new Set(errs)].join('\n') : 'errors: none');
  await b.close();
})();
