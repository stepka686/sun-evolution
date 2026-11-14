// Тесты режима «Формулы»: подстановка даёт то же число, что и модель, и ни одна формула не ломается
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { useStar, catalogAge } from './helpers.js';
import { S } from '../src/state.js';
import { STAR_CATALOG } from '../src/data/catalog.js';
import { getInterpolatedState } from '../src/model/timeline.js';
import { FORMULA_TABS, buildFormula, renderFormulaHTML, num } from '../src/model/formulas.js';
import { getPlanetClimate } from '../src/physics/climate.js';
import { getPlanetDistanceAU } from '../src/physics/orbits.js';

const rel = (a, b) => Math.abs(a - b) / Math.max(1e-30, Math.abs(b));

describe('Формулы совпадают с моделью', () => {
  test('Стефан — Больцман: R, L и T из формул равны значениям на экране (на всём треке)', () => {
    for (const id of ['sun', 'proxima', 'arcturus', 'betelgeuse', 'sirius_a']) {
      const { stages } = useStar(id);
      for (const s of stages.filter((x, i) => x.l > 0 && x.t >= 0 && !x.noSB && !(stages[i + 1] || {}).noSB).slice(0, 40)) {
        const st = getInterpolatedState(s.t, { static: true });
        assert.ok(rel(buildFormula('lum', st).value, st.l) < 0.02, `${id} L t=${s.t}`);
        assert.ok(rel(buildFormula('radius', st).value, st.r) < 0.02, `${id} R t=${s.t}`);
        assert.ok(rel(buildFormula('temp', st).value, st.temp) < 0.02, `${id} T t=${s.t}`);
      }
    }
  });

  test('Зона жизни из формулы равна той, что на экране', () => {
    useStar('tau_ceti');
    const st = getInterpolatedState(5.8, { static: true });
    const hz = buildFormula('hz', st).value;
    assert.ok(rel(hz.inner, st.hzIn) < 1e-6 && rel(hz.outer, st.hzOut) < 1e-6);
  });

  test('Климат: формула показывает ту же температуру, что модель (все режимы атмосферы)', () => {
    useStar('sun');
    for (const [planet, t] of [['earth', 4.6], ['earth', 2.3], ['earth', 6.5], ['venus', 4.6], ['mars', 4.6], ['titan', 4.6], ['europa', 4.6], ['mercury', 4.6], ['pluto', 4.6]]) {
      S.currentPlanet = planet;
      const st = getInterpolatedState(t, { static: true });
      assert.ok(Math.abs(buildFormula('climate', st).value - getPlanetClimate(planet, st).T) < 1e-9, `${planet} t=${t}`);
    }
    S.currentPlanet = 'earth';
  });

  test('Энергобаланс в подстановке действительно сходится: поглощено = излучено', () => {
    useStar('sun'); S.currentPlanet = 'earth';
    const html = renderFormulaHTML(buildFormula('climate', getInterpolatedState(4.6, { static: true })));
    const m = html.match(/поглощено ([\d.]+) = излучено ([\d.]+)/);
    assert.ok(m, 'нет строки баланса');
    assert.ok(rel(+m[1], +m[2]) < 0.002, `${m[1]} vs ${m[2]}`);
  });

  test('Орбита: формула показывает то же расстояние, что интегратор', () => {
    useStar('sun');
    for (const planet of ['earth', 'mars', 'jupiter', 'neptune']) {
      S.currentPlanet = planet;
      const st = getInterpolatedState(11.0, { static: true });
      assert.ok(Math.abs(buildFormula('orbit', st).value - getPlanetDistanceAU(planet, st)) < 1e-12, planet);
    }
    S.currentPlanet = 'earth';
  });
});

describe('Формулы не ломаются', () => {
  test('Все вкладки для всех звёзд каталога: без NaN, undefined и исключений', () => {
    for (const star of STAR_CATALOG) {
      useStar(star.id);
      const t0 = catalogAge(star);
      for (const t of [t0, Math.max(0, t0 * 0.5)]) {
        const st = getInterpolatedState(t, { static: true });
        for (const [key] of FORMULA_TABS) {
          const html = renderFormulaHTML(buildFormula(key, st));
          assert.doesNotMatch(html, /NaN|undefined|Infinity/, `${star.id} ${key} t=${t}`);
        }
      }
    }
  });

  test('Подгонка возраста показывается для звёзд с наблюдениями', () => {
    useStar('arcturus');
    S.lastAgeFit = { t: 5.9, chi2: 0.87, source: 'fit' };
    const html = renderFormulaHTML(buildFormula('age', getInterpolatedState(5.9, { static: true })));
    assert.match(html, /χ²/);
    assert.match(html, /w<sub>Z<\/sub>/);
    S.lastAgeFit = null;
  });

  test('Форматирование чисел: степени десяти и знак минус', () => {
    assert.equal(num(3.828e26), '3.83×10²⁶');
    assert.equal(num(-0.5), '−0.5');
    assert.equal(num(1.2e-5), '1.20×10⁻⁵');
    assert.equal(num(1361), '1360');
  });
});
