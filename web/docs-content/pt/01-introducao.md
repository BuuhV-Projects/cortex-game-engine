# Introdução

O **cortex-game-engine** é uma IDE focada em criação de jogos 3D
com TypeScript e IA. Em vez de empilhar Unity + Cursor + Blender +
ChatGPT, o editor, o preview ao vivo, o terminal e o empacotador de
instalador Windows vivem num único app — e a IA é o **Claude Code**,
que se conecta ao Studio por um servidor MCP (`cortex`) e enxerga os
kits de assets, a cena e a API do engine.

## O que você ganha

- **Engine ECS** sobre Three.js — entidades, componentes (só dados),
  sistemas (sem estado interno).
- **IDE Electron** com Monaco, file tree, preview hot-reload, terminal
  embutido.
- **IA via Claude Code + MCP `cortex`** — você abre o Claude Code na
  pasta do jogo e ele importa kits, mede modelos, valida a cena e
  consulta a API do engine. Detalhes em
  [IA com Claude Code](#ia-claude-code).
- **Blender integrado** — thumbnails e medidas de modelos, auto-rig
  e scripts que o Claude Code escreve para criar ou ajustar `.glb`.
- **Instalador Windows** num clique — empacotamento via Tauri 2.

## Pra quem é

Quem escreve TypeScript e quer fazer jogos 3D sem trocar pra C# ou
C++. Quem quer iterar rápido com IA sem perder o controle sobre o
código gerado. Quem prioriza distribuir um `.exe` real em vez de
publicar no browser.

## O que não é

- Não é uma engine AAA. Não tem renderer custom, nem editor visual
  drag-and-drop, nem física avançada pronta.
- Não é uma plataforma online — jogos rodam offline, empacotados como
  desktop.
- Não substitui Unity/Unreal para projetos grandes. É focada em jogos
  3D indie/jam, prototipagem rápida e estudo.
