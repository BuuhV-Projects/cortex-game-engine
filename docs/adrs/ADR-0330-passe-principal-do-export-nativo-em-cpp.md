# ADR-0330 — O passe principal do export nativo vai para C++ (reabre o laço de render)

**Data:** 2026-10-09
**Status:** aceito — (0) rejeitada por medição (SPEC-0331); (a) em execução; (b) e (c) planejadas

Substitui o **ADR-0228** ("o laço por objeto do render fica em JS") e o
**ADR-0235** ("o teto de 17% da submissão é estrutural"). Reabre os marcos
**M5–M8 do ADR-0237** e revisa a **decisão 1 do ADR-0244** (M5 encerrado).
Frente R3-F1 do ciclo "75 fps no export nativo do DDD 61".

## Contexto

### O que a medição da R2b mostrou (DDD 61, engine `0e3ea11c`, jogo `9be7c6f`)

Export release, `?renderPhases=3` (SPEC-0227), cinco pontos da cidade, rodadas
intercaladas. Relatório e sondas em `.cortex/r2b-ddd61/`.

| item | valor |
| --- | --- |
| GPU por quadro | **0,3–0,4 ms** (a GPU não é o teto) |
| draws por quadro | 113–148 |
| laço por objeto do `three` (Hermes) | **~55–60 µs/draw = 6,7–8,1 ms/quadro** |
| — `_nodes.*` | 2,6–3,3 ms |
| — `backend.draw` | 1,0–1,4 ms |
| — `_objects.get` | 0,9–1,1 ms |
| — `_pipelines.*` | 0,6–0,8 ms |
| projeção (`_projectObject`) | 1,5–2,2 ms |
| render objects que **reaproveitam** o quadro anterior | 89% (`rpRefresh` 16 × `rpReuse` 130) |
| nós da cena / nós avulsos (não fundidos) | ~10 mil / ~8 mil |
| quadro hoje | setorO 20,6 ms, comercial 24,8 ms |
| meta | 13,3 ms (75 fps); alvo realista da mediana 10–11 ms |

Todo o trabalho só-JS restante (R2 inteira) leva a ~57–66 fps. **75 fps não
fecha com o laço por objeto em JS.**

### Por que os ADRs anteriores não valem mais para esta cena

- **ADR-0228** decidiu manter o laço em JS porque o `renderObject` (57%) "não é
  migrável em fatia": é o sistema de nodes do `three`. O próprio ADR deixou a
  condição de reabertura: "uma engine de render onde a **cena inteira** viva em
  C++ (o JS só descrevendo mudanças)". Essa condição **existe hoje**: o
  `SceneMirror` (SPEC-0233/0234) tem a hierarquia e as matrizes de mundo em C++,
  a SPEC-0322 sincroniza só os nós sujos (−10 ms no DDD 61), e o passe de sombra
  já desenha em C++ a partir dele (SPEC-0245, padrão do host desde o E8).
- **ADR-0235** fixou o teto de 17% para "qualquer desenho em que o `three` ainda
  percorra os objetos em JS". Isso continua verdade — e é justamente o que este
  ADR **não** faz: as etapas (b)/(c) tiram o `three` do laço do passe principal
  para os objetos migrados, inclusive `_nodes`, `_bindings` e `_pipelines`.
- **ADR-0244, decisão 1** encerrou o M5 porque, no `kart-racer`, o
  `mergeStaticScene` já tinha eliminado o custo por objeto do passe principal
  (40 malhas restantes): "voltar a ele exige primeiro demonstrar, com medição,
  uma cena em que o custo por objeto do passe principal exista". **O DDD 61 é
  essa cena**: ~8 mil nós avulsos, 113–148 draws a ~55–60 µs cada.
- O M5 de 2026-09 também falhou por um motivo técnico (SPEC-0241): o desenho do
  C++ rodava **depois** do `renderer.render()`, fora da pass da cena, e a
  oclusão contra o `three` nunca funcionou. O passe de sombra nativo
  (SPEC-0245) mostrou o padrão que funciona: o gancho roda **dentro** do fluxo
  do `three`, no alvo dele, na ordem certa.

## Decisão

**O passe principal do export nativo passa a ser resolvido em C++, em etapas
mergeáveis uma a uma, cada uma com A/B próprio.** O Studio (browser/Electron)
continua 100% no caminho do `three` — premissa de produto do ADR-0237, mantida.

