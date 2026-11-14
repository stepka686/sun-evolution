// Планета-шар на GPU (5.0): тот же расчёт, что в render/sphere.js, но для каждого пикселя экрана одновременно —
// без потолка разрешения. Сверху добавлено то, что на процессоре было не по карману:
//   • мелкий рельеф и рваные края облаков — 3D-шум, привязанный к поверхности (вращается вместе с планетой);
//   • атмосфера: светлый край диска (длинный путь луча по касательной) и сияющая кайма за диском, освещённая
//     только с дневной стороны и окрашенная цветом рассеяния (голубой — азот/кислород, рыжий — пыль, жёлтый — Венера);
//   • сглаженный край диска аналитически, без «лесенки».
import { makeLayerCache, layerFresh, layerStore, GLSL_NOISE, drawQuad, getGL, glCanvas, glResize, makeTexture, onContextRestored, program } from './glcore.js';
import { TEX_H, TEX_W } from '../render/planetTextures.js';

const FS = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uColor, uAux, uClouds;
uniform float uCloudCover, uSpin, uCloudSpin, uTilt, uAmb, uLightsK, uLava, uHasClouds, uScale, uAtmo, uHalo, uPx, uTime;
uniform vec3 uL, uSun, uCloudRgb, uAtmoRgb;
uniform vec4 uShadow;
${GLSL_NOISE}
void main() {
  // координаты в радиусах планеты; ось y экрана — вниз
  vec2 p = (vUv * 2.0 - 1.0) * uScale; p.y = -p.y;
  float r = length(p);
  vec3 L = normalize(uL);
  // кайма атмосферы за диском: яркость спадает экспоненциально с высотой, светится только дневной лимб
  vec4 halo = vec4(0.0);
  if (uAtmo > 0.0) {
    float h = max(r - 1.0, 0.0) / uHalo;
    float day = clamp(dot(vec3(p / max(r, 1e-4), 0.0), L) * 1.4 + 0.45, 0.0, 1.0);
    float a = exp(-h * 3.2) * (1.0 - smoothstep(0.85, 1.0, h)) * uAtmo * day;
    halo = vec4(uAtmoRgb * uSun * a, a);
  }
  if (r > 1.0) { gl_FragColor = halo; return; }
  float z = sqrt(max(0.0, 1.0 - r * r));
  float ct = cos(uTilt), st = sin(uTilt);
  float xb = p.x * ct + p.y * st, yb = -p.x * st + p.y * ct;
  float lat = asin(clamp(-yb, -1.0, 1.0));
  float lon = atan(xb, z);
  float v = 0.5 - lat / 3.14159265;
  float u0 = lon / 6.2831853 + 0.5;
  vec2 tc = vec2(u0 + uSpin, v);
  // искажение координат шумом: береговые линии и границы зон из сетки 1° становятся изрезанными, а не ступенчатыми
  float lonW = (tc.x - 0.5) * 6.2831853;
  vec3 nw = vec3(cos(lat) * sin(lonW), sin(lat), cos(lat) * cos(lonW));
  tc += (vec2(fbm3(nw * 9.0), fbm3(nw * 9.0 + 17.3)) - 0.5) * vec2(0.006, 0.012);
  vec3 col = texture2D(uColor, tc).rgb;
  vec4 aux = texture2D(uAux, tc);
  float ocean = step(0.5, aux.r), lights = aux.g;
  // точка на поверхности в системе планеты — для шума, который вращается вместе с ней
  float lonB = (tc.x - 0.5) * 6.2831853;
  vec3 nb = vec3(cos(lat) * sin(lonB), sin(lat), cos(lat) * cos(lonB));
  if (ocean < 0.5) col *= 0.9 + 0.2 * fbm3(nb * 46.0);
  else col *= 0.96 + 0.08 * fbm3(nb * 30.0);
  // облака: плотность из текстуры, рваный край — шум
  float cl = 0.0;
  if (uHasClouds > 0.5) {
    cl = texture2D(uClouds, vec2(u0 + uCloudSpin, v)).r;
    float lonC = (u0 + uCloudSpin - 0.5) * 6.2831853;
    vec3 nc = vec3(cos(lat) * sin(lonC), sin(lat), cos(lat) * cos(lonC));
    // у сплошного покрова (Венера, Титан) — мягкие полосы вдоль широт, у земных облаков — рваные края
    float amp = mix(0.9, 0.22, smoothstep(0.6, 0.95, uCloudCover));
    vec3 q = mix(nc * 22.0, vec3(nc.x * 5.0, nc.y * 34.0, nc.z * 5.0), smoothstep(0.6, 0.95, uCloudCover));
    cl = clamp(cl * (1.0 - amp * 0.5 + amp * fbm3(q + vec3(uTime * 0.02))), 0.0, 1.0);
    col = mix(col, uCloudRgb, cl);
  }
  vec3 n = vec3(p, z);
  float ndl = dot(n, L);
  float lit = max(ndl, 0.0);
  float twi = (ndl > -0.2 && ndl < 0.15) ? (1.0 - abs(ndl) / (ndl < 0.0 ? 0.2 : 0.15)) * 0.5 : 0.0;
  lit = lit * 0.97 + uAmb;
  // полутень Луны
  if (uShadow.w > 0.0 && ndl > 0.0) {
    float dd = length(n - uShadow.xyz);
    if (dd < uShadow.w) lit *= 0.25 + 0.75 * (dd / uShadow.w) * (dd / uShadow.w);
  }
  vec3 c = col * lit * uSun;
  c += vec3(40.0, 14.0, 0.0) / 255.0 * twi * uSun;
  // блик звезды и френелевский отблеск неба на открытой воде
  if (ocean > 0.5 && ndl > 0.0) {
    vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
    float nh = max(dot(n, H), 0.0);
    float spec = pow(nh, 220.0) * 1.3 + pow(nh, 18.0) * 0.06;
    float fres = pow(1.0 - z, 4.0);
    c += (spec + fres * 60.0 / 255.0) * (1.0 - cl) * min(1.0, ndl * 3.0) * uSun;
  }
  // ночная сторона: огни городов, лава
  if (ndl < 0.05 && lights > 0.0) {
    float nightK = min(1.0, (0.05 - ndl) / 0.15) * (1.0 - cl * (uLava > 0.5 ? 0.92 : 0.7));
    float e = lights * nightK;
    c += uLava > 0.5 ? e * vec3(1.0, 0.35, 0.05) : e * uLightsK * vec3(1.0, 0.78, 0.4);
  }
  // атмосфера над диском: к краю путь луча длиннее — свет рассеяния, на ночной стороне гаснет
  if (uAtmo > 0.0) {
    float rim = pow(1.0 - z, 2.2) * uAtmo * clamp(ndl * 1.5 + 0.35, 0.0, 1.0);
    c = mix(c, uAtmoRgb * uSun * clamp(ndl + 0.5, 0.0, 1.0), clamp(rim * 0.85, 0.0, 0.9));
  }
  // аналитическое сглаживание края диска (ширина — один пиксель)
  float edge = clamp((1.0 - r) / uPx, 0.0, 1.0);
  // край диска поверх каймы — без тёмной щели между ними
  gl_FragColor = vec4(c * edge, edge) + halo * (1.0 - edge);
}`;

let cache = { tex: null, colorT: null, auxT: null, cloudsSrc: null, cloudsT: null };
onContextRestored(() => { cache = { tex: null, colorT: null, auxT: null, cloudsSrc: null, cloudsT: null }; });

function upload(gl, tex, clouds) {
  if (cache.tex !== tex) {
    if (cache.colorT) { gl.deleteTexture(cache.colorT); gl.deleteTexture(cache.auxT); }
    cache.colorT = makeTexture(TEX_W, TEX_H, new Uint8Array(tex.color.buffer, tex.color.byteOffset, tex.color.length), 'rgb');
    const aux = new Uint8Array(TEX_W * TEX_H * 4);
    for (let i = 0; i < TEX_W * TEX_H; i++) { aux[i * 4] = tex.ocean[i] ? 255 : 0; aux[i * 4 + 1] = tex.lights[i]; aux[i * 4 + 3] = 255; }
    cache.auxT = makeTexture(TEX_W, TEX_H, aux, 'rgba');
    cache.tex = tex;
  }
  if (clouds && cache.cloudsSrc !== clouds) {
    if (cache.cloudsT) gl.deleteTexture(cache.cloudsT);
    cache.cloudsT = makeTexture(TEX_W, TEX_H, clouds, 'lum');
    cache.cloudsSrc = clouds;
  }
}

const L0 = [-0.92, -0.12, 0.37];
let broken = false;            // шейдер не собрался на этом устройстве — больше не пытаемся
const layers = new WeakMap();   // кэш готовых кадров: текстура планеты → размер → картинка

/**
 * Рисует шар на GPU и копирует его на 2D-холст. Возвращает false, если GPU недоступен (тогда рисует 2D-путь).
 * Параметры — как у drawSphere; дополнительно o.atmoRgb (0…255) и o.atmoDensity (0…1) — атмосфера.
 */
export function drawSphereGL(ctx, cx, cy, R, tex, clouds, o) {
  const gl = broken ? null : getGL();
  if (!gl) return false;
  try {
    const dpr = ctx.getTransform ? ctx.getTransform().a : 1;
    const atmo = Math.max(0, o.atmoDensity || 0);
    const halo = atmo > 0.02 ? 0.035 + 0.05 * atmo : 0;
    const scale = 1 + halo;
    const N = Math.max(32, Math.min(1024, Math.round(2 * R * scale * dpr)));
    const Rq = R * scale;
    // шар меняется медленно (сутки планеты — десятки секунд экранного времени): перерисовываем ~15 раз в секунду,
    // а между обновлениями берём готовую картинку из кэша — без копирования из WebGL
    const L1 = o.light || L0, sh1 = o.shadow;
    const key = N + '|' + L1.map(v => v.toFixed(2)).join(',') + '|' + (sh1 ? [sh1.x, sh1.y, sh1.z, sh1.r].map(v => v.toFixed(3)).join(',') : '-') +
      '|' + (o.nightLights || 0).toFixed(2) + '|' + (o.cloudCover || 0).toFixed(2) + '|' + atmo.toFixed(2) + '|' + (o.starRgb || []).join(',');
    let byN = layers.get(tex);
    if (!byN) { byN = new Map(); layers.set(tex, byN); }
    let lc = byN.get(N);
    if (!lc) { if (byN.size > 4) byN.clear(); lc = makeLayerCache(); byN.set(N, lc); }
    const tNow = performance.now();
    if (lc.clouds === clouds && layerFresh(lc, key, tNow, 66)) {
      ctx.drawImage(lc.canvas, 0, 0, N, N, cx - Rq, cy - Rq, 2 * Rq, 2 * Rq);
      return true;
    }
    glResize(N, N);
    upload(gl, tex, clouds);
    const { p, uni } = program('sphere', FS);
    gl.useProgram(p);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, cache.colorT); gl.uniform1i(uni.uColor, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, cache.auxT); gl.uniform1i(uni.uAux, 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, clouds ? cache.cloudsT : cache.auxT); gl.uniform1i(uni.uClouds, 2);
    const L = o.light || L0;
    gl.uniform3f(uni.uL, L[0], L[1], L[2]);
    gl.uniform3f(uni.uSun, o.starRgb[0], o.starRgb[1], o.starRgb[2]);
    const cr = o.cloudRgb || [240, 240, 240];
    gl.uniform3f(uni.uCloudRgb, cr[0] / 255, cr[1] / 255, cr[2] / 255);
    const ar = o.atmoRgb || [147, 197, 253];
    gl.uniform3f(uni.uAtmoRgb, ar[0] / 255, ar[1] / 255, ar[2] / 255);
    gl.uniform1f(uni.uSpin, o.spin % 1);
    gl.uniform1f(uni.uCloudSpin, (o.cloudSpin || 0) % 1);
    gl.uniform1f(uni.uTilt, (o.tilt || 0) * Math.PI / 180);
    gl.uniform1f(uni.uAmb, o.ambient ?? 0.03);
    gl.uniform1f(uni.uLightsK, o.nightLights || 0);
    gl.uniform1f(uni.uLava, tex.lava ? 1 : 0);
    gl.uniform1f(uni.uHasClouds, clouds ? 1 : 0);
    gl.uniform1f(uni.uCloudCover, o.cloudCover || 0);
    gl.uniform1f(uni.uScale, scale);
    gl.uniform1f(uni.uAtmo, halo > 0 ? Math.min(1, atmo * 1.1) : 0);
    gl.uniform1f(uni.uHalo, Math.max(1e-3, halo));
    gl.uniform1f(uni.uPx, 2 * scale / N * 1.2);
    gl.uniform1f(uni.uTime, (o.time || 0) / 1000 % 10000);
    const sh = o.shadow;
    gl.uniform4f(uni.uShadow, sh ? sh.x : 0, sh ? sh.y : 0, sh ? sh.z : 0, sh ? sh.r : 0);
    drawQuad();
    lc.clouds = clouds;
    ctx.drawImage(layerStore(lc, key, tNow, N, N), 0, 0, N, N, cx - Rq, cy - Rq, 2 * Rq, 2 * Rq);
    return true;
  } catch (e) {
    console.warn('GPU-шар не удался, возврат к 2D:', e.message);
    broken = true;
    return false;
  }
}
