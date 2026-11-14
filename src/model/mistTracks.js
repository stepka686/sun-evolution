// Эволюционные стадии из треков MIST: интерполяция по массе при фиксированной фазе (EEP),
// подписи фаз и достройка остатков (белый карлик / сверхновая + нейтронная звезда / чёрная дыра)
import { MIST_GRIDS } from '../data/mistTracks.js';
import { EVOLUTION_STAGES } from '../data/stages.js';
import { getMKClass } from '../physics/classification.js';
import { T_SUN_EFF, lumFromRT, wdMassFromInitial, wdRadius, wdCoolingAgeAtTemp } from '../physics/stellar.js';

// Сетка металличностей [Fe/H] и солнечная сетка (для совместимости и тестов)
export const FEH_GRID = MIST_GRIDS.feh;
export const FEH_MIN = FEH_GRID[0];
export const FEH_MAX = FEH_GRID[FEH_GRID.length - 1];
export const MIST_TRACKS = { eeps: MIST_GRIDS.eeps, primary: MIST_GRIDS.primary, tracks: MIST_GRIDS.grids[FEH_GRID.indexOf(0)] };
export const MIST_MIN_MASS = MIST_TRACKS.tracks[0].m;
export const MIST_MAX_MASS = MIST_TRACKS.tracks[MIST_TRACKS.tracks.length - 1].m;
const EEP = MIST_GRIDS.primary;

// Металличность → доля тяжёлых элементов: Z = Z☉·10^[Fe/H], Z☉ = 0.0142 (Asplund 2009, протосолнечная у MIST)
export const Z_SUN = 0.0142;
export const metalFraction = (feh) => Z_SUN * Math.pow(10, feh);
export const formatFeH = (feh) => `${feh >= 0 ? '+' : '−'}${Math.abs(feh).toFixed(2)}`;
export const clampFeH = (feh) => Math.max(FEH_MIN, Math.min(FEH_MAX, Number(feh) || 0));

// Начальные массы, разделяющие судьбу звезды (согласованы с остальным кодом симуляции)
export const CORE_COLLAPSE_MIN_MASS = 8.0;   // ниже — белый карлик
export const BLACK_HOLE_MIN_MASS = 20.0;     // выше — чёрная дыра (по MIST ядро He ≳ 6.5 M☉)

const FIELDS = [['logAge', 'a'], ['mass', 'M'], ['logL', 'L'], ['logT', 'T'], ['logR', 'R'], ['x', 'x'], ['y', 'y'], ['c', 'c'], ['o', 'o'], ['coreMass', 'hc']];

// ---------- 1. Интерполяция трека: по массе внутри сетки, затем по [Fe/H] ----------
// Обе интерполяции — при фиксированном EEP (одинаковой эволюционной фазе)
function interpolateByMass(tr, mass) {
  let i = 0;
  while (i < tr.length - 2 && tr[i + 1].m <= mass) i++;
  const lo = tr[i], hi = tr[i + 1];
  const w = Math.max(0, Math.min(1, (Math.log10(mass) - Math.log10(lo.m)) / (Math.log10(hi.m) - Math.log10(lo.m))));
  // Общая часть треков (при одинаковом EEP фазы совпадают); хвост берём у более близкого соседа
  const near = w < 0.5 ? lo : hi;
  const n = near.n, nCommon = Math.min(lo.n, hi.n);
  const mix = (key, k) => (k < nCommon ? (1 - w) * lo[key][k] + w * hi[key][k] : near[key][k]);
  const pts = [];
  for (let k = 0; k < n; k++) {
    const p = { eep: MIST_GRIDS.eeps[k], phase: near.p[k] };
    for (const [f, key] of FIELDS) p[f] = mix(key, k);
    if (k >= nCommon) p.mass *= mass / near.m;
    pts.push(p);
  }
  return { points: pts, heCoreEnd: (1 - w) * lo.heCoreEnd + w * hi.heCoreEnd, reachedWD: near.reachedWD };
}

