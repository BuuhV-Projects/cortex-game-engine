# 0227 - Sonda de fases do render

**Data:** 2026-09-20
**Status:** aceito

## Contexto

A SPEC-0225 mediu o caminho de render do host nativo e chegou a:

```
render = 10,4 ms fixo + 88 us por draw
  dos quais:  15 us = ponte JS->C++ (17% do render)
              73 us = three em JS, antes de chegar na ponte (83%)
```

Com isso caiu a hipótese de mover a **submissão** de draw para C++: o teto é
17% do render e não paga. O que resta como alavanca estrutural é mover o
**trabalho por objeto** — travessia de matriz, frustum culling, montagem e
ordenação da RenderList, `renderObject`/bindings. Só que "73 us de `three` em
JS" é um bloco opaco: mover a fase errada custaria meses e entregaria pouco,
exatamente como teria acontecido com a submissão.

Falta, portanto, **dividir os 73 us entre as fases**. A hipótese a testar é que
a maior parte esteja no `renderObject`/bindings, que roda por objeto por passe
— e não na travessia de matrizes, que é o palpite comum.

Isto só se tornou possível com a SPEC-0226: antes, `performance.now()` caía em
`Date.now()`, com resolução de 1 ms, cega para o que custa microssegundos.

### O que o renderer faz, e onde

O host bundla o `three` de `node_modules/three/build/three.webgpu.js` — rollup
**não minificado**, com os nomes preservados. As fases são métodos de
`Renderer.prototype` (a superclasse comum do `WebGPURenderer`), o que permite
instrumentar por **wrapper de método**, do lado do engine, sem patch em
`node_modules`:

| Fase | Método | Fonte ESM |
| --- | --- | --- |
| travessia de matriz | `Object3D.updateMatrixWorld` | `src/core/Object3D.js` |
| culling + RenderList | `Renderer._projectObject` | `src/renderers/common/Renderer.js:3050` |
| loop por objeto | `Renderer._renderObjects` | `Renderer.js:3253` |
| objeto + bindings | `Renderer.renderObject` | `Renderer.js:3388` |

## Decisão

Criar `src/core/RenderPhaseProbe.ts`: uma sonda que embrulha esses métodos e
acumula, **por frame**, o tempo de cada fase; os valores entram no
`perf-trace.jsonl` com o prefixo `rp` (`cpu.rpMatrix`, `cpu.rpProject`,
`cpu.rpObjects`, `cpu.rpEach`), no mesmo mapa `cpu` em que a SPEC-0225 pôs o
`napi` — e, como ele, **subconjuntos de `render`**, que não se somam ao total.

Seis decisões de desenho, cada uma para não contaminar a medição:

1. **Guarda de reentrância.** `updateMatrixWorld` e `_projectObject` são
   recursivos: cronometrar toda chamada contaria a mesma árvore uma vez por nó.
   A sonda cronometra só a chamada de **topo** (profundidade zero).
2. **Tempo próprio, não total** (aprendido na 1ª medição, não no papel). As
   fases se **aninham**: o renderer chama `updateMatrixWorld` dentro dos passes.
   Medindo tempo total, os baldes se sobrepõem — a primeira rodada deu
   `matrix + project + objects = 27,8 ms` contra `render = 24,3 ms`, ou seja um
   resto **negativo** de −3,6 ms, que é a assinatura de dupla contagem. A sonda
   passou a guardar **tempo próprio**, no modelo de pilha de um profiler: ao
   entrar numa fase, o relógio de quem a chamou pausa; ao sair, retoma. Os
   baldes ficam disjuntos e somam, no máximo, o `render`.
3. **Janela do render.** `updateMatrixWorld` também é chamado pelos sistemas do
   jogo (o `?bench&hold&jitter`, por exemplo, chama na câmera todo frame). A
   sonda só acumula entre o começo e o fim do `render()` — fora dele, ignora.
4. **Dois níveis.** O nível 1 (`rpMatrix`, `rpProject`, `rpObjects`) custa três
   pares de leitura de relógio por passe e responde à pergunta principal. O
   nível 2 (`rpEach`, dentro de `renderObject`) custa **dois por objeto** — com
   ~385 draws, é intrusivo o bastante para mudar o que mede. Fica atrás de flag
   própria e só é ligado depois que o nível 1 apontar para lá.
5. **Custo do relógio medido, não presumido.** Cada `performance.now()` no host
   é uma travessia NAPI. A sonda calibra no boot (N leituras em laço, tempo
   dividido por N) e grava `clockNs` no trace: sem esse número não dá para
   saber se um balde pequeno é trabalho ou é o instrumento.
6. **Resolução verificada, não assumida.** A mesma calibração registra o menor
   delta não-zero entre leituras consecutivas (`clockResNs`). Se a SPEC-0226
   não estiver de pé no binário em teste, isso sai como ~1.000.000 ns e a
   medição inteira é descartada — em vez de produzir baldes zerados que
   pareceriam "fase barata".

