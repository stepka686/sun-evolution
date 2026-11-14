// Вид «α Центавра»
import { interstellarBadge } from '../dom.js';
import { getStarColor } from './colors.js';
import { spaceStars } from './particles.js';
import { S } from '../state.js';
import { rgba } from '../util/color.js';

export function drawInterstellarView(ctx, w, h, state, now) {

  ctx.fillStyle = '#010207';
  ctx.fillRect(0, 0, w, h);

  for (let s of spaceStars) {
    ctx.fillStyle = rgba(255, 255, 255, s.alpha * 0.9);
    ctx.beginPath();
    ctx.arc((s.x + 1) * 0.5 * w, (s.y + 1) * 0.38 * h, s.size, 0, Math.PI * 2);
    ctx.fill();
  }

  const sunX = w * 0.55;
  const sunY = h * 0.40;
  const mAbs = 4.83 - 2.5 * Math.log10(Math.max(1e-12, state.l));
  const mApp = mAbs + 5 * Math.log10(1.34) - 5;
  interstellarBadge.innerText = `α Центавра (4.37 св. года) • m_V = ${mApp > 0 ? '+' : ''}${mApp.toFixed(1)}`;

  const scale = Math.min(w, h) / 460;
  // Векторы собственного движения звезд созвездия Кассиопеи
  const casAgeGyr = state.t;
  const casStars = [
    { name: 'β Каф', dx: (-220 + casAgeGyr * 14.5) * scale, dy: (-25 - casAgeGyr * 8.2) * scale, mag: 2.28, color: '#f8fafc' },
    { name: 'α Шедар', dx: (-165 - casAgeGyr * 9.1) * scale, dy: (40 + casAgeGyr * 12.0) * scale, mag: 2.24, color: '#fed7aa' },
    { name: 'γ Нави', dx: (-110 + casAgeGyr * 6.4) * scale, dy: (-20 + casAgeGyr * 15.3) * scale, mag: 2.15, color: '#bae6fd' },
    { name: 'δ Рукбах', dx: (-60 - casAgeGyr * 18.0) * scale, dy: (30 - casAgeGyr * 7.5) * scale, mag: 2.68, color: '#f1f5f9' },
    { name: 'ε Сегин', dx: (-20 + casAgeGyr * 11.2) * scale, dy: (-10 + casAgeGyr * 10.4) * scale, mag: 3.35, color: '#e0f2fe' }
  ];

  ctx.strokeStyle = 'rgba(96, 165, 250, 0.45)';
  ctx.lineWidth = 1.3;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(sunX + casStars[0].dx, sunY + casStars[0].dy);
  for (let i = 1; i < casStars.length; i++) {
    ctx.lineTo(sunX + casStars[i].dx, sunY + casStars[i].dy);
  }
  ctx.lineTo(sunX, sunY);
  ctx.stroke();
  ctx.setLineDash([]);

  for (let st of casStars) {
    const sx = sunX + st.dx;
    const sy = sunY + st.dy;
    ctx.fillStyle = st.color;
    ctx.beginPath();
    ctx.arc(sx, sy, Math.max(1.5, 4.0 - st.mag * 0.65), 0, Math.PI * 2);
    ctx.fill();

    ctx.font = `${Math.max(8, Math.round(9 * scale))}px sans-serif`;
    ctx.fillStyle = 'rgba(203, 213, 225, 0.75)';
    ctx.fillText(st.name, sx + 5, sy - 4);
  }

  if (state.t >= 12.34 && state.t <= 12.58 && !S.isDeepTime) {
    const nebProgress = (state.t - 12.34) / 0.24;
    const nebR = (35 + nebProgress * 65) * scale;
    const nebAlpha = Math.sin(nebProgress * Math.PI) * 0.75;

    ctx.save();
    const nebGrad = ctx.createRadialGradient(sunX, sunY, 3, sunX, sunY, nebR);
    nebGrad.addColorStop(0, `rgba(56, 189, 248, ${nebAlpha * 0.8})`);
    nebGrad.addColorStop(0.35, `rgba(45, 212, 191, ${nebAlpha * 0.5})`);
    nebGrad.addColorStop(0.7, `rgba(236, 72, 153, ${nebAlpha * 0.35})`);
    nebGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = nebGrad;
    ctx.beginPath();
    ctx.arc(sunX, sunY, nebR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const colors = getStarColor(state.temp);
  const isVisibleNakedEye = (mApp <= 6.5);

  if (isVisibleNakedEye) {
    const pointR = Math.max(1.2, Math.min(2.8, (4.5 - mApp * 0.35) * 0.55));
    ctx.fillStyle = colors.core;
    ctx.beginPath();
    ctx.arc(sunX, sunY, pointR, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.beginPath();
    ctx.arc(sunX, sunY, 0.8, 0, Math.PI * 2);
    ctx.fill();
  }

  const calloutR = Math.max(14, 16 * scale);
  ctx.strokeStyle = isVisibleNakedEye ? 'rgba(56, 189, 248, 0.8)' : 'rgba(148, 163, 184, 0.45)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(sunX, sunY, calloutR, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = isVisibleNakedEye ? '#60a5fa' : '#94a3b8';
  ctx.font = `bold ${Math.max(10, Math.round(11 * scale))}px sans-serif`;
  ctx.fillText("☉ Солнце (Sol)", sunX + calloutR + 20, sunY - 14);

  ctx.fillStyle = '#cbd5e1';
  ctx.font = `${Math.max(8, Math.round(9.5 * scale))}px sans-serif`;
  ctx.fillText(`m_V = ${mApp > 0 ? '+' : ''}${mApp.toFixed(1)} • 4.37 св. года`, sunX + calloutR + 20, sunY - 2);
}
