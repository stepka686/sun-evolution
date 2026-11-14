// Небо на GPU (5.2): попиксельный порт physics/skyModel.js — спектральная (8 длин волн) сферическая атмосфера
// с тенью планеты, многократным рассеянием, озоном и свечением верхней атмосферы, плюс слои облаков:
//   • кучевые (~1.5 км): плотность — шум, порогом которого служит облачность из климата; освещение — свет звезды,
//     прошедший атмосферу до высоты облака (на закате он оранжевый, и облака розовеют сами), самозатенение по
//     закону Бугера с «пудровым» эффектом (Schneider 2015), серебристый край — рассеяние вперёд;
//     дальние облака тонут в дымке (воздушная перспектива).
//   • перистые (~9 км): тонкие вытянутые волокна; на них — гало (render/opticalFx.js).
// Тон-маппинг — как toDisplay, плюс сумеречное зрение: в темноте цвета гаснут и сдвигаются в синий (эффект Пуркинье).
import { drawQuad, getGL, glCanvas, glResize, program } from './glcore.js';
import { SKY_M } from '../physics/skyModel.js';

const HEAD = `
precision highp float;
varying vec2 vUv;
uniform vec2 uSize;
uniform float uHorizonY, uVScale, uPxPerRad, uAzView, uHs, uSunAz;
uniform vec4 uTauR0, uTauR1, uTauA0, uTauA1, uWA0, uWA1, uGA0, uGA1, uOz0, uOz1, uF0, uF1;
uniform vec3 uM[8];
uniform float uR, uH, uHa, uTop, uOvercast;
uniform vec3 uCloudT;
uniform float uE, uSat, uLvl, uNight, uAirglow, uCity;
uniform float uCumulus, uCirrus, uTime;
uniform vec3 uAmbient;

float chUp(float x, float mu) { float c = sqrt(1.5707963 * x); return c / ((c - 1.0) * mu + 1.0); }
float chapman(float X, float h, float cosZ) {
  float x = X + h;
  if (cosZ >= 0.0) return chUp(x, cosZ) * exp(-h);
  float x0 = x * sqrt(max(0.0, 1.0 - cosZ * cosZ));
  return (2.0 * sqrt(1.5707963 * x0) * exp(min(x - x0, 60.0)) - chUp(x, -cosZ)) * exp(-h);
}
float hg(float g, float c) { return (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * c, 1.5); }
vec4 aphase(vec4 g, float c) {
  vec4 g1 = min(vec4(0.93), g + 0.2), g2 = 0.3 * g;
  vec4 w = (g - g2) / max(vec4(1e-3), g1 - g2);
  vec4 p = vec4(hg(g1.x, c), hg(g1.y, c), hg(g1.z, c), hg(g1.w, c)) * w
         + vec4(hg(g2.x, c), hg(g2.y, c), hg(g2.z, c), hg(g2.w, c)) * (1.0 - w);
  return p / (1.0 + p / 40.0);
}
// пропускание до звезды из точки радиуса r при косинусе зенитного угла mu (0 — в тени планеты)
void sunT(float r, float mu, out vec4 t0, out vec4 t1) {
  if (mu < 0.0 && r * sqrt(max(0.0, 1.0 - mu * mu)) < uR) { t0 = vec4(0.0); t1 = vec4(0.0); return; }
  float h = r - uR;
  float chR = chapman(uR / uH, h / uH, mu), chA = chapman(uR / uHa, h / uHa, mu);
  float rl = uR + 25.0, s = r * sqrt(max(0.0, 1.0 - mu * mu)) / rl, ozM = 0.0;
  if (s < 1.0) { float cl = sqrt(1.0 - s * s); ozM = r < rl ? 1.0 / cl : (mu < 0.0 ? 2.0 / cl : 0.0); }
  t0 = exp(-(uTauR0 * chR + uTauA0 * chA + uOz0 * ozM));
  t1 = exp(-(uTauR1 * chR + uTauA1 * chA + uOz1 * ozM));
}
vec3 toRGB(vec4 a, vec4 b) {
  return max(uM[0] * a.x + uM[1] * a.y + uM[2] * a.z + uM[3] * a.w + uM[4] * b.x + uM[5] * b.y + uM[6] * b.z + uM[7] * b.w, 0.0);
}

// небо в направлении (высота hV, cosG к звезде)
vec3 sky(float hV, float cosG) {
  float r0 = uR + 0.002;
  float muV = sin(max(-0.02, hV)), sinV = cos(max(-0.02, hV));
  float muS = sin(uHs);
  float rTop = uR + uTop;
  float b = r0 * muV;
  float tMax = -b + sqrt(max(0.0, b * b - (r0 * r0 - rTop * rTop)));
  float dG = b * b - (r0 * r0 - uR * uR);
  if (muV < 0.0 && dG > 0.0) tMax = min(tMax, -b - sqrt(dG));
  float pR = 0.75 * (1.0 + cosG * cosG);
  vec4 pA0 = aphase(uGA0, cosG), pA1 = aphase(uGA1, cosG);
  vec4 L0 = vec4(0.0), L1 = vec4(0.0), Tv0 = vec4(1.0), Tv1 = vec4(1.0);
  vec4 tt0 = uTauR0 + uTauA0, tt1 = uTauR1 + uTauA1;
  vec4 msk0 = 0.3 * min(vec4(1.0), tt0) * (uTauR0 + uTauA0 * uWA0) / max(vec4(1e-6), tt0);
  vec4 msk1 = 0.3 * min(vec4(1.0), tt1) * (uTauR1 + uTauA1 * uWA1) / max(vec4(1e-6), tt1);
  float horizS = sinV > 1e-4 ? (cosG - muV * muS) / sinV : 0.0;
  float tPrev = 0.0;
  for (int k = 0; k < 10; k++) {
    float fk = (float(k) + 1.0) / 10.0;
    float t = tMax * fk * fk;
    float tm = 0.5 * (t + tPrev), dt = t - tPrev; tPrev = t;
    float px = tm * sinV, pz = r0 + tm * muV;
    float r = length(vec2(px, pz)), h = r - uR;
    float mu = clamp((px * horizS + pz * muS) / r, -1.0, 1.0);
    vec4 s0, s1, u0, u1;
    sunT(r, mu, s0, s1);
    sunT(r + 2.0 * uH, mu, u0, u1);
    float dR = exp(-h / uH) / uH, dA = exp(-h / uHa) / uHa;
    vec4 bR0 = uTauR0 * dR, bA0 = uTauA0 * dA, bR1 = uTauR1 * dR, bA1 = uTauA1 * dA;
    vec4 ms0 = msk0 * (0.45 * s0 + 0.55 * u0), ms1 = msk1 * (0.45 * s1 + 0.55 * u1);
    L0 += uF0 * Tv0 * (s0 * (bR0 * pR + bA0 * uWA0 * pA0) + (bR0 + bA0 * uWA0) * ms0) * dt;
    L1 += uF1 * Tv1 * (s1 * (bR1 * pR + bA1 * uWA1 * pA1) + (bR1 + bA1 * uWA1) * ms1) * dt;
    Tv0 *= exp(-(bR0 + bA0) * dt); Tv1 *= exp(-(bR1 + bA1) * dt);
  }
  // свечение верхней атмосферы: зелёная линия кислорода 557.7 нм на ~90 км, к горизонту ярче (ван Рейн)
  float vr = 1.0 / sqrt(max(0.02, 1.0 - pow(uR / (uR + 90.0), 2.0) * sinV * sinV));
  L1.x += uAirglow * vr;          // канал 570 нм
  L1.y += uAirglow * vr * 0.25;   // слабая красная 630 нм
  return toRGB(L0, L1);
}

// ---------- облака ----------
float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
float fbm2(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * n2(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
float cumulusD(vec2 q) {
  // кучевые: крупные «кочаны» (искажённый шум) с резкой границей — облако либо есть, либо нет
  vec2 w = q * 0.16 + vec2(uTime * 0.004, uTime * 0.0015);
  vec2 warp = vec2(n2(w * 0.7 + 3.0), n2(w * 0.7 + 9.0));           // искажение — дешёвый одиночный шум
  float n = fbm2(w + warp * 1.4);
  float thr = 0.74 - 0.44 * uCumulus;
  return clamp((n - thr) * 5.0, 0.0, 1.0);
}

vec3 toDisplay(vec3 lin) {
  vec3 v = max(lin, 0.0) * uE;
  float Y = dot(v, vec3(0.2126, 0.7152, 0.0722));
  if (Y > 0.0) { v = max(vec3(Y) + (v - vec3(Y)) * uSat, 0.0); Y = dot(v, vec3(0.2126, 0.7152, 0.0722)); }
  if (Y <= 1e-12) return vec3(0.0);
  vec3 o = v * ((1.0 - exp(-Y)) / Y);
  float m = max(o.r, max(o.g, o.b));
  if (m > 1.0) o = o / m + (1.0 - 1.0 / m) * 0.2;
  // сумеречное зрение: колбочки уступают палочкам — цвет гаснет, остаётся голубовато-серый
  float yo = dot(o, vec3(0.2126, 0.7152, 0.0722));
  o = mix(o, vec3(yo) * vec3(0.78, 0.9, 1.18), uNight);
  return pow(clamp(o, 0.0, 1.0), vec3(1.0 / 2.2));
}

`;
const FS_ATM = HEAD + `void main() {
  vec2 s = vec2(vUv.x, 1.0 - vUv.y) * uSize;
  float h = max(0.004, (uHorizonY - s.y) / uVScale);
  float az = uAzView + (s.x - uSize.x * 0.5) / uPxPerRad;
  float cosG = clamp(sin(h) * sin(uHs) + cos(h) * cos(uHs) * cos(az - uSunAz), -1.0, 1.0);
  vec3 c;
  if (uOvercast > 0.5) {
    float tw = uHs >= 0.0 ? 1.0 : exp(uHs / 0.06);
    c = (uF0.y + uF1.x) * 0.5 * uCloudT * (max(0.0, sin(uHs)) + 0.05) * tw * (0.85 + 0.15 * sin(h));
  } else {
    c = sky(h, cosG);
    // зарево городов у горизонта (эпоха цивилизации): оранжевый свет натриевых ламп, рассеянный в нижних слоях
    c += uCity * vec3(1.0, 0.62, 0.3) * exp(-h / 0.12);
  }
  gl_FragColor = vec4(toDisplay(c) * uLvl, 1.0);
}`;
const FS_CLOUDS = HEAD + `void main() {
  vec2 s = vec2(vUv.x, 1.0 - vUv.y) * uSize;
  float hRaw = (uHorizonY - s.y) / uVScale;
  if (hRaw <= 0.0) { gl_FragColor = vec4(0.0); return; }
  float h = max(0.004, hRaw);
  float az = uAzView + (s.x - uSize.x * 0.5) / uPxPerRad;
  float cosG = clamp(sin(h) * sin(uHs) + cos(h) * cos(uHs) * cos(az - uSunAz), -1.0, 1.0);
  float muV = sin(h), sinV = cos(h);
  vec2 dir = vec2(cos(az), sin(az));
  vec2 sunDir = vec2(cos(uSunAz), sin(uSunAz));
  float muS = sin(uHs);
  vec3 sunRGB; { vec4 a0, a1; sunT(uR + 1.5, muS, a0, a1); sunRGB = toRGB(uF0 * a0, uF1 * a1); }
  vec3 col = vec3(0.0); float alpha = 0.0;
  // кучевые: основание 1.5 км
  if (uCumulus > 0.01) {
    float rc = uR + 1.5, b = uR * muV;
    float t = -b + sqrt(b * b + rc * rc - uR * uR);
    vec2 q = dir * t * sinV;
    float d = cumulusD(q);
    if (d > 0.0) {
      // свет сквозь облако снизу: толстая середина тёмная (закон Бугера), края светятся;
      // у звезды — серебристый край от рассеяния вперёд; бок, обращённый к звезде, подсвечен сильнее
      float d2 = cumulusD(q + sunDir * 1.2) * 2.0;
      float through = exp(-3.2 * d) * (1.0 - exp(-4.0 * d));
      float side = exp(-1.4 * d2) * (1.0 - exp(-2.5 * d));
      float phase = 0.7 * hg(0.65, cosG) + 0.3;
      float day = max(0.0, muS + 0.08);
      vec3 cc = sunRGB * day * (through * phase * 3.0 + side * 0.9) + uAmbient * (0.75 - 0.4 * d);
      float fade = exp(-t / 40.0);                            // дальние облака тонут в дымке
      float a = smoothstep(0.0, 0.25, d) * (0.15 + 0.85 * fade) * fade * smoothstep(0.0, 0.03, muV);
      col = toDisplay(cc) * uLvl; alpha = a;
    }
  }
  // перистые: 9 км, вытянутые волокна вдоль ветра, полупрозрачные, светятся рассеянием вперёд
  if (uCirrus > 0.01) {
    float rc = uR + 9.0, b = uR * muV;
    float t = -b + sqrt(b * b + rc * rc - uR * uR);
    vec2 q = dir * t * sinV;
    vec2 qs = vec2(q.x * 0.05 + q.y * 0.02, q.y * 0.35 - q.x * 0.12) + vec2(uTime * 0.002, 0.0);
    float f = fbm2(qs) * n2(qs * 2.7 + 3.1);
    float d = clamp((f - 0.36 + 0.14 * uCirrus) * 3.0, 0.0, 1.0) * uCirrus;
    float phase = 0.6 * hg(0.75, cosG) + 0.4;
    vec3 cc = sunRGB * max(0.0, muS + 0.05) * phase * 0.9 + uAmbient * 0.6;
    float a = d * 0.38 * smoothstep(0.0, 0.05, muV) * (1.0 - alpha);
    col = col * alpha + toDisplay(cc) * uLvl * a; alpha += a;
    col = alpha > 0.0 ? col / alpha : col;
  }
  gl_FragColor = vec4(col * alpha, alpha);         // премультипликация — ложится поверх неба
}`;

