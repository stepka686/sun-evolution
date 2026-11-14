// Дрейф континентов: суша Земли (сетка 1°) двигается вместе с литосферными плитами.
// Каждая плита поворачивается вокруг своего полюса Эйлера; угол растёт линейно со временем от нуля (сегодня)
// до полного поворота к суперконтиненту. Опорные конфигурации:
//   −250 млн лет — Пангея (полюса подгонки берегов Атлантики Bullard et al. 1965 + схема Гондваны по PALEOMAP);
//   +250 млн лет — Пангея Ультима (Scotese): Атлантика закрывается, Африка упирается в Европу, Австралия — в Азию.
// Дальше в прошлое и будущее — цикл суперконтинентов с периодом ~500 млн лет (Колумбия, Родиния, Паннотия…),
// а в архее суши меньше: континентальная кора наращивалась постепенно. Это схема, точность — сотни километров.
import { LAND_RLE, PANGEA_EULER } from '../data/landGrid.js';

const T_NOW = 4.57;
const W = 360, H = 180;

// ---------- распаковка сетки ----------
let base = null;
function baseGrid() {
  if (base) return base;
  base = new Uint8Array(W * H);
  LAND_RLE.forEach((row, i) => {
    let j = 0;
    for (const tok of row.split(' ')) {
      const id = tok[0] === '.' ? 0 : parseInt(tok[0], 16);
      const n = parseInt(tok.slice(1), 10);
      base.fill(id, i * W + j, i * W + j + n);
      j += n;
    }
  });
  return base;
}

