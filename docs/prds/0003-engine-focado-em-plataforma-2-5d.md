# PRD 0003 - Produto focado em jogos de plataforma 2.5D

**Data:** 2026-06-05
**Status:** aceito

## Problema

O `cortex-game-engine` nasceu genérico (renderizador 3D + ECS + IA de geração de
cena). Genérico demais: a IA não tinha um alvo de design claro, o template não
guiava o usuário pra nenhum gênero, e a física carregava casos que ninguém usava
(veículo cinemático — ver ADR-0029, removido). Sem um norte de produto, cada
sessão de level design partia do zero e o resultado ficava inconsistente.

A decisão de produto: **focar tudo em jogos de plataforma 2.5D** no estilo
**Mario Wonder / Rayman Legends** — gameplay no plano XY (cima, baixo, lados),
com profundidade visual em Z, e câmera 2D-follow que pode ter um leve giro 2.5D
no eixo central (travado por padrão, liberável pelo dev). Um nicho concreto faz
o engine, o template, o editor e a IA puxarem na mesma direção.

## Usuário e contexto

Desenvolvedor solo ou time pequeno que quer **prototipar e criar jogos de
plataforma** rápido, delegando boa parte do level design à IA do IDE. Não é
necessariamente bom em level design nem quer escrever física do zero. Quer:

- Um template que já abre rodando um nível de plataforma jogável.
- Primitivas prontas (corpo, colisão AABB, input, câmera) — `setupPlatformer`
  numa linha, sem reescrever física a cada projeto.
- Autorar níveis como **dado** (JSON, ADR-0044) e editá-los no editor embutido.
- Uma IA que entende o gênero (plano XY, plataformas, one-way, hazards) e monta
  cenários bonitos e coerentes, não cenas 3D genéricas.

## Histórias do usuário

- **Como** dev de plataforma, **quero** um template que já vem com player,
  chão, plataformas e câmera 2D-follow, **para** começar do jogável, não do vazio.
- **Como** dev, **quero** `setupPlatformer(game)` numa linha, **para** não
  reescrever gravidade/colisão/input por projeto.
- **Como** dev, **quero** declarar o nível em JSON (colliders, one-way, player),
  **para** o editor editar/salvar e a IA autorar.
- **Como** dev, **quero** que a câmera siga o player no plano XY com um leve giro
  2.5D opcional, **para** o visual ter personalidade sem virar 3D livre.
- **Como** dev, **quero** que a IA do IDE pense como level designer de plataforma
  (carregando a *game design bible*), **para** os cenários saírem bonitos e
  coerentes com o gênero.

## Escopo por versão

### V1 (este pivô — implementado)

- **Primitivas de gameplay 2.5D** (ADR-0045): `Collider2DComponent` (AABB),
  `PlatformerBodyComponent`, `PlatformerPhysicsSystem` (gravidade + resolução
  AABB por eixo + plataformas one-way), `PlatformerInputSystem`,
  `FollowCamera2DSystem` (follow XY + roll Z opcional), `setupPlatformer`.
- **Nível data-driven** (ADR-0044): nós com `collider`/`player` no JSON viram
  entidades ECS via `buildScene(..., { world })`.
- **Template plataforma:** `main.ts` com `Game` + `setupPlatformer` + `buildScene`;
  `scenes/level.json` com chão, plataformas, one-way e player.
- **Editor pausa a gameplay e grava no Transform** (ADR-0046): editar objetos de
  gameplay no editor "gruda" ao dar play.
- **IA orientada a plataforma:** prompt reorientado pra "montagem de level
  (plataforma 2.5D)" + carregamento da `docs/game-design-bible` por padrão.
- **Remoção do que não serve ao foco:** toda a física de veículo (ADR-0029).

### V2 (próxima iteração)

- Inimigos/hazards como primitivas (patrulha, dano, checkpoints).
- Coletáveis e gatilhos (moedas, fim de fase, portas).
- Mais variações de câmera (zonas de câmera, lock regions).
- Tilesets/auto-tiling pra montagem rápida de blocos.

### V3+ (não-bloqueante)

- Estados de animação do player (sprite/skinned) e juice (squash/stretch).
- Parallax de fundo por camadas em Z.
- Editor de curvas de movimento / tuning de game feel.

## Critérios de sucesso (V1)

- `yarn create` → projeto abre rodando um nível de plataforma jogável (anda,
  pula, colide, câmera segue) sem o dev escrever física.
- Autorar/editar o nível em JSON e no editor (F2) persiste corretamente.
- A IA, dado assets + referência, monta um nível de plataforma coerente com o
  plano XY (sem partes flutuando soltas, respeitando colisão).

## Não-objetivos (V1)

- **Não** suportar gêneros fora de plataforma 2.5D como caminho principal (o
  engine ainda é 3D por baixo, mas o produto/IA/template miram plataforma).
- **Não** entregar física de veículo/3D livre (removida — ADR-0029).
- **Não** entregar inimigos/coletáveis/checkpoints ainda (V2).
- **Não** entregar animação de personagem como primitiva (V3+).
