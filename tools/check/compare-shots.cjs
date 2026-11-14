const { launch, buildUrl, OUT } = require('./_env.cjs');
(async () => {
  const b = await launch();
  // node tools/check/compare-shots.cjs 5.2.1,5.2.2 — снимки поверхности, орбиты, Галактики и космоса для сравнения версий
  const { version } = require('./_env.cjs');
  for (const v of (process.argv[2] || version).split(',')) {
    const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    await p.addInitScript(() => { const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = cb => raf(t => cb(t + (window.__tOff || 0))); });
    await p.goto(buildUrl(v)); await p.waitForTimeout(900);
    await p.click('#viewModeGroup [data-view="surface"]');
    await p.evaluate(() => { window.__tOff = 6770 - performance.now(); const d = document.getElementById('timeOfDaySlider'); d.value = 15; d.dispatchEvent(new Event('input', { bubbles: true })); });
    await p.waitForTimeout(1500);
    await p.screenshot({ path: OUT + `/v_${v}_surf.png` });
    for (const vw of ['orbit', 'galaxy', 'space']) { await p.click(`#viewModeGroup [data-view="${vw}"]`); await p.waitForTimeout(1500); await p.screenshot({ path: OUT + `/v_${v}_${vw}.png` }); }
    await p.close();
  }
  await b.close();
})();
