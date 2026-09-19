# 0210 - O preview nativo não pode travar o Studio (janela owned, não filha)

**Data:** 2026-09-19
**Status:** aceito

## O incidente

Primeiro uso real do preview nativo no Studio do usuário, com o `kart-racer`.
O embed funcionou — a janela do host virou filha do Studio, com 1046×624, o
tamanho do palco menos as faixas das pills. **Cerca de 100 segundos depois, o
Studio parou de responder.** Log de eventos do Windows:

```
14:21:18  Application Hang: o programa electron.exe versão 42.4.0.0
          interagiu com o Windows e foi fechado
```

Não foi crash: foi **hang**. O host tinha subido às 14:19:33.

## A causa

`SetParent` entre **processos diferentes** acopla as filas de mensagens dos dois
threads (o Windows faz o equivalente a um `AttachThreadInput`). A partir daí, um
host ocupado segura a UI de quem o hospeda — e o host fica ocupado o tempo todo:
carrega assets por ~40 s no boot e depois roda a ~45 ms por frame.

Foi um risco que o M2 (SPEC-0201) não previu. O teste daquele marco verificava
que a janela **virava filha** e que a geometria era aplicada; nada media se o
lado de fora continuava respondendo.

Hipótese descartada no caminho: inundação de IPC pelos logs do host (cada linha
vira um `webContents.send`). Medido — o `kart-racer` emite **7 linhas em 40 s**.
Não era isso.

## Decisão

### Janela OWNED, não filha

`WS_POPUP` + `GWLP_HWNDPARENT` apontando para a janela do Studio, em vez de
`WS_CHILD` + `SetParent`. Uma janela *owned*:

- fica sempre acima do dono (é o que o preview precisa);
- minimiza e restaura junto com ele;
- **não acopla as filas de mensagem** — é a diferença que importa.

Mais dois estilos: `WS_EX_NOACTIVATE` (clicar no jogo não rouba o foco da IDE,
como era com o iframe) e `WS_EX_TOOLWINDOW` (some da barra de tarefas).

### O preço: a janela não é clipada pelo dono

Uma filha é recortada pelo retângulo do pai; uma owned, não. Por isso:

- a IDE manda **coordenadas de tela** (soma a origem da área de conteúdo do
  Studio ao retângulo do palco);
- a IDE **reenvia a geometria quando a janela do Studio move ou redimensiona** —
  uma filha acompanharia sozinha, uma owned não;
- quando o palco não está visível, a janela é escondida (`previewVisible`,
  SPEC-0206 — o mecanismo já existia para o drag-and-drop).

### Cinto de segurança: nunca fullscreen

Com `CORTEX_PARENT_HWND`, o host agora recebe também `CORTEX_WINDOWED=1`. Se o
embed falhar por qualquer motivo, o preview abre **em janela** em vez de
fullscreen — que é o pior resultado possível dentro de uma IDE, e foi o que
aconteceu na primeira tentativa (com um host desatualizado, sem o shim).

## Validação

`native/scripts/test-embed.ps1` ganhou o teste que faltava:

```
host embutido: janela 281479218 tem o dono 423234510 (owned, nao filha)
apos bounds: 640x400
previewVisible=false escondeu a janela
previewVisible=true trouxe a janela de volta
janela dona seguiu respondendo com o host ocupado     ← o novo
OK: embed, bounds pelo canal e encerramento sem janela orfa
```

A responsividade é medida com `SendMessageTimeout(WM_NULL)` na janela dona
enquanto o host trabalha: se ela não responde dentro do prazo, a fila está
travada. É exatamente o sintoma do incidente.

> Armadilha do teste: `GetParent` devolve o **owner** para janelas popup, então
> não serve para distinguir filha de owned. O que prova é a ausência do estilo
> `WS_CHILD`.

## Consequências

- O preview nativo deixa de poder travar o Studio pelo acoplamento de filas.
- A janela flutua sobre o palco em vez de ser recortada por ele: se o painel
  ficar parcialmente fora da tela, ou o usuário rolar a IDE, o jogo pode
  transbordar. Esconder/reposicionar cobre os casos conhecidos; a solução
  completa seria o host renderizar num alvo compartilhado, o que é outra frente.
- Arrastar a janela do Studio move o preview com um quadro de atraso (a
  geometria vai por IPC).
