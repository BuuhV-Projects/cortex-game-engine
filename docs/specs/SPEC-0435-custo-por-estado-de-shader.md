# SPEC-0435 — Custo por estado de shader no export (luzes, sombra, grupos compartilhados)

**Data:** 2026-10-23
**Status:** medição em andamento — nenhuma alavanca implementada como padrão ainda.

Frente seguinte ao RS1 (SPEC-0425, ligado por padrão por decisão do usuário).
Correção do teto no ADR-0404: o que sobra do render não está mais no laço por
objeto, está no trabalho por **estado de shader**.

## Contexto (medido)

DDD 61 `e2be01c`, export com o RS1 ligado, Comercial, sonda de relógio temporária
(patch fora do repo: `D:/jogos/detetive-brasilia/.cortex/rs-ceiling/rs-state-split.patch`).
Por quadro, somando o caminho da b.1 e o do servidor (a mesma função
`prepararChamada`):

| item | andando | parado |
| --- | --- | --- |
| `updateBefore` (sombra e afins) | ~0,2–0,3 ms | ~0,15–0,4 ms |
| nós de render (luzes, câmera, tempo), por estado | ~1,2–1,3 ms | ~1,3–1,8 ms |
| grupos compartilhados (~21/quadro, ~80–125 µs cada) | ~2,6 ms | ~1,7–2,5 ms |

Rodadas ruidosas (n 48–55); vale a ordem de grandeza: **~3–4 ms por quadro, ~25%
do render**.

Por quê: no `three` 0.184 cada estado de shader (`NodeBuilderState`) tem as
próprias instâncias dos nós de luz e o próprio UBO do grupo compartilhado
"render" (o `groupsData` é indexado por grupo **e** `UniformsGroup` do estado).
Nada disso é deduplicado entre estados. O DDD 61 tem 8 `SpotLight` (6 postes +
2 faróis, no shader mesmo apagadas de dia), hemisfério e sol com sombra: ~70
uniformes de luz por estado, em espaço de câmera — andando, mudam todo quadro.

## Como o Godot 4 resolve (processo do PRD-0009)

Repositório `godotengine/godot`, commit `c8256a8` (2026-10-23), renderer Forward+
(`servers/rendering/renderer_rd/`):

| o quê | onde | como |
| --- | --- | --- |
| luzes num buffer GLOBAL por quadro | `storage_rd/light_storage.cpp:712-720` (cria `omni/spot/area_light_buffer` como *storage buffer*), `:729` (`update_light_buffers`), `:1267-1279` (`buffer_update` uma vez por quadro) | as luzes não vão em uniformes por material: um array por tipo, escrito uma vez por quadro |
| só as luzes ativas por região | `cluster_builder_rd.cpp:415` (`begin`), `:438` (`bake_cluster`); chamado em `forward_clustered/render_forward_clustered.cpp:1730/1746/1752` | o shader percorre só as luzes do cluster do fragmento |
| dados de cena num UBO único por quadro | `storage_rd/render_scene_data_rd.cpp:70-74` (`create_uniform_buffer`/`update_ubo`), névoa em `:221-232`; chamado em `render_forward_clustered.cpp:722` | câmera, tempo e névoa: um UBO por vista, não por material |
| instâncias em *storage buffer* | `render_forward_clustered.cpp:817` (`_fill_instance_data`), `:930-932` (`buffer_flush`); `InstanceData` em `render_forward_clustered.h:346` | transformação e flags por instância num array, um upload por lista |
| variantes por especialização | `render_forward_clustered.cpp:429-432` (`ShaderSpecialization` por superfície) | flags viram constantes de especialização, não shaders distintos |

## Comparação com o nosso caminho

| | Godot | `three` 0.184 no export |
| --- | --- | --- |
| luzes | 1 buffer por quadro | uniformes por luz, copiados no UBO "render" de **cada estado de shader**; nós de luz atualizados por estado |
| luzes apagadas | fora do cluster: custo 0 | no shader sempre (SPEC-0150 do jogo: tirar recompila ~700 ms) |
| dados de cena | 1 UBO por vista | grupo compartilhado "render" **por estado** (o `groupsData` é por grupo e `UniformsGroup`) |
| instâncias | storage buffer | UBO de objeto por render object (o RS1 já tira o laço em JS) |
| variantes | especialização | um `NodeBuilderState` por combinação material × luzes × névoa |

## Validação: o que cabe aqui

- **Buffer global de luzes entre estados (Godot puro):** exigiria que todos os
  estados lessem o mesmo buffer — reescrever o `LightsNode`/`LightingModel` do
  `three` para ler de storage. Cabe em WebGPU/wgpu, mas é mudar o sistema de nós
  do `three` (não vendorizado) ou manter um fork: caro; fica como último degrau.
- **`DynamicLighting` do próprio `three` (exemplo oficial,
  `three/examples/jsm/lighting/DynamicLighting.js` +
  `tsl/lighting/DynamicLightsNode.js`):** agrupa as luzes SEM sombra (spot,
  point, hemisfério, ambiente, direcional sem sombra) num nó de dados por tipo
  (`data/SpotLightDataNode.js`: `uniformArray` de tamanho máximo fixo +
  `countNode`, `updateType = RENDER`, `Loop(countNode)` no shader). Um nó por
  render em vez de um por luz por estado, e acender/apagar muda a CONTAGEM, não a
  variante — resolve a armadilha da SPEC-0150 sem recompilar. Os arrays ainda
  vivem no UBO "render" de cada estado (não é o buffer único do Godot), então
  o ganho esperado é nos **nós de render** (~1,2 ms) e parte dos grupos
  compartilhados. Liga com `renderer.lighting = new DynamicLighting(...)`, sem
  tocar em arquivo vendorizado. O sol (com sombra) fica no caminho normal.
  Hermes: a atualização é um laço curto por render — barato.
