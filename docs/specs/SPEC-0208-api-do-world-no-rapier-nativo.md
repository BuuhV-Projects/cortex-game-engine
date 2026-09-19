# 0208 - API do `World` no Rapier nativo (e por que o kart-racer não roda no host)

**Data:** 2026-09-19
**Status:** aceito

## Contexto

Primeira vez que o preview nativo (PRD-0007) rodou num jogo real que não o
`teste4`: o **kart-racer**. O host subiu, carregou o bundle e morreu no setup:

```
[js] [error] Falha ao carregar o Circuito Capital: undefined is not a function
TypeError: undefined is not a function
  at ?anon_0_createCar (boot.bundle.js:18786:3042)
```

A coluna do erro cai em `car.physics.world.forEachRigidBody(...)`.

O `rapier-compat.js` do host espelha um **subconjunto** da API do Rapier do
browser — e o que falta só aparece em runtime, como um `undefined is not a
function` no meio do setup, sem dizer qual função é. O `teste4` nunca passou por
ali: ele usa o character controller, não corpos rígidos do Rapier.

> Antes de chegar aqui, investiguei a hipótese errada de que o Hermes não teria
> `TypedArray.from` (`Uint32Array.from` aparece no mesmo caminho de código). Um
> probe rodado **no próprio host** mostrou `Uint32Array.from = function`. Fica o
> método: compilar um `.js` com `hermesc`, trocar o `boot.hbc` de um export por
> ele e rodar — responde qualquer dúvida sobre o que o Hermes tem.

## Decisão

### `World.forEachRigidBody` e `World.numRigidBodies`

O `World` passa a guardar os corpos que cria e a iterá-los, como o Rapier do
browser faz com sua arena interna. A iteração usa uma **cópia** da lista: o
callback pode criar corpos (o padrão "compara antes e depois" que o kart-racer
usa com o `createVehicle`), e iterar o array vivo entraria em laço.

### A mensagem do bloqueio real

`createVehicleController` continua lançando — o controlador de veículo do Rapier
não foi portado —, mas a mensagem antiga citava uma nota interna
(`m1-inventario-teste4.md`), o que não ajuda quem só queria exportar o jogo.
Agora ela diz o que a informação significa:

> controlador de veículo do Rapier (DynamicRayCastVehicleController) ainda não
> foi portado para o host nativo. Jogos que usam `createVehicle` (carro/kart)
> rodam no Studio, mas não no export nem no preview nativo.

## Consequência que importa

**O kart-racer não roda no host nativo hoje** — nem no export, nem no preview
nativo. Não é o `forEachRigidBody` (corrigido aqui): é o controlador de veículo,
que vive no lado Rust do `rapier-native` e nunca foi exposto. Qualquer jogo de
carro/kart esbarra nisso.

Portar exige trabalho no `rapier-native` (Rust) + shim: expor
`DynamicRayCastVehicleController` (criar, configurar rodas, `updateVehicle`,
estado por roda) através da mesma ponte dos outros tipos. É um marco próprio,
não um ajuste.

Enquanto isso, quem quiser exercitar o preview nativo deve usar um jogo que o
host suporta — o `teste4` é o caminho batido.

## Validação

6 unitários em `tests/native/rapier-compat-world.test.ts`: ordem de iteração,
mundo vazio, criar corpo dentro do callback (sem laço), callback inválido,
contagem, e a mensagem do `createVehicleController`.
