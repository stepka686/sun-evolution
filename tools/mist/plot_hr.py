"""
Диаграмма Герцшпрунга — Рассела для курсовой: треки MIST разных масс + звёзды каталога по наблюдениям.

    python tools/mist/plot_hr.py <папка_с_EEP_треками> [файл.png]
"""
import os
import re
import sys

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

sys.path.insert(0, os.path.dirname(__file__))
from extract_tracks import read_track, track_path  # noqa: E402

MASSES = [0.3, 0.6, 1.0, 1.5, 2.0, 3.0, 5.0, 9.0, 15.0, 24.0, 40.0, 80.0]
PHASE_COLORS = {-1: '#9ca3af', 0: '#2563eb', 2: '#ef4444', 3: '#f59e0b', 4: '#a855f7', 5: '#a855f7', 6: '#10b981', 9: '#0ea5e9'}
PHASE_NAMES = {-1: 'до ГП', 0: 'главная последовательность', 2: 'RGB / щель Герцшпрунга', 3: 'горение He в ядре',
               5: 'AGB / поздние стадии', 6: 'пост-AGB → белый карлик', 9: 'Вольф — Райе'}


def catalog_stars(root):
    """Наблюдаемые T_eff и L звёзд каталога из src/data/catalog.js."""
    js = open(os.path.join(root, 'src', 'data', 'catalog.js'), encoding='utf-8').read()
    out = []
    for m in re.finditer(r"name: '([^']+)'[^}]*?obs: \{ T: ([\d.]+), L: ([\d.e+-]+) \}", js):
        out.append((m.group(1), float(m.group(2)), float(m.group(3))))
    return out


def main():
    folder = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else 'hr_mist.png'
    root = os.path.join(os.path.dirname(__file__), '..', '..')
    fig, ax = plt.subplots(figsize=(10, 9))
    seen = set()
    for m in MASSES:
        t = read_track(track_path(folder, m))
        lt, ll, ph = t['log_Teff'], t['log_L'], t['phase'].astype(int)
        start = np.argmax(ph >= 0)  # без допредпоследовательности — она загромождает рисунок
        for i in range(start, len(lt) - 1):
            p = 5 if ph[i] == 4 else ph[i]
            label = PHASE_NAMES.get(p) if p not in seen else None
            seen.add(p)
            ax.plot(lt[i:i + 2], ll[i:i + 2], color=PHASE_COLORS.get(ph[i], 'k'), lw=1.1, label=label)
        ax.annotate(f'{m:g} M☉', (lt[start], ll[start]), fontsize=7, xytext=(4, -8), textcoords='offset points')
    for name, T, L in catalog_stars(root):
        ax.plot(np.log10(T), np.log10(L), 'k*', ms=7)
        ax.annotate(name, (np.log10(T), np.log10(L)), fontsize=6.5, xytext=(3, 3), textcoords='offset points')
    ax.invert_xaxis()
    ax.set_xlim(5.4, 3.3)
    ax.set_xlabel('lg T_eff, K')
    ax.set_ylabel('lg L/L☉')
    ax.set_title('Эволюционные треки MIST v1.2 ([Fe/H] = 0) и звёзды каталога (★ — наблюдения)')
    ax.grid(alpha=0.25)
    ax.legend(fontsize=8, loc='lower left')
    fig.savefig(out, dpi=140, bbox_inches='tight')
    print('Сохранено:', out)


if __name__ == '__main__':
    main()
