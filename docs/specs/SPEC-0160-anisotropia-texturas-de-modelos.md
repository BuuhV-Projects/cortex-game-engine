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

## Adendo (mesmo dia): investigação encerrada — dither REVERTIDO

O A/B na GPU real (export nativo + `?rdbg=unlit` do teste4) descartou sombra e
normais; a hipótese seguinte (banding do gradiente do atlas — janelas de
113×72 px esticadas em 12,5 m) motivou um dither de 1 LSB no `Textures1.png`.
**Não se confirmou**: o usuário reportou "mudou nada", e a análise geométrica
das juntas (rasterização dos decks em cena) provou o encaixe exato — o que ele
via como "dois glbs sobrepostos" eram as ORIGENS coincidentes das peças na
junta (design do cursor de trecho; corpos em direções opostas, 0,01 m² de
interseção = a linha da junta). O relato final do próprio usuário: "nem sei se
existiu problema".

O dither do atlas foi REVERTIDO (asset intacto). A **anisotropia 8 FICA**: é
melhoria genérica de filtragem (padrão da indústria, custo marginal), útil
para texturas com detalhe real em ângulo rasante — apenas não era a causa do
relato. Lição de método: artefato "visto" em screenshot precisa de A/B com a
MESMA câmera/posição — duas capturas parecidas não são prova.
