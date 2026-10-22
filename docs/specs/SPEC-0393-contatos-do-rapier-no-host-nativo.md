# SPEC-0393 - `contactPairsWith` / `contactPair` no Rapier do host nativo

**Data:** 2026-10-22
**Status:** aceito
**Relacionados:** SPEC-0392 (Audio no host, o outro bloqueio do boot do DDD 61), SPEC-0337 / ADR-0336 (Rapier nativo com patch)

## Contexto

Com o `Audio` resolvido (SPEC-0392), a main do DDD 61 (`e2be01c`) passava do boot no export nativo, mas
ficava parada na tela "Aquecendo os gráficos…" sem apresentar nenhum quadro. O precompile terminava
(39,7 s) e o `GameLoop` agendava o rAF. Uma sonda por fase do quadro mostrou que o 1º tick entra no
`onUpdate` do jogo e não sai. O `error_log.txt` do export registrava:

```
[raf] excecao JS: TypeError: undefined is not a function
    at hasContact   (entities/breakableProps.ts do jogo)
    at urbanContact (main.ts do jogo, CarDamage)
```

`BreakableProps.hasContact` (commit `11c8849` do jogo) consulta o narrow-phase do Rapier:
`world.contactPairsWith(collider, cb)` e `world.contactPair(c1, c2, cb(manifold, flipped))`, lendo
`manifold.numContacts()` e `manifold.contactDist(i)`. No `@dimforge/rapier3d-compat` (browser/Studio)
esses métodos existem; o adaptador do host (`native/js/src/shims/rapier-compat.js`) não tinha nenhum
deles. A exceção sobe pelo callback do rAF antes de ele se reagendar e o laço morre no 1º quadro. No
browser o `GameLoop` também morreria com uma exceção ali: o defeito é a API faltando, não o laço.

Varredura de todas as chamadas `world.*` do jogo contra o adaptador: só esses dois métodos faltavam.

## Decisão

Expor a consulta de contato do narrow-phase nas três camadas, com nomes e semântica do rapier3d-compat:

- **Rust** (`native/rapier-native/src/lib.rs`):
  - `rn_world_contact_pairs_with(world, collider, start)` — escreve no `scratch` até 16 handles dos
    colliders que formam par de contato com `collider`, a partir do par `start`, e devolve quantos
    escreveu. O JS repete com `start += 16` enquanto vierem 16.
  - `rn_world_contact_pair(world, c1, c2, manifold)` — para o manifold `manifold` do par (c1, c2): devolve
    o número de pontos (até 15 distâncias no `scratch[1..]`) e `scratch[0]` = 1 se o par está invertido
    (o `collider1` do Rapier é `c2`); `-1` se não há par ou manifold com esse índice.
- **C++** (`native/src/shims/rapier.cpp`): `__rapierNative.contactPairsWith` / `contactPair`, finos.
- **JS** (`rapier-compat.js`): `World.contactPairsWith(collider1, f(collider2))` (como o compat: todo par
  do narrow-phase, com ou sem contato ativo) e `World.contactPair(c1, c2, f(manifold, flipped))`, uma
  chamada por manifold. O manifold tem `numContacts()` e `contactDist(i)`.

## Consequências

- O DDD 61 da main volta a tickar no export; o dano do carro em objetos urbanos funciona como no Studio.
- Subconjunto do `TempContactManifold`: só `numContacts`/`contactDist`. Normal, pontos locais e
  `solverContact*` ficam para quando um jogo usar (mesma DLL, mais um `what`).
- Recompila a DLL do Rapier e o host (função nova no C ABI e no N-API).
- Testes: `cargo test` (par chão × caixa apoiada: par listado, manifold com distância ≤ 0), Vitest do
  adaptador com `__rapierNative` falso (paginação de 16 e a ordem `flipped`), e o export do DDD 61 rodando.
- Diagnóstico registrado no `architecture.md`: a exceção do tick sai no `error_log.txt`, não no stdout.
