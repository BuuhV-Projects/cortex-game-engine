# SPEC-0686 — Camadas e esfera do OBJETO no culling nativo do passe principal

**Data:** 2026-11-04
**Status:** implementado (partes 2 e 3 da frente "desenho"; a parte 1, item de desenho retido, não entra — ver §3)

## Contexto

Plano de 75 fps do DDD 00 no export nativo (Hermes sem JIT). Na pose centro, `render` ~10 ms, dos quais
`nativeProject` ~4,5 ms e `nativeEmit` ~1,3 ms. O laço JS por candidato do `MainProjector.project`
(`NativeMainProjection.ts`) ainda faz, para cada candidato que o C++ devolve:

1. `objeto.layers.test(camera.layers)`: uma chamada de método e duas leituras de propriedade. O C++ não conhece as
   camadas (`layers` não aparece em `native/`), então quem está fora das camadas da câmera volta do host e só cai no JS.
2. Para os nós `JsCull` que não são `Sprite` (`InstancedMesh`, `SkinnedMesh`, `BatchedMesh`: têm
   `object.boundingSphere`), o teste exato do `three` em JS: `Frustum.intersectsObject` (`Sphere.copy`,
   `applyMatrix4`, `getMaxScaleOnAxis`, 6 planos) e o `z` (`Vector4.copy` + 2 `applyMatrix4`), ~4-7 µs por nó.
   Eles são `JsCull` só porque o espelho conhece a esfera da GEOMETRIA, e o `three` corta esses nós pela esfera do
   OBJETO. O C++ os devolve sem corte (pass-through), inclusive os que estão fora da vista.

## Decisão

### 1. Máscara de camadas no C++ (parte 2)

**Host** (`native/src/scene/main_pass_slots.{h,cpp}`, dono o `MainPassCuller`):

- `MainPassSlots` guarda a máscara de camadas por slot (`uint32_t`, padrão `kDefaultLayers = 1`, a do
  `new Layers()`). Slot nunca escrito vale o padrão.
- `MainPassCuller::cull(mirror, planes, viewProj, cameraLayers)`: um candidato (malha, `JsCull` ou luz) só entra se
  `(camadas do slot & cameraLayers) != 0` — o `Layers.test` do `three` (`(a & b) !== 0` em int32 é o mesmo que em
  `uint32`). O teste vem DEPOIS da visibilidade herdada e da recusa: no `three` a camada não poda a subárvore
  (os filhos continuam sendo visitados), e a recusa por nó não reproduzível continua conservadora.
- `cameraLayers` padrão `kAllLayers` (`0xFFFFFFFF`): JS antigo, que não passa a máscara, continua com o resultado de
  antes (só cairia quem tem máscara 0, que o JS antigo também descarta).

**Ponte** (`main_pass_shim.cpp`, `__cortexMainPass`):

- `project(planos, viewProj, indices, z, versions, cameraLayers?)`: o 6º argumento, opcional, é a máscara da câmera
  (lida como int64 e reduzida a 32 bits, para aceitar o `-1` do `enableAll` e o `2^31` do canal 31).
- `setLayers(indice, mascara)`, `resetSlots()` e a capacidade `layerMask: true`.

**JS** (`src/core/sceneMirror/mirrorLayers.ts`, `MirrorSlots`):

- O espelho só sincroniza camadas quando o host tem `layerMask`. Na adoção do slot, engancha a `mask` do `Layers` do
  nó (acessor na própria instância, como os vetores da SPEC-0322) e o `layers` do objeto (acessor que reengancha
  quando o `Layers` inteiro é trocado). A escrita que muda o valor manda `setLayers` **no instante** (sem a latência
  de 8 quadros da varredura); escrita do mesmo valor não atravessa a ponte. Um `Layers` compartilhado por mais de um
  nó avisa todos os slots dele.
- O espelho guarda, por slot, a última máscara mandada (`Float64Array`, padrão 1). Na adoção, manda só se a máscara do
  nó difere dela (slot reaproveitado por lápide incluso). No `install`, `resetSlots()` zera o lado C++ e o JS recomeça
  do padrão.
- `MainProjector.project` passa `camera.layers.mask` e pula o `layers.test` quando o espelho diz que o host tem as
  camadas (`_projectionView().layersInHost`). Sem isso (host antigo), o teste continua no JS, mas em linha:
  `(objeto.layers.mask & mascara) !== 0` com a máscara lida uma vez fora do laço (o mesmo resultado, sem a chamada).

### 2. Esfera do objeto no C++ (parte 3)

**Host** (`MainPassSlots`): por slot, opcionalmente, uma **esfera de corte** (centro local + raio, a esfera do
objeto) e um **centro de profundidade** (o centro local da esfera da GEOMETRIA). No `cull`, um nó `kNodeMainJsCull`
que tem esfera de corte deixa de ser pass-through: é cortado como o `kNodeMainCull` (`transformPoint`,
`maxScaleOnAxis`, `intersectsSphere`, só com `kMainFrustumCulled`), mas com a esfera do objeto, e o `z` sai do centro
da geometria — o que o `three` faz (`intersectsObject` usa a do objeto; `_projectObject` usa
`geometry.boundingSphere.center` para o `z`, ver `_zDoThree`). Sem esfera de corte (sprite, ou esfera ainda `null`),
segue pass-through como hoje. Ponte: `setObjectSphere(indice, ocx, ocy, ocz, oraio, gcx, gcy, gcz)`,
`clearObjectSphere(indice)` e a capacidade `objectSpheres: true`.

**JS** (`src/core/sceneMirror/objectSpheres.ts`, `ObjectSphereSync`, dono o `MirrorSlots`):

