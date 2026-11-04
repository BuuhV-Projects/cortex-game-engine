# SPEC-0678 — O espelho de cena só sincroniza o que mudou de verdade

**Data:** 2026-11-03
**Status:** implementado

## Contexto

DDD 00 (Port Hollow), export nativo, poses fixas. O perf-trace mede `nodesUnchanged 13.805/13.837` e
`mirrorSynced 3.511`: quase nenhuma matriz local muda, e mesmo assim ~3,5 mil linhas atravessam a ponte por
quadro. O espelho (SPEC-0234/0322/0332/0372) custa ~5 ms por quadro.

### Causa (lida no código)

Os ganchos da SPEC-0322 sujam o slot de dois jeitos:

1. `position`/`scale`/`visible`: acessor que **compara** o valor e só suja na mudança.
2. `quaternion`/`rotation`: o gancho embrulha o `_onChangeCallback` do `three` e suja **sempre**. O `three`
   chama esse callback sem comparar valor: `Euler.order = …`, `Euler.y = …`, `Euler.set`, `Quaternion.set`,
   `Quaternion.copy` e o `fromArray` do `PropertyBinding` disparam o callback com o valor igual.

O `Object3DSyncSystem` faz `obj.rotation.order = 'YXZ'` e `obj.rotation.y = transform.rotationY` em todo quadro
para cada entidade com `TransformComponent` (~2,1 mil no DDD 00). Cada uma vira linha de sync. O mesmo vale para
peças animadas que reescrevem a mesma rotação, como os ~1,4 mil `Group` dos pedestres. Essas duas fontes juntas
batem com as ~3,5 mil linhas medidas.

No host, cada linha recebida faz o `SceneMirror::updateAndCull` recompor a matriz local e marcar a **subárvore
inteira** como mudada (recompõe o mundo dos filhos e enche `changed_`), mesmo com o transform idêntico.

## Decisão

### JS (`src/core/sceneMirror/mirrorHooks.ts`)

O gancho do `quaternion` e o da `rotation` passam a comparar o **quaternion** do nó com o último valor que
sujou o slot (`_mqx/_mqy/_mqz/_mqw`, guardados no próprio `Quaternion`). O callback original do `three` roda
antes: no `rotation`, ele já refez o `quaternion` pelo `setFromEuler`. Por isso comparar o quaternion cobre as
duas entradas. Escrever o mesmo valor não suja, como já acontecia com `position`/`scale`/`visible`.

### Varredura em rodízio (`SWEEP_PERIOD_FRAMES = 8`)

A varredura das flags do quadro pula, além dos nós com ancestral oculto (SPEC-0372):

- **o nó oculto** (`visible === false`): o acessor de `visible` suja o slot quando ele volta, e a linha leva as
  flags recalculadas naquele quadro;
- **o nó sem flag do quadro que mude sem gancho**: não é `Group` e não tem `material`. É o caso de `Object3D`
  puro, `Bone` e câmera. Nesses, só o `visible` (com gancho) e o `frustumCulled` mudam, e o `frustumCulled`
  só tem efeito em nó com geometria. A marca é estática (`ESTATICO_SEM_QUADRO`, calculada na adoção).

O nó pulado continua ocupando a fatia do quadro. A volta inteira segue em 8 quadros.

A varredura também conferia a troca de geometria (`_conferirGeometria`, a esfera do culling). Para o nó oculto
pulado, essa conferência passa para a reaparição: o acessor de `visible`, ao virar `true`, chama
`_reapareceu(slot)`, que confere a geometria na hora. Sem isso, uma geometria trocada com o nó escondido (esconde,
troca, mostra) ficaria até 8 quadros com a esfera velha no culling, e uma esfera menor que a nova pode cortar um
objeto visível.

### Host (`native/src/scene/scene_mirror.cpp`)

A linha de sync deixa de forçar a propagação. `applyTransforms` marca o slot como **sujo a conferir**
(`kDirtyFromSync`). Se o pai não mudou, o `updateAndCull` recompõe a matriz local num rascunho e compara com a
que já tem. Igual, e o mundo guardado igual a pai × local: o slot fica limpo (sem entrar em `changed_`, sem propagar). A
segunda conferência existe porque o JS escreve direto na fatia do mundo no meio do quadro (`updateWorldMatrix`,
SPEC-0340): numa pose transitória desfeita antes do sync (move, pede `getWorldPosition`, volta), a linha bate com
a local, mas o mundo guardado é o da pose. Nesse caso o mundo é refeito e propaga, como antes. Custa uma
multiplicação 4×4 por linha igual, ainda sem tocar a subárvore. O sujo
forçado do `build`/`append` (`kDirtyForced`) segue como antes. As flags do quadro que vieram na linha (`visible`,
`material.visible`, lado da sombra, passe principal) são aplicadas antes, como hoje.

### Divisão do arquivo (SPEC-0668)

`src/core/NativeSceneMirror.ts` tinha 1.470 linhas. Ele fica com a classe pública (install, eventos da árvore,
`update`, passe de sombra) e reexporta a API. O resto vai para `src/core/sceneMirror/`:

| arquivo | conteúdo |
| --- | --- |
| `mirrorLayout.ts` | layout de construção/sync, flags do nó e do quadro, lado da sombra, `descreverNo` |
| `mirrorHooks.ts` | ganchos de transform/`visible`/`updateWorldMatrix` |
| `mirrorBridge.ts` | tipos da ponte do host, motivos do gate, `mainPassBridge()` |
| `MirrorSlots.ts` | estado por slot: sujos, varredura, ancestrais ocultos, geometria, instâncias |

## Consequências

- Estimativa no DDD 00: `mirrorSynced` cai de ~3,5 mil para dezenas (só o que anda de verdade: carros acordados,
  câmera, jogador). O custo do espelho por quadro (~5 ms) cai na proporção das linhas, porque o
  `_escreverLinhas` (12 floats e `flagsDoQuadro` por linha) e o `applyTransforms` do host são lineares nelas. A
  varredura (~1,8 mil nós por quadro) fica mais barata com os pulos. A medição fica para a sessão principal.
- O `Object3DSyncSystem` continua pagando o `setFromEuler` duplo por entidade por quadro (`order` e `y`
  disparam o callback). Isso é custo do `world` (30–33%), fora do espelho: fica registrado como próximo passo
  da frente de `world` (comparar antes de escrever).
- Um nó com `matrixAutoUpdate = false` que muda só a `matrix` continua sem gancho (comportamento anterior).
- Testes: `tests/core/sceneMirrorDirty.test.ts` (JS) e `native/tests/scene_mirror_dirty_test.cpp` (host, incluindo
  `testSceneMirrorLinhaIgualRefazMundoEscritoPeloJs`).
