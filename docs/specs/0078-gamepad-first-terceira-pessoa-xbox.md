# SPEC-0078 - Engine gamepad-first (Xbox): poll central + 3ª pessoa no controle

**Data:** 2026-06-27
**Status:** aceito

## Contexto

O foco do engine é ser **100% jogável no controle de Xbox** (console-first), mas o
`ThirdPersonControlSystem` (SPEC-0074) era **mouse/teclado** e o `GamepadManager`
(ADR-0023), apesar de existir e estar exportado, **não era polado por ninguém** — o
estado nunca atualizava, então gamepad simplesmente não funcionava no jogo.

## Decisão

**1. Poll central no `Game`.** O `Game` agora instancia um `GamepadManager` e o expõe
como `game.gamepad`, chamando `gamepad.poll()` no **início do `_tick`** (antes de
`onUpdate` e `world.tick`) — assim qualquer System lê estado fresco no mesmo frame via
`game.gamepad.getAxis(0, …)` / `isButtonDown(0, …)`. Layout padrão: A=0, B=1, X=2,
Y=3, LB=4, RB=5, LT=6, RT=7; eixos 0/1=stick esquerdo, 2/3=stick direito.

**2. `ThirdPersonControlSystem` gamepad-first.** Recebe o `game.gamepad` (5º arg do
construtor, opcional) e passa a aceitar:
- **stick esquerdo** → anda relativo à câmera, **analógico** (magnitude do stick
  escala a velocidade entre 0 e walk/run; deflexão parcial = anda mais devagar);
- **stick direito** → orbita a câmera (`padLookSpeed`, `invertLookY` opcionais);
- **A (botão 0)** → pula (borda de pressão);
- **RT (botão 7)** → corre.

Mouse/teclado seguem como **fallback** no mesmo update (stick tem prioridade se
defletido). `setupThirdPerson` repassa `game.gamepad` automaticamente — jogos não
mudam nada.

## Consequências

- Personagem 3ª pessoa jogável 100% no controle, sem tocar no jogo (só `setupThirdPerson`).
- Base pra **qualquer** System de jogo ler gamepad (ex.: controlador de carro do
  DDD-61-CORTEX, que entra/sai por proximidade + botão A) — o veículo é **lógica do
  jogo**, não do engine.
- O poll é único e central (1×/frame); Systems nunca chamam `poll()`.
- Triggers (LT=6/RT=7) têm leitura **analógica** via `gamepad.getButtonValue(i, btn)`
  (0..1, guarda `.value` no poll) além do booleano `isButtonDown`. Usado pelo carro do
  DDD-61-CORTEX (RT acelera, LT freia/ré com pressão proporcional).
- Auto-reconexão do gamepad já vem do `GamepadManager` (SPEC-0067): o poll redetecta o
  pad e os listeners `gamepadconnected`/`disconnected` forçam re-sync — coberto por teste.
