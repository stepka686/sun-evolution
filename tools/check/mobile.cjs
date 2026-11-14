const { launch, buildUrl, OUT } = require('./_env.cjs');
(async () => {
  const b = await launch();
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(buildUrl()); await p.waitForTimeout(900);
  await p.evaluate(() => document.querySelector('#viewModeGroup [data-view="surface"]').click());
  await p.evaluate(() => { const d = document.getElementById('dayOfYearSlider'); d.value = 15; d.dispatchEvent(new Event('input', { bubbles: true })); const t = document.getElementById('timeOfDaySlider'); t.value = 13; t.dispatchEvent(new Event('input', { bubbles: true })); });
  await p.waitForTimeout(600);
  await p.screenshot({ path: OUT + '/mob_surface.png', clip: { x: 0, y: 280, width: 390, height: 560 } });
  await p.evaluate(() => document.querySelector('#viewModeGroup [data-view="orbit"]').click());
  await p.waitForTimeout(1200);
  await p.screenshot({ path: OUT + '/mob_orbit.png', clip: { x: 0, y: 280, width: 390, height: 560 } });
  console.log('errors:', errs.length ? errs : 'none');
  await b.close();
})();
