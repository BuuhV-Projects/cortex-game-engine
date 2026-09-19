# 0216 - Raycast de mundo no Rapier do host

**Data:** 2026-09-19
**Status:** aceito

## Contexto

No export nativo do kart-racer a corrida não começava: a contagem terminava, mas
nenhum carro andava e o acelerador não respondia. O `error_log.txt` do host
mostrou a causa, repetida a cada frame:

```
[raf] excecao JS: TypeError: undefined is not a function
    at followGround (...)
```

O `followGround` do `CarSystem` é o que mantém o carro colado no chão, e ele
usa o raycast do mundo:

```ts
physics.world.castRayAndGetNormal(ray, dist, false, …, body,
  collider => !collider.isSensor() && collider.parent()?.isFixed() === true)
```

O Rapier do host não tinha nada disso:

- `World.castRayAndGetNormal` — inexistente. O Rust só tinha o raycast INTERNO
  das rodas do `DynamicRayCastVehicleController` (SPEC-0209).
- `Collider.isSensor()` e `Collider.parent()` — o `Collider` do shim tinha
  apenas `collisionGroups`/`setCollisionGroups`.

A exceção derrubava o `update` do sistema do carro inteiro, todo frame.

**Não é regressão.** O raycast de mundo nunca existiu no host: a SPEC-0209
validou que o Circuito Capital **carrega e renderiza**, não que ele **dirige** —
o carro ficou parado na largada em todos os testes de então, e isso passou
despercebido. O filtro por callback (registrado como "predicate ignorado" na
SPEC-0209) só tornou a falta visível.

## Decisão

Portar o raycast de mundo pela mesma ponte do veículo: Rust → C ABI → C++ → JS.

### Rust — `rn_world_cast_ray`

Uma função, resultado pelo `scratch` (o padrão do módulo: nada de marshaling por
chamada).

```
rn_world_cast_ray(world, ox, oy, oz, dx, dy, dz, maxToi, solid,
                  filterFlags, excludeBody) -> f64   // 1 = acertou, 0 = não
```

Scratch no acerto: `[0]` distância (time of impact), `[1..3]` normal,
`[4]` handle do collider, `[5]` handle do corpo dono (ou -1).

`filterFlags` é uma máscara, espelhando o `QueryFilterFlags` do Rapier:

| bit | significado            |
| --- | ---------------------- |
| 1   | exclui corpo fixo      |
| 2   | exclui corpo dinâmico  |
| 4   | exclui kinemático      |
| 8   | exclui sensores        |

O filtro roda **dentro do Rapier** (`QueryFilter`), que é o lugar certo: ele
poda durante a travessia, em vez de devolver um acerto para o JS descartar.

### JS — `World.castRayAndGetNormal`

Assinatura igual à do `@dimforge/rapier3d-compat`, porque é o que o engine e o
jogo já chamam:

```ts
castRayAndGetNormal(ray, maxToi, solid, filterFlags?, filterGroups?,
                    filterExcludeCollider?, filterExcludeRigidBody?, filterPredicate?)
```

Devolve `null` ou `{ collider, toi, timeOfImpact, normal, point? }` — os dois
nomes de distância porque o runtime vendorizado usa `timeOfImpact` e as tipagens
antigas usam `toi`; o `followGround` já trata os dois.

`Collider` ganha `isSensor()` e `parent()`, que é o que um `filterPredicate`
precisa para decidir.

### O `filterPredicate`: a busca CONTINUA na recusa

O que dá para expressar em `filterFlags` roda nativo. O predicate é avaliado em
JS sobre o acerto e, quando **recusa**, a origem do raio avança logo além do
ponto recusado e o raio é **relançado** — até achar um acerto aceito, acabar o
alcance ou estourar o limite de tentativas.

A primeira versão parava na primeira recusa e devolvia `null`. Custou uma rodada
de teste: no Circuito Capital os gates de checkpoint são **sensores sobre a
pista**, o raio do carro acertava o sensor primeiro, o predicate recusava, e o
`followGround` concluía "sem chão" — **o carro afundava no asfalto**.

Relançar em JS evita atravessar a ponte por collider testado (caro no Hermes) e
dá o mesmo resultado: a distância devolvida é sempre medida da origem original.

### O resto da API que faltava junto

Rodar o jogo de verdade revelou, um erro por vez, o que mais o host não tinha.
Cada um derrubava o tick inteiro:

| API                                  | quem usa                                         |
| ------------------------------------ | ------------------------------------------------ |
| `World.castRay`                      | míssil do kart procurando parede                 |
| `World.getRigidBody` / `removeRigidBody` | limpeza de corpos no respawn                 |
| `World.gravity`                      | o carro cancela a gravidade ao longo da pista    |
| `RigidBody.mass()`                   | impulso de frenagem da IA (`-missing * mass()`)  |
| `VehicleController.wheels` / `wheelCount` | o `followGround` lê posição/raio por roda   |
| `Collider.isSensor()` / `parent()`   | o `filterPredicate` do raycast                   |

Fechado por varredura: todas as chamadas `body.*`/`collider.*`/`world.*` do jogo
E do engine foram cruzadas com o shim, em vez de continuar descobrindo uma por
export.

## Consequências

- **O carro dirige no host.** O `followGround` para de lançar exceção, o update
  do `CarSystem` volta a rodar e a corrida anda.
- Qualquer jogo que use `world.castRayAndGetNormal` passa a funcionar no export
  — não é específico do kart-racer.
- A ponte cresce em uma função; o `scratch` de 16 f64 já comporta o retorno.
- O predicate segue sendo uma aproximação (ver acima). Quem precisar da busca
  contínua vai precisar do callback atravessando a ponte.

## Validação

- `tests/native/rapier-compat-raycast.test.ts` — a forma da API sobre um
  `__rapierNative` falso: acerto e não-acerto, os dois nomes de distância,
  tradução dos `filterFlags`, exclusão de corpo, `isSensor`/`parent`, e o
  predicate recusando o acerto.
- `native/tests/` (C++) — a ponte devolve o que o Rust escreveu no scratch.
- **Dirigir de verdade no export** (o teste que decide): largar, acelerar e
  conferir no `perf-trace.jsonl` que a câmera SAI da largada
  (`-46.7, 3.7, 89.9`). Resultado: **253 m em X e 159 m em Z**, com altura
  estável (`y = 3.9`, sem afundar), e a tela mostrando **70 km/h, marcha D,
  4º/6** — a posição na corrida prova que a IA dos rivais também voltou.
