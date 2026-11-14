const { launch, buildUrl, OUT } = require('./_env.cjs');
(async () => {
  const b = await launch();
  for (const [name, vp] of [['m360', { width: 360, height: 780 }], ['m412', { width: 412, height: 915 }], ['desk', { width: 1400, height: 900 }]]) {
    const p = await b.newPage({ viewport: vp, deviceScaleFactor: name === 'desk' ? 1 : 3 });
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(buildUrl()); await p.waitForTimeout(900);
    // все кнопки шапки в пределах экрана?
    const off = await p.evaluate(() => [...document.querySelectorAll('.header-actions .action-btn')].filter(b => getComputedStyle(b).display !== 'none').map(b => [b.innerText, Math.round(b.getBoundingClientRect().right)]).filter(([, r]) => r > window.innerWidth));
    await p.click('#viewModeGroup [data-view="surface"]'); await p.waitForTimeout(700);
    const ov = await p.evaluate(() => { const a = document.getElementById('surfaceTimeToolbar').getBoundingClientRect(), h = document.getElementById('hudStack').getBoundingClientRect(); return { overlap: !(a.bottom <= h.top || h.bottom <= a.top || a.right <= h.left || h.right <= a.left), tbLeft: Math.round(a.left) }; });
    await p.screenshot({ path: OUT + `/ui_${name}.png` });
    console.log(name, 'off-screen buttons:', JSON.stringify(off), 'toolbar/hud overlap:', JSON.stringify(ov), 'errors:', errs.length ? errs : 'none');
    await p.close();
  }
  await b.close();
})();
