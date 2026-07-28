# ADR-0164 - Ações de input remapeáveis moram na engine (módulo opcional)

**Data:** 2026-07-28
**Status:** aceito
**Substitui:** ADR-0066 (na parte "camada de ações é exclusiva do jogo")

## Contexto

Jogadores de PC usam controles genéricos (não-XInput). Quando o layout do
dispositivo não bate com o layout `standard` do W3C, os comandos "não
funcionam": o A vira B, o stick esquerdo cai nos eixos 2/3, o d-pad some. A
saída padrão de mercado é uma tela de **remapeamento de controles**, e ela só
faz sentido no export **PC/Steam** (no console o layout é fixo e certificado).

O bloqueio pra fazer isso hoje é de **camada**: as teclas/botões estão cravadas
**dentro dos sistemas da engine**, não no jogo —
`ThirdPersonControlSystem` tem `isKeyDown('w')`, `isKeyDown(' ')`,
`isButtonDown(pad, 0)`, `getAxis(pad, 0..3)`; o mesmo em
`PlatformerInputSystem`, `FirstPersonCameraSystem`, `VehicleControlSystem` e
`InteractionSystem`. Até a **navegação da UI** (`UiLayer._pollGamepad`) crava
A=0 e d-pad=12..15. Um jogo não consegue remapear nada disso sem reimplementar
o controle de personagem inteiro.

O [ADR-0066](0066-abstracao-de-input-controls-factory.md) decidiu o oposto — "o
controle (ações + mapeamento + factory) é responsabilidade do JOGO" — pra
impedir que o engine cravasse o vocabulário de ações de UM jogo (o farm sim:
plantar, hotbar, usar ferramenta). Esse racional continua válido pras ações
**específicas de jogo**, mas ele previu a saída na última consequência:

> "Se no futuro vários jogos repetirem a MESMA camada de controle, aí sim vale
> extrair pra um pacote/utilitário **opcional** (fora do core), nunca cravado no
> engine."

É exatamente o caso: teste4, plataform-25d e dream-island-wonder repetem o mesmo
esquema (mover/pular/correr/interagir/pausar) e todos consomem os sistemas da
engine que cravam as teclas.

### Alternativas consideradas

1. **Camada de ações só no jogo (manter 0066 à risca).** Cada jogo escreveria a
   sua e teria que reimplementar `ThirdPersonControlSystem` pra que o
   remapeamento afetasse mover/pular — reescrever ~400 linhas de controle+câmera
   +animação por jogo pra trocar de onde vem um booleano. Recusada.
2. **Callbacks de leitura em cada sistema** (`readJump: () => boolean`, no
   estilo do `readMove` do `setupTopDown`). Resolve a camada sem vocabulário na
   engine, mas empurra pro jogo a persistência, a captura de tecla, a tela e o
   catálogo de ações — cada jogo reescreveria a tela de rebind inteira. Recusada
   como solução única; o `readMove` continua existindo pra quem quer controle
   total.
3. **Módulo opcional `src/input/` na engine (escolhida).** A engine passa a ter
   um catálogo **mínimo** de ações — só as que os **sistemas dela** já usam — e
   os sistemas leem por ação **quando recebem um `InputActions`**; sem ele, o
   comportamento é byte-a-byte o de hoje. O jogo declara as ações **dele** no
   mesmo mapa e não é obrigado a usar nada disso.

## Decisão

Novo módulo público **`src/input/`**, opcional, exportado pelo
`index-runtime.ts` e registrado em `VENDOR_TYPE_MODULES`.

### 1. Ação é um booleano nomeado (com valor analógico)

Não existe tipo "eixo" no modelo. Toda ação é um **botão** com id em inglês
(`moveForward`, `jump`, `uiConfirm`); eixo é um **par** de ações lido por
`axis(neg, pos)`. Isso mantém a persistência e a tela de rebind triviais (uma
linha por ação, como toda tela de PC) e ainda suporta analógico: uma ação
bindada a um eixo de stick responde `value()` de 0..1 pela magnitude, então o
stick continua analógico e a caminhada continua tendo meio-termo.

```ts
actions.isDown('jump')                     // bool
actions.pressed('jump')                    // borda (desde o último poll)
actions.value('accelerate')                // 0..1 (gatilho/stick analógico)
actions.axis('moveLeft', 'moveRight')      // -1..1
```

### 2. Formato do binding: `fonte:código`

