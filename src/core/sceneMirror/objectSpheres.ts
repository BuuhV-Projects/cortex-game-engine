/**
 * Esfera do OBJETO para o culling nativo do passe principal (SPEC-0686).
 *
 * `InstancedMesh`, `SkinnedMesh` e `BatchedMesh` têm `boundingSphere` próprio, e
 * é com ele que o `three` os corta (`Frustum.intersectsObject`). O espelho só
 * conhecia a esfera da geometria, então esses nós voltavam do host sem corte e
 * o JS fazia o teste por candidato. Aqui o JS manda ao host a esfera do objeto
 * (e o centro da esfera da geometria, que o `three` usa para o `z`) e o host os
 * corta.
 *
 * A conferência é por CONTEÚDO, por quadro, só dos elegíveis visíveis: a
 * vegetação muta a esfera no lugar (mesma identidade), e o `three` calcula a
 * esfera `null` na hora do teste — com ela `null`, o slot fica com o JS, que
 * faz o teste do `three` e a calcula no mesmo quadro que ele calcularia.
 */
import type { Object3D } from 'three';
import type { MainPassBridge } from './mirrorBridge.js';
import { MainPassKind, SYNC_FRUSTUM_CULLED } from '../../render/MainPassKind.js';
import type { ObjetoEnganchado } from './mirrorHooks.js';

/** Valores mandados por slot: centro e raio do objeto, centro da geometria. */
const SENT_FLOATS = 7;

/** O que se lê de uma esfera do `three`. */
interface EsferaLike {
  center: { x: number; y: number; z: number };
  radius: number;
}

/** Nó com esfera própria. */
type ComEsfera = Object3D & {
  isSprite?: boolean;
  boundingSphere?: EsferaLike | null;
  geometry?: { boundingSphere: EsferaLike | null };
};

/** O que a conferência precisa do espelho. */
export interface ObjectSphereSink {
  _marcarSujo(slot: number): void;
}

/** Elegível: o `three` corta pela esfera do objeto (não é sprite e tem `boundingSphere`). */
export function cutsByObjectSphere(objeto: Object3D | undefined, tipo: number): boolean {
  const no = objeto as ComEsfera | undefined;
  return no !== undefined && tipo === MainPassKind.JsCull && no.isSprite !== true && no.boundingSphere !== undefined;
}

export class ObjectSphereSync {
  /** 1 = o host corta o slot pela esfera do objeto; a projeção usa o `z` dele. */
  host = new Uint8Array(0);
  private _sent = new Float64Array(0);
  /** Slots elegíveis (pode ter slot que deixou de ser: sai na conferência). */
  private _list: number[] = [];
  private _listed = new Uint8Array(0);

  constructor(private readonly _bridge: MainPassBridge | undefined) {}

  /** O host corta pela esfera do objeto? */
  get enabled(): boolean {
    const b = this._bridge;
    return b?.objectSpheres === true && typeof b.setObjectSphere === 'function' && typeof b.clearObjectSphere === 'function';
  }

  /** Dimensiona pela capacidade do host (o `resetSlots` do `install` zerou o lado C++). */
  reserve(capacity: number): void {
    this.host = new Uint8Array(capacity);
    this._sent = new Float64Array(capacity * SENT_FLOATS);
    this._listed = new Uint8Array(capacity);
    this._list = [];
  }

  /** O slot ganhou um nó (install, append, lápide reaproveitada). */
  adopt(objeto: Object3D, slot: number, tipo: number): void {
    this._forget(slot);
    if (!this.enabled || !cutsByObjectSphere(objeto, tipo) || this._listed[slot] !== 0) return;
    this._listed[slot] = 1;
    this._list.push(slot);
  }

  /**
   * Antes do `cull` do quadro: manda o que mudou, tira do host o slot de
   * esfera `null` e suja o slot cujo `frustumCulled` o host ainda não tem.
   */
  refresh(
    nodes: readonly (Object3D | undefined)[], kinds: Uint8Array, hiddenAbove: Uint16Array, sentFlags: Uint8Array, sink: ObjectSphereSink,
  ): void {
    const list = this._list;
    let kept = 0;
    for (let r = 0; r < list.length; r++) {
      const slot = list[r]!;
      const objeto = nodes[slot];
      if (!cutsByObjectSphere(objeto, kinds[slot]!)) {
        this._listed[slot] = 0;
        this._forget(slot);
        continue;
      }
      list[kept++] = slot;
      // O host não alcança o oculto; quando ele reaparece, a conferência roda no mesmo quadro.
      if (!(objeto as unknown as ObjetoEnganchado)._mVis || hiddenAbove[slot] !== 0) continue;
      this._refreshSlot(objeto as ComEsfera, slot, sentFlags, sink);
    }
    list.length = kept;
  }

  private _refreshSlot(no: ComEsfera, slot: number, sentFlags: Uint8Array, sink: ObjectSphereSink): void {
    const own = no.boundingSphere ?? null;
    const geo = no.geometry?.boundingSphere ?? null;
    if (own === null || geo === null) {
      this._forget(slot);
      return;
    }
    const s = this._sent;
    const at = slot * SENT_FLOATS;
    const oc = own.center;
    const gc = geo.center;
    if (
      this.host[slot] === 0 || s[at] !== oc.x || s[at + 1] !== oc.y || s[at + 2] !== oc.z || s[at + 3] !== own.radius ||
      s[at + 4] !== gc.x || s[at + 5] !== gc.y || s[at + 6] !== gc.z
    ) {
      s[at] = oc.x;
      s[at + 1] = oc.y;
      s[at + 2] = oc.z;
      s[at + 3] = own.radius;
      s[at + 4] = gc.x;
      s[at + 5] = gc.y;
      s[at + 6] = gc.z;
      this._bridge!.setObjectSphere!(slot, oc.x, oc.y, oc.z, own.radius, gc.x, gc.y, gc.z);
      this.host[slot] = 1;
    }
    // O JS lia o `frustumCulled` direto todo quadro: a linha vai no `syncPending` deste.
    if (((sentFlags[slot]! & SYNC_FRUSTUM_CULLED) !== 0) !== no.frustumCulled) sink._marcarSujo(slot);
  }

  private _forget(slot: number): void {
    if (this.host[slot] === 0) return;
    this.host[slot] = 0;
    this._bridge?.clearObjectSphere?.(slot);
  }
}
