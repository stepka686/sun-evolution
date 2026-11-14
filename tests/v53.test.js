// 5.3: графика — сумерки, сумеречные лучи, полярное сияние, серебристые облака, корона, блик в глазу,
// тепловое свечение, чёрная дыра
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { useStar } from './helpers.js';
import { getInterpolatedState } from '../src/model/timeline.js';
import { getPlanetClimate } from '../src/physics/climate.js';
import { atmosphereOptics, blackbodyRGB } from '../src/physics/optics.js';
import { buildSkyParams, skySpectral, spectrumToRGB, sunTransmittance, TWI_HEIGHT, TWI_WEIGHT } from '../src/physics/skyModel.js';
import { AURORA_LINES, airglowBin, auroraColumns, auroraSpectrum, E_SUN_LX, lineBins, lineProfile, nlcRadiance, nlcStrength, NLC_HEIGHT, rayleighLuminance } from '../src/physics/upperAtmo.js';
import { baumbach, coronaBrightness, ludendorff } from '../src/physics/corona.js';
import { cieGlarePSF, glareRatio } from '../src/physics/glare.js';
import { thermalGlowRatio, draperRatio } from '../src/physics/glow.js';
import { B_CRIT, R_ISCO, diskRedshift, diskTemperature, orbitalBeta, traceRay } from '../src/physics/blackHole.js';

const D = Math.PI / 180;
const Y = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const src = (f) => readFileSync(new URL('../src/' + f, import.meta.url), 'utf8');
const earthP = () => {
  useStar(1.0);
  const o = atmosphereOptics('earth', getPlanetClimate('earth', getInterpolatedState(4.57)));
  return buildSkyParams('earth', o, { starT: 5772, F: blackbodyRGB(5772), Hgas: 8 });
};

describe('5.3: сумерки', () => {
  test('Яркость зенита в сумерках по таблице освещённости (Bond & Henderson 1963) — в пределах ×2.5 при −6…−12°', () => {
    const P = earthP();
    const z = (s) => Y(skySpectral(P, Math.PI / 2, s * D, Math.sin(s * D), 48));
    const z0 = z(0);
    // освещённость относительно захода: −6° — 3 лк, −8° — ~0.4, −10° — ~0.06, −12° — 0.008 (при 0° — ~700 лк)
    for (const [s, ref] of [[-6, 4e-3], [-8, 6e-4], [-10, 9e-5], [-12, 1.1e-5]]) {
      const k = z(s) / z0 / ref;
      assert.ok(k > 0.4 && k < 2.5, `${s}°: ${k.toFixed(2)}× от таблицы`);
    }
  });
  test('Сдвиг подсветки — горизонт с высоты ~5 шкал высот (~700 км у Земли), вес 1%', () => {
    const P = earthP();
    assert.ok(Math.abs(P.twiArc * P.R - 700) < 60, `${P.twiArc * P.R}`);
    assert.equal(TWI_WEIGHT, 0.01);
    const sky = src('gl/skyGL.js');
    assert.ok(sky.includes('uTwiArc') && sky.includes('${TWI_WEIGHT} * f0') && sky.includes('sunT(r + uH,'));
    assert.ok(src('physics/skyModel.js').includes('r + P.H, Math.cos(Math.max(0, Math.acos(muC) - (P.twiArc || 0)))'));
    assert.ok(TWI_HEIGHT > 4 && TWI_HEIGHT < 6);
  });
  test('Тень Земли: при звезде на 1° под горизонтом тень вчетверо-впятеро темнее пояса Венеры (как на фото)', () => {
    const P = earthP();
    const at = (e) => { const h = e * D, s = -1 * D; return Y(skySpectral(P, h, s, -Math.cos(h) * Math.cos(s) + Math.sin(h) * Math.sin(s), 48)); };
    const k = at(1) / at(10);
    assert.ok(k > 0.15 && k < 0.3, `${k}`);
  });
  test('Шейдер неба: 16 шагов вдоль луча (на 10 шагах тень Земли светлела на 40%)', () => {
    assert.ok(src('gl/skyGL.js').includes('const int SKY_N = 16;'));
  });
});

describe('5.3: сумеречные лучи', () => {
  test('Тень облаков считается вдоль луча до звезды: пересечение со слоем облаков, без лучей — без изменений', () => {
    const sky = src('gl/skyGL.js');
    for (const k of ['cloudShadow(', 'uRays', 'CU_BASE = 1.5, CU_H = 4.0', 's * 0.0093']) assert.ok(sky.includes(k), k);
  });
});