- **Menos estados (c):** técnica de asset, sem mudança de engine; vem depois
  do censo.

**Escolha:** (d′) `DynamicLighting` no host (`?dynamicLighting=0|1`) passa a ser a
primeira alavanca de luz a medir — é a técnica do Godot que cabe no `three` —,
antes de (b) (que exige pipelines aquecidos das duas variantes) e de (c).
O teto de (b) já está na fila e serve de referência para (d′).

## Alavancas (cada uma: teto primeiro, depois A/B com autopiloto)

Regra do teto (ADR-0404, correção): o braço mantém o trabalho que continuaria
existindo; só remove o que a alavanca remove.

| | alavanca | onde | teto medido como |
| --- | --- | --- | --- |
| (a) | regravar a receita no lote da b.1 quando o grupo compartilhado foi recriado (hoje só ~26% dos diretos saem pelo lote) | engine (`DrawBatch.add`) | é a própria mudança, `?batchRecapture=0|1` |
| (b) | tirar do shader as luzes apagadas (postes e faróis de dia) | jogo | braço temporário no jogo: `SpotLight` fora da cena enquanto intensidade 0 |
| (c) | menos estados distintos (material compartilhado) | jogo/assets | censo dos estados por quadro e de quem os gera, antes de qualquer braço |
| (d′) | `DynamicLighting` do `three` (nó de dados por tipo de luz, contagem em vez de variante) | engine (`renderer.lighting`, só no host) | é a própria mudança, `?dynamicLighting=0|1` |
| (d) | um bloco único de uniformes de luz para todos os estados (Godot puro) | engine (sistema de nós do `three`) | só se (d′) não bastar |

Para (b): o jogo acende os postes à noite (`night` em degraus, SPEC-0120 do
jogo). A variante de shader sem as luzes tem de trocar sem travar: os dois
conjuntos de pipelines aquecidos no carregamento (`compileAsync`).

Depois de cada alavanca: sombra ligada × `?sombra=0` (decide se a sombra do sol
fica no export).

## Critério

Cada alavanca entra se o A/B com autopiloto (walk, Comercial e um segundo
ponto; 2 réplicas intercaladas) mostrar ganho de render e de p95/% > 33 ms sem
regressão nos outros pontos, com `?parityFreeze` no nível do controle. Mudança
no código do jogo vai para o usuário via a sessão principal.

## Resultados até 2026-10-23 21:20 (medições pausadas: máquina ocupada)

Kit SPEC-0382, `--autopilot walk`, intercalado, 2 réplicas × 135 s, Comercial e
Centro, todas VÁLIDAS (a bateria da (d′) corrigida foi interrompida às 21:19:57 e
está marcada CONTAMINADA em `.cortex/rs-ceiling/runs-ab-d2-walk/`).

### (a) regravar a receita no lote da b.1 — `e370bf66`

| ponto | render Δ | p95 Δ | % > 33 ms |
| --- | --- | --- | --- |
| Comercial | −0,74 | −7,3 | 41% → 26% |
| Centro | +0,20 | −1,25 | 8,9% → 13% |

O mecanismo funciona (desenhos pelo lote 84 mil → 166 mil na rodada; paridade 0
no Setor O), mas o ganho em tempo não sai do ruído com consistência. **Não
mergear sozinha**; remedir combinada com a próxima alavanca.

### (b) teto: tirar as 8 `SpotLight` do shader (braço no jogo, `?semSpots=1`)

| ponto | render Δ | quadro med Δ | p99 Δ | % > 33 ms |
| --- | --- | --- | --- | --- |
| Comercial | **−3,19** | −3,75 | −25,6 | 25,7% → 9,2% |
| Centro | **−2,73** | −3,85 | −11,9 | 12,5% → 4,5% |

É o tamanho do custo que as 8 luzes impõem a cada estado de shader — e o limite
superior do que (d′) pode capturar sem tirar luz nenhuma.

### (d′) `DynamicLighting` — primeiro número FALSO, depois corrigido

A primeira bateria deu render −6,1/−6,9 ms: o dobro do teto (b), implausível. O
log tinha `THREE.TSL: TypeError ... 'length' of undefined` em `LightsNode.hasLights`:
o Babel do export compila `super.hasLights` (getter) para
`LightsNode.prototype.hasLights`, que roda com o protótipo como `this`; o nó de
luzes falhava, materiais não compilavam e **objetos deixavam de ser desenhados**.
Corrigido em `76f36c48` (subclasse com `hasLights` sem `super`); 0 erros TSL
depois. Validação de imagem entre execuções congeladas no Setor O, dia e noite
(`?hora=21`): cena igual; diferenças só em NPCs, HUD/relógio e um contorno fraco
no carro à noite (pendente: conferir sob um poste aceso, mesmo horário). O A/B
corrigido ainda não rodou.

**Regra que fica:** número maior que o teto da mesma alavanca é defeito do
instrumento até prova em contrário — conferir log (`THREE.TSL`) e imagem.
