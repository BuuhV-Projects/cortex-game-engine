# 0069 - Multi-cena via game.setActiveScene

**Data:** 2026-06-16
**Status:** aceito

## Contexto

O `Game` renderizava **uma única** cena/câmera por frame — `Game._tick` chamava
`renderer.render(this.scene, this.camera)` cravado. Jogos precisam de **telas
alternativas** (criador de personagem com fundo dedicado, menus, troca de região)
sem a cena do jogo aparecendo atrás, e com **tela de loading** na transição. Já
existe `createDomLoadingScreen` (overlay DOM) ocioso pra isso.

## Decisão

`Game` ganha `_activeScene`/`_activeCamera` (default = `scene`/`camera` do jogo) e o
método público:

```ts
setActiveScene(scene: Scene, camera: PerspectiveCamera | OrthographicCamera): void
```

O `_tick` renderiza `_activeScene`/`_activeCamera`. Pra voltar ao jogo:
`setActiveScene(game.scene, game.camera)`. Exporto também `PerspectiveCamera`/
`OrthographicCamera` (o jogo cria a câmera da tela alternativa).

Precedência no `_tick`: o **PostFX** só roda quando a cena ativa **é a do jogo**
(`_activeScene === this.scene`); cenas alternativas renderizam **direto** (sem o
pós-processamento de mood/bloom do jogo). A câmera livre do **editor** segue
mandando, agora sobre a cena ativa.

O `world` (ECS) e o input continuam únicos/compartilhados — quem mostra outra cena
**pausa os sistemas de gameplay** (`pauseWhen`). Tipicamente: `LoadingScreen.show()`
→ compõe/carrega a cena → `setActiveScene(...)` → `hide()`.

## Consequências

- **Multi-cena reusável** (criador, menus, regiões) com uma superfície mínima — sem
  recriar o `Game` nem mexer no `world`.
- **Editor (F2):** o editor (gizmos/inspector) assume `game.scene`/`game.world`. Numa
  cena alternativa o editor renderiza a cena ativa mas opera sobre a do jogo — use o
  editor só na cena do jogo (caso de dev; aceitável).
- **PostFX** não se aplica às cenas alternativas (renderizam cru). Se um dia precisar
  de pós numa tela alternativa, ela monta o próprio PostFX.
- O `world` é compartilhado: a cena alternativa não tem ECS próprio — anime/rotacione
  por código e pause o gameplay enquanto estiver nela.
- API pública nova → regerar doc e re-vendorizar (ADR-0009).
