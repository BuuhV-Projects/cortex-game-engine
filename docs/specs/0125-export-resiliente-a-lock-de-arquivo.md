# SPEC-0125 - Export resiliente a lock de arquivo (diagnóstico por Restart Manager)

**Data:** 2026-07-19
**Status:** aceito

## Contexto

O export nativo (ADR-0101, `native/scripts/export-game.mjs`) começa limpando a
pasta de saída `dist-native/` antes de regravar exe + dlls + `boot.hbc` +
assets. No Windows isso batia em duas falhas recorrentes por **lock de
arquivo**:

1. **`EPERM: mkdir 'dist-native'`** com stack cru do Node. Causa raiz: o script
   fazia `rmSync(dist)` + `mkdirSync(dist)`. Quando o `rmSync` não conseguia
   apagar a pasta inteira (um handle aberto), o Windows deixava o **nome do
   diretório em estado "delete pending"** — o SO segura o nome enquanto o handle
   não solta — e o `mkdirSync` seguinte estourava `EPERM`. O `guardLocks`
   existente não cobria essa linha, então o usuário via o stack cru em vez da
   mensagem acionável.

2. **Mensagem enganosa.** Quando um lock era detectado, a mensagem afirmava que
   "o jogo exportado provavelmente está ABERTO". Na prática o culpado costuma ser
   OUTRO processo: um `electron:dev`/export Node **pendurado** de uma sessão
   anterior, o Explorer aberto na pasta, um terminal com `cwd` lá, ou o
   antivírus. O usuário procurava o jogo no Gerenciador de Tarefas, não achava, e
   ficava sem saber o que fechar. (Sessão real: a pasta só destravou depois de um
   re-vendor que, por tabela, encerrou o processo pendurado.)

## Decisão

**1. Não apagar/recriar a pasta — esvaziar o conteúdo.** Extraído para
`native/scripts/fs-clean.mjs` (`prepareDist`): se a pasta existe, remove cada
**entrada** de dentro (com retries) e mantém o **diretório-raiz vivo**; se não
existe, cria. Isso elimina o ciclo remove-recria que caía no delete-pending — a
falha, quando acontece, passa a ser num arquivo específico (o exe/dll travado),
não no nome da pasta.

**2. Descobrir QUEM segura, via Windows Restart Manager.** Novo
`native/scripts/who-locks.ps1` (P/Invoke em `rstrtmgr.dll` — a mesma API do
diálogo "este arquivo está aberto em outro programa") + `who-locks.mjs`
(`whoLocks`, best-effort, **nunca lança**). Quando o `guardLocks` pega um lock,
ele lista **nome + PID reais** dos processos que seguram a pasta; sem resultado,
cai num aviso genérico ("confira o jogo, feche Explorer/terminal, aguarde").

Detalhes medidos que moldaram a implementação:

- Registrar um **DIRETÓRIO** na Restart Manager faz o `RmGetList` retornar
  `ACCESS_DENIED` e **zerar a lista inteira**. Por isso `whoLocks` expande
  pasta → arquivos do 1º nível (`toFiles`) e nunca passa o diretório adiante.
- Um handle **compartilhável** (o que o Node abre por padrão) **não** é
  reportado — correto: não bloqueia nada. O que a RM detecta é o `.exe`
  **rodando** ou um handle exclusivo, que é exatamente o caso do lock real.
- Os caminhos vão à `.ps1` via `$args` (coleta posicional confiável com
  `-File`); um `param([string[]])` NÃO coleta múltiplos posicionais nesse modo.

## Consequências

- O export sobrevive a locks transitórios do SO e, quando falha de verdade,
  aponta o **PID exato** a encerrar — o usuário não adivinha mais qual processo
  fechar.
- Dependência de plataforma: o diagnóstico usa `powershell` + `rstrtmgr.dll`
  (Windows). Fora do Windows, `whoLocks` retorna `[]` e o fluxo segue no aviso
  genérico — o export em si não depende disso.
- `who-locks.ps1` é resource de runtime: já entra no pacote porque
  `native/scripts` inteiro vai no `win.extraResources` (TDR-0003) — sem entrada
  nova a manter.
- Cobertura em `tests/native/fs-clean.test.ts` e `tests/native/who-locks.test.ts`
  (parse, expansão pasta→arquivos, e um lock exclusivo real reportando o PID no
  Windows). O caso de folder-lock puro (Explorer/`cwd` sem segurar arquivo) pode
  não ser identificado pela RM — coberto pelo aviso genérico, não pela lista.
