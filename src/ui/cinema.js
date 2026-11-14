// Кинорежим: камера сама проходит ключевые моменты жизни звезды и её планет; можно записать видео (WebM).
// Сценарий строится из ключевых моментов трека (getTrackMarks) и результатов модели — дат «снежков»,
// убегающего парника, поглощения Земли, — а не из жёстко заданных чисел.
import { S } from '../state.js';
import { STAR_CATALOG } from '../data/catalog.js';
import { getTrackMarks } from '../model/timeline.js';
import { getRunawayOnset } from '../physics/climate.js';
import { getPlanetFate } from '../physics/orbits.js';

const HOLD = 2600, MOVE = 3200;   // мс: показ кадра и переход между ними
let run = null, recorder = null, chunks = [];

function scenario() {
  const m = getTrackMarks();
  const sun = S.selectedStarId === 'sun';
  const fmt = (t) => t < 0.01 ? `${(t * 1000).toFixed(2)} млн лет` : t < 1 ? `${(t * 1000).toFixed(0)} млн лет` : `${t.toFixed(2)} млрд лет`;
  const K = [];
  const add = (t, view, caption, extra = {}) => { if (Number.isFinite(t)) K.push({ t, view, caption: `${fmt(Math.max(0, t))} — ${caption}`, ...extra }); };
  if (sun) {
    add(0.01, 'space', 'молодое Солнце и рождение планет');
    add(0.7, 'surface', 'архей: тусклое Солнце, но парник держит океаны жидкими', { planet: 'earth', tod: 10 });
    add(2.3, 'surface', 'гуронский «снежок»: метан окислился, Земля замёрзла', { planet: 'earth', tod: 11 });
    add(4.57, 'surface', 'сегодня: 15 °C, Луна в 384 тыс. км', { planet: 'earth', tod: 6.4 });
    add(4.6, 'orbit', 'Земля с орбиты', { planet: 'earth' });
    const tRun = getRunawayOnset('earth');
    add(tRun - 0.05, 'surface', 'жара: океаны на грани кипения', { planet: 'earth', tod: 12 });
    add(tRun + 0.4, 'orbit', 'убегающий парник: океаны выкипели в паровую атмосферу', { planet: 'earth' });
    add(9.0, 'surface', 'марсианский оптимум: оттепель на Марсе', { planet: 'mars', tod: 12 });
    add(11.7, 'space', 'Солнце становится красным гигантом');
    const fe = getPlanetFate('earth');
    if (fe.type === 'engulfed') add(fe.t - 0.01, 'surface', 'последний закат Земли: Солнце на полнеба', { planet: 'earth', tod: 12 });
    add(12.45, 'space', 'планетарная туманность');
    add(12.95, 'space', 'белый карлик остывает');
  } else {
    const star = STAR_CATALOG.find(s => s.id === S.selectedStarId);
    add(0.0005, 'space', `${star ? star.name : 'звезда'} выходит на главную последовательность`);
    if (m.tams) { add(m.tams * 0.5, 'surface', 'середина жизни: вид с Земли', { planet: 'earth', tod: 12 }); add(m.tams, 'space', 'водород в ядре кончился'); }
    if (m.rgbTip) add(m.rgbTip, 'space', 'вершина ветви гигантов');
    if (m.sn !== undefined) { add(m.sn, 'space', 'сверхновая'); add(m.remnant, 'space', 'нейтронная звезда'); }
    else if (m.collapse !== undefined) add(m.remnant, 'space', 'коллапс в чёрную дыру');
    else if (m.remnant !== undefined) add(m.remnant, 'space', 'остаток звезды');
  }
  return K.sort((a, b) => a.t - b.t);
}

function clickView(view) {
  const b = document.querySelector(`#viewModeGroup [data-view="${view}"]`);
  if (b && S.currentView !== view) b.click();
}
function clickPlanet(planet) {
  const b = document.querySelector(`#planetGroup [data-planet="${planet}"]`);
  if (b && S.currentPlanet !== planet) b.click();
}

function applyKey(k) {
  if (k.planet) clickPlanet(k.planet);
  clickView(k.view);
  if (k.tod !== undefined) {
    S.timeOfDay = k.tod;
    const sl = document.getElementById('timeOfDaySlider'); if (sl) sl.value = k.tod;
  }
}

