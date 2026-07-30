// Cobertura de glifos da fonte da UI de runtime (ADR-0170 / SPEC-0171).
//
// O rasterizador nativo (text_raster.cpp) tem UMA fonte e nenhum fallback:
// codepoint fora da `cmap` da Roboto-Medium.ttf vira `.notdef` — a caixinha que
// engoliu o ícone do guarda-roupa do teste4. O DOM do Studio esconde isso caindo
// numa fonte do sistema, então o preview não serve de prova.
//
// Este módulo lê a `cmap` direto dos bytes da fonte (sem dependências, formatos
// 4 e 12) e produz o CONTRATO consultável em teste: quais codepoints têm glifo.
// O `build:engine` grava o resultado em `dist-engine/ui-font-glyphs.json` e o
// vendoring leva o arquivo pra cada jogo.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// ── Offsets do formato TrueType (nomeados: nada de literal solto no parser) ──

/** Offset table: contagem de tabelas e início/tamanho dos registros. */
const OFFSET_TABLE_NUM_TABLES = 4;
const TABLE_RECORDS_START = 12;
const TABLE_RECORD_SIZE = 16;
const TABLE_RECORD_TAG_LENGTH = 4;
const TABLE_RECORD_OFFSET = 8;

/** Tabela `cmap`: cabeçalho + registros de encoding. */
const CMAP_NUM_SUBTABLES = 2;
const CMAP_RECORDS_START = 4;
const CMAP_RECORD_SIZE = 8;
const CMAP_RECORD_SUBTABLE_OFFSET = 4;

/** Subtabela: o formato mora nos 2 primeiros bytes. */
const SUBTABLE_FORMAT = 0;
const SUBTABLE_FORMAT_SEGMENTS = 4; // formato 4  — BMP, por segmentos
const SUBTABLE_FORMAT_GROUPS = 12; // formato 12 — full range, por grupos

/** Formato 4: segCountX2 e o início dos arrays paralelos. */
const FORMAT4_SEG_COUNT_X2 = 6;
const FORMAT4_END_CODES = 14;
const FORMAT4_RESERVED_PAD_SIZE = 2;
const U16_SIZE = 2;

/** Formato 12: contagem de grupos e o array de grupos. */
const FORMAT12_NUM_GROUPS = 12;
const FORMAT12_GROUPS_START = 16;
const FORMAT12_GROUP_SIZE = 12;
const FORMAT12_GROUP_END_CHAR = 4;
const FORMAT12_GROUP_START_GLYPH = 8;

/** Constantes de Unicode/glifo usadas na resolução. */
const GLYPH_NOTDEF = 0;
const U16_MASK = 0xffff;
const SEGMENT_TERMINATOR = 0xffff;
const BMP_LIMIT = 0x10000;
const MAX_CODEPOINT = 0x10ffff;

/** Caracteres de controle que nunca são desenhados (não acusar no lint). */
const NON_PRINTABLE = new Set(['\n', '\r', '\t', '\f', '\v']);

/**
 * @typedef {object} Coverage
 * @property {number} size            Quantos codepoints têm glifo.
 * @property {[number, number][]} ranges  Pares inclusivos, ordenados.
 * @property {(codepoint: number) => boolean} has
 */

/** Compacta codepoints ordenados em pares inclusivos `[inicio, fim]`. */
function toRanges(codepoints) {
  const sorted = [...codepoints].sort((a, b) => a - b);
  /** @type {[number, number][]} */
  const ranges = [];
  for (const cp of sorted) {
    const last = ranges[ranges.length - 1];
    if (last && cp === last[1] + 1) last[1] = cp;
    else ranges.push([cp, cp]);
  }
  return ranges;
}

/** `Coverage` a partir dos ranges já compactados (busca binária). */
export function coverageFromRanges(ranges) {
  let size = 0;
  for (const [start, end] of ranges) size += end - start + 1;
  return {
    size,
    ranges,
    has(codepoint) {
      let low = 0;
      let high = ranges.length - 1;
      while (low <= high) {
        const mid = (low + high) >> 1;
        const [start, end] = ranges[mid];
        if (codepoint < start) high = mid - 1;
        else if (codepoint > end) low = mid + 1;
        else return true;
      }
      return false;
    },
  };
}

