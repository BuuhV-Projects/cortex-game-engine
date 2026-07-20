# SPEC-0080 - Sistema de interação ("action") no engine

**Data:** 2026-06-28
**Status:** aceito

## Contexto

O jogo precisava padronizar **interações** (entrar no carro, falar com NPC, abrir
porta, pegar item). Até então, a interação do carro (entrar por proximidade + botão A)
estava **cravada** no `CarControlSystem` do jogo — não reusável, e cada novo
interagível seria um caso à parte. Decisão (com o usuário): criar um conceito de
**action** genérico no **engine**.

## Decisão

- **`InteractionComponent`** (dado): `prompt` (texto), `range` (alcance XZ),
  `onInteract` (callback do jogo). Marca um objeto/entidade como interagível.
- **`InteractionSystem`** (lógica, `priority = 25`): a cada frame acha o
  `InteractionComponent` **mais próximo** do **interator ativo** dentro do `range`,
  avisa a HUD via `onPrompt(interaction|null)` e dispara `onInteract` na **borda** do
  botão (gamepad A / tecla E).
- O **interator** (posição XZ) e o **render do prompt** são **injetados pelo jogo**
  (`options.interactor`, `options.onPrompt`) — assim funciona com o "player do
  momento" (a pé OU carro) e a UI fica a cargo do jogo. O engine só padroniza a
  detecção de proximidade + o disparo.

## Consequências

- Qualquer objeto vira interagível com 1 componente; o carro migra pra esse padrão
  (action "Entrar"), e NPC/porta/item ganham interação de graça.
- A **lógica concreta** (entrar no carro, abrir diálogo) fica no `onInteract` do jogo
  — o engine não acopla regras de gameplay.
- Botão padrão = A (0), que também é pulo no 3ª pessoa: ao migrar o carro, escolher o
  botão por contexto (ou suprimir o pulo quando há interação em alcance) fica a cargo
  da fiação do jogo.
- Base pro **combate** (pose de luta perto de objeto SEM action) e pro switch do carro.
