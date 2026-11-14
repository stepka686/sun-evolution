// Корона при полном затмении (5.3): картинка по формуле Баумбаха и форме цикла активности (physics/corona.js).
// Считается попиксельно в маленький холст (до 256²) и кэшируется: перерисовка — только при заметной смене активности,
// размера диска или экспозиции. Работает одинаково с видеокартой и без неё.
import { coronaBrightness, streamerLatitudes } from '../physics/corona.js';

const cache = { canvas: null, key: '' };
const AXIS = 16 * Math.PI / 180;          // наклон оси звезды на небе (позиционный угол)

/**
 * x, y, sunR — центр и радиус диска (CSS px); activity 0…1; toRgb(k) — цвет [0…255] для яркости короны k
 * (в долях яркости диска; вызывающий сам переводит её в экран со своей экспозицией); prom — протуберанцы
 */
export function drawCorona(ctx, x, y, sunR, activity, toRgb, keyExtra = '') {
  const Rout = sunR * 4.5;
  const dpr = ctx.getTransform ? Math.min(2, ctx.getTransform().a) : 1;
  const N = Math.max(48, Math.min(256, Math.round(2 * Rout * dpr)));
  const a = Math.round(activity * 20) / 20;
  const key = [N, a, keyExtra].join('|');
  if (key !== cache.key) {
    if (!cache.canvas) cache.canvas = document.createElement('canvas');
    const c = cache.canvas;
    c.width = c.height = N;
    const g = c.getContext('2d');
    const img = g.createImageData(N, N);
    const st = streamerLatitudes(a, 9, 3);
    // таблица цветов по логарифму яркости — без перевода в экран на каждом пикселе
    const LUT = [];
    for (let i = 0; i < 96; i++) LUT.push(toRgb(Math.pow(10, -9 + i * 0.05)));
    const sc = Rout / (N / 2) / sunR;      // радиусов звезды на пиксель холста
    const ca = Math.cos(AXIS), sa = Math.sin(AXIS);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const dx = (i + 0.5 - N / 2) * sc, dy = (j + 0.5 - N / 2) * sc;
      const rho = Math.hypot(dx, dy);
      if (rho < 0.98 || rho > 4.5) continue;
      // широта относительно экватора звезды (ось наклонена на AXIS)
      const ex = dx * ca + dy * sa, ey = -dx * sa + dy * ca;
      const lat = Math.atan2(-ey, Math.abs(ex));
      // тонкая радиальная структура: стримеры и щёточки — лучи с мелкой зернистостью по углу
      const ang = Math.atan2(ey, ex);
      const fine = 0.8 + 0.2 * Math.sin(ang * 37 + Math.sin(ang * 11) * 3) * Math.sin(ang * 23 + 1.3);
      const k = coronaBrightness(rho, lat, a, st) * fine * (rho < 1 ? 0 : 1);
      const li = Math.max(0, Math.min(95, Math.round((Math.log10(Math.max(1e-12, k)) + 9) / 0.05)));
      const col = LUT[li];
      const o = (j * N + i) * 4;
      // мягкий край у внешней границы
      const fade = Math.min(1, (4.5 - rho) / 1.2);
      img.data[o] = col[0] * fade; img.data[o + 1] = col[1] * fade; img.data[o + 2] = col[2] * fade; img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    // протуберанцы: красные петли Hα у лимба, в максимуме цикла их больше
    const n = 2 + Math.round(4 * a);
    g.save(); g.translate(N / 2, N / 2);
    const Rp = (N / 2) / 4.5;
    g.globalCompositeOperation = 'lighter';
    for (let p = 0; p < n; p++) {
      const ang = p * 2.39996 + 0.7;
      const hgt = Rp * (0.05 + 0.06 * ((p * 7) % 3));
      g.strokeStyle = 'rgba(255,60,90,0.85)'; g.lineWidth = Math.max(1, Rp * 0.025);
      g.beginPath(); g.arc(Math.cos(ang) * Rp, Math.sin(ang) * Rp, hgt, ang - Math.PI / 2 - 0.2, ang + Math.PI / 2 + 0.2); g.stroke();
    }
    g.restore();
    cache.key = key;
  }
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(cache.canvas, 0, 0, N, N, x - Rout, y - Rout, 2 * Rout, 2 * Rout);
  ctx.restore();
}
