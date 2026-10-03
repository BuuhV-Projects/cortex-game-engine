# SPEC-0289 — Passe de sombra nativo com streaming de LOD e `InstancedMesh`

**Data:** 2026-10-02
**Status:** aceito e executado — causa provada, passe nativo assumindo estável com streaming e `InstancedMesh`; render 27,4 → 18,1 ms na fase 2

## Contexto

Na fase 2 do crash-bandicoot-racer (`reference-circuit`), o streaming de LOD
(`CircuitStreamingSystem` + `scenes/circuit-runtime.mjs`) põe e tira instâncias
da cena o tempo todo. No host nativo, com CSM de 3 cascatas, o render custa
~27 ms; sem sombra, ~10 ms; o "mapa nas cascatas" sozinho custa ~14 ms
(interruptores A/B). Meta do jogo: 70 fps.

O passe de sombra nativo (SPEC-0245) existiria justamente para isso, mas o log
da fase mostra que ele assume UMA vez e nunca mais:

```
[sceneMirror] 469 nos espelhados no host
[shadowPass] ASSUMIU desenhados=160 cascatas=3
[shadowPass] DEVOLVEU ao three motivo=geometria-ausente
```

O espelho acompanha o streaming (E6 da SPEC-0245: `childadded`/`childremoved`);
quem recusa é o gate, por `geometria-ausente`. Além disso, o jogo passa a usar
`InstancedMesh` para a vegetação repetida (SPEC-0022 do jogo), e o gate recusa
`InstancedMesh` por definição (motivo `instanced`).

### Hipóteses a verificar (nenhuma assumida)

| | hipótese | o que a provaria |
| --- | --- | --- |
| a | LOD recém-carregado ainda sem buffer de GPU (o `three` sobe no 1º draw) | recusa que some sozinha em 1–2 frames |
| b | caster só nas cascatas, nunca no passe principal: ninguém sobe a geometria | o nó recusado está fora do frustum da câmera |
| c | objeto permanente sem geometria (colisão invisível com `castShadow`) | o mesmo nó recusado a corrida inteira, desde o início |
| d | o `CasterGeometryRegistry` só VARRE a cena uma vez (`_varrer` no 1º frame): geometria de nó que nasce depois nunca entra na fila | a geometria recusada é **desconhecida** do registro (nem registrada, nem pendente) |

A (d) saiu da leitura do código (`CasterGeometryRegistry.atualizar`:
`if (this._pendentes === null) this._pendentes = this._varrer(cena)`), não de
medição — e explica o "nunca mais volta" sem precisar de (a)–(c).

## Diagnóstico (instrumento antes de conclusão)

O gate passa a relatar o **primeiro nó ofensor** do motivo escolhido
(`ShadowGateResult::firstOffender`, slot novo no vetor de saída). O lado JS
traduz o índice no objeto e loga, só quando o veredito muda: nome, tipo,
id da geometria e o estado dela no registro (`registrada` / `pendente` /
`desconhecida`). Isso separa as hipóteses: (d) = `desconhecida`; (a)/(b) =
`pendente`; (c) = nó sem geometria ou o mesmo nó desde o 1º frame.

## Diagnóstico EXECUTADO (2026-10-03) — a causa é a (d)

Rodada `diag-a` do probe (`-Candidate dbgshadow -Dynamic -Frames 600`, bundle e
exe da worktree, jogo com o instancing da SPEC-0022 do jogo):

```
[sceneMirror] 170 nos espelhados no host
[casterGeometry] registradas=59 pendentes=0
[shadowPass] DEVOLVEU ao three motivo=instanced no=12-rochas-costeiras:2 ... [instanced=4 casters=35]
[shadowPass] DEVOLVEU ao three motivo=geometria-ausente no=tripo_node_34d18c7f-… tipo=Mesh geometria=desconhecida [geometria-ausente=1 casters=23]
[shadowPass] DEVOLVEU ao three motivo=geometria-ausente no=tripo_node_63b73eac-… tipo=Mesh geometria=desconhecida [geometria-ausente=5 casters=19]
[casterGeometry] registradas=58 … 57 … 56 … 55 … 54 pendentes=0
```

- Todo ofensor de `geometria-ausente` é malha de LOD que nasceu pelo streaming,
  e a geometria dela é **`desconhecida`** do registro — não `pendente`. Não é
  (a) nem (b): o registro nem tentou. Não é (c): nenhum ofensor é nó sem
  geometria, e o ofensor muda com o streaming.
- `registradas` só **desce** (59 → 54): o despejo de cache (`disposeCache` do
  TTL) desregistra pelo `dispose`, e nada entra de volta. É a assinatura da (d):
  o registro converge para zero ao longo da corrida, e o gate nunca mais aceita.
- **Achado de brinde, perigoso:** o `InstancedMesh` aparece como caster
  (`instanced=4`) no começo e some depois que a câmera anda. O enumerador C++
  corta o lote pela esfera da GEOMETRIA-BASE aplicada à matriz do lote (na
  origem), que não descreve o conjunto. Se o gate aceitasse `InstancedMesh` sem
  mudar isso, a sombra da vegetação sumiria fora da origem.

