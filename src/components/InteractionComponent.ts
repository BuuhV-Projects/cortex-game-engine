import { Component } from '../ecs/Component.js';

/** Opções do {@link InteractionComponent}. */
export interface InteractionOptions {
  /** Texto do prompt mostrado ao chegar perto (ex.: "Entrar", "Falar"). Default `Interagir`. */
  prompt?: string;
  /** Alcance (raio XZ) pra ativar a interação. Default `2.5`. */
  range?: number;
  /** Callback disparado ao interagir (botão A / tecla E). A lógica é do jogo. */
  onInteract?: () => void;
}

/**
 * **Ação de interação** padronizada (ADR-0080): marca um objeto como interagível —
 * o {@link InteractionSystem} mostra um prompt quando o player ativo chega a `range`
 * e dispara `onInteract` no botão. Genérico: serve pra entrar no carro, falar com
 * NPC, abrir porta, pegar item. A lógica concreta fica no `onInteract` (do jogo); o
 * engine só padroniza a detecção de proximidade + o disparo.
 *
 * @example
 * carEntity.addComponent(new InteractionComponent({ prompt: 'Entrar', range: 3.5, onInteract: () => enterCar() }))
 */
export class InteractionComponent extends Component {
  prompt: string;
  range: number;
  onInteract: () => void;

  constructor(options: InteractionOptions = {}) {
    super();
    this.prompt = options.prompt ?? 'Interagir';
    this.range = options.range ?? 2.5;
    this.onInteract = options.onInteract ?? ((): void => {});
  }
}