export function interpolateMistTrack(m, feh = 0) {
  const mass = Math.max(MIST_MIN_MASS, Math.min(MIST_MAX_MASS, m));
  const z = clampFeH(feh);
  let j = 0;
  while (j < FEH_GRID.length - 2 && FEH_GRID[j + 1] <= z) j++;
  const w = (z - FEH_GRID[j]) / (FEH_GRID[j + 1] - FEH_GRID[j]);
  const A = interpolateByMass(MIST_GRIDS.grids[j], mass);
  if (w < 1e-9) return { mass, feh: z, ...A };
  const B = interpolateByMass(MIST_GRIDS.grids[j + 1], mass);
  if (w > 1 - 1e-9) return { mass, feh: z, ...B };
  const near = w < 0.5 ? A : B;
  const nCommon = Math.min(A.points.length, B.points.length);
  const pts = near.points.map((p, k) => {
    if (k >= nCommon) return { ...p };
    const q = { eep: p.eep, phase: p.phase };
    for (const [f] of FIELDS) q[f] = (1 - w) * A.points[k][f] + w * B.points[k][f];
    return q;
  });
  return { mass, feh: z, points: pts, heCoreEnd: (1 - w) * A.heCoreEnd + w * B.heCoreEnd, reachedWD: near.reachedWD };
}

// ---------- 2. Подписи фаз ----------
function describe(pt, m0, rTams) {
  const T = Math.pow(10, pt.logT), R = Math.pow(10, pt.logR);
  const low = m0 < 2.0, massive = m0 >= CORE_COLLAPSE_MIN_MASS;
  const e = pt.eep;
  if (pt.phase === 9) return { name: 'Звезда Вольфа — Райе', desc: 'Ветер сорвал водородную оболочку: обнажилось горячее гелиевое ядро, теряющее массу со скоростью ~10⁻⁵ M☉ в год.' };
  if (e < EEP.ZAMS) {
    if (massive) return { name: 'Массивная протозвезда', desc: 'Сжатие идёт так быстро, что звезда выходит на главную последовательность, ещё не сбросив кокон.' };
    return m0 < 2.0
      ? { name: 'Звезда типа T Тельца', desc: 'Гравитационное сжатие Кельвина — Гельмгольца; конвекция охватывает почти всю звезду, водород ещё не горит.' }
      : { name: 'Звезда Хербига Ae/Be', desc: 'Молодая горячая звезда, окружённая остатками протопланетного диска.' };
  }
  if (e <= EEP.TAMS && pt.phase <= 0) {
    const cycle = m0 < 1.3 ? 'протон-протонный цикл' : 'CNO-цикл в конвективном ядре';
    if (e === EEP.ZAMS) return { name: 'ZAMS: начало главной последовательности', desc: `В ядре зажёгся водород (${cycle}).` };
    if (pt.x > 0.05) return { name: 'Главная последовательность', desc: m0 < 0.35 ? 'Полностью конвективная звезда медленно перерабатывает водород во всём объёме.' : `Устойчивое горение водорода в ядре (${cycle}); светимость медленно растёт. Водорода в центре: ${Math.round(pt.x * 100)}%.` };
    return { name: 'Конец главной последовательности (TAMS)', desc: 'Водород в ядре почти исчерпан, горение переходит в слой вокруг гелиевого ядра.' };
  }
  if (e < EEP.RGBTip) {
    if (low) return Math.log10(R) < Math.log10(rTams) + 0.35
      ? { name: 'Ветвь субгигантов', desc: 'Слоевой источник водорода раздувает оболочку; ядро сжимается и становится вырожденным.' }
      : { name: 'Ветвь красных гигантов (RGB)', desc: 'Глубокая конвекция выносит продукты горения к поверхности; звезда раздувается в десятки раз.' };
    if (m0 > 3 && T > 5300 && T < 7000) return { name: 'Полоса нестабильности цефеид (первое пересечение)', desc: 'Пересекая щель Герцшпрунга, звезда попадает в полосу нестабильности: κ-механизм в зоне ионизации гелия раскачивает пульсации.' };
    return T > 5500
      ? { name: 'Пересечение щели Герцшпрунга', desc: 'Звезда стремительно расширяется и остывает — за тысячи лет проходит путь от голубого к красному гиганту.' }
      : { name: massive ? 'Красный сверхгигант' : 'Красный гигант', desc: 'Протяжённая конвективная оболочка; ядро сжимается до зажигания гелия.' };
  }
  if (e === EEP.RGBTip) return low
    ? { name: 'Вершина RGB: гелиевая вспышка', desc: 'Вырожденное гелиевое ядро разогревается до ~100 млн K, и гелий вспыхивает за считанные минуты.' }
    : { name: 'Зажигание гелия в ядре', desc: 'Невырожденное ядро плавно зажигает тройную гелиевую реакцию (3α → C, O).' };
  if (e <= EEP.TACHeB) {
    if (low) return { name: R < 15 ? 'Горизонтальная ветвь (красное сгущение)' : 'Горение гелия в ядре', desc: 'Гелий в ядре превращается в углерод и кислород, водород горит в оболочке; звезда снова компактнее.' };
    if (T > 9000) return { name: 'Голубая петля', desc: 'Во время горения гелия оболочка сжимается и разогревается — на диаграмме Г—Р звезда описывает петлю.' };
    if (T > 5300 && T < 7000) return { name: 'Полоса нестабильности цефеид', desc: 'Дважды ионизированный гелий работает как клапан (κ-механизм): звезда регулярно пульсирует.' };
    const kind = T < 4500 ? 'Красный' : (T < 7500 ? 'Жёлтый' : 'Белый');
    return { name: massive ? `${kind} сверхгигант: горение гелия` : `${kind} гигант: горение гелия`, desc: 'Гелий в ядре превращается в углерод и кислород, водород горит в оболочке.' };
  }
  if (massive) return { name: T < 4500 ? 'Красный сверхгигант: поздние стадии' : (T < 7500 ? 'Жёлтый сверхгигант: поздние стадии' : 'Голубой сверхгигант: поздние стадии'), desc: 'В ядре по очереди горят углерод, неон, кислород и кремний — «луковичное» строение; до коллапса считанные тысячи лет.' };
  if (e <= EEP.TPAGB) return { name: 'Ранняя асимптотическая ветвь (E-AGB)', desc: 'Гелий в ядре исчерпан: углеродно-кислородное ядро окружено двумя слоевыми источниками.' };
  if (e < EEP.postAGB) return { name: 'Термические пульсации AGB', desc: 'Вспышки гелиевого слоя и мощный суперветер сдувают оболочку; s-процесс рождает барий и свинец.' };
  if (T < 10000 && R > 10) return { name: 'Конец AGB: сброс оболочки', desc: 'Суперветер уносит последние десятые доли массы Солнца; под оболочкой обнажается горячее ядро.' };
  if (R > 0.3) return { name: 'Ядро планетарной туманности', desc: 'Оболочка сброшена; горячее ядро при почти постоянной светимости нагревается до 100 000 K и ионизирует туманность.' };
  return { name: 'Молодой горячий белый карлик', desc: 'Термоядерный синтез прекратился; вырожденное ядро размером с Землю остывает.' };
}