// ---------- повороты ----------
const D2R = Math.PI / 180;
const vec = (lat, lon) => [Math.cos(lat * D2R) * Math.cos(lon * D2R), Math.cos(lat * D2R) * Math.sin(lon * D2R), Math.sin(lat * D2R)];
function rotMatrix(axLat, axLon, angDeg) {
  const [x, y, z] = vec(axLat, axLon), a = angDeg * D2R, c = Math.cos(a), s = Math.sin(a), t = 1 - c;
  return [t * x * x + c, t * x * y - s * z, t * x * z + s * y, t * x * y + s * z, t * y * y + c, t * y * z - s * x, t * x * z - s * y, t * y * z + s * x, t * z * z + c];
}
const mulMV = (m, v) => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
// Минимальный поворот точки src → dst (для схемы будущего)
function moveEuler(src, dst) {
  const a = vec(...src), b = vec(...dst);
  const ax = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const s = Math.hypot(...ax), ang = Math.atan2(s, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / D2R;
  return s < 1e-9 ? [0, 0, 0] : [Math.asin(ax[2] / s) / D2R, Math.atan2(ax[1], ax[0]) / D2R, ang];
}
// Пангея Ультима: Америки снова к Африке и Европе (закрытие Атлантики), Африка — на север, Австралия — к Юго-Восточной Азии
const ULTIMA_EULER = {
  1: moveEuler([0, 20], [10, 22]), 7: moveEuler([0, 20], [10, 22]), 10: moveEuler([0, 20], [10, 22]),
  2: PANGEA_EULER['2'], 3: PANGEA_EULER['3'], 4: PANGEA_EULER['4'],
  8: moveEuler([-25, 134], [2, 118]), 9: moveEuler([-82, 40], [-66, 70])
};

/**
 * Фаза цикла суперконтинентов: 0 — разошлись (как сегодня), 1 — собраны.
 * Возвращает { f, set: 'pangea'|'ultima', spin } — доля поворота, набор полюсов и общий поворот (чтобы циклы не повторялись).
 */
export function tectonicPhase(t) {
  const ago = T_NOW - t;                      // млрд лет назад (< 0 — будущее)
  if (ago >= 0) {
    if (ago <= 0.25) return { f: ago / 0.25, set: 'pangea', spin: 0 };
    const k = (ago - 0.25) / 0.5;            // далее цикл ~500 млн лет: Паннотия, Родиния, Колумбия…
    return { f: 0.5 * (1 + Math.cos(2 * Math.PI * k)), set: 'pangea', spin: 70 * Math.floor(k + 0.5) };
  }
  const fut = -ago;
  if (fut <= 0.25) return { f: fut / 0.25, set: 'ultima', spin: 0 };
  const k = (fut - 0.25) / 0.5;
  return { f: 0.5 * (1 + Math.cos(2 * Math.PI * k)), set: 'ultima', spin: -60 * Math.floor(k + 0.5) };
}

// Доля нынешней континентальной коры: наращивание в архее (схематично по моделям роста коры, ~70% к 2.5 млрд лет назад)
export function crustFraction(t) {
  const ago = T_NOW - t;
  if (ago <= 1.5) return 1;
  return Math.max(0, Math.min(1, Math.pow(Math.max(0, 4.4 - ago) / 2.9, 0.7)));
}

const hash = (i) => { let x = (i * 374761393) ^ 0x5bd1e995; x = Math.imul(x ^ (x >>> 13), 1274126177); return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };

const cache = new Map();
/**
 * Сетка 360×180 номеров плит для возраста Солнца t (млрд лет). Кэш по шагу 2.5 млн лет.
 */
export function landGridAt(t) {
  const key = Math.round(t * 400);
  if (cache.has(key)) return cache.get(key);
  const g0 = baseGrid();
  const { f, set, spin } = tectonicPhase(t);
  const crust = crustFraction(t);
  if (f < 1e-6 && !spin && crust >= 1) { cache.set(key, g0); return g0; }   // сегодня — без поворотов
  const eul = set === 'pangea' ? PANGEA_EULER : ULTIMA_EULER;
  const mats = {};
  for (let p = 1; p <= 10; p++) {
    const e = eul[p] || eul[String(p)] || [0, 0, 0];
    const m = rotMatrix(e[0], e[1], e[2] * f);
    mats[p] = spin ? mulMatrices(rotMatrix(90, 0, spin), m) : m;
  }
  const out = new Uint8Array(W * H);
  for (let i = 0; i < H; i++) {
    const lat = 89.5 - i;
    for (let j = 0; j < W; j++) {
      const p = g0[i * W + j];
      if (!p) continue;
      // в архее — только часть коры: оставляем «ядра» континентов (крупные пятна по низкочастотному шуму)
      if (crust < 1 && hash(((i >> 3) * 97 + (j >> 3)) + p * 7919) * 0.7 + hash(i * W + j) * 0.3 > crust) continue;
      const v = mulMV(mats[p], vec(lat, j - 179.5));
      const la = Math.asin(Math.max(-1, Math.min(1, v[2]))) / D2R, lo = Math.atan2(v[1], v[0]) / D2R;
      const ii = Math.round(89.5 - la), jj = Math.round(lo + 179.5);
      // вблизи полюсов клетка шире по долготе — заполняем без дыр
      const span = Math.min(6, Math.ceil(1 / Math.max(0.17, Math.cos(la * D2R))));
      for (let di = 0; di <= 1; di++) {
        const r = Math.min(H - 1, Math.max(0, ii + di));
        for (let dj = 0; dj < span; dj++) out[r * W + (((jj + dj) % W) + W) % W] = p;
      }
    }
  }
  if (cache.size > 120) cache.clear();
  cache.set(key, out);
  return out;
}

function mulMatrices(a, b) {
  const r = new Array(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  return r;
}

export const LAND_W = W, LAND_H = H;

// Подпись эпохи для HUD
export function tectonicLabel(t) {
  const ago = T_NOW - t;
  if (Math.abs(ago) < 0.02) return 'современные континенты';
  if (ago > 0 && ago <= 0.3) return ago > 0.2 ? 'Пангея' : 'распад Пангеи';
  if (ago < 0 && ago >= -0.3) return ago < -0.2 ? 'Пангея Ультима' : 'Атлантика закрывается';
  const { f } = tectonicPhase(t);
  return f > 0.7 ? 'суперконтинент (схема цикла)' : f < 0.3 ? 'континенты разошлись (схема цикла)' : 'дрейф континентов (схема цикла)';
}
