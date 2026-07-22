---
name: blueprint-fase
description: Gera uma IMAGEM final de blueprint de fase a partir de um kit curado do engine — um nível-exemplo com as peças posicionadas (thumbnails reais), zonas/passos, caminho do jogador e legenda com o NOME DE ARQUIVO EXATO de cada peça, pra passar pra um dev implementar. Use quando o usuário pedir um blueprint, planta, mapa-exemplo, layout de referência ou "level design em imagem" de uma fase montada com um kit (platformer-space, platformer-base, etc.). Camada de comunicação — combine com level-design-plataforma (critérios de design) e montar-jogo (construção real na engine).
---

# Blueprint de fase → imagem pra dev

Transforma um kit curado (`kit.json` + thumbnails) numa **imagem de blueprint**: um
nível-exemplo com as peças posicionadas, zonas, caminho do jogador e uma legenda onde
cada peça aparece com o **nome de arquivo exato** (`trampoline_1_001`, não "trampolim").
O entregável é um **PNG** — não um HTML — pronto pra um dev implementar a fase na engine.

> Não é o mapa jogável (isso é a `montar-jogo`), nem os critérios de design (isso é a
> `level-design-plataforma`). É a **planta visual** que comunica a intenção: o que vai
> onde, com que nome, em que ordem o jogador percorre.

## Divisão de trabalho (por que dois passos)

Igual ao `gen-kit`: **a IA faz o design** (posiciona as peças, define zonas e passos
num `blueprint.json`) e **o script faz a renderização determinística**. O script embute
as thumbnails em base64 (imagem self-contained), deriva a cor de cada peça do `role`/
`tags` do `kit.json`, calcula o tamanho pelo bbox real e escreve a legenda com o nome
do arquivo. Você cuida da criatividade; o visual sai consistente e correto sozinho.

## Fluxo (4 passos)

### 1. Inventariar o kit
Leia o `kit.json` do kit escolhido (`kits/<nome>/kit.json` na engine, ou o kit curado
na biblioteca do usuário). Você precisa dos nomes de arquivo exatos, `role`, `tags` e
`size` de cada asset. Opcional: monte um contact-sheet das thumbnails (`magick montage`)
pra escolher as peças com intenção — sobretudo em kits de naming não-descritivo
(`obstacle_7_001`).

### 2. Projetar o layout → `blueprint.json`
Aplique os critérios da **`level-design-plataforma`** (arco de tensão, ritmo, respiros,
clímax) e escreva o `blueprint.json` (schema abaixo). Regras de ouro:
- **`asset` = nome exato SEM `.glb`** (`coin_001`). É a chave do kit e vira a legenda.
- **Posições em px** no `canvas` (origem no topo-esquerdo; y cresce pra baixo).
- **Não sobreponha peças** — cada uma tem um label embaixo (~2 linhas). Deixe respiro;
  o script avisa asset fora do kit / sem thumbnail, mas não resolve colisão de label.
- **Top-down**: use `zones` (retângulos rotulados) pra marcar as áreas; o `pathD`
  serpenteia entre elas. **Side-scroller**: dispense zonas, ponha o chão embaixo e um
  `pathD` com arcos de pulo (comandos `Q`).

### 3. Renderizar → HTML → **PNG** (o entregável)
```bash
KIT=d:/@buuhvprojects/js-game-engine/kits/platformer-space
node scripts/render_blueprint.mjs blueprint.json "$KIT" /tmp/bp.html
node scripts/shot.mjs /tmp/bp.html <SAÍDA-ABSOLUTA>.png     # rasteriza com Chrome/Edge
```
`render_blueprint.mjs` gera o HTML self-contained (também serve de Artifact, se o
usuário quiser interativo). `shot.mjs` acha o Chrome/Edge sozinho e rasteriza no
tamanho exato (a altura vem carimbada no HTML). Passe `<largura> <escala>` opcionais
(ex.: `1840 2` pra 2×, nítido). **Use caminho absoluto na saída** por garantia.

### 4. Validar a imagem
`Read` o PNG e confira: labels legíveis e sem sobreposição, caminho passando pelas
peças certas, badges (START/FIM/OBJETIVO) no lugar, legenda de cores coerente. Ajuste
posições no `blueprint.json` e re-renderize até ficar limpo (foi o loop do exemplo).

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
    { "asset": "coin_001", "x": 250, "y": 760, "note": "moeda" },
    { "asset": "obstacle_6_001", "x": 680, "y": 250, "note": "rolo" },
    { "asset": "rocket_001", "x": 150, "y": 800, "note": "spawn",
      "flag": "START", "flagColor": "#7ee081" },
    { "asset": "planet_001", "x": 220, "y": 210, "scale": 0.9 }  // decor de fundo
  ]
}
```

Campos por peça: `asset` (obrigatório), `x`/`y` (centro, px), `note` (rótulo pt
opcional, abaixo do nome), `scale` (multiplica o tamanho auto), `px` (largura fixa,
ignora o bbox), `flag`+`flagColor` (badge START/FIM/OBJETIVO), `category` (força a
cor/categoria, senão deriva do kit). `kind` da zona = uma das categorias abaixo.

## Categorias / cores (derivadas do kit.json)

O script mapeia `role`/`tags` → categoria (cor da legenda), então você **não** precisa
colorir à mão:

| categoria | cor | vem de |
|---|---|---|
| `collectible` | amarelo | `role: collectible` |
| `hazard` | vermelho (com ✕) | `role: hazard` |
| `mechanism` | roxo | `role: platform` / `connector` |
| `objective` | ciano | tags `key`/`goal`/`checkpoint`/`trophy`/`gate` |
| `terrain` | azul | `role: ground` |
| `decoration` | cinza | `role: decoration` / `prop` genérico |

Ajuste o mapa `CATS`/`categoryOf()` em `render_blueprint.mjs` se um kit novo trouxer
um role/tag que mereça categoria própria (mantenha kit-independente).

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

## Exemplo

`blueprint.example.json` + `blueprint.example.png` — fase top-down "Estação Órbita"
com o kit `platformer-space` (5 zonas, 42 peças, caminho 1→5). É a referência viva do
formato; abra a imagem pra ver o alvo visual.
