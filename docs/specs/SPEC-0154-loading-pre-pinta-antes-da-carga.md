# SPEC-0154 - Loading pré-pinta (e apresenta) antes da carga

**Data:** 2026-07-25
**Status:** aceito

## Contexto

No export nativo, a tela de loading de ENTRADA de fase nunca aparecia — e, na
troca de fase do teste4, a arte de fundo (`<img fill>`) do loading nunca era
vista (o usuário via só o gradiente + barra do quadro congelado do teardown).
Instrumentação no host provou a cadeia:

1. **No host, a carga inteira roda numa única "virada" de JS.** `fetch` é
   síncrono (`__cortexReadFile`), decodes idem — a cadeia de `await` da task de
   carga resolve toda em microtasks, sem nunca devolver o controle ao loop do
   host. O loop (`runFrame`: timers → microtasks → rAF → microtasks → present)
   só dispara `requestAnimationFrame` UMA vez por frame de host, então o loop
   de render do `runWithLoadingScreen` (agendado via rAF) **nunca dispara
   durante a carga**: quando o rAF enfim roda, o `finally` já desmontou a tela
   (zero pinturas — confirmado por log: nenhum render entre `show()` e
   `destroy()`).
2. **O que fica na tela durante a carga é o ÚLTIMO frame apresentado antes
   dela.** O present do frame N acontece DEPOIS do drain de microtasks de N —
   se a carga roda no drain de N, o present de N mostra o estado que o último
   `ui.render()` deixou na RT (o `finally` re-renderiza sem os widgets), nunca
   o loading.
3. **Imagem de fundo precisa de 2 pinturas.** O `backgroundImage` carrega
   assíncrono (`TextureLoader`): a pintura 1 dispara o load (o mesh nasce no
   drain, depois da RT já rasterizada) e só a pintura 2 posiciona/escala o
   mesh (`widget.dirty` — ver `RendererUiBackend._loadImage`). No fluxo do
   teardown do teste4 (2 rAF antes do `reset()`), o present do quadro COM a
   imagem era engolido pelo drain que rodava reset + carga da próxima fase —
   o quadro congelado era sempre a pintura 1, sem a arte.

No Studio nada disso aparece: fetch/decodes são async de verdade, a carga
atravessa dezenas de frames e o loop de rAF pinta normalmente.

## Decisão

**Pré-pintar e APRESENTAR a tela de loading antes de começar a task.** No
`runWithLoadingScreen` (e no `runWithRushLoading` do teste4 — spec 0016 do
jogo), depois do `show()` e antes do `await task(...)`:

```
pinta (ui.update(0) + ui.render())   // dispara o load da arte de fundo
await rAF                            // 1 frame de host: present + drain (arte decodifica)
pinta                                // arte aplicada (posição/escala) na RT
await rAF                            // present do quadro COM a arte
```

Só então a task roda. No host, o quadro congelado durante a carga passa a ser
o loading completo (com arte); no Studio o comportamento visível não muda (a
tela só aparece ~2 frames mais cedo). O loop dirty-por-progresso continua como
está — no Studio ele anima a barra; no host ele é inofensivo (não dispara
durante a carga).

Dois complementos (a 1ª versão desta spec deixou a barra congelada no estado
inicial do template — pílula no MEIO da casca, sem andar):

- **A barra é inicializada em 0% antes da pré-pintura** (`setProgress(msg, 0)`)
  — sem isso o quadro apresentado mostra os widgets como autorados no template
  (fill centralizado, rótulo e % sobrepostos).
- **`progress()` pinta na hora e devolve `Promise<void>`** que resolve no
  próximo rAF (= present do quadro no host). Task que **`await`a** cada
  `progress` faz a barra AVANÇAR por etapa também no export (custo: 1 frame por
  etapa); task que ignora o retorno segue como antes (barra estática no host,
  animada no Studio pelo loop dirty). O tipo do callback muda de `=> void` pra
  `=> Promise<void>` — compatível com quem ignora o retorno.

O caminho `enabled: false` (editor) segue intocado — sem tela, sem pré-pintura
(`progress` vira no-op que resolve imediato).

## Consequências

- Export nativo: entrar em fase (menu → fase, replay, next) mostra a tela de
  loading completa — antes o usuário via o menu/teardown congelado sem a arte.
- Custo: 2 frames (~33 ms) antes de começar a carga + 1 frame por `await
  progress(...)` da task, nos dois ambientes.
- A barra anda POR ETAPA no host (nos `await progress`), não continuamente —
  animação contínua exigiria fatiar a carga em turnos (fora do escopo).
- Armadilha documentada no `docs/cortex-native/architecture.md`: **nada que
  dependa de rAF roda durante uma carga single-turn no host** — UI que precise
  estar visível durante uma operação pesada tem de ser pintada e apresentada
  ANTES dela.
