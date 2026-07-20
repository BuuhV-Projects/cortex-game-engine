# SPEC-0015 - Criar pasta no IDE

**Data:** 2026-05-25
**Status:** aceito (extensão do SPEC-0011)

## Contexto

A SPEC-0011 cobriu "criar arquivo" mas deixou criar pasta para iteração
futura. Sem isso o usuário precisa sair do IDE para organizar o projeto
em subpastas — atrito desnecessário no fluxo de trabalho.

## Decisão

Mesmo padrão da SPEC-0011, mas para diretórios:

**Handler IPC** `fs:createDir(dirPath, name)`:
- Valida `dirPath` via `validatePath` e `name` pelas mesmas regras de
  `fs:createFile` (string não vazia, sem separadores de path nem byte
  nulo).
- Chama `mkdir(path, { recursive: false })` — falha se já existir.
- Retorna o path absoluto da pasta criada.

**UI**: botão **"+ Pasta"** na toolbar da FileTree, ao lado de
"+ Arquivo". Mesmo comportamento (prompt para nome, criar na raiz do
projeto, refresh da árvore).

Criar dentro de subpastas selecionadas, renomear, deletar e mover ficam
para um ADR dedicado quando houver atrito real.

## Consequências

- Reusa toda a infra da SPEC-0011 (validação, prompt, refresh).
- Pasta vazia aparece na árvore. FileTree já trata diretórios.
