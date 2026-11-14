// Тесты 4.9: непрерывный состав атмосфер и список газов
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { useStar } from './helpers.js';
import { getInterpolatedState } from '../src/model/timeline.js';
import { calculatePlanetAtmosphere, getPlanetClimate } from '../src/physics/climate.js';
import { earthEpochAt } from '../src/data/earthHistory.js';
import { vaporFraction } from '../src/physics/composition.js';
import { formatFraction, gasRows } from '../src/ui/gasList.js';

const atmo = (pl, t) => calculatePlanetAtmosphere(pl, getInterpolatedState(t));

describe('Состав атмосферы меняется непрерывно', () => {
  test('Сумма долей — 100 %, список отсортирован по убыванию', () => {
    useStar(1.0);
    for (const pl of ['earth', 'venus', 'mars', 'titan', 'europa', 'pluto'])
      for (const t of [0.1, 1, 2.3, 4.57, 7, 9]) {
        const a = atmo(pl, t);
        if (!a.gases.length) continue;
        const sum = a.gases.reduce((s, g) => s + g.frac, 0);
        assert.ok(Math.abs(sum - 1) < 1e-9, `${pl} ${t}: ${sum}`);
        for (let i = 1; i < a.gases.length; i++) assert.ok(a.gases[i - 1].frac >= a.gases[i].frac);
      }
  });

  test('Земля: за 5 млн лет ни один газ не прыгает больше чем на 1.5 % (кроме убегающего парника)', () => {
    useStar(1.0);
    let prev = null;
    for (let t = 0.05; t < 5.9; t += 0.005) {
      const m = atmo('earth', t).mix;
      if (prev) for (const k of new Set([...Object.keys(m), ...Object.keys(prev)]))
        assert.ok(Math.abs((m[k] || 0) - (prev[k] || 0)) < 0.015, `t=${t.toFixed(3)} ${k}: ${prev[k]} → ${m[k]}`);
      prev = m;
    }
  });

  test('Земля сегодня: N₂ 78 %, O₂ 20.9 %, Ar 0.93 %, CO₂ 420 ppm, пар ~1 %', () => {
    useStar(1.0);
    const m = atmo('earth', 4.57).mix;
    assert.ok(Math.abs(m.O2 - 0.209) < 0.002);
    assert.ok(Math.abs(m.Ar - 0.0093) < 0.0005);
    assert.ok(Math.abs(m.CO2 - 420e-6) < 5e-6);
    assert.ok(m.N2 > 0.76 && m.N2 < 0.79, `${m.N2}`);
    assert.ok(m.H2O > 0.003 && m.H2O < 0.02, `${m.H2O}`);
  });

  test('Кислородная катастрофа: O₂ растёт плавно, без скачка на границе эпохи', () => {
    const a = earthEpochAt(2.15).o2pct, b = earthEpochAt(2.2).o2pct, c = earthEpochAt(2.24).o2pct;
    assert.ok(a < b && b < c && c <= 2.1 + 1e-9);
  });

  test('Снежки остаются: Гурон ~2.2–2.5, криогений ~3.86–3.95 млрд лет', () => {
    useStar(1.0);
    const sb = (t) => getPlanetClimate('earth', getInterpolatedState(t)).climate === 'snowball';
    assert.ok(!sb(2.1) && sb(2.3) && !sb(2.6));
    assert.ok(!sb(3.8) && sb(3.9) && !sb(4.0));
  });

  test('Венера и Марс без скачков давления; современные значения на месте', () => {
    useStar(1.0);
    let pv = null, pm = null;
    for (let t = 1.0; t < 10; t += 0.01) {
      const v = atmo('venus', t).pressureBar, m = atmo('mars', t).pressureBar;
      if (pv && t > 1.45) assert.ok(Math.abs(Math.log(v / pv)) < 0.2, `Венера ${t}: ${pv} → ${v}`);
      if (pm) assert.ok(Math.abs(Math.log(m / pm)) < 0.6, `Марс ${t}: ${pm} → ${m}`);
      pv = v; pm = m;
    }
    assert.equal(atmo('venus', 4.57).pressureBar, 92);
    assert.equal(atmo('mars', 4.57).pressureBar, 0.006);
    assert.ok(Math.abs(atmo('mars', 4.57).mix.CO2 - 0.95) < 0.01);
  });

  test('Пар по Клаузиусу — Клапейрону: при −30 °C пара в ~30 раз меньше, чем при +15 °C', () => {
    const r = vaporFraction(288, 1) / vaporFraction(243, 1);
    assert.ok(r > 20 && r < 45, `${r}`);
  });
});

