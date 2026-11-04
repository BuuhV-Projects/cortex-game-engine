/**
 * Uma travessia de matriz por render de cena (SPEC-0680, ADR-0681).
 *
 * O `Renderer.render` do three faz `scene.updateMatrixWorld()` a cada chamada com
 * `scene.matrixWorldAutoUpdate === true` — e o quadro chama esse `render` várias vezes para a MESMA cena: o passe
 * principal e, aninhado nele, cada cascata de sombra (`ShadowNode.renderShadow`). Cada chamada percorre a árvore
 * inteira (~14,6 mil nós no DDD 00).
 *
 * Este módulo embrulha o `render` da INSTÂNCIA: o render "de fora" de uma cena faz a travessia uma vez e desliga o
 * auto-update até terminar; os renders aninhados da mesma cena acham o auto-update desligado e não percorrem de
 * novo. No fim (inclusive com exceção) a cena volta ao normal, então quem lê matriz fora do render (editor,
 * picking, raycast) vê a cena como antes.
 */

/** O mínimo de `Object3D` que o embrulho usa. */
export interface MatrixScene {
  matrixWorldAutoUpdate?: boolean;
  updateMatrixWorld(force?: boolean): void;
}

/** O mínimo de renderer: um `render(scene, camera)` substituível na instância. */
export interface MatrixRenderer {
  render(scene: never, camera: never): unknown;
}

/** Instalação ativa; `uninstall` devolve o `render` anterior. */
export interface SingleMatrixUpdate {
  /** Renders de fora que fizeram a travessia única (diagnóstico e teste). */
  readonly stats: { updates: number };
  uninstall(): void;
}

/**
 * Embrulha `renderer.render` para uma travessia de matriz por render de fora de cada cena.
 *
 * @param renderer - A instância do `WebGPURenderer` (ou algo com o mesmo `render`).
 * @param bypass - Quando devolve `true`, o render passa direto (ex.: espelho nativo instalado, dono das matrizes).
 * @returns A instalação, com `stats` e `uninstall`.
 *
 * @example
 * const single = installSingleMatrixUpdate(threeRenderer, () => activeSceneMirror()?.installed === true);
 */
export function installSingleMatrixUpdate(renderer: MatrixRenderer, bypass: () => boolean = () => false): SingleMatrixUpdate {
  const table = renderer as unknown as Record<string, unknown>;
  const hadOwn = Object.prototype.hasOwnProperty.call(renderer, 'render');
  const original = renderer.render as (this: unknown, scene: unknown, camera: unknown) => unknown;
  const stats = { updates: 0 };

  table['render'] = function render(this: unknown, scene: unknown, camera: unknown): unknown {
    const cena = scene as MatrixScene | null | undefined;
    if (!cena || cena.matrixWorldAutoUpdate !== true || typeof cena.updateMatrixWorld !== 'function' || bypass()) {
      return original.call(this, scene, camera);
    }
    cena.updateMatrixWorld();
    stats.updates++;
    cena.matrixWorldAutoUpdate = false;
    try {
      return original.call(this, scene, camera);
    } finally {
      cena.matrixWorldAutoUpdate = true;
    }
  };

  return {
    stats,
    uninstall(): void {
      if (hadOwn) table['render'] = original;
      else Reflect.deleteProperty(renderer, 'render');
    },
  };
}
