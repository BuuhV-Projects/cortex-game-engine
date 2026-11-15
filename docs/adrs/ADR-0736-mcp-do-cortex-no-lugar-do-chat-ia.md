# ADR-0736 - MCP do Cortex para o Claude Code do dev, no lugar do Chat IA embutido

**Data:** 2026-11-14
**Status:** aceito

## Contexto

O Studio tem um Chat IA embutido (PRD-0001/0002, ADR-0020 e seguintes): loop de agente próprio sobre o
Claude Agent SDK, modos por tarefa, plan mode, saúde do turno, runner do Codex, histórico, UI no painel.
São ~4,7 mil linhas em `electron/agent/` mais a UI e o IPC. Quase tudo isso reimplementa, pior, o que o
Claude Code já faz: loop, contexto, plan mode, subagentes, skills.

O que o Studio tem de **próprio** são as ferramentas que só ele sabe executar (kits do engine, medição e
thumbnail de `.glb`, validação geométrica de cena) e o conhecimento da API do engine. As skills e os
agentes já moram no `.claude/` (ADR-0180), e qualquer Claude Code aberto no repositório já os recebe.

## Decisão

Expor o que é próprio do Studio como um **servidor MCP stdio** (`cortex`), usado pelo Claude Code do dev,
e **remover o Chat IA na mesma mudança**: `electron/agent/`, a UI e o IPC do chat, o histórico por projeto,
a preferência "Codificar com o modelo mais forte", o runner do Codex e o CLI legado `cortex-ai`
(`src/cli/`, `src/ai/`). Saem as dependências `@anthropic-ai/claude-agent-sdk`, `@anthropic-ai/sdk` e
`commander`; entra `@modelcontextprotocol/sdk` (dev, embutido no bundle do MCP).

1. **Tools do MCP v1** (SPEC-0737): `list_kits`, `list_kit_assets`, `import_kit`, `measure_glb`,
   `inspect_assets`, `validate_scene` e a API do engine (`engine_api_index`, `engine_api_section`,
   `engine_api_symbol`, `engine_api_search`). Ficam de fora: `playtest_game` (precisa de janela do
   Electron, vai para o backlog), `generate_blueprint` (a skill `blueprint-fase` já faz),
   `critique_scene` (vira agente do `.claude/`), `generate_blender_model` (o Claude Code escreve `bpy`
   sozinho) e `delegate_modeling` (roteamento interno do chat).
2. **Núcleo neutro de transporte.** Cada tool é uma definição `{ name, description, schema, handler }`
   em `mcp/tools/`, testável sem o protocolo; o servidor só as registra no `McpServer`.
3. **Runtime = o próprio Studio.** O MCP roda como `TS Cortex Studio.exe` com `ELECTRON_RUN_AS_NODE=1`,
   o mesmo caminho do export (`exportIpc.ts`). O dev não precisa de Node na máquina.
4. **O instalador registra o MCP e checa os requisitos** (SPEC-0738): no fim da instalação roda o
   verificador (Claude Code, Blender, Git) e `claude mcp add --scope user cortex`; na desinstalação,
   remove o registro.

### Alternativas consideradas

- **Manter o Chat IA e só adicionar o MCP.** Dobra a manutenção e mantém a dependência do Agent SDK, do
  Codex e de um loop de agente próprio. Rejeitado.
- **MCP em pacote npm separado (`npx cortex-mcp`).** Exige Node no PATH do dev e desacopla a versão do
  MCP da versão do engine instalado. Rejeitado: a doc da API tem que bater com o engine que o Studio
  vendoriza.
- **Checar requisitos ANTES de copiar os arquivos (`customInit` do NSIS).** Nesse ponto não há runtime
  JS; a lógica teria que ser reescrita em script NSIS (versões, caminhos do Blender, `where`), sem
  teste. Escolhido checar no fim da instalação com o verificador em TS, testado, e o mesmo que o
  `cortex-setup --check` expõe. O dev descobre na instalação, não quando quebra.
- **Escrever direto no `~/.claude.json`.** Formato interno do Claude Code, pode mudar. O registro usa o
  CLI `claude mcp add`, que é a interface pública.

## Consequências

- Quem usa IA no Studio passa a usar o Claude Code (CLI, VS Code ou desktop) com o MCP `cortex`. O
  Claude Code vira requisito para a parte de IA; o editor continua funcionando sem ele.
- O Codex CLI deixa de ser requisito.
- O `project:setActive` (menu "Projeto" + pacotes do `cortex.json`, SPEC-0693) era chamado pelo
  `Chat.ts`; passou para `electron/main/projectIpc.ts`, chamado pelo `renderer/main.ts`.
- As skills/agentes do `.claude/` deixam de ir no instalador (`agent-plugin/`): só o chat os lia. O dev
  que trabalha no repo do engine continua recebendo-os; distribuí-los ao projeto do jogo como plugin do
  Claude Code fica no backlog da SPEC-0737.
- Sem o Claude Code instalado na hora da instalação, o registro fica pendente: o relatório avisa e
  ensina o comando (`cortex-setup --register`) para rodar depois.
- `playtest_game` some da IA até ganhar um caminho headless (backlog da SPEC-0737).
- Substitui: ADR-0003, 0004, 0018, 0020, 0021, 0033, 0036, 0043, 0114, 0130, 0142, 0180 (só a parte do
  chat), 0189, 0191, 0265, 0269, 0272, 0276 e os PRDs 0001/0002.
