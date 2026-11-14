// Текстуры планет в равнопромежуточной проекции (долгота × широта), из которых сфера берёт цвет каждой точки.
// Земля — карта континентов эпохи (model/continents.js) + климат: пояса растительности и пустынь, лёд по широте,
// высохшие океанские впадины, лава. Остальные миры — процедурно (шум на сфере, без шва на линии перемены дат).
import { LAND_H, LAND_W, landGridAt } from '../model/continents.js';
import { getCustomExo } from '../model/exoplanets.js';

export const TEX_W = 512, TEX_H = 256;
const D2R = Math.PI / 180;

// ---------- шум на сфере ----------
const hash3 = (x, y, z) => { let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 2147483647); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  let r = 0;
  for (let dz = 0; dz < 2; dz++) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
    r += hash3(xi + dx, yi + dy, zi + dz) * (dx ? u : 1 - u) * (dy ? v : 1 - v) * (dz ? w : 1 - w);
  }
  return r;
}
export function fbm(x, y, z, oct = 4, seed = 0) {
  let a = 0.5, f = 1, s = 0;
  for (let o = 0; o < oct; o++) { s += a * vnoise(x * f + seed, y * f + seed * 1.7, z * f - seed); a *= 0.5; f *= 2.03; }
  return s / (1 - Math.pow(0.5, oct));
}

// единичные векторы для каждой точки текстуры (кэш)
let dirs = null;
function texDirs() {
  if (dirs) return dirs;
  dirs = new Float32Array(TEX_W * TEX_H * 3);
  for (let j = 0; j < TEX_H; j++) {
    const lat = (0.5 - (j + 0.5) / TEX_H) * Math.PI;
    for (let i = 0; i < TEX_W; i++) {
      const lon = ((i + 0.5) / TEX_W) * 2 * Math.PI - Math.PI, k = (j * TEX_W + i) * 3;
      dirs[k] = Math.cos(lat) * Math.cos(lon); dirs[k + 1] = Math.cos(lat) * Math.sin(lon); dirs[k + 2] = Math.sin(lat);
    }
  }
  return dirs;
}

// Поля шума от времени не зависят — считаются один раз на всю сессию (≈ 0.1 с), а перестройка текстуры
// при смене эпохи — только смешивание цветов
const fields = new Map();
function field(name, fn) {
  if (fields.has(name)) return fields.get(name);
  const D = texDirs(), out = new Float32Array(TEX_W * TEX_H);
  for (let k = 0; k < out.length; k++) out[k] = fn(D[k * 3], D[k * 3 + 1], D[k * 3 + 2]);
  fields.set(name, out);
  return out;
}
const F_MAIN = (x, y, z) => fbm(x * 3 + 5, y * 3, z * 3, 5, 1.3);
const F_FINE = (x, y, z) => fbm(x * 9, y * 9, z * 9, 2, 4);
const F_DARK = (x, y, z) => fbm(x * 2.2, y * 2.2, z * 2.2, 4, 3.1);
const F_CRATER = (x, y, z) => fbm(x * 9, y * 9, z * 9, 3, 7.7);
const F_CRACK = (x, y, z) => fbm(x * 6, y * 6, z * 6, 3, 2.2);
const F_CLOUD = (x, y, z) => fbm(x * 3.5, y * 3.5, z * 9, 5, 11);

const mix = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Суша с гладкими берегами: билинейная интерполяция маски 1° и порог 0.5
function landAt(grid, u, v) {
  const x = u * LAND_W - 0.5, y = v * LAND_H - 0.5;
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const g = (xx, yy) => (grid[Math.min(LAND_H - 1, Math.max(0, yy)) * LAND_W + ((xx % LAND_W) + LAND_W) % LAND_W] ? 1 : 0);
  return (g(x0, y0) * (1 - fx) + g(x0 + 1, y0) * fx) * (1 - fy) + (g(x0, y0 + 1) * (1 - fx) + g(x0 + 1, y0 + 1) * fx) * fy;
}

/**
 * Строит текстуры { color: Uint8ClampedArray RGB, ocean: Uint8Array (1 — вода/зеркальный блик), lights: Uint8Array (огни/свечение 0…255) }.
 * look — внешний вид из render/planetLook.js.
 */
