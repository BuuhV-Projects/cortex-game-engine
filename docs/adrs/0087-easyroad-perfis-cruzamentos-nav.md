# 0087 - EasyRoad estendido: perfis, cruzamentos declarados, nav e specs de região

**Data:** 2026-06-29
**Status:** aceito (design — implementação em fases, ainda não construída)

## Contexto

DDD-61 (GTA-like policial) precisa de cidades dirigíveis. A primeira é a **Ceilândia**, dentro
de uma **região do DF de 5000×5000m** cujo **terreno + underlay** (planta do mapa) já existem.
O road system atual (ADR-0072/0075/0076) gera **uma fita por spline** (`sampleSpline` →
`roadRibbon` + `surfaces` + `RoadGrade`) — **sem perfil** (faixas/calçada/meio-fio), **sem
cruzamentos**, **sem dados de navegação**. A decisão de produto (validada): **não modelar ruas
no Blender** — estender o EasyRoad pra gerar ruas/calçadas/cruzamentos/colliders/nav, usar o
ProBuilder pras quadras, e o Blender só pra kits modulares + hero assets depois.

## Decisão

Estender o road system (não criar paralelo). Geradores = **funções puras** (spec → geometria/
dados), testáveis sem render. Tudo **data-driven**: `compile(RegionSpec)` emite nós de cena que o
`buildScene` já entende (`road`, `mesh`, colliders) + nav.

### 1. RoadProfile (seção transversal) — o coração

Troca `width` única por uma **seção** extrudada ao longo da spline (reusa `sampleSpline`
position/forward/right). Calçada/meio-fio caem de graça como faixas do perfil.

```ts
type Vec2 = [number, number] // [x,z] metros (top-down)
interface ProfileLane {
  role: 'roadway' | 'sidewalk' | 'curb' | 'median' | 'shoulder'
  width: number; height: number        // 0=pista; 0.15=calçada; meio-fio=parede vertical
  surface?: RoadSurfaceName; drivable: boolean; walkable: boolean
}
interface RoadProfile { name: RoadProfileName; lanes: ProfileLane[]; minRadius: number; markings?: RoadMarkingName }
```

**Profiles iniciais (9):** `highway` 🔴, `arterial` 🟠, `urban_primary`, `urban_secondary`,
`residential`, `industrial`, `dirt`, `pedestrian_market`, `alley`. (Larguras/uso na spec do jogo.)

### 2. Cruzamentos DECLARADOS na fase 1

Auto-detect de interseção é frágil; começamos **declarando** (`IntersectionSpec`) — controle +
simplicidade. Geração: **aparar** as fitas ~½ largura antes do centro + **tile de junção** plano
cobrindo o miolo (quinas chanfradas retas, aceitável no stylized). Rotatória = `road` circular
(spline fechada) + ilha (ProBuilder) + aparo dos braços. Auto-detect fica pra fase posterior.

### 3. Specs (região → cidades → ruas) — fonte única, validável com zod (IA-autorável)

```ts
interface RoadSpec { id: string; profile: RoadProfileName; points: Vec2[]
  surface?: RoadSurfaceName; markings?: RoadMarkingName
  elevation?: 'conform'|'flat'|number; oneway?: boolean; speedKmh?: number; curveDensity?: number }
interface IntersectionSpec { id: string; at: Vec2; roads: string[]; kind: 'cross'|'tee'|'roundabout'; radius?: number }
interface DistrictSpec { id: string; bounds: Vec2[]; zone: 'civic'|'market'|'residential'|'industrial'|'park'|'transit' }
interface LandmarkSpec { id: string; at: Vec2; kind: string }
interface CitySpec { id: string; bounds: Vec2[]; roads: RoadSpec[]; intersections: IntersectionSpec[]
  districts: DistrictSpec[]; landmarks: LandmarkSpec[]; mainFlow?: string[] }
interface RegionSpec { name: string; size: { x: number; z: number }; underlay: string
  highways: RoadSpec[]; interchanges: IntersectionSpec[]; cities: CitySpec[] }
```

### 4. Colliders (carro raycast Rapier)

Pista = **trimesh** da fita marcado `userData.cortexRoad` (o `setupVehicle` já varre +
`addTrimeshFromObject`). **Meio-fio = parede baixa** (segura o carro sem física fina). Quadras/
prédios = **box estático** (nunca trimesh côncavo). Terreno = trimesh de chão (autoridade de
altura via raycast). Evitar triângulos degenerados (NaN/tunneling): `widthSegments`/amostragem
uniformes.

### 5. Navegação — derivada do SPEC (não da malha), duas camadas

```ts
interface NavNode { id: string; at: Vec2; kind: 'intersection'|'endpoint' }
interface NavEdge { id: string; from: string; to: string; road: string; lanes: number; oneway: boolean; width: number; speedKmh: number }
interface NavGraph { nodes: NavNode[]; edges: NavEdge[] }
```

- **Rodoviária** (poucos nós longos) e **urbana** (densa) = grafos **separados** (escala 5km).
- **Pedestre** = camada das `lanes` walkable (calçadas + Feira), pra perseguição a pé.

### 6. Integração com ProBuilder (quadras)

O gerador de ruas exporta `blocks: Vec2[][]` (anéis de polígono delimitados por centerlines −
calçadas). O ProBuilder (`EditableMesh`/`shapes`) **extruda** cada bloco em massa de quadra/lote.
Pipeline sempre **ruas → quadras** (a rua é a referência). Mesmo espaço métrico e origem.

### 7. Autoria = traçar o underlay

Com o underlay no terreno + `RoadDrawSystem`, o autor **clica ao longo das linhas** do mapa →
`RoadSpec.points`. Stylized: `matte` (cartoon) + `surfaces` tiláveis + `curveDensity`/`widthSegments`
baixos. "Vida" (semáforo, barreira) = `ScriptBehavior` no nó (System vs Script, ADR-0086).

## Consequências

- **Escopo:** construir **Ceilândia como fatia vertical** dentro dos 5km; outras cidades = stub.
  **Streaming/LOD por célula (grade 500m)** vira obrigatório **antes da 2ª cidade** (e a névoa
  existente esconde a borda).
- **Ordem:** (1) RoadProfile+extrusão → (2) RoadSpec+zod → (3) cruzamento declarado → (4) colliders
  → (5) quadras (ProBuilder) → (6) nav → (7) `compile(RegionSpec)` → blockout da Ceilândia → (8) loop de teste.
- **Riscos (ordenados):** cruzamentos (comece declarado/tile reto); confiabilidade do collider
  (meio-fio=parede, prédio=box); conform vs cidade plana (molde só nas bordas/parque); creep de
  perfil (trave nos 9); nav do spec (nunca da malha); performance 5km (merge por distrito + streaming);
  IA gerando spec inválida (zod + validador de rede).
- **Testes:** drive-test do fluxo; checklist por cruzamento; a pé na Feira; top-down vs planta;
  conectividade do nav (todo distrito alcançável da Delegacia); `compile` determinístico (snapshot
  de vértices) + sanity de collider.
