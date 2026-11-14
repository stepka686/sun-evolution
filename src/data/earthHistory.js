// История состава атмосферы Земли (вход климатической модели). Источник CO₂/CH₄/O₂ и для атмосферы, и для биосферы.
// Значения — в пределах литературных оценок (Catling & Zahnle 2020; Kasting 2014; Pavlov et al. 2003; Lyons et al. 2014;
// Caldeira & Kasting 1992 — будущее падение CO₂ из-за ускоренного выветривания).
// Температура из этой таблицы НЕ берётся — её считает модель энергобаланса (physics/energyBalance.js).
// Убегающий парник, выкипание океанов и высыхание до венерианского состояния таблица тоже не задаёт — их находит расчёт.
//
// regime: 'thick' — плотная атмосфера (серая модель), 'wet' — тонкая атмосфера над океаном (модель Будыко — Селлерса)
// co2ppm/ch4ppm — объёмные доли; если заданы co2From/co2To, CO₂ меняется логарифмически внутри эпохи

export const EARTH_EPOCHS = [
  { t0: -1, t1: 0.0, regime: 'thick', pBar: 45, co2ppm: 550000, ch4ppm: 0, o2pct: 0,
    event: 'Аккреция: плотная протоатмосфера из водяного пара и углекислоты над магматическим океаном',
    gases: [['CO₂', 55, '#ef4444'], ['H₂O', 35, '#38bdf8'], ['N₂', 10, '#3b82f6']] },
  { t0: 0.0, t1: 0.6, regime: 'thick', pBar: 12.5, co2ppm: 720000, ch4ppm: 0, o2pct: 0,
    event: 'Катархей: конденсация первичных океанов под плотным куполом CO₂',
    gases: [['CO₂', 72, '#ef4444'], ['N₂', 22, '#3b82f6'], ['H₂O/SO₂', 6, '#eab308']] },
  { t0: 0.6, t1: 2.1, regime: 'wet', pBar: 1.65, co2From: 100000, co2To: 20000, ch4ppm: 40000, o2pct: 0.02,
    event: 'Архей: бескислородная атмосфера с метановым смогом — парник спасает от тусклого молодого Солнца',
    gases: [['N₂', 90, '#3b82f6'], ['CO₂', 5.5, '#ef4444'], ['CH₄', 4, '#f59e0b'], ['Ar', 0.5, '#a855f7']] },
  { t0: 2.1, t1: 2.45, regime: 'wet', pBar: 0.92, co2ppm: 4500, ch4ppm: 5, o2pct: 2.1,
    event: 'Кислородная катастрофа: кислород окислил метан, парник рухнул',
    gases: [['N₂', 96.6, '#3b82f6'], ['O₂', 2.1, '#10b981'], ['CO₂', 0.45, '#ef4444'], ['Ar', 0.85, '#a855f7']] },
  { t0: 2.45, t1: 3.85, regime: 'wet', pBar: 0.98, co2ppm: 5000, ch4ppm: 100, o2pct: 4.5,
    event: 'Протерозой («скучный миллиард»): медленное накопление кислорода эукариотами',
    gases: [['N₂', 94, '#3b82f6'], ['O₂', 4.5, '#10b981'], ['CO₂', 0.5, '#ef4444'], ['Ar', 1, '#a855f7']] },
  { t0: 3.85, t1: 4.02, regime: 'wet', pBar: 1.0, co2ppm: 250, ch4ppm: 2, o2pct: 12,
    event: 'Криогений: выветривание гор Родинии вытянуло CO₂ из атмосферы',
    gases: [['N₂', 87, '#3b82f6'], ['O₂', 12, '#10b981'], ['Ar', 1, '#a855f7']] },
  { t0: 4.02, t1: 4.30, regime: 'wet', pBar: 1.38, co2ppm: 850, ch4ppm: 2, o2pct: 31.5,
    event: 'Палеозой: гигантские папоротниковые леса и пик кислорода 32%',
    gases: [['N₂', 67, '#3b82f6'], ['O₂', 32, '#10b981'], ['Ar/CO₂', 1, '#a855f7']] },
  { t0: 4.30, t1: 4.75, regime: 'wet', pBar: 1.013, co2ppm: 420, ch4ppm: 1.9, o2pct: 20.9,
    event: 'Кайнозой (современность): азотно-кислородная атмосфера',
    gases: [['N₂', 78, '#3b82f6'], ['O₂', 21, '#10b981'], ['Ar', 1, '#a855f7']] },
  { t0: 4.75, t1: 5.1, regime: 'wet', pBar: 1.05, co2From: 420, co2To: 150, ch4ppm: 1.5, o2pct: 17.5,
    event: 'Пангея Ультима: ускоренное выветривание вытягивает CO₂',
    gases: [['N₂', 81, '#3b82f6'], ['O₂', 17.5, '#10b981'], ['H₂O', 1.5, '#38bdf8']] },
  { t0: 5.1, t1: 5.5, regime: 'wet', pBar: 1.05, co2From: 150, co2To: 8, ch4ppm: 1, o2pct: 3,
    event: 'CO₂ ниже предела фотосинтеза: гибель растений, кислород иссякает',
    gases: [['N₂', 93, '#3b82f6'], ['O₂', 3, '#10b981'], ['H₂O', 4, '#38bdf8']] },
  { t0: 5.5, t1: 1e9, regime: 'wet', pBar: 1.05, co2From: 8, co2To: 1, co2Span: 0.3, ch4ppm: 1, o2pct: 0,
    event: 'Бескислородная влажная атмосфера: жизнь отступает к экстремофилам',
    gases: [['N₂', 92, '#3b82f6'], ['H₂O', 8, '#38bdf8']] }
];

