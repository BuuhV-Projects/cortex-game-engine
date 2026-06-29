import type { Object3D } from 'three';
import { Component } from '../ecs/Component.js';
import type { ScriptBehavior } from '../scripts/ScriptBehavior.js';

/** Declaração de um script na cena (`level.json` node.scripts / overlay `data.scripts`). */
export interface ScriptDecl {
  /** Nome registrado da classe (ver {@link registerScript}). */
  type: string;
  /** Valores dos campos editáveis (sobrescrevem os defaults do schema). */
  fields?: Record<string, unknown>;
}

/** Slot vivo de um script anexado: declaração + instância + flag de start. */
export interface ScriptSlot {
  type: string;
  fields: Record<string, unknown>;
  instance: ScriptBehavior | null;
  started: boolean;
}

/**
 * Componente que carrega **um ou mais scripts** ({@link ScriptBehavior}) anexados a um nó —
 * ADR-0085. O {@link ScriptHostSystem} instancia/roda os slots; o `object` é o `Object3D` do
 * nó (injetado nos scripts como `this.object3d`). Um nó tem **um** ScriptComponent com N slots
 * (igual aos vários componentes de um GameObject na Unity).
 */
export class ScriptComponent extends Component {
  scripts: ScriptSlot[];

  constructor(
    /** O `Object3D` do nó (injetado nos scripts como `object3d`). */
    public object: Object3D | null,
    scripts: ScriptDecl[] = [],
  ) {
    super();
    this.scripts = scripts.map((s) => ({
      type: s.type,
      fields: { ...(s.fields ?? {}) },
      instance: null,
      started: false,
    }));
  }
}
