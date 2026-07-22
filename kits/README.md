# kits/ — kits de assets do engine (ADR-0053)

Kits de assets **prontos e curados**, empacotados na IDE (extraResources →
`<resourceBase>/kits/`) e oferecidos ao Chat IA pelas tools `list_kits` /
`import_kit`. Cada kit é um vocabulário do design system: `kit.json` (role / tags /
gameplayRole / size / collider / anchors / thumb) + os assets + thumbnails.

## Layout de um kit

```
kits/<nome>/
├── kit.json            # vocabulário (chaves = assets/<arquivo>)
├── assets/             # .glb (ou .jpg de backdrop) [+ .png de textura compartilhada externa]
└── thumbnails/         # 1 PNG por asset (referência visual; backdrops usam a própria imagem)
```

## Kits atuais

| Kit | Conteúdo |
|---|---|
| `platformer-base` | Kenney platformer: blocos modulares (grass/snow), plataformas, hazards, coletáveis, ladders |
| `platformer-quaternius` | Quaternius Ultimate Platformer: completo, com player+enemies animados |
| `platformer-space` | Platformer_11_Space: tema espacial — 6 ilhas flutuantes, plataformas (discos/esteira/painel solar/trampolins), hazards (espinhos/rolos/pêndulo/bomba), coletáveis, foguetes/satélites/UFOs, planetas e meteoros de fundo. Atlas externo compartilhado `Textures1.png` |
| `survival-base` | Kenney survival: natureza, recursos, caixas, fogueira, tenda, ferramentas |
| `stylized-fantasy-base` | Quaternius natureza + Kenney recursos: floresta, pedras, metais, madeiras, barris |
| `terrain-hex` | Tiles hexagonais (terreno/rio/água/estrada) |
| `characters-base` | KayKit Adventurers: 6 heróis + armas/escudos |
| `enemies-base` | KayKit Skeletons: inimigos + armas |
| `backgrounds-base` | 45 backdrops 2D por tema (role `background`, parallax) |
| `characters-cute` | Personagem modular (SPEC-0068): `rig.glb` (44 bones, sem clips) + 378 peças skinnadas (16 corpos, 59 chapéus, 56 casacos, 51 costumes, cabelos, rostos/emoções…) compostas via `loadModularCharacter`; atlas externo compartilhado `Textures_4.png` |
| `kit-smallburg-village` | Sprites 2D top-down (village): 3 bodies + 9 premades animados (idle/walk/run × 4 direções, anims `<anim>_<dir>`) + 42 estáticos de cenário (commerce/housing/tileset) |

## Como adicionar/atualizar um kit

Use a skill `process-asset-kit` (pack 3D bruto → kit curado). Pra **sprites 2D**
(personagens pixel art, tilesets) use `process-asset-kit-2d`. Pra backdrops 2D,
`gen-backgrounds.mjs`. Os kits são **commitados no git** (binários ~100MB — decisão
de versionar tudo junto, reprodutível no clone).

> Animações: os meshes Quaternius já embutem clipes; KayKit usa um rig compartilhado
> (`Rig_Medium`) com a lib de animações à parte (não vem no mesh).
