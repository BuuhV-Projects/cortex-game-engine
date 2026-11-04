/**
 * Ganchos de camadas do espelho de cena (SPEC-0686): o host filtra os
 * candidatos do passe principal pela `layers.mask` de cada nó, e o JS deixa de
 * chamar `layers.test` por candidato.
 *
 * `Layers.mask` é um campo cru (`set`, `enable`, `toggle`… escrevem
 * `this.mask`), sem aviso do `three`. Como nos vetores da SPEC-0322, o gancho põe
 * um acessor na PRÓPRIA instância: quem guardou a referência segue mexendo no
 * objeto certo, e a escrita que muda o valor chega ao host no instante (sem a
 * latência da varredura). O `layers` do objeto também ganha acessor, para o caso
 * de o `Layers` inteiro ser trocado.
 */
import type { Layers, Object3D } from 'three';

/** O que o gancho chama no espelho dono do slot. */
export interface LayersSink {
  _camadasMudaram(slot: number, mask: number): void;
}

/** O que o gancho guarda no `Layers` enganchado. */
interface CamadasEnganchadas {
  _mMask: number;
  /** Os nós espelhados que usam este `Layers` (quase sempre um). */
  _mDonos: ObjetoComCamadas[];
}

/** O que o gancho guarda no objeto espelhado. */
interface ObjetoComCamadas {
  _mCamadas: Layers;
  _mCamadasSlot: number;
  _mCamadasEspelho: LayersSink;
}

function avisar(dono: ObjetoComCamadas, mask: number): void {
  dono._mCamadasEspelho._camadasMudaram(dono._mCamadasSlot, mask);
}

/** Acessor COMPARTILHADO da `mask` (sem closure por nó); valor igual não avisa. */
const ACESSOR_MASK: PropertyDescriptor = {
  configurable: true,
  enumerable: true,
  get(this: CamadasEnganchadas): number {
    return this._mMask;
  },
  set(this: CamadasEnganchadas, valor: number): void {
    if (this._mMask === valor) return;
    this._mMask = valor;
    const donos = this._mDonos;
    for (let i = 0; i < donos.length; i++) avisar(donos[i]!, valor);
  },
};

/** Acessor do `layers` do objeto: trocar o `Layers` inteiro reengancha e avisa. */
const ACESSOR_LAYERS: PropertyDescriptor = {
  configurable: true,
  enumerable: true,
  get(this: ObjetoComCamadas): Layers {
    return this._mCamadas;
  },
  set(this: ObjetoComCamadas, valor: Layers): void {
    if (this._mCamadas === valor) return;
    soltar(this._mCamadas, this);
    this._mCamadas = valor;
    prender(valor, this);
    avisar(this, valor.mask);
  },
};

function prender(camadas: Layers, dono: ObjetoComCamadas): void {
  const g = camadas as unknown as CamadasEnganchadas;
  if (g._mDonos === undefined || g._mDonos.length === 0) {
    // Lê ANTES de redefinir: depois disso `mask` é o acessor.
    const mask = camadas.mask;
    g._mMask = mask;
    g._mDonos = [];
    Object.defineProperty(camadas, 'mask', ACESSOR_MASK);
  }
  g._mDonos.push(dono);
}

function soltar(camadas: Layers, dono: ObjetoComCamadas): void {
  const g = camadas as unknown as CamadasEnganchadas;
  const donos = g._mDonos;
  if (donos === undefined) return;
  const i = donos.indexOf(dono);
  if (i >= 0) donos.splice(i, 1);
  if (donos.length > 0) return;
  const mask = g._mMask;
  delete (camadas as unknown as Record<string, unknown>)['mask'];
  camadas.mask = mask;
}

/** Engancha as camadas do nó no slot; devolve a máscara atual. */
export function engancharCamadas(objeto: Object3D, espelho: LayersSink, slot: number): number {
  const g = objeto as unknown as ObjetoComCamadas;
  if (Object.getOwnPropertyDescriptor(objeto, 'layers')?.get !== undefined) desengancharCamadas(objeto);
  const camadas = objeto.layers;
  g._mCamadas = camadas;
  g._mCamadasSlot = slot;
  g._mCamadasEspelho = espelho;
  prender(camadas, g);
  Object.defineProperty(objeto, 'layers', ACESSOR_LAYERS);
  return camadas.mask;
}

/** Devolve ao objeto (e ao `Layers`, se ninguém mais o usa) as propriedades cruas. */
export function desengancharCamadas(objeto: Object3D): void {
  if (Object.getOwnPropertyDescriptor(objeto, 'layers')?.get === undefined) return;
  const g = objeto as unknown as ObjetoComCamadas;
  const camadas = g._mCamadas;
  soltar(camadas, g);
  delete (objeto as unknown as Record<string, unknown>)['layers'];
  objeto.layers = camadas;
}