| Token | Significado | Exemplo |
| --- | --- | --- |
| `key:<nome>` | `KeyboardEvent.key` normalizado (letra minúscula) | `key:w`, `key:Shift` |
| `pad:<n>` | botão do gamepad no layout standard | `pad:0` (A) |
| `axis:<n><+\|->` | eixo do gamepad com sentido | `axis:1-` (stick esq. p/ cima) |
| `mouse:<n>` | botão do mouse (0=esq, 1=meio, 2=dir) | `mouse:2` |

Teclas cujo caractere colide com o formato têm token nomeado: `" "` → `Space`,
`","` → `Comma` (a vírgula é o separador da lista). Uma ação aceita **N
bindings** (`jump=key:Space,pad:0`) e dispara com qualquer um.

### 3. Persistência: seção `[input]` do `config.ini`

Reusa o `GameConfig` (SPEC-0124) — mesmo arquivo ao lado do exe, gravável no
host nativo e com overlay de `localStorage` em dev. Grava **só o diff** contra o
default, pra o arquivo ficar legível e os defaults poderem evoluir:

```ini
[input]
jump=key:Space,pad:1
moveForward=key:w,axis:3-
```

### 4. Sistemas leem por ação, com retrocompatibilidade

`ThirdPersonControlSystem`, `PlatformerInputSystem`, `FirstPersonCameraSystem`,
`VehicleControlSystem` e `InteractionSystem` ganham `options.actions?:
InputActions`. **Com** o mapa, leem por ação; **sem** ele, mantêm exatamente as
teclas de hoje — nenhum jogo existente muda de comportamento sem optar. Os
`setup*` (`setupThirdPerson`, `setupPlatformer`, …) passam `game.actions`
automaticamente, então quem usa os atalhos ganha de graça.

`Game` expõe **`game.actions`** (criado com os defaults) e o pola 1×/frame no
`_tick`, logo após `gamepad.poll()` — ordem que garante bordas corretas.

O `UiLayer` também passa a aceitar um `InputActions` (`ui.useActions(actions)`),
pra que d-pad/A/B remapeados naveguem os menus. Sem ele, segue com os índices
fixos de hoje.

### 5. O vocabulário da engine é mínimo e o do jogo é aberto

A engine declara **só** o que os sistemas dela consomem, em grupos:
`move` (moveForward/Back/Left/Right), `look` (lookUp/Down/Left/Right),
`action` (jump, sprint, interact, pause), `ui` (uiUp/Down/Left/Right,
uiConfirm, uiBack, uiPrev, uiNext) e `vehicle` (accelerate, brake, handbrake).
O jogo registra as ações dele (`actions.define({ id: 'plantar', … })`) e escolhe
quais **grupos** a tela mostra. O engine não cria vocabulário de gameplay
específico — a preocupação que motivou o ADR-0066 continua respeitada.

### 6. Gate de plataforma sem tocar no C++

`export-game.mjs` grava `platform` no `cortex.json` do dist (`steam` com
`--steam`, `xbox` com `--xbox`, senão `pc`). O JS lê o mesmo arquivo por `fetch`
(que no host nativo é leitura de arquivo) — nada de shim novo. Ausência do campo
= `pc`, então Studio e browser mostram a tela pra teste.

## Consequências

- Remapeamento vira **recurso de engine**: qualquer jogo liga a tela com poucas
  linhas, em vez de reimplementar o controle de personagem.
- O ADR-0066 fica **parcialmente substituído**: a parte "o engine não crava
  vocabulário de gameplay" continua valendo; a parte "toda a camada de ações é
  do jogo" não. O `readMove` do `setupTopDown` e a liberdade de ignorar o módulo
  seguem intactos.
- Quem **não** passa `actions` não sente nada — os defaults reproduzem as teclas
  atuais, e há teste garantindo essa equivalência.
- Uma tecla remapeada pra algo bobo pode deixar o jogo sem "confirmar". A tela
  tem "Restaurar padrão", e apagar a seção `[input]` do `config.ini` também
  resolve (o arquivo é texto, ao lado do exe).
- **Não resolve** o controle genérico que o host nativo **nem enxerga**:
  `SDL_OpenGamepad` só abre dispositivo presente no banco de mapeamentos do SDL
  ([`native/src/shims/input.cpp`](../../native/src/shims/input.cpp)); fora dele,
  nenhum gamepad aparece e não há o que remapear. O fix é abrir joystick cru +
  `SDL_AddGamepadMappingsFromFile` — trabalho no `native/`, deliberadamente
  **fase 2** (registro próprio quando for feito).
- Custo por frame: um `poll()` que percorre ~24 ações lendo estado já em
  memória. Irrelevante perto do render (ver a memória de perf do host).
