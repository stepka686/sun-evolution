"""График роста проекта: строк в собранном HTML каждой версии из releases/.

    pip install matplotlib
    python tools/stats/lines_growth.py            # → docs/lines_growth.png
"""
import os
import re
import sys

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.ticker import FuncFormatter

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
REL = os.path.join(ROOT, 'releases')
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'docs', 'lines_growth.png')

vs = []
for f in os.listdir(REL):
    m = re.fullmatch(r'sun_evolution_v(\d+)\.(\d+)\.(\d+)\.html', f)
    if m:
        with open(os.path.join(REL, f), encoding='utf-8', errors='ignore') as fh:
            vs.append(((int(m[1]), int(m[2]), int(m[3])), sum(1 for _ in fh)))
vs.sort()
lab = [f'{a}.{b}' + (f'.{c}' if c else '') for (a, b, c), _ in vs]
y = [n for _, n in vs]
x = list(range(len(vs)))
sp = lambda n: f'{n:,}'.replace(',', ' ')

# тёмная тема, как у приложения; одна серия — без легенды, название в заголовке
BG, T1, T2, GRID, S = '#1a1a19', '#f0efec', '#c3c2b7', '#3a3a37', '#3987e5'
fig, ax = plt.subplots(figsize=(10, 6.2), dpi=160)
fig.patch.set_facecolor(BG)
ax.set_facecolor(BG)
ax.plot(x, y, color=S, lw=2, solid_capstyle='round')
ax.fill_between(x, y, color=S, alpha=0.12, lw=0)
maj = [i for i, ((a, b, c), _) in enumerate(vs) if b == 0 and c == 0]
for i in maj:
    ax.axvline(i, color=GRID, lw=0.8, zorder=0)
ax.set_xticks(maj + [len(vs) - 1])
ax.set_xticklabels([lab[i] for i in maj] + [lab[-1]], color=T2, fontsize=11)
ax.tick_params(axis='y', colors=T2, labelsize=10, length=0)
ax.tick_params(axis='x', length=0)
ax.yaxis.set_major_formatter(FuncFormatter(lambda v, _: sp(int(v))))
ax.grid(axis='y', color=GRID, lw=0.6)
for s in ax.spines.values():
    s.set_visible(False)
ax.set_ylim(0, max(y) * 1.15)
ax.set_xlim(-1, len(vs))


def note(v, text, dx, dy, ha='center'):
    if v not in lab:
        return
    i = lab.index(v)
    ax.scatter([i], [y[i]], s=46, color=S, edgecolor=BG, lw=2, zorder=3)
    ax.annotate(text, (i, y[i]), xytext=(dx, dy), textcoords='offset points', ha=ha, color=T1, fontsize=10)


note('1.0', f'1.0 — {sp(y[0])}', 10, -4, 'left')
note('4.0', f'4.0 — {sp(y[lab.index("4.0")])}' if '4.0' in lab else '', 0, 12)
note('4.2', '4.2 — модули\nи сборка', 0, -34)
note(lab[-1], f'{lab[-1]} — {sp(y[-1])}', 0, 10)
ax.set_title('Эволюция Солнца: строк в собранном HTML по версиям', color=T1, fontsize=14, loc='left', pad=14)
fig.text(0.125, 0.015, f'{len(vs)} версий, releases/*.html. С 4.3 треки MIST — несколько очень длинных строк, в счёте почти не видны',
         color=T2, fontsize=8.5)
plt.tight_layout(rect=(0, 0.03, 1, 1))
os.makedirs(os.path.dirname(OUT), exist_ok=True)
plt.savefig(OUT, facecolor=BG)
print(f'{OUT}: {len(vs)} версий, {y[0]} → {y[-1]} строк')