// Опорные точки истории (4.9): между ними значения перетекают непрерывно (давление и доли газов — по логарифму),
// а не меняются скачком на границе эпох. Опорные точки стоят внутри эпох, переходы занимают оставшееся время.
// Резкие климатические события («снежки») возникают сами — когда парниковых газов становится меньше порога,
// при котором у энергобаланса пропадает тёплое равновесие.
export const EARTH_ANCHORS = [
  { t: -0.05, pBar: 45, co2ppm: 550000, ch4ppm: 0.01, o2pct: 0, h2oPct: 35, so2ppm: 2000, h2ppm: 5000 },
  { t: 0.30, pBar: 12.5, co2ppm: 720000, ch4ppm: 0.01, o2pct: 0, h2oPct: 5, so2ppm: 1000, h2ppm: 3000 },
  { t: 0.75, pBar: 1.65, co2ppm: 100000, ch4ppm: 40000, o2pct: 1e-6, h2ppm: 1500 },
  { t: 2.10, pBar: 1.65, co2ppm: 20000, ch4ppm: 40000, o2pct: 1e-5, h2ppm: 1000 },
  { t: 2.24, pBar: 0.92, co2ppm: 4500, ch4ppm: 5, o2pct: 2.1, h2ppm: 1 },
  { t: 2.34, pBar: 0.92, co2ppm: 4500, ch4ppm: 5, o2pct: 2.1, h2ppm: 1 },
  { t: 2.44, pBar: 0.98, co2ppm: 5000, ch4ppm: 100, o2pct: 4.5, h2ppm: 1 },
  { t: 3.78, pBar: 0.98, co2ppm: 5000, ch4ppm: 100, o2pct: 4.5, h2ppm: 1 },
  { t: 3.87, pBar: 1.0, co2ppm: 250, ch4ppm: 2, o2pct: 12, h2ppm: 0.5 },
  { t: 3.93, pBar: 1.0, co2ppm: 250, ch4ppm: 2, o2pct: 12, h2ppm: 0.5 },
  { t: 4.08, pBar: 1.38, co2ppm: 850, ch4ppm: 2, o2pct: 31.5, h2ppm: 0.5 },
  { t: 4.27, pBar: 1.38, co2ppm: 850, ch4ppm: 2, o2pct: 31.5, h2ppm: 0.5 },
  { t: 4.45, pBar: 1.013, co2ppm: 420, ch4ppm: 1.9, o2pct: 20.9, h2ppm: 0.5 },
  { t: 4.75, pBar: 1.013, co2ppm: 420, ch4ppm: 1.9, o2pct: 20.9, h2ppm: 0.5 },
  { t: 5.10, pBar: 1.05, co2ppm: 150, ch4ppm: 1.5, o2pct: 17.5, h2ppm: 0.5 },
  { t: 5.50, pBar: 1.05, co2ppm: 8, ch4ppm: 1, o2pct: 3, h2ppm: 0.5 },
  { t: 5.80, pBar: 1.05, co2ppm: 1, ch4ppm: 1, o2pct: 1e-4, h2ppm: 0.5 }
];

const KEYS = ['pBar', 'co2ppm', 'ch4ppm', 'o2pct', 'h2oPct', 'so2ppm', 'h2ppm'];
const lerpLog = (a, b, f) => (a > 0 && b > 0 ? Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * f) : a + (b - a) * f);

/** Непрерывные значения состава в момент t (млрд лет) */
export function earthAnchorsAt(t) {
  const A = EARTH_ANCHORS;
  if (t <= A[0].t) return { ...A[0] };
  if (t >= A[A.length - 1].t) return { ...A[A.length - 1] };
  let i = 0; while (i < A.length - 2 && A[i + 1].t <= t) i++;
  const a = A[i], b = A[i + 1];
  const x = (t - a.t) / (b.t - a.t), f = x * x * (3 - 2 * x);     // плавный вход и выход из перехода
  const out = { t };
  for (const k of KEYS) {
    if (k === 'h2oPct') continue;
    if (a[k] === undefined || b[k] === undefined) continue;
    out[k] = lerpLog(a[k], b[k], f);
  }
  // плотная атмосфера задаёт долю пара сама; в тонкой её считает Клаузиус — Клапейрон
  if (a.h2oPct !== undefined) {
    const h = lerpLog(a.h2oPct, b.h2oPct ?? 0.3, f);
    if (h >= 0.5) out.h2oPct = h;
  }
  return out;
}

// Состав атмосферы Земли в момент t (млрд лет) для солнечной системы: непрерывные значения + текст эпохи.
// Порог 9.5 бар — давление, при котором серая плотная модель и Будыко — Селлерс дают одну температуру (~14 °C)
export function earthEpochAt(t) {
  const e = EARTH_EPOCHS.find(x => t >= x.t0 && t < x.t1) || (t < 0 ? EARTH_EPOCHS[0] : EARTH_EPOCHS[EARTH_EPOCHS.length - 1]);
  const v = earthAnchorsAt(t);
  return { ...e, ...v, regime: v.pBar > 9.5 ? 'thick' : 'wet', co2From: undefined, co2To: undefined };
}

// Современная Земля — состав для Земли, перенесённой к другой звезде
export const MODERN_EARTH = EARTH_EPOCHS.find(e => e.t0 === 4.30);
