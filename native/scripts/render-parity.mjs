// render-parity.mjs — comparador de paridade visual (SPEC-0240, passo 1).
//
// Recebe dois arquivos RGBA crus (ou dois diretórios, cada um com um ou mais
// `frame_NNNN_WxH.rgba` gravados por CORTEX_RENDER_PARITY_CAPTURE) e imprime,
// por par de quadros:
//   - maxChannelDiff        — maior |a-b| por canal (0-255), pixel a pixel;
//   - pctPixelsAboveNoiseFloor — % de pixels cujo maxChannelDiff excede --delta;
//   - a coordenada (x, y) e os RGBA dos dois lados no pior pixel;
//   - um histograma de maxChannelDiff.
//
// Não escolhe limiar de aprovação nenhum — só mede e reporta. Quem decide o
// piso de ruído e a fração tolerada é o passo 3 da SPEC (calibração).
//
// Uso:
//   node native/scripts/render-parity.mjs <a.rgba> <b.rgba> [--delta N] [--bins N]
//   node native/scripts/render-parity.mjs <dirA> <dirB> [--delta N] [--bins N]
//
//   --delta N : piso de ruído por canal (0-255) usado no pctPixelsAboveNoiseFloor.
//               Obrigatório ter algum valor — sem --delta, usa DEFAULT_DELTA
//               (documentado abaixo) só pra não quebrar um uso exploratório.
//   --bins N  : número de faixas do histograma de maxChannelDiff (default: ver
//               DEFAULT_HISTOGRAM_BINS).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Faixas do histograma de maxChannelDiff quando --bins não é passado. 0-255
// dividido em faixas iguais de largura ~32 (8 faixas) — granularidade
// suficiente pra distinguir "ruído espalhado perto de 0" de "erro concentrado
// perto de 255" sem poluir a saída com 256 linhas.
const DEFAULT_HISTOGRAM_BINS = 8;
// Piso de ruído default só para uso exploratório (sem --delta): qualquer
// diferença já conta. O valor real vem do passo 3 da SPEC (calibração), nunca
// arbitrado aqui.
const DEFAULT_DELTA = 0;
const CHANNELS_PER_PIXEL = 4; // RGBA

function parseArgs(argv) {
  const positional = [];
  let delta = DEFAULT_DELTA;
  let bins = DEFAULT_HISTOGRAM_BINS;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--delta') {
      delta = Number(argv[++i]);
    } else if (a === '--bins') {
      bins = Number(argv[++i]);
    } else {
      positional.push(a);
    }
  }
  if (positional.length < 2) {
    throw new Error(
      'uso: render-parity.mjs <a.rgba|dirA> <b.rgba|dirB> [--delta N] [--bins N]',
    );
  }
  return { pathA: positional[0], pathB: positional[1], delta, bins };
}

// "frame_0004_1280x720.rgba" -> { width: 1280, height: 720 }. Lança se o nome
// não seguir o formato gravado por render_parity_capture.cpp.
function dimsFromFilename(filePath) {
  const base = path.basename(filePath);
  const m = base.match(/_(\d+)x(\d+)\.rgba$/i);
  if (!m) {
    throw new Error(
      `não consegui extrair width/height do nome '${base}' (esperado *_WxH.rgba)`,
    );
  }
  return { width: Number(m[1]), height: Number(m[2]) };
}

// Resolve um argumento (arquivo único ou diretório) para uma lista ordenada
// de arquivos .rgba. Diretório: todos os frame_*.rgba, em ordem de nome (que
// é ordem de captura, pelo zero-pad de 4 dígitos).
function listRgbaFiles(p) {
  const stat = fs.statSync(p);
  if (stat.isFile()) return [p];
  return fs
    .readdirSync(p)
    .filter((f) => f.toLowerCase().endsWith('.rgba'))
    .sort()
    .map((f) => path.join(p, f));
}

function loadFrame(filePath) {
  const { width, height } = dimsFromFilename(filePath);
  const buffer = fs.readFileSync(filePath);
  const expected = width * height * CHANNELS_PER_PIXEL;
  if (buffer.length !== expected) {
    throw new Error(
      `${filePath}: tamanho ${buffer.length} bytes não bate com ${width}x${height}x4=${expected}`,
    );
  }
  return { path: filePath, width, height, buffer };
}

