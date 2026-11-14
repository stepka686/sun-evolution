const { launch, buildUrl, OUT } = require('./_env.cjs');
(async () => {
  const b = await launch();
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
  const cdp = await p.context().newCDPSession(p);
  await p.goto(buildUrl()); await p.waitForTimeout(1000);
  await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
  for (const v of (process.argv[2] || 'space,orbit,surface').split(',')) {
    await p.click(`#viewModeGroup [data-view="${v}"]`); await p.waitForTimeout(800);
    await cdp.send('Profiler.start');
    const fps = await p.evaluate(() => new Promise(res => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else res(n / 3); }; requestAnimationFrame(f); }));
    const { profile } = await cdp.send('Profiler.stop');
    const self = new Map(); const byId = new Map(profile.nodes.map(n => [n.id, n]));
    const dt = profile.timeDeltas; const counts = new Map();
    profile.samples.forEach((id, i) => counts.set(id, (counts.get(id) || 0) + (dt[i] || 0)));
    for (const [id, t] of counts) { const n = byId.get(id); const k = `${n.callFrame.functionName || '(anon)'}:${n.callFrame.lineNumber}`; self.set(k, (self.get(k) || 0) + t); }
    const total = [...self.values()].reduce((a, b) => a + b, 0);
    const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, t]) => `${k} ${(t / total * 100).toFixed(1)}%`);
    console.log(v, 'fps', fps.toFixed(1), '\n  ' + top.join('\n  '));
  }
  await b.close();
})();
