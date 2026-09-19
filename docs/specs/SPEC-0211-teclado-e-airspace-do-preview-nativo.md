# 0211 - Teclado e airspace do preview nativo (correção da SPEC-0210)

**Data:** 2026-09-19
**Status:** aceito

> **Implementação REMOVIDA da main** (ADR-0212): o preview nativo no Studio foi
> pausado e este código vive na branch `feature/preview-nativo-no-studio`.
> A spec fica como registro do que foi construído e de por que funcionava assim.

## Contexto

Com a SPEC-0210 o preview nativo parou de travar o Studio: a janela do host
virou **owned** (`WS_POPUP` + `GWLP_HWNDPARENT`) em vez de filha, o que desfaz o
acoplamento de filas de mensagem do `SetParent` cross-process.

Só que o embed continuou **parecendo travado** para quem usa. O relato foi
"trava todo o Studio"; a medição diz outra coisa.

### O que a medição mostrou

`SendMessageTimeout(WM_NULL)` na janela do Studio com o host rodando:
**12 de 12 amostras responderam em 0 ms**. Não há hang — a SPEC-0210 resolveu o
que se propôs a resolver. O log de eventos confirma: nenhum `Application Hang`
depois do incidente original.

O `perf-trace.jsonl` do host embutido (SPEC-0198), 9,5 s de kart-racer:

```
{"t":513, "cpu":{"input":0,"update":0,"world":3489,...}, "cam":{"x":-46.7,"y":3.7,"z":89.9,...}}
{"t":9513,"cpu":{"input":0,"update":0,"world":3408,...}, "cam":{"x":-46.7,"y":3.7,"z":89.9,...}}
```

A câmera é **idêntica** em t=513 ms e t=9513 ms, e `input` é **0** em toda
amostra. O jogo está de pé e desenhando, mas nenhum evento de entrada chega:
não há como dirigir, nem mover a câmera. Um preview que desenha e não responde
é indistinguível de um Studio travado.

### Causa: `WS_EX_NOACTIVATE`

A SPEC-0210 aplicou, com este comentário:

```cpp
// NOACTIVATE: clicar no jogo não rouba o foco da IDE (é o que o iframe fazia).
SetWindowLongPtrW(self, GWL_EXSTYLE, WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE);
```

O comentário inverte o comportamento do iframe. Um iframe **recebe** o foco ao
ser clicado — ele faz parte da mesma janela do Chromium, e é por isso que o jogo
no Studio responde ao teclado. `WS_EX_NOACTIVATE` faz o oposto: a janela nunca
se torna a janela ativa, e **janela não-ativa não recebe `WM_KEYDOWN`**. Sem
teclado, não há jogo.

Confirmado na janela viva do host (pid do preview embutido):

```
EXSTYLE=0x08000080  NOACTIVATE=True  TOOLWINDOW=True
STYLE=0x94000000    POPUP=True  CHILD=False
```

### Causa secundária: airspace dos overlays do Studio

A janela owned fica **sempre acima do dono** e não é clipada por ele. A SPEC-0206
já tratou disso para o drag de asset (o host some durante o arraste), mas só para
esse caso: `previewVisible` é enviado em um único ponto do `Preview`.

Todo o resto do DOM que abre **sobre** o palco fica escondido atrás da janela do
host: os menus da menubar (`File`, `Cena`, `Projeto`…) e os modais, que no Studio
são sempre `<dialog>.showModal()`. Abrir um menu e não ver nada acontecer lê-se,
de novo, como Studio travado.

## Decisão

### 1. A janela do host pode receber foco

`WS_EX_NOACTIVATE` sai; fica só `WS_EX_TOOLWINDOW`. Clicar no palco ativa a
janela do host e o teclado passa a chegar no jogo — exatamente o que o iframe
fazia, e o que a SPEC-0210 quis dizer e escreveu ao contrário.

**Isto não reintroduz o hang.** O que acopla filas de mensagem entre processos é
`SetParent` (e `AttachThreadInput`), não a ativação de janela. A janela segue
owned, e a medição de responsividade continua no teste como regressão.

`SetWindowPos(..., SWP_NOACTIVATE)` no attach **fica**: subir o preview não deve
roubar o foco de quem está no meio de uma interação. O que muda é só o clique
posterior do usuário poder dar foco ao jogo.

### 2. Airspace com fontes nomeadas

`previewVisible` deixa de ter um único chamador e passa a ser decidido por um
portão com **fontes**: enquanto houver ao menos uma fonte pedindo o palco livre,
a janela do host fica escondida; quando a última solta, ela volta.

