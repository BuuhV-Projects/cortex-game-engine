# SPEC-0165 - Tela de Controles (remapeamento) no export PC/Steam

**Data:** 2026-07-28
**Status:** aceito
**Depende de:** [ADR-0164](../adrs/ADR-0164-acoes-de-input-remapeaveis-na-engine.md)
(camada de ações), [SPEC-0124](0124-i18n-config-ini.md) (config.ini),
[ADR-0123](../adrs/0123-ui-dom-lite-nomes-html5.md) (UI de runtime DOM-lite)

## Contexto

Jogador com controle genérico abre o jogo e os comandos saem trocados (A pula em
um pad, abre menu em outro; stick esquerdo vira câmera). Sem tela de
remapeamento, a única saída é trocar de controle. O ADR-0164 criou a camada de
ações; esta spec descreve **a tela** que o jogador usa, o fluxo de captura, a
persistência e o gate de plataforma.

## Decisão

### Onde aparece

Menu **Opções → Controles**, alcançável do **título** e do **menu de pausa**.
Só existe quando `gamePlatform()` é `pc` ou `steam`; em `xbox` a entrada some do
menu (a tela nem é construída).

```ts
const platform = await gamePlatform(); // 'pc' | 'steam' | 'xbox'
if (canRebindInput(platform)) menu.add(botaoControles);
```

### Layout

Lista rolável, uma linha por ação, agrupada por seção — o padrão de PC:

```
CONTROLES                                    [Restaurar padrão]

MOVIMENTO
  Para frente        W            Stick esq. cima
  Para trás          S            Stick esq. baixo
  ...
AÇÃO
  Pular              Espaço       A
  Correr             Shift        RT
INTERFACE
  Confirmar          Enter        A
  Voltar             Esc          B
```

Duas colunas de binding por ação: **teclado/mouse** e **controle**. Cada célula
é um botão focável; ativá-lo entra em captura. A lista mostra os grupos que o
jogo pedir (`groups`), default: `move`, `action`, `ui`.

### Fluxo de captura ("pressione uma tecla")

1. Jogador ativa a célula → ela vira `Pressione...` e a tela entra em modo
   captura (navegação da UI suspensa, senão a própria tecla navegaria).
2. O primeiro input **da família da coluna** é capturado: coluna teclado aceita
   `keydown` e botão do mouse; coluna controle aceita botão de gamepad e
   **deflexão de eixo** acima de `AXIS_CAPTURE_THRESHOLD` (0.6) — é assim que o
   jogador conserta um stick que caiu nos eixos errados.
3. **Cancelar** sem alterar: `Esc` no teclado ou o botão *Cancelar* da tela
   (clicável e focável). No modo controle o B **não** cancela — senão o jogador
   nunca conseguiria mapear o próprio B; ele é capturável como qualquer outro.
   Um botão já usado por outra ação **rouba** o binding dela, e a ação roubada
   fica `—` (padrão de mercado: avisar em vez de bloquear).
4. Grava, sai da captura, devolve o foco pra célula.

Sem timeout: a captura só sai por input válido ou cancelamento.

### Persistência

Ao sair da tela (ou a cada alteração), `actions.saveTo(config)` +
`config.save()`, gravando **só o diff** contra o default na seção `[input]`. Na
abertura do jogo, `actions.loadFrom(config)` aplica o que estiver salvo;
binding inválido no arquivo é ignorado (a ação cai no default) — arquivo editado
à mão nunca derruba o jogo.

### Regra Xbox (100% controle) e o paradoxo do controle quebrado

A tela é 100% navegável no controle **e** no teclado/mouse. A garantia importa
porque o jogador que chega aqui pode estar justamente com o controle mapeado
errado: **teclado e mouse sempre funcionam** na tela de Controles (o mouse
clica qualquer botão visível, SPEC-0133), então há sempre um caminho de conserto
mesmo com o pad ilegível. Depois de remapear `uiUp/uiDown/uiConfirm/uiBack`, a
navegação por controle passa a valer nos menus (`ui.useActions`).

### Glifos

Rótulos usam só o que a Roboto rasteriza no console: `A`, `B`, `LB`,
`RT`, `Stick esq. cima`, `Seta ‹`, `—`. Nada de emoji ou ícone de tecla.

### Textos

Todos via `t()` (SPEC-0124), chaves `input.action.<id>`, `input.group.<grupo>`,
`input.press`, `input.reset`, `input.none`. O jogo que não tiver as chaves vê o
fallback (a própria chave), sem quebrar.

## Estrutura de arquivos

| Arquivo | Papel |
| --- | --- |
| `src/input/bindings.ts` | parse/serialize/rótulo de binding (`key:w`, `pad:0`, `axis:1-`) |
| `src/input/defaultActions.ts` | catálogo default da engine (grupos move/look/action/ui/vehicle) |
| `src/input/InputActions.ts` | estado das ações: `isDown`/`pressed`/`value`/`axis`, bind, load/save |
| `src/input/captureBinding.ts` | captura do próximo input (teclado+mouse ou pad+eixo) |
| `src/input/ControlsScreen.ts` | a tela (UI de runtime), agrupada, com restaurar padrão |
| `src/core/gamePlatform.ts` | `gamePlatform()` / `canRebindInput()` lendo `cortex.json` |

## Consequências

- Jogo liga a tela com ~3 linhas (`showControlsScreen(game, game.actions, config)`),
  incluindo persistência.
- A tela é **dado de engine**, não do jogo: quem adicionar ações próprias as vê
  na lista automaticamente (basta `define`).
- Remapear "roubando" bindings pode deixar uma ação sem nenhum — é intencional e
  reversível por "Restaurar padrão".
- O `config.ini` ganha uma seção nova; arquivos antigos seguem válidos (seção
  ausente = tudo no default).
- Controle que o host nativo não reconhece continua invisível pro jogo — fase 2
  no `native/` (ver Consequências do ADR-0164).
