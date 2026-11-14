// Звук звезды (5.1): настоящий спектр солнцеподобных колебаний, перенесённый в слышимый диапазон.
// Конвекция у поверхности непрерывно «бьёт» по звезде, и в ней звучат стоячие звуковые волны (p-моды).
// Их частоты подчиняются асимптотическому соотношению Таселя (1980):
//     ν(n, l) ≈ Δν · (n + l/2 + ε) − δν₀ₗ,
// а громкость — гауссова огибающая вокруг ν_max шириной ~0.66·ν_max^0.88 мкГц (Mosser et al. 2012).
// Каждая мода живёт несколько дней и возбуждается заново случайными ударами конвекции — поэтому звук «дышит».
// Перенос в слух: ν_max → f₀ = 220 Гц · (ν_max / ν_max☉)^½ — карлики звенят, гиганты уходят в бас,
// а соотношения частот мод внутри звезды (тембр) сохраняются точно: f = f₀ · ν / ν_max.

export const NUMAX_SUN = 3090;            // мкГц
const F_SUN = 220;                        // Гц — так «звучит» Солнце

/** Слышимая частота, на которую переносится ν_max звезды */
export const audioCenter = (numax) => Math.max(18, Math.min(1400, F_SUN * Math.sqrt(numax / NUMAX_SUN)));

/** Фаза ε в соотношении Таселя: эмпирически растёт с Δν (White et al. 2011): Солнце ≈ 1.4, гиганты ≈ 1.0 */
export const epsilonOf = (dnu) => Math.max(0.8, Math.min(1.5, 0.63 + 0.37 * Math.log10(Math.max(1, dnu))));

/**
 * Спектр мод: [{ n, l, nu (мкГц), amp (0…1), f (Гц) }] — радиальные (l = 0), дипольные (l = 1) и квадрупольные (l = 2)
 * в пределах ±2.5 ширин огибающей.
 */
export function pmodeSpectrum(numax, dnu) {
  const eps = epsilonOf(dnu);
  const fwhm = 0.66 * Math.pow(numax, 0.88);
  const sigma = fwhm / 2.355;
  const d02 = 0.122 * dnu;                // малое разделение — чувствительно к составу ядра (возрасту)
  const vis = [1.0, 1.5, 0.5];            // видимость мод по l (усреднение по диску)
  const f0 = audioCenter(numax);
  const nmax = numax / dnu - eps;
  const out = [];
  for (let n = Math.max(1, Math.floor(nmax - 6)); n <= Math.ceil(nmax + 6); n++) {
    for (let l = 0; l <= 2; l++) {
      const nu = dnu * (n + l / 2 + eps) - (l === 2 ? d02 : 0);
      const env = Math.exp(-0.5 * ((nu - numax) / sigma) ** 2);
      if (env < 0.03) continue;
      out.push({ n, l, nu, amp: env * vis[l] / 1.5, f: f0 * nu / numax });
    }
  }
  return out;
}

const N_OSC = 36;

/** Синтезатор мод: банк синусоид со случайным возбуждением, подключается к узлу out */
export function createModeSynth(ctx, out) {
  const bank = [];
  const bus = ctx.createGain();
  bus.gain.value = 0.0001;
  bus.connect(out);
  for (let i = 0; i < N_OSC; i++) {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 220;
    const g = ctx.createGain(); g.gain.value = 0;
    o.connect(g); g.connect(bus); o.start();
    bank.push({ o, g, kick: 0 });
  }
  let lastKick = 0;
  return {
    bus,
    /** Обновить спектр (вызывается каждый кадр); on — звучать или молчать */
    update(numax, dnu, on) {
      const t = ctx.currentTime;
      bus.gain.setTargetAtTime(on ? 0.5 : 0.0001, t, 0.2);
      if (!on) return;
      const modes = pmodeSpectrum(numax, dnu).sort((a, b) => b.amp - a.amp).slice(0, N_OSC);
      // удары конвекции: раз в ~0.15 с случайным модам даётся новая амплитуда (затухание — постоянная времени)
      const kickNow = t - lastKick > 0.15;
      if (kickNow) lastKick = t;
      bank.forEach((b, i) => {
        const m = modes[i];
        if (!m || m.f < 15 || m.f > 5000) { b.g.gain.setTargetAtTime(0, t, 0.1); return; }
        b.o.frequency.setTargetAtTime(m.f, t, 0.05);
        // динамик телефона не играет ниже ~150 Гц: басовым модам гигантов даём обертоны (пила), чтобы их было слышно
        const type = m.f < 150 ? 'sawtooth' : 'sine';
        if (b.o.type !== type) b.o.type = type;
        if (kickNow && Math.random() < 0.35) b.kick = Math.random();
        const a = m.amp * (0.25 + 0.75 * b.kick) / Math.sqrt(N_OSC) * (m.f < 150 ? 0.45 : 1);
        b.g.gain.setTargetAtTime(a, t, 0.6);
        b.kick *= 0.97;
      });
    }
  };
}
