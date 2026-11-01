# SPEC-0631 - Nó `road`: estrada por spline (contrato da cena)

**Data:** 2026-10-31
**Status:** aceito — implementa o [ADR-0630](../adrs/ADR-0630-estrada-por-spline-enxuta.md)

## Contexto

O ADR-0630 trouxe de volta o núcleo da estrada por spline. Esta SPEC fixa o **contrato do nó `road`** que um jogo
escreve no `level.json` (o gerador do Port Hollow escreve a estrada da serra), o que o overlay do editor guarda, como o
terreno é cortado e aterrado e como a pista vira chão do carro.

## Decisão

### 1. O nó no `level.json`

```jsonc
{
  "type": "road",
  "id": "serra-alder-1",                 // único na cena; chave do overlay
  "points": [[120, 0, -40], [180, 0, -10], [260, 0, 30]],
  "width": 8,                             // m — largura total da pista. Default 8
  "talude": 6,                            // m por lado — rampa do platô até o terreno original. Default 6
  "maxSlope": 0.25,                       // Δy/Δhorizontal (0.25 = 25%). Default 0.25
  "grade": "terrain",                     // "terrain" (default) ou "points" — ver §2
  "smooth": 12,                           // m — janela da média móvel do greide. Default 12
  "texture": "assets/textures/asfalto.png", // opcional: textura tileável da pista ("" = sem textura, explícito)
  "tile": 8,                              // m de pista por repetição da textura. Default 8
  "color": "#4a4a4a",                     // cor da pista sem textura (com textura, o default é branco)
  "drivable": true,                       // chão do carro (userData.cortexRoad). Default true
  "clearance": 2,                         // m além da borda da pista sem vegetação. Default 2
  "bridge": [[4, 7]],                     // trechos de ponte por índice de ponto — ver §3c. Default nenhum
  "steps": 16                             // amostras por 90° de curva. Default 16
}
```

Só `type`, `id` e `points` são obrigatórios.

- **`points`**: ≥ 2 pontos `[x, y, z]` em **metros, coordenadas de mundo** (o nó não usa `transform`/`place`; se
  vierem, são ignorados). A curva é uma Catmull-Rom que **passa por todos os pontos**, com as pontas presas no primeiro
  e no último.
- Unidades: tudo em metros, exceto `maxSlope` (razão) e `steps` (contagem). O Inspector mostra `maxSlope` em %.
- Campos herdados de todo nó (`castShadow`, `receiveShadow`, `visible`, `fog`, `material`…) valem como nos outros
  nós. Por padrão a pista recebe sombra e não projeta.

**Como o gerador do jogo deve gerar os pontos:**

- Um ponto a cada **20 a 40 m** ao longo do eixo basta: a Catmull-Rom arredonda as curvas e a tessellation é
  adaptativa (mais amostras onde a curva dobra). Pontos demais deixam a curva nervosa.
- Com `grade: "terrain"`, o **Y dos pontos não importa** onde há terreno embaixo (use a altura do terreno ou 0). Só é
  usado onde a pista sai de todo terreno.
- Curva mais fechada que **raio ≈ `width`/2** dobra a fita sobre si mesma. Numa serpentina, abra o raio para ≥ `width`.
- Uma estrada por nó; duas estradas que se cruzam são dois nós (não há cruzamento modelado — a de corte mais fundo
  manda no terreno do encontro, §3).

### 2. Greide (o perfil de altura da pista)

O eixo é amostrado ao longo da curva. Para cada amostra:

- **`grade: "terrain"`** (default): a altura é a **altura BASE** do terreno ali (o heightmap autorado, sem nenhum corte
  de estrada), procurando em todos os nós `terrain` da cena (ladrilhos). Sem terreno embaixo, usa o Y da curva.
- **`grade: "points"`**: a altura é o Y da curva (o gerador impõe o perfil).

Depois: média móvel com janela de `smooth` metros (distância real, não índice) e limite de inclinação `maxSlope`
(passadas para frente e para trás, média das duas). O resultado é o **greide**: a pista é plana na largura e segue o
greide no comprimento.

A janela é **simétrica e encolhe perto das pontas** (meia janela = a menor entre `smooth/2` e a distância até cada
ponta): a primeira e a última amostra ficam no Y de referência, e uma rampa reta passa sem mudança. Assim dois nós
encadeados que dividem o ponto da emenda chegam nele no mesmo Y (com a janela cortada só de um lado, a ponta de uma
rampa de 6% com `smooth` 12 saía 34 cm deslocada). O `maxSlope` ainda pode mexer na ponta quando a referência é mais
íngreme que ele.

`maxSlope` baixo deixa a pista mais plana e corta mais o morro; alto acompanha mais o relevo. 25% sobe uma serra
fazendo ladeira e cava só um canal da largura da pista.

### 3. Corte e aterro no terreno (não destrutivo)

Para cada vértice de cada `terrain` cuja área encosta na estrada (área do ladrilho ∩ caixa da estrada ± alcance):

