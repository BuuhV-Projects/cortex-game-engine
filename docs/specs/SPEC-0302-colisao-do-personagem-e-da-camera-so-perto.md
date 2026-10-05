# SPEC-0302 - Colisão do personagem e da câmera só contra o que está perto

**Data:** 2026-10-05
**Status:** aceito

## Contexto

No jogo Detetive Brasília (cidade aberta, ~1,5 km), o perfil de CPU do Chrome
(probe headless, amostra de 0,2 ms) mostrou, depois de corrigidos os gargalos do
próprio jogo, que ~35% da CPU do quadro ia para o `CharacterPhysicsSystem` e ~8%
para a colisão de câmera do `ThirdPersonControlSystem`:

- **`collectScene` a cada quadro:** `traverse` da cena inteira para remontar as
  listas de chão/parede/terreno, mesmo sem nada ter mudado.
- **13 raios por personagem por quadro** (1 de chão + 12 de parede) contra **todas**
  as malhas da cena: o raycast do three testa a esfera envolvente de cada malha
  (`applyMatrix4` + teste) por raio, então o custo é 13 × nº de malhas, inclusive as
  que estão a 1 km.
- **Câmera:** `traverse` da cena inteira + raio contra todas as malhas, todo quadro.

O mesmo perfil num jogo pequeno não aparece; cresce com o tamanho do mapa.

Além disso, a câmera atravessava **paredes baixas** (boxes de feira, muretas): o
raio do spring arm sai da altura da cabeça (`camHeight`) e sobe com o pitch, então
passa por cima de uma parede de ~2,6 m, e a câmera ia parar atrás dela, escondendo
o personagem.

## Decisão

1. **Lista da cena em cache:** o `CharacterPhysicsSystem` e o spring arm da câmera
   remontam as listas a cada `COLLECT_INTERVAL_MS` (250 ms) em vez de todo quadro.
   `refresh()` força a remontagem no próximo quadro (pra quem troca muita coisa de
   uma vez, ex. carregar fase).
2. **Só o que está perto:** antes dos raios, `physics/nearMeshes.ts` filtra as
   malhas cuja esfera envolvente em mundo (a mesma que o raycast do three usa:
   `geometry.boundingSphere` ou a do `InstancedMesh`) alcança o personagem — no
   plano XZ para o raio de chão (que é vertical) e para as paredes (alcance = raio
   da cápsula), e em 3D a partir do alvo para a câmera (alcance = distância da
   câmera). Uma passada barata por malha por quadro, em vez de uma por raio.
3. **Câmera vê parede baixa:** além do raio da cabeça, um segundo raio paralelo sai
   da altura do peito (`CAM_LOW_RAY_FRACTION` de `camHeight`); a câmera fica no mais
   curto dos dois.

O resultado dos raios é o mesmo de antes para tudo o que existia na cena no último
recolhimento: o filtro só remove malhas que nenhum raio poderia tocar.

## Consequências

- Objeto **adicionado** à cena vira chão/parede em até 250 ms; objeto **removido**
  pode seguir colidindo por até 250 ms. Quem precisa de efeito imediato chama
  `refresh()`. (Mover objetos já coletados não tem atraso: os raios usam a
  `matrixWorld` atual.)
- `InstancedMesh` cujas instâncias mudam precisa ter `computeBoundingSphere()`
  chamado pelo dono — já era exigência do raycast do three.
- Medir de novo no jogo e registrar o ganho na SPEC-0044 do Detetive Brasília.
