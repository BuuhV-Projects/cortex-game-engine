# SPEC-0111 - Kit de personagem modular: roles `character-part` e `rig` no vocabulário

**Data:** 2026-07-15
**Status:** aceito

## Contexto

O engine já compõe personagem modular em runtime (`composeModularCharacter`,
SPEC-0068), mas nenhum kit fornecia o material no formato esperado (um `rig.glb` +
um `.glb` por peça skinnada no mesmo esqueleto). O pack Cute Characters chegou como
um showroom único (381 peças skinnadas num esqueleto de 44 bones) + cópias soltas
**sem skin** — inutilizáveis direto. Além disso, o vocabulário do `kit.json`
(ADR-0053 §6) não tinha como classificar peças vestíveis: os roles existentes
descrevem coisas **posicionáveis na cena** (ground/platform/prop/…), e uma peça de
roupa não é posicionável — é composta num rig.

## Decisão

1. **Dois roles novos no vocabulário canônico** (`gen-kit.mjs#classify`):
   - `rig` — esqueleto compartilhado (+ clips quando houver). Um por kit modular.
   - `character-part` — peça vestível skinnada; `tags = [slot, ...]` com slots
     `body | ears | face | hair | facial-hair | hat | outfit | outwear | pants |
     shoes | socks | gloves | glasses | accessory`.
   Ambos **sem** `anchors`/`collider` (não são posicionados na cena; consumo é
   via `loadModularCharacter(rigUrl, partUrls)`).
2. **Pipeline de extração p/ packs-showroom** (skill `process-asset-kit`):
   `extract-modular.py` (Blender: exporta rig puro + esqueleto-em-bind-pose + 1
   mesh por peça, sem clips) e `externalize-texture.mjs` (reescreve cada GLB pra
   referenciar o atlas compartilhado por `uri` externa, reconstruindo o chunk BIN).
   A fonte é sempre o showroom skinnado — re-skinnar cópia estática por transfer
   de pesos é lossy e foi descartado.
3. **Kit `characters-cute`**: rig (44 bones) + 378 peças em 15 slots, atlas único
   `Textures_4.png` (402KB) — 23MB no total (172MB se embutisse o atlas por peça).
4. **Posição de vestir vem das cópias estáticas do pack** (gotcha decisivo): a
   geometria skinnada do showroom carrega o offset da GRADE da vitrine — usada
   crua, cada peça renderizaria longe do personagem. O extractor translada cada
   mesh pro bbox da estática de mesmo nome (`Separate_assets_glb/`), que está na
   posição de vestir. Validado por render de composição (corpo+rosto+cabelo+
   roupa+tênis alinhados, pés em y=0, 1.22u de altura).

## Consequências

- Criador de personagem/NPCs com mistura livre vira possível com material real;
  o custo de disco é nº de peças, não de combinações (SPEC-0068).
- GLBs do kit têm **textura externa**: ao vendorizar peças pra um projeto, copiar
  `Textures_4.png` junto (mesmo gotcha dos kits Kenney com texturas externas).
- O rig vem **sem clips de animação** (o pack não traz). Personagem composto fica
  em bind pose até anexarmos uma lib de animações retargetada pro rig de 44 bones
  — mesmo modelo do KayKit (rig compartilhado + clips à parte). Trabalho futuro.
- `list_kits`/`inspect_assets` passam a expor roles que o Chat IA ainda não tem
  receita pra consumir; a receita de composição (usar `loadModularCharacter` no
  código do jogo) precisa entrar no `engine-api.md` quando o fluxo for validado
  num projeto real.
