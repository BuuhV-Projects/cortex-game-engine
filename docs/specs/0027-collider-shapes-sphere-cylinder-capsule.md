# SPEC-0027 - Collider shapes: sphere, cylinder, capsule

**Data:** 2026-05-30
**Status:** aceito (Fase 0 — plano) · implementação em 5 fases commitáveis

## Contexto

Hoje o `ColliderComponent` só suporta AABB (axis-aligned box):

```ts
export class ColliderComponent extends Component {
  size: Vec3 = { x: 1, y: 1, z: 1 }
  offset: Vec3 = { x: 0, y: 0, z: 0 }
}
```

Pra cenário low-poly com árvores, postes, troncos e personagens,
AABB é a forma errada na maioria dos casos:

- **Árvore** tem tronco fino vertical + copa larga. `Box3.setFromObject(treeMesh)`
  devolve uma caixa do tamanho da copa — o player fica "barrado no
  ar" longe do tronco.
- **Personagem** (Knight) seria melhor representado como cápsula
  vertical (cilindro com semiesferas no topo/base), não cubo.
- **Rochas redondas** se aproximam melhor de esfera.
- **Paredes hexagonais** (60°/120°) precisariam de OBB rotacionada,
  mas AABB rotaciona junto e cresce.

Workaround atual em projetos: ignorar o AABB e criar uma caixa
pequena no centro do mesh (`colliderRadius`). Funciona como
aproximação cilíndrica grosseira mas continua quadrada e replica
manualmente em cada projeto.

## Decisão

Estender `ColliderComponent` com um **discriminated union**
`ColliderShape` cobrindo box (atual), sphere, cylinder e capsule.
Cylinder/capsule sempre vertical-aligned (eixo Y) — cobre 95% dos
casos de jogos 3D em terreno horizontal sem precisar de orientação
arbitrária. OBB rotacionada e mesh collider ficam **fora de escopo**.

### API

```ts
export type Vec3 = { x: number; y: number; z: number }

export type ColliderShape =
  | { kind: 'box';      size: Vec3;                          offset?: Vec3 }
  | { kind: 'sphere';   radius: number;                      offset?: Vec3 }
  | { kind: 'cylinder'; radius: number; height: number;      offset?: Vec3 }
  | { kind: 'capsule';  radius: number; height: number;      offset?: Vec3 }

export class ColliderComponent extends Component {
  shape: ColliderShape = { kind: 'box', size: { x: 1, y: 1, z: 1 } }

  // Backwards-compat: getters/setters delegam pra shape quando box.
  // Código que faz `col.size = {x,y,z}` continua funcionando.
  get size(): Vec3 { /* shape.size se kind==='box', senão derivado */ }
  set size(v: Vec3) { /* se shape.kind==='box', mutate; senão troca pra box */ }
  get offset(): Vec3 { /* shape.offset ?? {0,0,0} */ }
  set offset(v: Vec3) { /* mutate shape.offset */ }
}
```

### Tabela de algoritmos por par

| Par | Algoritmo | Referência |
|---|---|---|
| Box ↔ Box | SAT/AABB overlap + MTV (já existe) | Atual |
| Sphere ↔ Sphere | `dist² < (rA+rB)²`, MTV = direção normalizada × penetração | Ericson Cap. 5.1 |
| Cylinder ↔ Cylinder | Projeta XZ como círculos + overlap em Y | Ericson Cap. 5.1 |
| Box ↔ Sphere | Closest point on box → distance ao centro | Ericson Cap. 5.1.5 |
| Box ↔ Cylinder | Closest point XZ na caixa → distância ao eixo + overlap Y | Decomposição |
| Sphere ↔ Cylinder | Clamp Y no eixo do cilindro → resolve sphere-sphere XZ | Decomposição |
| Capsule ↔ X | Capsule = cylinder + 2 spheres; reduz aos casos acima | Decomposição |

10 pares únicos no total (4 shapes × 4 simétricos / 2 + 4 diagonais).
Despacho por tabela 2D `Record<kind, Record<kind, fn>>`.

### `PhysicsSystem` — refactor mínimo

`_resolveCollision(a, b)` hoje:
1. Build AABB de A e B.
2. Check overlap.
3. Compute MTV (axis-aligned).
4. Separa posições + cancela velocidades.

