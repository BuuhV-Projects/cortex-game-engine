import { AnimationMixer, AnimationClip, type AnimationAction, type Object3D, LoopRepeat, LoopOnce } from 'three';

/** Opções de reprodução de um clipe (ver {@link SceneAnimator.play}). */
export interface PlayOptions {
  /** Repetir em loop. Default `true`. */
  loop?: boolean;
  /** Multiplicador de velocidade. Default `1`. */
  speed?: number;
}

/**
 * Controla as **animações de um modelo** da cena (clipes embutidos no `.glb`):
 * escolher qual clipe toca, play/stop, loop e velocidade. Um `AnimationMixer` por
 * objeto animado; o {@link buildScene} cria um e guarda em `obj.userData.cortexAnim`,
 * tica no `handle.update` e aplica o que vier do nó JSON (`animation`) ou da overlay
 * do editor. O inspector do editor lê/controla por aqui.
 */
export class SceneAnimator {
  readonly mixer: AnimationMixer;
  /** Clipes disponíveis (do glTF). */
  readonly clips: AnimationClip[];
  private action: AnimationAction | null = null;
  /** Nome do clipe tocando agora, ou `null`. */
  current: string | null = null;

  constructor(root: Object3D, clips: AnimationClip[]) {
    this.mixer = new AnimationMixer(root);
    this.clips = clips;
  }

  /** Nomes dos clipes (pro dropdown do editor). */
  clipNames(): string[] {
    return this.clips.map((c) => c.name);
  }

  /** Toca um clipe por nome (com crossfade do anterior). `loop`/`speed` opcionais. */
  play(name: string, options: PlayOptions = {}): void {
    const clip = this.clips.find((c) => c.name === name) ?? this.clips[0];
    if (!clip) return;
    const { loop = true, speed = 1 } = options;
    const next = this.mixer.clipAction(clip);
    next.setLoop(loop ? LoopRepeat : LoopOnce, loop ? Infinity : 1);
    next.clampWhenFinished = !loop;
    next.timeScale = speed;
    if (this.action && this.action !== next) {
      next.reset();
      this.action.fadeOut(0.2);
      next.fadeIn(0.2).play();
    } else {
      next.reset().play();
    }
    this.action = next;
    this.current = clip.name;
  }

  /** Para tudo (volta pro frame base). */
  stop(): void {
    this.mixer.stopAllAction();
    this.action = null;
    this.current = null;
  }

  /** Velocidade do clipe atual em runtime. */
  setSpeed(speed: number): void {
    if (this.action) this.action.timeScale = speed;
  }

  /** Avança o mixer. Chamado pelo loop (via `handle.update` do buildScene). */
  update(deltaSeconds: number): void {
    this.mixer.update(deltaSeconds);
  }
}
