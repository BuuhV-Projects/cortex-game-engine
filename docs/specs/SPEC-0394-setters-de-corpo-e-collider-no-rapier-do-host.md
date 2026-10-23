# SPEC-0394 - Setters de corpo e collider no Rapier do host nativo

**Data:** 2026-10-23
**Status:** aceito
**Relacionados:** SPEC-0393 (contatos do narrow-phase, mesma classe de defeito), SPEC-0314 (`setEnabled`), SPEC-0209 (veículo)

## Contexto

Com a SPEC-0393 a main do DDD 61 (`e2be01c`) passou a rodar no export nativo a pé. Dirigindo
(`?spawn=helio&drive=1`), o tick morria assim que o carro encostava num poste ou numa árvore:

```
[raf] excecao JS: TypeError: undefined is not a function
    at activate (entities/breakableProps.ts do jogo)
```

`BreakableProps.activate` tira do pool um corpo fixo com cápsula e o ajusta ao objeto atingido.
`BreakableProps.break` o transforma em dinâmico para cair. Nenhum desses setters existia no
adaptador do host (`native/js/src/shims/rapier-compat.js`).

Cruzamento completo das chamadas do jogo (`e2be01c`) com o adaptador, por classe (métodos públicos
do `@dimforge/rapier3d-compat` × métodos que o jogo chama × o que o shim define, conferido no ponto de
chamada para descartar homônimos do three e do jogo). Faltavam exatamente:

- `RigidBody`: `setBodyType`, `enableCcd`, `setLinearDamping`, `setAngularDamping`
- `Collider`: `setRadius`, `setHalfHeight`, `setDensity`, `setFriction`, `setRestitution`

Todo o resto que o jogo chama (`setTranslation`, `setRotation`, `setLinvel`/`setAngvel`,
`setEnabledRotations`, `setEnabled`, `collider(i)`, `numColliders`, `parent`, contatos) já existia.

## Decisão

Nomes e semântica do rapier3d-compat, com a menor superfície nova no C ABI:

- **Corpo:** códigos novos no `rn_body_set` que já existe, sem ponte C++ nova:
  12 = `set_body_type(x, wake)` (0 dinâmico, 1 fixo, 2 cinemático por posição, 3 por velocidade, a
  numeração do `RigidBodyType` do Rapier), 13 = `enable_ccd(x != 0)`, 14 = `set_linear_damping(x)`,
  15 = `set_angular_damping(x)`. O `isDynamic/isFixed/isKinematic` já lê o tipo do Rust (código 4 do
  `rn_body_get`), então reflete a troca sem mudança.
- **Collider:** `rn_collider_set(world, collider, what, value)` + `__rapierNative.colliderSet`:
  0 = raio (cápsula ou bola), 1 = meia-altura (cápsula em Y), 2 = densidade, 3 = atrito,
  4 = restituição. Mudar a forma ou a densidade faz o Rapier recalcular a massa do corpo no passo
  seguinte, como no browser.

## Consequências

- Bater o carro em poste e árvore funciona no export: o objeto tomba como no Studio.
- `setRadius` em forma que não é cápsula nem bola e `setHalfHeight` fora da cápsula não fazem nada
  (o jogo só usa cápsula). Cilindro e cone entram quando um jogo usar.
- Recompila a DLL do Rapier e o host (`colliderSet` novo no N-API).
- Testes: `cargo test` (corpo fixo → dinâmico cai; cápsula com raio e meia-altura novos; densidade muda a
  massa), Vitest do adaptador (códigos e argumentos certos) e a rodada dirigindo do DDD 61 no kit.