/** Percorre a subtabela formato 4 (BMP) marcando os codepoints com glifo. */
function scanFormat4(view, subtableOffset, covered) {
  const segCountX2 = view.getUint16(subtableOffset + FORMAT4_SEG_COUNT_X2);
  const segCount = segCountX2 / U16_SIZE;
  const endCodesAt = subtableOffset + FORMAT4_END_CODES;
  const startCodesAt = endCodesAt + segCountX2 + FORMAT4_RESERVED_PAD_SIZE;
  const deltasAt = startCodesAt + segCountX2;
  const rangeOffsetsAt = deltasAt + segCountX2;

  for (let segment = 0; segment < segCount; segment++) {
    const at = segment * U16_SIZE;
    const startCode = view.getUint16(startCodesAt + at);
    const endCode = view.getUint16(endCodesAt + at);
    // Último segmento é o terminador 0xFFFF→0xFFFF, sem caractere real.
    if (startCode === SEGMENT_TERMINATOR) continue;
    const idDelta = view.getInt16(deltasAt + at);
    const idRangeOffset = view.getUint16(rangeOffsetsAt + at);

    for (let cp = startCode; cp <= endCode && cp < BMP_LIMIT; cp++) {
      let glyphId;
      if (idRangeOffset === 0) {
        glyphId = (cp + idDelta) & U16_MASK;
      } else {
        // O idRangeOffset é relativo à POSIÇÃO da própria entrada no array.
        const glyphIndexAt = rangeOffsetsAt + at + idRangeOffset + (cp - startCode) * U16_SIZE;
        if (glyphIndexAt + U16_SIZE > view.byteLength) continue;
        glyphId = view.getUint16(glyphIndexAt);
        if (glyphId !== GLYPH_NOTDEF) glyphId = (glyphId + idDelta) & U16_MASK;
      }
      if (glyphId !== GLYPH_NOTDEF) covered.add(cp);
    }
  }
}

/** Percorre a subtabela formato 12 (full range) marcando os codepoints. */
function scanFormat12(view, subtableOffset, covered) {
  const numGroups = view.getUint32(subtableOffset + FORMAT12_NUM_GROUPS);
  for (let group = 0; group < numGroups; group++) {
    const at = subtableOffset + FORMAT12_GROUPS_START + group * FORMAT12_GROUP_SIZE;
    if (at + FORMAT12_GROUP_SIZE > view.byteLength) break;
    const startChar = view.getUint32(at);
    const endChar = Math.min(view.getUint32(at + FORMAT12_GROUP_END_CHAR), MAX_CODEPOINT);
    const startGlyph = view.getUint32(at + FORMAT12_GROUP_START_GLYPH);
    for (let cp = startChar; cp <= endChar; cp++) {
      // Glifo é sequencial dentro do grupo — só o que resolve pra 0 fica fora.
      if (startGlyph + (cp - startChar) !== GLYPH_NOTDEF) covered.add(cp);
    }
  }
}

/**
 * Lê a `cmap` da fonte e devolve a cobertura de glifos.
 * @param {Uint8Array} bytes  Conteúdo do .ttf/.otf.
 * @returns {Coverage}
 */
export function readFontGlyphCoverage(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const numTables = view.getUint16(OFFSET_TABLE_NUM_TABLES);

  let cmapAt = -1;
  for (let table = 0; table < numTables; table++) {
    const recordAt = TABLE_RECORDS_START + table * TABLE_RECORD_SIZE;
    const tag = String.fromCharCode(
      ...bytes.subarray(recordAt, recordAt + TABLE_RECORD_TAG_LENGTH),
    );
    if (tag === 'cmap') cmapAt = view.getUint32(recordAt + TABLE_RECORD_OFFSET);
  }
  if (cmapAt < 0) throw new Error('fonte sem tabela cmap');

  /** @type {Set<number>} */
  const covered = new Set();
  const numSubtables = view.getUint16(cmapAt + CMAP_NUM_SUBTABLES);
  for (let sub = 0; sub < numSubtables; sub++) {
    const recordAt = cmapAt + CMAP_RECORDS_START + sub * CMAP_RECORD_SIZE;
    const subtableAt = cmapAt + view.getUint32(recordAt + CMAP_RECORD_SUBTABLE_OFFSET);
    if (subtableAt + U16_SIZE > view.byteLength) continue;
    const format = view.getUint16(subtableAt + SUBTABLE_FORMAT);
    // Outros formatos (0/2/6/13/14) são ignorados: as subtabelas 4/12 da mesma
    // fonte já cobrem o Unicode. Se uma fonte só tivesse formato legado, a
    // cobertura sairia vazia — o teste 1 da SPEC-0171 pega isso na hora.
    if (format === SUBTABLE_FORMAT_SEGMENTS) scanFormat4(view, subtableAt, covered);
    else if (format === SUBTABLE_FORMAT_GROUPS) scanFormat12(view, subtableAt, covered);
  }
  return coverageFromRanges(toRanges(covered));
}

/**
 * Glifos do texto que a fonte NÃO tem, agrupados e ordenados por codepoint.
 * @param {string} text
 * @param {Coverage} coverage
 * @returns {{ codepoint: number, char: string, count: number }[]}
 */
