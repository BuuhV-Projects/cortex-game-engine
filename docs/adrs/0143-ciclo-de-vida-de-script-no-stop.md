# 0143 - Play → Stop destrói as instâncias de script (e `disableRaycast` reversível)

**Data:** 2026-07-23
**Status:** aceito

## Contexto

Reportado no Studio: **depois de dar Play numa fase e voltar pro modo edição, a
maioria dos objetos parava de ser clicável** no viewport. Só as plataformas
(`land_*`) continuavam selecionáveis, e apenas um reload da IDE inteira devolvia o
clique.

A causa é a soma de três decisões que, isoladas, pareciam corretas:

1. Scripts de hazard/coletável desligam o raycast do próprio mesh no `onStart`
   (`obj.traverse(c => c.raycast = () => {})`) — sem isso o character pousa na
   lâmina, e a moeda atrás do player bloqueia o spring arm da câmera. Isso vinha
   sendo escrito **na mão em cada script** (10 no `teste4`).
2. O `ScriptHostSystem` pausava no editor via `pauseWhen`, que faz o `World`
   **pular o `update` do sistema**. O sistema nunca via a transição Play→Stop.
3. Portanto o `onDestroy` do `ScriptBehavior` **nunca era chamado ao parar o Play**
   — só ao remover o script pelo Inspector. As instâncias sobreviviam, e com elas
   o `raycast` neutralizado.

Como o **picking do editor também é raycast** (`intersectObjects`), o objeto ficava
permanentemente inselecionável. Os `land_*` escapavam por serem os únicos sem
script anexado — o que fazia o sintoma parecer aleatório.

## Decisão

**1. O Stop destrói as instâncias (ciclo estilo Unity).** O `ScriptHostSystem`
deixou de usar `pauseWhen`: ele roda todo frame e faz o gate internamente com o
`isEditing` do construtor, o que lhe permite enxergar a borda Play→Stop. Nessa
borda ele chama `restoreRaycasts()` + `onDestroy()` em cada instância e zera o slot
(`instance = null`, `started = false`). O Play seguinte instancia de novo e roda
`onStart` com estado limpo.

**2. Desligar raycast virou API reversível do `ScriptBehavior`.** Em vez de mexer
no `raycast` na mão, o script chama `this.disableRaycast()` (opcionalmente com um
alvo). A base registra o que silenciou e o host restaura no Stop. A restauração
respeita a origem do método: se o `raycast` vinha do **protótipo**
(`Mesh.prototype.raycast`, o caso normal), a cópia da instância é **apagada** em vez
de receber `undefined` — que deixaria o mesh quebrado.

O `ScriptAuthoring.removeScript` também restaura antes de soltar a instância: um
script removido no meio do Play não pode deixar o objeto sem clique.

## Consequências

- **`pauseWhen` não deve ser setado no `ScriptHostSystem`** por fora. Se for, o
  sistema volta a ser pulado no editor e o teardown nunca roda — o bug retorna.
  Está documentado no TSDoc da classe.
- **Scripts não podem mais contar com estado sobrevivendo ao Stop.** Nenhum
  dependia disso (a instância era um detalhe interno do host), e o comportamento
  novo é o esperado por quem vem da Unity.
- **`onDestroy` finalmente tem uso real** — antes só disparava na remoção pelo
  Inspector. Todo efeito colateral do `onStart` que saia do próprio script (mexer
  em material, textura, `visible`, listeners no `document`) deve ser desfeito lá.
  O `disableRaycast` é o único caso já coberto automaticamente.
- Jogos vendorizados precisam **re-vendorizar** pra ganhar o `disableRaycast`
  (feito no `teste4`); o padrão antigo continua compilando, mas mantém o bug.
- Coberto por `tests/scripts/disableRaycast.test.ts` (o objeto volta a ser
  clicável após o Stop, com raycast real do three) e pelo caso de ciclo de vida em
  `tests/scripts/ScriptHostSystem.test.ts`.
