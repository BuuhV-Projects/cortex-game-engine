# SPEC-0166 - Modelos do Monaco abaixo do limite de listeners do Studio

**Data:** 2026-07-28
**Status:** aceito

## Contexto

O console do Studio passou a cuspir, a cada abertura de projeto:

```
[001] potential listener LEAK detected, having 200 listeners already.
  at LanguageSelection._event [as onDidChange]
  at _a90._createModelData
```

Diagnóstico: **não é vazamento do jogo nem do runtime** — é o Monaco. Cada
`monaco.editor.createModel()` instancia uma `LanguageSelection` que assina um
emitter global de linguagem; o VS Code alerta quando um emitter passa de **200
listeners**, presumindo listeners esquecidos.

Quantos modelos o Studio cria hoje (medido com o teste4 aberto):

| Origem | Modelos |
| --- | --- |
| `preloadProjectFiles` — 1 por arquivo-fonte do projeto (Ctrl+click sem abrir) | 96 |
| `loadEngineTypes` — 1 por `.d.ts` navegável do engine (`VENDOR_TYPE_MODULES`) | ~114 |
| **total** | **210** |

Ou seja, o Studio vivia **na borda** dos 200; os 6 módulos de `src/input/` +
`gamePlatform` (ADR-0164) foram a gota. O comentário do próprio
`loadEngineTypes` já registrava o risco ("para @types/three (~946 arquivos)
cair aqui estoura o limite de 200 listeners do Monaco").

Além do alerta — que é diagnóstico, não falha — havia **um vazamento real**: ao
fechar a última aba, `closeTab` criava um model `plaintext` NOVO a cada vez
(`monaco.editor.createModel('', 'plaintext')`), sem reuso e sem `dispose`. Abrir
e fechar abas repetidamente empilhava modelos órfãos pela sessão inteira.

## Decisão

1. **Model vazio único.** O "editor sem aba" passa a reusar um único model
   (criado sob demanda e guardado no campo `emptyModel`), em vez de criar um por
   fechamento. Corrige o vazamento real.

2. **O preload do projeto pula arquivos de teste.** `shouldPreloadProjectFile`
   (módulo próprio, puro e testável) exclui caminhos com segmento `tests`,
   `test`, `__tests__`, `spec` ou `__mocks__`, e arquivos `*.test.*` /
   `*.spec.*`. Medido no teste4: **96 → 80** arquivos, total de **210 → 194**.

3. **Aviso de proximidade.** Passando de `MODEL_WARN_THRESHOLD` (180) modelos
   vivos, o Studio loga UMA vez quantos existem e de onde vieram. Quando o
   projeto crescer e o alerta do Monaco voltar, a causa fica explícita em vez de
   virar caça ao fantasma de novo.

## Consequências

- Fica abaixo do limite hoje, mas com **folga estreita: 6 modelos** (194 de
  200). ~6 arquivos novos no jogo, ou mais um punhado de módulos públicos no
  engine, e o alerta volta. Isto é **contenção, não cura** — daí o aviso do
  item 3, que passa a dizer de onde vieram os modelos.
- **Cura definitiva (pendente):** parar de pré-criar modelos e criar sob demanda,
  passando um `ICodeEditorService` próprio no `monaco.editor.create(el, opts,
  overrides)` — o "ir para a definição" chamaria `openCodeEditor`, o Studio
  abriria a aba e criaria o model naquele instante. Zera as duas fontes (projeto
  e engine) de uma vez. Ficou fora deste escopo por mexer na navegação do editor
  inteiro; vale quando o alerta voltar.
- Perde-se Ctrl+click **para dentro de um arquivo de teste ainda não aberto**.
  Abrindo o teste (clique na árvore), o model é criado e a navegação volta ao
  normal. Trade-off aceito: teste é destino raro de "ir para a definição".
- A solução definitiva (criar model sob demanda via editor service próprio, sem
  pré-criar nada) fica **fora deste escopo** — exigiria interceptar a navegação
  do Monaco standalone, com risco alto perto do ganho.
- O alerta do Monaco não causava falha: a criação é idempotente
  (`getModel(uri)` antes de criar), então a contagem satura no total de
  arquivos. O que era bug de verdade é o item 1.
