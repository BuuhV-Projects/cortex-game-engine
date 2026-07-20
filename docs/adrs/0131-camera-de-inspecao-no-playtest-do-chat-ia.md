# 0131 - Câmera de inspeção no playtest do Chat IA

**Data:** 2026-07-20
**Status:** aceito

## Contexto

A tool `playtest_game` do Chat IA (ADR-0033) sobe o jogo numa janela oculta com
`?play=1` pra rodar a **gameplay** e tirar screenshots. Isso força o boot em modo
jogo (`editorState.active = false` em `attachEditor`), com duas consequências que
travavam a IA:

1. **A câmera renderizada é a de gameplay** — que segue o player e tem
   enquadramento fixo. O render escolhe `this._editor?.activeCamera() ?? this._activeCamera`
   (`Game._tick`), e `activeCamera()` só devolve a câmera livre do editor **quando
   o editor está ativo**; em `?play=1` ele está desligado, então sobra a do jogo.
2. **O `eval_js` não tinha alça pra câmera nenhuma.** Ele roda `executeJavaScript`
   na página, mas nada era exposto no `window` pra mover/orbitar a câmera. Mesmo
   agarrando a câmera de gameplay, o sistema de follow a sobrescreveria no próximo
   frame.

Resultado: a IA ficava presa ao ângulo da câmera do jogo e **não conseguia
inspecionar o cenário montado** (ver de cima, de lado, enquadrar a fase inteira) —
justamente o que ela precisa pra validar montagem de cena.

Bootar em **modo editor** resolveria a câmera livre, mas traria HUD/gizmos/helpers
(frustum da câmera, visuais de luz, grade) pra dentro do screenshot, poluindo a
leitura, e pausaria a gameplay.

## Decisão

Adicionar uma **câmera de inspeção** dedicada ao engine (`src/core/InspectCamera.ts`),
separada da câmera do jogo e da do editor:

- **`Game.inspect`** (getter, cria sob demanda) expõe a `InspectCamera`. Quando
  `active`, o `Game._tick` renderiza o frame **por ela**, vencendo a câmera do
  editor e a do jogo. Render **cru** (sem pós-processamento), como o do editor, pra
  leitura geométrica limpa. A gameplay segue rodando (`world.tick`) — só a câmera
  do render muda, então dá pra observar a cena viva de qualquer ângulo.
- **API declarativa:** `orbit({ yaw, pitch, dist, target })` orbita um alvo (sem
  `dist` = auto-enquadra pelo bbox); `pose(pos, lookAt)` é pose explícita;
  `frame()` enquadra a cena inteira; `clear()` desativa. O auto-enquadramento
  **ignora helpers do editor** (vivem em outra layer) e **backdrops gigantes**
  (skybox > 1000u) pra a distância não recuar ao infinito.
- **`window.__cortexInspect`** é exposto pelo `attachEditor` (bundle de dev, que o
  playtest sempre carrega — mesmo com `?play=1`) delegando pra `game.inspect`
  usando a **cena ativa**. Assim o `eval_js` também pode controlar a câmera.
- **Parâmetro `camera` na tool `playtest_game`** (`{ orbit } | { pos, lookAt } | { fov }`):
  o `runAndCapture` traduz pra chamadas em `window.__cortexInspect` aplicadas
  **após o boot/`evalJs`, antes das `actions`** (fica ativa por todo o playtest —
  todas as fotos saem por ela). Preferimos parâmetro estruturado a exigir three.js
  cru no `eval_js` (menos frágil pra a IA).

## Consequências

- A IA agora inspeciona o cenário de qualquer ângulo com `playtest_game({ camera: … })`
  sem escrever three.js — fecha o gap de "montei a cena mas não consigo ver se
  ficou boa".
- `InspectCamera` é **API pública** do engine (exportada em `index-runtime.ts`,
  registrada em `VENDOR_TYPE_MODULES`): qualquer jogo pode usar `game.inspect` pra
  cutscenes/fotos/replays de ângulo livre. Rodar `docs:engine` ao mexer nela.
- Render de inspeção é **cru** (sem PostFX): a IA vê a geometria/materiais, não o
  look final com bloom/mood/fog. É proposital (clareza), mas não é a "foto de
  marketing" — pra isso, use a câmera do jogo.
- `window.__cortexInspect` só existe no **bundle de dev** (via `attachEditor`); em
  produção não há editor, então nada é exposto no `window` do jogo final.
- Nova câmera por `Game` (criada só quando `inspect` é acessado): custo zero até o
  primeiro uso.
