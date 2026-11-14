// Гифка для README: таймлапс всего кинорежима (90 кадров через 0.6 с) → docs/img/cinema.gif (нужны Pillow: pip install pillow)
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { launch, buildUrl, ROOT, OUT } = require('./_env.cjs');
(async () => {
  const b = await launch();
  const p = await b.newPage({ viewport: { width: 412, height: 860 }, deviceScaleFactor: 1 });
  await p.goto(buildUrl()); await p.waitForTimeout(1500);
  await p.evaluate(() => document.getElementById('cinemaBtn').click());
  const dir = path.join(OUT, 'gif'); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  // кадры берём прямо с холста (toDataURL) — скриншот элемента в headless на swiftshader стоит секунды
  const N = +(process.env.FRAMES || 90), GAP = +(process.env.GAP || 600);   // таймлапс всего фильма
  for (let i = 0; i < N; i++) {
    const url = await p.evaluate(() => document.getElementById('mainCanvas').toDataURL('image/png'));
    fs.writeFileSync(path.join(dir, `f${String(i).padStart(3, '0')}.png`), Buffer.from(url.split(',')[1], 'base64'));
    await p.waitForTimeout(GAP);
  }
  await b.close();
  execFileSync('python3', ['-c', `
import glob
from PIL import Image
fr = [Image.open(f).convert('RGB') for f in sorted(glob.glob('${dir}/f*.png'))]
w = 300; fr = [f.resize((w, round(f.height * w / f.width)), Image.LANCZOS) for f in fr]
pal = [f.quantize(colors=128, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE) for f in fr]
pal[0].save('${path.join(ROOT, 'docs/img/cinema.gif')}', save_all=True, append_images=pal[1:], duration=160, loop=0, optimize=True)
`], { stdio: 'inherit' });
  console.log('docs/img/cinema.gif', fs.statSync(path.join(ROOT, 'docs/img/cinema.gif')).size);
})();
