"""Энергобалансовая модель (Будыко–Селлерс) из sun_evolution 4.5.
1) Бифуркационная диаграмма: равновесная T от потока S/S0 (тёплая и ледяная ветви, гистерезис, убегающий парник).
2) История температуры Земли по выгрузке из JS-модели.
Запуск: python ebm.py earth_climate.json plots/
"""
import json, sys, os
import numpy as np
import matplotlib.pyplot as plt

data = json.load(open(sys.argv[1]))
out = sys.argv[2] if len(sys.argv) > 2 else '.'
P = data['params']

def albedo(T):
    return 0.30 + (0.62 - 0.30) * 0.5 * (1 - np.tanh((T - 258.15) / 12))

def olr(T, dF):
    x = np.maximum(P['A'] + P['B'] * (T - 273.15) - dF, 1e-6)
    return (x ** -8 + P['OLR_LIM'] ** -8) ** (-1 / 8)

# --- 1. Бифуркация: все корни ASR = OLR и их устойчивость ---
T = np.linspace(180, 400, 22001)
s_grid = np.linspace(0.75, 1.3, 600)
stable, unstable = [], []
for s in s_grid:
    f = s * P['S0'] / 4 * (1 - albedo(T)) - olr(T, P['dF_modern'])
    idx = np.where(np.sign(f[:-1]) != np.sign(f[1:]))[0]
    for i in idx:
        (stable if f[i] > 0 else unstable).append((s, T[i] - 273.15))
st, un = np.array(stable), np.array(unstable)
fig, ax = plt.subplots(figsize=(8, 5))
ax.scatter(st[:, 0], st[:, 1], s=3, c='#1f77b4', label='устойчивое равновесие')
if len(un): ax.scatter(un[:, 0], un[:, 1], s=3, c='#bbbbbb', label='неустойчивое')
s_run = 4 * P['OLR_LIM'] / (1 - 0.30) / P['S0']
ax.axvspan(s_run, s_grid[-1], color='#d62728', alpha=0.12, label=f'убегающий парник (S > {s_run:.2f} S₀)')
ax.axvline(1.0, color='k', ls=':', lw=1); ax.text(1.005, -60, 'сегодня', fontsize=9)
ax.axhline(-10, color='#17becf', ls='--', lw=0.8)
ax.set_xlabel('Поток S / S₀ (современный состав атмосферы)'); ax.set_ylabel('Средняя температура, °C')
ax.set_title('Бифуркационная диаграмма энергобаланса Земли')
ax.legend(loc='upper left', fontsize=9); ax.grid(alpha=0.3)
fig.tight_layout(); fig.savefig(os.path.join(out, 'climate_bifurcation.png'), dpi=150)

# --- 2. История температуры Земли ---
h = data['history']
t = np.array([p['t'] for p in h]); Tc = np.array([p['T'] for p in h])
snow = np.array([p['climate'] == 'snowball' for p in h])
fig, (a1, a2) = plt.subplots(2, 1, figsize=(9, 7), sharex=True, gridspec_kw={'height_ratios': [3, 1.3]})
a1.plot(t, Tc, c='#d62728', lw=1.5)
a1.fill_between(t, Tc.min() - 50, Tc.max() + 50, where=snow, color='#17becf', alpha=0.25, label='глобальное оледенение')
a1.axvline(4.6, color='k', ls=':', lw=1); a1.text(4.65, 600, 'сегодня', fontsize=9)
a1.axvline(data['runaway'], color='#ff7f0e', ls='--', lw=1)
a1.text(data['runaway'] + 0.05, 900, f"убегающий парник\n{data['runaway']:.2f} млрд лет", fontsize=9)
a1.set_ylim(Tc.min() - 30, Tc.max() + 60); a1.set_ylabel('T поверхности, °C')
a1.set_title('Температура Земли: выход энергобалансовой модели'); a1.legend(loc='upper left', fontsize=9); a1.grid(alpha=0.3)
a2.semilogy(t, [max(p['co2'], 0.5) for p in h], c='#7f7f7f')
a2.set_ylabel('CO₂, ppm (вход)'); a2.set_xlabel('Возраст Солнца, млрд лет'); a2.grid(alpha=0.3, which='both')
fig.tight_layout(); fig.savefig(os.path.join(out, 'earth_temperature.png'), dpi=150)
print('ok:', out)
