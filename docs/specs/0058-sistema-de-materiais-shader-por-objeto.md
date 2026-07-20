# SPEC-0058 - Sistema de materiais/shader por objeto

**Data:** 2026-06-09
**Status:** aceito (S1 presets standard/unlit/toon + S3 UI no inspector/persistência; pendente: S2 GLSL custom)

## Contexto

O usuário queria **atribuir um shader a um objeto pela propriedade dele, como na
Unity** — começando por reproduzir um shader unlit (`Supyrb/Unlit/Texture`: textura ×
cor, sem iluminação, com controles de cull/zwrite/ztest). O engine só tinha **um**
ajuste de material por objeto, o `setMatte` (mexe em roughness/metalness in-place),
sem um sistema geral de trocar o material/shader de um objeto.

Shader da Unity (ShaderLab/HLSL, `CGPROGRAM`, `UnityCG.cginc`) **não roda** no engine
(Three.js/WebGL/GLSL) — não há conversão automática confiável. O caminho é
**reimplementar como material do Three**. O `Supyrb/Unlit/Texture`, em particular, é
um `MeshBasicMaterial` (textura × cor, unlit, `toneMapped: false`) com os knobs de
render mapeados pra flags do material; o look "fullbright/vívido" que ele dá (vs o
PBR com sombra/AO) é exatamente o do `MeshBasicMaterial`.

## Decisão

Sistema de **material por objeto** data-driven (`src/scene/Materials.ts`):

- **`applyMaterial(obj, config)`** troca o material dos meshes (não-destrutivo: o
  original é cacheado em `userData`; `{ type: 'standard' }`/`clearMaterial` restaura).
  `getMaterialType(obj)` devolve o preset ativo (pro inspector).
- **Presets (S1):**
  - `standard` — restaura o PBR original do `.glb`.
  - `unlit` — `MeshBasicMaterial` (textura × cor, sem luz) + knobs portados do shader
    Unity: `cull`→`side`, `depthWrite` (ZWrite), `depthTest` (ZTest), `color`,
    `opacity`/`transparent`, `alphaTest`. Preserva o `map` do material original.
  - `toon` — `MeshToonMaterial` com `gradientMap` de N bandas (cel-shading) +
    contorno opcional (inverted-hull: casca `BackSide` levemente maior).
- **Schema** (`SceneDefinition`): campo `material` em `baseFields` (model/primitive),
  discriminated union por `type`. **Precedência:** `material` é aplicado **depois** do
  `matte`, então um `material` que troca a malha vence.

## Consequências

- Dá pra atribuir um "shader" (preset) por objeto na cena, base pra a UI no inspector
  (S3) e pro modo **GLSL custom** (S2: `ShaderMaterial` com vertex/fragment + uniforms).
- **Re-sombreamento NÃO-destrutivo das cores:** `unlit`/`toon` são construídos
  **por-material** (trata array de materiais) preservando `map`, `vertexColors`,
  `opacity`, `alphaTest` e a `color` própria de cada submaterial — re-sombreia EM
  CIMA do original sem achatar objetos multi-cor (ex.: árvore com folha verde +
  tronco marrom). Por isso o inspector **não** expõe edição de cor (evita achatar);
  o tint fica disponível só na config (engine).
- **Limitações conhecidas (S1):**
  - stencil/colorMask/offset do shader Unity não são portados (knobs avançados,
    extensíveis depois).
  - Contorno toon (inverted-hull) **não deforma com skinning** — bom pra malhas
    estáticas; em personagem skinned o contorno não acompanha os ossos. Default `0`
    (desligado). Contorno skinned correto exige shader próprio (fase futura).
  - Troca de material é por objeto inteiro (todos os meshes descendentes).
- Persistência no overlay do editor e o dropdown no inspector ficam pra S3; por ora o
  `material` vem do nó da cena (JSON).
