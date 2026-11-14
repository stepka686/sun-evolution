// Сборка: модули из src/ → один самодостаточный HTML в dist/ (открывается двойным кликом, без сервера)
import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(root, 'src');
const dist = path.join(root, 'dist');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

const result = await esbuild.build({
  entryPoints: [path.join(src, 'main.js')],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  minify: process.argv.includes('--minify'),
  write: false,
  legalComments: 'none',
  // Строгий режим: запись в необъявленную переменную падает с ошибкой, а не создаёт тихо глобальную
  banner: { js: '"use strict";' }
});
// Строка "</script>" внутри JS закрыла бы тег раньше времени
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = fs.readFileSync(path.join(src, 'styles.css'), 'utf8');
let html = fs.readFileSync(path.join(src, 'index.html'), 'utf8');

html = html
  .replace(/\s*<link rel="stylesheet" href="\.\/styles\.css">/, () => `\n  <style>\n${css}  </style>`)
  .replace(/\s*<!--[^>]*npm run dev[^>]*-->/, '')
  .replace(/<script type="module" src="\.\/main\.js"><\/script>/, () => `<script>\n${js}</script>`);

fs.mkdirSync(dist, { recursive: true });
const out = path.join(dist, `sun_evolution_v${pkg.version}.html`);
fs.writeFileSync(out, html);
console.log(`Собрано: ${path.relative(root, out)} (${(html.length / 1024).toFixed(0)} КБ)`);
