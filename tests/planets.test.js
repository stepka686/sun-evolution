// Тесты планет: зона жизни, орбиты и поглощение, климат, глубокое время
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { useStar, enterDeepTime } from './helpers.js';
import { S } from '../src/state.js';
import { habitableZone } from '../src/physics/habitability.js';
import { getPlanetDistanceAU } from '../src/physics/orbits.js';
import { calculateSurfaceTemp } from '../src/physics/climate.js';
import { getInterpolatedState } from '../src/model/timeline.js';

describe('Зона жизни (Kopparapu 2013)', () => {
  test('Для Солнца: внутренняя граница ≈ 0.98–0.99 а.е., внешняя ≈ 1.67–1.70 а.е.', () => {
    const hz = habitableZone(1, 5780);
    assert.ok(hz.inner > 0.97 && hz.inner < 1.0, `inner=${hz.inner}`);
    assert.ok(hz.outer > 1.66 && hz.outer < 1.71, `outer=${hz.outer}`);
  });

  test('При равной светимости у холодной звезды зона дальше: её ИК-свет лучше поглощается, нужен меньший поток', () => {
    assert.ok(habitableZone(0.01, 3000).inner > habitableZone(0.01, 6500).inner);
  });

  test('Масштабируется как √L', () => {
    const a = habitableZone(1, 5780).inner, b = habitableZone(4, 5780).inner;
    assert.ok(Math.abs(b / a - 2) < 1e-9);
  });

  test('Земля сейчас в зоне жизни, через ~1 млрд лет — нет', () => {
    useStar('sun');
    const now = getInterpolatedState(4.6), later = getInterpolatedState(5.6);
    assert.ok(1.0 > now.hzIn && 1.0 < now.hzOut);
    assert.ok(1.0 < later.hzIn);
  });
});

describe('Орбиты и поглощение (Солнце)', () => {
  test('Далёкие планеты: чисто адиабатическое расширение a·M = const (Нептун)', () => {
    useStar('sun');
    const st = getInterpolatedState(13.0);
    const a = getPlanetDistanceAU('neptune', st);
    assert.ok(Math.abs(a * st.mass - 30.07) / 30.07 < 0.005, `a=${a}, M=${st.mass}`);
  });

  test('Меркурий цел на подъёме по RGB (R★ ≈ 11 R☉) и поглощён после вершины', () => {
    useStar('sun');
    assert.ok(getPlanetDistanceAU('mercury', getInterpolatedState(11.8)) > 0.3);
    assert.equal(getPlanetDistanceAU('mercury', getInterpolatedState(12.2)), 0);
  });
});

describe('Климат', () => {
  test('Марс сегодня холодный (−80…−30 °C)', () => {
    useStar('sun');
    const t = calculateSurfaceTemp('mars', getInterpolatedState(4.6)).avg;
    assert.ok(t > -80 && t < -30, `${t} °C`);
  });

  test('Температура не опускается ниже реликтового излучения (−270.4 °C)', () => {
    useStar('sun');
    enterDeepTime();
    const last = S.currentDeepStages[S.currentDeepStages.length - 1];
    for (const p of ['mars', 'europa', 'titan', 'pluto', 'eris']) {
      assert.ok(calculateSurfaceTemp(p, getInterpolatedState(last.t)).avg >= -271, p);
    }
  });
});

describe('Глубокое время', () => {
  test('Солнце: стадии остывания монотонно холоднее, до ~350 K через 10 трлн лет', () => {
    useStar('sun');
    const st = enterDeepTime();
    for (let i = 1; i < st.length; i++) assert.ok(st[i].temp < st[i - 1].temp && st[i].t > st[i - 1].t);
    const last = st[st.length - 1];
    assert.ok(last.temp > 250 && last.temp < 450, `T=${last.temp}`);
  });

  test('Планеты в глубоком времени получают температуру из энергобаланса, а не фотосферы (баг v4.0.5: Марс +10 700 °C)', () => {
    useStar('sun');
    const st = enterDeepTime();
    const t = calculateSurfaceTemp('mars', getInterpolatedState(st[0].t + 3)).avg;
    assert.ok(t < -200, `${t} °C`);
  });

  test('Недоступно для звёзд без белого карлика; доступно для гелиевого БК', () => {
    useStar('betelgeuse'); assert.equal(enterDeepTime(), null);
    useStar(0.05); assert.equal(enterDeepTime(), null);
    useStar('proxima'); assert.ok(enterDeepTime());
  });

  test('Интерполяция в глубоком времени попадает точно в узлы', () => {
    useStar('sun');
    const st = enterDeepTime();
    for (const s of st) assert.ok(Math.abs(getInterpolatedState(s.t).temp - s.temp) < 1);
  });
});
