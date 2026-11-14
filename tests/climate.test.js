// Тесты климата: модель энергобаланса, калибровки, история Земли, убегающий парник
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { useStar } from './helpers.js';
import { S } from '../src/state.js';
import * as E from '../src/physics/energyBalance.js';
import { calculateSurfaceTemp, calculatePlanetAtmosphere, calculateBiosphere, getRunawayOnset } from '../src/physics/climate.js';
import { getInterpolatedState } from '../src/model/timeline.js';
import { earthEpochAt } from '../src/data/earthHistory.js';

const C = (T) => T - 273.15;
const MODERN = { co2ppm: 420, ch4ppm: 1.9, pBar: 1.013 };
const earthAt = (t) => { useStar('sun'); const st = getInterpolatedState(t, { static: true }); return { T: calculateSurfaceTemp('earth', st), atmo: calculatePlanetAtmosphere('earth', st) }; };

describe('Модель энергобаланса', () => {
  test('Современная Земля: 15 °C', () => {
    assert.ok(Math.abs(C(E.wetEquilibrium(E.S_EARTH, MODERN).T) - 15) < 0.5);
  });

  test('Чувствительность к удвоению CO₂ — 2–3.5 K (IPCC AR6: 2.5–4 K)', () => {
    const d = E.wetEquilibrium(E.S_EARTH, { ...MODERN, co2ppm: 840 }).T - E.wetEquilibrium(E.S_EARTH, MODERN).T;
    assert.ok(d > 2 && d < 3.5, `${d.toFixed(2)} K`);
  });

  test('Калибровки: Венера 464 °C, Марс −60 °C, Титан −179 °C', () => {
    assert.ok(Math.abs(C(E.grayTemp(2601, 0.76, E.tauThick(92))) - 464) < 5);
    assert.ok(Math.abs(C(E.grayTemp(586.2, 0.25, E.tauThin(0.006, 0.1, 0.006))) + 60) < 5);
    assert.ok(Math.abs(C(E.grayTemp(14.8, 0.22, E.tauThin(1.45, 0.71, 1.45))) + 179) < 3);
  });

  test('Ледово-альбедная неустойчивость: при потоке на 5–10% ниже нынешнего Земля замерзает', () => {
    assert.equal(E.wetEquilibrium(E.S_EARTH * 0.97, MODERN).state, 'warm');
    assert.equal(E.wetEquilibrium(E.S_EARTH * 0.90, MODERN).state, 'snowball');
  });

  test('Гистерезис «снежка»: при одном и том же потоке существуют два устойчивых климата', () => {
    // Скан f(T) = ASR − OLR при S = 0.97 S₀: два перехода через ноль сверху вниз (тёплый и ледяной корень)
    const Sx = E.S_EARTH * 0.97, dF = E.greenhouseForcing(MODERN);
    const olr = (T) => { const x = E.A_OLR_CALIBRATED + E.B_OLR * (T - 273.15) - dF; return Math.pow(Math.pow(x, -8) + Math.pow(E.OLR_LIM, -8), -1 / 8); };
    const f = (T) => (Sx / 4) * (1 - E.iceAlbedo(T)) - olr(T);
    let stable = 0;
    for (let T = 200; T < 330; T += 0.5) if (f(T) > 0 && f(T + 0.5) <= 0) stable++;
    assert.equal(stable, 2);
  });

  test('Убегающий парник: поглощение выше 282 Вт/м² — равновесия с океаном нет (порог ≈ 1.19 S₀)', () => {
    assert.equal(E.wetEquilibrium(E.S_EARTH * 1.15, MODERN).state, 'warm');
    assert.equal(E.wetEquilibrium(E.S_EARTH * 1.20, MODERN).state, 'runaway');
  });
});

describe('История Земли (Солнце)', () => {
  test('Парадокс тусклого молодого Солнца: архей тёплый благодаря CO₂ и CH₄, а с современной атмосферой — «снежок»', () => {
    const archean = earthAt(1.5);
    assert.ok(archean.T.avg > 0, `${archean.T.avg} °C`);
    assert.equal(E.wetEquilibrium(E.S_EARTH * 0.79, MODERN).state, 'snowball');
  });

  test('Гуронский и криогенский «снежки» возникают из-за падения парниковых газов', () => {
    for (const t of [2.3, 3.9]) {
      const e = earthAt(t);
      assert.equal(e.T.climate, 'snowball', `t=${t}`);
      assert.match(e.atmo.event, /снежок/i);
    }
  });

  test('Протерозой и палеозой без глобального оледенения', () => {
    for (const t of [3.0, 4.2]) assert.equal(earthAt(t).T.climate, 'warm', `t=${t}`);
  });

  test('Будущее: Земля теплеет, и убегающий парник наступает через ~1–2 млрд лет', () => {
    let prev = -Infinity;
    for (const t of [4.6, 5.0, 5.5, 5.8]) { const T = earthAt(t).T.avg; assert.ok(T > prev, `t=${t}`); prev = T; }
    useStar('sun');
    const tRun = getRunawayOnset('earth');
    assert.ok(tRun > 5.6 && tRun < 6.6, `t_run = ${tRun}`);
  });

  test('После выкипания океанов: паровая атмосфера, затем сухая венероподобная (200–500 °C)', () => {
    useStar('sun');
    const tRun = getRunawayOnset('earth');
    assert.match(earthAt(tRun + 0.3).atmo.event, /паров/i);
    const dry = earthAt(tRun + 1.5);
    assert.match(dry.atmo.event, /Сухая/);
    assert.ok(dry.T.avg > 200 && dry.T.avg < 500, `${dry.T.avg}`);
  });

  test('Биосфера и атмосфера берут CO₂ из одной истории', () => {
    useStar('sun');
    for (const t of [1.0, 2.3, 3.0, 3.9, 4.6, 5.2]) assert.equal(calculateBiosphere(t).co2, Math.round(earthEpochAt(t).co2ppm), `t=${t}`);
  });
});

describe('Другие миры', () => {
  test('Земля у Проксимы замерзает, у Сириуса A — выкипает сразу', () => {
    useStar('proxima');
    assert.equal(calculateSurfaceTemp('earth', getInterpolatedState(4.85, { static: true })).climate, 'snowball');
    useStar('sirius_a');
    assert.equal(getRunawayOnset('earth'), 0);
  });

  test('Земля у другой звезды не получает солнечные эпохи (раньше у Полярной был «Катархей»)', () => {
    useStar('polaris');
    const a = calculatePlanetAtmosphere('earth', getInterpolatedState(0.03, { static: true }));
    assert.doesNotMatch(a.event, /Катархей|Архей|Кайнозой/);
  });

  test('Температура не опускается ниже реликтового излучения', () => {
    useStar('sun');
    S.isDeepTime = false;
    const st = getInterpolatedState(4.6, { static: true });
    for (const p of ['eris', 'pluto', 'neptune']) assert.ok(calculateSurfaceTemp(p, st).avg >= -271, p);
  });
});
