// Тесты треков MIST: интерполяция, сверка с солнечным треком, остатки, подбор возраста по наблюдениям
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { useStar, catalogAge } from './helpers.js';
import { MIST_TRACKS, interpolateMistTrack, buildMistStages } from '../src/model/mistTracks.js';
import { EVOLUTION_STAGES } from '../src/data/stages.js';
import { getInterpolatedState, getTrackMarks } from '../src/model/timeline.js';
import { getExpeditionSteps } from '../src/model/expeditions.js';
import { STAR_CATALOG } from '../src/data/catalog.js';
import { S } from '../src/state.js';

const rel = (a, b) => Math.abs(a - b) / Math.abs(b);

describe('Интерполяция треков', () => {
  test('В узлах сетки интерполяция возвращает сам трек MIST', () => {
    for (const tr of MIST_TRACKS.tracks.filter((_, i) => i % 5 === 0)) {
      const it = interpolateMistTrack(tr.m);
      assert.equal(it.points.length, tr.n, `M=${tr.m}`);
      for (let k = 0; k < tr.n; k += 7) assert.ok(Math.abs(it.points[k].logL - tr.L[k]) < 1e-9, `M=${tr.m}, k=${k}`);
    }
  });

  test('Между узлами величины лежат между соседними треками (на главной последовательности)', () => {
    const a = interpolateMistTrack(1.2), b = interpolateMistTrack(1.3), m = interpolateMistTrack(1.25);
    const k = MIST_TRACKS.eeps.indexOf(MIST_TRACKS.primary.ZAMS);
    const lo = Math.min(a.points[k].logL, b.points[k].logL), hi = Math.max(a.points[k].logL, b.points[k].logL);
    assert.ok(m.points[k].logL > lo && m.points[k].logL < hi);
  });

  test('Время до конца горения монотонно убывает с массой (0.3–100 M☉)', () => {
    let prev = Infinity;
    for (const m of [0.3, 0.5, 0.8, 1.2, 2, 3, 5, 8, 12, 20, 40, 100]) {
      useStar(m);
      const end = getTrackMarks().end;
      assert.ok(end < prev, `M=${m}: ${end} ≥ ${prev}`);
      prev = end;
    }
  });
});

describe('Сверка солнечного трека с MIST 1.0 M☉', () => {
  const sunNow = () => EVOLUTION_STAGES.find(s => s.t === 4.6);
  const mist = () => { S.selectedStarMass = 1.01; return buildMistStages(1.0); };

  test('Светимость ZAMS и сейчас — в пределах 15%', () => {
    const m = mist();
    const zams = m.find(s => s.eep === MIST_TRACKS.primary.ZAMS);
    assert.ok(rel(zams.l, EVOLUTION_STAGES.find(s => s.t === 0).l) < 0.15, `ZAMS: ${zams.l}`);
    // ближайшая к 4.6 млрд лет точка MIST
    const now = m.reduce((a, b) => (Math.abs(b.t - 4.6) < Math.abs(a.t - 4.6) ? b : a));
    assert.ok(rel(now.l, sunNow().l) < 0.15, `L(4.6) = ${now.l} при t=${now.t}`);
  });

  test('Вершина RGB: время в пределах 10%, светимость ~2000–3000 L☉ в обеих моделях', () => {
    const m = mist();
    const tipM = m.find(s => s.eep === MIST_TRACKS.primary.RGBTip);
    const tipS = EVOLUTION_STAGES.find(s => s.t === 12.18);
    assert.ok(rel(tipM.t, tipS.t) < 0.10, `t: MIST ${tipM.t}, ручной ${tipS.t}`);
    assert.ok(tipM.l > 2000 && tipM.l < 3000 && tipS.l > 2000 && tipS.l < 3000);
  });

  test('Масса белого карлика Солнца ≈ 0.54 M☉ в обеих моделях', () => {
    const m = mist();
    assert.ok(Math.abs(m[m.length - 1].mass - 0.54) < 0.02);
    assert.ok(Math.abs(EVOLUTION_STAGES[EVOLUTION_STAGES.length - 1].mass - 0.54) < 0.02);
  });
});

