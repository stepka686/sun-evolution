// Выгружает температуру Земли по времени и бифуркационный скан модели в JSON для ebm.py
import { S } from '../../src/state.js';
import { useStar } from '../../tests/helpers.js';
import * as E from '../../src/physics/energyBalance.js';
import { calculateSurfaceTemp, getRunawayOnset } from '../../src/physics/climate.js';
import { getInterpolatedState } from '../../src/model/timeline.js';
import { earthEpochAt } from '../../src/data/earthHistory.js';

useStar('sun');
const history = [];
for (let t = 0.02; t <= 12.0; t += 0.01) {
  const st = getInterpolatedState(t, { static: true });
  const r = calculateSurfaceTemp('earth', st);
  history.push({ t: +t.toFixed(3), T: r.avg, climate: r.climate, co2: earthEpochAt(t).co2ppm });
}
const params = { A: E.A_OLR_CALIBRATED, B: E.B_OLR, OLR_LIM: E.OLR_LIM, S0: E.S_EARTH, dF_modern: E.greenhouseForcing({ co2ppm: 420, ch4ppm: 1.9, pBar: 1.013 }) };
console.log(JSON.stringify({ params, runaway: getRunawayOnset('earth'), history }));
