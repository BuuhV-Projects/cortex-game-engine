---
name: blueprint-fase
description: Gera uma IMAGEM final de blueprint de fase a partir de um kit curado do engine — um nível-exemplo com as peças posicionadas (thumbnails reais), zonas/passos, caminho do jogador e legenda com o NOME DE ARQUIVO EXATO de cada peça, pra passar pra um dev implementar. Use quando o usuário pedir um blueprint, planta, mapa-exemplo, layout de referência ou "level design em imagem" de uma fase montada com um kit (platformer-space, platformer-base, etc.). Camada de comunicação — combine com level-design-plataforma (critérios de design) e montar-jogo (construção real na engine).
---

# Blueprint de fase → imagem pra dev

Transforma um kit curado (`kit.json` + thumbnails) numa **imagem de blueprint**: um
nível-exemplo com as peças posicionadas, zonas, caminho do jogador e uma legenda onde
cada peça aparece com o **nome de arquivo exato** (`trampoline_1_001`, não "trampolim")
**e o COMPORTAMENTO de gameplay** que ela carrega (script + params). O entregável é um
**PNG** — não um HTML — pronto pra um dev implementar a fase na engine **1:1**.

> Não é o mapa jogável (isso é a `montar-jogo`), nem os critérios de design (isso é a
> `level-design-plataforma`). É a **spec visual de gameplay** que comunica a intenção:
> o que vai onde, com que nome, **qual o propósito funcional de cada peça**, em que
> ordem o jogador percorre.

## Onde ficam os scripts e os kits

Esta skill roda em dois lugares: no repositório da engine (Claude Code) e dentro do
**Chat IA do TS Cortex Studio**, onde o diretório de trabalho é o projeto do jogo.
Resolva os caminhos por variável, com fallback pro layout do repositório:

```bash
PLUGIN="${CORTEX_PLUGIN_DIR:-.claude}"   # raiz do plugin (contém skills/)
KITS="${CORTEX_KITS_DIR:-kits}"          # catálogo de kits empacotados
```

> **No Studio, prefira a tool `generate_blueprint`** — ela é a mesma renderização,
> in-process, e já devolve a imagem. Os scripts abaixo são o caminho pra fora do
> Studio (ou quando você precisa do HTML intermediário).

## Princípio: cada objeto tem um PROPÓSITO (não é decoração)

O blueprint **não posiciona peças por estética**. Cada objeto na cena existe por uma
**função de gameplay** — mata, lança, salva, pontua, bloqueia, sustenta — e essa função
amarra a peça a um **script/componente real do engine** com **parâmetros**. Escolha o
asset pelo `role`/`gameplayRole`/`tags` do `kit.json` que **casa** com o comportamento
pretendido; se dois servem, escolha o de leitura mais clara. Um "pad de espinhos" é
`obstacle_10_001` (`role: hazard`, tag `spikes`) — **não** `obstacle_9_001`
(`role: platform`) só porque parece. O render **avisa** quando o asset não casa com o
comportamento de gameplay ativo declarado.

## Divisão de trabalho (por que dois passos)

Igual ao `gen-kit`: **a IA faz o design** (define o papel funcional de cada peça,
posiciona, define zonas e passos num `blueprint.json`) e **o script faz a renderização
determinística**. O script embute as thumbnails em base64 (self-contained), deriva a cor
de cada peça do **`behavior`** (ou, sem ele, do `role`/`tags`), escreve o **script +
params** de cada peça de gameplay e a legenda com o nome do arquivo. Você cuida do
design + comportamento; o visual sai consistente e correto sozinho.

## Fluxo (5 passos)

### 1. Inventariar o kit
Leia o `kit.json` do kit escolhido (`$KITS/<nome>/kit.json`; no Studio, `list_kits` +
`list_kit_assets` fazem isso sem sair da conversa, e um kit já importado no projeto
fica em `assets/<nome>/kit.json`). Você precisa dos nomes de arquivo exatos, `role`,
`gameplayRole`, `tags` e `size` de cada asset. Opcional: monte um contact-sheet das
thumbnails (`magick montage`) pra escolher as peças com intenção — sobretudo em kits de
naming não-descritivo (`obstacle_7_001`).

### 2. Definir o LOOP e o PAPEL de cada peça (antes de posicionar)
Escreva o loop em 1 frase (largada → percurso → morte/checkpoint → chegada). Depois,
pra cada peça que vai entrar, decida o **comportamento** (o que faz no jogo) e o **asset
que casa** com ele — consultando `role`/`gameplayRole`/`tags`. Use a **tabela de
comportamentos** abaixo (behavior → script do engine → role/gameplayRole → cor). Regra:
o asset é escolhido pelo PROPÓSITO, não pela beleza. Só depois disso você posiciona.

