# 0052 - Tipo de projeto (2D ou 2.5D) na criação

**Data:** 2026-06-07
**Status:** aceito

## Contexto

O engine agora suporta tanto **2.5D** (malhas GLB, perspectiva, PBR) quanto **2D
pixel art** (ortográfica, sprites, tilemap — ADR-0051). Ao criar um projeto, o
usuário deveria escolher o tipo e já receber o **template** e a **orientação do
Chat IA** voltados pra isso — em vez de um template fixo 2.5D que confunde quem
quer pixel.

## Decisão

1. **Escolha na criação:** o diálogo "Novo projeto" (`ProjectManager`) ganhou um
   campo **Tipo de jogo** (`2.5d` default / `2d`). O valor vai pro
   `fs:createProject(targetDir, name, kind)`.

2. **Template por overlay:** base única em `templates/new-project/` (2.5D). Pra
   `2d`, o `createProject` **sobrepõe** `templates/variants/2d/` (hoje só um
   `main.ts` ortográfico com exemplos comentados de sprite/spritesheet/tilemap).
   Evita duplicar todo o template; só os arquivos que diferem.

3. **Marca do tipo:** grava `cortex.json` na raiz do projeto
   (`{ "engine": "cortex-game-engine", "type": "2d" | "2.5d" }`).

4. **Chat IA orientado:** o main lê `cortex.json` (`loadProjectType`) e passa
   `projectType` ao `runAgent`; o `agentLoop` injeta um bloco no system prompt:
   - **2D:** use `Game({ projection: 'orthographic' })`, sprites/spritesheet/
     tilemap, `loadTexture({ pixelated })`; **não** use GLB/PBR/PostFX/`inspect_assets`.
   - **2.5D:** segue o fluxo de malhas + `inspect_assets` de costume.

## Consequências

- Quem cria um projeto 2D já abre com câmera ortográfica e um `main.ts` pixel-
  ready, e o Chat IA para de sugerir GLB/3D pra ele.
- O default segue **2.5D** (compatível com tudo que já existe).
- A física/colisão/editor são **os mesmos** nos dois tipos — só muda a camada de
  render (malha × sprite) e a câmera.
- O overlay 2D é mínimo (um `main.ts`); evoluções (assets de sprite de exemplo,
  tileset starter, `level.json` em tiles) entram em `templates/variants/2d/`.
- `cortex.json` vira o ponto de extensão pra metadados de projeto (versão do
  engine, flags do Studio) no futuro.
- Relaciona-se com ADR-0009 (vendoring no projeto), 0022 (padrão de projetos),
  0040 (template rico) e 0051 (camada 2D).
