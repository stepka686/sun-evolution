"""
Как металличность меняет звезду: треки MIST на диаграмме Г—Р и время жизни на главной последовательности.

    python tools/mist/plot_metallicity.py <папка_с_сетками_MIST> [файл.png]
"""
import os
import re
import sys

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

sys.path.insert(0, os.path.dirname(__file__))
from extract_tracks import FEH_GRID, PRIMARY_EEPS, grid_folder, read_track, track_path  # noqa: E402

COLORS = {-2.0: '#2563eb', -1.0: '#0ea5e9', -0.5: '#10b981', 0.0: '#f59e0b', 0.5: '#dc2626'}


def catalog(root):
    js = open(os.path.join(root, 'src', 'data', 'catalog.js'), encoding='utf-8').read()
    out = []
    for m in re.finditer(r"name: '([^']+)'[^}]*?mass: ([\d.]+), feh: (-?[\d.]+)[^}]*?obs: \{ T: ([\d.]+), L: ([\d.e+-]+) \}", js):
        out.append((m.group(1), float(m.group(2)), float(m.group(3)), float(m.group(4)), float(m.group(5))))
    return out


def main():
    root_mist = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else 'metallicity.png'
    root = os.path.join(os.path.dirname(__file__), '..', '..')
    fig, (ax, bx) = plt.subplots(1, 2, figsize=(14, 6.5), gridspec_kw={'width_ratios': [1.25, 1]})

    # 1. Треки 1 M☉ (до вершины RGB) при разных [Fe/H]
    for feh in FEH_GRID:
        t = read_track(track_path(grid_folder(root_mist, feh), 1.0))
        a, b = PRIMARY_EEPS['ZAMS'] - 1, PRIMARY_EEPS['RGBTip']
        ax.plot(t['log_Teff'][a:b], t['log_L'][a:b], color=COLORS[feh], lw=1.8, label=f'[Fe/H] = {feh:+.1f}')
        ax.plot(t['log_Teff'][a], t['log_L'][a], 'o', color=COLORS[feh], ms=5)
    for name, mass, feh, T, L in catalog(root):
        if 0.7 <= mass <= 1.3 or name in ('Арктур', 'Альдебаран'):
            ax.plot(np.log10(T), np.log10(L), '*', color=COLORS[min(COLORS, key=lambda f: abs(f - feh))], mec='k', mew=0.5, ms=11)
            ax.annotate(f'{name} ({feh:+.2f})', (np.log10(T), np.log10(L)), fontsize=8, xytext=(5, -12 if name == '51 Пегаса' else -3), textcoords='offset points')
    ax.plot(np.log10(5772), 0, 'k*', ms=12)
    ax.annotate('Солнце', (np.log10(5772), 0), fontsize=8, xytext=(5, -3), textcoords='offset points')
    ax.invert_xaxis()
    ax.set_xlabel('lg T_eff, K'); ax.set_ylabel('lg L/L☉')
    ax.set_title('Звезда 1 M☉ от ZAMS (●) до вершины RGB\nбедная металлами — горячее и ярче')
    ax.legend(fontsize=8, loc='lower left'); ax.grid(alpha=0.25)

    # 2. Время жизни на ГП
    masses = [0.6, 0.8, 1.0, 1.5, 2.0, 3.0, 5.0]
    for m in masses:
        life = []
        for feh in FEH_GRID:
            t = read_track(track_path(grid_folder(root_mist, feh), m))
            life.append((t['star_age'][PRIMARY_EEPS['TAMS'] - 1] - t['star_age'][PRIMARY_EEPS['ZAMS'] - 1]) / 1e9)
        bx.semilogy(FEH_GRID, life, 'o-', label=f'{m:g} M☉')
    bx.axhline(13.8, color='k', ls=':', lw=1); bx.text(-1.95, 15, 'возраст Вселенной', fontsize=8)
    bx.set_xlabel('[Fe/H]'); bx.set_ylabel('Время на главной последовательности, млрд лет')
    bx.set_title('Чем меньше металлов, тем короче жизнь')
    bx.legend(fontsize=8, ncol=2); bx.grid(alpha=0.3, which='both')
    fig.suptitle('Металличность в треках MIST v1.2', fontsize=13)
    fig.tight_layout()
    fig.savefig(out, dpi=140)
    print('Сохранено:', out)


if __name__ == '__main__':
    main()