O `resto` (sort, `finish`, setup de passe, pós) não ganha balde próprio: é
`render - (matrix + project + objects)`, e só vira balde se a subtração mostrar
que vale.

**Ligar:** `?renderPhases=1` na query (no host, via `CORTEX_LAUNCH_QUERY`),
mesmo padrão do `?cortexHud=1`; `?renderPhases=2` liga também o nível 2.
Desligada, a sonda não embrulha nada — custo zero no jogo em produção.

## Consequências

- O `perf-trace.jsonl` ganha campos; quem lê o trace por nome de campo não
  quebra (mapa `cpu` já é aberto, foi assim que o `napi` entrou).
- A sonda depende de **nomes privados do `three`** (`_projectObject`,
  `_renderObjects`). Um bump de versão pode renomeá-los. Por isso ela **falha
  alto**: se um método esperado não existir, avisa por `debug()` e se desliga,
  em vez de gravar zero silenciosamente — zero é indistinguível de "fase
  barata", que é justamente a conclusão errada que este instrumento existe
  para evitar.
- É instrumento de diagnóstico, não de produção: fica desligado por default.

## Como medir com ela (método, não sugestão)

Vale o método que já custou caro para ser estabelecido:

- `CORTEX_LAUNCH_QUERY="?bench&renderPhases=1"` — a IA pilota, sem entrada
  sintética; `&hold` segura a cena parada e `&hold&jitter` sacode a câmera por
  um epsilon, para isolar uma variável.
- Comparar **medianas** de `cpu.render`, dos baldes `rp*` e de `draws`. Nunca
  `fps`/`frameMs`, que saturam em 100 ms.
- Conferir que `draws` ficou igual entre os lados; se mudou, a comparação está
  contaminada por trajetória.
- O `--debug` custa ~2x o frame: os **deltas** valem, o **absoluto** não.

## Resultado medido (20/09/2026, kart-racer)

Cenário `?bench&hold` (cena parada), **383 draws idênticos nas três rodadas**,
export `--debug`, máquina ociosa, janela minimizada. Medianas de 128-129
amostras. O relógio da SPEC-0226 apareceu com **resolução de 100 ns** — sem ele
nada disto seria mensurável.

**O custo do próprio instrumento, medido e não presumido** (é por isso que
existe a rodada de nível 0):

| nível | render | sobre o nível 0 |
| --- | --- | --- |
| 0 (sonda desligada) | 21,40 ms | — |
| 2 (fases + por objeto) | 22,60 ms | +1,20 ms (+5,6%) |
| 3 (abre o `renderObject`) | 24,55 ms | +3,15 ms (+14,7%) |

As fases, com o `render` sem instrumento em **21,40 ms / 55,9 us por draw**:

| fase | ms | % do render | us/draw |
| --- | --- | --- | --- |
| `renderObject` (nível 2) | 12,83 | **57%** | 33,5 |
| `updateMatrixWorld` | 4,54 | 20% | 11,8 |
| culling + RenderList | 4,04 | 18% | 10,5 |
| laço `_renderObjects` em si | 0,24 | 1% | 0,6 |
| resto (sort, finish, setup) | 0,95 | 4% | 2,5 |

**A hipótese da spec estava certa e o palpite comum, errado:** o trabalho por
objeto do `renderObject` vale quase três vezes a travessia de matrizes. O laço
que percorre a RenderList não custa nada — 1% —, tudo está dentro do
`renderObject`.

Aberto por dentro (nível 3), em proporção do próprio `renderObject`:

| dentro do `renderObject` | us/draw | % dele |
| --- | --- | --- |
| `_nodes.*` (sistema de nodes/materiais) | 13,1 | 33% |
| `backend.draw` (submissão, inclui a ponte) | 7,0 | 18% |
| `_objects.get` (cache de RenderObject) | 6,0 | 15% |
| `_bindings.updateForRender` (uniform buffers) | 4,7 | 12% |
| `_pipelines.*` | 4,2 | 11% |
| `_geometries.updateForRender` | 1,7 | 4% |
| o resto do próprio `renderObject` | 3,4 | 8% |

Uma observação que não era esperada: **a travessia de matriz custa o mesmo com
a cena parada (4,54 ms) e com a corrida em andamento (4,94 ms)**. O custo é
percorrer a árvore, não multiplicar matrizes — o que muda o alvo de "otimizar a
matemática" para "não percorrer".

## Próximo passo (o que isto destrava)

A divisão mostra que **a fase que domina não é uma fatia vertical**: o
`renderObject` é 57% do render, mas um terço dele é o sistema de nodes, que é
o coração do renderer de materiais do `three` — migrá-lo não é uma fatia, é
reescrever o renderer. As fases de fato isoláveis são a travessia de matriz
(20%) e o culling/RenderList (18%): juntas, 38% do render, e ambas exigem
manter a hierarquia de cena espelhada em C++.

A decisão de seguir (ou não) fica registrada em ADR próprio, com estes números
na mesa.