describe('Список газов', () => {
  test('ppm для следовых газов, проценты для остальных', () => {
    assert.equal(formatFraction(0.7421), '74.21%');
    assert.equal(formatFraction(1.9e-6), '1.9 ppm');
    assert.equal(formatFraction(420e-6), '0.04%');
    assert.equal(formatFraction(47e-6), '47 ppm');
  });
  test('Топ-6 + «Прочие» с суммой остатка', () => {
    useStar(1.0);
    const g = atmo('earth', 4.57).gases;
    const rows = gasRows(g);
    assert.ok(rows.length <= 7);
    assert.equal(rows[0].name, 'N₂');
    assert.equal(rows[1].name, 'O₂');
    if (g.length > 6) assert.equal(rows[6].name, 'Прочие');
    assert.ok(Math.abs(rows.reduce((s, r) => s + r.frac, 0) - 1) < 1e-9);
  });
});

import { MEDIA, bowRadius, haloRadius, parhelionOffset } from '../src/physics/refraction.js';
import { eclipsedMoonColor, lunarShadow } from '../src/render/opticalFx.js';
import { atmosphereOptics, directLight } from '../src/physics/optics.js';
const deg = (r) => r * 180 / Math.PI;

describe('Радуги, гало, затмения', () => {
  test('Вода: первичная радуга 42° (красный 42.3°, фиолетовый 40.7°), вторичная 51°', () => {
    const n = MEDIA.water.n;
    assert.ok(Math.abs(deg(bowRadius(n(589))) - 42.0) < 0.3);
    assert.ok(Math.abs(deg(bowRadius(n(680))) - 42.3) < 0.3);
    assert.ok(Math.abs(deg(bowRadius(n(420))) - 40.7) < 0.3);
    assert.ok(Math.abs(deg(bowRadius(n(589), 2)) - 51.0) < 0.5);
  });
  test('Метановая радуга Титана шире (~51°), гало льда 22°, гало CO₂ ~29°', () => {
    assert.ok(deg(bowRadius(MEDIA.methane.n(589))) > 49);
    assert.ok(Math.abs(deg(haloRadius(MEDIA.ice.n(589))) - 21.8) < 0.3);
    assert.ok(Math.abs(deg(haloRadius(MEDIA.co2ice.n(589))) - 29.3) < 1);
  });
  test('Ложные солнца отходят от Солнца с высотой: 22° у горизонта, ~25° при высоте 30°', () => {
    const n = MEDIA.ice.n(589), h = 30 * Math.PI / 180;
    assert.ok(Math.abs(deg(parhelionOffset(n, 0)) - 21.8) < 0.3);
    const dAz = parhelionOffset(n, h);
    const sep = Math.acos(Math.sin(h) ** 2 + Math.cos(h) ** 2 * Math.cos(dAz));
    assert.ok(Math.abs(deg(sep) - 24.8) < 0.8, `${deg(sep)}`);
  });
  test('Луна в тени Земли — медно-красная: красный канал доминирует, синий почти погас', () => {
    useStar(1.0);
    const st = getInterpolatedState(4.57);
    const opt = atmosphereOptics('earth', getPlanetClimate('earth', st));
    const c = eclipsedMoonColor(directLight([1, 1, 1], opt, 0));
    assert.equal(c[0], 1);
    assert.ok(c[1] < 0.3 && c[2] < 0.05, c.join(','));
  });
  test('Доли диска в тени: в центре умбры — 1, далеко — 0', () => {
    const a = 0.0045;
    assert.equal(lunarShadow(0, a, 0.012, 0.021).umbra, 1);
    assert.equal(lunarShadow(0.03, a, 0.012, 0.021).penumbra, 0);
  });
});

import { atmosphereProfile } from '../src/physics/atmoProfile.js';
import { interiorLayers, seismology, coreMassFromL } from '../src/model/interior.js';
import { sunGalactic, GALACTIC_YEAR } from '../src/render/galaxyView.js';
import { lunarCycle } from '../src/render/moonView.js';