export function findUncoveredGlyphs(text, coverage) {
  /** @type {Map<number, number>} */
  const counts = new Map();
  for (const char of text) {
    if (NON_PRINTABLE.has(char)) continue;
    const codepoint = char.codePointAt(0);
    if (coverage.has(codepoint)) continue;
    counts.set(codepoint, (counts.get(codepoint) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => a - b)
    .map(([codepoint, count]) => ({ codepoint, char: String.fromCodePoint(codepoint), count }));
}

/** `U+2726 (✦)` — rótulo pra mensagem de erro do lint. */
export function formatCodepoint(codepoint) {
  const hex = codepoint.toString(16).toUpperCase().padStart(4, '0');
  return `U+${hex} (${String.fromCodePoint(codepoint)})`;
}

/**
 * Literais de string de um fonte TS/JS, SEM comentários — o lint precisa olhar
 * só o que vai pra tela. (Os `←`/`→`/`─` que usamos em comentário e diagrama
 * ASCII dariam falso positivo.)
 * @param {string} source
 * @returns {string[]}
 */
export function collectSourceStrings(source) {
  /** @type {string[]} */
  const strings = [];
  let current = null; // aspa que abriu a string atual
  let buffer = '';
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (current) {
      if (char === '\\') {
        buffer += char + (source[i + 1] ?? '');
        i++;
      } else if (char === current) {
        strings.push(buffer);
        buffer = '';
        current = null;
      } else {
        buffer += char;
      }
      continue;
    }
    if (char === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') i++;
      continue;
    }
    if (char === '/' && source[i + 1] === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i++;
      i++;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') current = char;
  }
  return strings;
}

/** Objeto do `ui-font-glyphs.json` (sem data: o diff só muda se a fonte mudar). */
export function buildCoverageFile(bytes, fontName) {
  const coverage = readFontGlyphCoverage(bytes);
  return {
    font: fontName,
    note:
      'Codepoints com glifo na fonte da UI de runtime (ADR-0170). Gerado de ' +
      'native/third_party/fonts/ por native/scripts/font-glyphs.mjs — não edite à mão. ' +
      'ranges = pares inclusivos [inicio, fim].',
    glyphCount: coverage.size,
    ranges: coverage.ranges,
  };
}

/** Gera o JSON de cobertura a partir do .ttf. Devolve o objeto gravado. */
export function emitCoverageFile(ttfPath, outPath) {
  const data = buildCoverageFile(fs.readFileSync(ttfPath), path.basename(ttfPath));
  writeJson(outPath, data);
  return data;
}

/**
 * Lê o contrato versionado, VALIDANDO o shape — um JSON truncado/vazio faria o
 * lint aprovar qualquer coisa, que é pior que não ter lint.
 * @returns {{ data: object, coverage: Coverage }}
 */
export function readCoverageFile(jsonPath) {
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const ranges = data?.ranges;
  const isPair = (r) => Array.isArray(r) && r.length === 2 && r[0] <= r[1];
  if (!Array.isArray(ranges) || ranges.length === 0 || !ranges.every(isPair)) {
    throw new Error(`${path.basename(jsonPath)}: ranges inválidos`);
  }
  const coverage = coverageFromRanges(ranges);
  if (coverage.size !== data.glyphCount) {
    throw new Error(
      `${path.basename(jsonPath)}: glyphCount ${data.glyphCount} ≠ soma dos ranges ${coverage.size}`,
    );
  }
  return { data, coverage };
}

/** Publica o contrato versionado no destino (dist), validando de passagem. */
export function publishCoverageFile(jsonPath, outPath) {
  const { data } = readCoverageFile(jsonPath);
  writeJson(outPath, data);
  return data;
}

function writeJson(outPath, data) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2) + '\n');
}

// CLI:
//   font-glyphs.mjs emit    <fonte.ttf>     <saida.json>  (regenera o contrato)
//   font-glyphs.mjs publish <contrato.json> <saida.json>  (leva pro dist-engine)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , command, inputPath, outPath] = process.argv;
  const usage =
    'uso: node native/scripts/font-glyphs.mjs emit <fonte.ttf> <saida.json>\n' +
    '     node native/scripts/font-glyphs.mjs publish <contrato.json> <saida.json>';
  if (!inputPath || !outPath || (command !== 'emit' && command !== 'publish')) {
    console.error(usage);
    process.exit(1);
  }
  // Aceita caminho relativo ao cwd ou à raiz do repo (o script roda dos dois).
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const input = fs.existsSync(inputPath) ? inputPath : path.resolve(repoRoot, inputPath);
  const data =
    command === 'emit' ? emitCoverageFile(input, outPath) : publishCoverageFile(input, outPath);
  console.log(`[ui] contrato de glifos: ${data.glyphCount} codepoints → ${outPath}`);
}
