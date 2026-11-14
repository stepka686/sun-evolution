"""
Звёздное небо для вида с поверхности: звёзды до 5.5ᵐ, линии и названия созвездий.

    python tools/sky/build_sky.py <папка_d3-celestial/data> src/data/skyCatalog.js

Источник: d3-celestial (Olaf Frohn, BSD-3), данные — Йельский каталог ярких звёзд / Hipparcos.
"""
import json
import os
import sys


def main():
    d, out = sys.argv[1], sys.argv[2]
    stars = json.load(open(os.path.join(d, 'stars.6.json')))['features']
    names = json.load(open(os.path.join(d, 'starnames.json')))
    lines = json.load(open(os.path.join(d, 'constellations.lines.json')))['features']
    cons = json.load(open(os.path.join(d, 'constellations.json')))['features']
    flat, nm = [], {}
    stars = sorted([s for s in stars if s['properties']['mag'] <= 5.5], key=lambda s: s['properties']['mag'])
    for i, s in enumerate(stars):
        ra, dec = s['geometry']['coordinates']
        p = s['properties']
        bv = float(p['bv']) if p['bv'] not in ('', None) else 0.6
        flat += [round(ra, 2), round(dec, 2), round(p['mag'], 2), round(bv, 2)]
        n = names.get(str(s['id']), {})
        if (p['mag'] < 1.7 or s['id'] == 11767) and n.get('ru'):
            nm[i] = 'Полярная' if s['id'] == 11767 else n['ru']
    cl = {f['id']: [[[round(x, 2), round(y, 2)] for x, y in line] for line in f['geometry']['coordinates']] for f in lines}
    cn = [[c['properties']['ru'], round(c['properties']['display'][0], 1), round(c['properties']['display'][1], 1)] for c in cons]
    js = ('// Звёздное небо: Йельский каталог ярких звёзд / Hipparcos через d3-celestial (Olaf Frohn, лицензия BSD-3).\n'
          '// Сгенерировано tools/sky/build_sky.py — не редактировать вручную.\n'
          '// STARS: плоский массив [α°, δ°, m, B−V] для звёзд ярче 5.5ᵐ, отсортированных по блеску (α — от −180 до 180)\n'
          f'export const STARS = {json.dumps(flat, separators=(",", ":"))};\n'
          f'export const STAR_NAMES = {json.dumps(nm, ensure_ascii=False, separators=(",", ":"))};\n'
          f'export const CONST_LINES = {json.dumps(cl, separators=(",", ":"))};\n'
          f'export const CONST_NAMES = {json.dumps(cn, ensure_ascii=False, separators=(",", ":"))};\n')
    open(out, 'w', encoding='utf-8').write(js)
    print(f'звёзд: {len(stars)}, имён: {len(nm)}, созвездий: {len(cl)}, {len(js) // 1024} КБ')


if __name__ == '__main__':
    main()
