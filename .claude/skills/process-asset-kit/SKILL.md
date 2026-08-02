---
name: process-asset-kit
description: Processa um kit de assets 3D bruto (baixado) num kit curado, slim em .glb, com kit.json de vocabulário (design system do engine, ADR-0053). Use quando o usuário pedir para adicionar/importar/processar um pack ou kit de modelos 3D, converter gltf/fbx para glb, mapear o vocabulário de um kit, ou trazer um kit de modelos 3D pra dentro do engine. Para SPRITES 2D / pixel art (PNG), use a skill process-asset-kit-2d.
---

# Processar kit de assets → kit curado + vocabulário (ADR-0053)

Transforma um pack 3D bruto (geralmente Kenney/Quaternius, com `.gltf`+`.fbx`+`.obj`
triplicados e modelos que não servem) num **kit curado**: só os `.glb` que importam,
leves, + um **`kit.json`** que tagueia cada asset no vocabulário do design system
(`role`/`tags`/`gameplayRole` + `size` + collider + âncoras). Esse é o "shadcn" da
IA level-designer — ver `docs/adrs/0053-design-system-de-assets-kit-semantico-sockets-temas.md`.

**Pré-requisito:** Blender instalado. O caminho costuma estar em `BLENDER_PATH`
(ex.: `C:\Program Files\Blender Foundation\Blender 5.1\blender.exe`). Use o exe
nativo com caminhos Windows (`D:/...`), não git-bash (`/d/...`). **Sem Blender na
máquina, pare e diga isso ao usuário** — quase todo o fluxo depende dele.

## Onde ficam os scripts e onde vai o kit

```bash
PLUGIN="${CORTEX_PLUGIN_DIR:-.claude}"
PK="$PLUGIN/skills/process-asset-kit/scripts"   # triage.sh, convert.py, gen-kit.mjs, lineup.py…
```

São **template** — ajuste as regras de triagem/classificação ao naming do kit em mãos.

**Destino do kit curado** depende de onde você está:

- **Repositório da engine** (Claude Code): `kits/<nome>/` — entra no catálogo
  empacotado, disponível a todos os projetos.
- **Chat IA do Studio**: o catálogo empacotado é somente-leitura. O kit curado vai
  para **`assets/<nome>/` do projeto aberto**, e é só ele que a cena consome. Para
  trazer um kit que JÁ está no catálogo, não processe nada: use `list_kits` +
  `import_kit { kit, only: [...] }`.

## Fluxo (5 fases)

### Fase 0 — Inventário
Liste os `.gltf` por subpasta e conte por extensão. Os nomes costumam ser
auto-descritivos (Kenney/Quaternius) → dá pra triar com alta confiança sem render.
```bash
find "$SRC" -iname '*.gltf' -exec basename {} .gltf \; | sort
find "$SRC" -type f | sed 's/.*\.//' | tr A-Z a-z | sort | uniq -c | sort -rn
```
Verifique se os `.gltf` são self-contained (procuram `.bin` + textura ao lado) —
o `convert.py` precisa deles juntos.

### Fase 1 — Triagem (`triage.sh`)
**Filosofia do kit base:** natureza/terreno/recursos — floresta, rios, terreno,
pedras, baús/caixas, ouros/metais, madeiras, barris, sacos. **FORA:** construções
(casa, castelo, igreja, torre, muralha, moinho), veículos, militar/facção (flags,
weaponrack, projéteis), moderno/industrial (jerrycan, peças de máquina).
**Tiles hexagonais/top-down** (`hex_*`) → **kit próprio** (`terrain-hex`), porque é
uma gramática modular diferente do scatter (ADR-0053: decidido com o usuário).
```bash
bash "$PK/triage.sh" "$SRC" "$BASE_DST/assets" "$HEX_DST/assets" "$STAGE"
```
**Sempre revise a amostra de removidos impressa** e ajuste `is_removed`/`is_hex` no
script pro naming do kit. Confirme as chamadas-limite (militar, decoração de facção)
com o usuário se houver dúvida.

### Fase 2 — Conversão slim (`convert.py`, Blender)
Importa cada `.gltf` mantido → exporta `.glb` (embute bin+textura) e **captura o
bbox** em eixos Y-up do three (Blender Z→altura, Y→profundidade). Dropar fbx/obj +
buildings tipicamente corta ~90MB → poucos MB.
```bash
"$BLENDER" -b -P "$PK/convert.py" -- "$STAGE/convert_list.txt" "$STAGE/sizes.json"
```
Saída: os `.glb` nas pastas destino + `sizes.json` (`{ sizes, errors }`). Confira
`err=0` e o peso (`du -sh`).

