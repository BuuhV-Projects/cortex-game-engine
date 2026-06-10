---
name: process-asset-kit-2d
description: Processa um pack de sprites 2D (PNG) num kit curado do engine — empacota animações numa folha por personagem e gera kit.json com framedata (grade + animações). Use quando o usuário pedir para adicionar/importar/processar um pack de SPRITES 2D, personagens pixel art, spritesheets, ou trazer assets 2D pra dentro do engine. Para modelos 3D (.glb), use a skill process-asset-kit (Blender).
---

# Processar pack de sprites 2D → kit curado (sprite + kit.json)

Transforma um pack de **personagens 2D** (cada um com strips de animação em PNG —
`<char>_idle.png`, `<char>_run.png`, `<char>_walk.png`, …) num **kit do engine**:
uma **folha por personagem** (frames em fila) + um **`kit.json`** com a framedata
`sprite` (frameWidth/height + animations + initial). O engine instancia via o **nó
`sprite`** (ADR-0057): o nó referencia a `url` e herda a grade/animações do kit.

**Sem Blender** — é tudo raster. Os scripts usam só `zlib` do Node (codec PNG mínimo
em `scripts/png.mjs`, RGBA8 sem interlace). Não há bbox/escala/conversão como no 3D.

> Para kits **3D** (`.glb`, Kenney/Quaternius) use a skill **`process-asset-kit`**
> (pipeline Blender). Esta é só pra **2D/sprites**.

## Fluxo

### Fase 0 — Inventário
Veja a estrutura (1 subpasta por personagem; cada uma com os strips) e o formato:
```bash
ls "$SRC"                      # subpastas = personagens
node -e 'const fs=require("fs");const b=fs.readFileSync(process.argv[1]);console.log(b.readUInt32BE(16)+"x"+b.readUInt32BE(20),"bit"+b[24],"color"+b[25])' "<algum>.png"
```
O codec cobre **RGBA8 (color 6) não-interlaçado**. Outros formatos → converta antes.

### Fase 1 — Entender a grade dos strips
Dois formatos comuns:
- **TIRA simples (1 linha):** frames em fila; largura = N × frameWidth. O packer
  infere o frame pelo **MDC** das larguras (idle 1 frame = frameWidth).
- **GRADE top-down (N linhas = direções):** ex.: Smallburg — cada strip é 64×64
  por frame, **4 linhas = 4 direções** (frente/esq/dir/costas), colunas = frames.
  Descubra o tamanho do frame pelas **faixas de alpha** (colunas/linhas vazias =
  gutters entre frames). Pra um jogo 2.5D, use a **linha de frente** (row 0).

```bash
# Detecta faixas com conteúdo (gutters) em X e Y de um strip:
node scripts/inspect-grid.mjs "<char>/<anim>.png"   # (ou use o snippet do README)
```

### Fase 2 — Empacotar + gerar kit.json (`scripts/pack-2d-kit.mjs`)
Uma folha por personagem (frames em fila), `kit.json` com `sprite` framedata,
thumbnails (frame 0).
```bash
# TIRA simples (infere frame pelo MDC):
node scripts/pack-2d-kit.mjs "$SRC" "kits/<nome>" <nome> <tema>
# GRADE top-down (frame quadrado de Npx, extrai a linha `row`; 0 = frente):
node scripts/pack-2d-kit.mjs "$SRC" "kits/<nome>" <nome> <tema> 64 0
```
- `role: character`, `tags: [<tema>, "2d", "character"]`, `initial: idle`.
- fps default por nome (idle 6, walk 8, run 12, …) — ajuste no `kit.json` depois.
- Personagens cujos strips não casam com a grade são **pulados** (avisa no log).

### Fase 3 — Validar
```bash
# kit.json passa no schema do engine?
node -e 'import("./dist/src/scene/Kit.js").then(({parseKit})=>console.log(parseKit(require("./kits/<nome>/kit.json"))?"VÁLIDO":"INVÁLIDO"))'
# Olhe uma folha (deve ser uma fila de frames de UMA direção) e um thumbnail.
```

## Consumir no engine

Nó `sprite` referenciando a `url` do kit — herda frameWidth/height + animations:
```jsonc
{ "type": "sprite", "id": "hero", "url": "assets/kit-smallburg-village/character_premade_01.png",
  "transform": { "position": [0, 1.5, 0] } }
```
Passe o `kit.json` ao `buildScene({ kit })` (igual aos kits 3D). O `SpriteAnimationSystem`
é ligado sob demanda; troque a animação em runtime via o componente (`play('walk')`).
Importar pro projeto: copiar `kits/<nome>/assets/*` pra `assets/<nome>/` + o `kit.json`.

## Convenções / gotchas

- **RGBA8 sem interlace** — o codec não cobre palette/grayscale/interlace; converta antes.
- **Strips top-down** = N direções: extraia 1 direção (row) por kit; o engine usa
  **1 tamanho de frame por folha** (não dá pra misturar direções de tamanhos diferentes).
- **Frame quadrado** no modo grade (`frameSize`); pro modo tira, frames podem ser
  retangulares (idle 128×256 etc.).
- **`theme: "TBD"`** se a paleta/atmosfera ainda não foi definida.
- O codec (`png.mjs`) e o packer ficam pra **reuso** — não apague.

## Exemplo (Smallburg Village, jun/2026)
`premades/` (10 personagens, cada um idle/run/walk top-down 4-direções 64×64) →
`kits/kit-smallburg-village/` (10 folhas frontais 768×64, 12 frames cada:
idle[0,1]/walk[2–7]/run[8–11]) + `kit.json`. Comando: `pack-2d-kit.mjs … village 64 0`.