## Decisão 1 — a geometria entra no registro quando o nó entra no espelho

O espelho já sabe de cada subárvore nova no frame em que ela nasce (E6 da
SPEC-0245). Ele passa a juntar as malhas novas numa fila que o
`CasterGeometryRegistry` drena por frame; a geometria vai para os pendentes (sem
repetir a que já está registrada ou pendente) e o registro preguiçoso faz o
resto. Nenhuma varredura da cena por frame.

Enquanto a geometria está **pendente** (o `three` ainda não subiu o buffer —
(a) e (b)), o gate continua recusando. Alternativas avaliadas:

| alternativa | por que não |
| --- | --- |
| pular só o caster ausente e desenhar o resto | a sombra dele **some** no frame — viola o requisito |
| forçar o upload pelo `three` (`_geometries`, `_attributes`) | internos do renderer, sem contrato; quebra em silêncio numa atualização |
| ignorar casters "não desenháveis" | não há caster não desenhável aqui: todos têm geometria, só não estão no registro |

A recusa devolve UM frame ao `three`, que desenha a sombra e, com isso, sobe a
geometria — inclusive a do caster que só existe nas cascatas (a (b), o
ovo-e-galinha, se resolve sozinho porque o passe do `three` volta a rodar). No
frame seguinte o registro a pega e o nativo reassume. O custo é proporcional a
**geometrias novas** (primeira carga de um asset/LOD), não a trocas de LOD:
`instance()` compartilha a geometria entre clones (SPEC-0288).

## Decisão 2 — `InstancedMesh` com buffer de instâncias próprio do C++

O `three` sobe `instanceMatrix` de dois jeitos conforme o tamanho
(`InstanceNode._createInstanceMatrixNode`, three 0.184): **uniform buffer** até
o limite do dispositivo, **atributo intercalado** acima. Não há um `GPUBuffer`
estável para emprestar, como se faz com a geometria. Por isso:

- o JS manda `instanceMatrix.array` (só as `count` primeiras) ao host quando
  `instanceMatrix.version` ou `count` mudam — uma travessia de ponte por
  mudança, não por frame;
- o C++ guarda um `GPUBuffer` próprio por nó (`InstanceBufferStore`), cresce
  quando falta capacidade e o libera quando o nó sai do espelho;
- o shader do passe ganha uma variante com a matriz da instância como atributo
  por instância (`stepMode = Instance`, 4 × `vec4f`), na mesma ordem
  coluna-maior do `three`;
- o gate só recusa `instanced` quando o host **não tem** as matrizes do nó;
- o enumerador **não corta** `InstancedMesh` pela esfera (não descreve o lote);
  desenhar o lote inteiro numa cascata que não o vê não muda a profundidade
  (é recortado), então o resultado é o mesmo do `three`, só sem a otimização.

## O que foi construído

- **Gate** (`shadow_pass_gate.{h,cpp}`): `ShadowGateResult::firstOffender` (o
  primeiro caster do motivo escolhido) e `InstancePresence`, ponteiro de função
  opcional — `nullptr` mantém o comportamento antigo (todo `InstancedMesh`
  recusa). Continua PURO e testado no harness.
- **Shim** (`scene_mirror_shim.cpp`): slot novo na saída do gate (ofensor),
  `setInstances(indice, matrizes, quantas)`, limpeza das instâncias dos slots
  que viram lápide no `removeNode` e no `build`, e itens instanciados no lote
  do passe.
- **`render/instance_buffer_store.{h,cpp}`**: nó → `GPUBuffer` de matrizes,
  cresce sob demanda, libera na saída do nó.
- **`render/shadow_pass.{h,cpp}`**: `ShadowDrawItem` com `instanceBuffer` e
  `instanceCount`; pipeline com chave `(passo, cull, instanciado)` e a variante
  de shader `MVP × instância × posição`; lote vazio (`count = 0`) não desenha.
- **`NativeSceneMirror.ts`**: fila de geometrias novas
  (`drainNewGeometries`), rastreio dos `InstancedMesh` com envio só quando
  `version`/`count` mudam, `InstancedMesh` sem `FLAG_FRUSTUM_CULLED`, e o
  ofensor + contagem por motivo no resultado da recusa.
- **`CasterGeometryRegistry.ts`**: aceita as geometrias novas, não repete
  registro, sai da fila no `dispose` antes do upload (senão prenderia os arrays
  de CPU do LOD despejado) e responde `estado(geometria)`.
- **`OutdoorLighting.ts`**: drena a fila por frame e o log de recusa diz QUAL nó,
  o tipo, o estado da geometria e quantos frames ficaram com o `three`.

## Resultados (2026-10-03, host da worktree, máquina sem outro `cortex_host`)