// ---------- 3. Цвета неба и грунта планет (шаблоны) ----------
const COLOR_KEYS = ['mercurySky', 'mercuryGround', 'venusSky', 'venusGround', 'earthSky', 'earthGround', 'marsSky', 'marsGround',
  'europaSky', 'europaGround', 'titanSky', 'titanGround', 'plutoSky', 'plutoGround'];
const pickColors = (s) => Object.fromEntries(COLOR_KEYS.map(k => [k, s[k]]));
const HOT_COLORS = {
  mercurySky: [12, 18, 35], mercuryGround: [85, 95, 115], venusSky: [220, 175, 90], venusGround: [165, 115, 65],
  earthSky: [160, 200, 255], earthGround: [100, 130, 175], marsSky: [140, 160, 220], marsGround: [90, 80, 70],
  europaSky: [50, 70, 140], europaGround: [140, 160, 190], titanSky: [120, 130, 160], titanGround: [60, 70, 80], plutoSky: [30, 40, 90], plutoGround: [70, 75, 90]
};
const RSG_COLORS = {
  mercurySky: [0, 0, 0], mercuryGround: [0, 0, 0], venusSky: [0, 0, 0], venusGround: [0, 0, 0],
  earthSky: [0, 0, 0], earthGround: [0, 0, 0], marsSky: [0, 0, 0], marsGround: [0, 0, 0],
  europaSky: [90, 50, 40], europaGround: [120, 45, 25], titanSky: [110, 60, 45], titanGround: [100, 40, 20], plutoSky: [80, 50, 40], plutoGround: [90, 55, 35]
};
function colorsFor(pt, t) {
  const T = Math.pow(10, pt.logT), R = Math.pow(10, pt.logR);
  if (t < 0) return pickColors(EVOLUTION_STAGES[1]);
  if (R < 0.05) return pickColors(EVOLUTION_STAGES[EVOLUTION_STAGES.length - 1]);
  if (R > 300) return RSG_COLORS;
  if (T > 9000) return HOT_COLORS;
  if (R > 100) return pickColors(EVOLUTION_STAGES[19]);
  if (R > 25) return pickColors(EVOLUTION_STAGES[15]);
  if (R > 6) return pickColors(EVOLUTION_STAGES[14]);
  if (R > 2) return pickColors(EVOLUTION_STAGES[13]);
  return pickColors(EVOLUTION_STAGES[pt.x > 0.2 ? 6 : 10]);
}

