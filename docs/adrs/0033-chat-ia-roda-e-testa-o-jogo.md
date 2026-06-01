# 0033 - Chat IA roda e testa o jogo (screenshot + erros)

**Data:** 2026-05-31
**Status:** aceito

> **Atualização (2026-05-31):** a `playtest_game` passou de só *observar* para
> também *jogar*. Ganhou um parâmetro `actions` — uma timeline de input de teclado
> (`press`/`release`/`tap`/`wait`/`screenshot`) injetada via
> `webContents.sendInputEvent` (gera `keydown`/`keyup` DOM reais, que o
> `InputManager` lê). Permite **múltiplos screenshots** (um por ação `screenshot`,
> senão um no fim) pra ver a progressão da jogada, e captura as mensagens de
> console (logs/warns/erros) da sessão inteira (limite subido pra 200). Assim o
> agente valida comportamento jogável (mover, pular, colidir), não só a tela
> inicial. Ver `PlaytestOptions.actions`/`InputAction` em `runAndCapture.ts`.

## Contexto

O Chat IA implementa features no jogo mas não conseguia **ver** o resultado —
não rodava o jogo nem enxergava a tela ou os erros de runtime, então "achava"
que funcionou sem validar. Queremos fechar o ciclo "implementou → testou →
corrige", dando ao agente a capacidade de rodar o jogo, tirar um screenshot e
ler os erros.

## Decisão

Nova tool MCP **`playtest_game`** (`electron/agent/tools/playtest.ts`),
registrada no `agentLoop.ts` ao lado da `generate_blender_model`. Implementação
em `electron/agent/playtest/runAndCapture.ts`:

1. Sobe um `vite` dedicado no projeto (porta alternativa 5180, pra não colidir
   com o Play do usuário em 5174) e lê a URL do stdout.
2. Carrega o jogo numa **`BrowserWindow` oculta** (posicionada fora da tela,
   `show:true` pra garantir pintura), coletando `console-message`/`did-fail-load`/
   `render-process-gone`.
3. Espera o init assíncrono (WebGPU) + assets, e faz `webContents.capturePage()`.
4. Teardown sempre (fecha a janela, mata o vite).

A tool devolve um **bloco de imagem** (`{ type:'image', ... }`) — o modelo VÊ o
screenshot — mais um texto com o caminho do PNG salvo (`<projeto>/.cortex/playtest/`)
e os erros de console. Fallback: o agente também pode dar `Read` no PNG salvo.

**Captura via Electron, não Playwright** (decisão do usuário): sem dependência
nova, e o Chromium do Electron renderiza **WebGPU** igual ao preview — essencial
porque o engine é WebGPU-only (ADR-0032). Playwright headless tem suporte instável
a WebGPU.

O `AGENT_SYSTEM_PROMPT` foi atualizado pra orientar o agente a usar `playtest_game`
pra validar (e a não tentar rodar o jogo via Bash, que é proibido).

## Consequências

- A tool roda no main process (onde o agente já roda) e usa `BrowserWindow` —
  só funciona dentro do IDE Electron, não em CI headless puro.
- Não é unit-testável (GPU/Electron/vite reais) — validação manual: pedir ao
  Chat pra rodar o jogo e conferir o screenshot/erros.
- **Risco capturePage em janela oculta**: usa janela fora da tela com `show:true`
  pra garantir pintura; se vier preto em algum ambiente, ajustar a estratégia.
- A tool é não-destrutiva (sobe vite efêmero + lê + salva PNG em `.cortex/`);
  passa pela aprovação normal no modo `ask`.
- `.cortex/playtest/` acumula PNGs no projeto — candidato a `.gitignore`.