Probe `D:/Codex/2026-10-02/phase-2-runtime/shadow-0289` (cópia do
`shadow-experiment`, para não disputar o `boot.hbc` com outras sessões).
ANTES = src e exe da main (`d8c9b16a`); DEPOIS = src e exe desta worktree. O
jogo é o mesmo nos dois, com o instancing da SPEC-0022 dele (não commitado).

### Render — câmera no spawn, `-Dynamic -ProbeLevel 1 -Frames 600`

Mediana das 20 últimas amostras do `perf-trace.jsonl` (`cpuAvg.render`), fora
do carregamento:

| rodada | `cpuAvg.render` | draws | fps |
| --- | --- | --- | --- |
| antes-a | 27,25 ms | 176 | 31,6 |
| antes-b | 27,45 ms | 176 | 31,5 |
| depois-a | **18,10 ms** | 77 | 43,2 |
| depois-b | **18,00 ms** | 77 | 43,7 |

**−9,3 ms de render.** No resultado do probe: 31,4 → 44,6/45,2 fps, p50
32,0 → 23,0 ms.

### Estabilidade com streaming de verdade — voo pela ilha

A câmera parada no spawn quase não troca LOD (conferido: `lod_instances`
constante a corrida inteira; o `-AiPlayer` também não andou). O probe ganhou o
candidato `fly`/`dbgfly`: círculo de 300 m de raio a 0,5 m/frame, 25 m acima do
spawn. Conferido que estressa: LOD0/1/2 variando (18/39/65 → 9/37/105 → 12/37/92),
55 cargas de GLB, cache subindo e descendo pelo TTL.

| rodada (`dbgfly`, 2.400 frames) | log do passe | render | fps |
| --- | --- | --- | --- |
| voo-antes (main) | **nunca** ASSUMIU (`instanced`, `geometria-ausente`) | 23,6 ms | 34,8 |
| voo-depois | 69 ASSUMIU; **10 recusas de 1 frame cada**, todas `geometria=pendente` | **16,2 ms** | **46,6** |

10 frames devolvidos em 2.310 (0,4%). Cada recusa é um LOD recém-carregado
cujo buffer o `three` ainda não subiu — hipóteses (a)/(b), resolvidas pela
própria recusa, como decidido. Nenhuma `desconhecida`.

### Paridade visual da sombra (por pixel)

Mesmo build, câmera parada, frame 200 (`-Capture`), `three` forçado com
`semPasseDeSombraNativo=1`. Dois enquadramentos: o spawn (karts) e a palmeira
instanciada mais próxima (`29-palmeiras-leque`, `InstancedMesh`), para cobrir o
caminho novo.

| par | maxChannelDiff | pixels > 0 | pixels > 8 |
| --- | --- | --- | --- |
| spawn: three × three (piso) | 0 | 0,000% | 0,000% |
| spawn: **nativo × three** | 7 | 0,004% | 0,000% |
| spawn: sem sombra × three (controle) | 187 | 87,8% | 43,6% |
| palmeira: three × three (piso) | 0 | 0,000% | 0,000% |
| palmeira: **nativo × three** | 6 | 0,002% | 0,000% |
| palmeira: sem sombra × three (controle) | 102 | 89,0% | 57,5% |

O controle sem sombra é o caso de resposta conhecida: o comparador acusa a
falta de sombra com folga, então "0,002%" não é instrumento cego. O resíduo é
da mesma ordem do E9 da SPEC-0245 (2 níveis em 0,004%).

### Testes

- Harness C++ (`cortex_host_tests`): **420 checks, 0 falhas** — novos: gate
  aceita `InstancedMesh` com matrizes no host e recusa o que não as tem, com o
  ofensor certo; `firstOffender` aponta o caster e fica −1 em motivo do frame.
- Vitest: **1.800 passando, 7 pulados, 0 falhas** — novos: geometria que entra
  depois do `install` é entregue ao registro; registro aceita geometria tardia,
  não repete registro, re-registra a recarregada e solta a descartada antes do
  upload; `InstancedMesh` sem frustum culling; matrizes só quando
  `version`/`count` mudam; lote que sai da cena para de ser sincronizado; host
  antigo sem `setInstances` não quebra.

## Riscos e limites

- **`drawRange`/grupos e `instanceColor`** continuam fora (irrelevantes para
  profundidade; material em array já recusa).
- **Lote instanciado não é cortado** na cascata: custo de GPU do lote inteiro
  em cada cascata, em troca de não depender de uma esfera que o `three` recalcula
  sob demanda. Com 12 lotes (4 assets × 3 LODs) é desprezível; se virar custo,
  a saída é mandar a esfera do lote junto das matrizes.
- **Recusa de 1 frame por geometria nova** fica: elimina-la exigiria forçar o
  upload pelo `three` (internos sem contrato). O custo medido é 0,4% dos frames.
- O shadow map no frame recusado mantém o conteúdo do frame anterior (o passe
  do `three` só volta no frame seguinte) — comportamento herdado da SPEC-0245,
  **inferido** da ordem de `updateBefore`, não medido nesta spec.
- O jogo usado na medição tem o instancing da SPEC-0022 **não commitado**; os
  números valem para essa árvore.
