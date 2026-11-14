"""
Карта суши на сетке 1°×1° с номером литосферной плиты для каждой клетки и повороты плит к Пангее.

    python tools/continents/build_land.py <ne_110m_land.geojson> src/data/landGrid.js [preview.png]

Суша: Natural Earth 1:110m (общественное достояние). Деление на плиты — по упрощённым границам.
Повороты: вектор Эйлера (широта, долгота полюса, угол) плиты относительно Африки, 250 млн лет назад.
Для Южной Америки, Северной Америки и Евразии — полюса подгонки берегов Атлантики (Bullard et al. 1965);
для плит Гондваны (Индия, Антарктида, Австралия, Мадагаскар) — схематичная сборка по типичным
реконструкциям (Scotese, PALEOMAP). Точность — сотни километров: это иллюстрация, а не реконструкция.
"""
import json
import math
import sys

import numpy as np
from matplotlib.path import Path

PLATES = ['ocean', 'Африка', 'Южная Америка', 'Северная Америка', 'Гренландия', 'Евразия', 'Индия', 'Аравия', 'Австралия', 'Антарктида', 'Мадагаскар']


def plate_of(lat, lon):
    if lat < -60:
        return 9
    if lat > 59 and -75 < lon < -10:
        return 4
    if lon < -25 and lat >= 7.5:
        return 3
    if lon > 172 and lat > 50:
        return 3
    if lon < -30 and (lat < 7.5 or (lat < 12.5 and lon > -77)):
        return 2
    if -26 < lat < -11 and 43 < lon < 51:
        return 10
    rs = 43 - (lat - 12.5) * (9.5 / 15.5)
    if 12 < lat < 32 and rs < lon < 60:
        return 7
    if -36 < lat < 37.5 and -20 < lon < 52 and (lat < 31.7 or lon < 12) and not (lat > 30 and lon > 33):
        return 1
    if 5 < lat < 29.5 and 66 < lon < 92:
        return 6
    if -48 < lat < 0 and 112 < lon < 180 and not (lat > -9 and lon < 130):
        return 8
    return 5


def rasterize(geo):
    grid = np.zeros((180, 360), dtype=np.uint8)
    lons = np.arange(360) - 179.5
    lats = 89.5 - np.arange(180)
    LON, LAT = np.meshgrid(lons, lats)
    pts = np.column_stack([LON.ravel(), LAT.ravel()])
    land = np.zeros(pts.shape[0], dtype=bool)
    for f in geo['features']:
        g = f['geometry']
        polys = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
        for poly in polys:
            land |= Path(np.array(poly[0])).contains_points(pts)
    land = land.reshape(180, 360)
    for i in range(180):
        for j in range(360):
            if land[i, j]:
                grid[i, j] = plate_of(lats[i], lons[j])
    return grid


def rle(grid):
    """Строки сетки → «ид×длина» через запятую (компактно для JS)"""
    rows = []
    for r in grid:
        out, cur, n = [], r[0], 0
        for v in r:
            if v == cur:
                n += 1
            else:
                out.append(f'{cur:x}{n}' if cur else f'.{n}'); cur, n = v, 1
        out.append(f'{cur:x}{n}' if cur else f'.{n}')
        rows.append(' '.join(out))
    return rows


# ---------- повороты (для предпросмотра в Python; в JS — те же формулы) ----------
def vec(lat, lon):
    la, lo = math.radians(lat), math.radians(lon)
    return np.array([math.cos(la) * math.cos(lo), math.cos(la) * math.sin(lo), math.sin(la)])


def rot(axis_lat, axis_lon, ang):
    k = vec(axis_lat, axis_lon); a = math.radians(ang)
    K = np.array([[0, -k[2], k[1]], [k[2], 0, -k[0]], [-k[1], k[0], 0]])
    return np.eye(3) + math.sin(a) * K + (1 - math.cos(a)) * K @ K


def to_euler(R):
    ang = math.degrees(math.acos(max(-1, min(1, (np.trace(R) - 1) / 2))))
    ax = np.array([R[2, 1] - R[1, 2], R[0, 2] - R[2, 0], R[1, 0] - R[0, 1]])
    ax /= np.linalg.norm(ax)
    return round(math.degrees(math.asin(ax[2])), 2), round(math.degrees(math.atan2(ax[1], ax[0])), 2), round(ang, 2)


