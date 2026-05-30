# Introdução

O **cortex-game-engine** é uma IDE focada em criação de jogos 3D
com TypeScript e IA. Em vez de empilhar Unity + Cursor + Blender +
ChatGPT, tudo vive num único app: editor, preview ao vivo, terminal,
chat IA com sandbox no projeto, gerador de modelos 3D via Blender e
empacotador de instalador Windows.

## O que você ganha

- **Engine ECS** sobre Three.js — entidades, componentes (só dados),
  sistemas (sem estado interno).
- **IDE Electron** com Monaco, file tree, preview hot-reload, terminal
  embutido e chat IA na sidebar.
- **Agente IA** que age dentro do sandbox do projeto: Read/Write/Edit
  com aprovação por ferramenta.
- **Gerador Blender** que recebe descrição textual e devolve `.glb`
  pronto pra usar na cena.
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
