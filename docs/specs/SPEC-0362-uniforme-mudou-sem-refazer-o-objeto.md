# SPEC-0362 — Uniforme mudou sem refazer o objeto (etapa (c) do ADR-0330, parte 1)

**Data:** 2026-10-22
**Status:** **rejeitada por medição** (A/B v1 e v2 sem ganho; v2 com imagem errada) — o mecanismo foi revertido; fica o instrumento de paridade `?parityFreeze` (`src/render/MainPassArm.ts`, teste em `tests/render/MainPassArm.test.ts`)

## Contexto

A remedição da SPEC-0333 no jogo atual (DDD 61 `e2be01c`) mostrou ~43
desenhos por quadro voltando ao caminho completo do `three` (~95 µs cada,
~4 ms no setorO). Em quase todos, a única coisa que mudou é **valor de
uniforme**:

- **névoa** (`fog.color`, ~17/quadro em média): o jogo a ajusta pela hora. O
  `FogNode` lê a névoa por `ReferenceNode` de update `OBJECT`, então o valor
  vive no UBO de CADA objeto, e a mudança derruba o instantâneo de todos;
- **material com nó** (`hasNode`, ~25/quadro): o `NodeMaterialObserver` liga o
  `hasNode` quando o material tem QUALQUER propriedade de nó (`colorNode`,
  `positionNode`…) e então refaz o objeto em todo quadro. O desenho direto
  (b.1) os recusava inteiros, porque um `uniform(v)` mudado pelo jogo
  (`u.value = x`) não passa por gancho nenhum.

O "objeto que só se moveu" da b.1 já resolve um caso igual: aplica um plano de
nós de objeto + escrita do UBO (ADR-0290) e desenha direto. Falta o mesmo para
"um uniforme mudou".

## Comportamento

### Plano de uniformes (`buildUniformPlan`, `TransformOnlyRefresh.ts`)

Como o plano de transformação, mas **sem pular** as referências de material:
todos os nós de update `OBJECT` do render object e todos os uniformes dos UBOs
não compartilhados. Aplicado com o mesmo `applyPlan`: `frame.updateNode` em
cada nó e `updateByType` em cada uniforme; só o UBO que mudou vira
`writeBuffer`. É o que o `_bindings.updateForRender` do `three` faria nesses
grupos, sem a verificação genérica em volta.

### Quando o desenho direto usa o plano de uniformes

1. **Valor vigiado mudou.** A conferência da b.1 (`restMatch`) passa a ter duas
   partes: a **estrutural** (sombra, instanciado, geometria, campos de
   pipeline) e a dos **vigias**. Se a estrutural bate e só os vigias divergem
   — e nenhum vigia de textura mudou (textura trocada mexe no bind group, não
   em UBO) — o desenho direto aplica o plano de uniformes, regrava o
   instantâneo no lugar e desenha. Qualquer outra divergência segue no `three`
   (que regrava), como hoje.
2. **Material com nó (`hasNode`).** Passa a ser elegível. Em todo desenho
   direto os UBOs não compartilhados do objeto são **conferidos**
   (`updateByType`, só escreve o que mudou): é o que pega um `uniform(v)`
   mudado pelo jogo. Os nós só são refeitos quando um vigia mudou (plano
   completo) ou o objeto se moveu (plano de transformação). Continua recusado se algum nó de objeto não for conferível
   (`watchersFor`), se houver `updateBefore`/`updateAfter` de objeto, buffer
   não-UBO fora o de instâncias (`buildRenderIdPlan`) ou skin
   (`hasAnimation`).

Os nós de render/quadro e os grupos compartilhados continuam como na b.1 (uma
vez por estado de shader por chamada de `render()`).

### Interruptor

`?uniformRefresh=0|1` (padrão ligado no host; `?nativeMainPass=0` e
`?cleanDraw=0` também desligam, porque desligam o desenho direto inteiro).

### O que continua no `three` (recusa, não aproximação)

Textura trocada ou com versão nova, campos de pipeline, geometria, `count` de
instâncias, `instanceMatrix` mudando (~7/quadro; fica para uma parte 2,
porque o upload é de atributo ou de buffer de armazenamento, não de UBO),
`SkinnedMesh`, `BatchedMesh`, morph, `updateBefore`/`updateAfter` de objeto.

## Verificação

- **Paridade por imagem na mesma execução (`?parityFreeze=<s>`):** o DDD 61 não
  tem `?bench&hold` (NPCs, trânsito e trens tornam a captura entre execuções
  não determinística). Depois de `<s>` segundos de jogo, o `Game` para de
  chamar o `_update` (mundo, `onUpdate`, UI) e continua só desenhando, e o
  DESENHO do passe principal alterna a cada quadro entre o nativo (desenho
  direto + lote em C++) e o do `three` (`mainPassArm`, `MainPassArm.ts`). A
  projeção fica nativa nos dois braços (já tem paridade pela SPEC-0332). A captura da SPEC-0240
  (`CORTEX_RENDER_PARITY_CAPTURE`) grava quadros consecutivos: pares
  nativo×`three` medem a paridade; pares do mesmo caminho (quadros N e N+2)
  medem o ruído (nós de tempo, água). Sem HUD de métricas na rodada.
