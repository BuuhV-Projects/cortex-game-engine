# SPEC-0167 - Kit platformer-underworld (ruínas/submundo)

**Data:** 2026-07-29
**Status:** aceito

## Contexto

O teste4 ganhou um **mundo extra** de uma fase só, aberto ao completar a coleção
de trajes (spec 0024 do jogo): um circuito **longo e diversificado**, ao contrário
das fases curtas dos mundos 1–4. Para ele, o usuário comprou o pack
**Platformer_8_Underworld** (ithappy) — tema de ruínas/submundo, com 100 `.glb`
soltos, um mapa-demo montado e um skybox.

O pack é coeso e já vem em `.glb` na mesma escala dos kits em produção (uma
plataforma tem 10u, comparável às ilhas de 10–25u do `platformer-space`), então o
caminho é o mesmo do `platformer-space`/`platformer-deathrun`: externalizar o
atlas, medir, gerar thumbnails e classificar.

## Decisão

Kit **`kits/platformer-underworld`** (99 assets, 8 MB), `theme: "underworld"`.

### Processamento

| Etapa | Resultado |
|-------|-----------|
| externalizar atlas | 28,4 MB → 3,5 MB (o `Textures1.png` vinha embutido nas 100 peças) |
| medir (`measure.py`) | 99 ok, 1 erro |
| thumbnails | 99 PNG 256² |
| `gen-kit.mjs --overrides` | 99 assets classificados |

**`apple_001.glb` ficou de fora**: o Blender rejeita o arquivo (`Please select a
file`) — e rejeita **o original do pack**, não a nossa cópia. É defeito de
origem numa peça decorativa; não vale re-autorar.

**Sem normalização de escala**: medido contra o `platformer-space`, que já está em
produção — `platform_001` = 10 × 4,86 × 10 u, na mesma ordem das ilhas `land_*`
(10–25 u). O player tem 1,6 u.

### Classificação

O naming é opaco (`obstacle_1..11`, `pillar_1..14`, `circle_1/2`), então a
classificação veio do **contact sheet rotulado** das thumbnails
(`kits/_stage/underworld/sheet-*.png`, gerado por `make-sheet.mjs` — HTML +
Chrome headless, com `--only` pra revisar um punhado sem refazer a folha).

Distribuição: 31 `prop` · 29 `decoration` · 13 `hazard` · 10 `collectible` ·
10 `platform` · 4 `ground` · 2 `cap`.

Duas regras entraram no **vocabulário canônico** (`classify()` do `gen-kit.mjs`),
não nos overrides, por serem genéricas de tema ruínas/templo:

- `hieroglyph|glyph|rune_*` → `decoration` + tags `decal/glyph/wall` (é decalque
  plano de parede, nunca sólido) — cobre os 18 glifos deste pack;
- `pillar|column_*` → `prop` sólido + `landmark/cover` (marco vertical que também
  vira pedestal quando leva um `cap` em cima).

### Mecânicas anotadas (o que cada obstáculo FAZ)

Os 11 `obstacle_N` são o miolo de gameplay do pack, e o nome não diz nada. A
semântica ficou **no `kit.json`** (campos `mechanic`/`note`/`altUse`, ADR-0053),
que sobrevive a reprocessar o kit — mapeada nos scripts que o teste4 já tem:

| Peça | O que é | Mecânica |
|------|---------|----------|
| `obstacle_1` | bloco de gelo pendurado | `Pendulo` (+ `Perigo`) |
| `obstacle_2` | bloco de gelo na ponta de um braço | `MarteloGiratorio` |
| `obstacle_3` | barra horizontal | `MarteloGiratorio` |
| `obstacle_4` | cruz de 4 pás | `MarteloGiratorio`, mais lenta |
| `obstacle_5` | painel num trilho | `ParedeDeslizante` (nó filho `obstacle_5_002`) |
| `obstacle_6` | porta giratória | `PlataformaGiratoria` **sólida** — empurra, não mata |
| `obstacle_7`, `obstacle_8` | disco de pedra rachado | plataforma; `crumbling` PENDENTE |
| `obstacle_9` | disco de pedra liso | plataforma "segura" do trio |
| `obstacle_10` | esfera de pedra | `BolaRolante` |
| `obstacle_11` | fosso com fogo | `Perigo` estático |
| `fire_001/002` | braseiro / fogueira | `Perigo` + farol de orientação |

**O movimento não mata**: `Pendulo`/`Patrulha` só movem; quem torna o contato
letal é o `Perigo`. As notas do kit dizem isso peça a peça, porque é o erro
fácil de cometer ao montar a fase.

### Três correções que só a montagem revelou

A primeira leitura destas peças (feita pela thumbnail) errou em três, e a fase do
mundo extra (spec 0026 do teste4) corrigiu **medindo a malha**. O `kit.json` foi
regerado com a versão certa:

1. **`obstacle_2` não é pêndulo.** A origem está na base e a massa em +X: a peça
   varre na HORIZONTAL em torno do próprio eixo. Pendurada como pêndulo, ela
   giraria em torno de um ponto que não existe no modelo.
2. **`obstacle_3/4` não podem ser `Orbita` + `Perigo`.** O gatilho do `Perigo`
   fica no EIXO, parado, enquanto a pá varre longe dali — o jogador morreria no
   centro e atravessaria a ponta. Quem leva o acerto junto com a peça é o
   `MarteloGiratorio`.
3. **`obstacle_10` não pode ser `Patrulha`.** Ela só translada, e uma esfera que
   desliza sem girar lê como bug ("peça com papel de gameplay visualmente parada
   está errada"). O `BolaRolante` deduz o giro do deslocamento.

E uma anatomia que não se vê na thumbnail: **`obstacle_5` são duas partes** —
trilho parado (raiz) e painel filho `obstacle_5_002`, que é o que anima. Sem
apontar o nó filho, o script não acha o painel e a peça fica parada. Mesma
anatomia do `obstacle_7` do kit aquapark.

**Lição de método:** classificar por thumbnail acerta o QUE a peça é; só animar a
peça no jogo prova COMO ela se move. A semântica do kit merece uma segunda
passada depois da primeira fase montada com ele.

### Extras que vão junto

- **`assets/Sky_underworld.png`** — o skybox do pack, equiretangular, pra fase
  usar como `skybox` (mesmo caminho do Mundo 3 com a nebulosa).
- **`kits/_stage/underworld/demo-map.glb`** — o mapa-demo **montado** do pack.
  Não é asset de jogo: é referência de COMPOSIÇÃO (como as peças encaixam entre
  si), e é o insumo da skill `fase-por-trechos` se a fase for fatiada dele.

## Consequências

- O mundo extra do teste4 tem vocabulário próprio, distinto dos quatro mundos:
  ruína de pedra em vez de ilha/doce/espaço/inflável.
- **11 mecânicas mapeadas em scripts existentes** — a fase não precisa de código
  novo, exceto se a plataforma que desmorona (`crumbling`) virar mecânica de
  verdade; hoje `obstacle_7/8` entram como plataforma normal e a rachadura é só
  leitura visual.
- O `classify()` ganhou o tema ruínas/templo e classifica sozinho glifos e
  pilares em qualquer pack futuro do mesmo gênero.
- `_stage/underworld` fica no repo (contact sheets, overrides, `make-sheet.mjs`,
  mapa-demo) — é o que permite reprocessar o kit sem refazer a leitura visual.
