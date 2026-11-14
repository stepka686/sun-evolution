// Диск звезды на GPU (5.0): потемнение к краю по Эддингтону и грануляция как настоящая ячеистая конвекция.
//   I(μ)/I(1) = (2 + 3μ)/5, цвет края — от более холодного слоя T(μ) = T_eff·[¾(μ + ⅔)]^¼ (цвета приходят из CIE-модели)
//   грануляция — клеточный шум Ворони на сфере: яркие горячие центры, тёмные межгранульные «реки» опускающегося газа;
//   размер ячейки — та же оценка ~10 шкал высот фотосферы, что в 2D; ячейки живут (шум медленно меняется) и вращаются
//   с звездой; у края сжаты перспективой сами собой, потому что шум задан на сфере
import { makeLayerCache, layerFresh, layerStore, drawQuad, getGL, glCanvas, glResize, program } from './glcore.js';

const FS = `
precision highp float;
varying vec2 vUv;
uniform vec3 uStops[8];
uniform float uRadii[8];
uniform float uCells, uContrast, uTime, uRot, uPx;
vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}
// расстояние до ближайшего и второго центра ячеек (Ворони)
float cellId = 0.0;
vec2 worley(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  float d1 = 9.0, d2 = 9.0;
  for (int a = -1; a <= 1; a++) for (int b = -1; b <= 1; b++) for (int c = -1; c <= 1; c++) {
    vec3 g = vec3(float(a), float(b), float(c));
    vec3 o = hash33(i + g);
    o = 0.5 + 0.42 * sin(uTime * 0.6 + 6.2831 * o);      // центры гранул медленно блуждают — ячейки рождаются и тают
    vec3 r = g + o - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; cellId = hash33(i + g + 7.1).x; } else if (d < d2) d2 = d;
  }
  return sqrt(vec2(d1, d2));
}
vec3 limb(float r) {
  vec3 c = uStops[0];
  for (int i = 1; i < 8; i++) {
    if (r <= uRadii[i]) { float t = (r - uRadii[i - 1]) / max(1e-4, uRadii[i] - uRadii[i - 1]); return mix(uStops[i - 1], uStops[i], clamp(t, 0.0, 1.0)); }
    c = uStops[i];
  }
  return c;
}
void main() {
  vec2 p = vUv * 2.0 - 1.0; p.y = -p.y;
  float r = length(p);
  if (r > 1.0) { gl_FragColor = vec4(0.0); return; }
  vec3 col = limb(r);
  if (uContrast > 0.0) {
    float z = sqrt(max(0.0, 1.0 - r * r));
    float cr = cos(uRot), sr = sin(uRot);
    vec3 n = vec3(p.x * cr + z * sr, p.y, -p.x * sr + z * cr);
    // лёгкое искажение координат — ячейки неправильной формы, как настоящие гранулы
    vec3 q = n * uCells;
    q += 0.3 * sin(q.yzx * 1.3 + uTime * 0.2) + 0.15 * sin(q.zxy * 3.1 - uTime * 0.13);
    vec2 w = worley(q);
    float lane = smoothstep(0.0, 0.32, w.y - w.x);         // тёмные межгранульные промежутки (опускающийся газ)
    float center = 1.0 - smoothstep(0.0, 0.9, w.x);         // горячий центр ячейки (поднимающийся газ)
    float bright = 0.55 + 0.9 * cellId;                     // у каждой ячейки своя температура
    float g = clamp(lane * (0.35 + 0.65 * center) * bright, 0.0, 1.4) * 2.0 - 1.0;
    col *= 1.0 + uContrast * g * (0.6 + 0.4 * z);
  }
  float edge = clamp((1.0 - r) / uPx, 0.0, 1.0);
  gl_FragColor = vec4(col * edge, edge);
}`;

let broken = false;
const lc = makeLayerCache();

/**
 * Рисует диск радиуса R (в текущей системе координат 2D-холста, центр в 0,0).
 * stops — [[r, [R,G,B 0…255]], …] (8 точек профиля потемнения), cellFrac — размер гранулы в долях радиуса.
 */
export function drawStarDiskGL(ctx, R, stops, cellFrac, now, rot) {
  const gl = broken ? null : getGL();
  if (!gl || stops.length !== 8) return false;
  try {
    const tr = ctx.getTransform();
    const scale = Math.hypot(tr.a, tr.b);
    const N = Math.max(16, Math.min(1024, Math.round(2 * R * scale)));
    // грануляция живёт минутами — 12 обновлений в секунду глазу неотличимы от 60
    const key = N + '|' + rot.toFixed(3) + '|' + cellFrac.toFixed(4) + '|' + stops.map(s => s[1].join(',')).join(';');
    const tNow = performance.now();
    if (layerFresh(lc, key, tNow, 83)) { ctx.drawImage(lc.canvas, 0, 0, N, N, -R, -R, 2 * R, 2 * R); return true; }
    glResize(N, N);
    const { p, uni } = program('star', FS);
    gl.useProgram(p);
    gl.disable(gl.BLEND);
    const flat = new Float32Array(24), rad = new Float32Array(8);
    stops.forEach(([rr, c], i) => { rad[i] = rr; flat[i * 3] = c[0] / 255; flat[i * 3 + 1] = c[1] / 255; flat[i * 3 + 2] = c[2] / 255; });
    gl.uniform3fv(uni.uStops, flat);
    gl.uniform1fv(uni.uRadii, rad);
    const cellPx = cellFrac * R * scale;
    // ячейка меньше полутора пикселей — грануляция сливается в ровный фон, как в телескоп без адаптивной оптики
    const contrast = cellFrac > 0 ? 0.16 * Math.min(1, Math.max(0, (cellPx - 1.5) / 2.5)) * (cellFrac > 0.05 ? 1.6 : 1) : 0;
    gl.uniform1f(uni.uCells, 1 / Math.max(1e-4, cellFrac) * 0.5);
    gl.uniform1f(uni.uContrast, contrast);
    gl.uniform1f(uni.uTime, now / 1000 % 3600);
    gl.uniform1f(uni.uRot, rot);
    gl.uniform1f(uni.uPx, 2 / N * 1.2);
    drawQuad();
    ctx.drawImage(layerStore(lc, key, tNow, N, N), 0, 0, N, N, -R, -R, 2 * R, 2 * R);
    return true;
  } catch (e) {
    console.warn('GPU-звезда не удалась, возврат к 2D:', e.message);
    broken = true;
    return false;
  }
}
