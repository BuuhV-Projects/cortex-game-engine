# SPEC-0291 — Refresh só de transformação (`TransformOnlyRefresh`)

**Data:** 2026-10-03
**Status:** aceito — decisão no ADR-0290

## Contexto

Ver ADR-0290: no host, cada peça que só se move (matriz de mundo muda, material
e geometria iguais) paga o refresh completo do three (~180 µs instrumentado).
Isso é o grosso do custo dos 5 rivais da fase 2 do crash-bandicoot-racer.

## Comportamento

`installTransformOnlyRefresh(renderer)` (`src/render/TransformOnlyRefresh.ts`)
substitui `renderer._nodes.needsRefresh` por um wrapper. Para cada render
object:

1. **Delega ao three** (comportamento atual, sem tocar em nada) quando:
   - `renderObject.bundle !== null`, `object.static === true`;
   - o monitor tem `hasNode` ou `hasAnimation`;
   - é a primeira vez do render object no monitor (sem dado no observer);
   - é o primeiro objeto do monitor neste `render()` (`monitor.renderId` ≠
     `nodeFrame.renderId`): é esse refresh que atualiza os grupos
     compartilhados (`render`/`frame`) e os `updateBefore` do passe;
   - o render tem MRT de velocidade;
   - a matriz de mundo **não** mudou (o three decide se há outra mudança);
   - o plano do objeto é inválido (ver abaixo).
2. **Só transformação:** copia `matrixWorld` para o dado do observer e chama o
   `needsRefresh` original. Se ele devolver `true` (outra mudança junto), devolve
   `true` → refresh completo do three. Se devolver `false`, aplica o plano e
   devolve `false`.

### Plano (um por render object, em cache num `WeakMap`)

- **Inválido** se algum `updateBeforeNode`/`updateAfterNode` for do tipo
  `object` (precisaria rodar por objeto; os de `render`/`frame` já rodaram no
  primeiro objeto do monitor).
- **Nodes:** os update nodes do tipo `object`, menos os `MaterialReferenceNode`
  cuja propriedade (primeiro segmento) está em `monitor.refreshUniforms`. O
  observer já garantiu que essas propriedades não mudaram.
- **UBOs:** os `UniformsGroup` dos bind groups **não compartilhados**. Em cada
  um, os uniforms cuja fonte (`nodeUniform.node`) **não** é a saída de um node
  excluído. Os demais — transformação, `TextureNode` (UV), `UniformNode` com
  `onObjectUpdate`, constantes — são comparados como o three compara.

### Aplicação

1. `nodeFrame.updateNode(node)` para cada node do plano (mesma chamada do
   three, inclusive o `updateReference`);
2. `ubo.updateByType(uniform)` para cada uniform do plano;
3. se algo mudou: as faixas alteradas viram **uma** (do menor início ao maior
   fim; o meio tem os mesmos bytes), `backend.updateBinding(ubo)` e
   `ubo.clearUpdateRanges()`.

### Ativação

- No `Renderer`, logo depois do `init()` do backend.
- Padrão: ligado no host nativo (`isNativeHost()`), desligado no browser/Studio.
- `?transformOnlyRefresh=0` desliga, `?transformOnlyRefresh=1` liga (vale nos
  dois).
- A instalação confere `renderer._nodes.needsRefresh` e
  `getNodeFrameForRender`. Se faltar algo, não instala e loga por `debug('perf')`.

### Contadores

`TransformOnlyRefresh.stats` (`fast`, `full`) conta, desde a instalação, quantas
vezes o caminho rápido foi aplicado e quantas uma peça que se moveu caiu no
refresh completo. É diagnóstico (probe). O `rpRefresh` da sonda já reflete o
efeito, porque o wrapper devolve `false` no caminho rápido.

## Testes

- Vitest (`tests/render/TransformOnlyRefresh.test.ts`), com fakes das peças do
  three e `Matrix4` real: só a matriz muda → `false`, nodes de material vigiado
  não atualizados, um `updateBinding` com uma faixa; matriz + material → `true`;
  parado → delega; cada condição de delegação; plano inválido; propriedade fora
  da lista entra no plano; nada mudou no UBO → nenhuma escrita; ausência dos
  internos → não instala.
- Paridade por pixel no host (captura RGBA do mesmo frame com a simulação
  ligada, antes × depois), com controle que prova que o comparador detecta a
  diferença (variante que não atualiza a matriz).
- Medição no host, ≥ 2 rodadas intercaladas por ponta: largada (níveis 0 e 3) e
  volta `-Bench`.

## Resultado (2026-10-03, host da worktree, máquina ociosa)

Probe `D:/Codex/2026-10-02/phase-2-runtime/moving-objects`, fase 2, simulação
ligada (`-Dynamic`), mesmo exe nas duas pontas. ANTES = bundle do src da main;
DEPOIS = bundle desta mudança. Rodadas intercaladas ANTES/DEPOIS.

**Largada, nível 0 (fps real, sem HUD), 3 rodadas por ponta:**

| | fps | p50 | p95 | `writeBuffer`/frame |
| --- | --- | --- | --- | --- |
| ANTES | 64,0 / 65,6 / 65,7 | 15,7 / 15,7 / 15,6 ms | 20,6 / 18,1 / 17,3 ms | 206 |
| DEPOIS | 68,3 / 68,6 / 71,5 | 14,0 / 13,8 / 13,7 ms | 18,9 / 16,8 / 15,2 ms | 169 |

**Largada, nível 3 (fases do render, mediana com os rivais andando), 2 rodadas:**

| | `render` | `rpBind` | `rpNodes` | `rpRefresh` | `rpCallsNodes` |
| --- | --- | --- | --- | --- | --- |
| ANTES | 13,3 / 13,4 ms | 4,51 / 4,56 ms | 4,14 / 4,24 ms | 61 | 260 |
| DEPOIS | 12,2 / 12,6 ms | 2,67 / 2,77 ms | 4,68 / 4,95 ms | 24 | 149 |

`rpNodes` DEPOIS inclui o próprio caminho rápido (o wrapper é instalado antes
da sonda, então ela o cronometra). O `rpRefresh` cai para o patamar sem rivais
(~17–24): o que sobra é o refresh de "primeiro objeto do monitor no render".
Contadores: `fast` 5485, `full` 0 — nenhuma peça móvel caiu no refresh completo.

**Volta `-Bench` (IA pilotando, 3000 frames), nível 0, 2 rodadas:**

| | fps | p50 | p95 |
| --- | --- | --- | --- |
| ANTES | 62,7 / 63,8 | 15,3 / 15,1 ms | 18,4 / 17,8 ms |
| DEPOIS | 69,9 / 70,4 | 13,5 / 13,5 ms | 16,8 / 16,3 ms |

Teto sem rivais (DEPOIS, `norivals`, 2 rodadas): 75,0 fps, p50 13,3 ms e p95 13,7
ms. É o **vsync de 75 Hz** do monitor (13,33 ms), não o custo da cena.

**Paridade por pixel:** captura RGBA 1920×1080 com a simulação congelada no frame
300 da corrida (rivais já deslocados, câmera seguindo o jogador),
`?transformOnlyRefresh=0` contra o padrão, mesmo bundle: **0 bytes diferentes**
em 2 pares, e 0 entre repetições da mesma ponta (determinístico). Controle: a
variante que não atualiza os nodes (matriz velha) difere em 35.271 pixels (1,7%,
máx. 249), concentrados nos karts. O comparador detecta o erro que este caminho
poderia causar.