- distância horizontal `d` ao eixo; `y` = greide no pé da projeção;
- **platô** = `width/2 + max(1,5 célula da grade, 0)` — dentro dele o terreno vai para `y` (corta ou aterra), colado
  na borda da pista mesmo com grade grossa;
- **talude**: de `platô` até `platô + talude`, `smoothstep` de `y` até a base;
- fora disso, a base intacta.

O resultado é um **delta** (alvo − base) por vértice, guardado à parte no `Terrain` (`setRoadMolding`). A malha, a
colisão e `heightAt` usam base + delta; `getHeights()` (o que o overlay e o heightmap salvo guardam) continua sendo **só
a base**. Não fica cicatriz salva: apagar ou mover a estrada e reconstruir devolve o terreno.

- Várias estradas no mesmo vértice: vence o delta de **maior módulo**.
- Ladrilhos vizinhos: o delta é função só da posição no mundo, então a borda comum recebe o mesmo valor nos dois.
- Escultura no F2 (`sculpt`) muda a base; o corte é recalculado sobre a base nova na próxima moldagem.
- Moldagem roda no fim do `buildScene` (depois de todos os nós no lugar e do overlay aplicado) e, no F2, a cada
  edição da estrada.

### 3b. Vegetação fora da pista (não destrutivo)

Nenhuma árvore fica na pista: toda instância de nó `vegetation` (3D ou sprite) cujo pé (XZ, no mundo) cai a menos de
`width/2 + clearance` do eixo some (matriz com escala 0 — some do desenho, da sombra e do raycast). Como o corte no
terreno, **não mexe no dado**: `getInstances()` e o overlay continuam com todas as árvores; mover ou apagar a estrada
traz de volta as que saíram do corredor. Roda junto da moldagem (fim do `buildScene` e a cada edição no F2). Busca por
grade de hash dos segmentos do eixo: O(instâncias + segmentos) por estrada, não instâncias × segmentos.

O gerador do jogo **não precisa** tirar as árvores do corredor (pode, para economizar instâncias).

### 3c. Ponte (trecho sem corte/aterro)

`bridge` é uma lista de pares `[i0, i1]` de **índices de `points`** (`0 ≤ i0 < i1 ≤ último`): o trecho da curva entre
o ponto `i0` e o ponto `i1` é ponte. Par inválido (fora do intervalo ou `i0 ≥ i1`) é ignorado.

- **Greide no vão:** reto (por distância) entre a altura de referência das duas cabeceiras (pontos `i0` e `i1`), então
  o vale ou o rio embaixo não puxa a pista para baixo. Com `grade: "points"` vale o Y da curva, como no resto. A média
  móvel e o `maxSlope` rodam depois sobre o perfil inteiro, então a entrada e a saída da ponte ficam suaves.
- **Terreno:** os segmentos do eixo com as duas pontas dentro do vão **não aterram**: onde o terreno está abaixo da
  pista (o vale, o rio), fica intacto. Onde ele estaria **acima** da pista (encosta convexa logo depois da cabeceira), é
  cortado até o greide, como no resto da estrada, para a ponte nunca ficar enterrada. As cabeceiras moldam
  normalmente, e o talude da estrada encosta nelas.
- **Malha:** a mesma fita, desenhada dos dois lados (vista de baixo não some), e continua `cortexRoad` (chão do carro).
  A estrutura (pista, pilares, guarda-corpo) vem de `bridgeParts` (§3d).
- A vegetação sai do corredor também sob a ponte (§3b).

### 3d. Peças da ponte (`bridgeParts`, ADR-0649)

```jsonc
"bridgeParts": {
  "deck": "assets/bridge/road_piece_thick_1.glb",   // pista, repetida ao longo do vão
  "pillar": "assets/bridge/support_column_2.glb",   // opcional: pilar nas juntas
  "rail": "assets/bridge/bridge_railing_1.glb",     // opcional: guarda-corpo nas duas bordas
  "scale": 0.787,                                   // escala de pista e pilar (default 1)
  "pillarEvery": 2                                  // pilar a cada N peças de pista (default 2)
}
```

Sem `bridgeParts`, o vão é só a fita (§3c). Com ele, em cada vão:

- **Pista (`deck`):** `n = round(comprimento do vão / (comprimento da peça × scale))` peças (mínimo 1), esticadas em Z
  para fechar o vão sem folga. Cada uma fica centrada no seu trecho, no greide, virada pela tangente e inclinada pela
  rampa do trecho.
- **Pilar (`pillar`):** nas juntas internas a cada `pillarEvery` peças (as cabeceiras ficam de fora). O topo fica no
  greide; X e Z na `scale`; Y esticado até a base do terreno embaixo. Junta sem altura (terreno a menos de 0,5 m da
  pista) não ganha pilar.
- **Guarda-corpo (`rail`):** repetido pelo próprio comprimento (sem `scale`), nas duas bordas, a `width/2` do eixo.

**Contrato do modelo (origem):** comprimento em Z, Y para cima, X centrado. Pista: topo do piso em y = 0. Pilar: topo
em y = 0, crescendo para baixo. Guarda-corpo: base em y = 0.

