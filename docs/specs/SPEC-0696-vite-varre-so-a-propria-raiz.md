# 0696 - Vite varre só a própria raiz, e o Play retenta sozinho

**Data:** 2026-11-05
**Status:** aceito

## Contexto

A SPEC-0694 pôs um aviso quando o vite não responde em 60 s, mas a causa do
travamento ficou em aberto. Ele voltou a acontecer no DDD 00 (`D:/jogos/port-hollow`),
e desta vez foi capturado ao vivo pelo inspector do Node:

- **10.604** operações de arquivo pendentes (`FSReqCallback`) e **50.350** observadores
  de arquivo (`FSEventWrap`) abertos, com o processo ocioso. O pool de threads de disco
  do Node estava afogado, e o pré-bundle esperava atrás dele.
- A pasta `.claude/` do projeto tinha **66.496** itens, contra 896 em `assets/`: são
  **43 worktrees** do jogo, cópias inteiras, cada uma com o seu `index.html`.

Duas coisas do vite somam isso:

1. **O scan de dependências parte de todo `.html` do projeto** (`optimizeDeps.entries`
   padrão), ignorando só `node_modules`, a pasta de build e as de teste. Com as
   worktrees, o primeiro Play varria o jogo 44 vezes, cada uma com milhares de imports.
2. **O watcher observa a raiz inteira**, exceto `.git` e `node_modules` — inclusive as
   66 mil entradas do `.claude/`.

Medido com cache frio, numa porta e num cache separados do Studio:

| Config | `main.ts` respondeu | Pastas observadas |
|---|---|---|
| Atual | 22,5 s; 108,1 s; e **não respondeu em 240 s** | ainda crescendo aos 73 s, dentro do `.claude` |
| Isolada (esta SPEC) | 6,6 s; 3,1 s; 3,1 s | 175, nenhuma no `.claude` |

## Decisão

1. **Cada raiz varre só a si mesma.** O `templates/new-project/vite.config.ts` ganha:
   - `optimizeDeps.entries: ['index.html']` — o pré-bundle parte só do `index.html`
     da raiz do vite.
   - `server.watch.ignored` com `isToolPath`, que ignora `.claude`, `.cortex` e
     `.cortex-cache` **desta raiz**, por caminho absoluto resolvido do `__dirname`.

   Nunca o glob `**/.claude/**`: uma worktree mora em `.claude/worktrees/<nome>/`, e o
   glob faria o vite dela ignorar todos os próprios arquivos (sem HMR). Com o caminho
   absoluto, o vite da `main` não entra nas worktrees, cada worktree cuida só da sua
   árvore, e o build do exe (`vite build`, entrada `index.html`) já era isolado. No
   Windows a comparação ignora maiúsculas.

2. **O Play retenta sozinho** (`electron/renderer/previewLoadingFlow.ts`). Servidor sem
   `load` do iframe em 60 s: o Studio faz Stop + Play sozinho, até **2 vezes**
   (`MAX_AUTO_RETRIES`), com o aviso "Reiniciando sozinho (tentativa N de 2)…". Só se as
   duas falharem aparece o aviso de travado, com o botão Reiniciar. O Stop da
   retentativa não troca o palco por "Projeto parado.", e o prazo de 60 s segue armado,
   então um vite que nem volta a imprimir a URL também é retentado. O contador zera
   quando o servidor responde (`load`) ou quando o usuário dá Stop.

3. **Projetos existentes** não herdam o template: cada `vite.config.ts` precisa das
   mesmas duas mudanças no próprio repositório. O DDD 00 é o primeiro.

## Consequências

- O primeiro Play com cache frio do DDD 00 cai de minutos (ou travado) para ~3–7 s.
- Um projeto com mais de uma página HTML de entrada precisa listá-las em
  `optimizeDeps.entries`; os `.html` carregados em runtime (templates de UI em
  `assets/`) não são entradas e não precisam.
- A retentativa é rede de segurança, não correção: com a varredura isolada o
  travamento deixa de ter a causa medida. Se voltar a aparecer, o caminho é o mesmo
  desta SPEC — inspector no processo e `process.getActiveResourcesInfo()`.
- Arquivos dentro de `.claude`, `.cortex` e `.cortex-cache` não disparam HMR. Nenhum
  deles é código do jogo.