- Vitest: plano de uniformes (inclui as referências de material e todos os
  uniformes), divergência só de vigia → caminho barato, vigia de textura →
  `three`, `hasNode` elegível com o plano em todo desenho.
- A/B no export (kit SPEC-0382, intercalado), setorO, centro, comercial,
  Águas Claras e dirigindo.

## Riscos

| risco | cobertura |
| --- | --- |
| nó de material lê estado de JS sem gancho (`uniform(v)`) | o plano de uniformes roda em TODO desenho de material `hasNode` (é o `updateByType` do próprio `three`); paridade por imagem |
| uniforme num grupo compartilhado mudado por JS | já era o comportamento da b.1: grupos compartilhados são atualizados uma vez por chamada |
| textura trocada por nó | vigia de textura divergente → `three` |

## Achado: trocar a projeção a cada quadro trava o host

Na primeira versão do instrumento a projeção também alternava (nativa ×
`three`). Com o jogo congelado, o host trava em poucos quadros: o JS para no
meio de um desenho do `three` (sem exceção, sem `error_log`), e o laço do host
também (o `perf-log` para). Bissecção, setorO, 130–170 s por rodada:

| alterna | resultado |
| --- | --- |
| projeção e desenho | trava |
| só a projeção | trava (2 de 3 rodadas) |
| só o desenho | ok |
| nada (só congela) | ok |
| `?nativeProjection=0` fixo, sem congelar | ok |

A causa não foi isolada. Importa fora do instrumento: a projeção nativa já
devolve o quadro ao `three` quando recusa (LOD, `ClippingGroup`…), e uma cena
que entre e saia dessa recusa troca de projeção repetidamente. No DDD 61 hoje
são 0 recusas, então não aparece. Fica como pendência da etapa (a)
(SPEC-0332).

## A/B v1 — plano completo em todo desenho de material com nó: neutro

Export release do DDD 61 `e2be01c`, engine `7fb9421e` + esta spec, mesma build
com `?uniformRefresh=0` (A) × ligado (B), kit SPEC-0382 intercalado, 2 réplicas
× 170 s. Render (cpuAvg, ms):

| ponto | A | B | Δ | quadro med Δ | draws A/B |
| --- | --- | --- | --- | --- | --- |
| setorO | 14,37 | 13,81 | −0,56 | −1,25 | 156 / 154,5 |
| centro | 13,88 | 14,10 | +0,22 | −0,10 | 158 / 158,5 |
| comercial | 14,83 | 15,03 | +0,20 | −0,65 | 154,5 / 154 |
| Águas Claras | 15,43 | 16,57 | +1,14 | ≈ +1,2 | 177,5 / 187,5 |

O mecanismo funcionou (setorO: caminho do `three` de ~27% para ~7% dos draws,
inelegíveis 691 → 5) e a paridade por imagem deu **`maxChannelDiff` 0** nos
pares nativo×`three` e de controle. Mas o ganho não apareceu: os ~30
render objects de material com nó aplicavam o plano COMPLETO (todos os
`updateNode`) em todo quadro — quase o mesmo trabalho do refresh do `three` —
e o `gc young` subiu ~10 ms/s. Lição: o custo por draw do caminho do `three`
medido pela sonda (~95 µs) estava inflado; tirar um objeto dele vale bem menos.
Corrigido para conferir só os UBOs quando nada mudou (acima) e com laços
indexados no `applyPlan` (no Hermes cada `for…of` aloca um iterador).

## A/B v2 — só os UBOs para material com nó parado: imagem errada e sem ganho

Mesmo método, engine `34210c53` + esta spec, 2 réplicas × 170 s:

| ponto | render A | render B | Δ | quadro med Δ | `gc young` Δ |
| --- | --- | --- | --- | --- | --- |
| setorO | 14,00 | 14,36 | +0,36 | −0,65 | +10,4 ms/s |
| centro | 13,75 | 13,80 | +0,04 | +0,60 | +9,3 ms/s |
| comercial | 14,93 | 14,96 | +0,03 | −0,30 | +12,9 ms/s |
| Águas Claras | 16,64 | 17,03 | +0,39 | +2,20 | +12,4 ms/s |

**A paridade pegou o defeito:** `maxChannelDiff` **184 em 7,2% dos pixels**
(nativo×`three`), controles em 0. Os nós de referência do `three` são
COMPARTILHADOS e guardam o valor do último objeto que passou por eles;
conferir o UBO sem refazê-los escreve o valor de outro objeto — a mesma
armadilha registrada no `buildTransformOnlyPlan`. A v1 (plano completo) tinha
paridade 0, mas também não ganhava.

## Veredito

Rejeitada, como a SPEC-0331: tirar ~35 desenhos/quadro do caminho do `three`
(de ~27% para ~7% dos draws no setorO) não paga, porque o caminho alternativo
correto (refazer os nós de objeto + conferir os UBOs) custa quase o mesmo, e o
`gc young` sobe 9–13 ms/s. O custo por draw do caminho do `three` que a sonda
de fases mostrava (~95 µs) era inflado — só o A/B sem sonda decide.

O que fica: o instrumento de paridade na mesma execução, que valeu nesta spec
(pegou imagem errada que a captura entre execuções não pegaria no DDD 61), e o
achado da troca de projeção (abaixo, em "Achado").
