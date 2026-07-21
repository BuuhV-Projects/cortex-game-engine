// bench.mjs — benchmark de render do host nativo (M-perf-1 / ADR-0135).
//
// Exporta o examples/bench-city pelo pipeline normal (export-game.mjs), roda o
// launcher.exe resultante, coleta a linha `[bench]{…}` do stdout, guarda no
// histórico (native/bench-history.jsonl) e imprime um resumo comparando com a
// última execução. É o "juiz" objetivo dos cortes de perf do PRD-0005 — rode
// antes e depois de cada marco (M-perf-2/3/4) pra medir o ganho real.
//
// Uso: node native/scripts/bench.mjs [--no-export] [--timeout <s>]
//   --no-export : pula o export (reusa o dist-native já gerado)
//   --timeout   : segundos de espera pela linha [bench] (default 180)

import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const engineRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const gameDir = path.join(engineRoot, 'examples', 'bench-city');
const exePath = path.join(gameDir, 'dist-native', 'launcher.exe');
const historyPath = path.join(engineRoot, 'native', 'bench-history.jsonl');

const args = process.argv.slice(2);
const noExport = args.includes('--no-export');
const timeoutSec = Number(args[args.indexOf('--timeout') + 1]) || 180;

function exportGame() {
  console.log('[bench] exportando examples/bench-city …');
  execFileSync(process.execPath, [path.join(engineRoot, 'native', 'scripts', 'export-game.mjs'), gameDir], {
    stdio: 'inherit',
  });
}

function runAndCollect() {
  return new Promise((resolvePromise, reject) => {
    if (!fs.existsSync(exePath)) {
      reject(new Error(`launcher.exe não encontrado em ${exePath} — rode sem --no-export`));
      return;
    }
    console.log('[bench] rodando o host e aguardando a linha [bench] …');
    const child = spawn(exePath, [], { cwd: path.dirname(exePath) });
    let buffer = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error(`timeout (${timeoutSec}s) sem receber a linha [bench]`));
    }, timeoutSec * 1000);

    const onData = (chunk) => {
      buffer += chunk.toString();
      // O host prefixa a saída do JS com "[js] ", então a linha é
      // "[js] [bench]{…}" — procuramos o marcador em QUALQUER posição.
      const line = buffer.split(/\r?\n/).find((l) => l.includes('[bench]{'));
      if (!line || settled) return;
      settled = true;
      clearTimeout(timer);
      const json = line.slice(line.indexOf('[bench]') + '[bench]'.length);
      try {
        resolvePromise(JSON.parse(json));
      } catch (err) {
        reject(new Error(`linha [bench] inválida: ${err.message}\n${line}`));
      }
      child.kill();
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', (c) => process.stderr.write(c));
    child.on('error', reject);
    child.on('exit', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error('o host encerrou sem emitir [bench]'));
    });
  });
}

function gitSha() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: engineRoot }).toString().trim();
  } catch {
    return 'unknown';
  }
}

function lastEntry() {
  if (!fs.existsSync(historyPath)) return null;
  const lines = fs.readFileSync(historyPath, 'utf8').trim().split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return null;
  try {
    return JSON.parse(lines[lines.length - 1]);
  } catch {
    return null;
  }
}

function fmtDelta(now, before) {
  if (before === undefined || before === null) return '';
  const d = now - before;
  const sign = d >= 0 ? '+' : '';
  return ` (${sign}${d.toFixed(1)} vs último)`;
}

async function main() {
  if (!noExport) exportGame();
  const report = await runAndCollect();
  const prev = lastEntry();

  const entry = { at: new Date().toISOString(), git: gitSha(), report };
  fs.appendFileSync(historyPath, JSON.stringify(entry) + '\n');

  const p = report.params;
  console.log('\n──────── [bench] cidade sintética ────────');
  console.log(
    `cena: ${p.rows}×${p.rows} = ${p.rows * p.rows} prédios .glb · espaço ${p.spacing}m · ${p.traffic} tráfego`,
  );
  console.log(`frames medidos: ${report.frames}`);
  console.log(`FPS médio: ${report.fpsAvg}${fmtDelta(report.fpsAvg, prev?.report?.fpsAvg)}`);
  console.log(`FPS pior 1%: ${report.fpsP1}${fmtDelta(report.fpsP1, prev?.report?.fpsP1)}`);
  console.log('ms/subsistema (p99):', report.ms);
  console.log('NAPI/frame:', report.napi ?? '(host sem __cortexNapiStats — rebuild p/ contadores)');
  console.log(`\nhistórico: ${path.relative(engineRoot, historyPath)} (git ${entry.git})`);
}

main().catch((err) => {
  console.error('[bench] FALHOU:', err.message);
  process.exit(1);
});
