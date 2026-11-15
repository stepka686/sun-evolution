// 5.4: Андромеда на ночном небе — кадры по возрастам (вид «Поверхность», взгляд на M31).
// Для каждого возраста подбирается час, когда звезда под горизонтом, а M31 выше всего.
// node tools/check/andromeda.cjs [планета] [возрасты через запятую] [день года] [сценарий]
const { launch, buildUrl, OUT } = require('./_env.cjs');
const [pl = 'mars', ages = '4.57,7.5,8.4,8.9,9.3,10.5,12.3,13', doy = '40/130/220/310', sc = ''] = process.argv.slice(2);
(async () => {
  const b = await launch();
  const p = await b.newPage({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 1 });
  await p.goto(buildUrl()); await p.waitForTimeout(900);
  await p.click('#viewModeGroup [data-view="surface"]');
  const set = (id, v) => p.evaluate(([id, v]) => { const d = document.getElementById(id); d.value = v; d.dispatchEvent(new Event('input', { bubbles: true })); }, [id, v]);
  await p.evaluate((pl) => document.querySelector(`[data-planet="${pl}"]`).click(), pl);
  if (sc) await p.evaluate((sc) => { window.__S.andromedaScenario = sc; }, sc);
  if (process.env.CAMERA) await p.click('#perceptionBtn');
  await p.click('#lookAndromedaBtn');
  await p.evaluate(() => document.getElementById('constellationsBtn')?.click());
  for (const t of ages.split(',')) {
    await set('timeSlider', t);
    let best = null;
    for (const day of doy.split('/')) for (let tod = 0; tod < 24; tod += 1.5) {
      await set('dayOfYearSlider', day); await set('timeOfDaySlider', tod); await p.waitForTimeout(100);
      const a = await p.evaluate(() => { const r = window.__S.andromedaSky; window.__S.andromedaSky = null; return r; });
      if (a && a.sunAlt < -0.3 && a.alt < 1.2 && (!best || a.alt > best.alt)) best = { ...a, tod, day };
    }
    if (best) { await set('dayOfYearSlider', best.day); await set('timeOfDaySlider', best.tod); }
    await p.waitForTimeout(1800);
    const f = OUT + `/andromeda_${pl}_${sc || 'def'}_${t}.png`;
    await p.locator('#mainCanvas').screenshot({ path: f });
    console.log(t, best ? `день ${best.day}, час ${best.tod}, высота M31 ${(best.alt * 57.3).toFixed(0)}°, ${best.d.toFixed(0)} кпк, ${(2 * best.angR * 57.3).toFixed(1)}°` : 'не видно ночью');
  }
  await b.close();
})();
