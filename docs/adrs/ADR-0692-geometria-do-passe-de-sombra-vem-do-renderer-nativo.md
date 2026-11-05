# 0692 - A geometria e o UV do passe de sombra vêm do renderer nativo

**Data:** 2026-11-05
**Status:** aceito (substitui a premissa da SPEC-0241/0245 de que "os GPUBuffer são do three e nada aqui é dono")

## Contexto

Na primeira volta pelo mapa com a CSM nativa (SPEC-0690), o gate recusou as duas cascatas em todas as amostras:
`geometria-ausente` com 7 a 218 casters por quadro (`static-merged-*`, `city-decor-*`, carros) e `recorte-alfa` na
vegetação. A sombra continuou sem aparecer.

A causa: o registro de geometria do passe de sombra (`CasterGeometryRegistry`) e a store de recorte alfa
(`ShadowAlphaClipSync`) só leem os GPUBuffer que o backend do three criou (`backend.get(atributo).buffer`). Com o
NativeRenderer, o passe principal desses objetos é nativo: o `NativeGeometryStore` sobe cópias próprias dos buffers,
e o three nunca sobe os dele. Assim a geometria fica pendente para sempre. O id não diverge, porque o espelho e o
registro usam o mesmo `geometryId()`.

Há ainda dois defeitos que a correção expõe:

- O `GeometryRegistry` e a `AlphaClipStore` do C++ guardam o `WGPUBuffer` cru, sem `AddRef`. Com o three, quem
  segurava o buffer era o backend dele. Com o store nativo, um buffer recriado seria coletado e o registro ficaria
  com um handle solto.
- O `NativeGeometryStore` guarda os buffers por geometria **e** conjunto de semantics. Duas variantes sobre a mesma
  geometria (profundidade `position`, principal `position,normal,uv`) refazem o estado e sobem o buffer de novo.

## Decisão

1. **Provedor de geometria do passe de sombra**, nesta ordem:
   1. o buffer do store nativo;
   2. o buffer do backend do three;
   3. upload pelo store nativo, só da `position` (`float32x3`) e do índice, reaproveitado depois pelo desenho
      principal.

   Sem NativeRenderer, o provedor é só o three, como hoje.
2. **Cache de buffer por fonte** no `NativeGeometryStore`: atributo, `InterleavedBuffer` ou índice → `{ buffer, array
   }`. Variantes de semantics sobre a mesma geometria reaproveitam o buffer. Quando a fonte troca de array, o buffer é
   refeito e um ouvinte avisa o registro, que registra de novo o mesmo id.
3. **Upload ansioso com orçamento.** A varredura da cena sobe o que falta até `SHADOW_UPLOAD_BYTES_PER_FRAME` por
   quadro. Geometria nova drenada do espelho (LOD, streaming) sobe no mesmo quadro, para não haver um quadro de luz
   plena por objeto novo.
4. **UV do recorte alfa** vem do mesmo provedor (o slot do store que carrega o `uv`, com stride e offset). A textura
   que falta é subida pelo mesmo caminho do material nativo.
5. **Posse no C++.** `GeometryRegistry::set` e a `AlphaClipStore` fazem `wgpuBufferAddRef` do que guardam, e
   `Release` ao sobrescrever, apagar e limpar.

## Alternativas

- **Forçar o three a subir os buffers** dos objetos tomados pelo nativo: dobra a VRAM da cidade (duas cópias de cada
  geometria), sem ganho nenhum.
- **Excluir do mapa** os casters sem geometria registrada, como o skinned (ADR-0691): o mapa sairia sem prédios,
  carros e vegetação, e uma vegetação sem recorte viraria silhueta cheia. A exclusão fica só para o skinned.
- **Registrar só o que o nativo já desenhou**, sem upload ansioso: o NativeRenderer só sobe o que passou no frustum da
  câmera, e a cascata enumera casters atrás e ao lado dela. Um caster fora da vista seguiria recusando a cascata.

## Consequências

- O passe de sombra deixa de depender do three para a geometria no export. Em regime normal o custo por quadro é
  zero: a fila de pendentes esvazia, e o recorte sai cedo quando a fonte não mudou.
- No aquecimento, a cascata segue recusada até a varredura subir tudo, alguns segundos com o orçamento. O perf-trace
  mostra isso.
- Geometria cuja `position` não é `float32x3` continua sem caminho e recusa a cascata, com motivo próprio
  (`posicao-nao-float32x3`) para não se confundir com `geometria-ausente`.
- O custo que de fato aparece é o desenho das cascatas, que antes não rodava. Esse é o custo de a sombra aparecer, e a
  SPEC-0690 o mede.
