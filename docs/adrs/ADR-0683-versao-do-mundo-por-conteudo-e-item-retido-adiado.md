# ADR-0683 — Versão da matriz de mundo pelo conteúdo, e o item de desenho retido adiado

**Data:** 2026-11-04
**Status:** aceito — passo 1 implementado (SPEC-0682); passo 2 registrado, não implementado

## Contexto

A ADR-0677 escolheu, para o laço JS por candidato da projeção nativa (`nativeProject` 3–5 ms no DDD 00), primeiro o
"bit moveu do host" e depois o item de desenho retido ((b)/(c) da ADR-0330). Esta ADR decide como o host sabe que a
matriz mudou (passo 1) e registra o desenho e o motivo de o passo 2 não entrar agora.

## Decisão 1 — a versão vem de comparar o conteúdo, não de rastrear escritas

| | como o host sabe que mudou | falha conhecida |
| --- | --- | --- |
| **rastrear escrita** (versão sobe quando o `updateAndCull` recompõe o slot, a lista `changed_`) | o caminho de sync | o JS escreve direto na fatia do mundo sem linha de sync: `updateWorldMatrix` sob pedido (SPEC-0340), nó com `matrixAutoUpdate = false` que muda só a `matrix`. A versão não sobe, o JS acha que não moveu e o bloco de objeto fica com a matriz velha. Erro de imagem, sem exceção |
| **comparar o conteúdo** (escolhida) | no fim do `cull`, por candidato, a matriz de mundo atual contra uma foto por slot; diferente, a foto é copiada e o slot ganha `++contador` global | nenhuma de correção: pega qualquer escritor, porque olha a memória que o `three` lê. Custa 16 comparações de double por candidato em C++ |

O contador é global e de 64 bits para que a versão identifique um conteúdo em qualquer slot: um objeto que muda de
slot (troca de pai, lápide reaproveitada, reconstrução do espelho) nunca encontra, por coincidência, a versão que
ele mesmo guardou de outro slot.

A foto e as versões ficam numa classe própria (`WorldVersions`, dona o `MainPassCuller`), não no `SceneMirror`.
Elas só têm sentido para quem consome a projeção, e o `scene_mirror.h` (578 linhas) teria de ser dividido na mesma
mudança (SPEC-0668) para ganhar um campo que ele não usa.

O JS só pula a comparação quando a versão é igual à que ele adotou, e adota só no laço da projeção, logo depois do
`cull`, quando a matriz que ele lê é a da foto. Toda escrita do instantâneo fora desse ponto (regravação pelo
`three`, plano de movimento na emissão) zera a versão adotada.

## Decisão 2 — o item de desenho retido fica para uma mudança própria

### Desenho (para quem for fazer)

1. **Escopo**: só o renderer nativo (ADR-0465), que já tem receita própria (`recipeFor`), bloco de objeto próprio e
   a conferência dos parâmetros por material uma vez por quadro. O RS1 (b.1 do `three`) fica de fora: a validade
   dele depende de ~45 campos e das vigias de `ReferenceNode` (qualquer propriedade que o shader lê), sem gancho.
2. **No host**, por slot do espelho: receita de cada passe (id do `draw_batch`), `count`, `first`, `instances`,
   `renderOrder`, `id` do objeto, transparente ou não, e a versão do mundo do passo 1.
3. **Elegível a retido**: opaco, `instances` fixo, sem skin, sem atributo de instância, material e geometria sem
   mudança desde a gravação, versão do mundo igual. O resto (transparente, instanciado, skinado, movido) segue
   pelo caminho de hoje, em JS.
4. **Notificação do JS** (o que muda, nunca o que ficou): por quadro, a lista de slots invalidados, montada por
   ganchos de versão de material (`material.version`, troca de textura ou de `texture.version`, parâmetros que a
   conferência por material achou diferentes) e de geometria (`attribute.version`, `index`, `drawRange`), como os
   de transform da SPEC-0322. A conferência por material já roda uma vez por quadro: um material sujo invalida
   todos os slots que o usam.
5. **Ordem**: o host ordena os retidos pela chave do `painterSortStable` (`renderOrder`, `z`, `id`) e o JS junta com
   os dinâmicos e com os itens do `three` no mesmo `keyBelow` de hoje, pedindo ao host "emita até a chave K" a cada
   item do `three`. Uma travessia de ponte por trecho contíguo, como o `_flushRun` atual.
6. **Também invalida tudo**: geração do grupo de quadro (`_frameGeneration`), formato do alvo de render, reconstrução
   do espelho, `nativeTint`, o braço `three` do instrumento de paridade (SPEC-0362).

### Por que não agora

- **Paridade sem rede**: a validade de um item retido depende de estado que o `three` muda sem avisar (cor de
  material escrita direto, textura trocada, render target recriado no resize sem subir `version`, SPEC-0585 1a).
  Cada gancho que faltar é imagem errada sem exceção. A galeria de paridade (`check-stage.sh`) cobre materiais
  parados; a troca em runtime, que é onde o retido erra, só aparece no jogo, e esta frente não roda o jogo nem a
  bancada.
- **Ordem**: a junção com os itens do `three` passaria a ter dois lados ordenando (C++ e JS) com a mesma chave em
  `double`; um empate coplanar resolvido diferente troca a ordem de desenho, e a SPEC-0425 exige ordem idêntica.
  Dá para cobrir com testes do harness, mas não para provar sem a galeria e o jogo lado a lado.
- **Custo de prova**: o que o retido economiza além do passo 1 é o resto do laço por candidato (`take`, `restMatch`,
  `_push`, `sort`). Sem medição no DDD 00 não dá para saber quanto do `nativeProject` sobra depois do passo 1, e a
  ADR-0677 já mostrou que estimativa sem A/B erra.

## Consequências

- O passo 1 tira a comparação de matriz de quem não se moveu, nos dois consumidores (RS1 e renderer nativo).
- O passo 2 começa medindo, no DDD 00, quanto do `nativeProject` sobrou com o passo 1 (A/B, poses fixas), e só
  segue se o resto do laço ainda pesar.
- Quem mexer em escrita de `matrixWorld` não precisa avisar o host: a versão vem do conteúdo.
