// Млечный Путь на GPU (5.0): ~200 тысяч звёзд-точек вместо 9 тысяч пикселей. Точки строятся один раз
// (экспоненциальный диск, балдж и бар, четыре рукава с молодыми голубыми звёздами и розовыми областями HII,
// шпора Ориона), а поворот узора рукавов — в вершинном шейдере, без перерисовки облака.
// Пыль — второй проход с поглощающим смешиванием: тёмные полосы с внутренней стороны рукавов гасят звёзды за собой.
import { makeLayerCache, layerStore, getGL, glCanvas, glResize, onContextRestored, program } from './glcore.js';
import { ARM_A, ARM_THETA0, KSP } from '../render/galaxyView.js';

const VS = `
attribute vec2 aPos;
attribute vec4 aCol;
attribute float aSize;
uniform float uAngle, uScale, uPx;
varying vec4 vCol;
void main() {
  float c = cos(uAngle), s = sin(uAngle);
  vec2 p = vec2(c * aPos.x - s * aPos.y, s * aPos.x + c * aPos.y) * uScale;
  gl_Position = vec4(p.x, -p.y, 0.0, 1.0);
  gl_PointSize = max(1.0, aSize * uPx);
  vCol = aCol;
}`;
const FS = `
precision mediump float;
varying vec4 vCol;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float a = smoothstep(0.5, 0.15, length(d));
  gl_FragColor = vec4(vCol.rgb * vCol.a * a, vCol.a * a);
}`;

let bufs = null;
onContextRestored(() => { bufs = null; });

function build(gl) {
  let seed = 11;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const gauss = () => { let u = 0; for (let i = 0; i < 4; i++) u += rnd(); return (u - 2) / 0.58; };
  const stars = [], dust = [];
  const push = (arr, x, y, r, g, b, a, sz) => arr.push(x, y, r, g, b, a, sz);
  // диск: экспоненциальный профиль, шкала 2.6 кпк; ближе к центру звёзды старше и желтее
  for (let i = 0; i < 70000; i++) {
    const r = -2.6 * Math.log(1 - rnd() * 0.997), a = rnd() * 2 * Math.PI;
    if (r > 16) continue;
    const warm = Math.exp(-r / 4);
    push(stars, Math.cos(a) * r, Math.sin(a) * r, 0.75 + 0.25 * warm, 0.75 + 0.1 * warm, 0.9 - 0.25 * warm, 0.16, 1.0 + rnd() * 0.6);
  }
  // балдж и бар (27° к линии Солнце — центр): старые жёлтые звёзды
  const bc = Math.cos(-27 * Math.PI / 180), bs = Math.sin(-27 * Math.PI / 180);
  for (let i = 0; i < 40000; i++) {
    const inBar = rnd() < 0.6;
    let x = gauss() * (inBar ? 2.0 : 0.9), y = gauss() * (inBar ? 0.55 : 0.9);
    const X = x * bc - y * bs, Y = x * bs + y * bc;
    push(stars, X, Y, 1.0, 0.86, 0.62, 0.22, 1.1 + rnd() * 0.7);
  }
  // рукава
  for (let i = 0; i < 4; i++) {
    const th0 = ARM_THETA0 + i * Math.PI / 2, major = i === 0 || i === 3 ? 1 : 0.7;
    for (let th = th0; th < th0 + 1.6 * Math.PI; th += 0.0009) {
      const r = ARM_A * Math.exp(KSP * (th - th0));
      if (r > 16) break;
      const wdt = 0.28 + r * 0.025;
      for (let j = 0; j < 2; j++) {
        const rr = r + gauss() * wdt, tt = th + gauss() * 0.01;
        const x = Math.cos(tt) * rr, y = Math.sin(tt) * rr;
        if (rnd() < 0.012 * major) push(stars, x, y, 1.0, 0.45, 0.65, 0.85, 2.6 + rnd() * 2.5);       // туманности HII
        else push(stars, x, y, 0.7 + rnd() * 0.25, 0.8 + rnd() * 0.15, 1.0, 0.42 * major, 1.0 + rnd() * 1.1);
      }
      // пыль — с внутренней (вогнутой) стороны рукава, где газ сжимается волной плотности
      const rd = r - wdt * 1.1 + gauss() * 0.15;
      if (rnd() < 0.8) push(dust, Math.cos(th) * rd, Math.sin(th) * rd, 0.55, 0.6, 0.7, 0.5, 2.2 + rnd() * 2);
    }
  }
  // шпора Ориона (местный рукав) — где живёт Солнце
  for (let th = Math.PI - 0.5; th < Math.PI + 0.35; th += 0.0015) {
    const r = 8.3 + (th - Math.PI) * 1.2;
    const rr = r + gauss() * 0.3;
    push(stars, Math.cos(th) * rr, Math.sin(th) * rr, 0.78, 0.86, 1.0, 0.3, 1.0 + rnd());
  }
  const mk = (arr) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.STATIC_DRAW); return { b, n: arr.length / 7 }; };
  return { stars: mk(stars), dust: mk(dust) };
}

let broken = false;
const lc = makeLayerCache();
export function galaxyStarCount() { return bufs ? bufs.stars.n : 0; }

/** Рисует звёзды Галактики в квадрат размера size (CSS-пиксели) с центром (cx, cy), узор повёрнут на angle */
export function drawGalaxyGL(ctx, cx, cy, size, angle) {
  const gl = broken ? null : getGL();
  if (!gl) return false;
  try {
    const dpr = ctx.getTransform ? ctx.getTransform().a : 1;
    const N = Math.max(64, Math.min(2048, Math.round(size * dpr)));
    // 200 тысяч точек — самая тяжёлая сцена; картинка меняется только с поворотом узора — перерисовываем при повороте и не чаще ~10 раз в секунду
    const key = N + '|' + angle.toFixed(4);
    const tNow = performance.now();
    if (lc.canvas && lc.key.split('|')[0] === String(N) && (lc.key === key || (tNow - lc.t < 100 && tNow >= lc.t))) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(lc.canvas, 0, 0, N, N, cx - size / 2, cy - size / 2, size, size);
      ctx.restore();
      return true;
    }
    glResize(N, N);
    if (!bufs) bufs = build(gl);
    const { p, uni } = program('galaxy', FS, VS, ['aPos', 'aCol', 'aSize']);
    gl.useProgram(p);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(uni.uAngle, angle);
    gl.uniform1f(uni.uScale, 1 / 17);                  // поле ±17 кпк
    gl.uniform1f(uni.uPx, N / 900);
    const bind = (o) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, o.b);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 28, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 28, 8);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 28, 24);
    };
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);                       // звёзды складываются по яркости
    bind(bufs.stars); gl.drawArrays(gl.POINTS, 0, bufs.stars.n);
    gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);      // пыль поглощает свет за собой
    bind(bufs.dust); gl.drawArrays(gl.POINTS, 0, bufs.dust.n);
    gl.disable(gl.BLEND);
    gl.disableVertexAttribArray(1); gl.disableVertexAttribArray(2);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(layerStore(lc, key, tNow, N, N), 0, 0, N, N, cx - size / 2, cy - size / 2, size, size);
    ctx.restore();
    return true;
  } catch (e) {
    console.warn('GPU-галактика не удалась, возврат к 2D:', e.message);
    broken = true;
    return false;
  }
}
