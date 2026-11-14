const { launch, buildUrl, OUT } = require('./_env.cjs');
// node tools/check/fps.cjs [виды через запятую] [версии через запятую]; по умолчанию 4.3.0 против текущей
const { version } = require('./_env.cjs');
const builds = (process.argv[3] || '4.3.0,' + version).split(',').map(v => [v, buildUrl(v)]);
const views = process.argv[2] && process.argv[2] !== 'all' ? process.argv[2].split(',') : ['space', 'orbit', 'surface', 'galaxy', 'moon'];
(async () => {
  const b = await launch();
  const out = {};
  for (const [name, url] of builds) {
    out[name] = {};
    for (const v of views) {
      const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
      await p.goto(url); await p.waitForTimeout(900);
      const ok = await p.evaluate(v => { const e = document.querySelector(`#viewModeGroup [data-view="${v}"]`); if (!e) return false; e.click(); return true; }, v);
      if (!ok) { out[name][v] = '-'; await p.close(); continue; }
      await p.waitForTimeout(5000);   // дать адаптивному DPR осесть
      const n = await p.evaluate(() => new Promise(res => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 4000) requestAnimationFrame(f); else res(n / 4); }; requestAnimationFrame(f); }));
      out[name][v] = n.toFixed(1);
      await p.close();
    }
  }
  console.table(out);
  await b.close();
})();
