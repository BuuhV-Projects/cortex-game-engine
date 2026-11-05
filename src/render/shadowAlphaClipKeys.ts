/**
 * Chaves do recorte alfa (SPEC-0690 §8): o que um nó carregava quando o recorte foi mandado, ou quando foi recusado
 * por um motivo que só depende do objeto. Enquanto a chave não muda (nem a época do provedor), o
 * `ShadowAlphaClipSync` não relê a fonte do nó: são só referências e escalares do próprio objeto, sem lookup.
 */
import type { Object3D } from 'three';

/**
 * O que o objeto carregava quando o recorte foi mandado: se nada disso mudou (nem a época do provedor), a fonte é a
 * mesma e o nó sai sem consultar o provedor. São só referências e escalares do próprio objeto (sem lookup).
 */
export interface Chave {
  material: unknown;
  mapa: unknown;
  versaoDoMapa: number;
  geometria: unknown;
  uv: unknown;
  alphaTestVisto: number;
  wrapSVisto: number;
  wrapTVisto: number;
  /** `offset`, `repeat`, `rotation` e `center` do mapa: o que o `updateMatrix` usa. */
  offsetX: number;
  offsetY: number;
  repeatX: number;
  repeatY: number;
  rotacao: number;
  centroX: number;
  centroY: number;
  matrizAutomatica: boolean;
  epoca: number;
}

/**
 * Motivos de recusa que só dependem do objeto (material, mapa, geometria): enquanto a {@link ChaveDaRecusa} não muda,
 * o nó recusado não relê a fonte. Os transitórios (`textura-sem-gpu`, `uv-sem-gpu`) tentam todo quadro.
 */
const RECUSAS_FIXAS: ReadonlySet<string> = new Set([
  'material-em-array', 'sem-alphaTest', 'alphaMap', 'colorNode', 'maskNode', 'sem-map', 'canal-de-uv',
  'uv-ausente', 'uv-nao-float32',
]);

/** O que decide uma recusa fixa: o nó só relê a fonte quando algo disto muda (ou a época sobe). */
export interface ChaveDaRecusa {
  recusaFixa: boolean;
  rMaterial: unknown;
  rMapa: unknown;
  rAlphaTest: number;
  rAlphaMap: unknown;
  rColorNode: unknown;
  rGeometria: unknown;
  rUv: unknown;
  rEpoca: number;
}

/** Época que nenhum provedor tem: força a primeira leitura. */
const EPOCA_NENHUMA = -1;

export function novaChave(): Chave {
  return {
    material: null, mapa: null, versaoDoMapa: 0, geometria: null, uv: null, alphaTestVisto: 0, wrapSVisto: 0, wrapTVisto: 0,
    offsetX: 0, offsetY: 0, repeatX: 0, repeatY: 0, rotacao: 0, centroX: 0, centroY: 0, matrizAutomatica: false,
    epoca: EPOCA_NENHUMA,
  };
}

export type MaterialDoRecorte = {
  alphaTest?: number;
  alphaMap?: unknown;
  colorNode?: unknown;
  castShadowNode?: unknown;
  maskNode?: unknown;
  maskShadowNode?: unknown;
  map?: {
    version?: number;
    offset?: { x: number; y: number };
    repeat?: { x: number; y: number };
    rotation?: number;
    center?: { x: number; y: number };
    channel?: number;
    wrapS: number;
    wrapT: number;
    matrixAutoUpdate?: boolean;
    updateMatrix?(): void;
    matrix: { elements: ArrayLike<number> };
  } | null;
};

export type ObjetoDoRecorte = Object3D & {
  material?: MaterialDoRecorte | MaterialDoRecorte[];
  geometry?: { attributes?: { uv?: unknown } };
};

