// Общий WebGL-контекст 5.0: один невидимый холст на всё приложение. Шейдеры рисуют в него, а готовый кадр
// копируется на обычный 2D-холст через drawImage — так GPU-слои и 2D-подписи живут вместе (гибридный рендер).
// Если WebGL нет, контекст потерян или пользователь выключил GPU — возвращается null, и работает старый 2D-путь.
import { S } from '../state.js';

let gl = null, canvas = null, failed = false, isGL2 = false;
const onRestore = new Set();
const programs = new Map();
let lostAt = 0;

export function glAvailable() {
  return !!getGL();
}

export function getGL() {
  if (S.renderer === '2d' || failed) return null;
  if (gl && !gl.isContextLost()) return gl;
  if (gl && gl.isContextLost()) return null;
  if (typeof document === 'undefined') return null;
  try {
    canvas = document.createElement('canvas');
    canvas.width = canvas.height = 2;
    const opts = { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' };
    gl = canvas.getContext('webgl2', opts);
    isGL2 = !!gl;
    if (!gl) gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts);
    if (!gl) { failed = true; return null; }
    // телефоны иногда забирают контекст (сворачивание, нехватка памяти) — откатываемся на 2D и пробуем вернуться
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lostAt = performance.now(); programs.clear(); }, false);
    canvas.addEventListener('webglcontextrestored', () => { programs.clear(); onRestore.forEach(f => f()); }, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    return gl;
  } catch (e) {
    failed = true; gl = null; return null;
  }
}

/** Модули, которые держат текстуры, сбрасывают кэши при восстановлении контекста */
export function onContextRestored(fn) { onRestore.add(fn); }

export function glCanvas() { return canvas; }
export function glInfo() {
  const g = getGL();
  if (!g) return { ok: false, reason: S.renderer === '2d' ? 'выключен' : failed ? 'нет WebGL' : lostAt ? 'контекст потерян' : 'нет' };
  let renderer = '';
  try { const ext = g.getExtension('WEBGL_debug_renderer_info'); if (ext) renderer = g.getParameter(ext.UNMASKED_RENDERER_WEBGL); } catch (e) { /* нет расширения */ }
  return { ok: true, version: isGL2 ? 'WebGL 2' : 'WebGL 1', renderer };
}

/**
 * Область рисования w×h (пиксели устройства). 5.5.1: холст только растёт — смена его размера пересоздаёт буфер
 * на видеокарте, и при чередовании проходов разного размера (небо, облака, карта теней, шар планеты) это съедало
 * больше половины кадра. Проход рисует в левый нижний угол холста (viewport + scissor), копируют его через glSrcY.
 */
let vw = 0, vh = 0;
export function glResize(w, h) {
  if (canvas.width < w || canvas.height < h) {
    canvas.width = Math.max(canvas.width, Math.ceil(w / 64) * 64);
    canvas.height = Math.max(canvas.height, Math.ceil(h / 64) * 64);
  }
  vw = w; vh = h;
  gl.viewport(0, 0, w, h);
  gl.enable(gl.SCISSOR_TEST);
  gl.scissor(0, 0, w, h);
}
/** Верх области последнего прохода в координатах картинки холста (у WebGL начало — внизу слева) */
export function glSrcY() { return canvas.height - vh; }

function compile(type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS) && !gl.isContextLost()) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error('Шейдер не собрался: ' + log);
  }
  return sh;
}

/** Программа по имени (кэшируется): вершинный шейдер — полноэкранный прямоугольник, если vs не задан */
export function program(name, fs, vs = QUAD_VS, attribs = ['aPos']) {
  if (programs.has(name)) return programs.get(name);
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
  attribs.forEach((a, i) => gl.bindAttribLocation(p, i, a));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error('Программа не слинковалась: ' + gl.getProgramInfoLog(p));
  const uni = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const u = gl.getActiveUniform(p, i); uni[u.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, u.name); }
  const entry = { p, uni };
  programs.set(name, entry);
  return entry;
}

let quadBuf = null, quadGl = null;
onContextRestored(() => { quadBuf = null; });
/** Рисует полноэкранный прямоугольник (два треугольника) */
export function drawQuad() {
  // gl.isBuffer — синхронный запрос к GPU, на телефонах он останавливает конвейер; помним буфер сами
  if (!quadBuf || quadGl !== gl) {
    quadGl = gl;
    quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
}

/** Текстура из массива байтов (RGBA/RGB/LUMINANCE), с повтором по горизонтали */
export function makeTexture(w, h, data, format, opts = {}) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  const f = format === 'rgb' ? gl.RGB : format === 'lum' ? gl.LUMINANCE : gl.RGBA;
  gl.texImage2D(gl.TEXTURE_2D, 0, f, w, h, 0, f, gl.UNSIGNED_BYTE, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, opts.clampS ? gl.CLAMP_TO_EDGE : gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

export const QUAD_VS = `
attribute vec2 aPos;
varying vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

/** Общие функции GLSL: хеш-шум и fbm на сфере (для мелких деталей поверх текстуры) */
export const GLSL_NOISE = `
float hash3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash3(i), hash3(i + vec3(1,0,0)), f.x), mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x), mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm3(vec3 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; } return s; }`;

/** Для тестов и переключателя: сброс (новый контекст при следующем вызове) */
export function isWebGL2() { return isGL2; }
export function glReset() { gl = null; canvas = null; failed = false; programs.clear(); }

/**
 * Кэш кадра GPU-слоя: результат шейдера копируется в обычный 2D-холст и рисуется оттуда, пока не устареет.
 * Копирование из WebGL на телефоне — самая дорогая операция гибридного рендера (синхронизация с видеокартой),
 * поэтому медленно меняющиеся слои (шар планеты, диск звезды, Галактика) обновляются не каждый кадр.
 */
export function makeLayerCache() { return { canvas: null, key: '', t: -1e9 }; }
export function layerFresh(c, key, now, maxAgeMs) { return c.canvas && c.key === key && now - c.t < maxAgeMs && now >= c.t; }
export function layerStore(c, key, now, W, H) {
  if (!c.canvas) c.canvas = document.createElement('canvas');
  if (c.canvas.width !== W || c.canvas.height !== H) { c.canvas.width = W; c.canvas.height = H; }
  const x = c.canvas.getContext('2d');
  x.clearRect(0, 0, W, H);
  x.drawImage(canvas, 0, canvas.height - vh, W, H, 0, 0, W, H);
  c.key = key; c.t = now;
  return c.canvas;
}
