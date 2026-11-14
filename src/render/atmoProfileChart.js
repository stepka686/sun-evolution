// Разрез атмосферы: профиль температуры по высоте, слои, облака и шкала давления (справа, декады)
const BAND = { tropo: 'rgba(56,189,248,0.10)', strato: 'rgba(16,185,129,0.08)', meso: 'rgba(148,163,184,0.06)', thermo: 'rgba(244,114,182,0.08)' };

const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
const fmtP = (p) => p >= 1 ? `${+p.toPrecision(2)} бар` : p >= 1e-3 ? `${+(p * 1000).toPrecision(2)} мбар`
  : `10${String(Math.round(Math.log10(p))).split('').map(c => SUP[c]).join('')} бар`;

let lastSig = '';
export function drawAtmoProfile(canvas, prof, planetLabel) {
  if (!canvas) return;
  const sig = prof ? `${planetLabel}|${prof.Ts.toFixed(1)}|${prof.p0.toPrecision(3)}|${prof.levels.at(-1).T.toFixed(0)}|${canvas.clientWidth}` : `none|${planetLabel}`;
  if (sig === lastSig) return;
  lastSig = sig;
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const W = canvas.clientWidth || 260, H = canvas.clientHeight || 170;
  if (canvas.width !== Math.round(W * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.font = '9px sans-serif';
  if (!prof) {
    ctx.fillStyle = '#64748b'; ctx.textAlign = 'center';
    ctx.fillText('Разреза нет: атмосферы нет или она — глубокая оболочка гиганта', W / 2, H / 2);
    ctx.textAlign = 'left';
    return;
  }
  const L = 30, R = 46, T = 10, B = 22, pw = W - L - R, ph = H - T - B;
  // ось температуры — по тропосфере и стратосфере; горячая термосфера уходит за край со стрелкой
  const inner = prof.levels.filter(l => l.z <= prof.layers[2].z1);
  let tMin = Math.min(...inner.map(l => l.T)) - 10, tMax = Math.max(...inner.map(l => l.T)) + 15;
  const X = (t) => L + (t - tMin) / (tMax - tMin) * pw;
  const Y = (z) => T + ph - z / prof.zTop * ph;
  // слои
  for (const l of prof.layers) {
    ctx.fillStyle = BAND[l.kind]; ctx.fillRect(L, Y(l.z1), pw, Y(l.z0) - Y(l.z1));
    ctx.strokeStyle = 'rgba(148,163,184,0.25)'; ctx.setLineDash([2, 3]);
    ctx.beginPath(); ctx.moveTo(L, Y(l.z1)); ctx.lineTo(L + pw, Y(l.z1)); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#94a3b8'; ctx.fillText(l.name, L + 3, Math.min(Y(l.z0) - 3, Y(l.z1) + 10));
  }
  for (const c of prof.clouds) {
    const y0 = Y(c.z1), y1 = Y(c.z0);
    ctx.fillStyle = c.kind === 'ozone' ? 'rgba(129,140,248,0.22)' : 'rgba(226,232,240,0.16)';
    ctx.fillRect(L + pw * 0.55, y0, pw * 0.45, y1 - y0);
    ctx.fillStyle = c.kind === 'ozone' ? '#a5b4fc' : '#e2e8f0'; ctx.textAlign = 'right';
    ctx.fillText(c.name, L + pw - 3, (y0 + y1) / 2 + 3); ctx.textAlign = 'left';
  }
  // профиль T(z)
  const grad = ctx.createLinearGradient(L, 0, L + pw, 0);
  grad.addColorStop(0, '#60a5fa'); grad.addColorStop(0.5, '#fbbf24'); grad.addColorStop(1, '#f87171');
  ctx.strokeStyle = grad; ctx.lineWidth = 2; ctx.beginPath();
  let off = null;
  prof.levels.forEach((l, i) => {
    const x = Math.min(X(l.T), L + pw), y = Y(l.z);
    if (x >= L + pw && !off) off = { y, T: prof.levels.at(-1).T };
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke(); ctx.lineWidth = 1;
  if (off) { ctx.fillStyle = '#f87171'; ctx.textAlign = 'right'; ctx.fillText(`→ ${Math.round(off.T)} K`, L + pw - 2, Y(prof.zTop) + 10); ctx.textAlign = 'left'; }
  // оси
  ctx.strokeStyle = 'rgba(148,163,184,0.5)'; ctx.strokeRect(L, T, pw, ph);
  ctx.fillStyle = '#94a3b8';
  const zStep = [1, 2, 5, 10, 20, 25, 50, 100].find(s => prof.zTop / s <= 5) || 100;
  for (let z = 0; z <= prof.zTop; z += zStep) { ctx.textAlign = 'right'; ctx.fillText(`${z}`, L - 3, Y(z) + 3); }
  ctx.save(); ctx.translate(8, T + ph / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.fillText('высота, км', 0, 0); ctx.restore();
  const tStep = [10, 20, 50, 100, 200].find(s => (tMax - tMin) / s <= 5) || 200;
  ctx.textAlign = 'center';
  for (let t = Math.ceil(tMin / tStep) * tStep; t <= tMax; t += tStep) ctx.fillText(`${t}`, X(t), H - 6);
  ctx.textAlign = 'right'; ctx.fillText('T, K', L + pw, H - 6);
  // давление — декады справа
  ctx.textAlign = 'left';
  const k0 = Math.floor(Math.log10(prof.p0));
  let lastY = 1e9;
  for (let k = k0; k > k0 - 12; k--) {
    const p = Math.pow(10, k);
    const lv = prof.levels.find(l => l.p <= p);
    if (!lv) break;
    const y = Y(lv.z);
    if (lastY - y < 11) continue;
    lastY = y;
    ctx.strokeStyle = 'rgba(148,163,184,0.5)'; ctx.beginPath(); ctx.moveTo(L + pw, y); ctx.lineTo(L + pw + 3, y); ctx.stroke();
    ctx.fillText(fmtP(p), L + pw + 5, y + 3);
  }
}
