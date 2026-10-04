# SPEC-0299 - Culling da vegetação instanciada

**Data:** 2026-10-03
**Status:** aceito

## Contexto

A `Vegetation` (SPEC-0077) cria uma `InstancedMesh` por sub-malha do modelo e
desligava o culling (`frustumCulled = false`), com o argumento de que "o bounding
muda com o espalhamento". O efeito colateral: toda vegetação era desenhada em todo
quadro, mesmo atrás da câmera ou além do `camera.far`.

Isso impede a técnica padrão para mapas grandes (ex.: Shard Hunter, ilha de
~1,8 km): dividir a vegetação em vários nós `vegetation`, um por bloco de ~120 m, e
limitar `camera.far` (~320 m) escondendo o corte com névoa. Sem culling por bloco,
os blocos fora de vista continuam custando draw calls e vértices.

O argumento original não se sustenta: o `sync()` já chamava
`InstancedMesh.computeBoundingSphere()` a cada mudança. No three r184 esse método
une a esfera da geometria transformada por cada `instanceMatrix` até `count`, ou
seja, a esfera já descrevia o conjunto real de instâncias. Faltava só ligar o corte.

## Decisão

- `inst.frustumCulled = true` em cada `InstancedMesh` da vegetação.
- A esfera continua recalculada no `sync()`, o único caminho que escreve
  `instanceMatrix`/`count`: `setInstances`, `add`, `removeNear` (quando remove),
  `removeAt` e `setSource`. O construtor não chama `sync` (começa com `count = 0`);
  o three calcula a esfera sob demanda no primeiro teste de frustum.
- Com 0 instâncias a esfera fica vazia (raio negativo); não há o que desenhar e o
  three não quebra.

Consumidores conferidos:

- **Editor (SPEC-0079):** o raycast de `InstancedMesh` no three já testava a esfera
  do objeto antes das instâncias; nada muda.
- **Sombra nativa (SPEC-0289):** o `NativeSceneMirror` nunca liga
  `FLAG_FRUSTUM_CULLED` para `InstancedMesh` (a esfera do nó no espelho é a da
  geometria-base). Continua igual: a sombra nativa da vegetação não é cortada.
- **`WarmupFrame`:** força `frustumCulled = false` durante o aquecimento e restaura
  depois; segue compatível.

## Consequências

- No renderer do three (Studio/web e o laço JS do export), cada nó `vegetation` fora
  do frustum deixa de ser desenhado, inclusive no passe de sombra (frustum da
  câmera de sombra). Dividir em nós por célula + `camera.far` curto + névoa passa a
  render menos.
- O custo de `computeBoundingSphere` é O(instâncias) por mudança, igual ao `sync`
  que já percorre todas; mudanças são raras (overlay/pincel), não por quadro.
- Um nó único cobrindo o mapa inteiro tem esfera do tamanho do mapa e quase nunca é
  cortado: o ganho vem de dividir em células.
- O caminho nativo de sombra continua sem cortar vegetação por cascata (limitação
  da SPEC-0289, fora do escopo).