describe('5.3: полярное сияние', () => {
  test('Профили линий: зелёная 557.7 нм ниже красной 630 нм; нижний край резкий; столб нормирован', () => {
    const g = AURORA_LINES.find(l => l.id === 'O557'), r = AURORA_LINES.find(l => l.id === 'O630');
    assert.ok(g.peak > 100 && g.peak < 120 && r.peak > 200 && r.peak < 300);
    let col = 0; for (let h = 60; h < 500; h += 0.5) col += lineProfile(g, h) * 0.5;
    assert.ok(Math.abs(col - 1) < 0.01, `${col}`);
    assert.ok(lineProfile(g, g.peak - 10) < 0.2 * lineProfile(g, g.peak + 10), 'снизу резче');
  });
  test('Цвет: кислородное сияние зелёное, верх — красный, без кислорода — сине-фиолетовое', () => {
    const cols = auroraColumns(0.3, { oxygen: true });
    const low = spectrumToRGB(auroraSpectrum(cols, 90, 150)), high = spectrumToRGB(auroraSpectrum(cols, 190, 400));
    assert.ok(low[1] > low[0] && low[1] > low[2], `низ ${low}`);
    assert.ok(high[0] > high[1], `верх ${high}`);
    const n2 = spectrumToRGB(auroraSpectrum(auroraColumns(0.3, { oxygen: false })));
    assert.ok(n2[2] > n2[1], `без O: ${n2}`);
  });
  test('Линия раскладывается по двум соседним каналам с суммой 1', () => {
    const w = lineBins(557.7);
    assert.ok(Math.abs(w.reduce((a, b) => a + b) - 1) < 1e-9 && w[3] > 0 && w[4] > 0);
  });
  test('Фотометрия: 1 R зелёной линии — 1.9·10⁻⁷ кд/м²; столб 10 кР в единицах неба — π·L/E☉', () => {
    assert.ok(Math.abs(rayleighLuminance(557.7) / 1.93e-7 - 1) < 0.03, `${rayleighLuminance(557.7)}`);
    const Lsky = Y(spectrumToRGB(auroraSpectrum({ O557: 1e4 })));
    assert.ok(Math.abs(Lsky / (Math.PI * 1.93e-3 / E_SUN_LX) - 1) < 0.05, `${Lsky}`);
  });
  test('Свечение верхней атмосферы (250 R) — в 40 раз тусклее сияния 10 кР и не ноль (в 5.2 оно терялось в единицах)', () => {
    const w = [0, 0, 0, 0, airglowBin(), 0, 0, 0];
    const air = Y(spectrumToRGB(w)), aur = Y(spectrumToRGB(auroraSpectrum({ O557: 1e4 })));
    assert.ok(air > 1e-10 && Math.abs(aur / air / 40 - 1) < 0.1, `${air} ${aur}`);
  });
  test('Шейдер: те же высоты линий, что в эталоне', () => {
    const sky = src('gl/skyGL.js');
    // высоты и каналы линий подставляются в шейдер из эталона при сборке программы
    for (const k of ['LINE_P = AURORA_LINES.map', 'lineBins(l.lambda)', 'lp(alt, LP0), lp(alt, LP1), lp(alt, LP2), lp(alt, LP3)', 'exp(-x * x) / (0.886227 * (L.y + L.z))']) assert.ok(sky.includes(k), k);
  });
});

describe('5.3: серебристые облака', () => {
  test('Сезон: на 50° с.ш. в июне есть, в декабре нет; в эпоху цивилизации ярче', () => {
    assert.ok(nlcStrength(172) > 0.4 && nlcStrength(355) === 0);
    assert.ok(nlcStrength(172, { civilization: true }) > nlcStrength(172));
    assert.equal(nlcStrength(172, { earthLike: false }), 0);
  });
  test('Видны в навигационные сумерки: при звезде на −10° облако на 83 км освещено и ярче фона неба', () => {
    const P = earthP();
    const r = P.R + NLC_HEIGHT;
    // облако над горизонтом со стороны звезды на высоте 10°: точка ~400 км к звезде
    const Ts = sunTransmittance(P, r, Math.sin(-10 * D + 400 / P.R), new Array(8));
    assert.ok(Ts[4] > 0.3, `освещено: ${Ts[4]}`);
    const L = Y(spectrumToRGB(nlcRadiance(P.F, Ts, Math.cos(25 * D), Math.sin(10 * D), 1)));
    const sky = Y(skySpectral(P, 10 * D, -10 * D, Math.cos(20 * D), 48));
    assert.ok(L > sky, `облака ${L} vs небо ${sky}`);
    // в тени: при −20° свет до облака не доходит
    const Ts2 = sunTransmittance(P, r, Math.sin(-20 * D), new Array(8));
    assert.ok(Ts2[4] < 1e-3);
  });
  test('Цвет голубой (рэлеевские частицы)', () => {
    const P = earthP();
    const c = spectrumToRGB(nlcRadiance(P.F, new Array(8).fill(1), 0, 0.3, 1));
    assert.ok(c[2] > c[0], `${c}`);
  });
});