/** A fonte do nó continua a mesma que foi mandada? (só campos do objeto; ver {@link Chave}). */
export function mesmaChave(objeto: ObjetoDoRecorte, c: Chave, epoca: number): boolean {
  const material = objeto.material;
  if (material !== c.material || c.epoca !== epoca || Array.isArray(material) || !material) return false;
  const mapa = material.map;
  const geometria = objeto.geometry;
  if (mapa !== c.mapa || !mapa || geometria !== c.geometria || geometria?.attributes?.uv !== c.uv) return false;
  if ((mapa.version ?? 0) !== c.versaoDoMapa || (material.alphaTest ?? 0) !== c.alphaTestVisto) return false;
  if (mapa.wrapS !== c.wrapSVisto || mapa.wrapT !== c.wrapTVisto) return false;
  if ((mapa.matrixAutoUpdate ?? false) !== c.matrizAutomatica) return false;
  // Matriz manual: quem a muda é o jogo, e ela entra inteira no `mesmaFonte`; não há como saber sem ler.
  if (!c.matrizAutomatica) return false;
  return (
    mapa.offset?.x === c.offsetX && mapa.offset.y === c.offsetY && mapa.repeat?.x === c.repeatX &&
    mapa.repeat.y === c.repeatY && mapa.rotation === c.rotacao && mapa.center?.x === c.centroX &&
    mapa.center.y === c.centroY
  );
}

export function novaChaveDaRecusa(): ChaveDaRecusa {
  return {
    recusaFixa: false, rMaterial: null, rMapa: null, rAlphaTest: 0, rAlphaMap: null, rColorNode: null, rGeometria: null,
    rUv: null, rEpoca: EPOCA_NENHUMA,
  };
}

/** O material de um nó como a recusa o lê (sem exigir que seja um só). */
type MaterialDaRecusa = { map?: unknown; alphaTest?: number; alphaMap?: unknown; colorNode?: unknown };

export function mesmaRecusa(objeto: ObjetoDoRecorte, c: ChaveDaRecusa, epoca: number): boolean {
  const material = objeto.material as MaterialDaRecusa | MaterialDaRecusa[] | undefined;
  const geometria = objeto.geometry;
  if (!c.recusaFixa || c.rEpoca !== epoca || material !== c.rMaterial || geometria !== c.rGeometria) return false;
  if (geometria?.attributes?.uv !== c.rUv) return false;
  // Array: a identidade do array basta (trocar um item dele é trocar o material, que o motivo não usa).
  if (Array.isArray(material) || !material) return true;
  return (
    material.map === c.rMapa && (material.alphaTest ?? 0) === c.rAlphaTest && material.alphaMap === c.rAlphaMap &&
    material.colorNode === c.rColorNode
  );
}

export function guardarRecusa(objeto: ObjetoDoRecorte, c: ChaveDaRecusa, motivo: string, epoca: number): void {
  c.recusaFixa = RECUSAS_FIXAS.has(motivo);
  const material = objeto.material as MaterialDaRecusa | MaterialDaRecusa[] | undefined;
  const unico = Array.isArray(material) ? undefined : material;
  c.rMaterial = material;
  c.rMapa = unico?.map;
  c.rAlphaTest = unico?.alphaTest ?? 0;
  c.rAlphaMap = unico?.alphaMap;
  c.rColorNode = unico?.colorNode;
  c.rGeometria = objeto.geometry;
  c.rUv = objeto.geometry?.attributes?.uv;
  c.rEpoca = epoca;
}

export function guardarChave(objeto: ObjetoDoRecorte, c: Chave, epoca: number): void {
  const material = objeto.material as MaterialDoRecorte;
  const mapa = material.map!;
  c.material = material;
  c.mapa = mapa;
  c.versaoDoMapa = mapa.version ?? 0;
  c.geometria = objeto.geometry;
  c.uv = objeto.geometry?.attributes?.uv;
  c.alphaTestVisto = material.alphaTest ?? 0;
  c.wrapSVisto = mapa.wrapS;
  c.wrapTVisto = mapa.wrapT;
  c.matrizAutomatica = mapa.matrixAutoUpdate ?? false;
  c.offsetX = mapa.offset?.x ?? 0;
  c.offsetY = mapa.offset?.y ?? 0;
  c.repeatX = mapa.repeat?.x ?? 0;
  c.repeatY = mapa.repeat?.y ?? 0;
  c.rotacao = mapa.rotation ?? 0;
  c.centroX = mapa.center?.x ?? 0;
  c.centroY = mapa.center?.y ?? 0;
  c.epoca = epoca;
}
