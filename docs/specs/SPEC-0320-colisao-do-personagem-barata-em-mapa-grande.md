# SPEC-0320 - Colisão do personagem barata em mapa grande (BVH em malha espalhada, varredura sem as escondidas)

**Data:** 2026-10-07
**Status:** aceito

## Contexto

Rodada 1 do ciclo "75 fps no export nativo" do DDD 61. Na medição R0 o
`CharacterPhysicsSystem` custava 8–10 ms/quadro no export (Hermes) com **um**
personagem parado, e o `ThirdPersonControlSystem` 3,4–5,6 ms. A hipótese era a
varredura da cena a cada `COLLECT_INTERVAL_MS` (SPEC-0302) sobre ~10 mil nós.

A sonda por fase dentro do sistema (export release, spawn do Setor O, janela de
500 ms ≈ 7 quadros; os baldes somam 69,9 de 70,5 ms do total — o instrumento fecha)
**desmentiu** a hipótese:

| fase | ms / 500 ms |
| --- | --- |
| raios de PAREDE (12/quadro) | 42,9 |
| varredura (`collectScene`) | 14,0 |
| raio de CHÃO | 11,5 |
| `NearMeshIndex.rebuild` (×3) | 1,5 |

A segunda sonda (tempo por malha dentro dos raios) achou a causa: **uma** malha —
`static-merged-3`, fusão estática de 336 triângulos espalhada pela cidade — custava
**~0,54 ms por raio** (1950 raios em 150 quadros = 1,04 s). Ela fica abaixo do corte
`MIN_BVH_TRIS = 512` (ADR-0108), então não tem árvore; e como a esfera envolvente
cobre a cidade, o descarte por esfera do three nunca a rejeita e cada raio testa os
336 triângulos um a um. Menores do mesmo tipo: `portas-lojas` (12 tris, 50 µs/raio),
`carros-estacionados` (72 tris, 27 µs/raio). Uma malha COM árvore custa ~20 µs/raio.
O corte por contagem de triângulos assume malha compacta; a fusão estática
(SPEC-0316/ADR-0280) produz malha pequena **e** espalhada.

Na varredura: dos 10 125 nós, só ~900 estão visíveis — o resto está em subárvores
escondidas (células da cidade fora do alcance). `traverseCollidable` descia nelas a
cada 250 ms só pra garantir o BVH (SPEC-0307), duas vezes (física e câmera).

## Decisão

1. **`ensureBoundsTree` também monta a árvore em malha espalhada**: geometria com
   esfera envolvente de raio ≥ `SPREAD_BVH_RADIUS` (10 m, espaço local) ganha BVH
   mesmo abaixo de `MIN_BVH_TRIS`. Pequena e compacta continua sem árvore (o
   descarte por esfera do three já a rejeita barato).
   - Alternativas pesadas: (a) **árvore pra tudo** — tira o corte do ADR-0108, paga
     memória/carga em todo tile pequeno e compacto, que já é barato; (b) **descarte
     por esfera antes do raycast da BVH** — não ajuda: a esfera da malha espalhada
     contém o raio. O critério é o que de fato torna o raio caro: o raio cair DENTRO
     da esfera com frequência.
2. **A varredura não desce em subárvore escondida já preparada**:
   `traverseCollidable` deixa o `visit` devolver `false` pra não descer nos filhos.
   - `CharacterPhysicsSystem`: na 1ª vez que encontra uma raiz escondida, desce uma
     vez pra montar o BVH (preserva a SPEC-0307: sem pico no quadro em que o culling
     a mostra) e a guarda num `WeakSet`; nas varreduras seguintes, não desce.
     `refresh()` esquece o conjunto (prepara de novo).
   - `ThirdPersonControlSystem` (alvos da câmera): nunca desce em escondida (nunca
     usou o que havia lá).
   - Colisão idêntica: dentro de subárvore escondida tudo é escondido (a exceção
     `cortexSolid` vale só pro nó que é ele mesmo invisível sob pai visível), então
     nada que colide deixava de ser visitado.

## Consequências

- Malha adicionada **depois** dentro de uma subárvore que já estava escondida e
  preparada não ganha BVH antecipado: monta na varredura em que ficar visível
  (comportamento de antes da SPEC-0307 só pra esse caso). `refresh()` cobre quem
  troca muita coisa de uma vez.
- Malhas espalhadas pequenas ganham árvore (memória da ordem do buffer de posições —
  pequena por definição).
- Testes: `tests/physics/raycastAccel.test.ts` (malha pequena espalhada ganha árvore;
  pequena compacta não), `tests/physics/nearMeshes.test.ts` (`visit` → `false` poda),
  `tests/systems/CharacterPhysics.test.ts` (escondida preparada uma vez; colisão igual
  depois de mostrar).

## Medição

Export release (sem `--debug`) do DDD 61 3e2323d, A = engine main e4e10dca × B = esta
mudança, `?systemProfile=1`, 100–110 s por rodada, descarta os 30 s iniciais, pares
intercalados (A,B depois B,A). ms/quadro = acumulado da janela de 500 ms ÷ quadros.
Máquina não ociosa (outros exports rodando em paralelo): leia as faixas, não o 2º
decimal.

| ponto | | CharacterPhysics ms/q | ThirdPerson ms/q | frameMs med | fps (1000/med) |
| --- | --- | --- | --- | --- | --- |
| spawn Setor O | A | 11,5 / 8,5 | 5,1 / 3,7 | 80,3 / 61,0 | 12,5 / 16,4 |
| spawn Setor O | B | 3,0 / 3,0 | 1,2 / 1,2 | 57,3 / 58,1 | 17,5 / 17,2 |
| Taguatinga | A | 11,1 / 9,8 | 6,0 / 5,2 | 71,6 / 62,9 | 14,0 / 15,9 |
| Taguatinga | B | 3,2 / 3,1 | 1,0 / 1,0 | 55,4 / 52,7 | 18,1 / 19,0 |

Baldes da sonda (spawn, ms por 500 ms, A → B): parede 42,9 → 15,0; chão 11,5 → 7,0;
varredura 14,0 → 2,3; câmera: varredura 12,3 → 2,3, raios 18,5 → 7,6. As listas têm o
mesmo tamanho nos dois (99 sólidos, ~283 alvos da câmera).

Colisão igual: no navegador (vite do jogo, bundle dev A × B), 20 quedas numa grade
em volta do spawn + 4 caminhadas contra parede com `world.tick(16)` determinístico
deram posição do personagem e da câmera **idênticas** número a número.

O que sobra no sistema (~3 ms/q) é a parede: 12 raios × ~33 malhas "perto" (a folga
`MOVING_MARGIN` de 5 m põe muita malha estática na lista); `VehicleControlSystem`
(~2,5 ms/q, passo do Rapier) não mudou.
