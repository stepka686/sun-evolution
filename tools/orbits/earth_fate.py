"""
Судьба Земли: независимая реализация эволюции орбит на Python и сверка с симуляцией (JS).

Уравнение (круговая орбита):
    d ln a/dt = −d ln M★/dt − γ_tide
    γ_tide = (f/τ_c)·(M_env/M★)·q(1+q)·(R★/a)^8          — равновесный прилив Зана (Villaver & Livio 2009)
    τ_c = [M_env R★² / (6 L★)]^(1/3),  f = 9/2·min(1, (P/2τ_c)²)
Масса ядра — по соотношению Boothroyd & Sackmann (1988): L ≈ 2.3·10⁵ M_c⁶.
Интегрирование — scipy-free: явный метод Рунге — Кутты 4-го порядка с адаптивным шагом по ln a,
т.е. другой численный метод, чем в симуляции (там — средняя точка с точной адиабатической частью).

    node tools/orbits/dump_sun_track.mjs > tools/orbits/sun_track.json
    python tools/orbits/earth_fate.py tools/orbits/sun_track.json [график.png]
"""
import json
import math
import sys

G = 6.674e-8
M_SUN, R_SUN, L_SUN = 1.989e33, 6.957e10, 3.828e33
M_EARTH, AU, GYR = 5.972e27, 1.496e13, 3.156e16


def star_at(stages, t):
    """Состояние звезды: lg R, lg L линейно, T и M линейно (как в симуляции)."""
    i = 0
    while i < len(stages) - 2 and stages[i + 1]['t'] <= t:
        i += 1
    s0, s1 = stages[i], stages[i + 1]
    span = s1['t'] - s0['t']
    f = min(1.0, max(0.0, (t - s0['t']) / span)) if span > 0 else 0.0
    lin = lambda a, b: a + (b - a) * f  # noqa: E731
    return {
        'r': 10 ** lin(math.log10(s0['r']), math.log10(s1['r'])),
        'l': 10 ** lin(math.log10(max(1e-12, s0['l'])), math.log10(max(1e-12, s1['l']))),
        'temp': lin(s0['temp'], s1['temp']),
        'mass': max(0.1, lin(s0['mass'], s1['mass'])),
    }


def gamma_tide(a_au, st, mp_earth, k):
    w = min(1.0, max(0.0, (7000 - st['temp']) / 1500))
    if w <= 0:
        return 0.0
    mc = min(0.95 * st['mass'], (max(1e-6, st['l']) / 2.3e5) ** (1 / 6))
    m_env = (st['mass'] - mc) * M_SUN
    if m_env <= 0:
        return 0.0
    M, R, L = st['mass'] * M_SUN, st['r'] * R_SUN, st['l'] * L_SUN
    a = a_au * AU
    q = mp_earth * M_EARTH / M
    tau = (m_env * R * R / (6 * L)) ** (1 / 3)
    P = 2 * math.pi * math.sqrt(a ** 3 / (G * (M + mp_earth * M_EARTH)))
    f = 4.5 * min(1.0, (P / (2 * tau)) ** 2)
    return k * w * (f / tau) * (m_env / M) * q * (1 + q) * (R / a) ** 8 * GYR


def dlnM_dt(stages, t, h=1e-6):
    return (math.log(star_at(stages, t + h)['mass']) - math.log(star_at(stages, t - h)['mass'])) / (2 * h)


def integrate(stages, a0, mp, k, t_end=None):
    """RK4 по y = ln a с адаптивным шагом; возвращает (t[], a[], судьба, t_гибели)."""
    t_end = t_end if t_end is not None else stages[-1]['t']
    t, y = 0.0, math.log(a0)
    ts, As = [t], [a0]
    rhs = lambda tt, yy: -dlnM_dt(stages, tt) - gamma_tide(math.exp(yy), star_at(stages, tt), mp, k)  # noqa: E731
    while t < t_end:
        d = abs(rhs(t, y))
        h = min(0.01, t_end - t, 1e-3 / d if d > 0 else 0.01)
        h = max(h, 1e-8)
        k1 = rhs(t, y)
        k2 = rhs(t + h / 2, y + h / 2 * k1)
        k3 = rhs(t + h / 2, y + h / 2 * k2)
        k4 = rhs(t + h, y + h * k3)
        y += h / 6 * (k1 + 2 * k2 + 2 * k3 + k4)
        t += h
        a = math.exp(y)
        ts.append(t)
        As.append(a)
        if a <= star_at(stages, t)['r'] * R_SUN / AU:
            return ts, As, 'engulfed', t
    return ts, As, 'survived', None


def main():
    data = json.load(open(sys.argv[1], encoding='utf-8'))
    stages = data['stages']
    out_png = sys.argv[2] if len(sys.argv) > 2 else None
    print(f'{"планета":<9} {"приливы":>7} | {"Python (RK4)":<24} | {"JS (симуляция)":<24} | Δt, млн лет')
    curves = {}
    for k in ['0.3', '1', '3']:
        for p, a0 in data['planets'].items():
            ts, As, fate, tf = integrate(stages, a0, data['planetMassEarth'][p], float(k))
            js = data['jsFates'][k][p]
            py_s = f'{fate} {tf:.4f}' if tf else f'{fate} a={As[-1]:.2f}'
            js_s = f'{js["type"]} {js["t"]:.4f}' if js['t'] else f'{js["type"]} a={js["aFinal"]:.2f}'
            dt = f'{(tf - js["t"]) * 1000:+.2f}' if tf and js['t'] else (f'Δa={As[-1] - js["aFinal"]:+.3f}' if not tf and not js['t'] else 'РАСХОЖДЕНИЕ')
            print(f'{p:<9} {"×" + k:>7} | {py_s:<24} | {js_s:<24} | {dt}')
            if p in ('earth', 'mars'):
                curves[(p, k)] = (ts, As)

    if out_png:
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt
        fig, ax = plt.subplots(figsize=(9, 5.5))
        tt = [11.0 + i * 0.0015 for i in range(int(1.36 / 0.0015))]
        ax.fill_between(tt, 0, [star_at(stages, t)['r'] * R_SUN / AU for t in tt], color='#f97316', alpha=0.35, label='радиус Солнца')
        styles = {'0.3': ':', '1': '-', '3': '--'}
        for (p, k), (ts, As) in curves.items():
            sel = [(t, a) for t, a in zip(ts, As) if t >= 11.0]
            ax.plot([s[0] for s in sel], [s[1] for s in sel], styles[k], color='#2563eb' if p == 'earth' else '#dc2626',
                    lw=1.4, label=f'{"Земля" if p == "earth" else "Марс"}, приливы ×{k}')
        ax.set_xlim(11.0, 12.36)
        ax.set_ylim(0, 2.8)
        ax.set_xlabel('Возраст Солнца, млрд лет')
        ax.set_ylabel('Расстояние, а.е.')
        ax.set_title('Гонка орбиты и фотосферы: потеря массы расширяет орбиты, приливы затягивают внутрь')
        ax.grid(alpha=0.3)
        ax.legend(fontsize=8, loc='upper left')
        fig.savefig(out_png, dpi=140, bbox_inches='tight')
        print('График:', out_png)


if __name__ == '__main__':
    main()
