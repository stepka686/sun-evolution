// Выгружает солнечный трек и результаты JS-интегратора в JSON для независимой проверки на Python:
//   node tools/orbits/dump_sun_track.mjs > tools/orbits/sun_track.json
import { EVOLUTION_STAGES } from '../../src/data/stages.js';
import { S } from '../../src/state.js';
import { integrateOrbit, PLANET_MASS_EARTH } from '../../src/physics/tides.js';

S.selectedStarMass = 1.0;
const planets = { mercury: 0.387, venus: 0.723, earth: 1.0, mars: 1.524, jupiter: 5.204 };
const jsFates = {};
for (const k of [0.3, 1, 3]) {
  jsFates[k] = {};
  for (const [p, a0] of Object.entries(planets)) {
    const o = integrateOrbit(EVOLUTION_STAGES, a0, PLANET_MASS_EARTH[p], { birthMass: 1.0, tideFactor: k });
    jsFates[k][p] = { type: o.fate.type, t: Number.isFinite(o.fate.t) ? o.fate.t : null, aFinal: o.a[o.a.length - 1] };
  }
}
const stages = EVOLUTION_STAGES.map(s => ({ t: s.t, r: s.r, l: s.l, temp: s.temp, mass: s.mass }));
console.log(JSON.stringify({ stages, planets, planetMassEarth: PLANET_MASS_EARTH, jsFates }));
