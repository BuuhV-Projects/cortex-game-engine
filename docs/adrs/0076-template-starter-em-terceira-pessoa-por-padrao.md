# 0076 - Template starter em 3ª pessoa por padrão

**Data:** 2026-06-27
**Status:** aceito

## Contexto

O ADR-0064 definiu o demo padrão do template (`templates/new-project/`) como **1ª
pessoa**: `main.ts` com `setupFirstPerson` e `level.json` com um player `primitive`
cilindro. Depois, o ADR-0074 portou o **controle de 3ª pessoa** (`setupThirdPerson`,
`ThirdPersonControlSystem`) e colocou a **arte do personagem** (KayKit CC0 —
`templates/new-project/assets/characters/player.glb`, rigado com clipes
idle/walk/run/jump/fall) no template. Mas o starter (`main.ts`/`level.json`)
continuou em 1ª pessoa.

Resultado incoerente: o template já embarcava o personagem rigado **e** o sistema de
3ª pessoa, mas o primeiro contato não os exercitava — o player era um cilindro sem
animação. 3ª pessoa (personagem visível + câmera atrás) é o estilo mais comum pra
open-world/aventura (o caso de uso que motivou o port no ADR-0074) e mostra mais do
engine de cara (modelo rigado + animação data-driven + câmera orbital), sem custo de
asset extra: o GLB já está no template.

## Decisão

O demo padrão do template passa a ser **3ª pessoa**:

1. `templates/new-project/main.ts` usa `setupThirdPerson` (mouse orbita, WASD
   relativo à câmera, Shift corre, Espaço pula, `facingOffset: π` porque o mannequin
   nasce virado pra +Z) no lugar de `setupFirstPerson`, e tica as animações com
   `game.onUpdate((dt) => scene.update(dt))` — sem essa linha o mixer não roda e o
   personagem fica congelado.
2. `templates/new-project/scenes/level.json` troca o player `primitive` cilindro por
   um nó `model` `.glb` (`assets/characters/player.glb`, KayKit CC0) com
   `matte: false` (mantém o PBR) e o mesmo nó `character` (a física vertical vem do
   `buildScene`).
3. A 1ª pessoa **continua disponível** como `setupFirstPerson` (ADR-0064) — só deixou
   de ser o default do starter.

## Consequências

- O primeiro contato com o engine é um jogo 3D em **3ª pessoa com personagem
  animado** — exercita modelo rigado + animação (ADR-0054) + câmera orbital
  (ADR-0074) sem código extra. Coerente com "3D por padrão" (ADR-0062).
- **Supersede o item 3 do ADR-0064** (demo padrão = 1ª pessoa / cilindro). O
  `FirstPersonCameraSystem` e o `setupFirstPerson` permanecem intactos; quem quer FPS
  só troca a chamada no `main.ts`.
- O `main.ts` ganhou a linha de tick de animação (`scene.update(dt)`), necessária pro
  mixer do `SceneAnimator`; está documentada no comentário do template.
- Projetos **já criados** não mudam (vendoraram o template antigo); afeta só projetos
  novos.
- Sem verificação automatizada do template (depende de criar projeto + rodar no IDE
  WebGPU). Validação feita: `level.json` válido no schema (`parseSceneDefinition`),
  `player.glb` confirmado idêntico ao mannequin rigado do projeto de referência, e o
  teste do scaffold (`tests/electron-main.test.ts`) verde.
