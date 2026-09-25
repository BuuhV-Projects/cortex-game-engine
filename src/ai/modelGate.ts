/**
 * Portão de aprovação do modelo 3D gerado (SPEC-0267 / ADR-0265).
 *
 * A SPEC-0231 mede e refina todo modelo, mas não reprovava nada: um carro com
 * um material por peça — o caso medido no kart-racer — chegava ao jogo igual.
 * Aqui a medida vira decisão. Julga DEPOIS do refino: o atlas de paleta já
 * reduziu o que dava, e o que sobra é o que o modelo realmente custa.
 */
import type { ValidateResult } from './validateGeneratedModel.js';

/** Maior lado abaixo do qual o modelo é "peça pequena" (roda, item), em metros. */
export const SMALL_OBJECT_MAX_SIDE_M = 2;
/** Teto de materiais de peça pequena — custo por draw call (SPEC-0224). */
export const MAX_MATERIALS_SMALL = 4;
/** Teto de materiais de objeto grande (carro, prédio). */
export const MAX_MATERIALS_LARGE = 8;
/** Menor maior-lado aceito: abaixo disso a escala veio em unidade errada. */
export const MIN_SIDE_M = 0.02;
/** Maior maior-lado aceito: acima disso a escala veio em cm/mm. */
export const MAX_SIDE_M = 500;
/**
 * Altura máxima, como fração do maior lado horizontal, para o modelo contar
 * como plano fino (oceano, chão, terreno) — que fica fora do {@link MAX_SIDE_M}.
 */
export const FLAT_MAX_HEIGHT_RATIO = 0.1;
/** Tentativas de geração no total, contando a primeira. */
export const MAX_MODEL_ATTEMPTS = 3;

export interface ModelVerdict {
  /** `true` também quando não foi julgado — falta de ferramenta não é defeito do modelo. */
  approved: boolean;
  /** Um motivo por critério reprovado, em linguagem que o Astra usa para corrigir. */
  reasons: string[];
  /** `false` sem inspeção (Blender ausente, refino ausente): repetir não resolveria. */
  judged: boolean;
}

/**
 * Julga um modelo pela validação da SPEC-0231.
 *
 * @example
 * const verdict = judgeModel(await validateGeneratedModel(glb, opts));
 * if (!verdict.approved) askForFix(verdict.reasons);
 */
export function judgeModel(validation: ValidateResult | null): ModelVerdict {
  const inspection = validation?.inspecao;
  if (!validation || !inspection) return { approved: true, reasons: [], judged: false };

  const reasons: string[] = [];
  const { largura, altura, profundidade } = inspection.size;
  const longestSide = Math.max(largura, altura, profundidade);
  // Materiais depois do refino, quando ele rodou; senão, os que o Blender vê.
  const materials = validation.refino?.depois.materials ?? inspection.materiais.length;
  const small = longestSide < SMALL_OBJECT_MAX_SIDE_M;
  const materialCap = small ? MAX_MATERIALS_SMALL : MAX_MATERIALS_LARGE;

  if (inspection.triangulos < 1) {
    reasons.push('o modelo não tem geometria (0 triângulos)');
  }
  // Oceano, chão e terreno têm quilômetros de verdade: plano fino não tem teto.
  const flat = altura <= Math.max(largura, profundidade) * FLAT_MAX_HEIGHT_RATIO;
  if (longestSide < MIN_SIDE_M || (longestSide > MAX_SIDE_M && !flat)) {
    reasons.push(
      `escala fora do real: o maior lado mede ${longestSide} m. Modele em METROS com a medida ` +
        `real do objeto (entre ${MIN_SIDE_M} m e ${MAX_SIDE_M} m) — provável unidade errada.`,
    );
  }
  if (materials > materialCap) {
    reasons.push(
      `${materials} materiais depois do refino; o máximo para ${small ? 'peça pequena' : 'objeto grande'} ` +
        `é ${materialCap}. Cada material é uma draw call: faça peças com o mesmo acabamento ` +
        `compartilharem UM material (todo metal num só, toda borracha num só).`,
    );
  }
  return { approved: reasons.length === 0, reasons, judged: true };
}
