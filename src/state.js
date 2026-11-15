// Общее изменяемое состояние приложения (раньше — 50 глобальных переменных)

export const S = {
  currentDynamicStages: null,
  selectedStarId: 'sun',
  currentDeepStages: null,
  selectedStarMass: 1.0,
  selectedFeH: 0,
  currentStarObs: null,    // наблюдаемые T_eff и L звезды каталога (для подгонки возраста)
  formulaOpen: false,
  hrBigOpen: false,
  fps: 60,
  lowQuality: false,
  mainDprApplied: 0,       // адаптивное качество при низкой частоте кадров        // полноэкранная диаграмма Г—Р      // открыта панель «Формулы»
  formulaKey: 'lum',          // металличность [Fe/H] выбранной звезды (0 — солнечная)
  isBinarySystem: false,
  isGwDetector: false,
  customExoplanets: [],
  binaryCompanion: { mass: 1.15, rAU: 1.35, accretedMass: 0, isSupernovaIa: false, snIaProgress: 0 },
  currentAge: 4.60,
  isPlaying: false,
  basePlaySpeed: 0.08,
  speedMultiplier: 1.0,
  currentView: 'space',
  currentPlanet: 'earth',
  cameraFocus: 'sun',
  tideFactor: 1, // множитель силы приливов (неопределённость теории приливов: ×0.3 … ×3)
  isDeepTime: false,
  timeOfDay: 12.0,
  dayOfYear: 105,           // день года для вида с поверхности (сезон)
  showConstellations: false,
  lookAway: false,
  lookAt: null,                // 5.4: 'andromeda' — смотреть на M31
  presentAge: 4.57,            // 5.4: возраст выбранной звезды «сегодня»
  andromedaScenario: 'gaia2026', // 5.4: сценарий орбиты M31 (physics/andromeda.js)
  perception: 'eye',           // 5.3.1: 'eye' — как видит глаз (блик, сумеречное зрение, адаптация), 'camera' — без этого
  renderer: 'gl',
  telescopeOpen: false,      // 5.1: панель транзитной спектроскопии            // 5.0: 'gl' — шейдеры на видеокарте, '2d' — прежний рендер на процессоре          // вид с поверхности: спиной к звезде (антисолнечная сторона — радуги, полная Луна)
  camPitchDeg: 0,
  isCutaway: false,
  isHzVisible: true,
  isHelioVisible: true,
  isHydroEqVisible: false,
  isSoundOn: false,
  isAurorasOn: true,
  spectrumMode: 'star',
  isExpeditionActive: false,
  currentExpStep: 0,
  lastAnimTime: performance.now(),
  isDraggingHR: false,
  camX: 0,
  camY: 0,
  camZoom: 1.0,
  isDragging: false,
  dragStartX: 0,
  dragStartY: 0,
  initialPinchDist: null,
  planetBtns: null,
  focusBtns: null,
  planetHitboxes: [], // координаты планет для клика мышкой/пальцем на холсте
  lastCmeTime: 0,
  lastSidebarSignature: "",
  spectralProbeInfo: "",
  lastAgeFit: null, // результат подбора возраста звезды каталога по наблюдениям { t, chi2 }
};
