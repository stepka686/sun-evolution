// 5.3.1: режим «Глаз / Камера» и лупа с эталоном — Солнцем с Земли
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SUN_FROM_EARTH, fmtAngle, loupeScale } from '../src/render/loupe.js';

const src = (f) => readFileSync(new URL('../src/' + f, import.meta.url), 'utf8');

describe('5.3.1: лупа', () => {
  test('Эталон — Солнце с Земли, 0.533°', () => {
    assert.ok(Math.abs(2 * SUN_FROM_EARTH * 180 / Math.PI - 0.533) < 0.001);
  });
  test('Больший диск вписывается в лупу, отношение радиусов сохраняется', () => {
    const giant = loupeScale(SUN_FROM_EARTH * 20, SUN_FROM_EARTH, 40);
    assert.ok(Math.abs(giant.rStar - 40) < 1e-9 && Math.abs(giant.rRef - 2) < 1e-9);
    const dwarf = loupeScale(SUN_FROM_EARTH / 4, SUN_FROM_EARTH, 40);
    assert.ok(Math.abs(dwarf.rRef - 40) < 1e-9 && Math.abs(dwarf.rStar - 10) < 1e-9);
  });
  test('Подписи углов: градусы, минуты, секунды', () => {
    assert.equal(fmtAngle(SUN_FROM_EARTH), '32.0′');
    assert.equal(fmtAngle(2 * Math.PI / 180), '4.00°');
    assert.ok(fmtAngle(0.05 / 3600 * Math.PI / 180).endsWith('″'));
  });
});

describe('5.3.1: режим «Камера»', () => {
  test('Убирает блик в глазу, сумеречное зрение и задержку адаптации; кнопка в панели', () => {
    const s = src('render/surface.js');
    for (const k of ["S.perception === 'camera'", 'if (!cam) drawGlare(', 'const nightVis = cam ? 0 :', 'adapt.E && !cam ?', 'drawStarLoupe(']) assert.ok(s.includes(k), k);
    assert.ok(src('index.html').includes('id="perceptionBtn"') && src('ui/controls.js').includes("S.perception = S.perception === 'camera'"));
  });
});
