# SPEC-0182 - Kit `portals-warp` (portais e warp room)

**Data:** 2026-08-02
**Status:** aceito

## Contexto

O teste4 vai trocar o menu 2D de seleção de fases por uma **warp room 3D** no
estilo Crash Bandicoot (portal por fase, sala por mundo). O jogo já tinha portal
— o de chegada do mundo extra (spec 0026 do jogo): moldura `passage_001` do kit
`platformer-underworld` + plasma procedural (`utils/PlasmaPortal.ts`). O que
faltava era **variedade de moldura**: uma sala por mundo pede uma silhueta por
mundo, e reusar a mesma ruína em cinco salas apagaria a identidade de cada uma.

O usuário trouxe o pack **Portal Pack — ANIO/PeachyTea** (48 FBX + 56 PNG, 99 MB).
Ele existe também em versão Unity; a versão FBX foi a escolhida depois de medir:
os FBX importam com material completo (baseColor + ORM + emissive + decals), e o
`.unitypackage` traria shaders URP/HDRP que não portam para three.js, embalados
em GUIDs — mais trabalho para o mesmo resultado.

## Decisão

Kit curado em **`kits/portals-warp/`** com 34 assets (`theme: portal`), 7,2 MB.

### Pipeline (scripts duráveis em `kits/_stage/portals/`)

O pack é FBX e o `convert.py` da skill só importa glTF; o restante do fluxo
(thumbnails, gen-kit) foi reusado sem alteração.

1. **`convert-fbx.py`** — FBX→GLB com três correções que o pack exige:
   - **religa textura perdida**: parte dos prefabs referencia o disco do AUTOR
     (`E:\Blender\Game Assets\...`, `has_data: false`). Um índice
     basename→arquivo real do pack reaponta a imagem. Sem isso,
     `futuristic_circle_*` sairia sem textura;
   - **aplica transforms**: vários prefabs vêm com escala de objeto não aplicada
     (Pool 4,14×; Mist 1,69×) — sem aplicar, o bbox medido mente;
   - **alpha**: o pack usa `blend_method HASHED`; vira `BLEND` para o glTF sair
     com `alphaMode: BLEND` (quase toda textura aqui é recorte ou energia).
2. **`externalize-texture.mjs`** (da skill) + **`downscale.mjs`** — o pack entrega
   TUDO em 2048²; externalizar deduplicou as compartilhadas (99 MB → 47 MB) e o
   downscale para 1024 fechou em **7,2 MB**, o patamar dos outros kits do repo.
3. **`make-factors.mjs` + `normalize-per-asset.py`** — ver escala, abaixo.
4. **`sheet.mjs`** — contact sheet agrupado por família com a medida embaixo de
   cada peça. Foi o que desfez a ambiguidade do naming (`pool_*` é vórtice de
   chão, não piscina) e embasou a escolha de moldura por mundo.

### Escala: alvo declarado por família, não fator único

**Gotcha nº1 do pack.** Ele não tem escala unificada: portal de 9,4 m, plataforma
de 38 m, flor de 2,8 m. Não existe um fator só (o `normalize.py` da skill aplica
um fator a uma lista, e não serve). O `make-factors.mjs` declara uma
**medida-alvo em metros por família** e deriva o fator da medida real — o número
no `factors.json` fica auditável em vez de mágico. Alvos (player = 1,8 m):

| Família | Alvo | Por quê |
|---|---|---|
| `archway_*`, `doorway_*` | 4,0 m de altura | vão de ~3 m; monumental mas humano |
| `futuristic_black/white` | 4,6 m | a silhueta da cápsula é vertical |
| `pillar_*` (anéis) | 4,2 m de diâmetro | idem |
| `stoneplatform_*` | 5,5 m de diâmetro | pedestal com pé para o player, sem virar praça |
| `pool_*` | 4,5 m | marca de chão diante do portal |
| `circle_*`, `rune_*` | 3,2 / 3,0 m | mandala de piso |
| `glare_*` | 4,0 m | billboard de brilho |
| `mist_mesh` | 5,0 m | assenta a base do portal |
| `grass_plane`, `bellflower` | 0,6 / 0,45 m | escala real de planta |

