// Общее окружение для браузерных проверок (Playwright + Chrome).
// Пути переопределяются переменными: PLAYWRIGHT_DIR (где лежит node_modules с playwright), CHROME (путь к браузеру).
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '../..');
function loadPlaywright() {
  const tries = [process.env.PLAYWRIGHT_DIR, ROOT, '/opt/npm-tools/node_modules'].filter(Boolean);
  for (const p of tries) { try { return require(require.resolve('playwright', { paths: [p] })); } catch {} }
  throw new Error('Playwright не найден: npm i -D playwright или укажи PLAYWRIGHT_DIR');
}
const { chromium } = loadPlaywright();
const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
/** URL сборки: без аргумента — текущая версия из dist/, иначе ищем в dist/ и releases/ (например '4.3.0') */
function buildUrl(v = version) {
  for (const dir of ['dist', 'releases']) {
    const f = path.join(ROOT, dir, `sun_evolution_v${v}.html`);
    if (fs.existsSync(f)) return 'file://' + f;
  }
  throw new Error(`Нет сборки v${v} — сначала npm run build`);
}
// swiftshader: видеокарта эмулируется на процессоре — скорость WebGL тут НЕ равна скорости телефона
const launch = () => chromium.launch({
  executablePath: process.env.CHROME || (fs.existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined),
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader']
});
const OUT = path.join(ROOT, 'tools/check/out');
fs.mkdirSync(OUT, { recursive: true });
module.exports = { chromium, launch, buildUrl, version, ROOT, OUT };
