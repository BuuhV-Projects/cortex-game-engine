# SPEC-0646 - Braço da câmera de 3ª pessoa: candidatas preparadas uma vez por quadro

**Data:** 2026-10-31
**Status:** aceito (otimiza a SPEC-0625 sem mudar o comportamento)

## Contexto

O braço da SPEC-0625 (5 raios com o raio da câmera + o do peito, desvio de yaw) era o
maior sistema do `world` no export nativo do Port Hollow: `ThirdPersonControlSystem`
≈ 5,5 ms/quadro (`?systemProfile=1`, autopiloto andando). Medido com sonda temporária
no host nativo, por quadro:

| parte | ms/quadro |
|---|---|
| `clearance` (6 raios) | 2,0–2,5 |
| desvio (`swing`, até 22 ângulos × 6 raios) | 0 a 1,8 (quando encosta) |
| `collect` (índice próprio, rebuild a cada 250 ms) | 0,9–1,4 |

Índice da câmera: 660 malhas, **179 `wide`** (grandes demais para a grade XZ, entram em
toda consulta). Por raio: `gather` ≈ 214 índices, ≈ 75 candidatas, `alongRay` ≈ 0,17 ms e
`firstHitAmong` ≈ 0,13–0,22 ms (o roteamento de cada candidata — camada, geometria,
matriz — é JS; só o teste de triângulos é C++). Os 6 raios são quase paralelos e caem
nas **mesmas** candidatas: o trabalho JS se repetia 6 vezes (e 132 vezes no desvio).

## Decisão

1. **Candidatas preparadas** (`physics/nativeRaycast.ts`): `prepareCandidates(cand, layers,
   out)` roteia a lista UMA vez (slots/matrizes do host, ou a lista JS fora do host) e
   `firstHitPrepared(raycaster, prepared)` dispara um raio contra ela — uma chamada ao
   C++ sem laço JS por candidata. Sem a ordem de entrada (entradas 0): o C++ testa todas,
   e todas estão perto (a lista é a do feixe).
2. **Braço** (`CameraArmProbe.clearance`): um `alongRay` com folga `pad` = `CAM_RADIUS`
   (caixa e esfera de cada malha infladas) dá as candidatas dos 5 raios paralelos —
   conservador: um raio deslocado ≤ `pad` do central só cruza malhas cuja caixa inflada o
   central cruza. O raio do peito (deslocado `lowDrop`, maior que `pad`) segue com o
   `firstHit` normal. Por quadro: 2 consultas ao índice em vez de 6.
3. **Desvio** (`CameraArmProbe.swing`): todas as sondas têm comprimento `need + r` e saem
   do alvo ou do peito, então cabem num cilindro em volta do alvo: um `nearXZ(alvo, need
   + 2r)` com faixa de Y preparado uma vez serve os 6 raios de todos os ângulos.
4. **Índice compartilhado** (etapa 2, depois da 1ª medição): o `collect` refazia um
   índice próprio das ~660 malhas visíveis a cada varredura — quase todas já indexadas
   pelo `groundIndex` do `CharacterPhysicsSystem`. A varredura publicada
   (`publishScan`) passa a levar também esse índice (`ground`) e o **resto** (`rest`:
   visível que não é chão — vegetação, água, marcação de rua; `groundMeshes` é
   subsequência de `visibleMeshes`, então sai num passe O(n)). A câmera consulta o
   `ground` compartilhado (o próprio jogador sai por `skip`, como no raio de chão da
   física) e só reconstrói um índice pequeno do `rest`. Mesmo conjunto de alvos de antes
   (visível − skinada − jogador). Sem varredura publicada (sem `CharacterPhysicsSystem`
   ou com várias raízes), segue o índice próprio de antes.
5. Comportamento, constantes e testes da SPEC-0625 não mudam; o desvio continua só
   quando nem `CAM_MIN_DIST` cabe.

Descartado: **spherecast do Rapier** no lugar dos raios. A cidade colide com a câmera
por malha visível (a varredura da SPEC-0328), não por collider do Rapier — trocar
mudaria contra o que a câmera bate (só o que tem `collider` no nó). Cache do resultado
com câmera parada: não ajuda andando (o caso medido) e atrasaria o encolher imediato
para objeto que se move (carro) até o próximo rebuild.

## Consequências

- Medição no export nativo do Port Hollow: ver §Medição.
- `prepareCandidates`/`firstHitPrepared` são internos (não exportados no
  `index-runtime`); o `alongRay` ganha o parâmetro opcional `pad` (padrão 0, mesmo
  resultado de antes).
- `SceneScan` ganha `ground`/`rest` opcionais (interno, não exportado).

## Medição

(preenchida após a rodada A/B no export nativo)
