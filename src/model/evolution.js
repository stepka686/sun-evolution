// Построение эволюционного трека для произвольной массы
import { EVOLUTION_STAGES } from '../data/stages.js';
import { buildMistStages, MIST_MIN_MASS } from './mistTracks.js';
import { getMKClass } from '../physics/classification.js';
import { BROWN_DWARF_LIMIT, T_SUN_EFF, enforceSB, lumFromRT, massiveLifetimeGyr, redDwarfLifetimeGyr, tempFromLR, wdMassFromInitial, wdRadius } from '../physics/stellar.js';

export function buildEvolutionStages(m, starId, feh = 0) {
      const mass = Math.max(0.02, Math.min(300.0, Number(m) || 1.0));

      // Специальный профиль R136a1: Парно-нестабильная сверхновая (PISN) без остатка
      if (starId === 'r136a1') {
        return [
          {
            t: 0.0, r: 35.0, l: 4500000.0, temp: 53000, mass: mass,
            h: 0.70, he: 0.28, c: 0.01, o: 0.01,
            spec: "Гипергигант Вольфа — Райе • WN5h",
            name: "Экстремальный предел массы Эддингтона",
            desc: "Мощнейший звездный ветер срывает тысячи масс Земли в год. Температура фотосферы превышает 50 000 K.",
            mercurySky: [0,0,0], mercuryGround: [0,0,0], venusSky: [0,0,0], venusGround: [0,0,0],
            earthSky: [240,250,255], earthGround: [200,220,255], marsSky: [200,220,255], marsGround: [180,200,240],
            europaSky: [180,200,255], europaGround: [210,230,255], titanSky: [190,210,255], titanGround: [150,170,220], plutoSky: [150,180,240], plutoGround: [140,160,220]
          },
          {
            t: 0.0019, r: 140.0, l: 8200000.0, temp: 22000, mass: mass * 0.75,
            h: 0.02, he: 0.75, c: 0.15, o: 0.08,
            spec: "Голубой гипергигант перед коллапсом",
            name: "Рождение электрон-позитронных пар",
            desc: "В ядре гамма-кванты превращаются в пары e- и e+. Давление света падает, запуская взрывной коллапс.",
            mercurySky: [0,0,0], mercuryGround: [0,0,0], venusSky: [0,0,0], venusGround: [0,0,0],
            earthSky: [255,255,255], earthGround: [255,255,255], marsSky: [240,245,255], marsGround: [230,240,255],
            europaSky: [230,240,255], europaGround: [240,245,255], titanSky: [220,230,255], titanGround: [210,220,250], plutoSky: [200,220,255], plutoGround: [190,210,250]
          },
          {
            t: 0.0021, r: 0.000001, l: 0.0, temp: 3, mass: 0.0, noSB: true,
            h: 0.0, he: 0.0, c: 0.0, o: 0.0,
            spec: "Полный разлёт (Парно-нестабильная Сверхновая)",
            name: "Полное термоядерное распыление",
            desc: "Гипотетический сценарий: термоядерный взрыв уничтожает звезду целиком, без остатка. При металличности БМО сильный ветер может не дать звезде дойти до парной нестабильности.",
            mercurySky: [0,0,0], mercuryGround: [0,0,0], venusSky: [0,0,0], venusGround: [0,0,0],
            earthSky: [0,0,0], earthGround: [0,0,0], marsSky: [0,0,0], marsGround: [0,0,0],
            europaSky: [0,0,0], europaGround: [0,0,0], titanSky: [0,0,0], titanGround: [0,0,0], plutoSky: [0,0,0], plutoGround: [0,0,0]
          }
        ];
      }

      // Специальный профиль Эты Киля (LBV с туманностью Гомункул)
      if (starId === 'eta_carinae') {
        return [
          {
            t: 0.0, r: 60.0, l: 5000000.0, temp: 30000, mass: 100.0,
            h: 0.65, he: 0.33, c: 0.01, o: 0.01,
            spec: "Яркая голубая переменная • LBV",
            name: "Стабильная пульсирующая фаза LBV",
            desc: "Колоссальная светимость на грани разрыва гравитации. Светило теряет до 0.001 массы Солнца в год.",
            mercurySky: [0,0,0], mercuryGround: [0,0,0], venusSky: [0,0,0], venusGround: [0,0,0],
            earthSky: [210,230,255], earthGround: [180,200,240], marsSky: [180,200,240], marsGround: [150,170,210],
            europaSky: [160,180,230], europaGround: [180,200,230], titanSky: [160,180,220], titanGround: [140,160,200], plutoSky: [130,150,210], plutoGround: [130,150,200]
          },
          {
            t: 0.0030, r: 400.0, l: 20000000.0, temp: 15000, mass: 85.0,
            h: 0.20, he: 0.70, c: 0.06, o: 0.04,
            spec: "Великая вспышка (Туманность Гомункул)",
            name: "Эруптивный выброс биполярных долей",
            desc: "Сверхвспышка срывает 20 масс Солнца, порождая две гигантские пылевые лопасти туманности Гомункул.",
            mercurySky: [0,0,0], mercuryGround: [0,0,0], venusSky: [0,0,0], venusGround: [0,0,0],
            earthSky: [180,80,60], earthGround: [150,60,40], marsSky: [160,70,50], marsGround: [140,55,35],
            europaSky: [140,65,45], europaGround: [150,70,50], titanSky: [150,75,55], titanGround: [130,60,40], plutoSky: [120,60,45], plutoGround: [120,60,45]
          },
          {
            t: 0.0033, r: 0.00005, l: 0.02, temp: 10, mass: 45.0,
            h: 0.0, he: 0.0, c: 0.5, o: 0.5,
            spec: "Звёздная чёрная дыра",
            name: "Прямой гравитационный коллапс ядра",
            desc: "Образование массивной звёздной чёрной дыры (~45 M☉) с аккрецией остатков туманности. Промежуточные ЧД начинаются от ~100 M☉.",
            mercurySky: [0,0,0], mercuryGround: [0,0,0], venusSky: [0,0,0], venusGround: [0,0,0],
            earthSky: [0,0,0], earthGround: [0,0,0], marsSky: [0,0,0], marsGround: [0,0,0],
            europaSky: [0,0,0], europaGround: [0,0,0], titanSky: [0,0,0], titanGround: [0,0,0], plutoSky: [0,0,0], plutoGround: [0,0,0]
          }
        ];
      }

      // Специальный профиль La Superba (Рубиновый углеродный гигант)
      if (starId === 'la_superba') {
        return [
          {
            t: 0.0, r: 2.2, l: 35.0, temp: 7200, mass: 3.0,
            h: 0.72, he: 0.26, c: 0.01, o: 0.01,
            spec: "Белая звезда • A8V",
            name: "ZAMS промежуточной массы",
            desc: "Горение водорода по CNO-циклу в конвективном ядре.",
            mercurySky: [2,3,6], mercuryGround: [75,70,72], venusSky: [180,130,50], venusGround: [130,90,45],
            earthSky: [65,145,225], earthGround: [40,110,50], marsSky: [140,95,75], marsGround: [160,70,40],
            europaSky: [2,4,12], europaGround: [175,190,205], titanSky: [195,115,35], titanGround: [55,38,22], plutoSky: [1,2,6], plutoGround: [145,130,125]
          },
          {
            t: 0.45, r: 300.0, l: 6500.0, temp: 2200, mass: 2.2,
            h: 0.0, he: 0.10, c: 0.55, o: 0.35,
            spec: "Углеродная звезда • C-N5 (J-тип)",
            name: "Рубиновый углеродный гигант AGB",
            desc: "Отношение C/O > 1. Сажевая углеродная мантия придает звезде самый глубокий рубиновый цвет на небе.",
            mercurySky: [0,0,0], mercuryGround: [0,0,0], venusSky: [0,0,0], venusGround: [0,0,0],
            earthSky: [80,5,5], earthGround: [180,20,10], marsSky: [85,8,8], marsGround: [170,25,12],
            europaSky: [60,15,15], europaGround: [120,30,20], titanSky: [90,25,20], titanGround: [100,35,25], plutoSky: [70,20,15], plutoGround: [80,30,20]
          },
          {
            t: 0.50, r: 0.012, l: 0.003, temp: 12000, mass: 0.85,
            h: 0.0, he: 0.01, c: 0.65, o: 0.34,
            spec: "Углеродный белый карлик • DQ",
            name: "Вырожденный углеродный остаток",
            desc: "Плотное кристаллическое ядро, окруженное тонкой атмосферой со следами углерода.",
            mercurySky: [0,0,0], mercuryGround: [0,0,0], venusSky: [0,0,0], venusGround: [0,0,0],
            earthSky: [2,4,8], earthGround: [10,12,16], marsSky: [2,4,8], marsGround: [12,12,15],
            europaSky: [3,5,10], europaGround: [175,190,205], titanSky: [5,6,12], titanGround: [55,45,40], plutoSky: [2,3,6], plutoGround: [70,65,70]
          }
        ];
      }

      // Специальный профиль Магнетара SGR 1806-20 (экстремальное поле 10^15 Гаусс)
      if (starId === 'sgr1806') {
        return [
          {
            t: 0.0, r: 0.00003, l: 120.0, temp: 180000, mass: 1.85,
            h: 0.0, he: 0.0, c: 0.50, o: 0.50,
            spec: "Магнетар • SGR (10¹⁵ Гс)",
            name: "Активный магнетар: звездотрясения коры",
            desc: "Магнитное поле 10^15 Гаусс разрывает нейтронную кору, порождая гигантские гамма-вспышки, ионизирующие космос.",
            mercurySky: [0,0,0], mercuryGround: [0,0,0], venusSky: [0,0,0], venusGround: [0,0,0],
            earthSky: [90,20,140], earthGround: [40,15,65], marsSky: [80,15,120], marsGround: [45,20,60],
            europaSky: [65,15,110], europaGround: [80,50,140], titanSky: [70,25,110], titanGround: [40,20,65], plutoSky: [55,15,95], plutoGround: [50,30,85]
          },
          {
            t: 0.05, r: 0.000028, l: 0.02, temp: 45000, mass: 1.85,
            h: 0.0, he: 0.0, c: 0.50, o: 0.50,
            spec: "Реликтовая нейтронная звезда",
            name: "Затухание магнитного динамо",
            desc: "Магнитное поле распалось. Остывающий нейтронный шар без радиоимпульсов.",
            mercurySky: [0,0,0], mercuryGround: [0,0,0], venusSky: [0,0,0], venusGround: [0,0,0],
            earthSky: [2,3,8], earthGround: [8,10,14], marsSky: [2,3,8], marsGround: [10,10,14],
            europaSky: [2,4,10], europaGround: [60,70,90], titanSky: [3,4,10], titanGround: [20,20,30], plutoSky: [1,2,5], plutoGround: [25,25,35]
          }
        ];
      }

      // Специальный физический профиль для реликтового белого карлика (Сириус B)
      if (starId === 'sirius_b') {
        return [
          {
            t: 0.0, r: 0.0084, l: 0.056, temp: 25200, mass: 1.02,
            h: 0.0, he: 0.01, c: 0.70, o: 0.29,
            spec: "Белый карлик • DA2",
            name: "Горячий углеродно-кислородный реликт",
            desc: "Сверхплотный вырожденный остаток. Гравитация искривляет свет в кольцо Эйнштейна.",
            mercurySky: [0,0,0], mercuryGround: [10,12,15], venusSky: [0,0,0], venusGround: [12,14,18],
            earthSky: [2,4,8], earthGround: [12,14,18], marsSky: [2,4,8], marsGround: [12,14,18],
            europaSky: [3,5,10], europaGround: [150,165,185], titanSky: [5,6,12], titanGround: [55,45,40], plutoSky: [2,3,6], plutoGround: [70,65,70]
          },
          {
            t: 15.0, r: 0.0081, l: 0.00008, temp: 5200, mass: 1.02,
            h: 0.0, he: 0.01, c: 0.70, o: 0.29,
            spec: "Остывающий карлик • DC",
            name: "Кристаллизация углеродного ядра в алмаз",
            desc: "Ионы углерода выстраиваются в твёрдую кристаллическую решётку.",
            mercurySky: [0,0,0], mercuryGround: [8,10,12], venusSky: [0,0,0], venusGround: [10,12,14],
            earthSky: [1,2,4], earthGround: [10,12,14], marsSky: [1,2,4], marsGround: [10,12,14],
            europaSky: [2,3,6], europaGround: [140,155,175], titanSky: [3,4,8], titanGround: [45,38,32], plutoSky: [1,2,4], plutoGround: [50,48,52]
          }
        ];
      }

      // 1. Коричневые карлики (< 0.075 M☉): водород не горит, только кратковременный синтез дейтерия и остывание
      if (mass < BROWN_DWARF_LIMIT) {
        const bdColorsWarm = {
          mercurySky: [5,2,2], mercuryGround: [20,15,15], venusSky: [10,4,4], venusGround: [25,18,18],
          earthSky: [6,4,8], earthGround: [15,15,20], marsSky: [4,2,4], marsGround: [18,12,12],
          europaSky: [2,2,5], europaGround: [60,65,75], titanSky: [30,20,10], titanGround: [25,20,15], plutoSky: [1,1,2], plutoGround: [30,28,30]
        };
        const bdColorsCold = {
          mercurySky: [1,0,0], mercuryGround: [10,8,8], venusSky: [2,0,0], venusGround: [12,10,10],
          earthSky: [1,1,2], earthGround: [8,8,10], marsSky: [1,0,1], marsGround: [10,8,8],
          europaSky: [1,1,2], europaGround: [40,45,50], titanSky: [10,6,4], titanGround: [15,12,10], plutoSky: [0,0,1], plutoGround: [20,18,20]
        };
        const mScale = Math.pow(mass / 0.05, 0.35); // более массивные карлики остывают медленнее
        return enforceSB([
          { t: 0.0, r: 0.13, temp: 2600, mass: mass, h: 0.74, he: 0.25, c: 0.01, o: 0.0,
            spec: "Молодой коричневый карлик • M8", name: "Синтез дейтерия",
            desc: "Масса ниже предела горения водорода (≈0.075 M☉). Короткое время горит только дейтерий.", ...bdColorsWarm },
          { t: 1.0, r: 0.10, temp: Math.round(1700 * mScale), mass: mass, h: 0.74, he: 0.25, c: 0.01, o: 0.0,
            spec: "Коричневый карлик • L", name: "L-карлик: пылевые облака",
            desc: "Дейтерий исчерпан. В атмосфере конденсируются силикатные и железные облака.", ...bdColorsWarm },
          { t: 10.0, r: 0.09, temp: Math.round(800 * mScale), mass: mass, h: 0.74, he: 0.25, c: 0.01, o: 0.0,
            spec: "Метановый карлик • T", name: "T-карлик: метан",
            desc: "Облака опускаются под фотосферу, в спектре доминируют полосы метана и воды.", ...bdColorsCold },
          { t: 120.0, r: 0.09, temp: Math.round(350 * mScale), mass: mass, h: 0.74, he: 0.25, c: 0.01, o: 0.0,
            spec: "Ультрахолодный карлик • Y", name: "Y-карлик: водяные облака",
            desc: "Остывание без взрывов и туманностей: температура как у тёплой комнаты.", ...bdColorsCold }
        ]);
      }

      // 2. Самые лёгкие красные карлики (0.075–0.1 M☉) — ниже сетки MIST: аналитическая модель (Laughlin+1997)
      if (mass < MIST_MIN_MASS) {
        const tLife = redDwarfLifetimeGyr(mass);
        const r0 = Math.pow(mass, 0.8);
        const l0 = 0.23 * Math.pow(mass, 2.3);
        const rWD = wdRadius(mass);
        return [
          {
            t: 0.0, r: r0, l: l0, temp: Math.round(tempFromLR(l0, r0)), mass: mass,
            h: 0.74, he: 0.24, c: 0.01, o: 0.01,
            spec: "Красный карлик • M",
            name: "ZAMS красного карлика",
            desc: mass < 0.35 ? "Полная конвекция. Протон-протонный цикл медленно перерабатывает водород во всём объёме звезды." : "Почти полностью конвективная звезда с маленьким лучистым ядром.",
            mercurySky: [15, 5, 5], mercuryGround: [40, 30, 30], venusSky: [60, 20, 15], venusGround: [80, 45, 30],
            earthSky: [20, 12, 25], earthGround: [30, 25, 35], marsSky: [15, 10, 18], marsGround: [40, 25, 20],
            europaSky: [5, 4, 12], europaGround: [120, 130, 145], titanSky: [120, 60, 20], titanGround: [40, 30, 20], plutoSky: [2, 2, 6], plutoGround: [60, 55, 60]
          },
          {
            t: tLife * 0.75, r: r0 * 1.05, l: l0 * 1.6, temp: Math.round(tempFromLR(l0 * 1.6, r0 * 1.05)), mass: mass,
            h: 0.25, he: 0.73, c: 0.01, o: 0.01,
            spec: "Зрелый красный карлик",
            name: "Уплотнение гелиевого ядра",
            desc: "Водород на исходе. Светимость медленно растёт при сохранении конвекции.",
            mercurySky: [18, 6, 6], mercuryGround: [45, 32, 32], venusSky: [65, 22, 18], venusGround: [85, 48, 32],
            earthSky: [25, 15, 28], earthGround: [35, 28, 38], marsSky: [18, 12, 20], marsGround: [42, 28, 22],
            europaSky: [6, 5, 14], europaGround: [115, 125, 140], titanSky: [125, 65, 22], titanGround: [42, 32, 22], plutoSky: [3, 3, 7], plutoGround: [58, 52, 58]
          },
          {
            t: tLife * 0.95, r: r0 * 0.9, l: l0 * 8.0, temp: Math.round(tempFromLR(l0 * 8.0, r0 * 0.9)), mass: mass,
            h: 0.05, he: 0.93, c: 0.01, o: 0.01,
            spec: "Голубой карлик",
            name: "Фаза голубого карлика (гипотетическая)",
            desc: "Рост средней молекулярной массы поднимает светимость; звезда сжимается и нагревается, не становясь гигантом.",
            mercurySky: [22, 10, 15], mercuryGround: [50, 35, 35], venusSky: [70, 28, 25], venusGround: [90, 50, 35],
            earthSky: [30, 22, 45], earthGround: [40, 32, 45], marsSky: [22, 16, 28], marsGround: [45, 30, 25],
            europaSky: [8, 8, 18], europaGround: [110, 120, 135], titanSky: [130, 70, 25], titanGround: [45, 35, 25], plutoSky: [4, 4, 8], plutoGround: [55, 50, 55]
          },
          {
            t: tLife, r: rWD, l: lumFromRT(rWD, 7500), temp: 7500, mass: mass,
            h: 0.00, he: 0.98, c: 0.01, o: 0.01,
            spec: "Гелиевый белый карлик",
            name: "Остывающий гелиевый карлик",
            desc: "Без стадии красного гиганта звезда сжалась в компактный гелиевый белый карлик.",
            mercurySky: [0, 0, 0], mercuryGround: [10, 10, 12], venusSky: [0, 0, 0], venusGround: [12, 12, 15],
            earthSky: [2, 3, 6], earthGround: [10, 12, 16], marsSky: [2, 3, 6], marsGround: [12, 12, 15],
            europaSky: [3, 4, 8], europaGround: [90, 100, 115], titanSky: [5, 6, 10], titanGround: [30, 25, 20], plutoSky: [1, 1, 3], plutoGround: [40, 38, 42]
          }
        ];
      }
      // 3. Солнце: собственный трек, откалиброванный по реальному Солнцу (Sackmann et al. 1993; Schröder & Smith 2008).
      //    На нём держится вся история Земли; MIST 1.0 M☉ используется как эталон в тестах.
      if (Math.abs(mass - 1.0) < 0.02 && Math.abs(feh) < 0.01) return EVOLUTION_STAGES;

      // 4. Все остальные звёзды 0.1–300 M☉: треки MIST (масса × металличность) + достройка остатка
      return buildMistStages(mass, feh);
}

// Ключевые моменты солнечного трека (для синхронизации эффектов: AGB-пульсации, кометный шторм, туры)
// Согласование ручного солнечного трека с законом Стефана — Больцмана (L = R²T⁴ в солнечных единицах).
// До 4.6 трек расходился с ним до 40%. Чтобы не сломать калибровки, на главной последовательности сохраняются L и T
// (на светимости держится климат Земли) и пересчитывается R; до ГП и на гигантах сохраняются L и R
// (на радиусе держится поглощение Земли) и пересчитывается T.
for (const s of EVOLUTION_STAGES) {
  if (s.noSB || !(s.l > 0)) continue;
  if (s.t >= 0 && s.t <= 10.2) s.r = Number((Math.sqrt(s.l) * Math.pow(T_SUN_EFF / s.temp, 2)).toPrecision(4));
  else s.temp = Math.round(T_SUN_EFF * Math.pow(s.l / (s.r * s.r), 0.25));
}

EVOLUTION_STAGES.marks = { zams: 0, tams: 10.2, rgbTip: 12.18, agbStart: 12.28, agbEnd: 12.355, massLossStart: 11.5, end: 12.36, remnant: 13.0 };
