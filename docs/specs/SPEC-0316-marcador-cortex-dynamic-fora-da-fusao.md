# SPEC-0316 — Marcador `cortexDynamic`: objeto do jogo fora da fusão estática

**Data:** 2026-10-07
**Status:** aceito

## Contexto

No export nativo do DDD 61 a lataria do carro do detetive sumia: ficavam só rodas
e lanternas, "fantasmas" paradas no spawn. O jogo põe o carro na cena **antes** do
`buildScene` (o cenário procedural entra antes pra física do Character enxergar)
e chama `setupVehicle` depois. No host nativo o `buildScene` termina com o
`mergeStaticScene` (SPEC-0120/0121), que funde toda malha visível que não seja de
entidade ECS dinâmica, script, gatilho, skinned, vegetação, terreno, água ou
veículo autorado (`cortexVehicle`, que só os nós do `level.json` recebem). O carro
criado em código não tinha nada disso: a carroceria foi assada em
`static-merged-N` no spawn e o `Group` que o veículo move ficou vazio.

O problema é geral: porta de enrolar, ponteiro de relógio, letreiro que troca de
material, trem, ônibus — todo objeto criado em código que se mexe depois do build
e já está na cena quando a fusão roda. A engine não tem como deduzir "vai ser
movido depois" (é o futuro do jogo); quem cria o objeto sabe.

Achado junto: `InstancedMesh` e `BatchedMesh` passam no filtro `isMesh`. Quando
dividem o material com outra malha, o bake fundia só a geometria base (sem as
matrizes de instância) e todas as instâncias sumiam.

## Decisão

- **Marcador público `userData.cortexDynamic = true`.** Em qualquer objeto ou
  ancestral, tira a subárvore do `mergeStaticScene` e do `wrapStaticInBundle`
  (os dois usam o mesmo `isExcludedByUserData`). É o mesmo mecanismo das flags
  existentes (`cortexWater`, `cortexVehicle`…); não há API nova a exportar.
- Marcar a **raiz** do objeto móvel (o `Group` que o jogo move/esconde). Marcar
  só as malhas também funciona, mas raiz é o contrato documentado.
- **`InstancedMesh`/`BatchedMesh` nunca entram na fusão** (já são 1 draw).
- `cortexVehicle` continua excluindo — mas é config de autoria de veículo
  (Inspector/`VehicleAuthoring`); objeto de jogo usa `cortexDynamic`.

Alternativa descartada: a engine detectar sozinha o que vai se mexer (ex.: rodar a
fusão depois de N quadros e comparar matrizes). Não pega troca de `visible`/
material que acontece minutos depois (porta, letreiro), adia o ganho de fps e
muda o momento do merge, de que o aquecimento de pipelines depende.

## Consequências

- Jogo que cria objeto móvel em código antes do `buildScene` precisa marcar
  (documentado em `engine-api.md` §merge e `architecture.md`). Esquecer só aparece
  no export nativo — o Studio não funde.
- Objeto marcado vira draw próprio: marque só o que se mexe, não o cenário.
- Teste: `tests/scene/StaticMerge.test.ts` (subárvore marcada intacta;
  `InstancedMesh` intacta).
