// 5.5: объёмные кучевые облака и сумеречные лучи по карте теней
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CU, cloudExtinction, cloudPhase, cloudSunLight, hg, powder, slabFromBelow } from '../src/physics/clouds.js';

const src = (f) => readFileSync(new URL('../src/' + f, import.meta.url), 'utf8');

describe('5.5: оптика облака (эталон)', () => {
  test('Ослабление: LWC 0.5 г/м³, r_e 10 мкм → ~75 км⁻¹ (капли непрозрачны на десятках метров)', () => {
    const b = cloudExtinction(0.5, 10);
    assert.ok(Math.abs(b - 75) < 0.5, `${b}`);
    assert.ok(Math.exp(-b * 0.1) < 1e-3, 'облако толщиной 100 м уже почти непрозрачно');
  });
  test('Хеньи — Гринстейн нормирована: среднее по сфере = 1, у смеси облака тоже', () => {
    for (const f of [(c) => hg(0.8, c), (c) => hg(-0.3, c), (c) => cloudPhase(c)]) {
      let I = 0; const n = 20000;
      for (let i = 0; i < n; i++) { const c = -1 + (i + 0.5) * 2 / n; I += f(c) * 2 / n; }
      assert.ok(Math.abs(I / 2 - 1) < 0.01, `${I / 2}`);
    }
  });
  test('Индикатриса: вперёд в десятки раз ярче, чем вбок (серебристый край у звезды)', () => {
    assert.ok(cloudPhase(0.99) > 20 * cloudPhase(0));
    assert.ok(cloudPhase(-1) > cloudPhase(0), 'слабый пик назад — светлая изнанка против звезды');
  });
  test('Октавы многократного рассеяния: свет проникает глубже, чем по закону Бугера', () => {
    const tau = 6;
    assert.ok(cloudSunLight(tau, 0) > 20 * Math.exp(-tau) * cloudPhase(0));
    assert.ok(cloudSunLight(0, 0) > cloudSunLight(2, 0) && cloudSunLight(2, 0) > cloudSunLight(8, 0));
  });
  test('«Пудра»: тонкий край тусклее глубины', () => {
    assert.ok(powder(0.1) < 0.2 && powder(3) > 0.99);
  });
  test('Снизу: мощное облако темнее и непрозрачнее тонкого; со стороны звезды светлее, чем вбок', () => {
    const thin = slabFromBelow(0.3, 1, 0.8, 0), thick = slabFromBelow(3, 1, 0.8, 0);
    assert.ok(thick.T < thin.T && thick.T < 1e-3);
    // основание мощного облака темнее основания тонкого: свет звезды гаснет, пройдя башню
    const fromTop = (r) => r.L / (1 - r.T);
    assert.ok(fromTop(thick) < fromTop(thin), `${fromTop(thick)} vs ${fromTop(thin)}`);
    assert.ok(slabFromBelow(0.3, 1, 0.8, 0.95).L > 3 * slabFromBelow(0.3, 1, 0.8, 0).L, 'серебристый край');
  });
});

describe('5.5: шейдер облаков и лучей', () => {
  const sky = src('gl/skyGL.js');
  test('Константы облака в шейдере — из эталона physics/clouds.js', () => {
    for (const k of ['CU_SIG = ${f(CU.sigma)}', 'cuPhase(float c, float k)', 'cuSun(', "import { CU } from '../physics/clouds.js'"]) assert.ok(sky.includes(k), k);
    assert.equal(CU.base, 1.5); assert.equal(CU.height, 4.0);
  });
  test('Видимые облака и их тени — одно поле башен (towerE/cuDens), марш с накоплением кадров', () => {
    for (const k of ['float towerE(vec2 q)', 'float cuDens(', 'slabSeg(O, D)', "p.lowQuality ? 9 : 16", 'cache.cloudGeo', '1 - k']) assert.ok(sky.includes(k), k);
    assert.ok(!sky.includes('cumulusD('), 'старый плоский слой убран');
  });
  test('Сумеречные лучи — по карте теней на видеокарте (без чтения в процессор), без дрожания', () => {
    for (const k of ['FS_SHADOW', 'copyTexImage2D', 'uniform sampler2D uShadow', 'texture2D(uShadow, uv)', 'renderShadowMap(gl, p)']) assert.ok(sky.includes(k), k);
    assert.ok(!sky.includes('float j = h2(gl_FragCoord.xy + float(k) * 7.3)'), 'тень в середине шага, без шума');
  });
  test('Карта теней: 192×96, луч на 310 км сквозь слой, земля уходит вниз как x²/2R', () => {
    assert.ok(sky.includes('SHW = 192, SHH = 96') && sky.includes('i < 120') && sky.includes('dot(X.xy, X.xy) / (2.0 * uR)'));
  });
});