**Pack que já vem em `.glb`** (Synty/Platformer_*): pule a conversão e rode
`measure.py` — só mede (preserva o glb original) e emite `sizes.json` com `sizes` +
`bounds` (`[minX,minY,minZ,maxX,maxY,maxZ]` Y-up). Se as texturas vierem embutidas,
rode `externalize-texture.mjs` ANTES de medir: packs costumam repetir o mesmo atlas
em cada peça (no Platformer_11_Space, `Textures1.png` estava embutido 83× → 27MB
viraram 6,8MB). O script deriva o nome da textura do `image.name` do glTF — se o
nome já tiver extensão, sai `x.png.png`; renomeie e conserte as `uri`.

### Fase 3 — Escala: verificar + normalizar (`lineup.py` + `normalize.py`)
**Gotcha nº1.** Packs de origens diferentes vêm em unidades diferentes (ex.: Quaternius
natureza ~4u/árvore vs Kenney medieval ~0.2u/barril). Resolva ANTES do kit.json — a
jumpability depende de unidade consistente.
```bash
# contact-sheet (1 rep/família) + cubo-referência de player 1.8u → expõe a escala
"$BLENDER" -b -P "$PK/lineup.py" -- "$STAGE/sizes.json" "$STAGE/lineup.png" "$BASE_DST/assets" "$HEX_DST/assets"
```
Leia o PNG. Costumam ser **2 grupos** (não N): ache o fator olhando um asset que existe
nos dois packs (ex.: o barril). Para o grupo subdimensionado, baking do fator no `.glb`:
```bash
# rescale_list.txt = um caminho .glb por linha (só os do grupo a escalar)
"$BLENDER" -b -P "$PK/normalize.py" -- 4.8 "$STAGE/rescale_list.txt"
```
Depois **atualize os sizes** (escala uniforme = bbox × fator; multiplique os nomes
escalados no `sizes.json` → `sizes_scaled.json`) e re-renderize o lineup pra confirmar.
Confirme o fator com o usuário antes de cravar.

### Fase 4 — Thumbnails por asset (`thumbnails.py`, Blender)
1 PNG (vista 3/4, fundo transparente) por asset em `<kit>/thumbnails/<name>.png` —
referência pro dev e pra IA, e cache do futuro `inspect_assets`.
```bash
"$BLENDER" -b -P "$PK/thumbnails.py" -- 256 "$BASE/thumbnails" "$BASE/assets" "$HEX/thumbnails" "$HEX/assets"
```

### Fase 5 — kit.json / vocabulário (`gen-kit.mjs`) — POR ÚLTIMO
Com a escala já normalizada, classifica cada asset nos **3 eixos ortogonais**
(ADR-0053 §6) e escreve `kit.json` (com `size`, `thumb`, collider e âncoras).
```bash
node "$PK/gen-kit.mjs" "$STAGE/sizes_scaled.json" "$BASE" "$HEX"
# naming não-descritivo (obstacle_7_001…): classifique a olho nas thumbnails e
# passe um mapa { nome: { role, tags, gameplayRole?, solid?, shape? } } que vence
# o classify() — assim o classify() continua kit-independente.
node "$PK/gen-kit.mjs" "$STAGE/sizes.json" "$KIT" --overrides "$STAGE/overrides.json" --theme deathrun
```
`--theme` grava o tema no `kit.json` (default `TBD`) — os design tokens (paleta/
atmosfera, ADR-0053 §3) continuam pra depois, mas o nome do tema já vale a pena.
A função `classify()` **é** o vocabulário canônico — mantenha-a kit-independente e
expanda conforme novos tipos surgem. Eixos:
- **`role`** (natureza física, enum): `ground | platform | connector | prop | hazard | collectible | decoration | cap | tile | player-start`.
- **`tags`** (tema/bioma + size-class): `forest`, `rock`, `metal`, `water`, `S/M/L`, …
- **`gameplayRole`** (função de design): `guidance | reward | challenge | safe-zone | landmark | cover | resource | path | hazard`.

