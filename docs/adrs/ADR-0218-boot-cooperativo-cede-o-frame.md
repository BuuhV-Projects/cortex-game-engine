# 0218 - Boot cooperativo: o carregamento cede o frame

**Data:** 2026-09-20
**Status:** aceito

## Contexto

No export nativo, a janela fica **preta durante todo o carregamento** e a splash
da engine (ADR-0109) não chega a aparecer — some atropelada no fim. Medido no
kart-racer (SPEC-0217): o `requestAnimationFrame` do jogo é agendado aos
**0,2 s** e só é atendido aos **9,8 s**.

A causa é estrutural, não é lentidão:

- no host o `fetch` é **síncrono** (`native/js/src/shims/net.js` →
  `__cortexReadFile`), então cada `await` do boot resolve numa microtask e a
  cadeia inteira roda sem devolver o controle ao host;
- o host só desenha a splash **dentro do loop** (`native/src/main.cpp`), que só
  roda depois de `runBoot` + `drainMicrotasks`;
- logo, **nada é apresentado** até o jogo inteiro estar montado.

Cortar segundos (SPEC-0217, 18,5 s → 9,8 s) melhorou o número, mas não a
experiência: continua preto, só que por menos tempo.

## Decisão

**O carregamento passa a ceder o frame periodicamente** — o `buildScene` chama
`await` num `requestAnimationFrame` a cada fatia de trabalho e informa progresso
por um callback. Com isso o loop do host volta a girar durante a carga: a splash
aparece em ~0,3 s e **anima**, e a tela de carregamento do jogo passa a pintar.

O mecanismo de tela (`runWithLoadingScreen`, SPEC-0154) já existia e já cede o
frame por etapa; o que faltava era a etapa mais longa — o `buildScene` — não
reportar nada nem ceder. É isso que muda.

### Alternativas consideradas

**Tornar o `fetch` do host assíncrono** (usar `__cortexReadFileAsync` + io_pool,
que já existem, M-perf-3). Resolveria a raiz: cada `await` cederia sozinho, sem
o engine precisar pedir. Recusada por ora porque (a) muda a semântica de I/O de
TODOS os jogos de uma vez, com risco de expor dependências de ordem que hoje
funcionam por acidente do I/O síncrono; (b) o boot faz centenas de leituras em
série, e cada uma passaria a custar um round-trip de frame — sem reescrever os
pontos de carga para `Promise.all`, o tempo total pioraria; (c) o ganho de
percepção é o mesmo que o da decisão tomada. Continua sendo o caminho certo se
um dia quisermos I/O paralelo de verdade.

**Apresentar a splash no host antes de `runBoot`** (C++, ~5 linhas em
`main.cpp`). Garantiria o logo mesmo num jogo que não cede nada. Recusada como
solução principal porque o logo ficaria **congelado** durante toda a carga, com
a janela sem responder ("não respondendo" do Windows) — troca preto por travado.
Continua valendo como rede de segurança, e fica registrado como possível
complemento (exige rebuild do host e repropagação pelo Studio).

### Política de cessão

Ceder tem custo, e a implementação mostrou que ele vem de dois lugares
diferentes — os dois medidos no kart-racer:

1. **O que se desenha no frame cedido.** Ceder durante a montagem fazia o
   `Game` renderizar a cena PELA METADE a cada frame: subir buffers e compilar
   pipeline do que acabara de nascer custava **626 ms por frame** e
   quadruplicou a montagem (1,6 s → 5,6 s). Por isso, durante uma carga o
   `Game` desenha uma **cena vazia** no lugar do cenário (um clear), e sob a
   splash não desenha nada — o host descarta esse frame de qualquer forma.
2. **A frequência.** Ceder por item serializaria a carga no vsync (é o que a
   SPEC-0154 já tinha aprendido ao desenhar a tela de loading só nas trocas de
   etapa). A cessão é por **orçamento de tempo**, e a fatia é adaptativa: 30 ms
   com a splash no ar (ela é uma animação e engasga com fatia longa), 250 ms
   depois dela (a tela de carregamento é estática).

Ceder só é barato **dentro de um carregamento declarado**, onde vale o item 1.
Fora dele o frame cedido renderiza a cena inteira: quando o `AssetLoader` passou
a ceder sem essa condição, a criação dos carros do kart-racer foi de 2,6 s para
8 s. Daí o escopo explícito (`Game.setLoading`, e o `buildScene` que o abre
sozinho enquanto monta).

### A splash não faz mais fade-out

Ceder não elimina os congelamentos: operações síncronas longas (merge estático,
`addTrimeshFromObject` do Rapier) ficam ~0,5 s cada sem devolver o controle, e a
splash — que só avança quando o loop roda — para no meio do que estiver fazendo.

O que decide se isso incomoda não é a duração, é **o que está animando**.
Congelar no meio de um fade parece travamento; congelar com a marca inteira na
tela parece intencional. Então o fade-out de 450 ms saiu
(`native/src/webgpu/splash.cpp`, ADR-0109): a marca **corta**, e quem assume é a
tela do jogo — estática, onde o congelamento não aparece. Para garantir que essa
tela seja realmente sólida, a cena vazia que o `Game` desenha durante a carga tem
fundo PRETO explícito: sem `background` o quadro não é limpo e o resíduo do
buffer anterior (o logo) reaparece como fantasma.

O fade-IN (350 ms) fica: ele roda no começo do boot, onde o JS ainda está leve.
A splash passa de ~1,9 s para ~1,45 s.

## Resultado

Medido no kart-racer exportado, do início do bundle:

| | antes (SPEC-0217) | depois |
| --- | --- | --- |
| primeira imagem na tela | 9,8 s (era o jogo) | **1,1 s** (o logo) |
| jogo pronto | 9,8 s | **~7,8 s** |
| o que se vê durante a carga | tela preta | logo animado → tela de carregamento |

O tempo até jogar também caiu porque o `precompile` (SPEC-0196), que antes só
progredia depois do primeiro frame, agora avança nos frames cedidos.

## Consequências

- `buildScene` passa a poder ceder o controle no meio: quem chamava contando com
  "monta tudo numa virada só" pode ver a cena parcialmente montada num frame
  intermediário. Na prática é o que já acontecia no browser (onde o loop roda
  durante a carga); o que muda é o host ficar igual.
- Ceder custa tempo de parede (cada frame cedido sob a splash paga vsync), mas
  no total a carga ficou MAIS RÁPIDA: 9,8 s → ~7,8 s, porque o `precompile`
  passou a avançar nos frames cedidos em vez de esperar o primeiro render.
- Um jogo que não passe `onProgress` continua ganhando a splash animada (a
  cessão não depende do callback), mas fica sem barra: depois da splash, a tela
  volta a ficar vazia até a cena aparecer. A tela de carregamento é do jogo.
- Um jogo cuja carga continua DEPOIS do `buildScene` (criar personagens,
  veículos, sistemas) precisa declarar isso com `game.setLoading(true/false)`,
  senão congela na última imagem apresentada durante esse trecho. São duas
  linhas, e sem elas o comportamento é o de antes — não quebra nada.
- Enquanto um carregamento está declarado, o `Game` NÃO desenha o cenário.
  Quem esquecer de fechar o escopo fica com a tela vazia: por isso
  `setLoading(false)` vai num `finally`, e o `buildScene` fecha o dele sozinho
  mesmo quando o build falha (coberto por teste).
- O `fetch` do host continua síncrono. Se no futuro ele virar assíncrono, os
  pontos de cessão explícitos ficam redundantes, não errados.
