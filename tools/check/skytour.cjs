const { launch, buildUrl, OUT } = require('./_env.cjs');
(async () => {
  const b = await launch();
  const p = await b.newPage({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 1.5 });
  await p.addInitScript(() => { const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = cb => raf(t => cb(t + (window.__tOff || 0))); });
  await p.goto(buildUrl()); await p.waitForTimeout(900);
  await p.click('#viewModeGroup [data-view="surface"]');
  await p.evaluate(() => { window.__tOff = 18000 - performance.now(); });
  const set = (id, v) => p.evaluate(([id, v]) => { const d = document.getElementById(id); d.value = v; d.dispatchEvent(new Event('input', { bubbles: true })); }, [id, v]);
  const shots = [['earth', 12, 0], ['earth', 16, 0], ['earth', 18.6, 0], ['earth', 18.95, 0], ['earth', 19.1, 1], ['earth', 19.6, 0], ['earth', 20.3, 0], ['earth', 23.5, 0], ['mars', 12, 0], ['mars', 18.9, 0], ['titan', 12, 0], ['venus', 12, 0]];
  let i = 0;
  for (const [pl, tod, away] of shots) {
    await p.evaluate((pl) => document.querySelector(`[data-planet="${pl}"]`).click(), pl);
    await set('timeOfDaySlider', tod);
    const cur = await p.evaluate(() => document.getElementById('lookAwayBtn').classList.contains('active'));
    if (cur !== !!away) await p.click('#lookAwayBtn');
    await p.waitForTimeout(500);
    await p.locator('#mainCanvas').screenshot({ path: OUT + `/tour_${String(i++).padStart(2, '0')}.png` });
  }
  await b.close();
})();
