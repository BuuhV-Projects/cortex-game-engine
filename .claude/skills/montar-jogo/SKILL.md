---
name: montar-jogo
description: Monta um jogo jogável na cortex-game-engine a partir de assets/kits em disco, com método inventário→design→validação em camadas. Use quando o usuário pedir para criar/montar/prototipar um jogo (ou uma fase/mecânica nova) a partir de assets, kits 3D ou packs comprados.
---

# Montar jogo a partir de assets (cortex)

Método validado no teste4/Cute Obstacle Rush: quase zero retrabalho porque **cada
suposição é verificada antes de virar código**. Siga as fases na ordem.

## Fase 1 — Inventário REAL (nunca confie em prints/carrinho)

1. Varrer o disco (`find`/Glob) — o que existe de verdade, formato (.glb/.fbx), tamanho.
2. Prints de loja ≠ assets baixados. Se faltar algo do plano, **dizer na hora** e
   propor alternativa com o que há (placeholder-first ou pivô de gênero).
3. Agrupar por **estilo visual**: só packs do mesmo idioma visual entram no mesmo
   jogo (misturar estilos = cara de asset flip). O jogo nasce do maior conjunto coeso.
4. Checar animação: personagem tem rig+clipes? Quais nomes? Um player cujos clipes
   **já batem** com o controlador do engine vale mais que o bonito que precisa de
   conversão — monte o loop com o que funciona, troque o visual depois (swap barato).

## Fase 2 — Escolher o jogo (escopo terminável)

- O gênero é o que os assets **pedem** (kit de obstáculos → obstacle course; kit de
  fazenda → tycoon), não o sonho grande. 1 loop, 1 fase, terminável em semanas.
- Explicitar o loop em 1 frase (largada → percurso → morte/checkpoint → chegada).

## Fase 3 — Ler o engine ANTES de codar

1. Ler os `.d.ts` do `vendor/cortex-game-engine/` relevantes: `SceneDefinition`
   (schema de nós), setups prontos (`setupThirdPerson`/`setupPlatformer`/`setupTopDown`),
   componentes de física, `Game`, `World`.
2. **Validar no fonte a suposição crítica** do design antes de desenhar (ex.: "o
   character pousa em plataforma? → grep no index.js: buildScene passa a cena como
   root de raycast do CharacterPhysicsSystem"). Uma suposição errada aqui custa o
   level inteiro.
3. Respeitar CLAUDE.md do projeto: física declarada nos nós (não cravada em código),
   `debug()` não console.log, ADR junto de decisão.

## Fase 4 — Medir os assets (não chutar escala)

Script node que lê o GLB (header JSON + accessors min/max, transform hierarquia) e
imprime bounding box + faixa Y de cada peça-chave. Decide: o que serve de plataforma,
altura de itens, alcance de partes móveis (pivô vs ponta!). Guardar o script no
scratchpad — reusar.

## Fase 5 — Arquitetura de risco mínimo

- **Colisão = primitivas** (`primitive` box com topo exato). `.glb` do kit é
  decoração/gatilho visual por cima. Pivô esquisito de asset vira problema cosmético,
  nunca de gameplay.
- **Uma fonte só** gera cena E gatilhos (`scenes/course.ts` exporta `def` + listas de
  triggers com posição-mundo). Nunca duplicar posições em dois lugares.
- **Gameplay = controller TS** (`game.onUpdate`) lendo a posição do player
  (`world.query(CharacterBodyComponent)`) vs triggers por proximidade (dist² XZ + faixa Y).
  Simples, sem depender de física de sensor.
- Respawn próprio: `character.groundY: -100` (sem piso invisível) + morrer em y<limiar.
- HUD = DOM simples. `R` reinicia. Pausar tudo quando `game.editorActive || game.gameplayPaused`.

## Fase 6 — Validar em camadas (na ordem, barato→caro)

1. `yarn typecheck`
2. Vite transforma cada módulo novo (curl 200 no dev server; porta 5174 pode já estar
   servida pelo Play da IDE — não subir outro).
3. Console do Chrome headless no load: **zero exceção** (WebGPU→WebGL2 fallback é normal).
4. Todos os assets referenciados respondem 200 (um 404 trava o await do buildScene).
5. Screenshot headless NÃO renderiza WebGPU/Play-gate → **playtest visual é do usuário
   no IDE**. Pedir feedback específico (alcance de pulo, força, feel) e tunar números.

## Gotchas conhecidos (custaram iteração)

- **GLB com textura EXTERNA**: nem todo `.glb` embute as imagens — alguns (ex.:
  kit platformer-base/Kenney) referenciam `uri: "Textures/colormap.png"` relativo
  ao arquivo. Copiar só o `.glb` = modelo BRANCO (textura não acha). Ao trazer
  peça de kit, inspecionar `json.images[].uri` (header do glb) e copiar as
  texturas junto, preservando o caminho relativo.

- **Hazard móvel vira "chão"**: o raycast do character pousa em cima do mesh. Desligar
  raycast dos meshes do hazard (`obj.traverse(c => c.raycast = () => {})`) → vira só gatilho.
- **Gatilho no pivô ≠ gatilho na peça**: obstáculo giratório tem pivô no eixo; a
  cabeça varre longe (medir!). O gatilho deve **seguir a parte móvel** por ângulo
  (`pos + [cos(θ), -sin(θ)] * headR`), não ficar fixo no centro.
- Spread de opts pode sobrescrever `place` montado — separar (`const { place, ...rest }`).
- `world.query()` genérica aceita 1 classe; filtrar pela mais específica.
- Knockback: velocidade horizontal residual com decaimento (0.4-0.5s) + `velocityY`
  direto no CharacterBody; cooldown ~0.9s pra não re-disparar em sobreposição.

## Fase 7 — Fechar

- Commits em grupos lógicos (assets | gameplay | chore), Conventional Commits pt-BR,
  sem co-author.
- Atualizar memória do projeto (estado, gotchas novos, pendências).
- Se houve decisão de arquitetura → ADR (regra do usuário: documentar conforme constrói).