// Вызывается в начале каждого кадра: двигает время по сценарию
export function cinemaTick(now) {
  if (!run) return;
  const K = run.keys;
  const el = now - run.start;
  let acc = 0;
  for (let i = 0; i < K.length; i++) {
    const move = i === 0 ? 0 : MOVE, seg = move + HOLD;
    if (el < acc + seg) {
      if (run.idx !== i) { run.idx = i; applyKey(K[i]); }
      const prevT = i === 0 ? K[0].t : K[i - 1].t;
      const f = move ? Math.min(1, (el - acc) / move) : 1;
      const e = f * f * (3 - 2 * f);
      S.currentAge = prevT + (K[i].t - prevT) * e;
      run.caption = K[i].caption;
      run.fade = Math.min(1, (el - acc) / 400);
      return;
    }
    acc += seg;
  }
  stopCinema();
}

// Подпись поверх кадра — рисуется на холсте, чтобы попасть в запись
export function drawCinemaCaption(ctx, w, h) {
  if (!run || !run.caption) return;
  ctx.save();
  const a = Math.max(0, Math.min(1, run.fade));
  ctx.font = `600 ${Math.max(14, Math.min(22, w / 42))}px sans-serif`;
  const tw = ctx.measureText(run.caption).width;
  ctx.fillStyle = `rgba(2, 6, 23, ${(0.6 * a).toFixed(2)})`;
  ctx.fillRect(w / 2 - tw / 2 - 16, h * 0.08 - 26, tw + 32, 40);
  ctx.fillStyle = `rgba(248, 250, 252, ${a.toFixed(2)})`;
  ctx.textAlign = 'center';
  ctx.fillText(run.caption, w / 2, h * 0.08);
  if (recorder) { ctx.fillStyle = 'rgba(239,68,68,0.9)'; ctx.beginPath(); ctx.arc(24, 24, 7, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}

export function isCinemaRunning() { return !!run; }

export function startCinema(record = false) {
  const keys = scenario();
  if (!keys.length) return;
  S.isPlaying = false;
  if (S.isDeepTime) document.getElementById('deepTimeBtn')?.click();
  run = { keys, start: performance.now(), idx: -1, caption: '', fade: 0 };
  setButtons(true, record);
  if (record) startRecording();
}

export function stopCinema() {
  run = null;
  if (recorder && recorder.state !== 'inactive') recorder.stop();
  setButtons(false, false);
}

function startRecording() {
  const canvas = document.getElementById('mainCanvas');
  if (!canvas.captureStream || typeof MediaRecorder === 'undefined') { alertRec('Запись видео не поддерживается этим браузером'); return; }
  // Сначала MP4 (H.264) — его открывают Telegram, галерея телефона и любой плеер; WebM — запасной вариант
  const type = ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t));
  if (!type) { alertRec('Браузер не умеет кодировать видео'); return; }
  chunks = [];
  recorder = new MediaRecorder(canvas.captureStream(30), { mimeType: type, videoBitsPerSecond: 6e6 });
  recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  recorder.onstop = () => {
    const blob = new Blob(chunks, { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `evolution_${S.selectedStarId}.${type.includes('mp4') ? 'mp4' : 'webm'}`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    recorder = null;
  };
  recorder.start(500);
}

function alertRec(msg) {
  const b = document.getElementById('cinemaRecBtn');
  if (b) { b.innerText = msg; setTimeout(() => { b.innerText = '⏺ Записать'; }, 3000); }
}

function setButtons(running, rec) {
  const b = document.getElementById('cinemaBtn'), r = document.getElementById('cinemaRecBtn');
  if (b) { b.innerText = running ? '■ Стоп' : '🎬 Кино'; b.classList.toggle('active', running); }
  if (r) { r.style.display = running ? 'none' : ''; r.classList.toggle('active', rec); }
}

export function initCinema() {
  const b = document.getElementById('cinemaBtn'), r = document.getElementById('cinemaRecBtn');
  if (b) b.addEventListener('click', () => (run ? stopCinema() : startCinema(false)));
  if (r) r.addEventListener('click', () => startCinema(true));
  // любое ручное вмешательство в шкалу времени останавливает кино
  document.getElementById('timeSlider')?.addEventListener('pointerdown', () => { if (run) stopCinema(); });
}

export const _scenario = scenario;   // для тестов