### 3. Projetar o layout → `blueprint.json`
Aplique os critérios da **`level-design-plataforma`** (arco de tensão, ritmo, respiros,
clímax) e escreva o `blueprint.json` (schema abaixo). Regras de ouro:
- **`asset` = nome exato SEM `.glb`** (`coin_001`). É a chave do kit e vira a legenda.
- **`behavior` + `script` + `params`** em toda peça de gameplay (não em decor/chão puro).
- **Posições em px** no `canvas` (origem no topo-esquerdo; y cresce pra baixo).
- **Não sobreponha peças** — peça de gameplay tem label de **até 3 linhas** (nome +
  script/params + nota); dê respiro **vertical** extra a hazards/mecanismos. O script
  avisa asset fora do kit / propósito duvidoso, mas não resolve colisão de label.
- **Top-down**: use `zones` (retângulos rotulados) pra marcar as áreas; o `pathD`
  serpenteia entre elas. **Side-scroller**: dispense zonas, ponha o chão embaixo e um
  `pathD` com arcos de pulo (comandos `Q`).

### 4. Renderizar → HTML → **PNG** (o entregável)
```bash
KIT="$KITS/platformer-space"
node "$PLUGIN/skills/blueprint-fase/scripts/render_blueprint.mjs" blueprint.json "$KIT" bp.html
node "$PLUGIN/skills/blueprint-fase/scripts/shot.mjs" bp.html <SAÍDA-ABSOLUTA>.png  # rasteriza com Chrome/Edge
```
`render_blueprint.mjs` gera o HTML self-contained (também serve de Artifact, se o
usuário quiser interativo). `shot.mjs` acha o Chrome/Edge sozinho e rasteriza no
tamanho exato (a altura vem carimbada no HTML). Passe `<largura> <escala>` opcionais
(ex.: `1840 2` pra 2×, nítido). **Use caminho absoluto na saída** por garantia.

### 5. Validar a imagem + os avisos
Primeiro leia os **avisos do render** (stderr): `propósito duvidoso` = o asset não casa
com o comportamento (troque a peça ou o behavior); `asset fora do kit`/`sem thumbnail` =
nome errado. Depois `Read` o PNG e confira: labels legíveis e sem sobreposição, cada
peça de gameplay com **script + params** corretos, caminho passando pelas peças certas,
badges (START/FIM/OBJETIVO) no lugar, legenda coerente. Ajuste e re-renderize até ficar
limpo e sem avisos (foi o loop do exemplo).

## Schema do `blueprint.json`

```jsonc
{
  "kit": "platformer-space",              // nome do kit (só rótulo no cabeçalho)
  "title": "Exemplo de Fase — Nome",      // o que vem depois do "—" fica em destaque
  "subtitleKick": "FASE 01 · TOP-DOWN",   // linha de cima, caixa-alta
  "subtitle": "Descrição pro dev…",
  "orientation": "top-down",              // "top-down" | "side-scroller" (só muda o rodapé)
  "canvas": { "w": 1840, "h": 1000 },     // px da área de composição (o "stage")
  "grid": 44,                             // espaçamento da grade de fundo
  "pxPerUnit": 7,                         // px por unidade de mundo (escala das thumbs)
  "steps": [ { "n": 1, "title": "Pouso", "desc": "…" } ],       // painel numerado (opcional)
  "zones": [ { "label": "1 · POUSO", "kind": "terrain",         // top-down (opcional)
               "x": 40, "y": 630, "w": 360, "h": 330 } ],
  "pathD": "M 150 880 Q 240 760 330 720 …",   // caminho do jogador (mini-SVG path)
  "pieces": [
    { "asset": "coin_001", "x": 250, "y": 760, "behavior": "collectible",
      "script": "Moeda", "note": "moeda" },
    { "asset": "obstacle_6_001", "x": 680, "y": 250, "behavior": "hazard-spinner",
      "script": "MarteloGiratorio", "params": { "giro": 2.0, "alcance": 2.8 }, "note": "rolo" },
    { "asset": "rocket_001", "x": 150, "y": 800, "behavior": "spawn",
      "script": "PontoInicio", "flag": "START", "flagColor": "#7ee081" },
    { "asset": "land_001", "x": 240, "y": 870, "behavior": "ground", "note": "ilha" },
    { "asset": "planet_001", "x": 220, "y": 210, "scale": 0.9, "behavior": "decoration" }
  ]
}
```

Campos por peça: `asset` (obrigatório), `x`/`y` (centro, px), **`behavior`** (papel
funcional — deriva a cor e o script sugerido; ver tabela), **`script`** (componente real
que o dev crava; default vem do behavior), **`params`** (objeto de parâmetros-chave de
gameplay, ex.: `{ "raio": 1.8 }`), `note` (rótulo pt opcional), `scale` (multiplica o
tamanho), `px` (largura fixa), `flag`+`flagColor` (badge START/FIM/OBJETIVO), `category`
(fallback legado — prefira `behavior`). `kind` da zona = uma das categorias abaixo.

