# SPEC-0288 — Esfera de culling calculada uma vez por geometria no `instance()`

**Data:** 2026-10-02
**Status:** aceito

## Contexto

`instance(gltf)` (`src/scene/SceneAssets.ts`) clona a cena do GLTF e, em
`fixCulling`, chama `computeBoundingSphere()` em **toda** malha do clone. O
recálculo existe porque a esfera que o `GLTFLoader` monta a partir do `min`/`max`
do accessor pode não cobrir a malha, e o objeto sumia do frustum mesmo no centro
da tela.

Mas `clone()` compartilha a geometria: a partir da segunda instância, o recálculo
percorre de novo os mesmos vértices para chegar na mesma esfera. No streaming de
LOD do crash-bandicoot-racer cada troca de LOD é um `instance()`, e no host
nativo (Hermes, sem JIT) isso domina o custo da troca:

| LOD | vértices | `instance()` | só a esfera |
| --- | --- | --- | --- |
| `19-curva-s` LOD0 | 129.677 | 77,8 ms | 84,2 ms |
| `10-coqueiro` LOD0 | 55.583 | 40,0 ms | 36,2 ms |
| `13-bromelias` LOD1 | 24.979 | 20,4 ms | 18,7 ms |

Na volta medida, frames com troca de LOD ficaram ~23 ms acima dos demais
(mediana 52,6 vs 29,2 ms) e respondem pela maior parte dos picos de 80–150 ms.

## Decisão

`fixCulling` recalcula a esfera **uma vez por geometria**: um `WeakSet` de
geometrias já recalculadas pelo `instance()`. A primeira instância de um GLTF
corrige a esfera do loader como antes; as seguintes reaproveitam. O `WeakSet`
não segura a geometria descartada (o cache do `AssetLoader` continua dono dela).

## Resultado

Host, mesma medição: `instance()` repetido 77,8 → **0,2 ms** (`19-curva-s`
LOD0), 40,0 → 0,2 ms (`10-coqueiro`), 20,4 → 0,2 ms (`13-bromelias`).

Volta com a IA pilotando o jogador (`?bench` do crash-racer, ~3.000 frames,
host com o transcode assíncrono da SPEC-0287): frames com troca de LOD 52,6 →
**31,4 ms** (mediana; os sem troca, 30,7); p95 54,5 → 40,0 ms; p99 83,8 → 55,6
ms; pior frame 197 → 116 ms; frames de 80–150 ms 30 → 7.

## Consequências

- Troca de LOD com o asset em cache deixa de pagar uma passada pelos vértices.
- Código que **altera** a posição dos vértices de uma geometria compartilhada
  depois do `instance()` precisa recalcular a esfera por conta própria — o que
  já era necessário para o objeto original (o three não recalcula sozinho).
- Teste: `tests/scene/instanceBoundingSphere.test.ts`.
