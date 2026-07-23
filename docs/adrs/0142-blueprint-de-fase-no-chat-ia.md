# 0142 - Blueprint de fase orientado a gameplay no Chat IA

**Data:** 2026-07-23
**Status:** aceito

## Contexto

A skill `blueprint-fase` (Claude Code, `.claude/skills/blueprint-fase/`) gera uma
IMAGEM de planta de level design a partir de um kit curado: peças posicionadas com
thumbnails reais, caminho do jogador e legenda pelo nome de arquivo exato. Era só do
assistente de desenvolvimento (Claude Code) — o **Chat IA do Studio** (o agente que o
usuário final usa pra montar jogos) não tinha como produzir esse artefato.

Dois problemas motivaram este registro:

1. **O blueprint precisava ser orientado a gameplay, não estético.** A versão original
   posicionava peças e derivava só a *cor* da legenda do `role`/`tags` do kit. Não havia
   nada amarrando cada peça a um **propósito funcional** — daí era possível escolher um
   asset `role:platform` como "pad de espinhos" só porque *parecia*. O blueprint tem que
   ser uma **spec implementável 1:1**: cada objeto na cena existe por uma função (mata,
   lança, salva, pontua, bloqueia, sustenta), amarrada a um script/componente do engine.

2. **Expor a capacidade no Chat IA.** O Studio não tem conceito de "skill" — capacidades
   chegam ao agente por **tool MCP in-process** ou **texto no system prompt** (ADR-0017,
   ADR-0033, ADR-0114). Precisávamos de um caminho que casasse com esses padrões e
   reusasse a lógica de render já provada.

## Decisão

**1. Blueprint orientado a gameplay (schema + render).** Cada peça ganha um `behavior`
(vocabulário fechado: `spawn`, `goal`, `checkpoint`, `collectible`, `hazard`,
`hazard-spinner`, `hazard-chaser`, `launcher`, `platform`, `platform-moving`, `blocker`,
`ground`, `decoration`), um `script` (componente real — `Perigo`, `Trampolim`,
`Checkpoint`, `Moeda`, `Chegada`, `MarteloGiratorio`, `Drone`, `Patrulha`, …) e `params`
(`{ raio }`, `{ impulso }`, `{ giro, alcance }`). O `behavior` deriva a cor e o script
sugerido; o render escreve **script + params** em cada peça de gameplay e **avisa** quando
o asset escolhido não casa com o `role`/`gameplayRole`/`tags` esperado pelo comportamento
(só em comportamentos de gameplay ativo — usar um hazard como decor é rebaixamento seguro).

**2. Tool MCP `generate_blueprint` no Studio.** Novo server `cortex-blueprint`
(`electron/agent/tools/blueprint.ts`), registrado em `agentLoop.ts`. O agente **compõe** o
`blueprint` (design + comportamento, guiado pelo bloco "1b" do system prompt e pelo schema
zod da tool) e a tool **renderiza** determinística: resolve thumbnails (kit empacotado em
`kitsDir/<kit>/thumbnails/` → dir do projeto → cache do `inspect_assets` em
`.cortex/asset-thumbs/`), rasteriza numa `BrowserWindow` oculta (padrão do `playtest_game`)
e devolve um **image block** (comprimido via `toCompactImage`) + os avisos. Salva em
`.cortex/blueprints/`.

**3. Motor de render portado pra TS, não compartilhado.** A lógica vive em
`electron/agent/blueprint/renderBlueprint.ts` (TS, usada pela tool) **espelhando** o
`render_blueprint.mjs` da skill (Node cru, usado pelo Claude Code). Optamos por
**duplicar com paridade verificada** em vez de compartilhar um módulo: a skill roda como
script Node standalone fora do pipeline de build do Electron, e acoplar os dois exigiria
um passo de build/bundle na skill. Um teste de paridade confirma HTML byte-a-byte idêntico
entre os dois a partir do mesmo blueprint. Os dois arquivos carregam nota de "manter em
sincronia".

## Consequências

- **O Chat IA agora produz blueprints** como o Claude Code — o usuário pede "faz uma
  planta da fase" e recebe a imagem no chat, antes de montar a cena de verdade (o blueprint
  é COMUNICAÇÃO de design; não substitui JSON + `validate_scene` + `playtest_game`).
- **Disciplina de propósito:** o aviso de "propósito duvidoso" transforma escolha estética
  em erro visível — foi o que apontou trocar `obstacle_9_001` (`role:platform`) por
  `obstacle_10_001` (`role:hazard`) num pad de espinhos.
- **Custo de contexto controlado:** a menção no system prompt é curta (o schema detalhado
  fica no zod da tool, lido só quando a tool está em jogo) pra não inflar o cache de toda
  sessão (lição do ADR-0114). A tool devolve **uma** imagem final (não dezenas), então o
  image block entra direto (diferente do `inspect_assets`, que difere pro Read sob demanda).
- **Duplicação a mais:** `renderBlueprint.ts` e `render_blueprint.mjs` precisam evoluir
  juntos. Mitigado pelo teste de paridade e pelas notas de sincronia. Se a divergência
  virar fardo, um passo de build na skill (gerar o `.mjs` do `.ts`) elimina a cópia.
- **Rasterização depende do Electron:** a tool só roda no Studio (usa `BrowserWindow`), não
  em execução headless/cron — igual ao `playtest_game`.
