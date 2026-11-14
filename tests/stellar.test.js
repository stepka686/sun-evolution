// Тесты звёздной физики: законы, пределы и согласованность эволюционных треков
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { useStar, sbLum, MASS_GRID, catalogAge } from './helpers.js';
import { S } from '../src/state.js';
import {
  lumFromRT, tempFromLR, wdRadius, wdMassFromInitial, redDwarfLifetimeGyr, massiveLifetimeGyr, BROWN_DWARF_LIMIT
} from '../src/physics/stellar.js';
import { getMKClass } from '../src/physics/classification.js';
import { getInterpolatedState } from '../src/model/timeline.js';
import { getExpeditionSteps } from '../src/model/expeditions.js';
import { STAR_CATALOG } from '../src/data/catalog.js';

describe('Формулы', () => {
  test('Солнце по Стефану — Больцману: R=1, T=5772 K → L=1', () => {
    assert.ok(Math.abs(lumFromRT(1, 5772) - 1) < 1e-12);
    assert.ok(Math.abs(tempFromLR(1, 1) - 5772) < 1e-9);
  });

  test('tempFromLR обратна lumFromRT', () => {
    for (const [r, t] of [[0.1, 3000], [800, 3400], [0.013, 11000]]) {
      assert.ok(Math.abs(tempFromLR(lumFromRT(r, t), r) - t) / t < 1e-9);
    }
  });

  test('Белый карлик: радиус убывает с массой, при 0.6 M☉ ≈ 0.0125 R☉ (≈ размер Земли)', () => {
    assert.ok(Math.abs(wdRadius(0.6) - 0.0125) < 0.0005);
    assert.ok(wdRadius(1.2) < wdRadius(0.8) && wdRadius(0.8) < wdRadius(0.5));
  });

  test('Масса белого карлика всегда ниже предела Чандрасекара (1.44 M☉)', () => {
    for (let m = 0.5; m < 8; m += 0.1) assert.ok(wdMassFromInitial(m) < 1.44, `M=${m}`);
  });

  test('Время жизни монотонно убывает с массой', () => {
    for (let m = 0.08; m < 0.44; m += 0.01) assert.ok(redDwarfLifetimeGyr(m + 0.01) < redDwarfLifetimeGyr(m));
    for (let m = 8; m < 150; m += 1) assert.ok(massiveLifetimeGyr(m + 1) < massiveLifetimeGyr(m));
  });

  test('Красный карлик 0.1 M☉ живёт триллионы лет, 25 M☉ — несколько миллионов', () => {
    assert.ok(redDwarfLifetimeGyr(0.1) > 1000);
    const t25 = massiveLifetimeGyr(25) * 1000;
    assert.ok(t25 > 5 && t25 < 10, `t(25 M☉) = ${t25} млн лет`);
  });
});

describe('Эволюционные треки по сетке масс', () => {
  for (const m of MASS_GRID) {
    describe(`M = ${m} M☉`, () => {
      test('время стадий не убывает', () => {
        const { stages } = useStar(m);
        for (let i = 1; i < stages.length; i++) assert.ok(stages[i].t >= stages[i - 1].t, `стадия ${i}`);
      });

      test('L согласована с R и T (Стефан — Больцман, допуск ×1.6)', () => {
        const { stages } = useStar(m);
        for (const s of stages) {
          if (s.noSB || s.t < 0 || s.l === 0) continue; // сверхновые, ЧД, аккрецирующие протозвёзды
          const ratio = s.l / sbLum(s);
          assert.ok(ratio < 1.6 && ratio > 0.62, `${s.name}: L/(R²T⁴) = ${ratio.toFixed(2)}`);
        }
      });

      test('белые карлики легче предела Чандрасекара', () => {
        const { stages } = useStar(m);
        for (const s of stages) if (s.r < 0.05 && s.r > 0.001) assert.ok(s.mass < 1.44, `${s.name}: ${s.mass} M☉`);
      });

      test('шаги экспедиции лежат внутри трека', () => {
        const { stages } = useStar(m);
        const tMin = stages[0].t, tMax = stages[stages.length - 1].t;
        for (const e of getExpeditionSteps()) assert.ok(e.t >= tMin - 1e-12 && e.t <= tMax + 1e-12, `${e.title}: t=${e.t}`);
      });
    });
  }

  test('Остаток зависит от массы: КК → БК → НЗ → ЧД', () => {
    const remnant = (m) => { const { stages } = useStar(m); return stages[stages.length - 1]; };
    assert.ok(remnant(0.05).r > 0.05, 'коричневый карлик не сжимается в БК');
    assert.ok(remnant(1.0).r < 0.05 && remnant(1.0).r > 0.001, 'Солнце → белый карлик');
    assert.match(remnant(11).spec, /Нейтрон|пульсар/i);
    assert.match(remnant(30).spec, /Чёрная дыра/i);
  });
});

describe('Каталог', () => {
  test('Проксима, Барнард и TRAPPIST-1 — красные карлики, а не коричневые', () => {
    for (const id of ['proxima', 'barnard', 'trappist1']) {
      const star = STAR_CATALOG.find(s => s.id === id);
      assert.ok(star.mass >= BROWN_DWARF_LIMIT, id);
      useStar(id);
      const st = getInterpolatedState(catalogAge(star), { static: true });
      assert.match(getMKClass(st), /^M\dV$/, `${id}: ${getMKClass(st)}`);
    }
  });

  test('Бетельгейзе в стартовом возрасте — красный сверхгигант', () => {
    const { star } = useStar('betelgeuse');
    const st = getInterpolatedState(catalogAge(star), { static: true });
    assert.ok(st.temp < 4000 && st.r > 500, `T=${st.temp}, R=${st.r}`);
  });

  test('Stephenson 2-18 — красный гипергигант, а не звезда Вольфа — Райе', () => {
    const { star } = useStar('stephenson');
    const st = getInterpolatedState(catalogAge(star), { static: true });
    assert.ok(st.temp < 4000 && st.r > 800, `T=${st.temp}, R=${st.r}`);
  });

  test('Спика в стартовом возрасте ещё горячая B-звезда', () => {
    const { star } = useStar('spica');
    const st = getInterpolatedState(catalogAge(star), { static: true });
    assert.ok(st.temp > 18000 && st.r < 15, `T=${st.temp}, R=${st.r}`);
  });

  test('Солнце сегодня: 1 R☉, 1 L☉, G2V-ish', () => {
    useStar('sun');
    const st = getInterpolatedState(4.6);
    assert.ok(Math.abs(st.r - 1) < 0.01 && Math.abs(st.l - 1) < 0.01);
    assert.match(getMKClass(st), /^G\dV$/);
    S.selectedStarMass = 1.0;
  });
});