export function buildPlanetTexture(planet, look, t, opts = {}) {
  const N = TEX_W * TEX_H;
  const color = new Uint8ClampedArray(N * 3), ocean = new Uint8Array(N), lights = new Uint8Array(N);
  const D = texDirs();
  const exo = getCustomExo(planet);
  const type = exo ? exo.type : planet;
  const iceSin = look.iceLat;                       // синус широты края льда
  const grid = planet === 'earth' && opts.realEarth ? landGridAt(t) : null;
  const NM = field('main', F_MAIN);
  const NF = type === 'earth' || type === 'super_earth' || type === 'ocean_world' ? field('fine', F_FINE) : null;
  const ND = type === 'mars' ? field('dark', F_DARK) : null;
  const NC = type === 'mercury' || type === 'chthonian' ? field('crater', F_CRATER) : null;
  const NK = look.glow > 0.05 ? field('crack', F_CRACK) : null;
  const dryBasin = [118, 96, 82], deepSea = look.ocean, shelf = mix(look.ocean, [70, 160, 190], 0.45);
  for (let j = 0; j < TEX_H; j++) {
    const v = (j + 0.5) / TEX_H, lat = (0.5 - v) * 180, alat = Math.abs(lat), slat = Math.abs(Math.sin(lat * D2R));
    for (let i = 0; i < TEX_W; i++) {
      const k = j * TEX_W + i, x = D[k * 3], y = D[k * 3 + 1], z = D[k * 3 + 2];
      let c, isOcean = 0, light = 0;
      const n = NM[k];
      if (type === 'earth' || type === 'super_earth' || type === 'ocean_world') {
        // суша: реальная карта эпохи (Земля у Солнца) или процедурные континенты с заданной долей океана
        let landV;
        if (grid) landV = landAt(grid, (i + 0.5) / TEX_W, v) + (n - 0.5) * 0.35;
        else landV = n - 0.5 + (0.5 - Math.max(0.02, look.oceanCoverage || (type === 'ocean_world' ? 0.95 : 0.3))) * 0.6 + 0.5;
        const isLand = landV > 0.5;
        if (isLand) {
          // пояса: влажные тропики, пустыни субтропиков (~15–32°), умеренный пояс, тундра
          // пустыни субтропиков — неоднородно (внутренние районы суше, у побережий влажнее)
          const desert = sstep(10, 18, alat) * (1 - sstep(30, 38, alat)) * sstep(0.35, 0.6, NF[k] * 0.6 + n * 0.6);
          const veg = look.vegetation * (1 - desert * 0.85) * (1 - sstep(55, 68, alat));
          const rock = mix(look.land, [205, 175, 120], desert * 0.8);
          c = mix(rock, alat < 12 ? [30, 95, 40] : [70, 120, 55], veg);
          c = mix(c, [150, 130, 105], (n - 0.5) * 0.5 + 0.1);
          // огни городов — только в эпоху цивилизации, на суше умеренных и тропических широт
          // кластеры: города вдоль побережий и в умеренном поясе, пустыни и тундра — тёмные
          const pop = sstep(0.55, 0.75, NF[k]) * (1 - desert) * (1 - sstep(50, 62, alat));
          if (opts.cities && hash3(i, j, 7) < pop * 0.35) light = 120 + (hash3(i, j, 9) * 135) | 0;
        } else if (look.oceanCoverage > 0.02 || look.frozenOcean) {
          const depth = sstep(0.5, 0.15, landV);
          c = mix(shelf, deepSea, depth); isOcean = 1;
        } else {
          c = mix(dryBasin, look.land, 0.3 + (n - 0.5) * 0.4);   // высохшие океанские впадины
        }
      } else if (type === 'mars') {
        const dark = sstep(0.52, 0.6, ND[k]);
        c = mix([196, 102, 58], [110, 62, 40], dark * 0.8);
        c = mix(c, [150, 90, 60], (n - 0.5) * 0.6);
        // северные низменности могли быть океаном в «марсианском оптимуме» (Oceanus Borealis)
        if (look.oceanCoverage > 0.05 && lat > 25 + (n - 0.5) * 30) { c = mix([40, 80, 140], [25, 55, 110], n); isOcean = 1; }
      } else if (type === 'mercury' || type === 'chthonian') {
        const crater = Math.pow(Math.max(0, NC[k] - 0.55) * 2.4, 2);
        c = mix([128, 122, 118], [190, 185, 178], crater);
        c = mix(c, [90, 86, 84], (n - 0.5) * 0.7);
      } else if (type === 'europa') {
        c = mix([228, 220, 205], [205, 190, 165], n);
        const lin = Math.abs(Math.sin((x * 9 + y * 4) * 3 + n * 6)) < 0.12 || Math.abs(Math.sin((y * 7 - z * 5) * 3 + n * 4)) < 0.1 || Math.abs(Math.sin((z * 8 + x * 3) * 4 + n * 9)) < 0.08;
        if (lin) c = [150, 95, 60];                                   // красно-бурые линеи (соли из подлёдного океана)
      } else if (type === 'pluto') {
        // «сердце» Плутона — азотная равнина Спутника
        const heart = Math.hypot(lat - 20, ((((i / TEX_W) * 360 + 180) % 360) - 180) - 0) < 22;
        c = heart ? [240, 232, 222] : mix([175, 120, 85], [215, 190, 160], n);
      } else if (type === 'uranus' || type === 'neptune' || type === 'hot_jupiter') {
        const band = Math.sin(lat * (type === 'hot_jupiter' ? 0.35 : 0.2) + n * 1.5);
        const base = type === 'uranus' ? [160, 220, 230] : type === 'neptune' ? [60, 110, 220] : [205, 110, 55];
        c = mix(base, base.map(q => q * 0.82), 0.5 + 0.5 * band);
        if (type === 'neptune' && Math.hypot(lat + 20, (i / TEX_W) * 360 - 120) < 9) c = [30, 50, 120];   // Большое тёмное пятно
      } else {
        c = mix(look.land, look.land.map(q => q * 0.75 + 40), n);   // ледяные карлики: Эрида, Хаумеа, Макемаке…
      }
      // лёд по широте (морской и материковый); в «снежке» — всюду
      if (iceSin < 0.999 && slat > iceSin + (n - 0.5) * 0.08 && type !== 'uranus' && type !== 'neptune' && type !== 'hot_jupiter') {
        c = mix(c, [236, 242, 248], 0.92); isOcean = 0;
      }
      // раскалённая поверхность: светящиеся трещины лавы на ночной стороне
      if (look.glow > 0.05) {
        const crack = 1 - Math.abs(NK[k] - 0.5) * 8;
        if (crack > 0) light = Math.max(light, Math.min(255, crack * 255 * look.glow)) | 0;
        c = mix(c, [60, 35, 30], look.glow * 0.6);
      }
      color[k * 3] = c[0]; color[k * 3 + 1] = c[1]; color[k * 3 + 2] = c[2];
      ocean[k] = isOcean; lights[k] = light;
    }
  }
  return { color, ocean, lights, lava: look.glow > 0.05 };
}

/** Облака: плотность 0…255 (зональные пояса — экваториальный и штормовые на ~50°; у сплошных — почти везде) */
export function buildCloudTexture(look, seed = 0) {
  const N = TEX_W * TEX_H, out = new Uint8Array(N);
  const cover = look.cloudCover;
  if (cover < 0.02) return out;
  const NCl = field('cloud', F_CLOUD);
  for (let j = 0; j < TEX_H; j++) {
    const lat = (0.5 - (j + 0.5) / TEX_H) * 180, alat = Math.abs(lat);
    const belt = cover > 0.85 ? 1 : 0.55 + 0.45 * Math.max(Math.exp(-(alat * alat) / 60), Math.exp(-((alat - 52) ** 2) / 120)) - 0.25 * Math.exp(-((alat - 25) ** 2) / 60);
    for (let i = 0; i < TEX_W; i++) {
      const k = j * TEX_W + i;
      // облака вытянуты по долготе: шум растянут вдоль параллелей
      const n = NCl[(k + seed * 97) % N];
      const thr = 1 - Math.min(0.98, cover * 1.15 * belt);
      out[k] = Math.max(0, Math.min(255, (n - thr) / 0.12 * 255)) | 0;
    }
  }
  return out;
}
