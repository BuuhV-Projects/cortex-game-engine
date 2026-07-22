// Rasteriza o blueprint (HTML self-contained do render_blueprint.mjs) numa IMAGEM
// PNG — o ENTREGÁVEL da skill. Embrulha o corpo num doc completo com fundo escuro
// e chama Chrome/Edge headless. Acha o navegador sozinho (Win/macOS/Linux).
//
// Uso:  node shot.mjs <in.html> <out.png> [larguraPx] [escala]
//   - larguraPx: largura da viewport (default: lê a width do .bp-root; senão 1840)
//   - escala: device-scale-factor (default 2 → PNG nítido pra retina/zoom)
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const [inHtml, outPng, widthArg, scaleArg] = process.argv.slice(2);
if (!inHtml || !outPng) {
  console.error('uso: node shot.mjs <in.html> <out.png> [larguraPx] [escala]');
  process.exit(1);
}
const body = readFileSync(inHtml, 'utf8');
// dimensões exatas: o render_blueprint emite `<!--BP_W:.. BP_H:..-->` no topo.
const stamp = body.match(/BP_W:(\d+)\s+BP_H:(\d+)/);
const width = widthArg ? +widthArg : +(stamp?.[1] ?? body.match(/width:\s*(\d+)px/)?.[1] ?? 1840);
const stampH = stamp ? +stamp[2] : null;
const scale = scaleArg ? +scaleArg : 2;

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);
const browser = CANDIDATES.find((p) => existsSync(p));
if (!browser) {
  console.error('Chrome/Edge não encontrado. Defina CHROME_PATH.');
  process.exit(1);
}

const tmp = mkdtempSync(join(tmpdir(), 'bp-shot-'));
const full = join(tmp, 'full.html');
// altura folgada: o Chrome corta no window-size; medimos o suficiente pro rodapé.
writeFileSync(
  full,
  `<!doctype html><meta charset="utf-8">
<style>html,body{margin:0;background:#0e0b1e}</style>${body}`,
);
const height = stampH ?? Math.round(width * 0.75) + 240;
try {
  execFileSync(
    browser,
    [
      '--headless',
      '--disable-gpu',
      '--hide-scrollbars',
      `--force-device-scale-factor=${scale}`,
      `--window-size=${width},${height}`,
      // absoluto: o Chrome resolve --screenshot pelo cwd DELE, não o do node.
      `--screenshot=${resolve(outPng)}`,
      `file://${full.replace(/\\/g, '/')}`,
    ],
    { stdio: 'pipe' },
  );
} catch (e) {
  // Chrome headless retorna != 0 às vezes mesmo escrevendo o PNG; checa o arquivo.
  if (!existsSync(resolve(outPng))) {
    console.error('falha no screenshot:', e.message);
    rmSync(tmp, { recursive: true, force: true });
    process.exit(1);
  }
}
rmSync(tmp, { recursive: true, force: true });
console.log(`imagem: ${outPng}  (${width}×${height} @${scale}x, browser=${browser.split('/').pop()})`);
