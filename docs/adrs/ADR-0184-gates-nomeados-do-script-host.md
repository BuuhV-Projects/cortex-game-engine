# 0184 - Gates do ScriptHostSystem são nomeados (pausar ≠ editar)

**Data:** 2026-08-03
**Status:** aceito

## Contexto

O `ScriptHostSystem` recebia um único predicado posicional:

```ts
constructor(ctx: ScriptContext, isEditing?: () => boolean)
```

`isEditing` não é "o jogo está parado" — é **a borda Play↔Stop do editor**, e o
que ele faz é **destruir as instâncias** dos scripts (`restoreRaycasts` +
`onDestroy`, zerando `started`), para que o Play seguinte comece limpo. Isso é
deliberado e existe por um motivo concreto: sem o teardown, os efeitos colaterais
do `onStart` vazavam para o modo edição — um script que desliga o `raycast`
(lâmina, moeda, poça) deixava o objeto **inselecionável no editor**, porque o
picking também é raycast (ADR-0143).

O problema é que o parâmetro **parece** um "está pausado". Num jogo real
(teste4), o bootstrap passou ali o congelamento de gameplay:

```ts
const isPaused = () =>
  game.editorActive || game.gameplayPaused || pause.isPaused() ||
  showingResults || (intro?.active ?? false) || (outro?.active ?? false)

new ScriptHostSystem(ctx, isPaused)   // ← a cutscene entra neste predicado
```

Resultado: **toda cutscene de abertura derrubava os scripts da fase** e, ao
terminar, todos eram reinstanciados com `onStart` novo. Nas fases com marcador de
ponto de partida, esse segundo `onStart` teleportava o jogador — desfazendo, no
frame seguinte, a animação de saída que acabara de posicioná-lo. O sintoma
("o player não sai do portal") aparecia a três camadas de distância da causa, e
custou uma sessão inteira de investigação até a instrumentação mostrar duas
instâncias do mesmo script no mesmo objeto.

O modo de falha é o que interessa aqui: **nada falha, nada loga**. O tipo
`() => boolean` aceita qualquer predicado, e os dois conceitos são plausíveis
para quem lê a chamada.

O template de projeto novo tinha a mesma confusão em menor grau
(`() => game.editorActive || game.gameplayPaused`): a pausa da IDE reiniciava os
scripts do projeto.

## Decisão

Os gates passam a ser **nomeados**, num objeto:

```ts
export interface ScriptHostGates {
  /** Modo EDIÇÃO (Play↔Stop). DESTRÓI as instâncias — ADR-0143. */
  isEditing?: () => boolean;
  /** Congelamento de gameplay (cutscene, menu, resultados). Só SUSPENDE. */
  isPaused?: () => boolean;
}

constructor(ctx: ScriptContext, gates?: ScriptHostGates)
```

`isPaused` sai cedo do `update` **depois** de `wasPlaying = true`: as instâncias e
o `started` de cada slot ficam intactos, e o jogo retoma exatamente de onde
parou.

### Por que não manter compatibilidade com a forma antiga

Aceitar `(() => boolean) | ScriptHostGates` não quebraria nada — e por isso mesmo
foi descartado: o caminho que produz o bug continuaria disponível, com a mesma
aparência inocente. O ganho desta decisão é justamente **transformar um erro
silencioso em erro de tipo**.

O custo é baixo e conhecido: dentro do repositório há **um** consumidor
(`templates/new-project/main.ts`), já atualizado. Os jogos que consomem a engine
vendorizada não quebram enquanto não re-vendorizarem; quando o fizerem, o
TypeScript aponta a linha exata — falha alta, no lugar certo, em vez de um
jogador teleportado no meio de uma cutscene.

### Por que não resolver com `pauseWhen`

`pauseWhen` (do `System`) faz o `World` pular o `update`, o que preserva as
instâncias e resolve o sintoma — foi a correção imediata aplicada no jogo. Mas
ele **não pode incluir o editor**: o host precisa continuar rodando no modo
edição para enxergar a borda Play→Stop e executar o teardown. Ou seja, a solução
correta exige dois predicados de qualquer forma; melhor que os dois sejam
explícitos na API do que uma convenção sutil que cada jogo redescobre por conta
própria — e o TSDoc já pedia para não usar `pauseWhen` aqui.

## Consequências

- Passar o predicado errado vira **erro de compilação**, não bug de runtime.
- `ScriptHostGates` é exportado; quem só quer o comportamento antigo escreve
  `{ isEditing }` e nada muda.
- Jogos vendorizados precisam ajustar a chamada ao re-vendorizar (uma linha).
- A distinção fica documentada no ponto de uso — o TSDoc do `isEditing` diz o que
  ele destrói, e o do `isPaused` diz o que ele preserva.