## Comportamentos (behavior → script do engine → asset que casa → cor)

**É o coração do blueprint orientado a gameplay.** Declare `behavior` em toda peça; a cor
e o script saem dele. Escolha o asset cujo `role`/`gameplayRole`/`tags` casa (coluna
"asset que casa") — o render **avisa** se não casar num comportamento de gameplay ativo.
Os nomes de `script` são a convenção do teste4; um jogo pode renomear (ajuste `script`).

| `behavior` | faz | script (default) | asset que casa (role/tags) | cor |
|---|---|---|---|---|
| `spawn` | nasce o player | `PontoInicio` | qualquer marco (prop/ground) | ciano |
| `goal` | fim da fase | `Chegada` | `role:prop`+tag `goal`/`trophy` | ciano |
| `checkpoint` | salva progresso | `Checkpoint` | tag `checkpoint`/`gate` | ciano |
| `collectible` | pontua / power-up | `Moeda` | `role:collectible` | amarelo |
| `hazard` | mata ao tocar | `Perigo` | `role:hazard` | vermelho ✕ |
| `hazard-spinner` | perigo giratório | `MarteloGiratorio` | `role:hazard`+tag `rotating`/`pendulum`/`sweeper` | vermelho ✕ |
| `hazard-chaser` | perseguidor | `Drone` | tag `vehicle`/`ufo` | vermelho ✕ |
| `launcher` | lança o player | `Trampolim` | `role:platform`+tag `bounce` | roxo |
| `platform` | sustenta (fixa) | — | `role:platform`/`connector` | roxo |
| `platform-moving` | sustenta (móvel) | `Patrulha` | `role:platform`/`ground` | roxo |
| `blocker` | parede / limite | — | tag `barrier`/`boundary`/`fence` | roxo |
| `ground` | terreno / ilha base | — | `role:ground` | azul |
| `decoration` | enfeite (sem gameplay) | — | `role:decoration`/`prop` | cinza |

Sem `behavior`, a cor cai no fallback `role`/`tags` (`categoryOf()`). Ajuste os mapas
`BEHAVIORS`/`CATS` em `render_blueprint.mjs` se um kit/jogo novo trouxer comportamento
ou role que mereça entrada própria (mantenha kit-independente).

## Gotchas

- **Escala vem do bbox** (`size` do kit.json × `pxPerUnit`, clampeada 26–320px). Peças
  de fundo enormes (planetas ~22u, meteoros ~150u) ficam grandes de propósito — dão a
  leitura de escala. Se dominarem demais, use `scale`/`px` pra conter.
- **Origem no topo do modelo** (ver `process-asset-kit`): as thumbs são renderizadas
  centradas, então isso não afeta o blueprint — mas a `y` que você dá é o **centro** da
  thumb, não a base.
- **Altura do PNG é determinística**: o render carimba `<!--BP_W … BP_H …-->` e o
  `shot.mjs` corta exatamente ali (assume os `steps` numa linha só — 5 chips cabem em
  1840px; com mais, aumente o `canvas.w` ou empilhe).
- **`pathD` é literalmente um atributo SVG `d`** — `M`/`L`/`Q` (curva) dão controle
  total. Pra arcos de pulo no side-scroller, use `Q cx cy x y` com o controle acima da
  linha.
- **Caminho de saída absoluto** no `shot.mjs`: o Chrome resolve `--screenshot` pelo cwd
  dele. O script já faz `resolve()`, mas passe absoluto se chamar o Chrome direto.
- **Label de gameplay tem 3 linhas** (nome + `script params` + nota) e a linha de
  comportamento quebra em ~150px. Hazards/mecanismos vizinhos precisam de **respiro
  vertical** (não só horizontal) — senão os labels de 3 linhas se tocam. Espalhe params
  demais? Corte pros 2 mais importantes (ex.: `giro` + `alcance`).
- **Avisos são sinal, não ruído**: `propósito duvidoso` quase sempre significa que você
  pegou a peça errada pro comportamento — troque o asset, não silencie o aviso.

## Exemplo

`blueprint.example.json` + `blueprint.example.png` — fase side-scroller "Trilha pelos
Escombros" (Mundo 3 espacial) com o kit `platformer-space`: arco de altura, caminho 1→5
e **cada peça com seu comportamento** (`Perigo raio 1.8`, `Trampolim impulso 22`,
`Checkpoint`, `Moeda`, `Drone`…). É a referência viva do formato orientado a gameplay;
abra a imagem pra ver o alvo visual.
