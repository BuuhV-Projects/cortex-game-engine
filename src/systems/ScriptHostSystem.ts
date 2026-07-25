import { System } from '../ecs/System.js';
import type { Entity } from '../ecs/Entity.js';
import { ScriptComponent } from '../components/ScriptComponent.js';
import type { ScriptBehavior, ScriptContext } from '../scripts/ScriptBehavior.js';
import { getScript, getScriptFields } from '../scripts/ScriptRegistry.js';
import { debug } from '../core/debug.js';

/**
 * Aplica os valores dos campos (schema default + overrides da cena/Inspector) nas
 * propriedades da instância. Usado na 1ª criação e no live-edit do Inspector.
 */
export function applyScriptFields(instance: ScriptBehavior, type: string, fields: Record<string, unknown>): void {
  const schema = getScriptFields(type);
  const target = instance as unknown as Record<string, unknown>;
  for (const [name, def] of Object.entries(schema)) {
    const v = fields[name];
    target[name] = v !== undefined ? v : def.default;
  }
}

/**
 * **Roda os scripts** ({@link ScriptBehavior}) anexados via {@link ScriptComponent} — ADR-0085.
 * Instancia cada slot pelo nome (registro), injeta `entity`/`object3d`/`ctx`, aplica os campos,
 * chama `onStart` (uma vez) e `onUpdate(dt)` (todo frame, `dt` em segundos). Um script que
 * lança exceção é logado via `debug('script', …)` e não derruba os demais.
 *
 * **Pausa no editor** (passe `isEditing`): scripts só rodam no Play, como na Unity. O jogo
 * adiciona este sistema no boot com o contexto (input/gamepad/scene/camera).
 *
 * **Play → Stop DESTRÓI as instâncias** (`restoreRaycasts` + `onDestroy`), e o Play
 * seguinte cria de novo — ciclo estilo Unity. Sem isso os efeitos colaterais do
 * `onStart` vazavam pro modo edição: quem desliga o `raycast` (lâmina, moeda, poça)
 * deixava o objeto **inselecionável no editor**, porque o picking também é raycast,
 * e só um reload da IDE devolvia o clique. Ver ADR-0143.
 *
 * Por isso este sistema **não usa `pauseWhen`**: ele precisa rodar no modo edição pra
 * enxergar a transição. Não sete `pauseWhen` nele por fora — o gate é o `isEditing`
 * do construtor.
 */
export class ScriptHostSystem extends System {
  static override requiredComponents = [ScriptComponent];
  override priority = 50;

  /** Gate do Play (o sistema roda sempre; quem pausa os scripts é isto). */
  private readonly isEditing?: () => boolean;
  /** Havia scripts rodando no frame anterior? Marca a borda Play→Stop. */
  private wasPlaying = false;
  /** Últimas entidades hospedadas — pro {@link dispose} derrubar as instâncias. */
  private hosted: Entity[] = [];

  constructor(
    private readonly ctx: ScriptContext,
    /** Quando `true`, os scripts não rodam (modo edição). */
    isEditing?: () => boolean,
  ) {
    super();
    this.isEditing = isEditing;
  }

  override update(entities: Entity[], deltaTime: number): void {
    this.hosted = entities;
    if (this.isEditing?.()) {
      // Borda Play→Stop: derruba as instâncias uma vez e devolve a cena ao editor.
      if (this.wasPlaying) this.teardown(entities);
      this.wasPlaying = false;
      return;
    }
    this.wasPlaying = true;
    const dt = deltaTime / 1000; // ms → s (scripts pensam em segundos, estilo Unity)
    for (const e of entities) {
      const comp = e.getComponent(ScriptComponent);
      if (!comp || comp.enabled === false) continue;
      for (const slot of comp.scripts) {
        if (slot.instance === null) {
          const Ctor = getScript(slot.type);
          if (!Ctor) continue; // script não registrado — ignora (some quando registrar)
          const inst = new Ctor();
          inst.entity = e;
          inst.object3d = comp.object;
          inst.ctx = this.ctx;
          applyScriptFields(inst, slot.type, slot.fields);
          slot.instance = inst;
        }
        if (!slot.started) {
          try {
            slot.instance.onStart?.();
          } catch (err) {
            debug('script', 'onStart falhou em', slot.type, err);
          }
          slot.started = true;
        }
        try {
          slot.instance.onUpdate?.(dt);
        } catch (err) {
          debug('script', 'onUpdate falhou em', slot.type, err);
        }
      }
    }
  }

  /**
   * Teardown na TROCA DE FASE (`World.clear` chama) — o buraco que vazava a
   * fase inteira (SPEC-0152): sem isto, o `onDestroy` dos scripts NUNCA rodava
   * fora do editor, e cada listener de `document` registrado por um script
   * (moeda/checkpoint/chegada escutam `rush:restart`) ficava vivo retendo
   * entity → object3d → a CENA COMPLETA da fase anterior, uma por troca.
   */
  override dispose(): void {
    this.teardown(this.hosted);
    this.hosted = [];
  }

  /**
   * Descarta as instâncias ao parar o Play: restaura os raycasts que os scripts
   * desligaram (senão o objeto fica inselecionável no editor) e chama `onDestroy`
   * pra cada uma desfazer o resto. Zera os slots — o próximo Play instancia de
   * novo e roda `onStart` com estado limpo.
   */
  private teardown(entities: Entity[]): void {
    for (const e of entities) {
      const comp = e.getComponent(ScriptComponent);
      if (!comp) continue;
      for (const slot of comp.scripts) {
        if (!slot.instance) continue;
        try {
          slot.instance.restoreRaycasts();
          slot.instance.onDestroy?.();
        } catch (err) {
          debug('script', 'onDestroy falhou em', slot.type, err);
        }
        slot.instance = null;
        slot.started = false;
      }
    }
  }
}