O portão é puro e vive em `electron/renderer/airspace.ts` (mesmo molde do
`previewBounds.ts` da SPEC-0207), para ser testável sem Electron:

```ts
const gate = new AirspaceGate()
gate.set('menu', true)   // → false (esconder): houve transição
gate.set('drag', true)   // → null   (já escondido): sem mensagem no canal
gate.set('menu', false)  // → null   (o drag ainda segura)
gate.set('drag', false)  // → true  (mostrar)
```

Só a **transição** vira mensagem no canal — duas fontes simultâneas não geram
tráfego redundante, e soltar uma delas não revela o host enquanto a outra
precisar do palco.

Fontes ligadas:

| fonte         | quem registra                                       |
| ------------- | --------------------------------------------------- |
| `asset-drag`  | `Preview.setAssetDropTarget` (comportamento da 0206) |
| `menu`        | `Shell`, ao abrir/fechar menu da menubar             |
| `dialog`      | `Preview`, observando `dialog[open]` no documento    |

Os modais do Studio são todos `<dialog>.showModal()` (`ProjectSettingsModal`,
`ExportProgressModal`, `customPrompt`), então um `MutationObserver` de um só
lugar cobre os três e qualquer modal futuro que siga o molde — sem obrigar cada
modal a se anunciar.

Esconder a janela ativa devolve o foco ao dono (o Studio), que é o que se quer
quando um menu ou modal abre.

## Consequências

- **Dirigir no preview nativo funciona.** O teclado chega ao jogo ao clicar no
  palco.
- **Foco segue o clique**, como no iframe: com o jogo focado, um atalho do Studio
  vai para o jogo até que se clique de volta na IDE. É o comportamento que o
  usuário já conhece do preview em iframe.
- Menus e modais voltam a aparecer sobre o palco; o host reaparece ao fechá-los.
- `previewVisible` agora tem três chamadores em vez de um, coordenados pelo
  portão. Uma fonte nova é uma linha — e o teste cobre a combinação.
- O gargalo de **10 fps** do kart-racer embutido (`render` 44 ms de CPU e ~52 ms
  por frame fora das seções medidas, com o processo em 0,7 núcleo) **não** é
  tratado aqui: é a frente de perf do jogo, registrada à parte.

## Validação

- `tests/airspace.test.ts` — o portão: transições, fontes simultâneas, soltar
  fora de ordem, limpar tudo.
- `native/scripts/test-embed.ps1` (estendido) — na janela do host embutida:
  - `WS_EX_NOACTIVATE` **ausente**;
  - a janela **aceita foco por um clique** — ver o método abaixo;
  - a janela dona **continua respondendo** com o host ocupado
    (`SendMessageTimeout(WM_NULL)`) — regressão da SPEC-0210;
  - `previewVisible` esconde e traz a janela de volta;
  - encerramento sem janela órfã.

Rodado com o export do **kart-racer** (debug + editor), que é o caso real do
relato:

```
estilo ok: sem WS_EX_NOACTIVATE
clique no host deu foco a ele (o teclado chega no jogo)
previewVisible=false escondeu a janela
janela dona seguiu respondendo com o host ocupado
OK: embed, bounds pelo canal e encerramento sem janela orfa
```

### Como testar ativação de janela (três armadilhas)

A primeira versão deste teste chamava `SetForegroundWindow` e falhava com a
janela **correta**. Três coisas atrapalham, e nenhuma tem a ver com o estilo:

1. **`SetForegroundWindow` entre processos é barrado** pela política de
   foreground do Windows quando o chamador não está em foreground. Ele falha
   mesmo numa janela perfeitamente ativável — testa a política, não a janela.
   Quem prova o contrato é o **gesto do usuário**: um clique sintético
   (`SetCursorPos` + `mouse_event`) no centro da janela.
2. **O clique acerta quem estiver por cima.** `HWND_TOP` não basta: a janela
   ativa de outro processo (o terminal que roda o teste) continua acima. O teste
   fixa o host em `HWND_TOPMOST` **só durante o clique** — z-order e ativação são
   coisas separadas, então isso não mascara o que está sob teste — e confere com
   `WindowFromPoint` quem realmente está sob o cursor antes de clicar, falhando
   com o **nome do processo** que estiver na frente em vez de um "não deu foco"
   cego.
3. **Espera fixa mente com jogo pesado.** O canal só é drenado na thread JS, um
   pouco por frame; a ~10 fps do kart-racer, os 3 s do `previewVisible` não
   bastavam e o teste acusava defeito inexistente. Virou polling com timeout.

O cursor é salvo e restaurado: o teste roda na máquina do desenvolvedor.
