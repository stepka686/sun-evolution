// Магнитная активность: астеросейсмология и корональные выбросы
import { S } from '../state.js';

// Модель магнитной активности и выбросов массы (CME)
export const activeCMEs = [];

export function getAsteroseismicData(state) {
  if (!state) return { freqHz: 200, breathOffset: 0, cyclePhase: 0, isMax: false };
  const m = Math.max(0.1, state.mass);
  const r = Math.max(0.01, state.r);
  const tNorm = Math.sqrt(Math.max(100, state.temp) / 5778.0);
  
  // Акустическая частота p-мод колебаний недр звезды
  const rawNu = (m / (r * r * tNorm));
  // Масштабирование частоты в слышимый диапазон (от 32 Гц для гигантов до 720 Гц для карликов)
  const audioPitchHz = Math.max(30, Math.min(850, 160 * Math.pow(rawNu, 0.35)));

  // Фаза дыхания радиуса фотосферы
  const breathSpeed = Math.max(0.001, Math.min(0.015, 0.003 * Math.sqrt(rawNu)));
  const breathOffset = Math.sin(performance.now() * breathSpeed) * (state.r > 20 ? 0.035 : 0.008);

  // Магнитный цикл активности динамо (для красных карликов — хаотичные частые супервспышки)
  const isRedDwarf = (S.selectedStarMass < 0.45);
  const cyclePeriodMs = isRedDwarf ? 4500 : 12000;
  const cyclePhase = (performance.now() % cyclePeriodMs) / cyclePeriodMs;
  const activityLevel = (Math.sin(cyclePhase * Math.PI * 2 - Math.PI / 2) + 1) * 0.5;

  return {
    freqHz: audioPitchHz,
    breathOffset: breathOffset,
    cyclePhase: cyclePhase,
    activityLevel: activityLevel,
    isMax: activityLevel > 0.82
  };
}

export function spawnCoronalMassEjection(state, baseScaleAU) {
  const angle = Math.random() * Math.PI * 2;
  const spread = 0.45 + Math.random() * 0.35;
  const speedAUperSec = 0.6 + Math.random() * 0.8;
  const cmeColor = state.temp > 10000 ? [186, 230, 253] : (state.temp < 4000 ? [239, 68, 68] : [251, 146, 60]);
  
  activeCMEs.push({
    spawnTime: performance.now(),
    angle: angle,
    spread: spread,
    distAU: (state.r / 215.0) * 1.05,
    speed: speedAUperSec,
    maxDistAU: 35.0,
    color: cmeColor,
    alpha: 0.95
  });
  if (activeCMEs.length > 8) activeCMEs.shift();
}
