# SPEC-0331 — Caminho rápido em JS para os render objects que reaproveitam (etapa (0) do ADR-0330)

**Data:** 2026-10-09
**Status:** rejeitado antes de implementar (medição abaixo) — nenhum código entra

## Contexto

A etapa (0) do ADR-0330 propunha um caminho rápido **em JS** para os ~89% dos
render objects do DDD 61 que reaproveitam o quadro anterior (`rpRefresh` 15 ×
`rpReuse` 134), com ganho estimado de 1,5–2,5 ms. A condição para entrar: o
atalho **não pode mudar semântica** — pular uma checagem que o `three` faz para
detectar mudança é o caminho para imagem errada em silêncio (UV scroll,
emissivo animado, troca de `transparent`/`side` sem `needsUpdate`).

Antes de escrever o atalho, a pergunta era **onde** está o tempo de um objeto
reaproveitado dentro de `objGet`, `pipe` e `nodes`.

## Medição

Sonda temporária sobre a da SPEC-0227 (nível 3 + sub-baldes, patch em
`.cortex/r3-f1/tmp-probe0.patch`, não versionado), export release do DDD 61
(engine `0e3ea11c` + ADR-0330), `?spawn=setorO`, 135 amostras, ~150 draws.

A máquina estava carregada nessa rodada (fps 22,7); vale a **proporção**, e o
custo da sonda pesa nos baldes de muitas chamadas pequenas (~0,5–1 µs por
embrulho).

| sub-balde | ms/quadro | chamadas | o que é | pulável sem mudar semântica? |
| --- | --- | --- | --- | --- |
| `ChainMap.get` | 0,53 | 383 | busca do render object (4 `WeakMap`) e caches de grupo | só a parte de `_objects.get` (~150 chamadas) |
| `getDynamicCacheKey` | 0,68 | 151 | chave de ambiente por objeto (`needsUpdate`) | a parte de ambiente, memoizada por chamada de render |
| utils de contexto (5) | 0,48 | 755 | sample count, formato, color space, profundidade, topologia | 4 de 5, memoizadas por contexto |
| `needsRenderUpdate` (próprio) | 0,79 | 151 | compara ~30 campos de estado do material | **não** — é a detecção de `transparent`/`side`/blend sem `needsUpdate` |
| `equals` do observer | 0,99 | 136 | uniforms vigiados, atributos, `drawRange` | **não** — é a detecção de uniform mudado |
| `_bindings._update` | 0,77 | 70 | grupos compartilhados por objeto | já curto-circuita por versão |
| `NodeFrame.updateNode` | 1,59 | 1.331 | nós de objeto (inclui os que dependem da câmera) | **não** em geral — `onObjectUpdate` é callback arbitrário |

## Decisão

**A etapa (0) não é implementada.** O que é memoizável sem mudar semântica
(utils de contexto, parte de ambiente da chave dinâmica, a busca do
`ChainMap` em `_objects.get`) soma **~0,5 ms reais** no melhor caso (descontado
o custo da sonda) — abaixo da deriva da máquina, que tira a mesma build de
41,8 para 48,5 fps em horários diferentes, e abaixo dos 1,5–2,5 ms que
justificariam mexer em internos do `three` (risco de bump).

O resto do custo de um objeto reaproveitado é **verificação**: o `three` não
tem dirty flag de material, então descobrir que "nada mudou" exige comparar.
Pular essas comparações é exatamente o modo de falha que o ADR-0330 proíbe.

Quem tira esse custo de forma segura é a etapa **(b)**: com a `MaterialDesc`
descrita **por versão** e os uniformes por objeto escritos pelo C++ a partir do
espelho (que sabe quem se mexeu), a comparação deixa de existir — não é pulada,
é substituída por um dado que já diz o que mudou.

## Consequências

- Nenhum código; o ADR-0330 segue com (a) → (b) → (c).
- A sonda dos sub-baldes fica como patch em `.cortex/r3-f1/` (não versionada):
  se um bump do `three` trouxer dirty flag de material, a pergunta reabre com
  ela.
