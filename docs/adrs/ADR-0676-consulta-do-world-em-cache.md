# ADR-0676 — Consulta do `World.tick` em cache, invalidada por versão de estrutura

**Data:** 2026-11-03
**Status:** aceito
**Relacionados:** SPEC-0675, SPEC-0357, SPEC-0334

## Contexto

`World.tick` chamava `this.query(...required)` para cada sistema, todo quadro. A consulta percorria o `Set` de
entidades com `for…of` e montava um array novo. No Hermes (sem JIT) o `for…of` de um `Set` cria um objeto
`{ value, done }` por passo, e o array cresce por realocação. Sistema com `requiredComponents = []` (o
`FrameHookSystem` do DDD 00, ~19 instâncias; `TerrainCollisionSystem`, `VehicleControlSystem`,
`VehicleDriverSystem`, `SkidMarkSystem`) recebe **todas** as entidades: com ~2,1 mil entidades e ~25 sistemas assim,
o quadro passava por ~52 mil passos de iterador e ~25 arrays de 2,1 mil posições — a maior fonte de lixo da engine no
DDD 00 (estimativa na SPEC-0675).

## Alternativas

1. **Arquétipos** (tabela por combinação de componentes, como Bevy/flecs): resolve consulta e iteração, mas muda o
   armazenamento de `Entity` e a API de componentes inteira. Grande demais para o ganho que falta.
2. **Entidade avisa o `World` por consulta** (índice reverso componente → consultas): invalida só o que mudou, mas
   exige registrar cada consulta e manter conjuntos por componente; custo e código por `addComponent`.
3. **Cache por conjunto de componentes, invalidado por uma versão de estrutura** (escolhida): o `World` guarda, por
   array `requiredComponents` (identidade), o resultado e a versão em que foi montado. Qualquer
   `createEntity`/`destroyEntity`/`clear` e qualquer `addComponent`/`removeComponent` de qualquer entidade sobe a
   versão; a consulta seguinte remonta. Quadro sem mudança de estrutura não aloca nem percorre nada.

## Decisão

Opção 3. A lista de entidades passa a ser também um array (ordem de inserção, a mesma do `Set`), percorrido por
índice. `requiredComponents = []` recebe o array de todas as entidades, sem filtro.

O array entregue ao `update` é **compartilhado** entre sistemas com o mesmo `requiredComponents` e entre quadros
enquanto a estrutura não muda. Ele nunca é mutado depois de entregue: quando a estrutura muda, a consulta monta um
array **novo** (quem guardou o antigo continua com a foto de antes, como hoje). Contrato: `update` não deve mutar o
array recebido (nenhum sistema da engine nem do DDD 00 muta). `world.query(...)` público continua devolvendo um array
novo por chamada.

## Consequências

- Quadro sem mudança de estrutura: zero alocação e zero varredura na consulta do `tick`.
- Quadro com mudança (spawn, `addComponent`): remonta as consultas tocadas na hora do sistema — o mesmo custo de
  antes, uma vez.
- A versão é global (um contador do módulo): mudança numa entidade de outro `World` também invalida. Raro, e só custa
  uma remontagem.
- Um sistema que muta o array recebido corromperia o de outros sistemas — fica documentado no TSDoc do `System.update`.
- A chave é a identidade do array `requiredComponents`, num `WeakMap`: um `requiredComponents` declarado como getter
  (array novo por leitura) só perde o cache, sem vazar entradas; mutar o array estático no lugar não invalida nada
  até a próxima mudança de estrutura.
