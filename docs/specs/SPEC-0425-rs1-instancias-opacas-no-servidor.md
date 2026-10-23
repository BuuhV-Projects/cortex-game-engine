# SPEC-0425 — RS1: instâncias opacas simples no RenderingServer do export

**Data:** 2026-10-23
**Status:** em implementação — RS1a e RS1b atrás de interruptor, padrão
desligado até o A/B de aceite (com autopiloto) passar.

Marco RS1 do ADR-0404. Studio intocado (sem ponte, nada instala).

## Contexto

O ADR-0404 mediu o teto de tirar o laço por objeto do `three` do passe
principal do DDD 61 (`e2be01c`). Para o recorte do RS1 — opaco, material sem
nó, não skinado (modo 3 do braço), agora com **2 réplicas intercaladas**:

| ponto | render controle | modo 3 | Δ |
| --- | --- | --- | --- |
| Setor O | 13,68 | 6,66 | **−7,0** |
| Centro | 13,41 | 6,85 | **−6,6** |
| Comercial | 14,98 | 10,47 | **−4,5** |
| Águas Claras | 16,41 | 8,31 | **−8,1** |

O Comercial fica no limite do critério do ADR-0404 (−4 ms) depois do residual
(~0,5 ms): o RS1 só passa ali se levar **também** os objetos que se movem e a
mudança de névoa — exatamente o que a b.3 deixou de fora.

Dois achados que definem o desenho:

1. **A névoa suja todo objeto que a usa.** No `three` 0.184 os uniformes da
   névoa já ficam no grupo COMPARTILHADO de render (`reference(...)
   .setGroup(renderGroup)` no `Nodes.updateFog`), mas o `ReferenceNode` tem
   update `OBJECT`: o valor só é copiado do `scene.fog` para o uniforme no
   update de um objeto. A b.1 por isso trata a névoa como vigia de CADA objeto,
   e o DDD 61 troca a cor da névoa em degraus (8 bits por canal, `applySky` por
   quadro): no quadro do degrau, todo objeto com névoa diverge e volta inteiro ao
   `three` (~95 µs cada; média ~17/quadro na SPEC-0333, em rajada).
2. **A conferência por instantâneo é barata quando sai cedo** (A/B modo 3 × 4,
   Setor O e Comercial, 2 réplicas: −0,01 e −1,44 ms, ruído). O instrumento só
   mediu saídas antecipadas (no braço nada é regravado, então quase tudo
   aparecia "movido"/"sujo"); a conferência cheia segue estimada pela b.1 em
   ~3–5 µs/objeto (≤ 0,6 ms para ~120 instâncias).

## Escolha: conferência por instantâneo, não ganchos

| | ganchos de escrita | conferência por instantâneo (b.1) |
| --- | --- | --- |
| JS por instância limpa e por quadro | 0 | ~3–5 µs (≤ 0,6 ms/quadro no DDD 61) |
| superfície | toda propriedade do `refreshUniforms` + `Color`/`Vector2` vigiados + texturas (offset/repeat/rotation) + geometria + `material.version` | uma função (`restMatch`), já testada e em produção desde a b.1 |
| modo de falha | gancho faltando = uniforme velho na tela, sem erro | divergência = volta ao `three` (mais lento, imagem certa) |

**Escolhida a conferência.** O custo cabe com folga no teto (~5–7 ms), e o modo
de falha é desempenho, não imagem. Ganchos ficam como otimização futura SE a
conferência aparecer como gargalo depois do RS1 (pendência no PRD-0009).

## RS1a — névoa por render, não por objeto

- `watchersFor` (b.1): `ReferenceNode` de update `OBJECT` cujo grupo é
  **compartilhado** (`node.group.shared`) deixa de ser vigia e vai para a lista
  `sharedRefs` da gravação.
- No desenho direto, no bloco que já roda **uma vez por `NodeBuilderState` por
  chamada de `render()`** (`updateBefore` + nós de render), os `sharedRefs` são
  atualizados (`frame.updateNode`) ANTES dos grupos compartilhados
  (`bindings._update`) — assim o UBO de render recebe o valor novo uma vez.
- Efeito: troca de névoa não derruba mais nenhum objeto para o `three`.
- Interruptor: `?sharedRefs=0|1` (padrão ligado no host; `?cleanDraw=0` e
  `?nativeMainPass=0` também desligam).

## RS1b — instâncias limpas fora da RenderList

### Elegibilidade (por objeto; o resto segue a b.1/`three`, nunca aproximado)

