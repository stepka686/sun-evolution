"""
Экспорт эволюционных треков MIST v1.2 в модуль JS для симуляции.

Треки MIST (Choi et al. 2016; Dotter 2016) размечены точками EEP (Equivalent Evolutionary Points):
одинаковый номер EEP у звёзд разных масс означает одинаковую эволюционную фазу. Поэтому:
  1) из каждого трека берём один и тот же набор номеров EEP,
  2) в симуляции интерполируем между соседними массами при фиксированном EEP.

Металличность — второй параметр: экспортируется сетка по [Fe/H] (FEH_GRID), в симуляции
трек интерполируется сначала по массе внутри каждой сетки, затем линейно по [Fe/H] при том же EEP.

Использование:
    python tools/mist/extract_tracks.py <папка_с_распакованными_сетками> src/data/mistTracks.js

Треки: https://mist.science/  → MIST_v1.2_feh_{m2.00,m1.00,m0.50,p0.00,p0.50}_afe_p0.0_vvcrit0.4_EEPS.txz
"""
import json
import os
import sys

import numpy as np

# Первичные EEP MIST (README_tables): номер строки в файле трека
PRIMARY_EEPS = {
    'PreMS': 1, 'ZAMS': 202, 'IAMS': 353, 'TAMS': 454, 'RGBTip': 605,
    'ZACHeB': 631, 'TACHeB': 707, 'TPAGB': 808, 'postAGB': 1409, 'WDCS': 1710,
}

# Сколько точек брать на каждом интервале между первичными EEP (детальнее там, где звезда меняется быстро)
SAMPLING = [
    (1, 202, 4),      # до главной последовательности
    (202, 353, 4),    # ранняя ГП
    (353, 454, 4),    # поздняя ГП
    (454, 605, 10),   # субгиганты и ветвь красных гигантов / пересечение щели Герцшпрунга
    (605, 631, 2),    # вершина RGB → начало горения гелия
    (631, 707, 6),    # горение гелия в ядре (горизонтальная ветвь, голубая петля)
    (707, 808, 6),    # ранняя AGB / горение углерода у массивных
    (808, 1409, 8),   # термические пульсации AGB
    (1409, 1710, 6),  # пост-AGB → белый карлик
]

# Сетка масс (M☉): плотнее там, где эволюция меняется качественно
MASS_GRID = [0.10, 0.15, 0.20, 0.25, 0.30, 0.35, 0.40, 0.45, 0.50, 0.60, 0.70, 0.80, 0.90,
             1.00, 1.10, 1.20, 1.30, 1.40, 1.50, 1.60, 1.80, 2.00, 2.20, 2.50, 3.00, 3.60,
             4.00, 5.00, 6.00, 7.00, 8.00, 9.00, 10.0, 12.0, 14.0, 16.0, 18.0, 20.0, 24.0,
             28.0, 32.0, 40.0, 50.0, 60.0, 70.0, 80.0, 100.0, 120.0, 150.0, 200.0, 250.0, 300.0]

# Сетка металличностей [Fe/H] (у MIST от −4 до +0.5; ниже −2 звёзд с планетами почти нет)
FEH_GRID = [-2.0, -1.0, -0.5, 0.0, 0.5]


def grid_folder(root, feh):
    tag = ('m' if feh < 0 else 'p') + f'{abs(feh):.2f}'
    return os.path.join(root, f'MIST_v1.2_feh_{tag}_afe_p0.0_vvcrit0.4_EEPS')


COLUMNS = ['star_age', 'star_mass', 'log_L', 'log_Teff', 'log_R', 'center_h1', 'center_he4',
           'center_c12', 'center_o16', 'he_core_mass', 'c_core_mass', 'phase']


def sample_eeps():
    """Общий для всех масс набор номеров EEP (1-based)."""
    eeps = []
    for a, b, n in SAMPLING:
        pts = np.linspace(a, b, n + 1).round().astype(int)
        for e in pts:
            if not eeps or e > eeps[-1]:
                eeps.append(int(e))
    return eeps