- Elegível: slot `JsCull` que não é `Sprite` e tem `boundingSphere` próprio (`!== undefined`).
- **Conferência por quadro**, no início do `MainProjector.project` (antes do `syncPending`), só dos elegíveis visíveis
  (o C++ não alcança o oculto; quando ele reaparece, a conferência roda no mesmo quadro):
  - `object.boundingSphere === null` ou `geometry.boundingSphere === null`: o slot sai do C++ (`clearObjectSphere`)
    e o JS faz o teste do `three`, que calcula a esfera na hora certa. É o caso do `SkinnedMesh` (o `three` calcula a
    esfera no primeiro teste, com a pose daquele quadro) e do `InstancedMesh` cuja esfera foi anulada.
  - senão, os 8 valores (centro e raio do objeto, centro da geometria) são comparados com os mandados; diferente,
    `setObjectSphere`. Pega a esfera **mutada no lugar** (a vegetação reescreve `mesh.boundingSphere` a cada escrita
    de streaming, mesma identidade) no mesmo quadro, sem gancho.
  - `frustumCulled` diferente do que o host tem: o slot é sujo e a linha vai no `syncPending` do mesmo quadro (para
    `NativeCull` a latência da varredura é aceita; aqui o JS lia o `frustumCulled` direto todo quadro).
- O slot que sai (lápide) ou é reaproveitado por outro nó tem a esfera tirada do host antes de servir de novo.
- `MainProjector.project`: um `JsCull` cujo slot o host corta (`_projectionView().objectSpheres[slot] === 1`) não
  passa por `_dentro`/`_zDoThree`: usa o `z` do C++. O resto (sprite, esfera `null`) segue como hoje.

### 3. O que não entra, e por quê

- **Parte 1, item de desenho retido em C++ (passo 2 da ADR-0683).** A proposta é "evolução da opção STEADY" e o
  próprio cético condiciona o ganho (~0,5 ms) a ela: o caminho STEADY não existe no código (o `take` →
  `_refreshInstance` ainda roda por candidato). Fazer os dois passos de uma vez repõe tudo o que a ADR-0683 adiou: a
  validade do item retido passa de conferência por quadro para notificação (versão de material, troca de textura,
  `attribute.version`, `index`, `drawRange`, `instanceCount`, `_frameGeneration`, alvo/resize, `nativeTint`, braço de
  paridade), e um gancho que falta é imagem errada sem exceção; a ordem passa a ter dois lados (C++ e JS) com a mesma
  chave em `double`, e "emita até a chave K" vira uma travessia de ponte por item do `three` na lista opaca. A ADR
  exige A/B no jogo e a galeria de paridade lado a lado, que esta frente não roda (sem medição nativa, sem jogo). A
  ADR-0683 continua com o passo 2 registrado e não implementado.
- **`material.visible` no C++.** O `objeto.material` continua sendo lido por candidato (é argumento do
  `offer`/`offerNative`, e o `empurrar` confere `visible` de novo para array), então tirar o `ofertavel` poupa uma
  leitura e um `Array.isArray`. O `kSyncMaterialVisible` só chega ao host pela varredura (até 8 quadros): cortar no
  C++ com ele daria quadros com o material desligado aparecendo, ou ligado sumindo.

## Contrato

- A RenderList e as ofertas ao servidor ficam idênticas às de antes: os mesmos objetos, materiais, grupos e `z`.
- Host antigo (sem `layerMask`/`objectSpheres`): o JS não chama nada novo e faz os testes como antes (a camada em
  linha).
- `?nativeMainPass=0` / `?nativeProjection=0` continuam desligando a projeção inteira.

## Testes

- `native/tests/main_pass_slots_test.cpp` (`cortex_host_tests`): máscara padrão e escrita; candidato fora das camadas
  da câmera não entra, filho dele entra (a camada não poda); luz também é filtrada; `kAllLayers` não muda nada;
  `JsCull` com esfera de corte é cortado pela esfera do objeto e ganha o `z` do centro da geometria, com a maior
  escala; sem esfera continua pass-through; `clearObjectSphere` e `reset` voltam ao pass-through; `frustumCulled`
  desligado não corta.
- `tests/render/nativeProjectionCullSpheres.test.ts` (o espelho real com um host falso que reproduz o C++ novo):
  - equivalência com o caminho antigo (host sem os recursos), quadro a quadro: cena com `InstancedMesh` dentro/fora
    da vista, esfera mutada no lugar, esfera `null` (instâncias e `SkinnedMesh`), sprite, `frustumCulled` trocado,
    camadas trocadas por `set`/`enableAll`, por `Layers` novo e compartilhado: a mesma lista, na mesma ordem, com os
    mesmos `z`;
  - contagem: nenhum `intersectsObject` nem `layers.test` no caminho novo; o host não devolve a instância fora da vista
    nem os nós fora das camadas; parado, nada além do `project` atravessa a ponte;
  - ganchos de camadas: `install` chama `resetSlots` e manda só a máscara não padrão; a escrita que muda manda na hora,
    a mesma não atravessa; `Layers` compartilhado avisa os dois slots; nó que sai devolve as propriedades cruas; host
    sem o recurso não engancha nada.

## Consequências

- **O host precisa ser recompilado** para medir (C++ e shim mudaram). O JS novo num host velho cai no caminho antigo.
- Esperado (cético): ~0,15 ms das camadas (dos quais ~0,1 ms já viria só do teste em linha) e ~0,15 ms das esferas.
  A medição é da sessão principal.
- Quem trocar `object.layers` inteiro ou mexer na `mask` não precisa avisar ninguém: os ganchos cobrem. Quem mutar
  `object.boundingSphere` no lugar também não: a conferência é por conteúdo, por quadro.
