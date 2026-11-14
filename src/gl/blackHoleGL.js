// Чёрная дыра на GPU (5.3): для каждого пикселя численно трассируется луч света в поле Шварцшильда
// (эталон и проверки — physics/blackHole.js). Получаются сами собой: тень радиусом 3√3/2 r_s, кольцо Эйнштейна из
// звёзд фона, «горб» — изображение дальней стороны диска над и под тенью, тонкое вторичное кольцо у края тени,
// более яркая приближающаяся сторона диска (доплер + гравитационное красное смещение).
// Цвет честный: у звёздной чёрной дыры внутренний край диска ~10⁷ K, в видимом свете это хвост Рэлея — Джинса,
// бело-голубой цвет без оранжевых оттенков из кино; видимая яркость там ∝ g·T, а не g⁴T⁴ (то — в рентгене).
import { makeLayerCache, layerFresh, layerStore, drawQuad, getGL, glResize, program } from './glcore.js';
import { blackbodyRGB } from '../physics/optics.js';

const RJ = blackbodyRGB(60000);

const FS = `
precision highp float;
varying vec2 vUv;
uniform float uIncl, uTime, uExtent, uDiskOut;
uniform vec3 uRJ;
#define R_ISCO 3.0
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n21(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
// звёзды фона по направлению луча на бесконечности
vec3 stars(vec3 d) {
  vec3 c = vec3(0.0);
  for (int k = 0; k < 2; k++) {
    float sc = 60.0 + 70.0 * float(k);
    vec3 p = d * sc; vec3 i = floor(p), f = fract(p) - 0.5;
    float hsh = fract(sin(dot(i, vec3(12.9898, 78.233, 37.719)) + float(k) * 3.1) * 43758.5453);
    float b = step(0.965, hsh) * smoothstep(0.32, 0.0, length(f));
    c += b * mix(vec3(1.0, 0.85, 0.7), vec3(0.75, 0.85, 1.0), fract(hsh * 13.7));
  }
  // слабая полоса Млечного Пути
  c += vec3(0.05, 0.055, 0.08) * exp(-pow(d.y * 3.0 + d.x * 0.6, 2.0));
  return c;
}
float diskT(float r) {
  if (r <= R_ISCO) return 0.0;
  float rp = 49.0 / 36.0 * R_ISCO;
  float f = pow(r, -3.0) * (1.0 - sqrt(R_ISCO / r));
  float fm = pow(rp, -3.0) * (1.0 - sqrt(R_ISCO / rp));
  return pow(f / fm, 0.25);
}
void main() {
  vec2 xy = (vUv * 2.0 - 1.0) * uExtent;              // картинная плоскость, в r_s
  float Dc = 70.0;
  vec3 C = Dc * vec3(0.0, cos(uIncl), -sin(uIncl));    // наблюдатель; диск — плоскость y = 0
  vec3 f = -C / Dc;
  vec3 rt = vec3(1.0, 0.0, 0.0);
  vec3 up = normalize(cross(rt, f));
  vec3 pos = C, vel = normalize(f + (xy.x * rt + xy.y * up) / Dc);
  vec3 L = cross(pos, vel);
  float h2 = dot(L, L);
  vec3 col = vec3(0.0); float trans = 1.0; bool captured = false;
  for (int i = 0; i < 90; i++) {
    float r = length(pos);
    if (r < 1.0) { captured = true; break; }
    if (r > Dc * 1.3 && dot(pos, vel) > 0.0) break;
    float dt = clamp(0.09 * (r - 0.9), 0.03, 6.0);
    // x'' = −(3/2)·h²·x / r⁵ (нулевая геодезическая Шварцшильда), шаг «середина»
    vec3 a1 = -1.5 * h2 * pos / pow(r, 5.0);
    vec3 pm = pos + 0.5 * dt * vel, vm = vel + 0.5 * dt * a1;
    float rm = length(pm);
    vec3 a2 = -1.5 * h2 * pm / pow(rm, 5.0);
    vec3 np = pos + dt * vm;
    vel += dt * a2;
    // пересечение плоскости диска
    if (np.y * pos.y < 0.0) {
      vec3 hit = mix(pos, np, pos.y / (pos.y - np.y));
      float rc = length(hit.xz);
      if (rc > R_ISCO && rc < uDiskOut) {
        float T = diskT(rc);
        vec3 phi = normalize(vec3(-hit.z, 0.0, hit.x));          // направление вращения вещества
        float beta = sqrt(1.0 / (2.0 * max(1.01, rc - 1.0)));
        float gam = 1.0 / sqrt(1.0 - beta * beta);
        float cosPsi = dot(phi, -normalize(vel));
        float g = sqrt(max(0.0, 1.0 - 1.0 / rc)) / (gam * (1.0 - beta * cosPsi));
        // турбулентность диска: кеплеровский сдвиг закручивает неоднородности в спирали
        float ang = atan(hit.z, hit.x) + uTime * 0.6 * pow(rc, -1.5) * 6.0;
        float tex = 0.55 + 0.45 * n21(vec2(rc * 2.2, ang * 5.0)) * n21(vec2(rc * 0.7 + 3.0, ang * 2.0));
        float I = g * T * tex * 1.6;                                // видимая яркость в хвосте Рэлея — Джинса ∝ g·T
        float edge = smoothstep(uDiskOut, uDiskOut * 0.7, rc);
        float a = clamp(0.85 * edge, 0.0, 1.0);
        col += trans * a * uRJ * I;
        trans *= 1.0 - a * 0.9;
      }
    }
    pos = np;
    if (trans < 0.02) break;
  }
  if (!captured) col += trans * stars(normalize(vel));
  // фон — только вблизи дыры (дальше видны обычные звёзды 2D-слоя), тень и диск — всегда
  float rr = length(xy) / uExtent;
  float bgA = smoothstep(1.0, 0.75, rr);
  float a = captured ? max(bgA, 1.0 - trans) : bgA;
  a = max(a, clamp(max(col.r, max(col.g, col.b)), 0.0, 1.0));
  col = col / (1.0 + col * 0.35);
  gl_FragColor = vec4(min(col, vec3(1.0)) * (captured || trans < 1.0 ? 1.0 : bgA), a);
}`;