describe('5.3: корона', () => {
  test('Баумбах: у лимба ~10⁻⁶ яркости диска, к 2 R☉ падает в ~25–80 раз', () => {
    assert.ok(baumbach(1) > 3e-6 && baumbach(1) < 6e-6, `${baumbach(1)}`);
    const k = baumbach(1.1) / baumbach(2);
    assert.ok(k > 25 && k < 80, `${k}`);
  });
  test('Сплюснутость: в минимуме цикла ~0.25, в максимуме — почти круглая', () => {
    assert.ok(Math.abs(ludendorff(0) - 0.25) < 0.01 && ludendorff(1) < 0.05);
    // в минимуме у экватора на 2 R☉ ярче, чем у полюса
    const eq = coronaBrightness(2, 0, 0, [0]), pole = coronaBrightness(2, Math.PI / 2 - 0.4, 0, [0]);
    assert.ok(eq > 2 * pole, `${eq} vs ${pole}`);
  });
});

describe('5.3: блик в глазу (CIE 2002)', () => {
  test('Функция рассеяния точки: при 1° — ~15 ср⁻¹ (молодой глаз), спад ~θ⁻² … θ⁻³', () => {
    const p1 = cieGlarePSF(1);
    assert.ok(p1 > 14 && p1 < 17, `${p1}`);
    assert.ok(cieGlarePSF(10) / p1 < 0.05);
  });
  test('Солнце: блик на 1° — ~10⁻⁴ яркости диска (поэтому ореол компактный)', () => {
    const k = glareRatio(1, 0.00465);
    assert.ok(k > 5e-4 && k < 1.5e-3, `${k}`);
  });
  test('Ореол рисуется по CIE, а не по ручному радиусу', () => {
    assert.ok(src('render/surface.js').includes('Math.PI * cieGlarePSF(th)'));
  });
});

describe('5.3: тепловое свечение', () => {
  test('Порог Дрейпера: Венера (737 K) тусклее порога, лава 1400 K — в тысячи раз ярче', () => {
    assert.ok(draperRatio(737) < 0.3);
    assert.ok(draperRatio(1400) > 1e3);
  });
  test('Рядом с освещённой стороной: Венера невидима (<10⁻⁶), лава при 1 а.е. — заметна (>1%)', () => {
    assert.ok(thermalGlowRatio(737, 5772, 1, 0.72) < 1e-6);
    assert.ok(thermalGlowRatio(1400, 5772, 1, 1) > 0.01);
  });
  test('Шейдер шара получает тепловое свечение', () => {
    assert.ok(src('gl/sphereGL.js').includes('uThermal'));
  });
});

describe('5.3: чёрная дыра', () => {
  test('Тень: луч с b < 3√3/2 r_s падает в дыру, с b чуть больше — уходит', () => {
    assert.ok(Math.abs(B_CRIT - 2.598) < 0.001);
    assert.ok(traceRay(B_CRIT - 0.02).captured);
    assert.ok(!traceRay(B_CRIT + 0.05).captured);
  });
  test('Слабое поле: отклонение 2r_s/b (Эйнштейн) с точностью 10% при b = 60', () => {
    const d = traceRay(60).deflection;
    assert.ok(Math.abs(d / (2 / 60) - 1) < 0.1, `${d} vs ${2 / 60}`);
  });
  test('Диск: нет излучения внутри ISCO, максимум температуры при 49/36·r_isco', () => {
    assert.equal(diskTemperature(2.9), 0);
    const rp = 49 / 36 * R_ISCO;
    assert.ok(Math.abs(diskTemperature(rp) - 1) < 1e-9 && diskTemperature(rp * 1.3) < 1 && diskTemperature(rp * 0.9) < 1);
  });
  test('На ISCO вещество летит со скоростью c/2, поперёк g = √(1 − 3M/r)', () => {
    assert.ok(Math.abs(orbitalBeta(3) - 0.5) < 1e-9);
    assert.ok(Math.abs(diskRedshift(3, 0) - Math.sqrt(0.5)) < 1e-9);
    assert.ok(diskRedshift(6, 1) > 1 && diskRedshift(6, -1) < 0.7, 'приближающаяся сторона синее');
  });
  test('Шейдер: та же сила, ISCO и закон температуры', () => {
    const bh = src('gl/blackHoleGL.js');
    for (const k of ['-1.5 * h2', 'R_ISCO 3.0', '49.0 / 36.0', 'sqrt(max(0.0, 1.0 - 1.0 / rc))']) assert.ok(bh.includes(k), k);
  });
});