// ---------- 4. Стадии симуляции ----------
export function buildMistStages(m0, feh = 0) {
  const tr = interpolateMistTrack(m0, feh);
  const pts = tr.points;
  const kZams = pts.findIndex(p => p.eep === EEP.ZAMS);
  const ageZams = Math.pow(10, pts[kZams].logAge);
  const kTams = pts.findIndex(p => p.eep === EEP.TAMS);
  const rTams = Math.pow(10, pts[kTams >= 0 ? kTams : pts.length - 1].logR);
  const toGyr = (p) => (Math.pow(10, p.logAge) - ageZams) / 1e9;

  const stages = pts.map(p => {
    const t = toGyr(p);
    const info = describe(p, m0, rTams);
    const st = {
      t, r: Math.pow(10, p.logR), l: Math.pow(10, p.logL), temp: Math.pow(10, p.logT), mass: p.mass,
      h: p.x, he: p.y, c: p.c, o: p.o, phase: p.phase, eep: p.eep, coreMass: p.coreMass,
      name: info.name, desc: info.desc, ...colorsFor(p, t), source: 'MIST', feh: tr.feh
    };
    st.spec = getMKClass(st);
    return st;
  });

  // Ключевые моменты трека
  const at = (eep) => { const s = stages.find(x => x.eep === eep); return s ? s.t : null; };
  const last = stages[stages.length - 1];
  const tEnd = last.t;
  const marks = { zams: 0, tams: at(EEP.TAMS), rgbTip: at(EEP.RGBTip), end: tEnd };
  const agb = stages.filter(s => s.phase === 5);
  if (agb.length >= 2 && m0 < CORE_COLLAPSE_MIN_MASS) { marks.agbStart = agb[0].t; marks.agbEnd = agb[agb.length - 1].t; }
  const giant = stages.find(s => s.t > 0 && s.r > 20);
  marks.massLossStart = giant ? giant.t : tEnd;

  const extra = [];
  const base = { h: 0, he: 0, c: 0.5, o: 0.5, source: 'remnant' };
  const remnantColors = pickColors(EVOLUTION_STAGES[EVOLUTION_STAGES.length - 1]);

  if (m0 >= CORE_COLLAPSE_MIN_MASS) {
    // Коллапс ядра: момент «конца» трека MIST — горение углерода; до коллапса остаются тысячи лет
    const dt = Math.max(1e-7, tEnd * 0.002);
    if (m0 < BLACK_HOLE_MIN_MASS) {
      marks.sn = tEnd + dt;
      marks.remnant = tEnd * 1.05;
      extra.push({ ...base, ...RSG_COLORS, t: marks.sn, r: 1200, l: 1.5e9, temp: 35000, mass: 1.4, noSB: true,
        europaSky: [255, 255, 255], europaGround: [255, 255, 255], titanSky: [240, 245, 255], titanGround: [240, 245, 255], plutoSky: [220, 235, 255], plutoGround: [230, 245, 255],
        spec: 'Вспышка Сверхновой II (Пик)', name: 'Сверхновая II типа',
        desc: 'Железное ядро коллапсирует за доли секунды; нейтринная ударная волна сбрасывает оболочку со скоростью ~10 000 км/с.' });
      extra.push({ ...base, ...remnantColors, t: marks.remnant, r: 1.72e-5, temp: 1e6, mass: 1.4,
        spec: 'Радиопульсар (Нейтронная звезда)', name: 'Нейтронная звезда (пульсар)',
        desc: 'Остаток диаметром ~24 км и массой ~1.4 M☉, плотность ~10¹⁴ г/см³; быстрое вращение и сильное поле делают его пульсаром.' });
    } else {
      // Чёрная дыра: масса ≈ гелиевое ядро (оболочка при неудачном взрыве слабо связана и уходит)
      const mBH = Math.min(last.mass, Math.max(3, tr.heCoreEnd));
      marks.collapse = tEnd + dt;
      marks.remnant = tEnd * 1.05;
      extra.push({ ...base, ...remnantColors, t: marks.remnant, r: 4.24e-6 * mBH, l: 0, temp: 10, mass: mBH, noSB: true,
        spec: 'Звёздная Чёрная дыра (Stellar Black Hole)', name: 'Звёздная чёрная дыра',
        desc: `Ядро коллапсировало напрямую в чёрную дыру массой ~${mBH.toFixed(1)} M☉; радиус горизонта ~${(2.95 * mBH).toFixed(0)} км.` });
    }
  } else if (m0 < 0.5 && !tr.reachedWD) {
    // Красный карлик: MIST заканчивается концом ГП; дальше — сжатие в гелиевый белый карлик
    const rWD = wdRadius(m0);
    marks.remnant = tEnd * 1.05;
    extra.push({ ...base, ...remnantColors, h: 0, he: 0.98, c: 0.01, o: 0.01, t: marks.remnant, r: rWD, temp: 7500, mass: m0,
      spec: 'Гелиевый белый карлик', name: 'Гелиевый белый карлик',
      desc: 'Без стадии красного гиганта звезда сжалась в компактный гелиевый белый карлик.' });
  } else {
    // Белый карлик: если MIST довёл трек до остывающего карлика — масса из модели, иначе по IFMR (Cummings 2018)
    const mWD = tr.reachedWD ? last.mass : wdMassFromInitial(m0);
    const rWD = wdRadius(mWD);
    if (!tr.reachedWD) {
      // Трек оборвался на AGB / гелиевой вспышке — добавляем ядро планетарной туманности
      const lPN = Math.max(500, 59250 * (mWD - 0.495));
      const tPN = tEnd + Math.max(1e-6, tEnd * 0.001);
      extra.push({ ...base, ...remnantColors, t: tPN, temp: 60000, r: Math.sqrt(lPN) / Math.pow(60000 / T_SUN_EFF, 2), l: lPN, mass: mWD,
        name: 'Ядро планетарной туманности', desc: 'Оболочка сброшена; горячее ядро ионизирует расширяющуюся туманность.' });
    }
    const tLast = extra.length ? extra[extra.length - 1].t : tEnd;
    const tStart = tr.reachedWD ? last.temp : 60000;
    marks.remnant = tLast + Math.max(0.05, wdCoolingAgeAtTemp(11000) - wdCoolingAgeAtTemp(tStart));
    extra.push({ ...base, ...remnantColors, c: 0.7, o: 0.29, he: 0.01, t: marks.remnant, r: rWD, temp: 11000, mass: mWD,
      name: 'Углеродно-кислородный белый карлик', desc: `Вырожденный остаток массой ${mWD.toFixed(2)} M☉ размером с Землю; плотность ~1 т/см³. Остывает миллиарды лет.` });
  }

  for (const s of extra) {
    if (!s.noSB && s.l === undefined) s.l = lumFromRT(s.r, s.temp);
    if (!s.spec) s.spec = getMKClass(s);
  }
  const all = stages.concat(extra);
  all.marks = marks;
  return all;
}
