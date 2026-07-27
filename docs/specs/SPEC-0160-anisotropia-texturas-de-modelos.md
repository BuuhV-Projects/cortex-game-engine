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
