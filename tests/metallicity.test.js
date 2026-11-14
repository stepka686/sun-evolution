// Тесты металличности: сетка MIST по [Fe/H], интерполяция, физические тренды, подгонка возрастов звёзд каталога
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { useStar, sbLum } from './helpers.js';
import { S } from '../src/state.js';
import { STAR_CATALOG } from '../src/data/catalog.js';
import { FEH_GRID, MIST_TRACKS, interpolateMistTrack, metalFraction, clampFeH } from '../src/model/mistTracks.js';
import { EVOLUTION_STAGES } from '../src/data/stages.js';
import { fitAgeToObservation } from '../src/model/timeline.js';
import { getRunawayOnset } from '../src/physics/climate.js';

const kZAMS = MIST_TRACKS.eeps.indexOf(MIST_TRACKS.primary.ZAMS);
const kTAMS = MIST_TRACKS.eeps.indexOf(MIST_TRACKS.primary.TAMS);
const msLife = (m, feh) => { const p = interpolateMistTrack(m, feh).points; return (10 ** p[kTAMS].logAge - 10 ** p[kZAMS].logAge) / 1e9; };

describe('Сетка по металличности', () => {
  test('В узлах сетки интерполяция возвращает трек MIST без искажений', () => {
    for (const f of FEH_GRID) {
      const a = interpolateMistTrack(1.5, f), b = interpolateMistTrack(1.5, f + 1e-12);
      assert.equal(a.points.length, b.points.length);
      assert.ok(Math.abs(a.points[kZAMS].logT - b.points[kZAMS].logT) < 1e-9);
    }
  });

  test('Между узлами [Fe/H] трек лежит между соседними', () => {
    for (const m of [0.3, 1.2, 5, 30]) {
      const lo = interpolateMistTrack(m, -1).points[kZAMS].logT, hi = interpolateMistTrack(m, -0.5).points[kZAMS].logT;
      const mid = interpolateMistTrack(m, -0.75).points[kZAMS].logT;
      assert.ok(mid >= Math.min(lo, hi) - 1e-9 && mid <= Math.max(lo, hi) + 1e-9, `m=${m}`);
    }
  });

  test('Z = Z☉·10^[Fe/H]; металличность ограничена сеткой MIST', () => {
    assert.ok(Math.abs(metalFraction(0) - 0.0142) < 1e-12);
    assert.ok(Math.abs(metalFraction(-1) - 0.00142) < 1e-12);
    assert.equal(clampFeH(-5), FEH_GRID[0]);
    assert.equal(clampFeH(3), FEH_GRID[FEH_GRID.length - 1]);
  });
});

describe('Физика металличности', () => {
  test('Бедная металлами звезда горячее и ярче на ZAMS (меньше непрозрачность)', () => {
    for (const m of [0.5, 1.0, 2.0]) {
      let prevT = Infinity, prevL = Infinity;
      for (const f of FEH_GRID) {
        const p = interpolateMistTrack(m, f).points[kZAMS];
        assert.ok(p.logT < prevT && p.logL < prevL, `m=${m}, [Fe/H]=${f}`);
        prevT = p.logT; prevL = p.logL;
      }
    }
  });

  test('…и поэтому быстрее сжигает водород: время жизни на ГП растёт с [Fe/H]', () => {
    for (const m of [0.8, 1.0, 1.5]) {
      let prev = 0;
      for (const f of FEH_GRID) { const t = msLife(m, f); assert.ok(t > prev, `m=${m}, [Fe/H]=${f}`); prev = t; }
    }
    // 1 M☉: от ~5 млрд лет при [Fe/H] = −2 до ~13 при +0.5
    assert.ok(msLife(1, -2) < 6 && msLife(1, 0.5) > 12);
  });

  test('Слабый ветер при низкой металличности оставляет более тяжёлую чёрную дыру', () => {
    const bh = (f) => { const { stages } = useStar(40, f); return stages[stages.length - 1].mass; };
    assert.ok(bh(-2) > bh(-1) && bh(-1) > bh(0), `${bh(-2)} ${bh(-1)} ${bh(0)}`);
  });

  test('Закон Стефана — Больцмана на всех стадиях для крайних металличностей', () => {
    for (const f of [-2, 0.5]) for (const m of [0.3, 1.0, 3, 15]) {
      const { stages } = useStar(m, f);
      for (const s of stages.filter(x => x.source === 'MIST')) {
        assert.ok(Math.abs(Math.log10(sbLum(s) / s.l)) < 0.01, `m=${m}, [Fe/H]=${f}, t=${s.t}`);
      }
    }
  });

  test('Солнце остаётся на собственном треке, а его «двойник» с другим [Fe/H] — на MIST', () => {
    assert.equal(useStar('sun').stages, EVOLUTION_STAGES);
    assert.equal(useStar(1.0, -0.5).stages[10].source, 'MIST');
  });

  test('Земля у бедного металлами двойника Солнца выкипает намного раньше, у богатого — позже', () => {
    useStar(1.0, -0.5); const poor = getRunawayOnset('earth');
    useStar('sun'); const sun = getRunawayOnset('earth');
    useStar(1.0, 0.5); const rich = getRunawayOnset('earth');
    assert.ok(poor < 1 && sun > 5.5 && rich > sun, `${poor} ${sun} ${rich}`);
  });
});

describe('Звёзды каталога', () => {
  test('Металличность улучшает согласие трека с наблюдениями у звёзд солнечного типа и гигантов', () => {
    for (const id of ['alpha_cen_a', '51_peg', 'tau_ceti', 'arcturus', 'aldebaran']) {
      const star = STAR_CATALOG.find(s => s.id === id);
      useStar(star.mass, 0);
      const solar = fitAgeToObservation(star.obs.T, star.obs.L, star.startAge).chi2;
      useStar(id);
      assert.equal(S.selectedFeH, star.feh);
      const own = fitAgeToObservation(star.obs.T, star.obs.L, star.startAge).chi2;
      assert.ok(own < solar, `${id}: χ² ${own.toFixed(2)} ≥ ${solar.toFixed(2)}`);
    }
  });

  test('Возраст α Центавра A сходится с литературным (~5.3 млрд лет), солнечный трек давал 1.7', () => {
    useStar('alpha_cen_a');
    const star = STAR_CATALOG.find(s => s.id === 'alpha_cen_a');
    const fit = fitAgeToObservation(star.obs.T, star.obs.L, star.startAge);
    assert.ok(Math.abs(fit.t - 5.3) < 0.5, `${fit.t}`);
  });
});
