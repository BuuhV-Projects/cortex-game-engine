// Gera os PNGs da marca (TS Cortex Studio) a partir dos SVGs em brand/, e o
// header C++ com os bytes da splash EMBUTIDOS no host.
//
// A splash é embutida (não é um arquivo ao lado do exe) de propósito: ela é
// obrigatória — assinatura de que o jogo foi feito na engine — e um arquivo
// solto seria trivial de apagar. Ver docs/adrs/0109-splash-obrigatoria-da-engine.md
//
// Uso: node native/scripts/gen-brand.mjs      (cwd = raiz do repo do engine)
// Requer Chrome/Edge instalado (rasteriza o SVG). Rode só quando o SVG mudar —
// os PNGs e o header gerados são COMMITADOS, pra o build do host não depender
// de browser.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const engineRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const brandDir = path.join(engineRoot, 'brand');
const outDir = path.join(brandDir, 'out');

const CHROME_CANDIDATES = [
  process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  `${os.homedir()}/AppData/Local/Google/Chrome/Application/chrome.exe`,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].filter(Boolean);

const chrome = CHROME_CANDIDATES.find((p) => fs.existsSync(p));
if (!chrome) {
  console.error('[brand] Chrome/Edge não encontrado — defina a env CHROME com o caminho do .exe');
  process.exit(1);
}

/**
 * Rasteriza um SVG em PNG no tamanho pedido.
 *
 * Envolve o SVG num HTML com `<img width:100% height:100%>` porque o Chrome
 * renderiza um SVG *standalone* no tamanho INTRÍNSECO dele (width/height do
 * elemento) — abrir o arquivo direto numa janela 2× deixa o desenho num canto.
 * O wrapper faz o SVG escalar pra viewport inteira.
 *
 * `bg` = 'transparent' (padrão) preserva o alpha; passe uma cor pra gerar um
 * preview humano sobre fundo escuro.
 */
function renderSvg(svgPath, pngPath, width, height, bg = 'transparent') {
  // O profile vai pro temp porque o headless recusa rodar sobre o profile ativo.
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-brand-'));
  const svgUrl = `file:///${svgPath.replace(/\\/g, '/')}`;
  const htmlPath = path.join(profile, 'wrap.html');
  fs.writeFileSync(
    htmlPath,
    `<!doctype html><meta charset="utf-8"><style>
       html,body{margin:0;padding:0;width:100%;height:100%;background:${bg};}
       img{width:100%;height:100%;display:block;}
     </style><img src="${svgUrl}">`,
  );
  try {
    execFileSync(
      chrome,
      [
        '--headless=new',
        '--disable-gpu',
        '--hide-scrollbars',
        '--default-background-color=00000000',
        `--user-data-dir=${profile}`,
        `--window-size=${width},${height}`,
        `--screenshot=${pngPath}`,
        `file:///${htmlPath.replace(/\\/g, '/')}`,
      ],
      { stdio: 'pipe' },
    );
  } finally {
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
  if (!fs.existsSync(pngPath)) throw new Error(`falhou ao rasterizar ${svgPath}`);
  console.log(`[brand] ${path.basename(pngPath)} (${width}×${height})`);
}

/** Emite os bytes de um PNG como array C++ `constexpr unsigned char`. */
function writeByteHeader(pngPath, headerPath, symbol) {
  const bytes = fs.readFileSync(pngPath);
  const lines = [];
  for (let i = 0; i < bytes.length; i += 16) {
    lines.push('    ' + [...bytes.subarray(i, i + 16)].map((b) => `0x${b.toString(16).padStart(2, '0')}`).join(', '));
  }
  const src = `// GERADO por native/scripts/gen-brand.mjs — NÃO EDITE À MÃO.
// Fonte: brand/ts-cortex-studio.svg → brand/out/${path.basename(pngPath)}
#pragma once
namespace brand {
// PNG RGBA da splash da engine, embutido no binário (ver ADR-0109).
inline constexpr unsigned char ${symbol}[] = {
${lines.join(',\n')}
};
inline constexpr unsigned long ${symbol}_len = ${bytes.length}ul;
}  // namespace brand
`;
  fs.mkdirSync(path.dirname(headerPath), { recursive: true });
  fs.writeFileSync(headerPath, src);
  console.log(`[brand] ${path.relative(engineRoot, headerPath)} (${(bytes.length / 1024).toFixed(1)} KB)`);
}

fs.mkdirSync(outDir, { recursive: true });

const lockup = path.join(brandDir, 'ts-cortex-studio.svg');
const mark = path.join(brandDir, 'ts-cortex-mark.svg');

// Splash: 2× o lockup (1400×420) pra ficar nítida em telas grandes/HiDPI.
const splashPng = path.join(outDir, 'splash.png');
renderSvg(lockup, splashPng, 2800, 840);

// Preview humano: a marca é feita pra fundo escuro (o wordmark é quase branco).
// Sobre branco ela some — este PNG existe só pra revisar o desenho.
renderSvg(lockup, path.join(outDir, 'preview-dark.png'), 1400, 420, '#0d0e14');

// Ícone base: a marca isolada em 512². O .ico do exe é derivado daqui no export.
renderSvg(mark, path.join(outDir, 'mark-512.png'), 512, 512);
renderSvg(mark, path.join(outDir, 'mark-256.png'), 256, 256);

writeByteHeader(splashPng, path.join(engineRoot, 'native', 'src', 'brand', 'splash_png.h'), 'kSplashPng');

console.log('[brand] pronto.');
