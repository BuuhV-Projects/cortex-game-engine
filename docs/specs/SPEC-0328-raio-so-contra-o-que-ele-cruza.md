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

Resultado idêntico ao anterior: mesma superfície mais próxima, mesma distância (o
desempate entre duas malhas exatamente coplanares pode trocar o `object`, nunca o
ponto). Comportamento do braço (SPEC-0311) e da colisão (degrau, parede, anti-clip)
inalterado.

## Consequências

- O custo dos raios passa a depender do que o raio cruza, não do que está em volta
  do personagem: no meio da rua o braço da câmera não testa malha nenhuma além do
  chão que ele atravessa.
- A varredura (`tpCollect`) e o `rebuild` do índice não mudam; a busca no índice
  continua linear nos alvos (~900 no Comercial). Índice espacial (grade) só entra se
  a busca linear aparecer no perfil.
- Testes: `tests/physics/nearMeshes.test.ts` (`alongRay` conservador e ordenado,
  `firstHit` = 1º acerto do `intersectObjects`, layers, filtro),
  testes da câmera (não atravessa parede) e `tests/systems/CharacterPhysics.test.ts`
  (para na parede, sobe degrau).

## Medição

(preenchida após o A/B no export release)