Cada asset ganha `size`, `thumb` (`thumbnails/<name>.png`), `collider` preset (quando
sólido) e âncora `top` (e `edge_left/right` em peças que encaixam lado a lado, ex. cercas).

## Destino na engine

O destino oficial é **`kits/<nome>/`** no repo do engine (`assets/`, `thumbnails/`,
`kit.json` — e `scripts/` quando o kit traz mecânicas). Nada a registrar em lista
nenhuma: o `electron-builder.json` empacota `kits/` inteira (`{ from: "kits" }`) e o
Chat IA descobre por varredura de diretório (`list_kits`/`import_kit` em
`electron/agent/tools/kits.ts`). Ao consumir num projeto, `import_kit` copia pro
`assets/` do projeto; re-vendorizar conforme ADR-0009.

**Teste de integridade:** `tests/scene/kitsRepo.test.ts` roda sobre TODOS os kits de
`kits/` — schema (`parseKit`), `name` = nome da pasta, `.glb`/thumb existindo em disco,
`role`/`gameplayRole` dentro do vocabulário canônico e bbox positivo. Rode
`yarn vitest run tests/scene/kitsRepo.test.ts` antes de dar um kit por pronto; se
adicionar um `role` novo ao vocabulário, atualize as constantes do teste junto.

## Pack de personagem modular (esqueleto compartilhado, SPEC-0068)

Packs tipo "character creator" (1 showroom `.glb` com TODAS as peças skinnadas num
esqueleto único + cópias estáticas soltas) NÃO passam pela triagem/convert comum.
Fluxo próprio (validado no `characters-cute`, jul/2026):

1. **Diagnóstico**: ler o header do GLB — se as peças separadas têm `skins=0` e o
   showroom tem 1 armature com centenas de filhos skinnados, a fonte é o **showroom**
   (as separadas perderam o skin; re-skinnar por transfer é lossy — não faça).
2. **`extract-modular.py`** (Blender headless): exporta `rig.glb` (esqueleto puro,
   0 meshes) + um `.glb` por peça (esqueleto em bind pose + 1 mesh skinnado, sem
   clips — formato exato do `composeModularCharacter`). Exclui `Test_*`. Emite
   `sizes.json` no formato do convert.py.
   ```bash
   "$BLENDER" -b -P "$PK/extract-modular.py" -- <showroom.glb> <kit>/assets <stage>/sizes.json
   ```
3. **`externalize-texture.mjs`** (node): peças de um mesmo pack compartilham 1 atlas;
   embutido em cada `.glb` o kit explode (ex.: 172MB). O script extrai o atlas UMA
   vez pra `assets/<nome>.png`, reescreve cada GLB pra `uri` externa e reconstrói o
   BIN sem a imagem (172MB → 23MB no characters-cute). O loader do engine resolve
   uri relativa — mas **copiar a textura junto** ao vendorizar (gotcha da montar-jogo).
   ```bash
   node "$PK/externalize-texture.mjs" <kit>/assets
   ```
4. Thumbnails + gen-kit normais (fases 4–5). Vocabulário: peças viram role
   **`character-part`** com `tags = [slot, ...]` (body/hair/hat/outfit/face/…),
   esqueleto vira role **`rig`** — ambos SEM âncoras/collider (não são posicionados
   na cena; são compostos em runtime via `loadModularCharacter`).

## Backdrops 2D (background)

Imagens de fundo (jpg/png, por tema) NÃO passam pelo pipeline glb (sem bbox/conversão).
Use **`gen-backgrounds.mjs <pasta>`** — cataloga num `kit.json` com `role:
background` + tags do tema (de `background_<tema>_<n>`), `thumb` = a própria imagem.
No engine, viram um nó `background` (backdrop com parallax que segue a câmera; precisa
de `camera` no `buildScene`).
```bash
node "$PK/gen-backgrounds.mjs" "D:/jogos/assets/backgrounds" backgrounds-base
```

## Convenções / gotchas

- **Só gltf/glb** — o engine não usa fbx/obj; sempre dropar (é o grosso do peso).
- **Hex/top-down em kit separado** — não misturar gramática hex com scatter.
- **bbox em Y-up** — `convert.py` já converte Blender Z-up→three Y-up (`[x, z, y]`).
- **Origem do modelo ≠ base** — não presuma pé na origem: no Platformer_11_Space, 62
  de 87 assets tinham origem fora da base, e as ilhas `land_*` têm origem no **topo**
  (superfície de andar em y=0). Por isso `gen-kit.mjs` tira a âncora `top` dos
  `bounds` do `measure.py`, não de `size`. Com `convert.py` (sem `bounds`) ele cai no
  fallback `[0, h, 0]` — confira as âncoras antes de confiar em `attach`.
