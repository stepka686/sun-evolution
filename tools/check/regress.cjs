const { launch, buildUrl, OUT } = require('./_env.cjs');
(async () => {
  const b = await launch();
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !m.text().includes('stall')) errs.push(m.text()); });
  await p.goto(buildUrl()); await p.waitForTimeout(1000);
  const stars = ['Солнце', 'Проксима', 'Сириус A', 'Бетельгейзе', 'Арктур', 'Эта Киля', 'R136a1', 'Сириус B', 'TRAPPIST-1', 'Магнетар'];
  const planets = ['Меркурий', 'Венера', 'Земля', 'Марс', 'Европа', 'Титан', 'Плутон'];
  for (const st of stars) {
    await p.evaluate((st) => { document.getElementById('starCatalogBtn').click(); const c = [...document.querySelectorAll('#starCatalogGrid > div')].find(d => d.innerText.includes(st)); if (c) c.click(); else document.getElementById('closeCatalogModalBtn')?.click(); }, st);
    await p.waitForTimeout(150);
    for (const age of [0.1, 0.5, 0.9]) {
      await p.evaluate((f) => { const s = document.getElementById('timeSlider'); s.value = +s.min + (s.max - s.min) * f; s.dispatchEvent(new Event('input', { bubbles: true })); }, age);
      for (const v of ['space', 'orbit', 'surface', 'moon', 'galaxy']) {
        await p.click(`#viewModeGroup [data-view="${v}"]`);
        for (const pl of (v === 'space' || v === 'galaxy' || v === 'moon' ? ['Земля'] : planets)) {
          await p.evaluate((pl) => { [...document.querySelectorAll('#planetGroup .pill-item')].find(b => b.innerText.trim() === pl)?.click(); }, pl);
          await p.waitForTimeout(40);
        }
      }
    }
  }
  // двойная система и глубокое время
  await p.click('#binarySysBtn'); await p.click('#viewModeGroup [data-view="surface"]'); await p.waitForTimeout(500);
  await p.click('#deepTimeBtn'); await p.waitForTimeout(300);
  for (const v of ['space', 'orbit', 'surface', 'moon', 'galaxy', 'interstellar']) { await p.click(`#viewModeGroup [data-view="${v}"]`); await p.waitForTimeout(150); }
  console.log('errors:', errs.length ? [...new Set(errs)].slice(0, 8) : 'none');
  await b.close();
})();
