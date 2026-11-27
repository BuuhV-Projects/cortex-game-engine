// Encoder NATIVO do basis_universal (o CLI `basisu`, C++) para a fonte acima do
// teto do encoder WASM (SPEC-0750, ADR-0751). O WASM recusa mais de 12.582.912
// texels (fixo na compilação dele); o C++ só limita o lado a 16384, então 4096²
// passa nas dimensões originais — o cook NUNCA reduz textura.
//
// O exe é compilado do MESMO commit fixado do WASM e do transcoder
// (native/scripts/build-basisu.ps1) e fica em native/tools/basisu/ (fora do git,
// como o basis-encoder). Ferramenta de BUILD, não vai pro runtime.
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Code do erro de "basisu nativo não está aqui": o cook avisa e mantém o original. */
export const ERR_NATIVE_ENCODER_MISSING = 'ERR_NATIVE_ENCODER_MISSING';
/**
 * O exe existe mas não rodou (não iniciou, saiu com erro, passou do timeout ou
 * não gravou o KTX2): é problema da INSTALAÇÃO (DLL, antivírus), não da textura.
 * Como o MISSING, o cook não cacheia o GLB, para o próximo export tentar de novo.
 */
export const ERR_NATIVE_ENCODER_FAILED = 'ERR_NATIVE_ENCODER_FAILED';
/**
 * Teto de tempo de um encode nativo. O 4096² mais lento medido levou ~14 s
 * (SPEC-0750); a folga cobre máquina lenta sem deixar um exe travado parar o
 * export para sempre.
 */
export const NATIVE_ENCODE_TIMEOUT_MS = 5 * 60 * 1000;

const EXE_NAME = process.platform === 'win32' ? 'basisu.exe' : 'basisu';
/** Caminho padrão do exe, relativo a este script (como o do WASM). */
export const DEFAULT_BASISU_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'tools', 'basisu', EXE_NAME);

/** Extensão do arquivo temporário: o basisu escolhe o leitor pela extensão. */
const SOURCE_EXTENSION = { png: '.png', jpeg: '.jpg' };
/** Mesmo nível do `setPackUASTCFlags(1)` do WASM ("faster", ADR-0119). */
const UASTC_LEVEL = 1;
/** Mesmo dicionário do RDO do WASM (`setRDOUASTCDictSize(1024)`). */
const UASTC_RDO_DICT_BYTES = 1024;
/** Stdout/stderr guardados do exe (o motivo da falha sai do fim deles). */
const EXEC_MAX_BUFFER_BYTES = 16 * 1024 * 1024;
const ERROR_TAIL_CHARS = 400;

/** O basisu nativo existe neste checkout/instalação? */
export function hasNativeEncoder(exePath = DEFAULT_BASISU_PATH) {
  return existsSync(exePath);
}

/**
 * Argumentos do basisu equivalentes às opções do WASM: UASTC nível 1 com RDO só
 * quando `rdoScalar > 0` (dicionário 1024), sRGB ou linear (métrica, transfer
 * function e filtro dos mips), mips e KTX2 (o UASTC no KTX2 já sai com Zstd por
 * padrão). `uastc: false` é ETC1S com `-q quality`.
 */
export function basisuArgs({ uastc, srgb, quality, rdoScalar }, input, output) {
  const args = ['-ktx2', '-quiet', '-mipmap', srgb ? '-srgb' : '-linear'];
  if (uastc) {
    args.push('-uastc', '-uastc_level', String(UASTC_LEVEL));
    if (rdoScalar > 0) args.push('-uastc_rdo_l', String(rdoScalar), '-uastc_rdo_d', String(UASTC_RDO_DICT_BYTES));
  } else {
    args.push('-etc1s', '-q', String(quality));
  }
  args.push('-file', input, '-output_file', output);
  return args;
}

/**
 * Encoda pelo basisu nativo: grava a fonte num temporário (mkdtemp no tmpdir do
 * SO), roda o exe e lê o KTX2. A pasta sai no `finally`, com sucesso ou não.
 */
export async function encodeKtx2Native(bytes, format, opts, { exePath = DEFAULT_BASISU_PATH, timeoutMs = NATIVE_ENCODE_TIMEOUT_MS } = {}) {
  if (!hasNativeEncoder(exePath)) {
    throw Object.assign(
      new Error(`encoder nativo basisu ausente em ${exePath} (rode native/scripts/build-basisu.ps1)`),
      { code: ERR_NATIVE_ENCODER_MISSING },
    );
  }
  const dir = await mkdtemp(path.join(os.tmpdir(), 'cortex-basisu-'));
  try {
    const input = path.join(dir, `source${SOURCE_EXTENSION[format]}`);
    const output = path.join(dir, 'out.ktx2');
    await writeFile(input, bytes);
    try {
      await execFileAsync(exePath, basisuArgs(opts, input, output), {
        maxBuffer: EXEC_MAX_BUFFER_BYTES,
        windowsHide: true,
        timeout: timeoutMs,
      });
    } catch (err) {
      const why = err?.killed ? `passou de ${timeoutMs} ms` : `${err?.stderr ?? ''}${err?.stdout ?? ''}`.trim().slice(-ERROR_TAIL_CHARS);
      throw Object.assign(new Error(`basisu nativo falhou: ${why || err?.message}`), { code: ERR_NATIVE_ENCODER_FAILED });
    }
    if (!existsSync(output)) {
      throw Object.assign(new Error('basisu nativo não gravou o KTX2'), { code: ERR_NATIVE_ENCODER_FAILED });
    }
    return new Uint8Array(await readFile(output));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