- **Peça MODULAR de encaixe exige pivô CENTRAL em X/Z** (SPEC-0162; decisão do
  usuário na saga do platformer-obstacles): packs entregam peças de pista com o
  pivô na ARESTA de encaixe, e pivô excêntrico quebra a UX inteira do editor —
  caixa de seleção/collider deslocados meia-peça ("uma plataforma dentro da
  outra"), pivôs de peças vizinhas coincidindo nas juntas, Inspector confuso.
  Detecte no `measure`/bounds (bbox todo de um lado do origin, ex. `z[−prof, 0]`)
  e RECENTRE a geometria como etapa do pipeline — modelo pronto:
  `_stage/obstacles/recenter-pivots.mjs` (translada POSITION + min/max direto no
  BIN do glb, sem Blender) + âncoras do kit.json com `at[2] = 0`. O consumo passa
  a posicionar pelo CENTRO da peça.
- **Validar contra o engine** — o `kit.json` tem schema zod real
  (`parseKit` em `src/scene/Kit.ts`); rode `npx tsx` com um `parseKit(...)` no
  arquivo gerado antes de dar o kit por pronto. `shape` só aceita
  `box|circle|capsule|heightfield`.
- **`lineup.py` quebra com assets de escala-cenário** — 1 asset de 150u (skybox,
  planeta, campo de meteoros) achata todo o resto em pixels ilegíveis. Rode o lineup
  só com os assets de gameplay, ou valide a escala por número: meça um asset que
  exista também num kit já em produção e compare (mais forte que o render).
- **Escala por-pack** — verificar no lineup antes de declarar o kit pronto.
- **Manter todas as variantes** (A–Z) — dão variedade real pro scatter; o custo é só
  nº de linhas no kit.json (auto-gerado). (Decisão do usuário; reconfirme se mudar.)
- **`theme: "TBD"`** no kit.json — os design tokens (paleta/atmosfera, ADR-0053 §3)
  são definidos depois; deixe o placeholder e avise.
- **Caminhos Windows** pro Blender nativo; `triage.sh` já converte `/d/`→`D:/`.
- O `_stage/` (working dir) e os scripts ficam pra **reuso** — não apague.

## Exemplo (corrida real, jun/2026)

Kit `platformer-space` (jul/2026): pack Platformer_11_Space, 87 glb já prontos → só
externalizar atlas (27MB→6,8MB), `measure.py`, thumbnails e `gen-kit.mjs` com
`--overrides` pros 19 `obstacle_N`. Sem triagem (pack coeso) e sem normalizar escala
(já batia com o kit Deathrun). Em `D:/jogos/assets/3d-models/kits/platformer-space`.

Kit `platformer-deathrun` (jul/2026): pack Platformer_Deathrun, 103 glb prontos →
externalizar atlas (**58MB→8,6MB**; `rope_1.png` de 4,2MB estava embutido em 6 peças),
`measure.py`, thumbnails e `gen-kit.mjs --overrides --theme deathrun`. Sem triagem nem
normalização (escala já batia: `box_001` = 1u³, `ladder_001` = 2u). Em
`kits/platformer-deathrun`. **Método pra classificar naming opaco**: contact sheet
rotulado das thumbnails (`_stage/sheet.py`, 7×5 por página) + as **imagens de divulgação
do pack** (`images/*.webp`) — a overview do mapa mostra as peças EM USO e desfaz o que a
thumbnail isolada não resolve (ali as "chevron platforms" com barra amarela se revelaram
plataformas móveis sobre a água, não rampas).

Kit `stylized-fantasy` (forest + general-bits + medieval, 402 gltf, 90MB) →
`stylized-fantasy-base` (238 glb, 14MB) + `terrain-hex` (60 glb, 1.6MB), ambos com
`kit.json`. Removidos: 81 `building_*`, walls, militar, jerrycans, peças. O lineup
revelou medieval/general-bits ~3–5× menores que forest/hex (escala a normalizar).
