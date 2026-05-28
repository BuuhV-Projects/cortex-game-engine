# 0023 - Split-screen e gamepad como capacidades nativas do engine

**Data:** 2026-05-27
**Status:** aceito

## Contexto

Jogos co-op local (corrida split-screen, multiplayer no mesmo PC) precisam
de dois recursos que o engine não cobria:

1. **Múltiplas câmeras no mesmo canvas** (split-screen). O `Renderer`
   ([src/core/Renderer.ts](../../src/core/Renderer.ts)) só expunha
   `render(scene, camera)` — não havia controle sobre viewport/scissor do
   `WebGLRenderer` interno. Sem isso, a única forma de fazer split-screen
   seria instanciar 2 canvases lado a lado (2 contextos WebGL, recursos
   duplicados), o que é caro e visualmente inferior.
2. **Gamepad**. O `InputManager` ([src/core/InputManager.ts](../../src/core/InputManager.ts))
   só cobre teclado/mouse (event-driven). Jogo com 2+ players locais
   praticamente exige controle, e a Gamepad API do browser é polled (modelo
   distinto do InputManager), por isso não cabia simplesmente "estender" a
   classe existente.

Quando um agente de IA tentou implementar jogo co-op em cima do engine, a
saída natural foi propor workarounds no projeto consumidor: 2 canvases para
o split-screen e um `utils/gamepad.ts` ad-hoc para o gamepad. Isso contraria
o [ADR-0021](./0021-agente-deve-preferir-engine-sobre-three-direto.md)
("estenda o engine, não caia em fallback no projeto") e o
[ADR-0022](./0022-padrao-arquitetural-de-projetos-criados.md)
("projetos não devem reimplementar capacidades do engine"). Em vez de
aceitar a duplicação, é melhor o engine passar a oferecer essas capacidades
diretamente.

## Decisão

### Split-screen no `Renderer`

Adicionados dois novos métodos públicos:

```ts
clear(): void
renderViewport(scene, camera, viewport: { x, y, width, height }): void
```

E o `autoClear` do `WebGLRenderer` interno passa a ser `false` no
construtor. Para preservar o comportamento atual de "1 câmera por frame",
`render()` agora chama `clear()` internamente antes de delegar.

API composta (em vez de expor `setViewport`/`setScissor`/`setScissorTest`
crus) porque:

- Mantém o engine consistente com o ADR-0001 (Three confinado a `src/core/`).
- Cobre 90% dos casos: split-screen de 2–4 players, minimap, picture-in-picture.
- Casos exóticos (clipping irregular, RTT) podem motivar APIs futuras —
  evitamos preempting.

Uso típico em co-op de 2 players:

```ts
renderer.clear();
renderer.renderViewport(scene, p1Cam, { x: 0,     y: 0, width: w / 2, height: h });
renderer.renderViewport(scene, p2Cam, { x: w / 2, y: 0, width: w / 2, height: h });
```

### Gamepad como `GamepadManager` separado

Criada classe `GamepadManager` em
[src/core/GamepadManager.ts](../../src/core/GamepadManager.ts), separada do
`InputManager`. Razões:

- **Modelos diferentes**: `InputManager` é event-driven (DOM events);
  Gamepad API é polled (`navigator.getGamepads()` a cada frame). Misturar
  os dois em uma classe só seria confuso e quebraria o modelo existente.
- **Múltiplos slots**: gamepad tem até 4 players por design; InputManager
  é singleton por elemento.
- **Custo zero quando não usado**: jogos só-teclado não precisam importar
  nem instanciar `GamepadManager`.

API:

```ts
class GamepadManager extends EventTarget {
  poll(): void                                // chamar do GameLoop a cada frame
  getGamepad(index: 0..3): GamepadState | null
  isButtonDown(gamepadIndex, button): boolean
  getAxis(gamepadIndex, axis): number          // deadzone aplicada
  // eventos: 'gamepad:connect', 'gamepad:disconnect',
  //          'button:down', 'button:up' (emitidos via diff no poll)
}
```

Deadzone padrão: 0.15 nos axes (configurável por construtor).
Botões já pressionados no momento da conexão também emitem `button:down`
para evitar perda de eventos.

### Re-exports

`GamepadManager` adicionado em:
- [src/index.ts](../../src/index.ts) (entry público do pacote)
- [src/index-runtime.ts](../../src/index-runtime.ts) (entry usado pelos
  projetos que vendorizam o engine, ADR-0009)

Os novos métodos do `Renderer` ficam automaticamente disponíveis — a classe
já era exportada.

## Consequências

- **Positivo**: o caminho recomendado (ADR-0021/0022) — estender o engine
  em vez de cair em fallback no projeto — agora é viável para jogos co-op
  locais sem fricção. Projetos pegam `GamepadManager` e `renderViewport`
  do mesmo lugar onde já pegam tudo o mais.
- **Positivo**: split-screen real (1 canvas, múltiplas viewports) é mais
  barato que o workaround de 2 canvases — 1 contexto WebGL, geometria
  carregada uma vez, sem sincronização entre canvases.
- **Positivo**: `GamepadManager` separado permite que projetos só-teclado
  continuem sem custo extra (não é instanciado).
- **Negativo**: o `Renderer` agora exige `clear()` explícito antes de
  `renderViewport()`. Quem usar só `render()` (caso comum) continua igual,
  porque `render()` foi atualizado para chamar `clear()` internamente —
  retrocompatível.
- **Negativo**: gamepad em projetos vendorizados pré-existentes só fica
  disponível após re-vendorização do engine (ADR-0009). Decisão operacional,
  não bloqueia este ADR.

## Referências

- ADR-0001 — Renderizador baseado em Three.js (camada confinada a `src/core/`).
- ADR-0009 — Vendoring engine inline.
- ADR-0021 — Agente deve preferir cortex-game-engine sobre three direto.
- ADR-0022 — Padrão arquitetural de projetos criados pelo IDE.
