/**
 * Validação e refino do modelo 3D recém-gerado (SPEC-0231).
 *
 * O gerador do Chat IA (ADR-0189) entrega um `.glb` e, até aqui, a única
 * checagem era "o arquivo existe e não está vazio". O resultado disso está
 * medido: os carros do `kart-racer` vieram com um material por peça, o que
 * impede o merge da engine e transforma cada peça numa draw — 40% dos nós da
 * cena inteira (ADR-0228/SPEC-0224).
 *
 * Aqui o modelo passa por duas coisas antes de ser anunciado ao usuário:
 * **refino** (atlas de paleta, ADR-0230) e **inspeção no Blender** (medidas
 * reais + uma imagem para olhar).
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** Marcadores que o `inspect-model.py` imprime — contrato com o script. */
const INSPECT_JSON_PREFIX = 'INSPECT_JSON ';
/** Tempo máximo de cada etapa. Blender frio em máquina ocupada leva alguns segundos. */
const STEP_TIMEOUT_MS = 120_000;
/** Lado da imagem de inspeção, em pixels. */
const PREVIEW_SIZE = 512;

/** O que o refinador devolve por arquivo (ver `native/scripts/refine-asset.mjs`). */
export interface RefineReport {
  antes: AssetStats;
  depois: AssetStats;
  avisos: string[];
  protegidos: string[];
}

export interface AssetStats {
  nodes: number;
  meshes: number;
  primitives: number;
  materials: number;
  textures: number;
  triangles: number;
}

/** Medidas que o Blender lê do modelo — é o que prova escala e geometria. */
export interface InspectReport {
  size: { largura: number; altura: number; profundidade: number };
  triangulos: number;
  materiais: string[];
  malhas: number;
}

export interface ValidateResult {
  refino: RefineReport | null;
  inspecao: InspectReport | null;
  /** PNG renderizado do modelo, quando o Blender rodou. */
  previewPath: string | null;
  /** O que impediu cada etapa, quando impediu. Nunca lança: validar é opcional. */
  problemas: string[];
}

function run(bin: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill(), STEP_TIMEOUT_MS);
    child.stdout.on('data', (d) => (stdout += String(d)));
    child.stderr.on('data', (d) => (stderr += String(d)));
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr });
    });
    child.on('error', (erro) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: String(erro) });
    });
  });
}

/**
 * Roda o refinador no `.glb`, **no lugar**. O modelo acabou de ser gerado por
 * máquina e ainda não é de ninguém — diferente de asset do usuário, onde
 * sobrescrever exige pedido explícito.
 */
async function refine(glbPath: string, scriptsDir: string): Promise<RefineReport | null> {
  const script = join(scriptsDir, 'refine-asset.mjs');
  if (!existsSync(script)) return null;
  const { code, stdout } = await run(process.execPath, [script, glbPath, '--in-place', '--json']);
  if (code !== 0) return null;
  try {
    const relatorios = JSON.parse(stdout) as RefineReport[];
    return relatorios[0] ?? null;
  } catch {
    return null;
  }
}

/** Mede e renderiza o modelo no Blender. */
async function inspect(
  glbPath: string,
  scriptsDir: string,
  blenderBin: string,
): Promise<{ inspecao: InspectReport | null; previewPath: string | null }> {
  const script = join(scriptsDir, 'inspect-model.py');
  if (!existsSync(script)) return { inspecao: null, previewPath: null };
  const previewPath = glbPath.replace(/\.glb$/i, '.preview.png');
  const { stdout } = await run(blenderBin, [
    '-b',
    '-P',
    script,
    '--',
    glbPath,
    previewPath,
    String(PREVIEW_SIZE),
  ]);
  const linha = stdout.split('\n').find((l) => l.startsWith(INSPECT_JSON_PREFIX));
  if (!linha) return { inspecao: null, previewPath: existsSync(previewPath) ? previewPath : null };
  try {
    return {
      inspecao: JSON.parse(linha.slice(INSPECT_JSON_PREFIX.length)) as InspectReport,
      previewPath: existsSync(previewPath) ? previewPath : null,
    };
  } catch {
    return { inspecao: null, previewPath: null };
  }
}

/**
 * Refina e inspeciona um modelo gerado. **Não lança**: um modelo válido não
 * deixa de ser entregue porque a validação falhou — o que não deu certo volta
 * em `problemas`, para o Chat IA dizer ao usuário.
 */
export async function validateGeneratedModel(
  glbPath: string,
  options: { scriptsDir: string; blenderBin: string },
): Promise<ValidateResult> {
  const problemas: string[] = [];

  const refino = await refine(glbPath, options.scriptsDir);
  if (!refino) problemas.push('refino não rodou (script ausente ou falhou) — o modelo segue como o Blender o gerou');

  const { inspecao, previewPath } = await inspect(glbPath, options.scriptsDir, options.blenderBin);
  if (!inspecao) problemas.push('inspeção no Blender não rodou — sem medidas nem imagem de conferência');

  return { refino, inspecao, previewPath, problemas };
}

/** Resumo em uma linha por assunto, para o Chat IA mostrar ao usuário. */
export function describeValidation(resultado: ValidateResult): string[] {
  const linhas: string[] = [];
  const r = resultado.refino;
  if (r) {
    if (r.depois.materials < r.antes.materials || r.depois.primitives < r.antes.primitives) {
      linhas.push(
        `refino: materiais ${r.antes.materials} → ${r.depois.materials}, ` +
          `primitivas ${r.antes.primitives} → ${r.depois.primitives} ` +
          `(mesma aparência, atlas de paleta)`,
      );
    } else {
      linhas.push('refino: nada a fundir — o modelo já estava enxuto');
    }
    for (const aviso of r.avisos) linhas.push(`aviso: ${aviso}`);
  }
  const i = resultado.inspecao;
  if (i) {
    linhas.push(
      `medidas: ${i.size.largura} × ${i.size.altura} × ${i.size.profundidade} m, ` +
        `${i.triangulos} triângulos, ${i.malhas} malha(s)`,
    );
  }
  for (const problema of resultado.problemas) linhas.push(`problema: ${problema}`);
  return linhas;
}
