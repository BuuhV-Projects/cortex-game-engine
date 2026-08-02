---
name: montar-fase
description: Pipeline COMPLETO de montar uma fase de plataforma jogável a partir de um kit 3D curado do engine — do inventário à validação visual por 4 vistas. Empacota e orquestra as skills existentes (process-asset-kit, blueprint-fase, level-design-plataforma, montar-jogo, fase-por-trechos), dá comportamento aos obstáculos (mecânicas do kit) e valida topo/frente/lado/iso + playtest. Use quando o usuário pedir para criar/montar/prototipar/refazer uma fase, nível, percurso ou "obstacle course" jogável a partir de um kit. Delega ao agente level-builder.
---

# montar-fase — pipeline completo de fase de plataforma

Skill guarda-chuva: consolida TUDO que envolve montar uma fase jogável a partir de um
kit — inventário, design orientado a gameplay, montagem, mecânicas de obstáculo e
validação visual — num pipeline único e orquestrado. Não duplica as sub-skills; as
**invoca na ordem certa** e amarra a validação.

## Como usar

**Delegue ao agente `level-builder`** (tool Agent), passando o pedido: qual kit, que
tipo de fase, restrições. O agente executa o pipeline inteiro autonomamente e devolve a
fase + os artefatos de validação (blueprint 2D, 4 vistas, maquete iso).

O `subagent_type` muda com o ambiente — use o que aparecer na lista de agentes:

| Onde | `subagent_type` |
|---|---|
| Chat IA do TS Cortex Studio (agente vem do plugin) | `cortex-studio:level-builder` |
| Repositório da engine (Claude Code) | `level-builder` |

Para tarefas pequenas (um trecho, um ajuste), siga o pipeline inline sem delegar.

## O pipeline (o que o agente faz)

| # | Passo | Dono |
|---|-------|------|
| 0 | **Checar Blender** (`$CORTEX_PLUGIN_DIR/scripts/check-blender.mjs`) — falhou, PARA | pré-requisito duro |
| 0b | Contexto: ADRs/specs; processar kit bruto se preciso | **process-asset-kit** / **process-asset-kit-2d** |
| 1 | Inventário real do kit (`role`/`gameplayRole`/`size`/**`mechanic`**) | inspect_assets / kit.json |
| 2 | **Blueprint** orientado a gameplay (cada peça: `behavior`+`script`+`params`) | **blueprint-fase** + **level-design-plataforma** |
| 3 | Montar a cena data-driven (física no nó, coords de mundo reais) | **montar-jogo** (+ **fase-por-trechos**) |
| 4 | **Comportamento** aos obstáculos (mecânicas do `asset.mechanic` do kit) | scripts do kit |
| 5 | **Validar**: `validate_scene` 0 erros → typecheck + gaps 3D → **4 vistas** (topo/frente/lado/iso) → playtest, em LOOP | validate_scene / render_level_views / render_level_iso |
| 6 | Fechar: doc (ADR/spec), memória, commit | — |

## Princípios que o pacote impõe

- **Cada objeto tem propósito** (não é decoração) — o asset casa o `behavior` pelo
  `role`/`gameplayRole`/`tags`, nunca pela estética.
- **Obstáculo parado é arte desperdiçada** — todo `obstacle_*` não-`land_*` ganha
  mecânica real (esteira empurra, serra corta, prensa esmaga, disco gira, pêndulo varre).
- **A fase não pode ser linha reta** — o TOPO das 4 vistas tem que mostrar traçado
  orgânico (serpenteio + variação de altura), não uma diagonal.
- **Pronto = validado nas 4 vistas + playtest**, não "o código roda".

## Camadas relacionadas (invocadas pelo pipeline)

- **blueprint-fase** — planta 2D de gameplay + render iso 3D + 4 vistas de validação.
- **level-design-plataforma** — critérios de beleza e desafio (composição, ritmo, arco).
- **montar-jogo** — método de construção na engine (inventário→design→validação em camadas).
- **fase-por-trechos** — compor fases de trechos fatiados com lint verificável.
- **process-asset-kit / -2d** — kit bruto → kit curado (`kit.json` + thumbnails).
