# 0062 - Engine 3D por padrão, sem tipo de projeto (2D/2.5D via câmera)

**Data:** 2026-06-12
**Status:** aceito (substitui 0052)

## Contexto

O ADR-0052 introduziu uma escolha de **tipo de projeto** ("2.5D" × "2D") na
criação: seletor no diálogo "Novo projeto", overlay `templates/variants/2d/`,
marca `type` no `cortex.json` e um branch no system prompt do Chat IA
(`projectType`). Na prática a distinção era artificial: o engine é um só —
a diferença entre um jogo 3D, 2.5D ou 2D pixel art é **qual câmera e qual
camada de render** o código do jogo usa (perspectiva+malhas × ortográfica+
sprites/tilemap, SPEC-0051), não uma propriedade fixa do projeto. O rótulo
gravado na criação engessava: um projeto "2d" não podia evoluir pra 2.5D sem
mexer em metadado, e o Chat IA era orientado por uma flag em vez de olhar o
jogo real.

## Decisão

O engine trabalha com **3D por padrão**, e nada limita um jogo a ser 2.5D ou
2D — o controle é do **sistema de câmeras** (e da camada de render escolhida
no código do jogo). A diferenciação por tipo de projeto foi removida:

1. **Criação de projeto:** o diálogo "Novo projeto" perdeu o campo "Tipo de
   jogo"; `fs:createProject(targetDir, name)` não recebe mais `kind`. Template
   único (`templates/new-project/`, 3D/plataforma); `templates/variants/`
   foi removido.

2. **`cortex.json` sem `type`:** o arquivo segue como marca de projeto do
   engine e ponto de extensão pra metadados futuros, agora só
   `{ "engine": "cortex-game-engine" }`. O `type` de projetos existentes é
   ignorado (inerte).

3. **Chat IA sem branch:** `loadProjectType`/`projectType` foram removidos.
   O system prompt ganhou um bloco único "DIMENSÃO DO JOGO": engine 3D por
   padrão; 2.5D = perspectiva+GLB (fluxo de montagem de level de costume);
   2D pixel = `projection: 'orthographic'` + sprites/spritesheet/tilemap.
   A IA detecta o estilo pelo **código do projeto** (opções do `Game`, assets)
   e pelo pedido do usuário, não por flag.

## Consequências

- Um projeto pode transitar livremente entre 3D, 2.5D e 2D — basta mudar a
  configuração de câmera (`projection`, `pixelsPerUnit`) e os assets; nada no
  metadado ou na IDE o rotula.
- A camada 2D do engine (SPEC-0051: ortográfica, sprites, tilemap) permanece
  intacta — ela é capacidade, não tipo.
- Quem quer começar 2D não ganha mais um `main.ts` ortográfico pronto na
  criação; pede pro Chat IA (que conhece a receita 2D do `engine-api.md`) ou
  configura à mão. Se isso pesar, a evolução natural é template por
  **exemplos/receitas**, não por tipo.
- `cortex.json` de projetos antigos com `type` continua válido; o campo só
  deixa de ter efeito.
- Substitui o ADR-0052. Relaciona-se com 0051 (camada 2D), 0040 (template
  rico) e 0022 (padrão de projetos).
