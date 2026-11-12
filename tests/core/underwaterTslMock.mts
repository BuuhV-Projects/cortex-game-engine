/**
 * Falsos do `three/webgpu` para testar o efeito embaixo d'água (SPEC-0726) em Node,
 * sem GPU: o `TSL` devolve um nó "corrente" que aceita qualquer cadeia
 * (`.mul(...).add(...)`) e uniforms com `.value`; o `RenderPipeline` só registra
 * `render`/`dispose`. É `.mts` para ficar fora do `include` do Vitest (só `.ts` em `tests/`).
 */
import { vi } from 'vitest';

/** Nó que aceita qualquer acesso ou chamada e devolve a si mesmo. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function chainNode(): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const node: any = new Proxy(() => undefined, {
    get: (_target, key) => (key === 'then' ? undefined : node),
    apply: () => node,
  });
  return node;
}

/** Pass da cena falso que o `TSL.pass` devolve. */
export interface FakeScenePass {
  scene: unknown;
  camera: unknown;
  getTextureNode(): unknown;
  dispose: ReturnType<typeof vi.fn>;
}

/** `TSL` falso: `uniform`, `pass` e `sin` registráveis; o resto vira nó corrente. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function fakeTSL(): any {
  const node = chainNode();
  const known: Record<string, unknown> = {
    uniform: (value: unknown) => ({ value }),
    pass: vi.fn(
      (): FakeScenePass => ({ scene: null, camera: null, getTextureNode: () => node, dispose: vi.fn() }),
    ),
    sin: vi.fn(() => node),
    vec4: vi.fn(() => node),
  };
  return new Proxy(known, { get: (target, key: string) => (key in target ? target[key] : node) });
}

/** `RenderPipeline` falso, com as instâncias guardadas para o teste olhar. */
export class FakeRenderPipeline {
  static instances: FakeRenderPipeline[] = [];
  outputNode: unknown = null;
  outputColorTransform = true;
  render = vi.fn();
  dispose = vi.fn();
  constructor() {
    FakeRenderPipeline.instances.push(this);
  }
}
