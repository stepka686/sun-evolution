// Процедурные частицы фона

export const spaceStars = [];

for (let i = 0; i < 240; i++) {
  spaceStars.push({
    x: Math.random() * 2 - 1,
    y: Math.random() * 2 - 1,
    vx: (Math.random() - 0.5) * 0.035,
    vy: (Math.random() - 0.5) * 0.035,
    size: Math.random() * 1.5 + 0.4,
    alpha: Math.random() * 0.7 + 0.3
  });
}

export const protoDust = [];

for (let i = 0; i < 160; i++) {
  protoDust.push({
    angle: Math.random() * Math.PI * 2,
    dist: Math.random() * 0.9 + 0.1,
    speed: (Math.random() * 0.8 + 0.5) * (Math.random() > 0.5 ? 1 : -1),
    size: Math.random() * 2.2 + 1.0,
    alpha: Math.random() * 0.6 + 0.2
  });
}

export const oortObjects = [];

for (let i = 0; i < 200; i++) {
  oortObjects.push({
    angle: Math.random() * Math.PI * 2,
    distAU: Math.pow(Math.random(), 2.2) * 80000 + 1500,
    inc: (Math.random() * 2 - 1) * 0.8,
    speed: Math.random() * 0.4 + 0.8,
    size: Math.random() * 1.4 + 0.5
  });
}

export const cometStorm = [];

for (let i = 0; i < 35; i++) {
  cometStorm.push({
    angle: Math.random() * Math.PI * 2,
    distAU: 2.2 + Math.random() * 8.5,
    speed: 0.8 + Math.random() * 1.4,
    size: 1.2 + Math.random() * 1.5,
    tailLen: 25 + Math.random() * 35,
    alpha: 0.4 + Math.random() * 0.5
  });
}

export const stellarWindStream = [];

for (let i = 0; i < 75; i++) {
  stellarWindStream.push({
    angle: Math.random() * Math.PI * 2,
    distFactor: Math.random(),
    speed: 0.4 + Math.random() * 0.8,
    size: 0.8 + Math.random() * 1.6,
    alpha: 0.3 + Math.random() * 0.7
  });
}

// Процедурные структуры солнечных пятен и магнитных петель
export const staticSunspots = [
  { lat: 0.18, lon: 0.25, r: 0.08, umbra: 0.045 },
  { lat: -0.22, lon: 0.40, r: 0.06, umbra: 0.032 },
  { lat: 0.15, lon: -0.30, r: 0.09, umbra: 0.052 },
  { lat: -0.28, lon: -0.15, r: 0.05, umbra: 0.028 }
];
