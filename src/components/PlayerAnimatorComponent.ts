import { Component } from '../ecs/Component.js';

/**
 * **Mapa ação → clipe** do player (o "contrato"/padrão de animação). É a base que a
 * IA preenche e o editor edita: pra cada ação de locomoção (`idle`/`walk`/`run`/
 * `jump`/`fall`/`land`) e ações custom (`attack`/`hurt`/…), qual clipe do `.glb`
 * tocar. O {@link PlatformerAnimationSystem} deriva a ação do
 * {@link PlatformerBodyComponent} e toca o clipe mapeado no `SceneAnimator`.
 *
 * Só DADOS (os campos de estado abaixo são escritos pelo system). Estenda o System
 * pra lógica custom; dispare one-shots com {@link trigger}.
 */
export class PlayerAnimatorComponent extends Component {
  /** Ação tocando agora (escrito pelo system). */
  current: string | null = null;
  /** Ação one-shot disparada (override até acabar). Use {@link trigger}. */
  oneShot: string | null = null;
  /** Tempo restante do one-shot (s) — gerenciado pelo system. */
  oneShotTime = 0;

  /**
   * @param clips - Mapa ação → nome do clipe (ex.: `{ idle: 'Idle', run: 'Run' }`).
   *   Ações sem clipe caem num fallback (run↔walk, fall↔jump, land→idle).
   * @param runThreshold - `|vx|` acima disto = `run`; abaixo = `walk`. Default `4`.
   */
  constructor(
    public clips: Record<string, string> = {},
    public runThreshold = 4,
  ) {
    super();
  }

  /** Dispara uma ação **one-shot** (ataque/hit/…): toca uma vez e volta à locomoção. */
  trigger(action: string): void {
    this.oneShot = action;
    this.oneShotTime = 0;
  }
}
