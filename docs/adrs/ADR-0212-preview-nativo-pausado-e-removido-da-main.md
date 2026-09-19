# 0212 - Preview nativo pausado e removido da main

**Data:** 2026-09-19
**Status:** aceito

## Contexto

O PRD-0007 propôs trocar o `<iframe>` do preview do Studio pelo host nativo
embutido na janela, estilo Unity: o mesmo renderer que vai para a loja rodando
durante a autoria. M0 a M4 foram implementados e mergeados no mesmo dia
(SPEC-0199 a 0211).

No primeiro uso real, o preview nunca chegou a ser utilizável. Cada correção
revelou o defeito seguinte:

| rodada    | sintoma                          | causa                                            |
| --------- | -------------------------------- | ------------------------------------------------ |
| SPEC-0201 | janela solta, em fullscreen      | host do repo desatualizado, sem o shim de embed   |
| SPEC-0210 | **Studio travou** (hang)         | `SetParent` cross-process acopla filas de mensagem |
| SPEC-0211 | jogo desenha e não responde      | `WS_EX_NOACTIVATE` impede foco, logo não há teclado |
| —         | **12 fps** no palco              | não investigado                                   |

Quatro horas de sessão, três rodadas de correção, e o preview seguia inutilizável
para o trabalho do dia a dia. Decisão do usuário:

> "não faz sentido seguir com isso. É melhor investir em melhorar a performance
> da versão do electron browser caso seja possível e deixar o nativo apenas para
> a versão final que vai pra loja."

É a leitura certa do custo/benefício: o preview nativo é um meio (ver o que roda
enquanto se autora), não um fim, e o fim — performance de autoria — pode ser
perseguido direto no Studio, que é onde o trabalho acontece hoje.

## Decisão

**O preview nativo sai da main.** O trabalho fica preservado, completo e
funcional, na branch publicada `feature/preview-nativo-no-studio` (até
`e43b29c3`), com todas as specs e testes.

Alternativa considerada e descartada: **manter na main atrás da flag
experimental** — que é como já estava. O problema é que código de integração
inerte não fica de graça: ele participa do build, dos testes, do typecheck e das
revisões, e envelhece junto com o Studio sem ninguém exercitá-lo. Como a retomada
não tem data, a branch preserva melhor do que a flag.

### Sai da main

Da IDE: `electron/nativePreview.ts`, os IPCs `native-preview:*`, o item do menu
`Projeto`, `startNative`/`stopNative`/`buildAndStartNative` no `Preview`, o
portão de airspace (`airspace.ts`, SPEC-0211) e a geometria do palco
(`previewBounds.ts`, SPEC-0207).

Da engine: `HostChannel` (SPEC-0200/0206) e o `hostTransport` da ponte do editor
(SPEC-0203) — a ponte volta a ter só o transporte de `iframe`, que é o que o
Studio usa.

Do host: o canal IDE (`ide_channel`), o controle de janela (`window_control`) e
o `attachToParent` do embed, com os scripts de teste correspondentes.

### FICA na main

O que o preview revelou sobre o host **não era sobre o preview**, e foi o maior
ganho da sessão:

- **Veículo raycast do Rapier** e a API de corpos/colliders que faltava
  (SPEC-0208/0209, Rust + C++ + `rapier-compat`). É o que faz o kart-racer rodar
  no host — decisão explícita do usuário ao aprovar esta remoção.
- **`setInterval`/`clearInterval`** no host (SPEC-0204): a ausência derrubava o
  boot de qualquer jogo que usasse a API.
- **`PerfTrace`** (SPEC-0198) — foi ele que diagnosticou a última rodada, lendo
  `input:0` com a câmera parada.
- **Recriação da surface no resize** (SPEC-0199): vale para o jogo em janela.
- **`pointermove`/`wheel` no host** e `HTMLElement` no dom-lite: input e DOM-lite
  servem a qualquer jogo.
- **Cache de preset de material e shadow caster culling** (SPEC-0196/0197), que
  são da engine e valem nas duas pilhas.
- O caminho `--editor` do export nativo: é uma flag do exportador, opt-in, e não
  depende de nada da IDE.

## Consequências

- O Studio volta a ter **um** caminho de preview: o `<iframe>`. Menos superfície,
  menos IPC, menos estado.
- **A perf de autoria passa a ser atacada no Studio/browser**, revertendo para
  este fim a regra de "medir só no nativo" — que continua valendo para o que vai
  à loja.
- O host nativo segue sendo o runtime de produção, e hoje roda **mais** jogos do
  que antes desta sessão (o kart-racer não subia nele).
- Retomar custa um merge da branch preservada. O que envelhece nela é a
  integração com o Studio (`Preview.ts`, `main.ts`), não o host.
- O PRD-0007 passa a **pausado**, com o ponteiro para a branch.
