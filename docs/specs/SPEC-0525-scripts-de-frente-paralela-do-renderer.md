# SPEC-0525 — Scripts das frentes paralelas do renderer nativo (preparar worktree, checar sub-etapa)

**Data:** 2026-10-24
**Status:** em implementação

Pedido do usuário (2026-10-24): "O que pudermos criar script sh para conseguir paralelizar
processos melhor ainda... E o claude apenas fica como coordenador, isso poupa token". As
sub-etapas R1.2–R1.5 do PRD-0466 correm em sessões paralelas, cada uma na sua worktree. Cada
sessão precisa de duas coisas repetidas, que hoje custam dezenas de chamadas e leitura de log:
preparar a worktree para trabalhar no `native/` e checar a sub-etapa pela regra de aceite do
PRD-0466 (testes + paridade + fumaça). Os dois viram um comando cada, com saída de uma linha.

## Como o Godot faz

O Godot (4.7.2, `ed1daf0b`) roda a mesma checagem por comando em toda mudança: um workflow
por plataforma (`.github/workflows/linux_builds.yml`, `windows_builds.yml`…) compila e executa
os testes do próprio binário (`--headless --test`, `linux_builds.yml:241`), e as checagens
estáticas são scripts em `misc/scripts/` (`check_ci_log.py`, `header_guards.py`…). A lição: a
checagem é um comando com veredito, não um roteiro que cada pessoa refaz.

## Como fazemos aqui

O kit SPEC-0382 já tem as peças: `lock.sh` (fila justa), `export.sh`, `round.sh`,
`validate.sh`, `gallery-capture.sh` (SPEC-0505) e o comparador `render-parity.mjs`. A paridade
na mesma execução (`?parityFreeze`, SPEC-0362) existe como `parity.sh` fora do repo
(`.cortex/rs-ceiling-patches/`), presa a uma worktree. Preparar uma worktree para o `native/`
tem armadilhas registradas (memória "build do host nativo em worktree"): `native/build` nunca
por junção (compila os fontes da main), e o host do checkout principal pode estar velho (achado
da SPEC-0505: o de 2026-10-09 não tem a API da SPEC-0393 e o DDD 61 morre no 1º tick).

## Comportamento

### `native/scripts/setup-worktree.sh <worktree>`

1. `yarn install --ignore-scripts --frozen-lockfile` se não houver `node_modules`.
2. Junção de `native/third_party` para o checkout principal, se faltar (só leitura; a memória
   confirma que funciona). **Nada de junção** em `native/build` nem em
   `native/rapier-native/target`: se `native/build` for junção, o script recusa.
3. `yarn build:host` **sob o lock** (o build satura a CPU), se o host não existir ou for mais
   velho que os fontes (`host-fresh`, abaixo).
4. Uma linha: `setup-worktree <wt>: deps OK | third_party OK | host OK (build 09:37) | yarn OK`.

### `native/scripts/check-stage.sh <worktree> <tag> [--flag '&k=v'] [--points 'setorO comercial']`

Uma checagem completa de sub-etapa, nesta ordem, parando no primeiro FAIL estrutural:

1. **host:** `cortex_host.exe` mais novo que todo arquivo em `native/src`,
   `native/rapier-native/src` e `native/CMakeLists.txt`; senão recompila sob o lock.
2. **export:** `export.sh` do DDD 61 (`STAGE_GAME`, padrão a cópia `e2be01c` da frente) e da
   galeria, em `D:/jogos/detetive-brasilia/.cortex/stages/<tag>/`.
3. **galeria:** `?parityFreeze` com a flag da etapa, quadros consecutivos capturados; veredito
   pelos pares (abaixo).
4. **paridade no jogo:** por ponto (`--points`, padrão `setorO comercial`), de dia e de noite
   (`&hora=21`), `?parityFreeze` + captura; exige o log `[parityFreeze] congelado`.
5. **fumaça:** 1 ponto (`SMOKE_POINT`, Comercial), 1 réplica, `--autopilot walk`, 1080p, com a
   flag; `validate.sh` VÁLIDO e `error_log.txt` vazio.

Saída: **uma linha** `check-stage <tag>: host OK | export OK | galeria PASS (alt 0/ctrl 0) |
setorO-dia PASS (…) | … | fumaça PASS render=… p95=… >33ms=…`; com FAIL, uma segunda linha com
a pasta dos logs. Exit 0 se tudo PASS, 1 se algum FAIL, 2 em erro de uso.

### Veredito de paridade (`native/scripts/perf/parity-verdict.mjs <framesDir>`)

Com o jogo congelado e o braço alternando por quadro, os quadros pares são de um caminho e os
ímpares do outro:

- **controle** = pares (i, i+2): mesmo caminho; o maior `maxChannelDiff` deles é o piso de
  ruído;
- **diferença** = pares (i, i+1): caminhos diferentes; conta os pixels acima do piso de ruído.

PASS se em todo par de diferença no máximo `PARITY_MAX_PCT` (0,01%, o limiar do PRD-0466) dos
pixels passa do piso. Menos de `MIN_FRAMES` (4) quadros = FAIL ("captura curta").

### Caso de resposta conhecida

`?galleryPlant=flicker` na galeria troca a cor de uma esfera **a cada render**
(`onBeforeRender`, que roda mesmo com o jogo congelado). Os pares de diferença divergem e os de
controle não: o veredito tem de dar **FAIL**. Sem o plantio, o mesmo comando tem de dar PASS.

## Testes

- `tests/native/parityVerdict.test.ts`: quadros sintéticos — iguais = PASS; diferença alternada
  = FAIL; ruído igual nos dois tipos de par = PASS; menos de 4 quadros = FAIL.
- Execução real (sob o lock): galeria sem plantio = PASS e com `flicker` = FAIL.

## Riscos

| risco | cobertura |
| --- | --- |
| a checagem toma o lock por muito tempo e trava as outras frentes | cada passo pega e solta o lock sozinho (`round.sh`/`export.sh`), a fila é justa; o padrão de pontos é 2 |
| captura grava a tela de carregamento | exige o log de congelamento; o pulo de quadros cobre a carga |
| script editado em uso por outra frente | mudança só por arquivo novo + `mv` (regra do kit) |
