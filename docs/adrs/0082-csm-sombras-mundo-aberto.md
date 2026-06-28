# 0082 - Sombras de mundo aberto: Cascaded Shadow Maps (CSM) no WebGPU

**Data:** 2026-06-28
**Status:** aceito (opção do engine), mas **não usado pelo DDD-61-CORTEX** — ver nota no fim.

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

## Nota (2026-06-28) — CSM bugou na prática; jogo usa "follow-shadow"

O `CSMShadowNode` (addon `examples/jsm`) deu artefato persistente neste setup WebGPU: a
sombra cobria o **frustum de UMA câmera** e aparecia uma "cunha"/linha diagonal cortando a
visão (mesmo com 1 cascata + fade + o fix de seguir a câmera de visão). Depois de várias
tentativas, o **DDD-61-CORTEX desligou o CSM** (`csm:false`) e usa uma **sombra única que
segue o player/carro**: o `main.ts` acha o `DirectionalLight` e move `sun.position`+`target`
junto do alvo ativo a cada frame (mantendo a direção), com `shadowArea` ~110 + `shadowMapSize`
4096 + **névoa** escondendo a borda. Simples, sem cunha, nítida em volta e em qualquer ponto
do mapa. O CSM fica como opção do engine pra quem quiser tentar/no futuro (talvez via CSM
em TSL nativo quando o three amadurecer).