let broken = false;

// Кэш: небо меняется медленно (высота звезды, направление взгляда, экспозиция) — пересчитываем его, только когда
// что-то сдвинулось заметно, и держим готовую картинку в 2D-холсте. Облака плывут — их обновляем ~15 раз в секунду.
const cache = { sky: null, skyKey: '', clouds: null, cloudKey: '', cloudT: 0 };
function off(c, W, H) {
  if (!c) c = document.createElement('canvas');
  if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
  return c;
}

function setUniforms(gl, uni, p, W, H) {
  const P = p.P;
  gl.uniform2f(uni.uSize, p.w, p.h);
  gl.uniform1f(uni.uHorizonY, p.horizonY); gl.uniform1f(uni.uVScale, p.vScale); gl.uniform1f(uni.uPxPerRad, p.pxPerRad);
  gl.uniform1f(uni.uAzView, p.azView); gl.uniform1f(uni.uHs, p.hs); gl.uniform1f(uni.uSunAz, p.sunAz);
  const v4 = (name, a, o) => { if (uni[name]) gl.uniform4f(uni[name], a[o], a[o + 1], a[o + 2], a[o + 3]); };
  for (const [n, arr] of [['TauR', P.tauR], ['TauA', P.tauA], ['WA', P.wA], ['GA', P.gA], ['Oz', P.oz], ['F', P.F]]) { v4(`u${n}0`, arr, 0); v4(`u${n}1`, arr, 4); }
  const f1 = (n, v) => { if (uni[n]) gl.uniform1f(uni[n], v); };
  if (uni.uM) gl.uniform3fv(uni.uM, new Float32Array(SKY_M.flat()));
  f1('uR', P.R); f1('uH', P.H); f1('uHa', P.Ha); f1('uTop', P.top);
  f1('uOvercast', p.overcast ? 1 : 0);
  const ct = p.cloudT || [0, 0, 0];
  if (uni.uCloudT) gl.uniform3f(uni.uCloudT, ct[0], ct[1], ct[2]);
  f1('uE', p.E); f1('uSat', p.sat); f1('uLvl', p.lvl); f1('uNight', p.night || 0);
  f1('uAirglow', P.airglow || 0); f1('uCity', P.cityGlow || 0);
  f1('uCumulus', p.cumulus || 0); f1('uCirrus', p.cirrus || 0);
  f1('uTime', (p.time || 0) / 1000 % 100000);
  const am = p.ambient || [0, 0, 0];
  if (uni.uAmbient) gl.uniform3f(uni.uAmbient, am[0], am[1], am[2]);
}