// Compara dois quadros já carregados. Devolve o relatório de uma comparação.
// Exportada porque é a única lógica PURA daqui (buffer entra, número sai) e
// portanto a única testável sem GPU — ver tests/native/render-parity.test.ts.
export function compareFrames(a, b, delta = DEFAULT_DELTA, bins = DEFAULT_HISTOGRAM_BINS) {
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(
      `dimensões não batem: ${a.path} é ${a.width}x${a.height}, ${b.path} é ${b.width}x${b.height}`,
    );
  }
  const { width, height } = a;
  const pixelCount = width * height;

  let maxChannelDiff = 0;
  let worst = { x: 0, y: 0, diff: -1 };
  let pixelsAboveNoiseFloor = 0;
  const histogram = new Array(bins).fill(0);
  const binWidth = 256 / bins;

  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const offset = (py * width + px) * CHANNELS_PER_PIXEL;
      let pixelMaxDiff = 0;
      for (let c = 0; c < CHANNELS_PER_PIXEL; c++) {
        const diff = Math.abs(a.buffer[offset + c] - b.buffer[offset + c]);
        if (diff > pixelMaxDiff) pixelMaxDiff = diff;
      }
      if (pixelMaxDiff > maxChannelDiff) maxChannelDiff = pixelMaxDiff;
      if (pixelMaxDiff > worst.diff) {
        worst = { x: px, y: py, diff: pixelMaxDiff, offset };
      }
      if (pixelMaxDiff > delta) pixelsAboveNoiseFloor++;

      let bin = Math.floor(pixelMaxDiff / binWidth);
      if (bin >= bins) bin = bins - 1;
      histogram[bin]++;
    }
  }

  const worstOffset = worst.offset;
  const worstPixel = {
    x: worst.x,
    y: worst.y,
    a: Array.from(a.buffer.subarray(worstOffset, worstOffset + CHANNELS_PER_PIXEL)),
    b: Array.from(b.buffer.subarray(worstOffset, worstOffset + CHANNELS_PER_PIXEL)),
  };

  return {
    fileA: a.path,
    fileB: b.path,
    width,
    height,
    delta,
    maxChannelDiff,
    pctPixelsAboveNoiseFloor: (pixelsAboveNoiseFloor / pixelCount) * 100,
    worstPixel,
    histogram: histogram.map((count, i) => ({
      range: `[${Math.round(i * binWidth)}, ${
        i === bins - 1 ? 255 : Math.round((i + 1) * binWidth) - 1
      }]`,
      count,
      pct: (count / pixelCount) * 100,
    })),
  };
}

function printReport(report) {
  console.log('──────── [render-parity] comparação ────────');
  console.log(`A: ${report.fileA}`);
  console.log(`B: ${report.fileB}`);
  console.log(`dimensões: ${report.width}x${report.height}`);
  console.log(`delta (piso de ruído usado): ${report.delta}`);
  console.log(`maxChannelDiff: ${report.maxChannelDiff}`);
  console.log(
    `pctPixelsAboveNoiseFloor: ${report.pctPixelsAboveNoiseFloor.toFixed(6)}%`,
  );
  console.log(
    `pior pixel: (${report.worstPixel.x}, ${report.worstPixel.y}) ` +
      `A=rgba(${report.worstPixel.a.join(',')}) B=rgba(${report.worstPixel.b.join(',')})`,
  );
  console.log('histograma de maxChannelDiff:');
  for (const bucket of report.histogram) {
    console.log(
      `  ${bucket.range.padEnd(12)} ${String(bucket.count).padStart(10)} px  (${bucket.pct.toFixed(4)}%)`,
    );
  }
  console.log('\nJSON:');
  console.log(JSON.stringify(report));
}

function main() {
  const { pathA, pathB, delta, bins } = parseArgs(process.argv.slice(2));
  const filesA = listRgbaFiles(pathA);
  const filesB = listRgbaFiles(pathB);
  if (filesA.length === 0 || filesB.length === 0) {
    throw new Error('nenhum arquivo .rgba encontrado em um dos dois caminhos');
  }
  const pairCount = Math.min(filesA.length, filesB.length);
  if (filesA.length !== filesB.length) {
    console.error(
      `[render-parity] aviso: A tem ${filesA.length} quadro(s), B tem ${filesB.length} — comparando só os primeiros ${pairCount}`,
    );
  }

  const reports = [];
  for (let i = 0; i < pairCount; i++) {
    const a = loadFrame(filesA[i]);
    const b = loadFrame(filesB[i]);
    const report = compareFrames(a, b, delta, bins);
    printReport(report);
    reports.push(report);
    console.log('');
  }

  if (reports.length > 1) {
    const worst = reports.reduce((acc, r) => Math.max(acc, r.maxChannelDiff), 0);
    const worstPct = reports.reduce((acc, r) => Math.max(acc, r.pctPixelsAboveNoiseFloor), 0);
    console.log('──────── [render-parity] resumo (todos os pares) ────────');
    console.log(`pares comparados: ${reports.length}`);
    console.log(`maxChannelDiff (pior de todos os pares): ${worst}`);
    console.log(`pctPixelsAboveNoiseFloor (pior de todos os pares): ${worstPct.toFixed(6)}%`);
  }
}

// Só roda a CLI quando este arquivo é o ponto de entrada — importado por um
// teste, expõe `compareFrames` sem executar nada.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (err) {
    console.error('[render-parity] FALHOU:', err.message);
    process.exit(1);
  }
}