| etapa | o quê | ganho esperado | spec |
| --- | --- | --- | --- |
| **(0)** | caminho rápido **em JS** para os render objects que reaproveitam o quadro anterior: memoização, por chamada de render, do que só depende do contexto (sem mudar semântica) | medido: ~0,5 ms no melhor caso — **rejeitada** (o resto é verificação que só (b) substitui) | SPEC-0331 |
| **(a)** | **projeção em C++**: culling por frustum e `z` de ordenação a partir do `SceneMirror`; a RenderList do passe vem de uma lista de índices do C++ | 1,2–2,2 ms | SPEC-0332 |
| **(b)** | **desenho nativo dentro do passe da cena** para os materiais que a `MaterialDesc` (M1) já cobre, no alvo do `three` e na ordem certa (padrão SPEC-0245) | (b)+(c): render de 8–11 → ~2–3 ms | SPEC-0333 |
| **(c)** | o restante dos materiais (ou recusa honesta pelo escape hatch "só three") | | a definir |

Regras que valem para todas as etapas:

1. **Interruptor `?nativeMainPass=0|1`** no host: desliga de uma vez todo o
   caminho novo do passe principal. Cada etapa tem também o próprio interruptor
   (`?reuseFastPath=`, `?nativeProjection=`) para isolar o ganho dela no A/B.
2. **Recusar em vez de aproximar** (regra do M1/SPEC-0245): o que o caminho
   nativo não reproduz exatamente fica no `three` — por objeto quando der, pelo
   quadro inteiro quando não der. Erro aqui aparece como imagem sutilmente
   errada, não como exceção.
3. **Só o host nativo** usa o caminho novo. Câmera do editor, câmera de inspeção
   e cenas que não são a espelhada seguem no `three`.
4. **Precisão em `double`** em tudo que espelha estado do `three` (regra da
   SPEC-0234; as bandas de sombra já morderam uma vez).
5. Cada etapa traz **teste** (Vitest no JS, `cortex_host_tests` no C++) e
   **imagem** do caso de risco que ela toca.

### Riscos e como cada um é coberto

| risco | etapa | cobertura |
| --- | --- | --- |
| paridade de materiais node/TSL | (b)/(c) | `MaterialDesc` recusa o que não descreve; captura comparada A/B |
| contorno (casca inverted hull, `positionNode`) | (b) | `ShadingModel` próprio do M1; sem ele, fica no `three` |
| transparência e ordem | (a)/(b) | (a) mantém o sort do `three` (mesmas chaves, ordem idêntica); (b) começa só por opacos |
| UI/overlays do `three` | (a) | só a cena espelhada é interceptada; outras cenas/quads seguem no `three` |
| UV scroll / emissivo animado | (0)/(b) | (0) não pula a comparação do observer; (b) recusa material com nó animado |
| `InstancedMesh` / skinned / sprite | (a) | o culling deles fica em JS (a esfera é a do conjunto/rig, não a da geometria) |
| objeto que troca de material | (a)/(b) | (a) lê o material vivo do objeto a cada quadro; (b) re-descreve por versão |
| câmera do editor | todas | Studio no `three`; no host, só a cena espelhada |

### Alternativas consideradas

- **Seguir só em JS** (mais podas, mais caches): a R2 inteira leva a ~57–66 fps;
  o que sobra é custo estrutural do Hermes sem JIT por objeto. Rejeitado como
  caminho para 75 fps (as etapas (0)/(a) aproveitam o que resta dele).
- **Trocar o renderer** (`threepp`, engine própria do zero): rejeitado pelos
  mesmos motivos do ADR-0228 (sem node materials, backend errado) — o desenho
  aqui reaproveita o `SceneMirror`, a `MaterialDesc` e o passe de sombra nativo,
  que já existem e estão medidos.
- **Instanciar/fundir mais no jogo**: complementar (frente F4), não substituto —
  os ~8 mil nós avulsos são de interação/streaming e não fundem.

## Consequências

- O ADR-0228 e o ADR-0235 ficam **substituídos**. As medições deles continuam
  válidas como história e como método (sonda da SPEC-0227, `draws` conferidos,
  custo do instrumento descontado); a **conclusão** deixa de valer porque a
  premissa ("a cena não mora em C++") mudou.
- O ADR-0237 volta a valer nos marcos M5–M8, com o M5 redesenhado: desenho
  **dentro** do passe da cena (não depois do `render()`), e a RenderList (M4)
  entregue pela etapa (a).
- A decisão 1 do ADR-0244 fica **revista**: a condição de reabertura que ela
  mesma definiu foi atendida pela medição da R2b.
- O export nativo diverge mais do Studio. A divergência já tinha sido aceita
  (ADR-0237); o interruptor `?nativeMainPass=0` é a volta atrás e o instrumento
  de paridade.
- Cada etapa é reversível e mergeável sozinha; parar depois de (a) já deixa o
  host mais rápido e sem dívida.
