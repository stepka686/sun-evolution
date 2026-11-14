// Небо на GPU (5.2): попиксельный порт physics/skyModel.js — спектральная (8 длин волн) сферическая атмосфера
// с тенью планеты, многократным рассеянием, озоном и свечением верхней атмосферы, плюс слои облаков:
//   • кучевые (~1.5 км): плотность — шум, порогом которого служит облачность из климата; освещение — свет звезды,
//     прошедший атмосферу до высоты облака (на закате он оранжевый, и облака розовеют сами), самозатенение по
//     закону Бугера с «пудровым» эффектом (Schneider 2015), серебристый край — рассеяние вперёд;
//     дальние облака тонут в дымке (воздушная перспектива).
//   • перистые (~9 км): тонкие вытянутые волокна; на них — гало (render/opticalFx.js).
// Тон-маппинг — как toDisplay, плюс сумеречное зрение: в темноте цвета гаснут и сдвигаются в синий (эффект Пуркинье).
import { drawQuad, getGL, glCanvas, glResize, program } from './glcore.js';
import { SKY_M, SKY_LAMBDA, TWI_WEIGHT } from '../physics/skyModel.js';
import { AURORA_LINES, lineBins, NLC_HEIGHT, NLC_TAU } from '../physics/upperAtmo.js';

// каналы 8-полосного спектра для линий сияния — из эталона (сумма весов 1); GLSL получает готовые числа
const LB = AURORA_LINES.map(l => lineBins(l.lambda));
const g4 = (a, o) => `vec4(${[0, 1, 2, 3].map(k => a[o + k].toFixed(4)).join(', ')})`;
const LINE_W = AURORA_LINES.map((l, i) => `const vec4 LW${i}a = ${g4(LB[i], 0)}; const vec4 LW${i}b = ${g4(LB[i], 4)};`).join('\n');
const LINE_P = AURORA_LINES.map((l, i) => `const vec3 LP${i} = vec3(${l.peak.toFixed(1)}, ${l.hLow.toFixed(1)}, ${l.hUp.toFixed(1)});`).join('\n');
const RAY4 = SKY_LAMBDA.map(l => Math.pow(550 / l, 4));
const NLC_K = NLC_TAU.toExponential(3);

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
uniform float uTwiArc, uRays;
uniform vec4 uAurC;
uniform float uAurN, uNlc;

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

// 5.3: сумеречные лучи — тень кучевого облака на луче до звезды. Точка P (центр планеты — начало координат,
// x — к азимуту звезды), луч к звезде Sd пересекает слой облаков (~2 км): снизу — на выходе, сверху — только если идёт вниз
float cloudShadow(vec3 P, vec3 Sd) {
  float rc = uR + 2.0;
  float B = dot(P, Sd), C = dot(P, P) - rc * rc;
  float disc = B * B - C;
  if (disc < 0.0) return 1.0;
  float s;
  if (C < 0.0) s = -B + sqrt(disc);
  else { if (B > 0.0) return 1.0; s = -B - sqrt(disc); }
  vec3 X = P + s * Sd;
  float ca = cos(uSunAz), sa = sin(uSunAz);
  vec2 q = vec2(ca * X.x - sa * X.y, sa * X.x + ca * X.y);
  // тень — от крупных облачных масс (2 октавы того же шума): мелкие клочки дают не лучи, а рябь
  vec2 w = q * 0.16 + vec2(uTime * 0.004, uTime * 0.0015);
  vec2 warp = vec2(n2(w * 0.7 + 3.0), n2(w * 0.7 + 9.0));
  vec2 ww = w + warp * 1.4;
  float n = 0.5 * n2(ww) + 0.25 * n2(ww * 2.03 + 7.1) + 0.094;
  // полутень: диск звезды ~0.5°, на расстоянии s от облака край тени размыт на s·0.0093 — далёкие облака
  // дают мягкие слабые лучи; рассеянный свет неба частично заполняет тень
  // размытие края (s·0.0093 км) в долях масштаба облаков (~6 км) уменьшает крутизну перехода
  float soft = 1.0 + s * 0.0093 / 6.0 * 4.0;
  float d = clamp((n - (0.74 - 0.44 * uCumulus)) * 4.0 / soft, 0.0, 1.0);
  return 1.0 - 0.8 * d * exp(-s / 300.0);
}