describe('Разрез атмосферы', () => {
  test('Земля: тропопауза ~11 км при ~215 K, стратопауза ~50 км при ~270 K, 1 мбар на ~48 км', () => {
    useStar(1.0);
    const st = getInterpolatedState(4.57);
    const P = atmosphereProfile('earth', getPlanetClimate('earth', st), atmo('earth', 4.57));
    assert.ok(Math.abs(P.zTrop - 11.5) < 2, `${P.zTrop}`);
    assert.ok(Math.abs(P.Tskin - 215) < 8);
    const l50 = P.levels.find(l => l.z >= 50);
    assert.ok(Math.abs(l50.T - 270) < 12, `${l50.T}`);
    assert.ok(l50.p > 4e-4 && l50.p < 1.5e-3, `${l50.p}`);
  });
  test('Венера: облака H₂SO₄ на ~48–70 км; без кислорода нет тёплой стратосферы', () => {
    useStar(1.0);
    const st = getInterpolatedState(4.57);
    const P = atmosphereProfile('venus', getPlanetClimate('venus', st), atmo('venus', 4.57));
    const cl = P.clouds.find(c => c.name.includes('H₂SO₄'));
    assert.ok(cl.z0 > 40 && cl.z0 < 56 && cl.z1 > 62 && cl.z1 < 78, `${cl.z0}-${cl.z1}`);
    assert.ok(!P.clouds.some(c => c.kind === 'ozone'));
  });
});

describe('Недра звезды и сейсмология', () => {
  test('Солнце: ν_max ≈ 3090 мкГц (5 мин), Δν ≈ 135 мкГц; дно конвективной зоны 0.71 R', () => {
    useStar(1.0);
    const st = getInterpolatedState(4.57);
    const q = seismology(1, 1, 5777);
    assert.ok(Math.abs(q.numax - 3090) < 1 && Math.abs(q.dnu - 135.1) < 0.1);
    assert.ok(q.periodMin > 5 && q.periodMin < 6);
    const I = interiorLayers(st, 1.0);
    assert.equal(I.phase, 'ms');
    assert.ok(Math.abs(I.layers[1].r - 0.713) < 0.02);
  });
  test('Красный карлик 0.3 M☉ полностью конвективен; 2 M☉ — конвективное ядро', () => {
    useStar(0.3); assert.match(interiorLayers(getInterpolatedState(5), 0.3).layers[1].name, /конвективна целиком/);
    useStar(2.0); assert.match(interiorLayers(getInterpolatedState(0.5), 2.0).layers[0].name, /Конвективное ядро/);
  });
  test('Гигант: ядро 0.45–0.5 M☉ у вершины ветви (L ~ 2000 L☉), колебания — дни', () => {
    assert.ok(Math.abs(coreMassFromL(2000) - 0.47) < 0.03);
    const q = seismology(0.8, 150, 3100);
    assert.ok(q.periodMin > 1440, `${q.periodMin}`);
  });
});

describe('Галактика и вид с Луны', () => {
  test('Галактический год ~220 млн лет, за жизнь Солнца ~20 оборотов, |z| ≤ 80 пк', () => {
    assert.ok(GALACTIC_YEAR > 0.2 && GALACTIC_YEAR < 0.24);
    const s = sunGalactic(4.57);
    assert.ok(s.orbits > 19 && s.orbits < 22);
    assert.ok(Math.abs(s.z - 0.02) < 1e-6);
    for (let t = 0; t < 10; t += 0.013) assert.ok(Math.abs(sunGalactic(t).z) <= 0.0801);
  });
  test('С Луны фаза Земли противоположна фазе Луны: новолуние — полная Земля', () => {
    const now0 = (2 * Math.PI - 2.0) / 0.00012;              // ψ = 0 — новолуние
    assert.ok(lunarCycle(now0, 0.0045, 0.0046).earthLit > 0.99);
    const nowF = (Math.PI - 2.0) / 0.00012;                  // ψ = π — полнолуние
    assert.ok(lunarCycle(nowF, 0.0045, 0.0046).earthLit < 0.01);
  });
});
