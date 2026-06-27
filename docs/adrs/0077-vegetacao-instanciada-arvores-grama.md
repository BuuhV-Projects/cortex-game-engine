# 0077 - Vegetação instanciada (árvores, grama, arbustos)

**Data:** 2026-06-27
**Status:** aceito — Fase 1 (núcleo instanciado + nó) e Fase 2 (pincel de espalhar no editor) feitas

## Contexto

Falta no engine **vegetação** — povoar o terreno com árvores, grama, arbustos. A
referência é o *mass-placement* do **Tom's Terrain Tools** (Unity): pintar milhares de
instâncias de uma vez. Colocar uma a uma (painel Add) não escala — grama precisa de
espalhamento instanciado. Performance exige **instancing** (um draw call por sub-malha,
não um objeto por planta).

## Decisão

### Nó de cena `vegetation` (data-driven; overlay vence)
A vegetação é **dado**: o modelo + a lista de instâncias espalhadas.

```ts
{ type: 'vegetation', id,
  model?: string,        // .glb; omitido = placeholder procedural
  kind?: 'tree'|'grass', // placeholder quando sem model
  instances?: number[],  // plano [x,y,z,rotY,scale] por instância (compacto)
  capacity?: number }    // máx. de instâncias (buffer). Default 8192
```

As `instances` são autoradas pelo **pincel de espalhar** do editor (Fase 2) e persistem
no overlay (`data.vegetation[id]`) — o overlay vence o nó.

### Núcleo: `Vegetation` (`src/scene/Vegetation.ts`, instanciado)
Recebe um `source` (`Object3D` do `.glb` ou placeholder); coleta cada **sub-malha**
(geometria+material, com a transform relativa ao root) e cria uma {@link InstancedMesh}
por sub-malha. Cada instância aplica `T(pos)·Ry(rot)·S(scale)` por cima da transform
local da sub-malha (modelos tronco+copa mantêm o layout). API: `setInstances`/
`getInstances` (formato plano serializável), `add`, `removeNear` (borracha do pincel).
Testável isolado.

### Placeholder procedural
Enquanto não há `.glb` reais, `makePlaceholderVegetation('tree'|'grass')` gera um modelo
simples (tronco+copa / quads de grama). O sistema é **agnóstico de modelo** — troca por
`.glb` sem mexer no núcleo.

> **Nota de conteúdo (2026-06-27):** os modelos do Tom's Terrain Tools são **FBX v6100**
> (2010), que o Blender 5.1 não importa, e as texturas eram `.PSD` (convertidas via
> ImageMagick). Pra usar os modelos da Unity, re-exportar do Unity em FBX 2018+/glTF.
> Enquanto isso, placeholder + qualquer `.glb` CC0 servem.

## Consequências

- **`src/scene/Vegetation.ts` novo** (instanced, puro/testável) — segue o molde de
  `Terrain`/`src/road`. Exportado no runtime.
- **Nó `vegetation` novo** no `SceneDefinition` + `buildScene` (`makeVegetation`).
- **Instancing** = milhares de plantas a custo baixo; `frustumCulled=false` nas
  InstancedMesh (o bounding muda com o espalhamento).
- **Fase 2 (feita):** **pincel de espalhar** no editor (`VegetationAuthoring`): paleta/menu
  "🌳 Árvore"/"🌿 Grama" cria o nó e liga o pincel; CLIQUE/ARRASTE no terreno espalha
  (densidade/jitter/escala aleatória, assenta na altura do terreno via raycast,
  espaçamento mínimo); **SHIFT apaga**. Persiste mutando `node.instances` (data.added).
  Inspector: raio/densidade/escala. Colisão das árvores: fora de escopo por ora.
- **API pública nova** → `yarn docs:engine`, `engine-api.md`/`architecture.md`, vendor.
