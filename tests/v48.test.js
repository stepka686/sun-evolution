// Тесты 4.8: длина суток, дрейф континентов, небесная геометрия, кометы, предел Роша, транзиты, остаток сверхновой
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { useStar } from './helpers.js';
import { getInterpolatedState } from '../src/model/timeline.js';
import { earthDayHours } from '../src/physics/rotation.js';
import { crustFraction, landGridAt, tectonicPhase } from '../src/model/continents.js';
import { altAz, eclToEq, galToEq, skyFrame, sunFromStar, bvToTemp } from '../src/render/skyGeometry.js';
import { STARS, STAR_NAMES } from '../src/data/skyCatalog.js';
import { remnantRadiusPc, rocheLimitAU } from '../src/render/cosmic.js';

const D2R = Math.PI / 180;

describe('Длина суток (сохранение момента импульса Земля — Луна)', () => {
  test('Сегодня 24 ч; 620 млн лет назад ~22 ч (ритмиты: 21.9 ч); 2.45 млрд лет назад ~19–20 ч', () => {
    assert.ok(Math.abs(earthDayHours(4.57) - 24) < 0.1);
    assert.ok(Math.abs(earthDayHours(3.95) - 21.9) < 0.5);
    const d = earthDayHours(2.12);
    assert.ok(d > 18 && d < 21, `${d}`);
  });
  test('Сутки удлиняются: ~+2.3 мс за столетие сейчас (в пределах 30%)', () => {
    const msPerCentury = (earthDayHours(4.57 + 1e-4) - earthDayHours(4.57)) * 3600 * 1000 / (1e-4 * 1e7);
    assert.ok(msPerCentury > 1.6 && msPerCentury < 3.0, `${msPerCentury}`);
  });
});

describe('Дрейф континентов', () => {
  const count = (g) => g.reduce((s, v) => s + (v ? 1 : 0), 0);
  const cell = (g, lat, lon) => g[Math.round(89.5 - lat) * 360 + Math.round(lon + 179.5)];
  test('Сегодня карта совпадает с исходной; в Пангее Южная Америка прижата к Африке', () => {
    const now = landGridAt(4.57);
    assert.equal(cell(now, -10, -45), 2);            // Бразилия на месте
    assert.equal(cell(now, 0, -15), 0);              // Атлантика открыта
    const pangea = landGridAt(4.32);
    let saNearAfrica = 0;                            // клетки Южной Америки к востоку от 20° з. д. (бывшая Атлантика)
    for (let lat = -30; lat <= 5; lat++) for (let lon = -20; lon <= 10; lon++) if (cell(pangea, lat, lon) === 2) saNearAfrica++;
    assert.ok(saNearAfrica > 50, `${saNearAfrica}`);
  });
  test('Площадь суши при перемещении плит сохраняется (±25%), в архее суши меньше', () => {
    const n0 = count(landGridAt(4.57));
    for (const t of [4.32, 4.45, 4.82]) { const n = count(landGridAt(t)); assert.ok(Math.abs(n / n0 - 1) < 0.25, `t=${t}: ${n}`); }
    assert.ok(crustFraction(0.5) < 0.5 && crustFraction(4) === 1);
  });
  test('Фаза цикла: Пангея 250 млн лет назад и Пангея Ультима через 250 млн лет', () => {
    assert.equal(tectonicPhase(4.32).f, 1);
    assert.equal(tectonicPhase(4.82).set, 'ultima');
    assert.ok(Math.abs(tectonicPhase(4.82).f - 1) < 1e-9);
  });
});

describe('Небесная геометрия', () => {
  test('Летнее солнцестояние: склонение Солнца +23.44°, полуденная высота на 50° с. ш. — 63.4°', () => {
    const f = skyFrame(172, 12, 23.44 * D2R, false);
    assert.ok(Math.abs(f.sun.dec / D2R - 23.44) < 0.3);
    assert.ok(Math.abs(f.sunAlt / D2R - 63.44) < 0.5);
  });
  test('Равноденствие: Солнце восходит в 6 ч точно на востоке', () => {
    const f = skyFrame(80, 6, 23.44 * D2R, false);
    assert.ok(Math.abs(f.sunAlt / D2R) < 1.5);
    assert.ok(Math.abs(f.sunAz / D2R - 90) < 2);
  });
  test('Полярная стоит над северным горизонтом на высоте, равной широте', () => {
    const i = Number(Object.keys(STAR_NAMES).find(k => STAR_NAMES[k] === 'Полярная'));
    const p = altAz(STARS[i * 4] * D2R, STARS[i * 4 + 1] * D2R, 1.234, 50 * D2R);
    assert.ok(Math.abs(p.alt / D2R - 50) < 1.5 && (p.az / D2R < 3 || p.az / D2R > 357));
  });
  test('Солнце с Альфы Центавра — звезда 0.5ᵐ в Кассиопее', () => {
    const s = sunFromStar('alpha_cen_a');
    assert.ok(Math.abs(s.mag - 0.47) < 0.1);
    assert.ok(Math.abs(s.ra / D2R - 39.9) < 0.5 && Math.abs(s.dec / D2R - 60.83) < 0.5);   // Кассиопея: α ≈ 0–3 ч, δ ≈ +55…+65°
  });
  test('Центр Галактики — в Стрельце (α ≈ 266°, δ ≈ −29°); эклиптика при λ = 90° поднимается на ε', () => {
    const g = galToEq(0, 0);
    assert.ok(Math.abs(((g.ra / D2R) + 360) % 360 - 266.4) < 1 && Math.abs(g.dec / D2R + 28.9) < 1);
    assert.ok(Math.abs(eclToEq(Math.PI / 2, 0, 23.44 * D2R).dec / D2R - 23.44) < 1e-6);
  });
  test('Цвет звезды по B−V: Солнце (0.65) ≈ 5800 K, Вега (0.0) ≈ 10 000 K', () => {
    assert.ok(Math.abs(bvToTemp(0.65) - 5800) < 300);
    assert.ok(Math.abs(bvToTemp(0.0) - 10000) < 600);
  });
});

describe('Космос', () => {
  test('Предел Роша: у белого карлика ~1 R☉ (снаружи звезды), у красного гиганта — под фотосферой', () => {
    const wd = { r: 0.0126, mass: 0.6 };
    const d = rocheLimitAU(wd) * 215.03;
    assert.ok(d > 0.5 && d < 3 && d > wd.r, `${d}`);
    useStar('sun');
    const rg = getInterpolatedState(12.1, { static: true });
    assert.ok(rocheLimitAU(rg) * 215.03 < rg.r, 'планеты поглощаются гигантом раньше, чем рвутся приливами');
  });
  test('Остаток сверхновой: ~5 пк через 1000 лет (Седов — Тейлор), до 200 лет — свободный разлёт', () => {
    assert.ok(Math.abs(remnantRadiusPc(1000) - 4.9) < 0.3);
    assert.ok(Math.abs(remnantRadiusPc(100) - 1.02) < 0.05);
  });
});
