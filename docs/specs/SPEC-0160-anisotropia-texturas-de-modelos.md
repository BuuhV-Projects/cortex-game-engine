# SPEC-0160 - Filtragem anisotrópica nas texturas de modelos (GLTF/FBX)

**Data:** 2026-07-27
**Status:** aceito

## Contexto

Playtest do Mundo 4 do teste4 (GPU real): decks com linhas finas periódicas
(raias das pistas do kit platformer-obstacles) renderizam um MOIRÉ em pente
quando vistos em ângulo rasante — o usuário reportou como "problema pra
renderizar as texturas" no `platform_005` (rampa larga, superfície inclinada =
sempre rasante). O artefato NÃO reproduz no SwiftShader (headless), o que
aponta pra filtragem dependente de hardware: o three.js deixa
`texture.anisotropy = 1` por default, e na minificação rasante o mip trilinear
borra/alterna as linhas em leque.

## Decisão

O `AssetLoader` aplica **anisotropia 8** em todas as texturas dos materiais de
modelos carregados (`loadGLTF` e `loadFBX`), uma vez por carga (cacheado):
percorre a cena, visita os slots de textura dos materiais (map, normal,
roughness, metalness, ao, emissive) e seta `anisotropy = MODEL_TEXTURE_ANISOTROPY`.
8 é o ponto custo/benefício da indústria; no WebGPU o sampler clampa sozinho ao
máximo do device, então o valor é seguro em qualquer GPU.

Texturas avulsas (`loadTexture` — skybox, cáusticas da água, pixel-art com
NearestFilter) ficam FORA: têm caminhos próprios de filtragem.

## Consequências

- Linhas finas em decks/pisos param de virar pente em ângulo rasante; custo de
  GPU marginal (anisotropia 8 em texturas já mipmapadas).
- Jogos vendorizados só recebem o fix ao RE-VENDORIZAR o engine (teste4 feito
  em conjunto).
- Validação final é na GPU real do usuário (headless não reproduz o defeito).

## Adendo (mesmo dia): a causa dominante era BANDING — dither no atlas

O A/B na GPU real (export nativo em janela + `?rdbg=unlit` do teste4) provou
que o padrão persiste SEM luz e SEM sombra → é textura, mas não minificação:
as peças modulares usam janelas MINÚSCULAS do atlas que são GRADIENTES puros
(deck = 113×72 px esticados em 12,5 m — magnificação). Gradiente esticado +
re-quantização de 8 bits = **banding**, comprimido em "pente" pela perspectiva
rasante (SwiftShader mascara por precisão de caminho diferente).

`material.dithering` não existe no three WebGPU (e TSL custom arriscaria os
gotchas do naga no host nativo). Fix na FONTE: **dither de ~1 LSB (ruído
triangular acromático) aplicado ao `Textures1.png` do kit** — invisível de
perto, quebra as faixas. Script durável no stage
(`_stage/obstacles/dither-atlas.py`): rodar após qualquer reprocesso que
regenere o atlas. A anisotropia 8 fica (fix legítimo pra minificação).
