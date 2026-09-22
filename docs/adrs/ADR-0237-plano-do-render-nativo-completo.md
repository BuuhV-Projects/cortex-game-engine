# 0237 - Plano do render nativo completo (fase 4)

**Data:** 2026-09-21
**Status:** parcialmente substituído por ADR-0244 (a ordem e o alvo de M5 e M6)

## Contexto

O ADR-0232 decidiu mover o laço de render para C++ e entregou três fases:

| fase | resultado medido |
| --- | --- |
| 1 — spike do laço | 2,2 us/draw em C++ contra 33,5 us/draw em JS |
| 2 — espelho de cena | travessia + culling de 1.300 nós: 0,023 ms contra 8,5 ms |
| 3 — ponte sem cópia | `rpMatrix` 4,5 → 0,205 ms; frame 38 → 31,7 ms (26,3 → 31,5 fps) |

E o ADR-0235 fixou o teto do que sobra: **enquanto o `three` percorrer os
objetos em JS, o ganho máximo é 17-18%**. Hoje o `renderObject` custa
**15,7 ms dos 18,5 ms de render** — 85%.

Este ADR é o plano para fechar essa lacuna: **o `three` sai do caminho de render
no export**.

### Correção do ADR-0232

A fase 3 daquele ADR dizia "culling, RenderList e sort nativos, **alimentando o
caminho de submissão que já existe**". Isso foi escrito antes do ADR-0235 e está
**superado**: alimentar a submissão existente é exatamente a hipótese com teto
de 17%. O que a fase 3 de fato entregou foi a ponte do espelho (SPEC-0234), e a
RenderList nativa migra para este plano.

### Premissa de produto (decidida pelo usuário)

**O Studio continua no `three`/browser, como ferramenta de autoria; o export
nativo passa a ter o próprio caminho de render.** A divergência entre editor e
jogo foi aceita explicitamente. A consequência de engenharia é que a paridade
deixa de ser automática e vira **verificação**, com um marco próprio (M7).

## Objetivo e definição de pronto

**Objetivo:** o render do export nativo custar **≤ 8 ms** com ~250 draws (hoje
18,5 ms), sem diferença visual perceptível contra o caminho atual.

Não é "60 fps" porque o render não é o frame inteiro: com `world` em 9,8 ms
(SPEC-0236), 60 fps depende também da frente do `CarSystem`, que é do jogo. Este
plano entrega **a parte do render**; o alvo de 16,7 ms por frame só fecha com as
duas.

**Pronto** quer dizer as quatro coisas juntas:

1. `cpu.render` ≤ 8 ms com ~250 draws, medido pelo método da SPEC-0227;
2. comparação de imagem contra o caminho `three` sem diferença acima do limiar
   (M7), na pista inteira e não num quadro só;
3. o caminho antigo continua funcionando atrás de flag, para voltar atrás;
4. o Studio segue idêntico ao que é hoje.

## Marcos

Cada marco tem critério numérico **antes** de ser executado, e a ordem importa:
os primeiros reduzem o escopo dos seguintes.

### M0 — Medir a pergunta em aberto: bindings e pipelines são cacheáveis?

O ADR-0235 deixou registrado que `_bindings` (12%) e `_pipelines` (11%) mudam
muito menos por frame que a matriz. **Se a maior parte desse custo for
recomputação do que não mudou**, existe ganho dentro do próprio `three`, e o
tamanho da fase 4 encolhe.

- **Como:** sonda da SPEC-0227 no nível 3, contando quantas vezes por frame o
  bind group/pipeline de um objeto é **reconstruído** contra **reaproveitado**.
- **Decide:** se >70% for reaproveitável e o custo cair com cache, M1-M6 passam
  a valer só para o restante; se não, seguem como planejado.
- **Custo:** horas, não dias. É o marco mais barato e o que mais pode economizar.

> **Medido em 21/09/2026 — não há ganho de cache.** Contando o retorno de
> `_nodes.needsRefresh` por frame no `kart-racer` (258 draws, mediana de 93
> amostras): **180 objetos refazem (69%) contra 80 que reaproveitam (31%)**. O
> critério era >70% reaproveitável; deu menos da metade disso.
>
> A leitura é que o trabalho de bindings e pipelines é, em sua maior parte,
> considerado **necessário pelo próprio `three`** — não é recomputação de coisa
> parada. Isso fecha a pergunta que o ADR-0235 deixou em aberto: **não existe
> atalho dentro do JS**, e o caminho é o trabalho ficar mais barato, não ser
> pulado. M1-M6 seguem com o escopo integral.

### M1 — Descrição de material independente de backend

O `three` resolve material por objeto, em JS, via sistema de nodes. O C++ não
pode consumir isso. Precisa de um **formato de descrição** que o JS produza
**uma vez por material** (não por frame) e o C++ entenda.

Cobertura mínima, tirada do que os jogos usam hoje: cor base, metálico,
rugosidade, textura base, emissivo, `alphaMode`, `doubleSided`, e os presets
`toon`/`unlit` da engine (ADR-0105 e o cache da SPEC-0196).

- **Critério:** todo material do `kart-racer` e do `teste4` descrito sem perda
  visual; o que não couber no formato é marcado **"só three"** e continua no
  caminho antigo (é o escape hatch que impede o plano de travar num material
  exótico).

