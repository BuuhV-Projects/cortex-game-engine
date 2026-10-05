# SPEC-0305 - Raycast de `InstancedMesh` com esferas em cache

**Data:** 2026-10-05
**Status:** aceito

## Contexto

O `InstancedMesh.raycast` do three, para **cada raio**, percorre **todas** as
instâncias: lê a matriz, multiplica pela do mundo e testa a esfera da geometria
transformada. O `CharacterPhysicsSystem` lança 13 raios por personagem por quadro
e o filtro de malhas próximas (`NearMeshIndex`, SPEC-0302) só vê a esfera da
`InstancedMesh` inteira — que, num jogo de cidade, cobre o bairro todo (portas e
interiores de 175 lojas, boxes de uma feira, rodas do trânsito). No Detetive
Brasília isso custava ~2,4 ms/quadro com um único personagem (perfil de CPU).
O jogo chegou a contornar com uma troca de `raycast` por malha (SPEC-0044 do
jogo), mas o problema é do motor: vale pra física, câmera e picking do editor.

## Decisão

`physics/instancedRaycast.ts` substitui `InstancedMesh.prototype.raycast` (junto do
patch global de `raycastAccel`, uma vez só):

- Mesma semântica do three (descarte pela esfera da malha inteira; teste da
  geometria por instância com o `Mesh.raycast` — já acelerado por BVH; mesmo
  `instanceId`/`object` nos acertos).
- Antes do teste caro, cada instância é descartada pela sua **esfera em
  coordenadas do mundo**, guardada em cache por malha (`WeakMap`) e refeita só
  quando muda `instanceMatrix.version`, `count`, a `matrixWorld` da malha ou a
  esfera da geometria. O descarte é conservador (folga numérica): nunca tira um
  acerto.

## Consequências

- Custo por raio cai de "matriz + esfera por instância" para "um teste de
  esfera por instância"; o teste de geometria só roda pra quem a esfera toca.
- Malha instanciada que se move todo quadro refaz o cache uma vez por quadro
  (O(instâncias)) — ainda menor que pagar isso por raio.
- Mudar instâncias exige `instanceMatrix.needsUpdate = true` (o three já exige
  pra desenhar; é isso que muda a `version`).
- O contorno do jogo (`cacheInstanceRaycast`) sai.