describe('Остатки', () => {
  test('Масса белого карлика растёт с начальной массой и не превышает 1.4 M☉', () => {
    let prev = 0;
    for (const m of [0.8, 1.0, 1.5, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0]) {
      const { stages } = useStar(m);
      const wd = stages[stages.length - 1];
      assert.ok(wd.r < 0.05, `M=${m}: не белый карлик`);
      assert.ok(wd.mass >= prev - 0.03 && wd.mass < 1.4, `M=${m}: ${wd.mass}`);
      prev = wd.mass;
    }
  });

  test('8–20 M☉: сверхновая и нейтронная звезда; ≥ 20 M☉: чёрная дыра без вспышки', () => {
    for (const m of [9, 12, 18]) {
      useStar(m);
      const mk = getTrackMarks();
      assert.ok(mk.sn > mk.end && mk.remnant > mk.sn, `M=${m}`);
      assert.match(S.currentDynamicStages.at(-1).spec, /Нейтрон|пульсар/i);
    }
    for (const m of [25, 60, 150]) {
      useStar(m);
      assert.equal(getTrackMarks().sn, undefined, `M=${m}`);
      const bh = S.currentDynamicStages.at(-1);
      assert.match(bh.spec, /Чёрная дыра/i);
      assert.ok(bh.mass > 3 && bh.mass < 30, `M=${m}: M_BH=${bh.mass}`);
    }
  });

  test('При солнечной металличности звёзды > 60 M☉ проходят стадию Вольфа — Райе', () => {
    const { stages } = useStar(100);
    assert.ok(stages.some(s => s.phase === 9), 'нет фазы WR');
  });
});

describe('Экспедиции и ключевые моменты', () => {
  for (const m of [0.2, 0.4, 2.5, 5, 11, 16.5, 30]) {
    test(`M=${m}: шаги тура идут по возрастанию времени`, () => {
      useStar(m);
      const steps = getExpeditionSteps();
      for (let i = 1; i < steps.length; i++) assert.ok(steps[i].t >= steps[i - 1].t, `${steps[i].title}`);
    });
  }

  test('Автотур без повторов: одна остановка на фазу', () => {
    useStar(2.5);
    const names = getExpeditionSteps().map(s => s.title.replace(/^\d+\.\s*/, ''));
    for (let i = 1; i < names.length; i++) assert.notEqual(names[i], names[i - 1]);
    assert.ok(names.length < 25, `${names.length} шагов`);
  });
});

describe('Возраст звёзд каталога по наблюдениям', () => {
  const close = (id, dT, dL) => {
    const star = STAR_CATALOG.find(s => s.id === id);
    useStar(id);
    const st = getInterpolatedState(catalogAge(star), { static: true });
    assert.ok(rel(st.temp, star.obs.T) < dT, `${id}: T ${st.temp.toFixed(0)} vs ${star.obs.T}`);
    assert.ok(rel(st.l, star.obs.L) < dL, `${id}: L ${st.l.toPrecision(3)} vs ${star.obs.L}`);
    return st;
  };

  test('Регул, Спика, Ригель, Фомальгаут ложатся на трек: T до 3%, L до 30%', () => {
    for (const id of ['regulus', 'spica', 'rigel', 'fomalhaut']) close(id, 0.03, 0.3);
  });

  test('Полярная звезда — в полосе нестабильности цефеид', () => {
    const st = close('polaris', 0.03, 0.3);
    assert.match(st.name, /цефеид/i);
  });

  test('Бетельгейзе — красный сверхгигант', () => {
    const st = close('betelgeuse', 0.05, 0.4);
    assert.ok(st.r > 500 && st.temp < 4000);
  });

  test('Ни одна звезда каталога не старше Вселенной', () => {
    for (const star of STAR_CATALOG.filter(s => s.obs)) {
      useStar(star.id);
      assert.ok(catalogAge(star) <= 13.8 + 1e-9, star.id);
    }
  });
});
