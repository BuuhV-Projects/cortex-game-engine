# SPEC-0277 - Playtest pelo editor (▶ Play) e sondas numéricas

**Data:** 2026-09-25
**Status:** aceito

## Contexto
Na sessão do crash-bandicoot-racer (ver ADR-0276), o `playtest_game` aprovou um kart que,
no Studio do usuário, atravessava a pista. Motivo: o playtest bootava com `?play=1`,
direto em modo jogo, e nunca passava pela transição **editor → Play** — exatamente onde o
`CarSystem` do jogo apaga e reconstrói a colisão estática. O teste validava outro caminho.
Além disso, ele só devolvia **fotos**: física (altura do corpo, se está no chão) não se
lê em screenshot, e cada imagem enche o contexto e acelera a compactação.

## Decisão
**Gancho no engine (`attachEditor`, só no bundle de dev):** `window.__cortexPlaytest =
{ game, play(), stop(), isEditing() }`. `play`/`stop` fazem o mesmo que o botão ▶ Play /
F2; `game` dá às sondas acesso ao mundo/cena. `play()` devolve `false` (e não faz nada)
enquanto `game.isLoading` ou antes de o editor processar o primeiro quadro: Play apertado
durante a carga não vira transição edição→jogo (medido no crash: carga > 10 s).

**`playtest_game` (`runAndCapture.ts`):**
- `start: 'editor' | 'play'`, **padrão `editor`**: carrega SEM `?play`, espera o boot
  (`wait_for`/`waitMs`) e tenta o Play em polling (até 60 s) pelo gancho, até ele aceitar.
  Sem confirmação, avisa no console que seguiu em EDIÇÃO. Engine vendorizado antigo (sem
  gancho): recarrega em `?play=1` e avisa que a transição NÃO foi testada — clicar no
  botão às cegas foi descartado: o clique caía no meio da carga e deixava o editor
  dessincronizado (imagem em jogo, botão ainda "▶ Play"; medido no crash).
  `play` mantém o `?play=1` antigo.
- Nova ação `{ type: 'probe', js, label? }`: avalia JS naquele ponto da timeline e
  devolve o valor como TEXTO (`[probe label @ Nms] valor`). Ex.:
  `__cortexPlaytest.game.scene.getThreeScene().getObjectByName('kart').position.y`.
- Screenshot final automático só quando a timeline não tem `screenshot` **nem** `probe`:
  playtest só de números não manda imagem.
- Funções puras testáveis: `buildGameUrl`, `needsFinalScreenshot`, `formatProbe`.

**Prompt (seção Validação, `prompt.ts`):** bug de física/colisão/movimento se resolve
lendo o caminho do código e fazendo a conta com os números reais (`measure_glb`, rig)
antes de rodar; sonda numérica > screenshot; se o usuário diz que falha e o playtest diz
que funciona, o playtest está em outro caminho; memória só com fato confirmado.

## Consequências
- O playtest padrão reproduz o fluxo do usuário (editor → Play). Jogos sem editor usam
  `start: 'play'`.
- O gancho `__cortexPlaytest` só existe depois de re-vendorizar o engine no jogo; até lá o
  playtest roda como antes (`?play=1`), com aviso explícito, e sondas só leem o DOM.
- O gancho expõe o `Game` no `window` apenas em dev (o editor não existe em produção).
