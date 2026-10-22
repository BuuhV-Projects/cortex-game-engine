# SPEC-0352 - Controle de terceira pessoa antes do `Object3DSync`

**Data:** 2026-10-20
**Status:** aceito
**Relacionados:** SPEC-0351 (`onLateUpdate`, mesmo diagnóstico), SPEC-0350 (engasgos do Play no Studio)

## Contexto

O `ThirdPersonControlSystem` anda o personagem (x/z e o giro no `TransformComponent`) e posiciona a câmera,
em `priority = 20`. O `Object3DSyncSystem`, que copia o `TransformComponent` para o `Object3D`, roda em 10:
**antes**. No mesmo quadro a câmera saía do transform novo e o boneco desenhado mostrava o transform do quadro
anterior; o passo só chegava ao `Object3D` no quadro seguinte.

Com quadros regulares é um atraso constante, invisível. Num engasgo (SPEC-0350: 60–90 ms no Play do Studio)
o passo do quadro longo é grande: a câmera salta junto, o boneco fica para trás e só alcança no quadro
seguinte — o personagem treme em relação à câmera, pior correndo. Medido no DDD 61 correndo a 6 m/s com
travadas de 70 ms: o `Object3D` andava 0,08 m no quadro de 79 ms e 0,46 m no seguinte. Quem lia o passo pelo
`Object3D` (o animador do player) via a velocidade despencar no engasgo.

Os outros controles já movem antes do sync (`PlatformerInputSystem` 1, `TopDownMovementSystem` 2); os de
prioridade 20+ só posicionam câmera e leem o que já foi sincronizado.

## Decisão

- `ThirdPersonControlSystem.priority` 20 → **6**: depois do `CharacterPhysicsSystem` (5, gravidade, pulo e
  chão — o controle segue "depois da física") e antes do `Object3DSyncSystem` (10).
- Câmera e `Object3D` saem do mesmo transform no mesmo quadro.

## Consequências

- O que lia o transform do personagem entre 6 e 20 (`TerrainCollisionSystem` 7, Rapier e veículos 8) passa a
  ver o passo do quadro; nenhum deles move o personagem de terceira pessoa.
- Sistemas de jogo que precisam rodar depois do controle (câmera própria, como a do metrô do DDD 61 em 25)
  continuam depois.
- Teste: um tick com o stick pra frente deixa `Object3D` e `TransformComponent` iguais.