Molduras diferentes convergem para a **mesma altura de 4 m** de propósito: as
cinco salas precisam ler como um sistema só de warp, variando silhueta e cor, não
tamanho.

### Dois defeitos do pack, corrigidos

- **`Portal_Pool-Green.fbx` vem VAZIO** (0 objetos; os irmãos blue/celestial
  importam normal). Remontado por `rebuild-from-base.py` a partir da mesh-base
  (`Portal_Pool.fbx`) + `T_Pool_Green.png`. Como a mesh-base não carrega a escala
  torta que o prefab dos irmãos tinha (`scale [4.14, 2.45, 2.45]`), este é o único
  asset com fator **não-uniforme** — sem isso sairia retangular entre dois irmãos
  quase quadrados. Resultado final bate com os irmãos (4,5 × 4,25 m).
- **`futuristic_circle_*` são HORIZONTAIS** (3,5 m em profundidade, 0,86 m de
  altura). Não é rotação errada e **não foi corrigido**: é portal de CHÃO, uso
  legítimo — e é justamente o círculo de teleporte no piso da warp room. Anotado
  no `kit.json`; para usar em pé, rotacionar 90° em X.

### Vocabulário

- Moldura atravessável = **`connector`** (é passagem, não plataforma), com
  `solid: false` **de propósito**: um collider de caixa taparia justamente o vão,
  que é por onde o player entra. Parede é papel da geometria da sala.
- `stoneplatform_*` = `platform` + `solid: true` (é chão de verdade).
- Vórtices, mandalas, runas, brilhos e ambiente = `decoration`.

O `note` de cada asset registra qual mundo do teste4 ele veste e o gotcha da peça
— anotação durável, sobrevive a um reprocesso do kit.

### O vão continua sendo o plasma do jogo

O pack traz planos de vão prontos (`pool_*`, `circle_*`, e alguns arcos já
preenchidos), mas o preenchimento fica com o **plasma procedural** que o jogo já
tem: `measurePortalGap()` mede a abertura de qualquer moldura por raycast e
`createPlasmaPortal()` recorta a energia na forma exata — e, ao contrário dos
planos do pack, ele já tem `flash()` e `fadeOut()`, que é o que os estados do hub
(bloqueado / aberto / travessia) precisam. As texturas de vão do pack ficam
disponíveis como alternativa.

## Consequências

- `kits/portals-warp/` entra no empacotamento e na descoberta automáticos
  (`electron-builder.json` leva `kits/` inteira; o Chat IA varre o diretório) —
  nada a registrar em lista.
- `tests/scene/kitsRepo.test.ts` passa a cobrir mais 34 assets; o `kit.json` foi
  validado contra o `parseKit` real antes deste commit.
- **O teste de bbox foi generalizado** (mesma mudança): ele aceitava plano só na
  orientação DEITADA (decal de água/sombra, altura 0), e 14 assets deste kit são
  billboards EM PÉ (vórtice, mandala, brilho, grama — profundidade 0). A regra
  passou a ser "pelo menos duas dimensões positivas e nenhuma negativa", que
  cobre as duas orientações e continua pegando o degenerado de verdade (asset com
  uma dimensão só, ou negativa).
- Os scripts do `_stage/portals/` ficam para reuso — em especial `convert-fbx.py`,
  que é o primeiro conversor FBX do repo (os kits anteriores vieram em glTF/GLB)
  e serve para qualquer pack FBX futuro.
- O kit **não traz mecânica** (sem `scripts/`): comportamento de portal é do jogo,
  onde já existe o plasma e a cutscene de travessia.
