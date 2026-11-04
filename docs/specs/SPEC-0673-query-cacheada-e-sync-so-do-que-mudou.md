# SPEC-0673 — Query cacheada no tick e sync só do que mudou

**Data:** 2026-11-03
**Status:** implementado

## Contexto

O DDD 00 (Port Hollow) mede no export nativo (Hermes sem JIT) `world` 18–22 ms, com o `Object3DSyncSystem` em
30–33% (~6 ms). A cena tem ~2,1 mil entidades ECS; o `SceneBuilder` cria uma entidade por colisor estático
(`Transform + Object3D + Collider2D`), então a maioria das entidades que o sync varre **nunca se move**.

Dois custos por quadro:

1. **`World.tick` refaz a query de cada sistema.** Para cada um dos ~32 sistemas, `query(...required)` percorre
   o `Set` de todas as entidades, faz um `Map.has` por componente exigido e copia as que casam num array novo.
   Sistemas com `requiredComponents = []` (editor, `VehicleControlSystem`, `SkidMarkSystem`, `FrameHookSystem`
   do jogo…) recebem uma cópia de TODAS as entidades. Ordem de grandeza: 2,1 mil × 32 percursos e milhares de
   `push` por quadro, refeitos mesmo quando nenhuma entidade ganhou ou perdeu componente.
2. **O sync escreve tudo, sempre.** Por entidade: dois `getComponent` (`Map.get` por nome de classe),
   `position.set`, `rotation.order = 'YXZ'` e `rotation.y = …`. Os dois setters de `Euler` disparam o
   `_onChangeCallback` do `Object3D`, que recalcula o quaternion (`setFromEuler`: 6 `sin`/`cos`) — **duas vezes
   por entidade por quadro**, mesmo quando nada mudou. No interpretador do Hermes é o grosso dos ~6 ms.

## Decisão

### 1. Query cacheada no `World.tick` — fica com a ADR-0676

> **Atualizado na integração da Fase 3 (`perf/fase3-integracao`).** Esta spec e a SPEC-0675/ADR-0676
> implementaram, em paralelo, um cache da consulta do `tick` com um contador de estrutura próprio. Ficou **um**
> mecanismo só: o da **ADR-0676** (`src/ecs/structureVersion.ts` com `structureVersion()`/`bumpStructureVersion()`,
> cache em `WeakMap` por identidade do `requiredComponents` — o que também cobre `static get requiredComponents()`
> que devolve array novo por leitura —, lista de entidades percorrida por índice). O cache em `Map` e o contador
> `ecsStructureVersion`/`bumpEcsStructure` descritos originalmente aqui foram descartados; o `TerrainCollisionSystem`
> da SPEC-0674 também lê o contador da ADR-0676. Os testes do cache são os de `tests/ecs/worldQueryCache.test.ts`
> (os casos exclusivos do antigo `tests/ecs/queryCache.test.ts` foram levados para lá).

O que esta spec exige do cache, e a ADR-0676 cumpre: o array só troca de **identidade** numa mudança estrutural
(entidade criada/destruída, componente adicionado — inclusive substituição do mesmo tipo — ou removido de fato,
`World.clear`); na invalidação nasce um array **novo** (o do quadro anterior não muda por baixo); `world.query()`
público continua devolvendo array novo; o array do `tick` é **só leitura** para o `update`.

### 2. Sync só do que mudou, por comparação com o próprio `Object3D`

O `Object3DSyncSystem` passa a comparar o `TransformComponent` com o `Object3D` e só escreve o que difere:

- `position.x/y/z` diferentes do transform → `position.set(...)`;
- `rotation.order !== 'YXZ'` → seta a ordem;
- `rotation.y !== transform.rotationY` → seta o yaw.

O resultado de cada quadro é o **mesmo** de antes (o `Object3D` termina igual ao transform em posição, ordem e
yaw), inclusive quando alguém escreve direto no `Object3D` (é sobrescrito, como antes) ou direto no transform
(`player.transform.x = …`: a diferença aparece e é copiada). A única diferença observável é não refazer o
quaternion quando o `Euler` já está certo — e ele já é coerente com o quaternion, porque o `Object3D` mantém os
dois sincronizados nos callbacks. `NaN` no transform continua sendo escrito todo quadro (`NaN !== NaN`), como antes.

