# SPEC-0328 - Raio só contra o que ele cruza (câmera e personagem, mais perto primeiro)

**Data:** 2026-10-09
**Status:** aceito

## Contexto

Frente R3-F2 do ciclo "75 fps no export nativo" do DDD 61. Na R2b (export release,
engine 0e3ea11c, jogo 9be7c6f) a sonda por fase mostrou:

| ponto | `ThirdPersonControl` | `tpRays` | `tpCollect` | alvos | candidatas/quadro | `CharacterPhysics` |
| --- | --- | --- | --- | --- | --- | --- |
| Comercial | 2,39 | 1,94 | 0,40 | 918 | 76 | 1,82 |
| Setor O | 0,74 | 0,53 | 0,17 | 416 | 48 | 1,68 |
| Hélio dirigindo | 0,57 | 0,40 | 0,15 | 301 | 48 | 1,50 |

O custo da câmera é o **raio × malha**, não a varredura. O spring arm pedia ao
`NearMeshIndex` (SPEC-0302/0323) as malhas cuja caixa alcança uma **esfera** de
`camDist + camHeight` (7 m) em volta da cabeça, e passava as 76 a dois
`intersectObjects`. No Hermes cada malha com árvore BVH custa ~10–20 µs por raio
mesmo sem acerto: o `raycastObject3D` do three-mesh-bvh **não** tem descarte por
esfera — inverte a `matrixWorld`, transforma o raio e desce na raiz da árvore. E o
`intersectObjects` coleta **todos** os acertos de todas as malhas (cada um vira um
objeto com ponto/normal/uv) só pra ler o primeiro.

O personagem tem o mesmo padrão: o raio de chão desce sem limite contra todo o
empilhado sob os pés (calçada, rua, laje, célula fundida), coletando todos os
acertos; os 12 raios de parede, idem, contra as paredes que tocam a caixa.

## Decisão

1. **Consulta por raio no índice (`NearMeshIndex.alongRay`).** Em vez de "a esfera
   em volta do ponto", o índice devolve só as malhas cuja caixa em mundo (com a
   folga) E cuja esfera o **segmento** do raio cruza, junto da distância em que ele
   entra na caixa. Teste de slab caixa × raio; eixo com direção 0 só rejeita se a
   origem está fora da faixa. Conservador: as duas formas contêm a geometria, então
   todo acerto possível está nas candidatas.
2. **Mais perto primeiro (`firstHit`).** As candidatas são ordenadas pela distância
   de entrada na caixa e testadas nessa ordem; assim que a próxima entra mais longe
   que o melhor acerto achado, para — nada atrás dela pode acertar antes. Respeita
   `layers` como o `intersectObjects` (malha só de sombra, layer 29, continua fora)
   e aceita um filtro de acerto (o próprio personagem).
3. **`firstHitOnly` nos raycasters de colisão.** Câmera e personagem só usam o
   acerto mais próximo de cada malha; com a flag o three-mesh-bvh usa `raycastFirst`
   (para no 1º triângulo) e devolve um acerto por malha. Malha sem árvore cai no
   raycast padrão do three (todos os acertos), e o `firstHit` pega o menor.
4. Onde vale:
   - câmera (os 2 raios do braço): `firstHit` no índice dos alvos da câmera;
   - chão e anti-clip do terreno: `firstHit` nos índices de chão/terreno, pulando o
     próprio personagem (antes: `intersectObjects` + 1º acerto que não é ele);
   - paredes: continuam `intersectObjects` na lista curta do `touchingBox`
     (SPEC-0323), agora com `firstHitOnly`.

5. **Grade XZ no índice.** `nearXZ`/`alongRay` não varrem mais a lista toda: o
   `rebuild` distribui as malhas em células de `GRID_CELL` = 8 m pela caixa com folga
   (`Map` célula → índices); malha que cobre mais de 16 células (rua, célula fundida,
   InstancedMesh espalhada) fica numa lista "larga" que entra em toda consulta;
   consulta que cobre mais de 64 células (raio infinito na horizontal) varre tudo. A
   ordem de saída é a da lista original (desempate igual ao da varredura linear).
   - Tentada e descartada: grade em typed arrays (CSR por hash, sem `Map`) — no
     interpretador (`node --jitless`, proxy do Hermes) montar saiu 1,0 ms contra 0,6 ms
     do `Map` (chamada de função + `fill` de 4 mil baldes pesam sem JIT).
6. **`rebuild` reaproveita a malha parada.** Se a `matrixWorld` (16 números) e a
   esfera local são exatamente as da varredura anterior, esfera e caixa em mundo vêm
   do registro guardado, sem `applyMatrix4`. No proxy: `rebuild` de 920 malhas paradas
   3,6 → 1,7 ms (a cada 250 ms, em 4 índices: câmera + chão/terreno/parede). Geometria
   que muda no lugar (o three reaproveita o objeto `Sphere`) muda a esfera local e
   recalcula.
7. **Malha que o raio CRUZA ganha árvore a partir de `CROSSED_MIN_BVH_TRIS` = 64
   triângulos.** A 2ª sonda (custo por malha dentro do `firstHit`, Comercial) achou
   **`onibus_laranja` = 1,39 ms/quadro sozinho**: ~400 triângulos e raio < 10 m, então
   o `ensureBoundsTree` o recusava ("pequena e compacta", corte de `MIN_BVH_TRIS` =
   512, ADR-0108/SPEC-0320) e cada raio que cruzava a caixa dele testava triângulo
   por triângulo (~0,7 ms/raio no Hermes; com árvore ~20 µs). O corte de 512 continua
   valendo pra preparação em massa na varredura; o `firstHit` e o `touchingBox` pedem
   a árvore com 64 a quem eles vão de fato testar. A marca de recusa guarda o corte
   usado (`_cortexBvhSkip` = número), e só um corte menor tenta de novo.

   Custo por classe de malha na 2ª sonda (Comercial, ms/quadro, câmera + chão):
   ônibus 1,39 · malhas com árvore 0,66 · InstancedMesh 0,84 (`portas-lojas`, 214
   instâncias sem árvore, 0,41) · sem árvore 0,03 · busca no índice (`alongRay`) 0,32.
   ~50 candidatas por raio: 128 malhas "largas" (fusões estáticas, InstancedMesh da
   cidade inteira) cuja caixa contém a origem do raio — a ordenação por entrada não
   as corta.

Resultado idêntico ao anterior: mesma superfície mais próxima, mesma distância (o
desempate entre duas malhas exatamente coplanares pode trocar o `object`, nunca o
ponto). Comportamento do braço (SPEC-0311) e da colisão (degrau, parede, anti-clip)
inalterado.

## Consequências

- O custo dos raios passa a depender do que o raio cruza, não do que está em volta
  do personagem: no meio da rua o braço da câmera não testa malha nenhuma além do
  chão que ele atravessa.
- A varredura (`traverseCollidable`) não muda; o `rebuild` fica mais barato pra
  malha parada e ganha a montagem da grade.
- Malhas pequenas que um raio de colisão cruza ganham árvore no 1º quadro em que isso
  acontece (custo único, ~centenas de triângulos; a geometria compartilhada entre
  clones — ônibus — monta uma vez só).
- Testes: `tests/physics/nearMeshes.test.ts` (`alongRay` conservador e ordenado,
  `firstHit` = 1º acerto do `intersectObjects`, layers, filtro),
  testes da câmera (não atravessa parede) e `tests/systems/CharacterPhysics.test.ts`
  (para na parede, sobe degrau).

## Medição

(preenchida após o A/B no export release)
