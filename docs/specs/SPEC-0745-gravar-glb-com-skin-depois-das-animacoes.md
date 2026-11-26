# SPEC 0745 - Gravar no GLB com o skin depois das animações

**Data:** 2026-11-25
**Status:** implementado

## Contexto

O "Gravar no GLB do jogo" do auto-rig (SPEC-0704, ADR-0705) só aceitava o layout "animação no fim":
todos os acessores e bufferViews de animação depois dos outros. O `LUC-01-skinned.glb` do Port Hollow,
reexportado pelo Blender com os ossos dos dedos (SPEC-0426 do jogo), traz a matriz inversa do skin
(`inverseBindMatrices`, acessor 4875 de 4876) **depois** dos 4867 acessores das 122 animações. O
gravar falhava com "layout intercalado: há acessor fora de animação depois dos de animação", e o
usuário não conseguia gravar a pegada da SMG (ARM-04).

Além disso, a troca atômica deixava `<arquivo>.bak` ao lado do GLB e do JSON, dentro do checkout do jogo
(a pasta `assets/personagens/player/` não está no `.gitignore` do jogo).

## Decisão

### 1. Layout normalizado antes do corte (`electron/renderer/glbLayout.ts`)

`normalizeLayout(json, bin)` roda antes de `findCut` no `replaceAnimations`:

- Se os acessores de animação já são os últimos, os bufferViews deles também, e nenhum bufferView fora de
  animação passa do primeiro byte de animação, devolve o mesmo JSON e BIN (o caminho antigo, byte a byte).
- Senão, reordena: os acessores fora de animação primeiro (na ordem do arquivo), depois os de animação; os
  bufferViews usados por eles idem (os sem uso ficam no grupo de fora). O BIN novo é a cópia de cada
  bufferView, na nova ordem, alinhada a 4 bytes. Os índices são renumerados em: `accessors[].bufferView`,
  `accessors[].sparse.indices/values.bufferView`, `images[].bufferView`, atributos, índices e alvos de
  morph das malhas, `skins[].inverseBindMatrices` e `input`/`output` dos samplers.
- Recusa (mensagem, sem gravar) o que referencia acessor ou bufferView por um caminho que a renumeração não
  conhece: as extensões `KHR_draco_mesh_compression`, `EXT_meshopt_compression` e `EXT_mesh_gpu_instancing`
  em `extensionsUsed`.

O conteúdo de cada bufferView fora de animação é o mesmo; muda a posição no BIN e o índice. As checagens de
compartilhamento (bufferView ou acessor dividido entre animação e malha) continuam no `findCut`.

### 2. Backup fora do projeto (`electron/main/characterRigBakeWrite.ts`)

A cópia do par anterior vai para a pasta temporária do sistema, `<tmp>/cortex-rig-backup/`, como
`<nome>.<carimbo>.bak`, e não mais ao lado do arquivo. Se a troca falhar no meio, é de lá que o arquivo
trocado volta. Nada além do par gravado fica no projeto.

## Consequências

- O LUC-01 atual (skin no fim) e qualquer GLB do Blender com a mesma ordem gravam. O GLB regravado sai com
  as animações no fim, e o próximo gravar segue o caminho byte a byte.
- O índice do acessor do skin (e de outros que vinham depois das animações) muda ao regravar. Quem lê o GLB
  pelo glTF não percebe a diferença.
- O backup some com a limpeza da pasta temporária; o histórico de verdade é o git do jogo.
- ADR-0705 atualizado: o layout intercalado passa a ser normalizado, não recusado.

Testes: `tests/electron/glbLayout.test.ts` (GLB sintético com o skin depois das animações, reordenação e
renumeração, caminho sem mudança byte a byte, recusa de Draco, o LUC-01 real do jogo quando existe) e
`tests/electron/characterRigBakeWrite.test.ts` (backup fora do projeto).
