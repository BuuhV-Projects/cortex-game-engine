# ADR-0290 — Refresh só de transformação para objetos que só se movem

**Data:** 2026-10-03
**Status:** aceito

## Contexto

Na fase 2 do crash-bandicoot-racer (`reference-circuit`), no host nativo, os 5
karts rivais (6 malhas cada depois do `mergeSubtree`, 7 na Lira) custam ~8 ms de
frame. Com a sonda de fases (SPEC-0227, `?renderPhases=3`) e a simulação ligada,
comparando com e sem rivais: `rpRefresh` 61 contra 17,5, `rpBind` 5–6 contra
2,5 ms, `writeBuffer` 206 contra 107 por frame.

### Causa, medida (não presumida)

O diagnóstico do probe (`D:/Codex/2026-10-02/phase-2-runtime/moving-objects`,
`-Diagnostic -Dynamic`) classifica cada `true` do `NodeManager.needsRefresh` pelo
caminho que o `NodeMaterialObserver` (three 0.184) seguiu:

| motivo | peças dos rivais por frame |
| --- | --- |
| matriz de mundo mudou (`equals` sai na 1ª checagem) | ~13 |
| primeiro objeto do monitor no `render()` (`renderId`) | ~5 |
| `hasNode` (material com nodes) | 0 |

O material dos rivais é `MeshPhysicalMaterial` sem nodes, então `hasNode` é
falso. **Validação do instrumento:** com o mundo parado (sem `-Dynamic`), a
mesma cena dá `moved = 0`, `rpRefresh` 16 e `writeBuffer` 17 **com** os rivais
na tela. Ou seja, o custo deles é de movimento, não de existir.

O `equals()` do observer testa a matriz **primeiro** e retorna na primeira
diferença: quando a peça anda, o three não sabe se material/geometria também
mudaram e faz o refresh completo. Para uma peça de rival isso é:

- `nodes.updateForRender`: ~55 update nodes, dos quais **só** o `ModelNode`
  (matriz de mundo) e o `modelNormalMatrix` dependem da transformação; 15 são
  `MaterialReferenceNode` (cor, rugosidade, metálico, mapas…);
- `bindings.updateForRender`: 16 bindings por objeto (UBO `render`, UBO
  `object`, 6 texturas, 5 samplers de sombra/env), cada um passando por
  `updateGroup` (`ChainMap`), `update()` e checagem de textura;
- `updateBefore` (sombra/CSM/PMREM, já deduplicados por `renderId`).

Perfil fino (instrumentado): ~180 µs por refresh de peça, sendo `bind` 114,
`nodesUpdate` 38, `updateBefore` 21. Os uniforms que efetivamente mudam são 2
(mat4 de mundo e mat3 normal), escritos em **2 `writeBuffer`** (uma faixa cada).

## Decisão

**Caminho rápido em JS, dentro do `three`, para o refresh "só de
transformação"** (`src/render/TransformOnlyRefresh.ts`), instalado por padrão no
host nativo.

Envolve `renderer._nodes.needsRefresh`. Quando o three faria refresh **só**
porque a matriz de mundo mudou — verificado sincronizando a matriz no dado do
observer e chamando o `needsRefresh` original, que então compara material,
geometria, morph e luzes como faria para um objeto parado —, o wrapper:

1. atualiza os update nodes de objeto, **exceto** os `MaterialReferenceNode` de
   propriedade vigiada pelo observer (`monitor.refreshUniforms`);
2. compara e escreve só os uniforms dos UBOs não compartilhados (o grupo
   `object`) que não vêm desses nodes excluídos;
3. funde as faixas alteradas e faz **um** `writeBuffer` por objeto;
4. devolve `false`: o three segue para pipeline e draw como para um objeto
   parado.

Qualquer outra mudança junto (material, geometria, morph, textura) devolve
`true` e o refresh completo acontece como hoje.

**O contrato é:** o objeto recebe exatamente o que o three faria se ele
estivesse parado, **mais** os uniforms de transformação corretos. Tudo o que o
three não reavalia para um objeto parado também não é reavaliado aqui.

### Protótipo medido antes da decisão

Host da worktree, fase 2, simulação ligada, câmera na largada, mesmo bundle e
mesmo exe, só trocando o candidato:

| | legacy | caminho rápido |
| --- | --- | --- |
| fps (nível 0, 2 rodadas) | 56,0 / 58,3 | 62,4 / 62,3 |
| p50 (nível 0) | 17,6 / 17,1 ms | 15,2 / 15,4 ms |
| `rpRefresh` (nível 3) | 61 | 24 |
| `rpBind` (nível 3) | 4,84 ms | 2,81 ms |
| `rpNodes` (nível 3, já com o caminho rápido) | 4,44 ms | 3,22 ms |
| `writeBuffer`/frame | 206 | 169 |

## Alternativas consideradas

- **(b) Pool de uniformes nativo com offset dinâmico (SPEC-0239).** Rejeitada
  agora. O que sobra de ponte depois do caminho rápido é ~1 `writeBuffer` por
  objeto móvel (~37 por frame); a ponte **inteira** do frame (`napiMs`, todas as
  chamadas nativas, draws incluídos) mede ~2,1 ms. O pool economizaria uma fração
  disso. Para chegar lá ele teria de trocar o layout do bind group e o WGSL que o
  `three` gera (offset dinâmico), que é o ponto de maior risco de paridade do
  plano todo (ADR-0237, M7). O custo medido estava em JS **antes** da ponte
  (nodes + bindings), e é lá que o caminho rápido atua.
- **(c) Marcar os rivais como `static` / bundle.** Errado por definição: eles
  se movem. Os bundles estão desligados pelo defeito da câmera congelada
  (ADR-0215).
- **Atualizar todos os nodes de objeto e comparar o UBO inteiro** (sem excluir
  nada). Mais simples, mas paga de volta os ~15 `MaterialReferenceNode` por
  peça. E a exclusão é obrigatória de qualquer forma para quem **não** for
  atualizado: os nodes de material são instâncias compartilhadas e guardam o
  valor do último material que passou por eles. Comparar um uniform sem
  atualizar a fonte escreveria a cor de outro objeto.
- **Subir a pergunta "só matriz?" para o `NodeMaterialObserver`** (patch no
  three). Rejeitado: patch em `node_modules` some no próximo `yarn install`, e o
  wrapper no `needsRefresh` faz o mesmo de fora, com um ponto só de contato.

## Consequências

- Depende de internos do three 0.184 (`_nodes`, `getMonitor`,
  `getNodeFrameForRender`, `refreshUniforms`, `updateByType`,
  `backend.updateBinding`). A instalação confere a forma e **não instala** se
  faltar algo (o render segue o caminho do three). Um bump do three tem de
  rodar o teste de paridade.
- Limitação conhecida, a mesma do three para objeto parado: propriedade de
  material **fora** de `refreshUniforms` alterada sem `needsUpdate` não é
  reavaliada no frame em que o objeto anda (antes era, por acaso, porque andar
  disparava o refresh completo). Propriedades fora da lista não são excluídas:
  continuam sendo atualizadas no caminho rápido.
- Desligável por `?transformOnlyRefresh=0` (host) e forçável por
  `?transformOnlyRefresh=1` (browser). No Studio fica desligado por padrão
  (ADR-0237: o Studio segue no caminho do three).
- A SPEC-0239 (pool nativo) continua parcial; o critério dela, `writeBuffer`
  proporcional ao que se moveu, passa a valer também no caminho JS (um
  `writeBuffer` por objeto móvel).
