/**
 * Contrato de glifos da UI de runtime (ADR-0170 / SPEC-0171).
 *
 * O rasterizador nativo tem UMA fonte e nenhum fallback: codepoint fora da `cmap`
 * da Roboto-Medium vira `.notdef` (a caixinha que engoliu o ícone do guarda-roupa
 * do teste4). O DOM do Studio esconde isso caindo numa fonte do sistema, então só
 * um lint contra a fonte real dá garantia.
 *
 * Cobre: (1) o contrato versionado e o que ele promete; (2) round-trip dos ranges;
 * (3) contrato em sincronia com a fonte (pulado sem as deps nativas baixadas);
 * (4) os textos de UI da PRÓPRIA engine dentro do contrato; (5) o colhedor de
 * strings ignorando comentários — sem isso os `←`/`→`/`─` dos nossos diagramas
 * ASCII dariam falso positivo.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error — módulo .mjs sem tipos (script do toolchain de export)
import * as fontGlyphs from '../../native/scripts/font-glyphs.mjs';

const {
  readFontGlyphCoverage,
  coverageFromRanges,
  findUncoveredGlyphs,
  formatCodepoint,
  collectSourceStrings,
  readCoverageFile,
  emitCoverageFile,
} = fontGlyphs;

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const contractPath = path.join(repoRoot, 'src', 'ui', 'runtime', 'ui-font-glyphs.json');
const fontPath = path.join(repoRoot, 'native', 'third_party', 'fonts', 'Roboto-Medium.ttf');

/** Textos que vão pra tela na UI de runtime da engine. */
const UI_SOURCE_DIRS = [path.join('src', 'ui')];
const UI_SOURCE_FILES = [
  path.join('src', 'input', 'ControlsScreen.ts'),
  path.join('src', 'input', 'padLayout.ts'),
  path.join('src', 'core', 'LoadingScreen.ts'),
];

function listTypeScriptFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listTypeScriptFiles(full));
    else if (full.endsWith('.ts')) out.push(full);
  }
  return out;
}

describe('contrato de glifos da UI (ui-font-glyphs.json)', () => {
  const { data, coverage } = readCoverageFile(contractPath);

  it('promete os glifos que a UI usa e nega os que somem no export', () => {
    for (const char of ['A', 'ç', 'õ', 'ã', '›', '‹', '»', '×', '·', '•', '◊', '↑', '↓']) {
      expect(coverage.has(char.codePointAt(0)!), `${char} deveria estar no contrato`).toBe(true);
    }
    // Os que causaram (ou causariam) tofu no export nativo — ver ADR-0170.
    for (const char of ['✦', '←', '→', '★', '✓', '⚙', '●', '■']) {
      expect(coverage.has(char.codePointAt(0)!), `${char} NÃO deveria estar no contrato`).toBe(
        false,
      );
    }
  });

  it('tem glyphCount igual à soma dos ranges e sobrevive ao round-trip', () => {
    const roundTrip = coverageFromRanges(data.ranges);
    expect(roundTrip.size).toBe(data.glyphCount);
    expect(roundTrip.has('A'.codePointAt(0)!)).toBe(true);
    expect(roundTrip.has(0x2726)).toBe(false);
  });

  it('rejeita contrato com shape inválido (lint que se desliga não é lint)', () => {
    const broken = path.join(repoRoot, 'node_modules', '.tmp-ui-font-glyphs.json');
    fs.mkdirSync(path.dirname(broken), { recursive: true });
    fs.writeFileSync(broken, JSON.stringify({ glyphCount: 10, ranges: [] }));
    expect(() => readCoverageFile(broken)).toThrow(/ranges inválidos/);
    fs.writeFileSync(broken, JSON.stringify({ glyphCount: 999, ranges: [[65, 66]] }));
    expect(() => readCoverageFile(broken)).toThrow(/glyphCount/);
    fs.rmSync(broken);
  });

  // Sem `fetch-deps` rodado a fonte não está em disco (native/third_party é
  // gitignored) — aí este caso é pulado e os outros continuam valendo.
  it.skipIf(!fs.existsSync(fontPath))(
    'está em sincronia com a Roboto-Medium.ttf do export',
    () => {
      const fromFont = readFontGlyphCoverage(fs.readFileSync(fontPath));
      expect(fromFont.size).toBe(data.glyphCount);
      expect(fromFont.ranges).toEqual(data.ranges);
    },
  );

  it('regenera o contrato com o mesmo conteúdo (emitCoverageFile)', () => {
    if (!fs.existsSync(fontPath)) return;
    const out = path.join(repoRoot, 'node_modules', '.tmp-emit-glyphs.json');
    const emitted = emitCoverageFile(fontPath, out);
    expect(emitted.font).toBe('Roboto-Medium.ttf');
    expect(JSON.parse(fs.readFileSync(out, 'utf8')).ranges).toEqual(data.ranges);
    fs.rmSync(out);
  });
});

describe('lint de glifos nos textos de UI da engine', () => {
  const { coverage } = readCoverageFile(contractPath);

  const files = [
    ...UI_SOURCE_DIRS.flatMap((dir) => listTypeScriptFiles(path.join(repoRoot, dir))),
    ...UI_SOURCE_FILES.map((file) => path.join(repoRoot, file)),
  ];

  it('acha os arquivos de UI da engine', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it.each(files.map((file) => [path.relative(repoRoot, file), file]))(
    '%s só usa glifos que a fonte do export tem',
    (_label, file) => {
      // Junta com \n (ignorado pelo lint) pra não inventar caractere entre strings.
      const text = collectSourceStrings(fs.readFileSync(file, 'utf8')).join('\n');
      const uncovered = findUncoveredGlyphs(text, coverage);
      expect(
        uncovered,
        uncovered.length
          ? `glifo fora da fonte da UI: ${uncovered
              .map((g: { codepoint: number }) => formatCodepoint(g.codepoint))
              .join(', ')} — ver ADR-0170`
          : '',
      ).toEqual([]);
    },
  );
});

describe('collectSourceStrings', () => {
  it('colhe literais e ignora comentários de linha e de bloco', () => {
    const source = [
      '// ✦ isto é comentário e não vai pra tela',
      '/* ← → também não */',
      "const rotulo = 'Guarda-roupa ›'",
      'const template = `traje ${nome} ◊`',
    ].join('\n');
    const strings = collectSourceStrings(source);
    expect(strings.join('|')).toContain('Guarda-roupa ›');
    expect(strings.join('|')).toContain('◊');
    expect(strings.join('|')).not.toContain('✦');
    expect(strings.join('|')).not.toContain('←');
  });

  it('não encerra a string na aspa de outro tipo', () => {
    expect(collectSourceStrings(`const a = "diz 'oi'"`)).toEqual([`diz 'oi'`]);
  });
});

describe('findUncoveredGlyphs', () => {
  const coverage = coverageFromRanges([
    [32, 126],
    [0x2039, 0x203a],
  ]);

  it('agrupa por codepoint, conta e ignora controles', () => {
    expect(findUncoveredGlyphs('a ✦ b ✦\n\t← ›', coverage)).toEqual([
      { codepoint: 0x2190, char: '←', count: 1 },
      { codepoint: 0x2726, char: '✦', count: 2 },
    ]);
  });

  it('não acusa nada quando tudo está coberto', () => {
    expect(findUncoveredGlyphs('Novo Jogo ›', coverage)).toEqual([]);
  });

  it('formata o codepoint pra mensagem de erro', () => {
    expect(formatCodepoint(0x2726)).toBe('U+2726 (✦)');
  });
});