let broken = false;
const layer = makeLayerCache();

/**
 * cx, cy — центр на экране; unitPx — пикселей экрана на r_s; inclRad — угол между лучом зрения и осью диска;
 * lowQuality — меньше разрешение. Возвращает false без GPU (тогда работает 2D-путь).
 */
export function drawBlackHoleGL(ctx, cx, cy, unitPx, inclRad, now, lowQuality) {
  const gl = broken ? null : getGL();
  if (!gl) return false;
  try {
    const extent = 22;                                   // половина кадра в r_s
    const sizeCss = 2 * extent * unitPx;
    const dpr = ctx.getTransform ? ctx.getTransform().a : 1;
    const N = Math.max(64, Math.min(lowQuality ? 256 : 400, Math.round(sizeCss * dpr)));
    const incl = Math.max(0.03, Math.min(1.54, inclRad));
    const key = N + '|' + incl.toFixed(3);
    const tNow = performance.now();
    if (!layerFresh(layer, key, tNow, 100)) {
      glResize(N, N);
      const { p, uni } = program('blackHole53', FS);
      gl.useProgram(p);
      gl.disable(gl.BLEND);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(uni.uIncl, incl);
      gl.uniform1f(uni.uTime, (now / 1000) % 10000);
      gl.uniform1f(uni.uExtent, extent);
      gl.uniform1f(uni.uDiskOut, 16);
      gl.uniform3f(uni.uRJ, RJ[0], RJ[1], RJ[2]);
      drawQuad();
      layerStore(layer, key, tNow, N, N);
    }
    ctx.drawImage(layer.canvas, 0, 0, N, N, cx - sizeCss / 2, cy - sizeCss / 2, sizeCss, sizeCss);
    return true;
  } catch (e) {
    console.warn('GPU-чёрная дыра не удалась, возврат к 2D:', e.message);
    broken = true;
    return false;
  }
}
