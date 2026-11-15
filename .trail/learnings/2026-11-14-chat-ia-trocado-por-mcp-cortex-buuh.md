---
title: "O Chat IA do Studio foi trocado pelo Claude Code do dev com um MCP próprio"
author: Buuh
date: 2026-11-14
branch: feat/cortex-mcp
scope: repo
status: active
src: agent
touches:
  - "mcp/server.ts#createCortexServer"
  - "mcp/setup/cli.ts#main"
  - "electron/main/projectIpc.ts#registerProjectIpc"
  - "build/installer.nsh"
  - "vite.mcp.config.ts"
---

## Decided
O Studio não tem mais chat de IA embutido (ADR-0736). A IA é o Claude Code do dev, e o que só o Studio sabe fazer (kits, medir e ver `.glb`, validar cena, API do engine) é um servidor MCP stdio chamado `cortex`. O instalador checa os requisitos (Claude Code, Blender, Git) no fim da instalação e registra o MCP no Claude Code do usuário. Saíram junto o CLI legado `cortex-ai` e os SDKs da Anthropic. Motivo: o chat reimplementava, pior, o loop, o contexto, o plan mode e os subagentes que o Claude Code já tem; o que era próprio do Studio eram só as ferramentas.

## Tried and ruled out
- Manter o chat e acrescentar o MCP: dobrava a manutenção e mantinha o Agent SDK e o Codex.
- MCP como pacote npm (`npx`): exigiria Node na máquina do dev e desacoplaria a doc da API da versão do engine instalada. O MCP roda com o exe do Studio em modo Node.
- Checar os requisitos antes de copiar os arquivos: no NSIS ainda não há runtime JS nesse ponto, e a lógica viraria script NSIS sem teste.
- Escrever direto no `~/.claude.json`: é formato interno do Claude Code. O registro usa `claude mcp add`.

## Watch out
- O `project:setActive` (menu "Projeto" e instalação dos pacotes do `cortex.json`) era chamado só pelo componente do chat. Ao remover o chat ele precisou mudar de lugar; sem isso o menu e os pacotes paravam sem erro nenhum.
- No instalador, desligar `ELECTRON_RUN_AS_NODE` logo depois de rodar o setup. Senão o "executar o Studio" do fim herda o modo Node e a janela não abre.
- O MCP roda de `resources/mcp/`, onde não há `node_modules`: o bundle tem que levar as dependências dentro (`ssr.noExternal`).

In the code: `mcp/` (server, tools, setup), `vite.mcp.config.ts`, `build/installer.nsh`, `electron/main/projectIpc.ts`, `electron-builder.json` (`out/mcp` → `resources/mcp`; a pasta `docs/cortex-game-engine` inteira).
