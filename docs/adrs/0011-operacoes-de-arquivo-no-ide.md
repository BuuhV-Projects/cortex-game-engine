# 0011 - Operações de arquivo no IDE: criar arquivo

**Data:** 2026-05-25
**Status:** aceito

## Contexto

O IDE permite abrir, editar e salvar arquivos existentes (ADR-0006/0008),
mas não tem como **criar** um arquivo novo dentro do projeto aberto. O
usuário precisa sair do IDE para criar o arquivo no Explorer/terminal
antes de poder editá-lo — fluxo quebrado.

Outras operações relacionadas (renomear, deletar, criar pasta, mover) são
desejáveis mas têm complexidade adicional (precisam de UX de
confirmação, mover models do Monaco com URI nova, atualizar tabs
abertas). Este ADR cobre apenas **criar arquivo** como o passo de
desbloqueio mais imediato; as demais operações ficam para ADRs próprios
quando viraremos atrito.

## Decisão

**Handler IPC** `fs:createFile(dirPath, name)` no main process:
- Valida `dirPath` via `validatePath` (resolve absoluto + rejeita byte nulo).
- Valida `name`: string não vazia, sem separadores de path (`/`, `\`) nem
  byte nulo — mesma regra de `fs:createProject` para o nome do projeto.
- Cria o arquivo vazio com `writeFile(path, '', 'utf-8')`. Se já existir,
  rejeita com erro (não sobrescreve silenciosamente).
- Retorna o path absoluto do arquivo criado.

**UI** na sidebar (`FileTree`):
- Botão **"+ Arquivo"** ao lado do "Abrir Projeto", visível apenas quando
  há projeto aberto.
- Clique abre `window.prompt('Nome do arquivo:')` (V1 simples). Vazio ou
  cancelado = no-op.
- Em sucesso, dispara `refresh()` da árvore. Não abre o arquivo
  automaticamente — usuário clica na árvore como faria com qualquer outro.

**Escopo do diretório**: V1 cria sempre na **raiz do projeto** ativo. Criar
dentro de subpastas selecionadas exige rastrear seleção na FileTree —
fica para iteração futura.

## Consequências

- Fluxo "criar projeto → criar arquivo → editar → rodar" fica completo
  dentro do IDE.
- Validação simples (mesma do `createProject`): nada de path traversal,
  já que o `name` não pode conter separadores.
- Arquivos vazios entram na árvore após o `refresh`. Editor.ts já trata o
  caso de conteúdo vazio sem problema.
- Renomear/deletar/criar pasta/mover: fora deste ADR. Quando virar
  atrito, registrar ADR-XXXX cobrindo a UX (input inline vs prompt,
  confirmação de delete, model rename) e o pacote de handlers IPC.
