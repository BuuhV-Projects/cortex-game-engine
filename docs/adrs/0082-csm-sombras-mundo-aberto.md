# 0082 - Sombras de mundo aberto: Cascaded Shadow Maps (CSM) no WebGPU

**Data:** 2026-06-28
**Status:** aceito

## Contexto

O sol usa **um único frustum de sombra** ortográfico (`shadowArea`, default ±60m = caixa
de 120m). O terreno do open-world tem **640m** — então a sombra só renderiza num pedaço de
~120m perto da origem; árvores/objetos fora disso não recebem/projetam sombra (parecia bug
"só algumas árvores têm sombra", mas era o alcance do shadow map). Esticar o frustard pra
640m borra tudo (mesmos 2048px espalhados).

Sombra é função do **renderer** (não precisa de lib externa como o Rapier é pra física). O
three 0.184 já traz o **`CSMShadowNode`** (`examples/jsm/csm`), que importa de `three/webgpu`
+ `three/tsl` — ou seja, é a variante **WebGPU** (o `CSM.js` antigo é WebGL/GLSL e não roda
no nosso renderer, ADR-0032).

## Decisão

- `setupOutdoorLighting` ganha `csm` (+ `shadowCascades`, `shadowDistance`, `lightMargin`):
  quando ligado, anexa `sun.shadow.shadowNode = new CSMShadowNode(sun, {...})`. As cascatas
  **seguem a câmera ativa** (play = câmera do jogo; F2 = câmera do editor — o nó pega a
  câmera do render automaticamente) e se atualizam por frame (`updateBefore`). Nítido perto,
  cobertura até `shadowDistance`, no mapa inteiro — técnica da Unity.
- Exposto no `outdoorLighting` da cena (`csm`/`shadowCascades`/`shadowDistance`/`shadowArea`/
  `shadowMapSize`). DDD-61-CORTEX liga `csm:true`, 3 cascatas, 300m.
- Sem CSM, o frustum único (`shadowArea`) segue como fallback.

## Consequências

- Mundo aberto com sombra coerente em qualquer lugar, sem borrar.
- Custo: N cascatas = N shadow maps por frame (3×2048 default). Ajustável por
  `shadowCascades`/`shadowMapSize`/`shadowDistance`.
- `CSMShadowNode` é addon `examples/jsm` (não core) — pode pedir ajuste em updates do three.
- Evolução possível: expor no Inspector (seção de cena/iluminação) e tunar fade entre
  cascatas. Ver [[engine-estradas-adr-0072]] (mesma cena grande).
