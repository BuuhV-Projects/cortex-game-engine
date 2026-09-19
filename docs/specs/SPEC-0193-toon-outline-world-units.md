# SPEC-0193 — Toon: contorno pela normal e preservação dos materiais

## Contexto

O contorno escalava a geometria em torno do pivô, embora `outline` seja
documentado em unidades de mundo. Assets com geometria deslocada perdiam o
alinhamento. O swap toon também descartava emissão, mapas de detalhe e lado.

## Comportamento

- Casca com `MeshBasicNodeMaterial` extrudida por `positionNode` TSL ao longo da
  normal local; compensar o comprimento da normal transformada em mundo.
  Não alterar geometria, escala, bounds CPU nem assentamento por `place`.
- Reutilizar grupos de material, morph targets e skeleton; não desenhar cascas
  opacas atrás de materiais translúcidos. Respeitar recorte por alpha e névoa.
- Casca não participa de picking ou de `addTrimeshFromObject`.
- Preservar nome, emissão, alpha, side, depth, AO, normal e bump no material toon.
- Reaplicar preset libera material e rampa antigos, sem liberar texturas do GLB.
- Guardar cópia do preset em `userData.cortexMaterialConfig` para descendentes
  criados depois do carregamento (ex.: rodas de garagem); standard limpa o preset.
- API JSON existente e precedência do overlay continuam válidas. A correção
  torna efetiva a unidade de mundo já documentada; projetos que compensavam o
  antigo fator de escala podem precisar reajustar a espessura autorada.

## Validação

Regressões de materiais, transparência, descarte de recursos, bounds e colisores;
compilação da engine; re-vendoring de runtime, editor e declarações. Não gera
build do jogo consumidor. A checagem headless não valida a aparência GPU final.
