---
title: Chat IA do Studio refeito (ADR-0180/SPEC-0181)
author: Buuh
date: 2026-11-02
id: l-085ffd1f
scope: repo
status: active
touches:
  - "electron/agent/plugin.ts#resolvePluginDir"
---

## Decided
O Chat IA (`electron/agent/`) foi refeito em 2026-08-02 (mergeado na main): o
método saiu do system prompt e virou **skill**.

- **`.claude/` do repo é o plugin `cortex-studio`** (tem `.claude-plugin/plugin.json`)
  e ao mesmo tempo o diretório de projeto do Claude Code — fonte única, sem cópia.
  Empacotado em `extraResources` como `agent-plugin/`; `resolvePluginDir()` acha os
  dois layouts.
- **Nomes prefixados:** no Chat, skills E agentes chegam ao modelo como
  `cortex-studio:<nome>`; no Claude Code (repo), sem prefixo. A API de controle do
  SDK (`supportedCommands()`) lista SEM prefixo — conferir por ela dá falso negativo.
- **`CORTEX_PLUGIN_DIR` / `CORTEX_KITS_DIR`** vão no env do turno porque o `cwd` do
  Bash é o projeto do jogo; as skills resolvem com fallback (`${VAR:-.claude}`).
- **Removidos:** ciclo de aprendizado por baselines (ADR-0113/0115, incluindo o botão
  🎓 do chat) e a game-design-bible (25 stubs de 5,8 KB que falavam de 2.5D).
  `validate_scene` FICOU, com thresholds default no código.
- Prompt: 32,1 KB → 7,8 KB por turno (−76%, ~6,2k tokens).
- **Blender é pré-requisito DURO** (decisão do usuário): as skills que dependem dele
  rodam `.claude/scripts/check-blender.mjs` no passo 0 e **PARAM** se faltar — nada
  de degradar. `BLENDER_PATH` apontando pro nada não cai em fallback.
- O foco do produto foi rescrito no **PRD-0006** (substitui o 0003): o norte é o
  PIPELINE (kit → cena → validação → export), não o gênero; 2.5D segue suportado
…

## Watch out
para melhorar o comportamento do Chat IA, edite a **skill** em
`.claude/skills/`, não o prompt — `prompt.ts` só recebe o que vale para QUALQUER
pedido. Skill nova entra em `.claude/skills/<nome>/SKILL.md` e é distribuída sozinha
(o filtro do `extraResources` já cobre `skills/**`). Ver metodo-montar-jogo,
skill-level-design-plataforma e pipeline-montar-fase-level-builder.

_From Claude Code's memory of this repo, last updated Aug 2._