As peças são filhas da malha da estrada, então somem, mudam e voltam com ela (edição no F2, apagar, overlay). Por
serem filhas, herdam o `cortexRoad` (quando `drivable`): entram no trimesh do carro e no merge estático como a fita. O
guarda-corpo segura o carro na ponte e o pilar é obstáculo embaixo dela; o carro anda sobre a fita, 5 cm acima do topo
da pista. Os `.glb` vêm do cache de
modelos (`loadGLB`); um caminho que falha só registra no `debug('road')`.

### 4. Malha e colisão

- A fita é uma grade (colunas na largura a cada ~1,5 m), com Y = greide + **0,05 m** (evita briga de profundidade com
  o platô). UV: U atravessa a largura (0..1); V = distância / `tile`.
- `drivable` (default `true`) marca a malha com **`userData.cortexRoad`** — o `setupVehicle` da engine e o do jogo
  fazem trimesh de tudo que tem `cortexTerrain` ou `cortexRoad`, e o merge estático preserva a marca (SPEC-0316).
  `drivable: false` deixa só o terreno moldado como chão.
- O personagem anda no terreno moldado (`heightAt` inclui o delta); como o platô fica 5 cm abaixo da pista, ele não
  afunda nela.
- O objeto da estrada leva `userData.cortexRoadNode` = o nó efetivo (nó + overlay), que o editor lê.

### 5. Overlay (o editor vence o JSON)

- **Estrada desenhada no F2** → entra como nó completo em `data.added`, como os outros nós criados no editor.
- **Edição de qualquer estrada** (do JSON ou do F2) → `data.road[id]` = só os campos mudados
  (`points`, `width`, `talude`, `maxSlope`, `grade`, `smooth`, `texture`, `tile`, `color`, `drivable`, `steps`).
  O build faz `{ ...nó, ...data.road[id] }`: **o overlay vence o nó**.
- Apagar no F2 → `data.deleted` (como os outros nós).
- Consequência para o gerador: se o usuário ajustou a estrada no F2, mudar os `points` no gerador **não** mexe nela (o
  overlay vence). Para o gerador voltar a mandar, remova `data.road[id]` do overlay.

### 6. Editor F2

- **Desenhar** (menu Cena → "Desenhar estrada", botão "Estrada" do painel de formas): clique no terreno adiciona um
  ponto; prévia amarela do eixo segue o cursor; **Enter** ou duplo clique finaliza (≥ 2 pontos); **Backspace** tira o
  último ponto; **Esc** cancela. Cria o nó com os defaults e o seleciona. Ctrl+Z desfaz.
- **Inspector → "Estrada"**: Largura (m), Talude (m), Inclinação máx. (%), Greide (Terreno / Pontos), Textura (seletor
  com preview das texturas do projeto; "Sem textura" volta à cor), Repetição (m), Cor, Chão do carro, botão
  "Editar traçado". Cada mudança refaz a pista e remolda o terreno ao vivo.
- **Editar traçado**: esferas nos pontos; clicar numa e arrastar o gizmo move o ponto (a pista acompanha ao vivo); ao
  soltar, o terreno é remoldado e o overlay salvo. **Delete** remove o ponto selecionado (mínimo 2); **Esc**/Tab sai.

### 7. API pública (runtime)

- `src/road/RoadSpline.ts`: `sampleSpline(points, curveDensity?)`, `splineLength(samples)`, tipo `RoadSample`.
- `src/road/RoadMesh.ts`: `roadRibbon(samples, width, tileMeters?, gradeY?, lift?)`, `roadColumns`, `ribbonToGeometry`, tipo `RoadRibbon`.
- `src/road/RoadGrade.ts`: `smoothGrade`, `moldHeightfield`, `mergeDeltas`, tipos `GradeOptions`, `GradePoint`,
  `HeightfieldGrid`.
- `src/road/roadFields.ts`: `roadFieldsSchema`, `roadOverlaySchema`, tipos `RoadFields`, `RoadOverlay`.
- `src/scene/RoadBuild.ts`: `makeRoad(node)`, `applyRoad(mesh, node, three)`, `moldTerrainToRoads(three)`,
  `buildRoads(three)`, `overlayRoad(overlay)`, `resolveRoadNode(node, ov)`, `roadNodeOf(obj)`, `ROAD_LIFT`.
- `Terrain`: `setRoadMolding(delta | null)`, `baseHeightAt(x, z)`.

## Consequências

- Fora (ADR-0630): perfis de via, cruzamentos, marcações, `navGraph`, `RegionSpec`, modo "pista acompanha o relevo",
  superelevação. Ponte = vão sem aterro (§3c) + peças do jogo (§3d).
- Moldar custa O(segmentos × células perto da pista) por ladrilho tocado, uma vez por build e a cada edição no F2;
  não roda por quadro.
- O renderer nativo recebe a pista como malha comum (`MeshStandardMaterial`), sem caminho especial.
