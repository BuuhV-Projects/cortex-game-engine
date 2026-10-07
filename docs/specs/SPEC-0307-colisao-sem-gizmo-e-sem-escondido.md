# SPEC-0307 - Colisão do personagem e da câmera sem gizmo do editor e sem o que está escondido

**Data:** 2026-10-06
**Status:** aceito

## Contexto

No DDD 61, com o personagem em (0, 0), o perfil de CPU mostrou o
`CharacterPhysicsSystem.update` gastando ~3,95 ms por quadro e a colisão da câmera
(`placeCamera`) ~1,36 ms, mesmo depois do filtro "só o que está perto"
(SPEC-0302):

- **Gizmo do editor nas listas.** O `collectScene` só pulava a malha cujo PRÓPRIO
  `userData` tinha `editorInternal`. No `TransformControls` o flag fica na RAIZ do
  helper; as ~118 peças filhas (alças, planos, pickers) não têm o flag e entravam
  como chão/parede. Parado na origem, o gizmo caía dentro do `nearXZ` e cada raio
  testava essas malhas — o filtro `isEditorChrome` só descartava DEPOIS do raycast
  (o custo já tinha sido pago).
- **Malha escondida nas listas.** Nem a física nem a câmera olhavam `visible`.
  Num mapa grande o jogo esconde por distância (culling por célula), guarda
  objetos escondidos, etc. Tudo isso continuava nos raycasts. E é a mesma
  armadilha conhecida "visible=false ainda é chão": marcador escondido virava
  plataforma fantasma.
- **`nearXZ` ignorava Y.** Malha inteira ACIMA da origem do raio de chão (que só
  desce) era testada à toa.

## Decisão

1. **Varredura com poda** — `traverseCollidable(root, visit)` em
   `physics/nearMeshes.ts`, usada pelo `CharacterPhysicsSystem` (`collectScene`) e
   pela colisão da câmera do `ThirdPersonControlSystem`:
   - **não desce** em subárvore cuja raiz tenha `userData.editorInternal` (gizmo,
     helpers, contornos do editor — os filhos herdam a exclusão);
   - marca como **escondida** a subárvore com `visible = false` num ancestral (ou
     nela mesma). Escondido **não entra** nas listas de chão/parede/terreno nem nos
     alvos da câmera.
   - **Exceção — collider invisível declarado:** um objeto escondido que é ele
     mesmo `cortexSolid` (nó com `visible: false` + `collider` no `level.json`,
     ex. a malha de colisão do crash-racer) continua colidindo: é a intenção
     explícita de "parede/chão invisível".
2. **BVH continua no carregamento.** A física ainda percorre a subárvore escondida
   só pra chamar `ensureBoundsTree` (sem pôr nas listas): sem isso, a árvore de uma
   malha cortada por distância seria construída no quadro em que o culling a
   mostra — um pico novo no meio do jogo.
3. **Faixa vertical no `nearXZ`** (`minY`/`maxY` opcionais): o raio de chão passa
   `maxY` = altura da origem (malha toda acima não pode ser tocada por um raio que
   desce); as paredes passam a faixa das 3 alturas da cápsula. O raio de chão
   continua sem limite pra baixo (cai de qualquer altura).
4. Os filtros pós-raycast (`isEditorChrome`/`isCamIgnored` por ancestral nos
   hits) saem: a poda já garante que essas malhas não estão nas listas.

## Consequências

- Esconder (`visible = false`) agora tira a malha da colisão do Character e da
  câmera em até `COLLECT_INTERVAL_MS` (250 ms) — mostrar devolve no mesmo prazo
  (`refresh()` força na hora). Isso é o desejado (marcador escondido não vira
  chão); o colisor Rapier não muda (não depende de `visible`).
- Quem dependia de malha escondida SEM `collider` como chão do Character perde
  esse chão: marque o nó com `collider` (vira `cortexSolid`) ou deixe visível com
  material transparente.
- O personagem escondido pela câmera (occlusion fade) já era ignorado (é o
  próprio mesh); nada muda.

## Medição (DDD 61, probe headless, ms por quadro)

| | física na origem | câmera na origem | física no spawn | câmera no spawn | malhas na lista de chão |
|---|---|---|---|---|---|
| antes | 4,06–4,33 | 1,20–1,44 | 0,74–0,79 | 0,62–0,68 | 5950 (3486 "perto" da origem) |
| depois | 0,77 | 0,35 | 0,54–0,55 | 0,45 | ~550 (107 "perto" da origem) |
