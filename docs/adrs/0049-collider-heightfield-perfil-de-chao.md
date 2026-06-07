# 0049 - Collider heightfield (perfil de chão que o player segue)

**Data:** 2026-06-07
**Status:** aceito

## Contexto

Pontes arqueadas (que afundam no meio), morros e rampas não casam com um collider
box/circle/capsule: uma caixa tem **topo plano** no ponto mais alto → o player anda
reto e **flutua acima** da barriga da ponte. Colidir com a malha (silhueta) faria o
player enganchar em cada tábua/corda e é caro/instável. Faltava a versão
"plataformer" da silhueta: um **perfil de chão** que o player percorre seguindo a
curva.

## Decisão

`Collider2DComponent.shape = 'heightfield'` + campo **`points`** (`[x,y]` em espaço
LOCAL, relativos ao centro = Transform + offset, **ordenados por X**). É um **floor
one-way que segue a curva**:

1. **`heightfieldY(points, x)`** (`collide2d.ts`): altura interpolada do perfil no X
   local (clampa nas pontas). Módulo puro, testado.

2. **Passo dedicado no `PlatformerPhysicsSystem`** (separado do box-axis e do MTV):
   amostra a superfície sob a **pegada** do ator (esquerda/centro/direita, pega o
   ponto mais alto → não afunda numa subida) e pousa o ator na curva. Pousa vindo de
   cima (`vy ≤ 0` e base estava acima no frame anterior); atravessa por baixo. Fora
   do alcance X → ignora (as ilhas/colliders adjacentes assumem).

3. **Serialização:** `colliderSchema` ganhou `points`; `buildScene` deriva o bbox
   (broadphase/gizmo) dos pontos e passa `points` ao componente; overlay
   (`data.colliders`) carrega/persiste.

4. **Editor:** o gizmo desenha a **poli-linha** (faixa fina verde) + um
   **handle** (quadradinho) em cada ponto. O inspector tem:
   - **Auto-traçar** (`autoHeightfield`): amostra o topo do mesh (raycast pra
     baixo no z central — pega o deck, ignora corrimãos fora do z central) e gera
     o perfil automaticamente. Ponto de partida.
   - **Desenhar/editar** (`startHeightfield` → `EditorState.drawingHeightfield`):
     **clicar adiciona** ponto, **arrastar um handle move** o ponto, Backspace
     desfaz, Enter finaliza. O clique raycasta o **próprio mesh** (superfície
     visível, independe do ângulo da câmera; fallback no plano Z com Y clampado ao
     bbox). A seleção/gizmo cede o clique enquanto desenha; persiste no overlay a
     cada mudança. (Heightfields vindos do código seguem read-only.)

## Consequências

- Pontes/morros ganham colisão que segue o relevo com **um collider só**, sem
  enganchar (não é a malha) e sem custo de polígono.
- Caminho **separado** na física (não toca box-box nem o MTV) → zero regressão; 234
  testes anteriores + 3 novos (heightfieldY + curva).
- A amostragem por pegada (3 pontos) evita o player afundar em V/subidas; perfis
  com **overhang** (não-monotônicos em X) não são suportados (é heightfield, não
  polígono fechado) — pra isso, use vários colliders.
- Autoria hoje é **código/JSON** (dev fornece os pontos). Uma ferramenta de traçar
  a curva no editor é evolução natural.
- Relaciona-se com ADR-0045 (primitivas), 0047 (collider como propriedade), 0048
  (formas círculo/cápsula).
