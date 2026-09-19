# 0206 - Airspace e drag-and-drop no preview nativo (M4b do PRD-0007)

**Data:** 2026-09-19
**Status:** aceito

> **Implementação REMOVIDA da main** (ADR-0212): o preview nativo no Studio foi
> pausado e este código vive na branch `feature/preview-nativo-no-studio`.
> A spec fica como registro do que foi construído e de por que funcionava assim.

## Contexto

Arrastar um asset da árvore para o viewport (SPEC-0090) funciona assim no
Studio: o Electron não entrega drag-and-drop nativo para dentro do iframe, então
durante o arraste um **overlay DOM transparente** cobre o palco, captura o drop
e repassa `url` + posição normalizada para a ponte do editor.

No preview nativo isso para de funcionar por **airspace**: a janela filha nativa
fica sempre acima de todo o DOM, então o overlay nunca recebe o evento. Era uma
das duas pendências registradas na SPEC-0201 e na SPEC-0205.

## Decisão

**Durante o arraste, a janela do host some.** Com ela escondida, o overlay volta
a ser o topo da pilha e o drop funciona exatamente como no iframe — o mesmo
código, o mesmo evento, a mesma posição normalizada. Ao soltar (ou cancelar), a
janela reaparece.

- Shim `__cortexSetWindowVisible(bool)` em `window_control.cpp`, registrado
  **apenas** no modo embutido, como o `setBounds`.
- Mensagem `{ type: 'previewVisible', visible }` no canal, tratada pelo
  `HostChannel` junto de `bounds` — é geometria de janela, não assunto do jogo.
  Sem o campo, assume `true`: nenhuma mensagem malformada pode deixar o preview
  sumido.
- `Preview.setAssetDropTarget` esconde/mostra quando o preview nativo está no ar.

### `ShowWindow` do Win32, não `SDL_HideWindow`

Medido: `SDL_HideWindow` **não tem efeito** numa janela adotada por `SetParent`
— o SDL não sabe que ela virou filha de um HWND externo. O shim usa
`ShowWindow(hwnd, SW_HIDE | SW_SHOWNOACTIVATE)` com o HWND lido das
propriedades da própria janela SDL, e cai no SDL se o HWND não existir.

`SW_SHOWNOACTIVATE` de propósito: mostrar a janela **sem roubar o foco** da
IDE, que está no meio de uma interação do usuário.

## Validação

`native/scripts/test-embed.ps1` (estendido), com o export do `teste4`
**incluindo o editor**:

```
host embutido: janela 265030250 e filha de 418122702
apos bounds: 640x400
previewVisible=false escondeu a janela
previewVisible=true trouxe a janela de volta
OK: embed, bounds pelo canal e encerramento sem janela orfa
```

Mais 4 unitários em `tests/core/HostChannel.test.ts` (esconder/mostrar pelo
canal, default seguro sem o campo, no-op fora do embed).

> **Armadilha do teste, não do produto:** a primeira versão mandava `bounds`
> assim que a janela filha aparecia (~2 s) e falhava com `--editor`, porque o
> bundle ainda estava subindo e a mensagem se perdia. O produto não tem esse
> problema — o `NativePreview` **reenvia** a geometria quando o `ack` chega
> (SPEC-0201). O teste agora espera o JS de pé antes de mandar.

## Consequências

- O preview "pisca" durante o arraste de asset: some ao começar, volta ao
  soltar. É o custo do airspace, e o alvo do drop fica destacado no lugar.
- Qualquer outro overlay que precise ficar **sobre** o viewport (pills de
  ferramenta, seletor de fase) tem o mesmo problema e ainda não está resolvido:
  ou saem do retângulo do preview, ou passam a ser desenhados pelo host.
- `setVisible` é no-op fora do modo embutido — um jogo standalone não pode
  sumir da tela por uma mensagem.
