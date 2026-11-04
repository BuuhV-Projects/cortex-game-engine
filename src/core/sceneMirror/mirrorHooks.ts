/**
 * Ganchos de transform do espelho de cena (SPEC-0322, SPEC-0332, SPEC-0340,
 * SPEC-0678). Saíram do `MirrorSink.ts` na divisão da SPEC-0678.
 */
import type { Object3D, Quaternion, Vector3 } from 'three';

/** O que os ganchos chamam no espelho dono do slot. */
export interface MirrorSink {
  _marcarSujo(slot: number): void;
  _ancestralMudou(raiz: Object3D, delta: number): void;
  /** O nó voltou a ficar visível: confere a geometria, que a varredura pula enquanto ele está oculto. */
  _reapareceu(slot: number): void;
}

// ── Ganchos de transform (SPEC-0322) ───────────────────────────────────────
//
// O espelho só manda linha do nó SUJO. Quem suja é a escrita no transform, e
// o `three` não avisa de `position`/`scale` (são `Vector3` de dado cru). Os
// ganchos põem acessores nos MESMOS vetores — quem guardou a referência segue
// mexendo no objeto certo — e embrulham o `_onChangeCallback` que o `three` já
// tem no `quaternion` e na `rotation`.

/** O que o gancho guarda no próprio `Vector3` de um nó espelhado. */
export interface VetorEnganchado {
  _mx: number;
  _my: number;
  _mz: number;
  _mEspelho: MirrorSink | undefined;
  _mSlot: number;
}

/** `Quaternion`/`Euler`: os dois têm o callback interno do `three`. */
export interface ComCallback {
  _onChangeCallback: () => void;
  _onChange(callback: () => void): unknown;
  /** O callback original do `three`, guardado para desfazer o gancho. */
  _mOriginal?: () => void;
}

export function avisarSujo(v: VetorEnganchado): void {
  const espelho = v._mEspelho;
  if (espelho) espelho._marcarSujo(v._mSlot);
}

/**
 * Acessores COMPARTILHADOS: nenhuma closure por nó para os 10 mil parados.
 * Escrever o MESMO valor não suja: o jogo reescreve transform parado todo
 * quadro (`copy` de um alvo que não andou), e isso virava linha à toa.
 */
export const ACESSOR_X: PropertyDescriptor = {
  configurable: true,
  enumerable: true,
  get(this: VetorEnganchado): number {
    return this._mx;
  },
  set(this: VetorEnganchado, valor: number): void {
    if (this._mx === valor) return;
    this._mx = valor;
    avisarSujo(this);
  },
};
export const ACESSOR_Y: PropertyDescriptor = {
  configurable: true,
  enumerable: true,
  get(this: VetorEnganchado): number {
    return this._my;
  },
  set(this: VetorEnganchado, valor: number): void {
    if (this._my === valor) return;
    this._my = valor;
    avisarSujo(this);
  },
};
export const ACESSOR_Z: PropertyDescriptor = {
  configurable: true,
  enumerable: true,
  get(this: VetorEnganchado): number {
    return this._mz;
  },
  set(this: VetorEnganchado, valor: number): void {
    if (this._mz === valor) return;
    this._mz = valor;
    avisarSujo(this);
  },
};

/** O que o gancho de `visible` guarda no próprio objeto (SPEC-0332). */
export interface ObjetoEnganchado {
  _mVis: boolean;
  position: Vector3;
  children: Object3D[];
}

/**
 * `visible` também suja o slot NO INSTANTE da escrita (SPEC-0332). Pela
 * varredura em rodízio da SPEC-0322 o atraso chegava a 8 quadros — tolerável
 * na sombra, visível no passe principal (objeto que some/aparece atrasado). O
 * espelho e o slot são os do gancho do `position`, sem campo novo por nó.
 */
export const ACESSOR_VISIBLE: PropertyDescriptor = {
  configurable: true,
  enumerable: true,
  get(this: ObjetoEnganchado): boolean {
    return this._mVis;
  },
  set(this: ObjetoEnganchado, valor: boolean): void {
    if (this._mVis === valor) return;
    this._mVis = valor;
    const posicao = this.position as unknown as VetorEnganchado;
    avisarSujo(posicao);
    // A varredura pula o nó oculto (SPEC-0678): uma troca de geometria feita
    // enquanto ele estava escondido chega ao host aqui, não 8 quadros depois.
    if (valor) posicao._mEspelho?._reapareceu(posicao._mSlot);
    // Hidden-ancestor counters of the subtree (SPEC-0372): paid on the toggle, not per frame.
    if (this.children.length > 0) posicao._mEspelho?._ancestralMudou(this as unknown as Object3D, valor ? -1 : 1);
  },
};

export function engancharVisible(objeto: Object3D): void {
  const g = objeto as unknown as ObjetoEnganchado;
  // Lê ANTES de redefinir: depois disso `visible` é o acessor.
  const atual = objeto.visible;
  g._mVis = atual;
  Object.defineProperty(objeto, 'visible', ACESSOR_VISIBLE);
}

export function desengancharVisible(objeto: Object3D): void {
  if (Object.getOwnPropertyDescriptor(objeto, 'visible')?.get === undefined) return;
  const atual = (objeto as unknown as ObjetoEnganchado)._mVis;
  delete (objeto as unknown as Record<string, unknown>)['visible'];
  objeto.visible = atual;
}

