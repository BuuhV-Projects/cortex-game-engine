# 0201 - Preview nativo embutido no Studio (M2 do PRD-0007)

**Data:** 2026-09-19
**Status:** aceito

## Contexto

Com o M0 (resize sem crash, SPEC-0199) e o M1 (canal por stdin/stdout,
SPEC-0200) prontos, falta o que o usuário vê: **o jogo rodando dentro do
Studio**, no lugar do `<iframe>`.

Duas restrições vinham do levantamento do PRD-0007:

- **Electron não reparenta HWND externo** — não há API para hospedar uma janela
  nativa de outro processo.
- **SDL3 só parenteia janelas dele mesmo**: `SDL_PROP_WINDOW_CREATE_PARENT_POINTER`
  espera um `SDL_Window*`, não um HWND de fora.

## Decisão

### Embed por Win32 puro, do lado do host

Com `CORTEX_PARENT_HWND=<hwnd>`, o host cria a janela **sem borda** (quem dá
moldura é a IDE) e a prende no pai com `SetWindowLongPtr(GWL_STYLE, WS_CHILD)` +
`SetParent` (`core::attachToParent`). Também zera o `WS_EX_APPWINDOW`, para a
janela sumir da barra de tarefas — ela é parte da IDE agora, não um app.

Falhar não é fatal: se o HWND for inválido, o host loga e segue como janela
solta. Preview desencaixado é melhor que preview nenhum.

### Quem posiciona é o HOST, não a IDE

A IDE mede o painel e manda `{ type: 'bounds', x, y, width, height }` pelo canal
da IDE; o host aplica com `SDL_SetWindowPosition/Size` (shim
`__cortexSetWindowBounds`, registrado **apenas** no modo embutido — um jogo
standalone não deve deixar o conteúdo mexer na própria janela).

Isso é o que evita FFI ou addon nativo no Electron só para chamar
`SetWindowPos`. As coordenadas são relativas à janela pai, que é exatamente o
que `getBoundingClientRect()` já dá.

### Lado Studio

`electron/nativePreview.ts` (módulo próprio, fora do `main.ts`): spawna o host,
separa as linhas do canal dos logs comuns, expõe `setBounds`/`send`/`stop`.
**Reenvia a geometria quando o `ack` chega** — o painel é medido antes de o JS
do host subir, e o primeiro `bounds` se perderia.

No renderer, `Preview.startNative(exportDir)` esvazia o palco e passa a reportar
o retângulo dele (via `ResizeObserver` + `resize` da janela). O palco fica vazio
de propósito: a janela nativa cobre a área, e DOM não compõe sobre ela
(airspace).

## Validação

`native/scripts/test-embed.ps1` cria uma janela no lugar do Studio e verifica os
três critérios do marco:

```
janela pai: 17958334
host embutido: janela 13042760 e filha de 17958334
apos bounds: 640x400
OK: embed, bounds pelo canal e encerramento sem janela orfa
```

Mais 8 unitários em `tests/electron/nativePreview.test.ts` (separação
canal/log, linha partida entre chunks, JSON inválido, reenvio no `ack`,
`stop` idempotente, export sem `launcher.exe`).

> Armadilha do teste, não do produto: `FindWindowEx` com classe/título `$null`
> dá falso negativo no PowerShell (o `$null` vira string vazia). O teste usa
> `EnumChildWindows` filtrando por PID.

## Consequências

- **O preview nativo exige um EXPORT pronto.** O menu pede a pasta; não há
  fluxo incremental (editar → ver) ainda. É a maior limitação deste marco e o
  assunto do M4.
- **Airspace**: nada de DOM desenha sobre o preview nativo — as pills do
  viewport, a zona de drop e o seletor de fase, que hoje flutuam sobre o
  iframe, não vão aparecer sobre a janela nativa. Ou saem do retângulo, ou
  passam a ser desenhados pelo host (M4).
- **Input**: o teclado/foco entre Chromium e janela nativa ainda não foi
  tratado — o host recebe o input do SDL quando a janela tem foco, mas a
  IDE não coordena isso. Também M4.
- O iframe continua sendo o caminho padrão: o preview nativo é um item de menu
  **experimental**, e nada muda para quem não o aciona.
- `CORTEX_PARENT_HWND` implica janela (nunca fullscreen) e é Windows-only
  (`SetParent`/Win32). No port de console isso não se aplica.
