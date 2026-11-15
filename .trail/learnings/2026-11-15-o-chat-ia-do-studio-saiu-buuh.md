---
title: O Chat IA do Studio saiu; a IA agora é o Claude Code do dev com um MCP próprio
author: Buuh
date: 2026-11-15
branch: feat/cortex-mcp
cost: { minutes: 7, tokens: 357683 }
id: l-ece3265f
scope: repo
status: active
src: agent
touches:
  - CLAUDE.md
  - README.md
  - docs/adrs/0003-integracao-ia-claude.md
  - docs/adrs/0004-geracao-modelos-blender.md
  - docs/adrs/0018-confirmacao-de-acoes-destrutivas.md
  - docs/adrs/0020-migracao-para-claude-agent-sdk.md
  - docs/adrs/0021-agente-deve-preferir-engine-sobre-three-direto.md
  - docs/adrs/0033-chat-ia-roda-e-testa-o-jogo.md
  - docs/adrs/0036-plan-mode-no-chat-ia.md
  - docs/adrs/0043-passe-de-critica-de-beleza-via-sub-agente.md
---

## Decided
O Studio não tem mais chat de IA embutido (ADR-0736). A IA é o Claude Code do dev, e o que só o Studio sabe fazer (kits, medir e ver modelos, validar cena, API do engine) é um servidor MCP stdio chamado `cortex`. O instalador checa os requisitos (Claude Code, Blender, Git) no fim da instalação e registra o MCP no Claude Code do usuário. Saíram junto o CLI legado e os SDKs da Anthropic. Motivo: o chat reimplementava, pior, loop, contexto, plan mode e subagentes que o Claude Code já tem; só as ferramentas eram próprias do Studio.

## Tried and ruled out
- Manter o chat e acrescentar o MCP: dobrava a manutenção e mantinha o Agent SDK e o Codex.
- MCP como pacote npm (npx): exigiria Node na máquina do dev e desacoplaria a doc da API da versão do engine instalada. O MCP roda com o exe do Studio em modo Node.
- Checar os requisitos antes de copiar os arquivos: no NSIS ainda não há runtime JS nesse ponto; a lógica viraria script NSIS sem teste.
- Escrever direto no arquivo de config do Claude Code: formato interno; o registro usa o CLI `claude mcp add`.

## Watch out
- O projeto ativo no main (menu "Projeto" e instalação dos pacotes do cortex.json) era avisado só pelo componente do chat. Ao remover o chat ele precisou mudar de lugar; sem isso o menu e os pacotes param sem erro nenhum.
- No instalador, desligar ELECTRON_RUN_AS_NODE logo depois de rodar o setup, senão o "executar o Studio" do fim abre em modo Node e a janela não aparece.
- O MCP roda de resources/mcp sem node_modules: o bundle tem que levar as dependências dentro.
- A regra `build/` do .gitignore pega a pasta de recursos do electron-builder: o installer.nsh entra com `git add -f`.
- Vitest falhando em TODO arquivo com "reading 'config'" sem mudança de código: o cwd veio com a letra do drive minúscula (d:\) e o Vite carregou o vitest duas vezes. Rodar a partir de D:\.

In the code: `mcp/server.ts` (createCortexServer), `mcp/tools/`, `mcp/setup/cli.ts`, `vite.mcp.config.ts` (`ssr.noExternal`), `build/installer.nsh`, `electron/main/projectIpc.ts`, `electron-builder.json` (`out/mcp` → `resources/mcp`).
