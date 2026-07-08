// Gera um instalador Windows (NSIS) do export PC — ADR-0101, M2.
// Empacota o `dist-native/` (produzido pelo export-game.mjs) num
// `<jogo>-setup.exe` por-usuário (sem admin): atalhos + Adicionar/Remover +
// desinstalador. Ferramenta de BUILD; o NSIS portátil vem do fetch-deps.
//
// Uso: node native/scripts/make-installer.mjs <gameDir>
//   (requer o export feito antes: <gameDir>/dist-native/<jogo>.exe)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const engineRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const makensis = path.join(engineRoot, 'native', 'tools', 'nsis', 'Bin', 'makensis.exe');
const nsiTemplate = path.join(engineRoot, 'native', 'scripts', 'installer.nsi');

/** Gera `<gameDir>/<jogo>-setup.exe` a partir de `<gameDir>/dist-native`. */
export function makeInstaller(gameDir) {
  const gameName = path.basename(gameDir);
  const dist = path.join(gameDir, 'dist-native');
  if (!fs.existsSync(path.join(dist, `${gameName}.exe`))) {
    throw new Error(`make-installer: rode o export antes — não achei "${gameName}.exe" em ${dist}`);
  }
  if (!fs.existsSync(makensis)) {
    throw new Error('make-installer: NSIS ausente — rode native/scripts/fetch-deps.ps1');
  }
  const outFile = path.join(gameDir, `${gameName}-setup.exe`);
  // Valores por /D (o .nsi é estático) — sem shell (execFileSync), espaços ok.
  execFileSync(
    makensis,
    ['-V2', `-DAPPNAME=${gameName}`, `-DDISTDIR=${dist}`, `-DOUTFILE=${outFile}`, nsiTemplate],
    { stdio: 'inherit' },
  );
  return outFile;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const gameDir = process.argv[2] ? path.resolve(process.argv[2]) : null;
  if (!gameDir) {
    console.error('uso: node make-installer.mjs <gameDir>');
    process.exit(1);
  }
  const out = makeInstaller(gameDir);
  console.log(`[installer] OK → ${out} (${(fs.statSync(out).size / 1e6).toFixed(1)} MB)`);
}