function renderPass(gl, name, fs, p, W, H, target) {
  glResize(W, H);
  const { p: prog, uni } = program(name, fs);
  gl.useProgram(prog);
  gl.disable(gl.BLEND);
  gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
  setUniforms(gl, uni, p, W, H);
  drawQuad();
  const tctx = target.getContext('2d');
  tctx.clearRect(0, 0, W, H);
  tctx.drawImage(glCanvas(), 0, 0, W, H, 0, 0, W, H);
}

/**
 * p: { w, h, horizonY, vScale, pxPerRad, azView, hs, sunAz, P (buildSkyParams), overcast, cloudT, E, sat, lvl, night,
 *      cumulus, cirrus, time, ambient, lowQuality }
 */
export function drawSkyGL(ctx, p) {
  const gl = broken ? null : getGL();
  if (!gl || !p.P) return false;
  try {
    // небо гладкое — считаем его в ~⅓ разрешения CSS-пикселей, при растяжении оно остаётся гладким
    const ks = p.lowQuality ? 0.25 : 0.35;
    const Ws = Math.max(16, Math.round(p.w * ks)), Hs = Math.max(16, Math.round(p.h * ks));
    const q = (v, step) => Math.round(v / step);
    const skyKey = [Ws, Hs, q(p.hs, 0.0015), q(p.azView, 0.003), q(Math.log(p.E), 0.03), q(p.lvl, 0.01), q(p.night || 0, 0.02), p.overcast ? 1 : 0,
      q(p.P.tauR[3], 1e-4), q(p.P.tauA[3], 1e-4), q(p.P.F[3], 1e-9 + p.P.F[3] * 0.01), q(p.horizonY, 1), p.P.cityGlow ? 1 : 0].join('|');
    if (skyKey !== cache.skyKey) {
      cache.sky = off(cache.sky, Ws, Hs);
      renderPass(gl, 'skyAtm52', FS_ATM, p, Ws, Hs, cache.sky);
      cache.skyKey = skyKey;
    }
    ctx.save();
    // небо гладкое — билинейного растяжения хватает; 'high' на телефоне заметно дороже
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'low';
    ctx.drawImage(cache.sky, 0, 0, Ws, Hs, 0, 0, p.w, p.h);
    // облака: ~0.6 разрешения CSS, только выше горизонта, обновление ~10 раз в секунду (облака плывут медленно)
    if (!p.overcast && ((p.cumulus || 0) > 0.01 || (p.cirrus || 0) > 0.01)) {
      const kc = p.lowQuality ? 0.4 : 0.6;
      const Wc = Math.max(16, Math.round(p.w * kc)), Hc = Math.max(16, Math.round(p.horizonY * kc));
      const ck = [Wc, Hc, skyKey, q(p.cumulus, 0.01), q(p.cirrus, 0.01)].join('|');
      const now = p.time || 0;
      if (ck !== cache.cloudKey || now - cache.cloudT > 100 || now < cache.cloudT) {
        cache.clouds = off(cache.clouds, Wc, Hc);
        renderPass(gl, 'skyClouds52', FS_CLOUDS, { ...p, h: p.horizonY, horizonY: p.horizonY }, Wc, Hc, cache.clouds);
        cache.cloudKey = ck; cache.cloudT = now;
      }
      ctx.drawImage(cache.clouds, 0, 0, Wc, Hc, 0, 0, p.w, p.horizonY);
    }
    ctx.restore();
    return true;
  } catch (e) {
    console.warn('GPU-небо не удалось, возврат к 2D:', e.message);
    broken = true;
    return false;
  }
}