def move(src, dst, spin=0):
    """Минимальный поворот центра src → dst плюс разворот на spin° вокруг конечной точки"""
    a, b = vec(*src), vec(*dst)
    ax = np.cross(a, b); s = np.linalg.norm(ax)
    ang = math.degrees(math.atan2(s, a @ b))
    R1 = rot(math.degrees(math.asin(ax[2] / s)), math.degrees(math.atan2(ax[1], ax[0])), ang) if s > 1e-9 else np.eye(3)
    R2 = rot(dst[0], dst[1], spin)
    return R2 @ R1


def pangea_rotations():
    R = {1: np.eye(3), 7: np.eye(3)}
    R[2] = rot(44.0, -30.6, 57.0)                     # Южная Америка → Африка (Bullard 1965)
    R[3] = rot(67.0, -13.0, 75.0)                     # Северная Америка → Африка
    R[4] = R[3]
    # Евразия относительно Африки сдвинулась мало: Тетис открыт к востоку, Европа к северу от Африки
    R[5] = move((50, 60), (46, 45), -18)
    R[10] = move((-19, 46.5), (-6, 43.5), -20)        # Мадагаскар к берегу Сомали
    R[6] = move((20, 78), (-18, 52), 80)              # Индия между Мадагаскаром и Антарктидой
    R[9] = move((-82, 40), (-52, 48), 160)            # Антарктида к юго-востоку Африки
    R[8] = move((-25, 134), (-42, 92), 60)            # Австралия к Антарктиде
    return R


def main():
    geo = json.load(open(sys.argv[1]))
    grid = rasterize(geo)
    R = pangea_rotations()
    eul = {k: to_euler(v) if not np.allclose(v, np.eye(3)) else (0, 0, 0) for k, v in R.items()}
    js = ('// Суша Земли на сетке 1°×1° (Natural Earth 1:110m, общественное достояние) с номером плиты в каждой клетке.\n'
          '// Сгенерировано tools/continents/build_land.py — не редактировать вручную.\n'
          f'export const PLATE_NAMES = {json.dumps(PLATES, ensure_ascii=False)};\n'
          '// Строки с севера на юг (89.5° … −89.5°), клетки с запада на восток (−179.5° … 179.5°): «плита(hex)длина», «.длина» — океан\n'
          f'export const LAND_RLE = {json.dumps(rle(grid))};\n'
          '// Поворот каждой плиты к Пангее (250 млн лет назад) относительно Африки: [широта полюса, долгота полюса, угол °]\n'
          f'export const PANGEA_EULER = {json.dumps({str(k): v for k, v in eul.items()})};\n')
    open(sys.argv[2], 'w', encoding='utf-8').write(js)
    print('суша, клеток:', int((grid > 0).sum()), '| размер', len(js) // 1024, 'КБ')
    if len(sys.argv) > 3:
        import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
        cols = plt.get_cmap('tab10')
        fig, axs = plt.subplots(1, 2, figsize=(16, 5))
        for ax, f, title in [(axs[0], 0, 'Сегодня'), (axs[1], 1, 'Пангея, 250 млн лет назад (схема)')]:
            img = np.zeros((180, 360, 3)) + [0.1, 0.25, 0.5]
            for i in range(180):
                for j in range(360):
                    p = grid[i, j]
                    if not p: continue
                    v = vec(89.5 - i, j - 179.5)
                    if f: v = R[p] @ v
                    la, lo = math.degrees(math.asin(v[2])), math.degrees(math.atan2(v[1], v[0]))
                    ii, jj = int(89.5 - la + 0.5), int(lo + 179.5 + 0.5) % 360
                    img[min(179, max(0, ii)), jj] = cols(p % 10)[:3]
            ax.imshow(img, extent=[-180, 180, -90, 90]); ax.set_title(title)
        fig.tight_layout(); fig.savefig(sys.argv[3], dpi=90)


if __name__ == '__main__':
    main()
