# SPEC-0687 — Carro com pose externa fora do passo do VehicleArcadeSystem

**Data:** 2026-11-04
**Status:** implementado
**Base:** SPEC-0259 (frota no mesmo mundo), SPEC-0655 (carro parado dorme)

## Contexto

Plano de 75 fps do DDD 00 no export nativo (Hermes sem JIT). O `VehicleArcadeSystem` mede ~0,64 ms por quadro com
116 carros. Fora o passo do Rapier (nativo), ele gasta:

- no `beforeStep`, por subpasso e para TODO carro: `getComponent` + `isSleeping()` + `isDynamic()` (cada um uma
  chamada nativa no shim), só para dar `continue` nos cinemáticos;
- no `update`, para todo carro: `getComponent` ×2, `isSleeping()`, um `WeakSet` (`restingPose`) e, para todo corpo
  que não dorme, `translation()` + `rotation()` (2 chamadas nativas e 2 objetos novos), `position.set` e
  `quaternion.set` (que no three roda `Euler.setFromQuaternion` e o gancho do espelho de cena).

Cinemático nunca dorme (shim `rapier-compat.js`), então os ~75 carros do trilho do jogo, os pausados e os
estacionados congelados são copiados todo quadro, inclusive os que não andaram. O jogo já sabe a pose desses carros
(foi ele que a escreveu no corpo) e sabe quando ela não mudou.

## Decisão

### 1. `ArcadeVehicleComponent.poseOwner`

```ts
export type VehiclePoseOwner = 'physics' | 'external';
car.poseOwner = 'external';
```

- `'physics'` (padrão, o comportamento de antes): o sistema roda aderência + `vehicle.update` (se dinâmico e
  acordado) e copia a pose do corpo para a malha depois do passo.
- `'external'`: o sistema não toca o carro. Nem aderência, nem controlador, nem leitura do corpo, nem escrita na
  malha. Quem marcou escreve a malha quando a pose muda (o trilho do jogo escreve a mesma pose que deu ao corpo
  cinemático). O corpo continua no mundo Rapier: colide e é avançado pelo `world.step` como qualquer corpo.
- Pensado para corpo cinemático ou congelado. Corpo dinâmico marcado `'external'` ainda é simulado pelo Rapier, mas
  sem o controlador do carro e sem a malha seguir: é responsabilidade de quem marca.
- Trocar o dono sobe um contador de versão estático (`ArcadeVehicleComponent.poseOwnerVersion`). Atribuir o mesmo
  valor não sobe. Voltar para `'physics'` zera a marca "pose de repouso copiada", então a malha recebe a pose do
  corpo já no quadro da troca, mesmo com o corpo dormindo.

### 2. Lista compacta no sistema

O sistema guarda arrays paralelos (componente, malha) **só dos carros `'physics'`**, refeitos quando:

- o array `entities` da query muda de identidade (o `World` devolve o mesmo array até a estrutura mudar: qualquer
  `addComponent`/`removeComponent` cria outro); ou
- `poseOwnerVersion` mudou desde a última montagem.

O `beforeStep` e a cópia percorrem só essa lista, sem `getComponent`. Dentro dela a regra é a mesma de antes:
dinâmico dormindo ou corpo cinemático passam reto no `beforeStep` (o Rapier acorda sozinho um dinâmico que leva
batida, então o `isSleeping()` dos dinâmicos continua sendo consultado), e a cópia pula quem dorme e já teve a pose
copiada.

### 3. `restingPose` vira campo do componente

O `WeakSet<Entity>` dá lugar a `ArcadeVehicleComponent.restingPoseCopied` (boolean). Mesma regra: acordado zera,
dormindo copia uma vez e marca.

## Alternativas descartadas

- **Leitura de pose em lote no shim nativo** (`bodiesPoses(handles, out)`): tira as alocações, mas pede Rust + C++,
  um caminho diferente no navegador (o Rapier wasm não tem a função) e continua copiando o carro que não andou. Fica
  para depois, só se os dinâmicos acordados pesarem.
- **Flag `simulated` derivada de `isSleeping`/`isDynamic` em cache**: fica velha quando o Rapier acorda um dinâmico
  por contato; a malha descolaria da física.
- **O sistema perguntar `poseOwner` de cada carro todo quadro** (sem versão): ~116 leituras por quadro em troca de
  nada; a versão custa uma comparação.

## Testes

`tests/systems/VehicleArcadeExternalPose.test.ts`:

- carro `'external'`: sem `vehicle.update`, sem `translation()`/`rotation()` do corpo e malha intocada, mesmo com o
  corpo cinemático andando;
- de volta para `'physics'`: a malha recebe a pose do corpo no mesmo quadro, também com o corpo dormindo;
- equivalência: com todos `'physics'`, a pose da malha é a mesma do caminho antigo (os testes da SPEC-0259/0655
  seguem verdes) e a contagem de leituras do corpo cai só pelos `'external'`;
- atribuir o mesmo dono não sobe a versão; entidade nova (identidade da query) entra na lista.

## Consequências

- API pública nova e pequena: `VehiclePoseOwner`, `poseOwner`, `poseOwnerVersion`, `restingPoseCopied`.
- Quem marca `'external'` tem de voltar para `'physics'` em TODA troca para dinâmico (o jogo faz isso no release do
  trilho e no descongelar do estacionado). Esquecer deixa a malha parada com o corpo andando.
- Sem mudança no host C++ nem no espelho de cena.