Para não pagar os dois `getComponent` por entidade, o sistema guarda os pares `(TransformComponent,
Object3DComponent)` em dois arrays paralelos, refeitos só quando o array de entidades recebido muda de
identidade (com o item 1, isso só acontece numa mudança estrutural). `Object3DComponent.object` é lido a cada
quadro, então trocar o objeto do componente continua funcionando.

Uma entidade estática custa por quadro: duas leituras de array e cinco leituras/comparações de campo. Nenhuma
escrita, nenhum `sin`/`cos`.

### Alternativas consideradas

- **Dirty flag/versão no `TransformComponent` (setters em `x/y/z/rotationY`).** Daria O(sujos) em vez de
  O(entidades), mas troca campos por acessores: toda leitura de `transform.x` no jogo e na engine vira chamada de
  função no Hermes sem JIT (CharacterPhysics, câmeras, IA leem transform muitas vezes por quadro), `{ ...t }` e
  `Object.assign` deixam de ver os campos (acessores ficam no protótipo), e quem escreve direto no `Object3D`
  deixaria de ser corrigido pelo sync — mudança de semântica. A comparação mantém a semântica e corta o caro
  (escritas e recálculo de quaternion); o resíduo O(n) é de leituras de campo.
- **Lista explícita de estáticos fora do sync.** Exigiria marcar estático no `SceneBuilder` e confiar que
  ninguém move um estático (o editor F2 move). A comparação cobre o caso sem marca.

## Consequências

- `World.tick` não aloca nem percorre entidades nos quadros sem mudança estrutural.
- O sync deixa de escrever e de recalcular quaternion nas entidades paradas (colisores estáticos, carros
  dormindo, pedestres parados).
- **Espelho nativo (SPEC-0322):** os setters de `Euler` passam pelo gancho do `NativeSceneMirror`, então antes
  TODA raiz de entidade ficava suja todo quadro e virava linha na ponte. Agora só as que se movem. Efeito
  colateral aceito: numa raiz de entidade parada, `material.visible`/lado da sombra mudados em runtime chegam
  ao host pela varredura em rodízio (até `SWEEP_PERIOD_FRAMES` quadros), como já acontecia com os nós que não
  são entidade; `visible`, posição, escala e rotação continuam sujando na hora pelos ganchos. Nó com
  `matrixAutoUpdate = false` cuja `matrix` é escrita à mão não suja por gancho — nenhuma entidade faz isso
  hoje (o único caso é o `matrixComposeFreeze` de diagnóstico do `Game`).
- **Com o gancho da SPEC-0678** (o espelho só suja a rotação quando o quaternion muda): os dois filtros compõem.
  O sync não escreve o que já está igual; quando escreve (transform mudou, ou alguém mexeu no `Object3D` por
  fora e o sync corrige), o quaternion muda e o gancho suja o slot — nenhuma mudança se perde. Posição passa
  pelos acessores do gancho, que também só sujam com valor diferente. Coberto por
  `tests/systems/object3dSyncMirror.test.ts` (parado não suja; transform, yaw, rotação externa, pitch do jogo e
  ordem trocada sujam e terminam iguais ao transform).
- O array passado ao `System.update` pelo `tick` não pode ser mutado pelo sistema (já não era em nenhum lugar).
- Quem precisar da semântica antiga de "sempre escreve" (nenhum caso conhecido) pode chamar
  `obj.rotation.order = 'YXZ'` por conta própria.
- Testes: `tests/ecs/worldQueryCache.test.ts` (cache da ADR-0676, ver item 1), `tests/systems/Object3DSyncSystem.test.ts` (transform escrito direto é sincronizado; entidade parada
  não recebe escrita; `Object3D` mexido por fora é corrigido; troca de componente).