export function engancharVetor(vetor: Vector3, espelho: MirrorSink, slot: number): void {
  const g = vetor as unknown as VetorEnganchado;
  // Lê ANTES de redefinir: depois disso `x` é o acessor.
  const x = vetor.x;
  const y = vetor.y;
  const z = vetor.z;
  g._mx = x;
  g._my = y;
  g._mz = z;
  g._mEspelho = espelho;
  g._mSlot = slot;
  Object.defineProperty(vetor, 'x', ACESSOR_X);
  Object.defineProperty(vetor, 'y', ACESSOR_Y);
  Object.defineProperty(vetor, 'z', ACESSOR_Z);
}

export function desengancharVetor(vetor: Vector3): void {
  const g = vetor as unknown as VetorEnganchado;
  if (g._mEspelho === undefined) return;
  const x = g._mx;
  const y = g._my;
  const z = g._mz;
  const comoRegistro = vetor as unknown as Record<string, unknown>;
  delete comoRegistro['x'];
  delete comoRegistro['y'];
  delete comoRegistro['z'];
  vetor.x = x;
  vetor.y = y;
  vetor.z = z;
  g._mEspelho = undefined;
}

/**
 * Embrulha o callback do `three`. A closure nasce AQUI, numa função própria, e
 * não no corpo de um `for (let …)`: no Hermes a closure criada no laço vê o
 * valor final da variável (ver a memória "let em closure").
 */
export function engancharCallback(alvo: ComCallback, q: Quaternion, espelho: MirrorSink, slot: number): void {
  const original = alvo._mOriginal ?? alvo._onChangeCallback;
  alvo._mOriginal = original;
  const visto = q as unknown as QuaternionVisto;
  alvo._onChange(() => {
    // O original roda antes: na `rotation` ele refaz o `quaternion` (setFromEuler).
    original();
    if (visto._x === visto._mqx && visto._y === visto._mqy && visto._z === visto._mqz && visto._w === visto._mqw) return;
    lembrarQuaternion(visto);
    espelho._marcarSujo(slot);
  });
}

/**
 * O `three` chama o `_onChangeCallback` sem comparar valor (`Euler.order = …`,
 * `Euler.y = …`, `Quaternion.set/copy`, `fromArray` da animação). O gancho
 * compara o quaternion com o último que sujou o slot (SPEC-0678): escrever a
 * mesma rotação não suja, como já era com `position`/`scale`/`visible`.
 */
interface QuaternionVisto {
  _x: number;
  _y: number;
  _z: number;
  _w: number;
  _mqx: number;
  _mqy: number;
  _mqz: number;
  _mqw: number;
}

function lembrarQuaternion(q: QuaternionVisto): void {
  q._mqx = q._x;
  q._mqy = q._y;
  q._mqz = q._z;
  q._mqw = q._w;
}

export function desengancharCallback(alvo: ComCallback): void {
  const original = alvo._mOriginal;
  if (!original) return;
  alvo._onChange(original);
  alvo._mOriginal = undefined;
}

/**
 * `updateWorldMatrix` de nó espelhado (SPEC-0340): o do `three` só escreve com
 * `matrixWorldAutoUpdate === true`, que o espelho desliga — no meio do quadro
 * quem pedia a pose de mundo (luzes do carro, `getWorldPosition`) lia a do
 * render ANTERIOR. Aqui é o mesmo cálculo do `three`, escrito direto na fatia
 * nativa; o C++ recalcula o mesmo valor no render.
 */
export function atualizarMundoSobPedido(this: Object3D, updateParents: boolean, updateChildren: boolean): void {
  const pai = this.parent;
  if (updateParents === true && pai !== null) pai.updateWorldMatrix(true, false);
  if (this.matrixAutoUpdate) this.updateMatrix();
  if (pai === null) this.matrixWorld.copy(this.matrix);
  else this.matrixWorld.multiplyMatrices(pai.matrixWorld, this.matrix);
  // O mundo foi escrito pelo JS: o nó manda linha no próximo sync, e o host confere o mundo dele
  // (`mundoEmDia`, SPEC-0678). Sem isso, um filho escrito sob pose transitória do pai ficava velho
  // quando o pai voltava e mandava linha igual, porque linha igual não propaga.
  avisarSujo(this.position as unknown as VetorEnganchado);
  if (updateChildren === true) {
    for (const filho of this.children) filho.updateWorldMatrix(false, true);
  }
}

export function engancharNo(objeto: Object3D, espelho: MirrorSink, slot: number): void {
  engancharVetor(objeto.position, espelho, slot);
  engancharVetor(objeto.scale, espelho, slot);
  lembrarQuaternion(objeto.quaternion as unknown as QuaternionVisto);
  engancharCallback(objeto.quaternion as unknown as ComCallback, objeto.quaternion, espelho, slot);
  engancharCallback(objeto.rotation as unknown as ComCallback, objeto.quaternion, espelho, slot);
  engancharVisible(objeto);
  objeto.updateWorldMatrix = atualizarMundoSobPedido;
}

export function desengancharNo(objeto: Object3D): void {
  desengancharVisible(objeto);
  desengancharVetor(objeto.position);
  desengancharVetor(objeto.scale);
  desengancharCallback(objeto.quaternion as unknown as ComCallback);
  desengancharCallback(objeto.rotation as unknown as ComCallback);
  // volta o do protótipo (o nó sai do espelho com matrixWorldAutoUpdate = true)
  if (objeto.updateWorldMatrix === atualizarMundoSobPedido) {
    delete (objeto as unknown as Record<string, unknown>)['updateWorldMatrix'];
  }
}