def read_track(path):
    with open(path) as f:
        header = [line for line in f if line.startswith('#')]
    cols = header[-1][1:].split()
    data = np.loadtxt(path, comments='#')
    return {name: data[:, i] for i, name in enumerate(cols)}


def track_path(folder, mass):
    return os.path.join(folder, f'{int(round(mass * 100)):05d}M.track.eep')


def extract(folder):
    eeps = sample_eeps()
    tracks = []
    for m in MASS_GRID:
        t = read_track(track_path(folder, m))
        n = len(t['star_age'])
        idx = [e - 1 for e in eeps if e <= n]
        rec = {'m': m, 'n': len(idx)}
        # возраст храним как log10(лет) — его удобно интерполировать между массами
        rec['a'] = [round(float(np.log10(t['star_age'][i])), 5) for i in idx]
        rec['M'] = [round(float(t['star_mass'][i]), 4) for i in idx]
        rec['L'] = [round(float(t['log_L'][i]), 4) for i in idx]
        rec['T'] = [round(float(t['log_Teff'][i]), 4) for i in idx]
        rec['R'] = [round(float(t['log_R'][i]), 4) for i in idx]
        rec['x'] = [round(float(t['center_h1'][i]), 3) for i in idx]
        rec['y'] = [round(float(t['center_he4'][i]), 3) for i in idx]
        rec['c'] = [round(float(t['center_c12'][i]), 3) for i in idx]
        rec['o'] = [round(float(t['center_o16'][i]), 3) for i in idx]
        rec['p'] = [int(t['phase'][i]) for i in idx]
        rec['hc'] = [round(float(t['he_core_mass'][i]), 4) for i in idx]  # масса гелиевого ядра (для приливов)
        # массы ядер в конце трека — для выбора остатка (НЗ / ЧД)
        rec['heCoreEnd'] = round(float(t['he_core_mass'][-1]), 3)
        rec['coCoreEnd'] = round(float(t['c_core_mass'][-1]), 3)
        rec['reachedWD'] = bool(n >= PRIMARY_EEPS['WDCS'])
        tracks.append(rec)
    return {'eeps': eeps, 'primary': PRIMARY_EEPS, 'tracks': tracks}


def extract_all(root):
    grids = [extract(grid_folder(root, feh))['tracks'] for feh in FEH_GRID]
    return {'eeps': sample_eeps(), 'primary': PRIMARY_EEPS, 'feh': FEH_GRID, 'grids': grids}


def main():
    root, out = sys.argv[1], sys.argv[2]
    data = extract_all(root)
    js = ('// АВТОГЕНЕРАЦИЯ: tools/mist/extract_tracks.py — не редактировать вручную.\n'
          '// Эволюционные треки MIST v1.2, [Fe/H] = −2 … +0.5, [α/Fe] = 0, v/vcrit = 0.4 (Choi et al. 2016, Dotter 2016), https://mist.science/\n'
          '// Поля: a — log10(возраст, лет), M — масса (M☉), L/T/R — log10 L/L☉, T_eff (K), R/R☉,\n'
          '//       x/y/c/o — доли H/He/C/O в центре, hc — масса гелиевого ядра (M☉), p — фаза MIST (−1 до ГП, 0 ГП, 2 RGB, 3 горение He, 4 ранняя AGB, 5 TP-AGB, 6 пост-AGB, 9 WR)\n'
          '// grids[i] — треки для [Fe/H] = feh[i]\n'
          f'export const MIST_GRIDS = {json.dumps(data, separators=(",", ":"))};\n')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'w', encoding='utf-8') as f:
        f.write(js)
    n_pts = sum(t['n'] for g in data['grids'] for t in g)
    print(f'Сеток [Fe/H]: {len(data["grids"])}, треков: {sum(len(g) for g in data["grids"])}, точек: {n_pts}, размер: {len(js) / 1024:.0f} КБ → {out}')


if __name__ == '__main__':
    main()