Malha comum (`MainPassKind` de culling nativo: não instanciada, não skinada,
não sprite), material único, gravação da b.1 válida no contexto do passe
principal com `passId` nulo, receita viva no lote da b.2, e:
`transparent` falso, sem transmissão, `renderOrder` 0, `depthTest`/`depthWrite`/
`colorWrite` ligados, sem `polygonOffset`, sem `onBeforeRender`/`onAfterRender`
próprios.

### Fluxo por quadro (chamada de topo da cena espelhada, `?renderServer=1`)

1. **Projeção** (`NativeMainProjection`): para cada candidato elegível, em vez
   do `renderList.push`, o `RenderServer` confere a gravação (`matrixMatch` +
   `restMatch`, mais luzes/clipping/geometria/material da chamada anterior).
   - limpo e parado → comando na lista nativa;
   - só a matriz mudou → plano de transformação (ADR-0290, um `writeBuffer`
     por UBO) e comando na lista nativa;
   - qualquer outra divergência → `renderList.push` (o `three` desenha e a b.1
     regrava; volta ao servidor no quadro seguinte).
   A oferta **não** chama `updateBefore`, `getCacheKey` nem nada que renderize
   (armadilhas 1 e 6 do ADR-0363).
2. **Dentro do passe** (`beginRender` do contexto dono da lista): uma vez por
   `NodeBuilderState` presente na lista, `updateBefore` + nós de render +
   `sharedRefs` + grupos compartilhados (como a b.1); a chave de ambiente da
   chamada é conferida aqui — se mudou, a lista inteira é descartada e os
   objetos dela vão para a RenderList do `three` nesta chamada (raro).
3. **Emissão em bloco**, uma travessia (`__cortexDrawBatch.flush`): antes do
   primeiro item opaco do `three` com `renderOrder` ≥ 0 que não seja o fundo
   (fundo e `renderOrder` < 0 primeiro, como no sort do `three`), ou no
   `finishRender` se não houver nenhum. Opacos com teste e escrita de
   profundidade dão a mesma imagem em qualquer ordem, salvo empate exato — por
   isso a recusa de `polygonOffset`/`renderOrder`/profundidade desligada.
4. Depois do `flush`, os caches de estado do encoder do `three` são invalidados
   (`currentSets`, `_activePipelines`), como na b.2; `info` recebe os draws.

A lista tem dono (o contexto que a montou); render aninhado não oferece nem
emite (armadilhas 2–5 do ADR-0363). Objeto que vai para o servidor não recebe o
carimbo `renderId` do monitor: quando volta ao `three`, ele é refeito — correto.

### Interruptores

`?renderServer=0|1` (**padrão desligado** até o aceite); `?nativeMainPass=0`,
`?cleanDraw=0` e `?drawBatch=0` também desligam (o RS1b depende da b.1/b.2).

## Critério de aceite (decide o merge do RS1b como padrão)

- **A/B com o autopiloto** (SPEC-0414, regra do usuário de 2026-10-23: rodada
  parada não decide performance), kit SPEC-0382, intercalado, 2 réplicas, nos
  4 pontos: render **−4 ms ou mais no Setor O e no Comercial**, sem regressão
  nos outros; olhar **p95, p99 e fração de quadros acima de 33 ms**, não só a
  mediana.
- Paridade: `?parityFreeze` com servidor × `three` no nível do controle
  (`maxChannelDiff` dos pares de controle).
- Testes verdes (Vitest; nenhum C++ novo previsto no RS1).

O RS1a pode ser medido antes, sozinho (mesma regra do autopiloto para o aceite).

## Testes

- `watchersFor`: referência de grupo compartilhado vira `sharedRefs`, não vigia;
  referência de material/objeto continua vigia.
- Desenho direto: `sharedRefs` atualizados uma vez por estado por chamada e antes
  dos grupos compartilhados; troca de cor da névoa não derruba para o `three`.
- RS1b: classificação de elegibilidade (cada recusa), oferta limpa/movida/suja,
  descarte da lista com ambiente mudado, emissão antes do 1º opaco com
  `renderOrder` ≥ 0 e depois do fundo, render aninhado não emite.

## Riscos

| risco | cobertura |
| --- | --- |
| `sharedRefs` não atualizado numa chamada → névoa velha | o bloco roda por estado por chamada, como os nós de render que já funcionam; teste |
| ordem de opacos sem escrita de profundidade do `three` (`depthWrite` falso, `renderOrder` 0) contra os nativos | contador desses itens por quadro + `?parityFreeze` |
| bump do `three` muda grupos/`ReferenceNode` | instalação recusa se a forma não bater (como a b.1) |
