# 0013 - `yarn install` automático após criar projeto

**Data:** 2026-05-25
**Status:** aceito

## Contexto

O template de projeto criado pelo IDE traz `vite` como devDependency
(ADR-0009). Sem `node_modules`, o `Play` falha imediatamente com
`Cannot find package 'vite'`. O usuário precisa abrir o Terminal,
rodar `yarn install`, esperar, e só então `Play` funciona — atrito
desnecessário no fluxo "criar projeto → rodar".

## Decisão

Após `fs:createProject` retornar com sucesso, o renderer dispara
automaticamente `yarn install` no terminal embutido. A ativação fica
no renderer (não no main) porque a UI já tem os hooks de output do
terminal — não precisa de canal novo.

**Fluxo:**

1. `ProjectManager` chama `electronAPI.createProject(targetDir, name)`.
2. Em sucesso, dispara dois eventos em sequência:
   - `project-created` com `{ path }` — sinal para que o setup
     automático rode.
   - `project-open` com `{ path }` — sinal para que `FileTree` e
     `BottomPanel` adotem o projeto como ativo (mesma semântica de
     abrir um projeto existente).
3. `BottomPanel` escuta `project-created`, ativa a aba Terminal e chama
   `electronAPI.runTerminalCommand(path, 'yarn install')`.
4. O usuário vê o progresso do install na aba Terminal.

`project-open` sozinho **não** dispara install — abrir um projeto
existente assume que ele já tem `node_modules` (ou o usuário roda
install manual quando precisar).

## Consequências

- Fluxo "criar projeto → editar → Play" funciona sem passo manual.
- Comando `yarn` precisa estar no PATH do sistema. Em ambientes sem
  yarn (só npm), o install falha com mensagem clara — usuário pode
  rodar `npm install` no Terminal manualmente. Iteração futura pode
  detectar e cair em npm como fallback.
- Reabrir um projeto não dispara install — se o usuário moveu/clonou
  o projeto e perdeu `node_modules`, precisa rodar manualmente. Trade-
  off aceito para não desperdiçar tempo em projetos já configurados.
- Install em background é visível mas não-bloqueante: usuário pode
  começar a editar enquanto roda. `Play` antes do install terminar
  vai falhar — mensagem do `Preview` já orienta sobre isso.