> **Medido em 21/09/2026 — 89,3% da cena descrita** (242 de 271 materiais do
> `kart-racer`). `src/render/MaterialDesc.ts`, com 10 testes.
>
> Duas descobertas no caminho, as duas invisíveis sem medir na cena **real**:
>
> 1. **O renderer WebGPU usa a família `*NodeMaterial`.** Aceitar só
>    `MeshStandardMaterial`/`MeshBasicMaterial` deixava 122 materiais de fora por
>    um detalhe de classe, não de aparência.
> 2. **45% dos materiais da cena são a casca de contorno** (inverted hull). Eles
>    têm `positionNode`, então pareciam TSL arbitrário — mas são um efeito
>    **conhecido**: extrusão pela normal, um vertex shader curto. A engine passou
>    a declarar a espessura em `userData` (`OUTLINE_THICKNESS_KEY`), e o contorno
>    virou um `ShadingModel` próprio. Só isso levou a cobertura de 44,3% para
>    89,3%.
>
> Os 29 que sobram são recusa honesta: 24 usam `roughnessMap` (textura de
> rugosidade, que o formato ainda não representa) e 5 são `MeshPhysicalMaterial`
> (clearcoat/sheen/transmissão). Ficam no caminho do `three` pelo escape hatch,
> exatamente como o marco previa.
>
> **Regra que o marco confirmou:** recusar em vez de aproximar. A tentação de
> tratar `MeshPhysicalMaterial` como standard existiria — e produziria diferença
> visual sutil, que é o modo de falha mais caro desta migração.

### M2 — Cache de pipeline em C++

`MaterialDesc` + layout de vértice → `WGPURenderPipeline`, com cache por chave.
O host já cria pipelines (é ele que implementa a API que o `three` chama).

- **Critério:** nenhum pipeline criado por frame em regime (medido por contador
  no trace).

### M3 — Bind groups e uniformes nativos

Um buffer de uniformes por objeto com **offset dinâmico** (o spike da fase 1
provou que isso é parte da vantagem: o `three` cria um bind group por objeto).
Texturas e samplers por material, não por objeto.

- **Critério:** `writeBuffer` por frame proporcional ao que **se moveu**, não ao
  total de objetos — a SPEC-0225 já mostrou que os uniformes de objeto parado
  não precisam ser reescritos.

### M4 — RenderList nativa

Montada em C++ a partir do `SceneMirror` (que já tem matriz e culling), com
ordenação: opacos agrupados por pipeline, transparentes por profundidade.

- **Critério:** ordem de desenho idêntica à do `three` para a mesma cena — é o
  que evita diferença de transparência, que é o erro visual mais provável aqui.

### M5 — Submissão nativa do passe principal

O C++ desenha; os objetos migrados saem do caminho do `three`.

- **Critério:** `cpu.render` ≤ 10 ms nesta etapa (ainda com sombras em JS), sem
  diferença de imagem.

### M6 — Passe de sombra nativo (CSM)

O mais arriscado depois dos materiais: três cascatas, e foi onde a precisão já
mordeu uma vez (SPEC-0234, as bandas na pista).

- **Critério:** `cpu.render` ≤ 8 ms e sombras sem bandas, conferido na pista
  inteira.
- **Alternativa se travar:** manter o passe de sombra no `three` e aceitar
  ~10 ms. O ganho principal já estaria capturado.

### M7 — Paridade visual verificável

Harness que roda a mesma volta nos dois caminhos e compara imagem quadro a
quadro, com limiar declarado.

- Sem isto, os marcos anteriores não podem ser considerados prontos: o modo de
  falha desta migração **não é crash, é imagem sutilmente errada**, e foi assim
  que as bandas de sombra passaram por uma captura antes de serem notadas.

### M8 — Flag de retorno e limpeza

O caminho `three` continua acessível por query/env no export, e o Studio segue
nele. Só depois de M7 estável é que o caminho nativo vira o padrão.

## O que fica de fora (e por quê)

- **Skinning e animação por osso** — a matriz de um osso muda por frame e quebra
  a premissa dos 63 nós dinâmicos. Fica no `three`.
- **Partículas** (ADR-0168) e **sprites 2D** — já têm caminho próprio.
- **UI de runtime** — já é composta nativamente (ADR-0105).
- **Materiais TSL customizados** — o escape hatch do M1 os mantém no `three`.

## Riscos, com mitigação

| risco | mitigação |
| --- | --- |
| **Imagem sutilmente errada** (o mais provável) | M7 é bloqueante; nenhum marco fecha sem comparação de imagem |
| **Precisão** (já mordeu) | o que espelha estado do `three` usa **double**, regra da SPEC-0234 |
| **Material exótico trava o plano** | escape hatch "só three" no M1 |
| **Transparência fora de ordem** | M4 exige ordem idêntica, verificada |
| **Meses sem entrega** | cada marco tem critério numérico e é reversível pela flag do M8 |

## Esforço, honestamente

M0 é horas. M1-M5 são o núcleo, e é **trabalho de semanas**, não de uma sessão —
cada um envolve C++ novo, teste e medição. M6 e M7 podem dobrar isso conforme o
CSM.

O plano é desenhado para **parar bem** em qualquer marco: depois de M5 já existe
ganho grande com sombras ainda em JS; depois de M2/M3, mesmo sem submissão
nativa, o cache pode render se o M0 apontar para lá.

## Ligações

Sucede o ADR-0232 (fases 1-3, com a fase 3 corrigida aqui) e o ADR-0235 (teto).
Depende de SPEC-0233/0234 (espelho e ponte) e da SPEC-0227 (sonda, que é como
tudo aqui é medido). O alvo paralelo, fora deste plano, é o `CarSystem`
(SPEC-0236).
