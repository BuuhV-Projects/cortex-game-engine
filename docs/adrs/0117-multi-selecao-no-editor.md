# 0117 - Multi-seleção no editor (Ctrl+click) com aplicação em lote no Inspector

**Data:** 2026-07-17
**Status:** aceito

## Contexto

A seleção do editor era rigorosamente single-object de ponta a ponta:
`EditorSelection.current` guardava um único `Object3D`, o outliner/viewport/IDE
mandavam um id por clique e o Inspector descrevia e aplicava tudo num objeto só.
Aplicar a mesma propriedade a vários objetos (o caso real: shader **unlit** em
dezenas de props de uma fase) exigia selecionar e editar **um por um** — trabalhoso
e propenso a inconsistência.

A boa notícia estrutural: as autorias (`MaterialAuthoring`, `ShadowAuthoring`,
`PhysicsAuthoring`…) já persistem **por nó** (`overlay.data[key][nome]`), então
aplicar a N objetos é só iterar N nomes — nenhuma autoria precisou mudar.

## Decisão

Multi-seleção **aditiva por Ctrl/Cmd+click** (alterna o objeto no conjunto), nos
três pontos de entrada: viewport (`ObjectEditSystem`), outliner in-canvas
(`EditorModelDom`) e hierarquia da IDE (`EditorPanels` → mensagem `select` ganhou
`additive: boolean` na ponte).

1. **`EditorSelection`** vira a fonte do conjunto: `items: readonly Object3D[]`
   (ordem de seleção; o **último é o primário**) + `current` continua sendo o
   primário — consumidores antigos seguem corretos sem mudança.
   `requestSelect(obj, { additive })` e `setCurrent(obj, items)` estendidos de
   forma retrocompatível; `isSelected(obj)` de conveniência.
2. **`ObjectEditSystem`** é o dono do conjunto: Ctrl+click alterna; clique normal
   troca; Ctrl+click no vazio **não** limpa (errar o clique não pode jogar fora um
   conjunto montado à mão). O **gizmo fica no primário**; os demais ganham uma
   `BoxHelper` azul (`editorInternal`, fora do outliner/picking). Arrastar o gizmo
   de **mover** carrega o conjunto com o mesmo delta (rotação/escala ficam só no
   primário — girar grupo em volta de pivô é feature futura). `Delete` remove o
   conjunto inteiro; cada objeto movido/removido gera seu próprio commit de undo.
3. **`describeInspector(obj, ctx, registry, selectedItems?)`**: com 2+ selecionados
   mostra os valores do **primário**, título ganha `(+N)` e uma nota explica o
   escopo. As seções **Sombra, Material (matte), Shader e Física (tipo de corpo)**
   aplicam a **todos** os selecionados válidos (Shader só em quem tem malha;
   Física só em nós de cena nomeados). As demais seções (transform, scripts,
   animação, terreno…) seguem editando só o primário.
   - No Shader, cada alvo **preserva os próprios parâmetros** quando já tem o
     mesmo preset (mudar a cor de 5 unlit não apaga o contorno de cada um);
     alvo com preset diferente é convertido herdando a config derivada do primário.
   - Os campos que **não** aplicam ao conjunto aparecem **desativados e
     acinzentados** (`InspectorField.disabled` — opacidade 0.4 + sem interação nos
     dois renderizadores), em vez de editar silenciosamente só o primário: o que
     está ativo é exatamente o que vale pra todos. Notas seguem legíveis. O
     `disabled` entra na chave de estrutura dos renderizadores (multi↔single
     precisa de rebuild pra re-habilitar).
4. **`describeOutliner(..., selectedItems?)`** marca todo o conjunto (não só o
   primário) nos dois renderizadores.

## Consequências

- O caso motivador vira 1 clique: Ctrl+click nos objetos → Shader → Unlit.
- As autorias continuam intocadas — o lote é um loop por cima das `*Api` por-nó;
  cada `set` persiste no overlay como sempre (overlay > código, ADR-0058).
- Edições de propriedade em lote seguem **sem undo** (paridade com o
  comportamento single-object atual — as `*Api` nunca passaram pelo
  CommandStack). Transform/delete em lote têm undo por objeto (N comandos, não
  um composto) — um `CompositeCommand` fica como melhoria futura.
- Rotação/escala de grupo em volta de um pivô comum não existem ainda; o gizmo
  de rotate/scale afeta só o primário.
- A ponte editor↔IDE ganhou um campo novo (`additive`) — IDE antiga com engine
  novo continua funcionando (flag ausente = seleção normal).