// небо в направлении (высота hV, cosG к звезде; d3 — луч взгляда в системе «x — к азимуту звезды»)
const int SKY_N = 16;
vec3 sky(float hV, float cosG, vec3 d3) {
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
  vec3 Sd = vec3(cos(uHs), 0.0, sin(uHs));
  for (int k = 0; k < SKY_N; k++) {
    float fk = (float(k) + 1.0) / float(SKY_N);
    float t = tMax * fk * fk;
    float tm = 0.5 * (t + tPrev), dt = t - tPrev; tPrev = t;
    float px = tm * sinV, pz = r0 + tm * muV;
    float r = length(vec2(px, pz)), h = r - uR;
    float mu = clamp((px * horizS + pz * muS) / r, -1.0, 1.0);
    vec4 s0, s1, u0, u1, f0, f1;
    sunT(r, mu, s0, s1);
    sunT(r + 2.0 * uH, mu, u0, u1);
    // навигационные сумерки: воздух со стороны звезды ещё освещён (эталон — skySpectral)
    sunT(r + uH, cos(max(0.0, acos(mu) - uTwiArc)), f0, f1);
    vec4 sh0 = s0, sh1 = s1;
    // точка тени дрожит внутри шага (хеш пикселя) — вместо колец от фиксированных шагов мелкий шум, который сглаживается
    if (uRays > 0.5) {
      float j = h2(gl_FragCoord.xy + float(k) * 7.3);
      float cs = 0.5 * (cloudShadow(vec3(0.0, 0.0, r0) + (tm + (j * 0.5 - 0.5) * dt) * d3, Sd)
                      + cloudShadow(vec3(0.0, 0.0, r0) + (tm + j * 0.5 * dt) * d3, Sd));
      sh0 *= cs; sh1 *= cs;
    }
    float dR = exp(-h / uH) / uH, dA = exp(-h / uHa) / uHa;
    vec4 bR0 = uTauR0 * dR, bA0 = uTauA0 * dA, bR1 = uTauR1 * dR, bA1 = uTauA1 * dA;
    vec4 ms0 = msk0 * ((0.45 * s0 + 0.55 * u0) * (1.0 - ${TWI_WEIGHT}) + ${TWI_WEIGHT} * f0);
    vec4 ms1 = msk1 * ((0.45 * s1 + 0.55 * u1) * (1.0 - ${TWI_WEIGHT}) + ${TWI_WEIGHT} * f1);
    L0 += uF0 * Tv0 * (sh0 * (bR0 * pR + bA0 * uWA0 * pA0) + (bR0 + bA0 * uWA0) * ms0) * dt;
    L1 += uF1 * Tv1 * (sh1 * (bR1 * pR + bA1 * uWA1 * pA1) + (bR1 + bA1 * uWA1) * ms1) * dt;
    Tv0 *= exp(-(bR0 + bA0) * dt); Tv1 *= exp(-(bR1 + bA1) * dt);
  }
  // свечение верхней атмосферы: зелёная линия кислорода 557.7 нм на ~90 км, к горизонту ярче (ван Рейн)
  float vr = 1.0 / sqrt(max(0.02, 1.0 - pow(uR / (uR + 90.0), 2.0) * sinV * sinV));
  L1.x += uAirglow * vr;          // канал 570 нм
  L1.y += uAirglow * vr * 0.25;   // слабая красная 630 нм
  return toRGB(L0, L1);
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
    float dz = az - uSunAz;
    c = sky(h, cosG, vec3(cos(h) * cos(dz), cos(h) * sin(dz), sin(h)));
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

// 5.3: верхняя атмосфера — полярное сияние (излучение линий 557.7/630/427.8 нм и N₂ 1PG на своих высотах, эталон —
// physics/upperAtmo.js) и серебристые облака на 83 км. Рисуется отдельным слоем и складывается со светом неба.
const FS_UPPER = HEAD + LINE_W + '\n' + LINE_P + `
const vec4 RAY4a = vec4(${RAY4.slice(0, 4).map(v => v.toFixed(4)).join(', ')});
const vec4 RAY4b = vec4(${RAY4.slice(4).map(v => v.toFixed(4)).join(', ')});
float lp(float h, vec3 L) { float s = h < L.x ? L.y : L.z; float x = (h - L.x) / s; return exp(-x * x) / (0.886227 * (L.y + L.z)); }
// занавеси: 3 дуги вдоль широты (с востока на запад) на расстоянии uAurN к северу — складки и вертикальные лучи;
// толщина листа ~7–13 км; к полюсу — слабое диффузное свечение
float arcN(float e, float fk) {
  return uAurN + fk * 70.0 + 80.0 * sin(e / 420.0 + uTime * 0.03 + fk * 1.7) + 70.0 * (fbm2(vec2(e / 160.0 + fk * 5.0, uTime * 0.05)) - 0.5);
}
vec3 toDisplayN(vec3 lin) {
  vec3 v = max(lin, 0.0) * uE;
  float Y = dot(v, vec3(0.2126, 0.7152, 0.0722));
  if (Y <= 1e-12) return vec3(0.0);
  vec3 o = v * ((1.0 - exp(-Y)) / Y);
  // палочки видят только тусклое: слабое сияние — серовато-белое, яркое — цветное (порог цветового зрения)
  float yo = dot(o, vec3(0.2126, 0.7152, 0.0722));
  o = mix(o, vec3(yo) * vec3(0.85, 0.95, 1.1), uNight * (1.0 - smoothstep(0.03, 0.2, yo)));
  return pow(clamp(o, 0.0, 1.0), vec3(1.0 / 2.2));
}
void main() {
  vec2 s = vec2(vUv.x, 1.0 - vUv.y) * uSize;
  float hRaw = (uHorizonY - s.y) / uVScale;
  if (hRaw <= 0.0) { gl_FragColor = vec4(0.0); return; }
  float h = max(0.004, hRaw);
  float az = uAzView + (s.x - uSize.x * 0.5) / uPxPerRad;
  float muV = sin(h), sinV = cos(h);
  vec2 dir = vec2(cos(az), sin(az));
  // ослабление по пути взгляда сквозь нижнюю атмосферу (у горизонта сияние краснеет и тускнеет)
  float chR = chapman(uR / uH, 0.0, muV), chA = chapman(uR / uHa, 0.0, muV);
  vec4 Tv0 = exp(-(uTauR0 * chR + uTauA0 * chA)), Tv1 = exp(-(uTauR1 * chR + uTauA1 * chA));
  vec4 L0 = vec4(0.0), L1 = vec4(0.0);
  float b = uR * muV;
  if (uAurC.x + uAurC.y + uAurC.z + uAurC.w > 0.0) {
    // занавеси — вертикальные листы: точка пересечения луча с листом находится аналитически (без шагов и полос);
    // свет листа = объёмная светимость линий на высоте пересечения × путь луча сквозь лист
    vec4 a = vec4(0.0);
    float ca = dir.x;
    if (ca > 0.03) {
      for (int k = 0; k < 3; k++) {
        float fk = float(k);
        float d = (uAurN + fk * 70.0) / ca;
        for (int it = 0; it < 3; it++) d = arcN(d * dir.y, fk) / ca;
        float phi = d / uR;
        float den = sinV - muV * tan(phi);
        if (phi > 0.0 && phi < 0.6 && den > 0.0) {
          float t = uR * tan(phi) / den;
          float px = t * sinV, pz = uR + t * muV;
          float alt = length(vec2(px, pz)) - uR;
          float e = d * dir.y;
          float W = 7.0 + 3.0 * fk;
          // путь сквозь гауссов лист толщиной W: √π·W по горизонтали поперёк, делённый на косинус угла к нормали
          float path = 1.772 * W / ca / max(0.05, sinV);
          float rays = 0.3 + 0.7 * pow(n2(vec2(e / 5.0 + uTime * 0.4 + fk * 13.0, fk)), 2.0);
          a += (1.0 - 0.3 * fk) * rays * path * vec4(lp(alt, LP0), lp(alt, LP1), lp(alt, LP2), lp(alt, LP3));
        }
      }
    }
    // диффузное свечение к полюсу от занавесей: несколько шагов с дрожанием
    float t0 = -b + sqrt(b * b + pow(uR + 95.0, 2.0) - uR * uR);
    float t1 = -b + sqrt(b * b + pow(uR + 260.0, 2.0) - uR * uR);
    float dt = (t1 - t0) / 6.0, jit = h2(gl_FragCoord.xy);
    for (int k = 0; k < 6; k++) {
      float t = t0 + (float(k) + jit) * dt;
      float px = t * sinV, pz = uR + t * muV;
      float alt = length(vec2(px, pz)) - uR;
      float n = dir.x * uR * atan(px, pz);
      float g = 0.05 * smoothstep(uAurN - 60.0, uAurN + 200.0, n);
      a += g * vec4(lp(alt, LP0), lp(alt, LP1), lp(alt, LP2), lp(alt, LP3)) * dt;
    }
    a *= uAurC;
    L0 += a.x * LW0a + a.y * LW1a + a.z * LW2a + a.w * LW3a;
    L1 += a.x * LW0b + a.y * LW1b + a.z * LW2b + a.w * LW3b;
  }
  if (uNlc > 0.0) {
    // серовато-голубые волны на 83 км: освещены звездой из-под горизонта, рассеяние почти рэлеевское (∝ λ⁻⁴)
    float rN = uR + ${NLC_HEIGHT.toFixed(1)};
    float t = -b + sqrt(b * b + rN * rN - uR * uR);
    float px = t * sinV, pz = uR + t * muV;
    float muS = sin(uHs);
    float cosG = clamp(sin(h) * muS + cos(h) * cos(uHs) * cos(az - uSunAz), -1.0, 1.0);
    float horizS = (cosG - muV * muS) / max(1e-4, sinV);
    float mu = clamp((px * horizS + pz * muS) / rN, -1.0, 1.0);
    vec4 s0, s1; sunT(rN, mu, s0, s1);
    vec2 q = dir * uR * atan(px, pz);
    float bnd = fbm2(vec2(q.x * 0.012 + q.y * 0.004, q.y * 0.012 - q.x * 0.003) + uTime * 0.003);
    float rip = 0.6 + 0.4 * sin(dot(q, vec2(0.35, 0.12)) + bnd * 8.0);
    float dens = clamp((bnd - 0.4) * 3.0, 0.0, 1.0) * rip;
    float sinE = (px * sinV + pz * muV) / rN;
    float k = ${NLC_K} * uNlc * dens * 0.75 * (1.0 + cosG * cosG) / max(0.05, sinE);
    L0 += uF0 * s0 * RAY4a * k; L1 += uF1 * s1 * RAY4b * k;
  }
  vec3 c = toDisplayN(toRGB(L0 * Tv0, L1 * Tv1)) * uLvl;
  gl_FragColor = vec4(c, max(c.r, max(c.g, c.b)));
}`;

let broken = false;

// Кэш: небо меняется медленно (высота звезды, направление взгляда, экспозиция) — пересчитываем его, только когда
// что-то сдвинулось заметно, и держим готовую картинку в 2D-холсте. Облака плывут — их обновляем ~15 раз в секунду.
const cache = { sky: null, skyKey: '', clouds: null, cloudKey: '', cloudT: 0, upper: null, upperKey: '', upperT: 0 };
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
  f1('uTwiArc', P.twiArc || 0); f1('uRays', p.rays ? 1 : 0);
  const ac = p.aurora || [0, 0, 0, 0];
  if (uni.uAurC) gl.uniform4f(uni.uAurC, ac[0], ac[1], ac[2], ac[3]);
  f1('uAurN', p.auroraN || 0); f1('uNlc', p.nlc || 0);
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

/** Верхняя атмосфера (сияние, серебристые облака) поверх неба, сложением света. false — нет GPU */
export function drawUpperGL(ctx, p) {
  const gl = broken ? null : getGL();
  if (!gl || !p.P) return false;
  try {
    const k = p.lowQuality ? 0.28 : 0.4;
    const W = Math.max(16, Math.round(p.w * k)), H = Math.max(16, Math.round(p.horizonY * k));
    const now = p.time || 0;
    const key = [W, H, (p.aurora || []).map(v => v.toExponential(2)).join(','), p.auroraN | 0, (p.nlc || 0).toFixed(2), p.hs.toFixed(3), p.azView.toFixed(3), Math.log(p.E).toFixed(2)].join('|');
    if (key !== cache.upperKey || now - cache.upperT > 100 || now < cache.upperT) {
      cache.upper = off(cache.upper, W, H);
      renderPass(gl, 'skyUpper53', FS_UPPER, { ...p, h: p.horizonY }, W, H, cache.upper);
      cache.upperKey = key; cache.upperT = now;
    }
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'low';
    ctx.drawImage(cache.upper, 0, 0, W, H, 0, 0, p.w, p.horizonY);
    ctx.restore();
    return true;
  } catch (e) {
    console.warn('GPU-сияние не удалось:', e.message);
    broken = true;
    return false;
  }
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
      q(p.P.tauR[3], 1e-4), q(p.P.tauA[3], 1e-4), q(p.P.F[3], 1e-9 + p.P.F[3] * 0.01), q(p.horizonY, 1), p.P.cityGlow ? 1 : 0,
      // сумеречные лучи зависят от плывущих облаков — тогда небо пересчитывается ~4 раза в секунду
      p.rays ? 'r' + q(p.cumulus, 0.01) + ':' + Math.floor((p.time || 0) / 250) : ''].join('|');
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
