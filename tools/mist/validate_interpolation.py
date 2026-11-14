"""
Проверка метода: насколько точно интерполяция между массами сетки воспроизводит настоящий трек MIST.

Берём массы, которых НЕТ в сетке экспорта, но которые есть в MIST, интерполируем их по соседям сетки
(при фиксированном EEP, линейно по log M) и сравниваем с настоящим треком в ключевых точках.
Тот же алгоритм используется в симуляции (src/model/mistTracks.js).

    python tools/mist/validate_interpolation.py <папка_с_EEP_треками> [папка_для_графиков]
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from extract_tracks import MASS_GRID, PRIMARY_EEPS, read_track, sample_eeps, track_path  # noqa: E402

TEST_MASSES = [0.32, 0.38, 0.55, 0.75, 0.96, 1.14, 1.74, 2.40, 3.40, 5.40, 7.40, 11.0, 13.0, 15.0, 17.0, 19.0, 22.0, 26.0, 30.0, 36.0, 45.0, 90.0, 110.0]
KEY = ['ZAMS', 'TAMS', 'RGBTip', 'ZACHeB', 'TACHeB', 'TPAGB']
QUANT = [('star_age', True), ('log_L', False), ('log_Teff', False), ('log_R', False)]


def interp_track(folder, m, eeps):
    lo = max(g for g in MASS_GRID if g <= m)
    hi = min(g for g in MASS_GRID if g >= m)
    a, b = read_track(track_path(folder, lo)), read_track(track_path(folder, hi))
    f = 0.0 if hi == lo else (np.log10(m) - np.log10(lo)) / (np.log10(hi) - np.log10(lo))
    n = min(len(a['star_age']), len(b['star_age']))
    out = {}
    for q, is_age in QUANT:
        va, vb = a[q], b[q]
        if is_age:
            va, vb = np.log10(va), np.log10(vb)
        out[q] = {e: (1 - f) * va[e - 1] + f * vb[e - 1] for e in eeps if e <= n}
    return out, (lo, hi)


def main():
    folder = sys.argv[1]
    plot_dir = sys.argv[2] if len(sys.argv) > 2 else None
    eeps = sample_eeps()
    worst = {q: 0.0 for q, _ in QUANT}
    print(f'{"M":>6} {"соседи":>13} | {"фаза":<7} {"Δlg t":>7} {"Δlg L":>7} {"Δlg T":>7} {"Δlg R":>7}')
    rows = []
    for m in TEST_MASSES:
        real = read_track(track_path(folder, m))
        est, (lo, hi) = interp_track(folder, m, eeps)
        for name in KEY:
            e = PRIMARY_EEPS[name]
            if e > len(real['star_age']) or e not in est['log_L']:
                continue
            d = {}
            for q, is_age in QUANT:
                rv = np.log10(real[q][e - 1]) if is_age else real[q][e - 1]
                d[q] = est[q][e] - rv
                worst[q] = max(worst[q], abs(d[q]))
            rows.append((m, name, d))
            print(f'{m:6.2f} {lo:5.2f}–{hi:<6.2f} | {name:<7} {d["star_age"]:+7.3f} {d["log_L"]:+7.3f} {d["log_Teff"]:+7.3f} {d["log_R"]:+7.3f}')
    print('\nМаксимальные ошибки (в декадах):', ', '.join(f'{q}: {v:.3f}' for q, v in worst.items()))
    print(f'  → возраст до ×{10 ** worst["star_age"]:.2f}, светимость до ×{10 ** worst["log_L"]:.2f}, '
          f'температура до {100 * (10 ** worst["log_Teff"] - 1):.1f}%, радиус до ×{10 ** worst["log_R"]:.2f}')

    if plot_dir:
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt
        os.makedirs(plot_dir, exist_ok=True)
        fig, ax = plt.subplots(figsize=(8, 7))
        for m, color in [(1.14, 'tab:orange'), (5.4, "tab:green"), (17.0, 'tab:red')]:
            real = read_track(track_path(folder, m))
            est, _ = interp_track(folder, m, eeps)
            ax.plot(real['log_Teff'], real['log_L'], color=color, lw=1, alpha=0.6, label=f'MIST {m} M☉')
            ks = sorted(est['log_L'])
            ax.plot([est['log_Teff'][k] for k in ks], [est['log_L'][k] for k in ks], 'o--', color=color, ms=3,
                    lw=0.8, label=f'интерполяция {m} M☉')
        ax.invert_xaxis()
        ax.set_xlabel('lg T_eff, K')
        ax.set_ylabel('lg L/L☉')
        ax.set_title('Интерполяция треков MIST между массами сетки')
        ax.legend(fontsize=8)
        ax.grid(alpha=0.3)
        p = os.path.join(plot_dir, 'interpolation_check.png')
        fig.savefig(p, dpi=130, bbox_inches='tight')
        print('График:', p)


if __name__ == '__main__':
    main()
