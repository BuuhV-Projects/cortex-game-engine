# SPEC-0158 - Kit platformer-obstacles: peças de borracha (Borracha) + balsas de resgate

**Data:** 2026-07-27
**Status:** aceito

## Contexto

Na revisão do Mundo 4 do teste4 o usuário definiu mais duas semânticas do pack
que o `kit.json` não registrava:

1. **Peças EMBORRACHADAS**: `obstacle_18_001` (bloco-botão), `obstacle_19_001`
   (cunha bumper), `obstacle_20_001`/`obstacle_21_001` (rampinhas),
   `platform_028..030` (empilhados) — e as paredes infláveis `wall_003..015`.
   Ao TOCAR nelas o player sofre um leve recuo (como pular em borracha), a peça
   faz uma animação de squash de borracha e toca um som de pulo ("poim").
2. **Balsas de resgate**: `water_platform_001..003` são as ÚNICAS peças que
   ficam em contato com a água — servem de base pro player que caiu voltar ao
   percurso (quando houver rota), em vez de afogar direto.

## Decisão

### Script anexável do kit: `Borracha` (`scripts/BouncyScript.ts`)

Mesmo modelo do `Ventilador` (SPEC-0157) — o script mora NO KIT e o jogo copia
`scripts/` e registra (ADR-0085):

- **Contato**: mede a peça no 1º frame (bbox → raio XZ + topo). Quando o player
  aterrissa/encosta por cima, aplica `recuo` no `velocityY` (leve — pulo de
  borracha, não trampolim), com gatilho de borda + cooldown até sair. A banda
  vertical de contato é ESTREITA (−0.25/+0.6 do topo — ajuste do playtest
  2026-07-27): banda larga disparava o bounce com o player em pé numa
  plataforma logo ACIMA da peça, sem tocá-la.
- **Squash de borracha**: anima por transform o PRIMEIRO NÓ FILHO do glb
  (escala: achata em Y e engorda em XZ, ~0.25s com retorno elástico). Anima o
  FILHO de propósito: nó com `collider` estático vira entidade e o sync de
  transform SOBRESCREVE o root a cada frame (armadilha descoberta nos discos
  giratórios do teste4) — o filho fica livre.
- **Som**: dispara o evento DOM `rush:bounce` (o "poim" de mola que o jogo já
  mapeia no RushAudio); jogo sem áudio ignora o evento sem quebrar.
- Campos: `recuo` (m/s, default 6.5), `squash` (fração, 0.18), `dur` (s, 0.25).

`Borracha` entra em `_kit.scripts.provides`.

### Anotação semântica (fonte durável no `gen-overrides.mjs` do stage)

- `obstacle_18/19/20/21`, `platform_028..030`: `mechanic: { behavior: 'bouncy',
  script: 'Borracha' }` + tag `rubber` + nota descrevendo recuo/squash/poim.
- `wall_003..015`: tag `rubber`/`inflatable` + mesma mechanic bouncy (guarda-
  corpo inflável que "poim" ao toque).
- `water_platform_001..003`: `altUse: ['rescue']` + nota: única família que
  fica NA água; base de resgate pro player caído (o jogo põe rota de volta —
  ex.: trampolim em cima).

## Consequências

- O `kit.json` é regenerado do overrides (SPEC-0151); nesta mudança as entradas
  afetadas foram atualizadas em sincronia com o `gen-overrides.mjs` do stage.
- A IA level-designer sabe: borracha = feedback tátil obrigatório (recuo +
  squash + poim), paredes infláveis idem, e água só tem balsa de resgate — o
  PERCURSO nunca flutua rente à água.
- Vale a limitação padrão dos scripts de kit: 1 player (query do
  CharacterBodyComponent), sem teste unitário no repo do engine (precedente
  SPEC-0157); a integridade do kit.json segue em `tests/scene/kitsRepo.test.ts`.
