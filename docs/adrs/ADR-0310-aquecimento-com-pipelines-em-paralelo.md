# ADR-0310 — Quadro de aquecimento com pipelines criados em paralelo

**Data:** 2026-10-07
**Status:** aceito (complementa o ADR-0262)

## Contexto

O ADR-0262 trocou o `compileAsync` do three por UM quadro real no
`game.precompile()`: gera as mesmas chaves de pipeline que o jogo pede. Mas nesse
quadro o three cria cada pipeline com `device.createRenderPipeline` (síncrono).
No navegador (Studio/vite) a chamada volta na hora e quem compila é o processo de
GPU do Chrome, **um atrás do outro**: o JS termina o `precompile`, o jogo começa e
o 1º quadro fica na fila atrás da compilação. No Detetive Brasília eram ~6 s de
jogo "pronto e congelado" (140 pipelines; 55 depois da SPEC-0109 do jogo).

Medido no Detetive Brasília (Chrome headless com GPU, perfil novo), do início ao
jogo revelado e liso:

| aquecimento | revela (s) | pipelines |
|---|---|---|
| quadro real, criação síncrona (hoje) | 9,4 | 55 |
| `compileAsync` do three + quadro real | 8,7 | 64 (variantes erradas) |
| quadro real, criação **assíncrona em paralelo** | **6,4** | 55 |

(números finais e repetições na SPEC-0309)

## Decisão

No quadro de aquecimento, o `Game` faz o three criar os pipelines com
`createRenderPipelineAsync` — **todos disparados no mesmo quadro** — e o
`precompile()` espera todas as promessas. O quadro continua sendo o render real
(mesmas chaves, os dois passes do transparente de duas faces): o descritor é
montado na hora, só a criação vira assíncrona. O Dawn compila os pipelines
assíncronos em paralelo, fora da fila.

Como: durante o quadro, `renderer._pipelines.updateForRender(ro)` passa a chamar
`getForRender(ro, promessas)` — o mesmo caminho que o `compileAsync` do three usa,
só que sem esperar objeto por objeto.

Só no navegador. No host nativo a criação é síncrona e o `createRenderPipelineAsync`
não ganha nada (ADR-0262 mediu o host); lá fica o caminho de hoje.

### Alternativas descartadas

- **`compileAsync` do three:** espera cada pipeline antes do próximo
  (`await Promise.all(C)` + `yield` por objeto) — serial — e compila a variante
  errada do transparente de duas faces (ADR-0262). Medido: mais lento que o
  paralelo e 9 pipelines a mais.
- **Só esperar a fila da GPU (`onSubmittedWorkDone`) depois do quadro síncrono:**
  tira o congelamento da tela (o jogo pode segurar o carregamento), mas não encurta
  nada — a compilação continua em série. O jogo pode fazer isso por conta própria.

## Consequências

- Mexe em interno do three (`_pipelines`); se a versão mudar o nome, cai sozinho no
  caminho síncrono de hoje (guarda por `typeof`).
- No quadro de aquecimento os objetos cujo pipeline ainda compila não são desenhados
  (o three pula com `isReady`); o quadro não é visto (fica sob a tela de
  carregamento), então não importa.
- O `precompile()` passa a resolver quando os pipelines ESTÃO compilados, não só
  pedidos.
