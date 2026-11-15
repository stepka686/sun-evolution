// 5.4: Андромеда — орбита M31, сверка с литературой
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { andromedaOrbit, nfw, M31_POS0, ANDROMEDA_SCENARIOS } from '../src/physics/andromeda.js';

describe('5.4: орбита Андромеды', () => {
  test('Сегодня: 780 кпк, сближение со скоростью 109 км/с', () => {
    const o = andromedaOrbit('hst2012');
    const s = o.at(0);
    assert.ok(Math.abs(s.d - Math.hypot(...M31_POS0)) < 0.5 && Math.abs(s.d - 774) < 10, `d = ${s.d}`);
    // скорость сближения: производная расстояния
    const vr = (o.at(0.01).d - o.at(-0.01).d) / 0.02 / 1.0227;
    assert.ok(Math.abs(vr + 109.3) < 3, `vr = ${vr}`);
  });
  test('HST 2012 повторяет van der Marel et al. 2012 в пределах их 1σ', () => {
    const o = andromedaOrbit('hst2012');
    assert.ok(o.tPeri > 3.55 && o.tPeri < 4.29, `перицентр через ${o.tPeri}`);
    assert.ok(o.rPeri > 11 && o.rPeri < 69, `перицентр ${o.rPeri} кпк`);
    assert.ok(o.tMerge > 5.14 && o.tMerge < 7.47, `слияние через ${o.tMerge}`);
    // после первого пролёта расходятся на сотню-другую кпк (у них 172 кпк через 4.79 млрд лет)
    assert.ok(o.rApo > 80 && o.rApo < 250 && o.tApo > 4.3 && o.tApo < 5.3, `апоцентр ${o.rApo} через ${o.tApo}`);
    // скорость в перицентре — сотни км/с (у них 586)
    assert.ok(Math.abs(o.at(o.tPeri).vrel) > 400 && Math.abs(o.at(o.tPeri).vrel) < 700);
  });
  test('Gaia 2026 (v⊥ = 47 км/с): слияние в пределах 1σ Wu et al. 2026 (6.5 +1.3 −1.5 млрд лет)', () => {
    const o = andromedaOrbit('gaia2026');
    assert.ok(o.tMerge > 5.0 && o.tMerge < 7.8, `слияние через ${o.tMerge}`);
  });
  test('Gaia 2025 (v⊥ = 76 км/с): за 10 млрд лет слияния нет, первый пролёт далеко (Sawala et al. 2025)', () => {
    const o = andromedaOrbit('gaia2025');
    assert.ok(o.tMerge > 10, `слияние через ${o.tMerge}`);
    assert.ok(o.rPeri > 100, `перицентр ${o.rPeri} кпк`);
  });
  test('Чем больше поперечная скорость, тем дальше пролёт и позже слияние', () => {
    const [a, b, c] = ['hst2012', 'gaia2026', 'gaia2025'].map(k => andromedaOrbit(k));
    assert.ok(a.rPeri < b.rPeri && b.rPeri < c.rPeri);
    assert.ok(a.tMerge < b.tMerge && b.tMerge < c.tMerge);
  });
  test('Без трения орбиты не затухают — сливаются только благодаря трению', () => {
    const o = andromedaOrbit('hst2012', 0);
    assert.equal(o.tMerge, Infinity);
    // после пролёта уходит обратно на сотни кпк (энергия сохраняется)
    const far = Math.max(...[10, 12, 14, 16].map(t => o.at(t).d));
    assert.ok(far > 500, `без трения через 10–16 млрд лет: ${far} кпк`);
  });
  test('NFW: M(<r₂₀₀) = M₂₀₀, r₂₀₀ Галактики ≈ 206 кпк', () => {
    const h = nfw(1e12, 10);
    assert.ok(Math.abs(h.mass(h.r200) / 1e12 - 1) < 1e-9);
    assert.ok(Math.abs(h.r200 - 206) < 3, `r200 = ${h.r200}`);
  });
  test('Прошлое: при рождении Солнца Андромеда была дальше, чем сейчас', () => {
    for (const k of Object.keys(ANDROMEDA_SCENARIOS)) {
      const d = andromedaOrbit(k).at(-4.57).d;
      assert.ok(d > 1000 && d < 1500, `${k}: ${d}`);
    }
  });
});

import { andromedaView, sunPosition, m31Particles } from '../src/physics/andromeda.js';
describe('5.4: Андромеда на небе', () => {
  const sun = sunPosition(Math.PI, 0.02);
  test('Сегодня: l = 121.2°, b = −21.6°, наклон диска 77°, D₂₅ ≈ 3.2°', () => {
    const v = andromedaView(0, 'gaia2026', sun);
    const deg = (x) => x * 180 / Math.PI;
    assert.ok(Math.abs(deg(v.l) - 121.17) < 0.3, `l = ${deg(v.l)}`);
    assert.ok(Math.abs(deg(v.b) + 21.57) < 0.3, `b = ${deg(v.b)}`);
    assert.ok(Math.abs(deg(v.inclination) - 77) < 1.5, `i = ${deg(v.inclination)}`);
    assert.ok(Math.abs(2 * deg(v.angR) - 3.17) < 0.1, `D25 = ${2 * deg(v.angR)}°`);
    assert.equal(v.tidal, 0); assert.equal(v.merge, 0); assert.equal(v.mw, 0);
  });
  test('На подлёте Андромеда растёт как 1/d; после слияния растворяется', () => {
    const o = andromedaView(0, 'hst2012', sun).orbit;
    const near = andromedaView(o.tPeri - 0.3, 'hst2012', sun);
    assert.ok(near.angR > 8 * Math.PI / 180, `за 0.3 млрд лет до пролёта — ${near.angR * 180 / Math.PI}°`);
    const after = andromedaView(o.tMerge + 1, 'hst2012', sun);
    assert.equal(after.merge, 1); assert.equal(after.mw, 1);
    assert.ok(andromedaView(o.tPeri + 0.4, 'hst2012', sun).tidal > 0.5);
  });
  test('Модель M31: балдж ярче диска, кольцо на 10 кпк ярче соседних радиусов', () => {
    const P = m31Particles();
    const avg = (f) => { const a = P.filter(f); return a.reduce((s, p) => s + p.mu, 0) / a.length; };
    assert.ok(avg(p => p.kind === 'bulge') < 20 && avg(p => p.kind !== 'bulge') > 21);
    const r = (p) => Math.hypot(p.x, p.y);
    const ringMu = (R) => avg(p => p.kind !== 'bulge' && Math.abs(r(p) - R) < 1);
    assert.ok(ringMu(10) < ringMu(8) && ringMu(10) < ringMu(12), 'кольцо — местный максимум яркости');
    assert.ok(P.length > 150 && P.length < 400, `пятен: ${P.length}`);
  });
});
