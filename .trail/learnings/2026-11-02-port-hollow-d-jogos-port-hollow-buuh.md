---
title: "Port Hollow (D:/jogos/port-hollow)"
author: Buuh
date: 2026-11-02
id: l-3d640cba
scope: repo
status: active
touches:
  - CLAUDE.md
---

## Decided
Criado em 30/10/2026: o usuário achou que o DDD 61 "não vai ficar legal" (carros e gráfico fracos) e pediu um jogo de resolver crimes numa cidade procedural com kit modular, reaproveitando player (animações + tiros), árvores e NPCs do DDD 61.

- Decisões: cidade fictícia **sem país definido** (nomes neutros), **com carro**, **12 casos em 3 atos** (PRD-0001 no repo, com catálogo de casos e marcos 1–7). Nome provisório "Port Hollow".
- Assets: Downtown City MegaKit Standard (Quaternius, CC0, 153 peças) em `E:/Downloads/Downtown City MegaKit[Standard]`; veículos low poly `E:/Downloads/veiculos` (itch.io grátis, **licença a confirmar**, rodas separadas, paleta única); props `E:/Downloads/Street Props Pack.glb` (56 nós soltos, separar no Blender; licença a confirmar).
- Projeto criado por `D:/ai-scripts/novo-jogo/criar-projeto.sh` (template da engine + vendor copiado do DDD 61). Relevo: quadras/cruzamentos em patamares, ruas em ladeira, heightmap do terreno da engine (SPEC-0059 da engine; o sistema de estrada spline foi removido).
- Frentes paralelas (30/10, worktrees em `.claude/worktrees/`): `feat/cidade` (SPEC-0002), `feat/player` (SPEC-0003), `feat/veiculos` (SPEC-0004). NPCs (marco 5) depois. ADRs reservados: 0005 cidade, 0006 player, 0007 veículos.

**Why:** novo foco do usuário; DDD 61 fica guardado.

## Watch out
regras no `CLAUDE.md` do projeto (yarn, spec antes, i18n, 500 linhas, sem números mágicos, inglês no código). Ver frota-original-entrada-fade, gta3-dados-so-estudo.

**31/10/2026:** marcos 2–4 + clima MERGEADOS na main (`0513c76`, SPEC-0010): cidade, detetive, veículos e clima juntos; 185 testes. Próximo: marco 5 (NPCs). Pendências: player atravessa carros, um laço de trânsito, terraços sem acesso.
…

_From Claude Code's memory of this repo, last updated Nov 1._
