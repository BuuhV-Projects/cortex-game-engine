import type { Object3D, Camera } from 'three';
import type { Entity } from '../ecs/Entity.js';
import type { World } from '../ecs/World.js';
import type { InputManager } from '../core/InputManager.js';
import type { GamepadManager } from '../core/GamepadManager.js';
import type { Scene } from '../core/Scene.js';

/** Assinatura do `raycast` de um `Object3D` (o que {@link ScriptBehavior.disableRaycast} troca). */
type RaycastFn = Object3D['raycast'];

/** Raycast neutro compartilhado — não acha nada e não aloca por objeto silenciado. */
const NO_RAYCAST: RaycastFn = () => {};

/** Tipo de um campo editável de script (o que o Inspector renderiza/persiste). */
export type ScriptFieldType = 'number' | 'string' | 'boolean' | 'vector3' | 'asset' | 'select';

/** Descritor de um campo editável (no `static fields` da subclasse de {@link ScriptBehavior}). */
export interface ScriptFieldDef {
  type: ScriptFieldType;
  /** Valor inicial se a cena não declarar nada. */
  default: unknown;
  /** Rótulo amigável no Inspector (default: o nome do campo). */
  label?: string;
  /** Opções do `select`. */
  options?: string[];
}

/** Schema dos campos editáveis de um script (`static fields` na subclasse). */
export type ScriptFieldSchema = Record<string, ScriptFieldDef>;

/**
 * Handles do engine injetados em cada script pelo {@link ScriptHostSystem} (via `this.ctx`).
 * É o "ambiente" que o comportamento enxerga — sem precisar de glue no `main.ts`.
 */
export interface ScriptContext {
  world: World;
  input?: InputManager;
  gamepad?: GamepadManager;
  scene?: Scene;
  camera?: Camera;
}

/**
 * **Base de comportamento anexável a um objeto** (estilo MonoBehaviour da Unity) — ADR-0085.
 *
 * Você escreve uma subclasse, declara campos editáveis em `static fields`, e a anexa a um
 * nó pelo Inspector ("Adicionar Componente → Script") ou pelo `level.json`
 * (`node.scripts`). O {@link ScriptHostSystem} instancia, injeta `entity`/`object3d`/`ctx`,
 * aplica os valores dos campos e chama os hooks. **Roda só no Play** (pausa no editor).
 *
 * @example
 * class Girar extends ScriptBehavior {
 *   static fields = { rpm: { type: 'number', default: 30, label: 'Rotação (rpm)' } } as const;
 *   rpm = 30;
 *   onUpdate(dt: number) { if (this.object3d) this.object3d.rotation.y += (this.rpm / 60) * Math.PI * 2 * dt; }
 * }
 * registerScript('Girar', Girar);
 */
export abstract class ScriptBehavior {
  /**
   * Nome do script no registro/Inspector (opcional). Com o auto-registro
   * (`registerScripts` + glob), o default é o **nome do arquivo** (estilo
   * Unity) — declare `static scriptName = 'MeuNome'` só pra um nome amigável
   * diferente (ex.: em português). É o nome que a cena PERSISTE — mudá-lo
   * depois exige atualizar level.json/scene-data que o referenciam.
   */
  static scriptName?: string;

  /** A entidade ECS que hospeda este script (injetada). */
  entity!: Entity;
  /** O `Object3D` do nó ao qual o script está anexado (ou `null`). Injetado. */
  object3d: Object3D | null = null;
  /** Handles do engine (world, input, gamepad, scene, camera). Injetado. */
  ctx!: ScriptContext;

  /** Chamado UMA vez, no primeiro frame de Play após o script existir. */
  onStart?(): void;
  /** Chamado todo frame de Play. `dt` em **segundos**. */
  onUpdate?(dt: number): void;
  /**
   * Chamado ao **parar o Play** (voltar ao editor), ao remover o script pelo
   * Inspector ou ao destruir a entidade. Desfaça aqui o que o `onStart` mexeu
   * fora do próprio script — o {@link ScriptHostSystem} descarta a instância e
   * cria uma nova no próximo Play (ciclo estilo Unity).
   */
  onDestroy?(): void;

  /** Raycasts desligados por {@link disableRaycast}, pra poder restaurar. */
  private disabledRaycasts: { obj: Object3D; own: boolean; original?: RaycastFn }[] = [];

  /**
   * **Desliga o raycast de forma REVERSÍVEL** — o jeito certo de dizer "este mesh
   * não é chão/parede" (lâmina, moeda, poça, decoração), sem que o character
   * pouse nele nem que ele bloqueie o spring arm da câmera.
   *
   * Por que existe: escrever `obj.raycast = () => {}` na mão vaza pro **modo
   * edição** — o picking do editor também é raycast, então o objeto fica
   * IMPOSSÍVEL de clicar depois do primeiro Play, e só um reload resolve. Aqui o
   * host restaura tudo ao parar o Play.
   *
   * @param target Nó a silenciar com seus filhos. Default: o `object3d` do script.
   */
  protected disableRaycast(target?: Object3D | null): void {
    const root = target ?? this.object3d;
    if (!root) return;
    root.traverse((child) => {
      const holder = child as Object3D & { raycast?: RaycastFn };
      const own = Object.prototype.hasOwnProperty.call(child, 'raycast');
      this.disabledRaycasts.push({ obj: child, own, original: own ? holder.raycast : undefined });
      holder.raycast = NO_RAYCAST;
    });
  }

  /**
   * Restaura os raycasts desligados por {@link disableRaycast}.
   *
   * @internal Chamado pelo {@link ScriptHostSystem} ao parar o Play — não chame
   * à mão, e não sobrescreva numa subclasse.
   */
  restoreRaycasts(): void {
    for (const entry of this.disabledRaycasts) {
      // `raycast` é obrigatório no Object3D, mas aqui ele PODE sumir da instância
      // (voltando pro protótipo) — daí o cast pra forma opcional.
      const holder = entry.obj as unknown as { raycast?: RaycastFn };
      if (entry.own && entry.original) holder.raycast = entry.original;
      // Sem `own` o método vinha do PROTÓTIPO (Mesh.prototype.raycast): apagar a
      // cópia da instância devolve o original — atribuir undefined o quebraria.
      else delete holder.raycast;
    }
    this.disabledRaycasts = [];
  }

  /** Schema dos campos editáveis no Inspector — declare como `static fields` na subclasse. */
  static fields?: ScriptFieldSchema;
}