Após refactor:
1. Pega `shape` de A e B.
2. **Despacha** pra `fn = dispatch[shapeA.kind][shapeB.kind]`.
3. `fn(a, b)` retorna `CollisionResult | null` com `{ normal: Vec3, penetration: number }`. Normal **unitário arbitrário** (pode ser não-axis-aligned).
4. Se não-null: aplica separação + cancela velocidade — código atual já funciona com normal genérico (passos 3 e 4 só dependem de `normal` ser unitário e `penetration` positivo).

## Casos de uso reais

| Asset | Shape ideal |
|---|---|
| Knight (player) | `capsule` r=0.25, h=1.6 |
| Árvores forest (Tree_*) | `cylinder` r=0.3-0.4, h=AABB.y |
| Tronco cortado | `cylinder` r=0.4, h=AABB.y |
| Postes, pilares, ladders | `cylinder` |
| Rochas (Rock_* arredondadas) | `sphere` |
| Casas (building_*) | `box` (mantém AABB) |
| Paredes (wall_*) | `box` |
| Caixas, baús, barris | `box` ou `cylinder` |

## Fora de escopo (não fazer agora)

- **Mesh collider** (per-triangle): caro, não vale pra cenário
  estático denso.
- **OBB rotacionada**: requer SAT mais complexo; OBB rotativo só faz
  sentido depois que tivermos rotação no `RigidBodyComponent`
  (hoje só position/velocity).
- **Composite shapes** (multi-shape por entity, ex.: forma em L):
  útil mas dá pra emular com múltiplas entities filhas — não
  bloqueante.

## Plano de implementação (5 fases commitáveis)

Cada fase entrega valor e pode ser revertida sem afetar as outras:

1. **Fase 1** (~80 LOC, commit `feat(physics): ColliderComponent ganha shape discriminado`)
   Estender `ColliderComponent` com `shape`. `size`/`offset` viram
   getters/setters proxy. PhysicsSystem **não muda** — internamente
   já lê `col.size` e `col.offset`, então tudo continua funcionando
   como box.

2. **Fase 2** (~100 LOC, `refactor(physics): tabela de despacho por shape kind`)
   Extrair colisão box-box pra função `collideBoxBox`. Montar
   tabela `dispatch[kindA][kindB]`. Comportamento idêntico (só
   `box ↔ box` populado; outras combos retornam null por enquanto).

3. **Fase 3** (~120 LOC, `feat(physics): colisão de esferas`)
   Implementar `sphere ↔ sphere`, `box ↔ sphere`. Testes vitest
   cobrindo separação e impulso.

4. **Fase 4** (~150 LOC, `feat(physics): colisão de cilindros`)
   Implementar `cylinder ↔ cylinder`, `box ↔ cylinder`,
   `sphere ↔ cylinder`. Testes.

5. **Fase 5** (~80 LOC, `feat(physics): colisão de cápsulas`)
   Capsule reduz a cylinder + 2 spheres. Implementação via
   composição: `collideCapsuleX(a, b)` chama `collideCylinderX` e
   `collideSphereX` nas semiesferas e pega o resultado de menor
   penetração negativa (ou primeiro que colide).

## Consequências

### Positivo

- Cobre 95% dos casos de jogo 3D indie (vegetação, personagens,
  rochas, props).
- API com discriminated union é type-safe em TS e narrowing
  automático nas funções de colisão.
- Cada fase é commitável e revertível — risco baixo de descartar
  trabalho.
- Backwards-compat 100%: código existente que usa `col.size` e
  `col.offset` continua funcionando sem alteração.

### Negativo

- `_resolveCollision` perde a otimização de normal axis-aligned (1
  componente não-zero). Normal genérico exige um pouco mais de
  matemática no impulso. Diferença de performance negligível.
- Tabela de despacho cresce com cada novo shape — manter sob ~10
  pares dá pra escrever à mão; mais que isso pede algum
  generalismo (broadphase + narrowphase por minkowski).
- Cylinder/capsule vertical-aligned não cobre objetos deitados
  (ex.: tronco caído). Mitigação: usar box pra esses casos ou
  esperar OBB rotacionada futura.

### Aberto pra futuro

- **OBB rotacionada** quando `RigidBodyComponent` ganhar rotation.
- **Composite collider** se aparecerem casos de forma em L/T.
- **Broadphase espacial** (octree, sweep-and-prune) se o O(n²)
  começar a doer em cenas com 100+ entities.

## Referências

- ADR-0002 — Arquitetura ECS.
- Christer Ericson, *Real-Time Collision Detection* (2005), Cap. 5
  — referência das fórmulas usadas.
