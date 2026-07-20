[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / StaticMergeStats

# Interface: StaticMergeStats

Defined in: [src/scene/StaticMerge.ts:46](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/StaticMerge.ts#L46)

**Merge da geometria estática da cena** (SPEC-0120) — reduz draw calls fundindo
as malhas paradas do cenário (ilhas, árvores, pedras, decoração) em poucas
malhas agrupadas por material, com o transform de mundo "assado" (baked).

Motivação: o custo de CPU do `WebGPURenderer` é **por objeto por frame**
(travessia + node material + encoding). No host nativo (Hermes, sem JIT) uma
fase com ~90 draw calls fica em ~19 ms de render; fundir o estático derruba
proporcionalmente. No V8 o ganho existe mas raramente é o gargalo.

O merge é **destrutivo na cena viva** (remove as malhas originais e adiciona
as fundidas na raiz) e por isso NÃO roda no editor — o F2 precisa dos objetos
individuais pra selecionar/mover. O caminho pensado é o **export/Play sem
editor** (o bootstrap nativo chama depois do buildScene).

O que fica de fora (continua desenhado como estava):
- Subárvores de entidades DINÂMICAS: qualquer entidade cujo conjunto de
  componentes não seja só {Transform, Object3D, Collider2D} (player, scripts
  — moedas/balsas/checkpoints —, corpos Rapier, sprites, terreno…). Regra de
  allowlist: componente desconhecido ⇒ dinâmico (seguro por default).
- Malha skinada (personagens), vegetação instanciada (`cortexVegetation*`),
  terreno (`cortexTerrain`, tem pipeline próprio de colisão/sculpt), água,
  chrome do editor (`editorInternal`), invisíveis, layers não-default.
- Malha com multi-material (array), geometria interleaved ou assinatura de
  atributos diferente do grupo (o `mergeGeometries` exige atributos iguais).

A física NÃO muda: colliders derivam dos nós ANTES do merge; o raycast de
chão/parede do Character enxerga a malha fundida (que preserva
`cortexSolid`), e o BVH (SPEC-0108) é construído uma vez sobre ela.

## Properties

### groups

> **groups**: `number`

Defined in: [src/scene/StaticMerge.ts:50](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/StaticMerge.ts#L50)

Malhas fundidas criadas (≈ nº de materiais distintos do estático).

***

### kept

> **kept**: `number`

Defined in: [src/scene/StaticMerge.ts:52](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/StaticMerge.ts#L52)

Malhas elegíveis puladas (grupo de 1, mismatch de atributos, etc.).

***

### merged

> **merged**: `number`

Defined in: [src/scene/StaticMerge.ts:48](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/StaticMerge.ts#L48)

Malhas originais fundidas (removidas da cena).
