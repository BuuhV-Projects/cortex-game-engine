# 0186 - Seletor de fase no viewport: o JOGO declara, o Studio navega

**Data:** 2026-08-04
**Status:** aceito

## Contexto

Para editar uma fase no Studio é preciso **jogar até ela**: dar Play, passar pelo
título, entrar na warp room, folhear até o mundo certo e atravessar o portal. Num
jogo com 21 fases, isso é o caminho para *toda* sessão de edição — e piora quanto
mais longe a fase está do começo.

O jogo já sabe pular esse caminho: `?level=<id>` na URL carrega a fase direto,
sem menu nem hub. É como o harness de screenshot sempre navegou. Só que dentro do
Studio ninguém digita URL — o jogo roda num `<iframe>` cujo `src` é montado pelo
próprio Studio (`Preview.withDebug`, que já injeta `cortexDebug`).

Ou seja: o mecanismo existe dos dois lados e falta a ponte entre eles.

**O que o Studio não pode saber sozinho:** quais fases o projeto tem. Isso é
específico do jogo — nomes, ordem, agrupamento por mundo, fases ocultas. Não há
convenção de arquivo nem de pasta que valha para qualquer projeto, e inventar uma
(`levels.json` obrigatório) empurraria estrutura para dentro dos jogos.

## Decisão

**O jogo declara suas fases; o Studio só navega.**

O `Game` ganha uma propriedade opcional:

```ts
game.editorLevels = [
  { id: 'fase-1', label: 'Travessia',  group: 'Mundo 1 — Ilhas' },
  { id: 'choco-1', label: 'Doce Começo', group: 'Mundo 2 — Chocolate' },
]
```

Ela alimenta a mensagem `state` que a {@link EditorBridge} (ADR-0056) já publica
por frame — sem canal novo, e o diff por JSON que a ponte faz garante que uma
lista estática não gera tráfego repetido.

No Studio, o viewport ganha uma **pill de fase** ao lado das que já existem
(objeto, ferramentas, atalhos, perf). Escolher recarrega o iframe com
`?level=<id>`, que é exatamente o caminho que o jogo já suporta.

### Por que no `Game` e não numa opção do editor

O editor **não existe no bundle de produção** (ADR-0042), então a lista precisa
morar em algo que sempre exista. Uma propriedade no `Game` é inerte quando não há
editor — o custo em produção é um array parado na memória.

### Por que não um manifesto no projeto

Um `levels.json` lido pelo Studio dispensaria a ponte, mas: (a) obrigaria todo
projeto a manter um arquivo em sincronia com o código que já lista as fases —
duas fontes de verdade, a segunda desatualizando em silêncio; (b) não daria conta
de fase gerada dinamicamente. Declarar em runtime mantém **uma** fonte: o próprio
registro de fases do jogo.

### Por que recarregar o iframe

A alternativa seria trocar de cena sem recarregar (o `Game` já sabe limpar o
mundo). Mas o bootstrap de um jogo faz mais do que montar cena — save, áudio,
skin do player, sistemas da fase — e não há contrato que garanta que trocar por
baixo seja equivalente a carregar do zero. Recarregar é o que o `?level=` já faz
hoje, com o mesmo resultado do harness, que é exercitado continuamente.

## Consequências

- Projeto que não declarar `editorLevels` não vê a pill — a feature é opt-in e
  não muda nada para quem não a usa.
- O jogo passa a ter um lugar canônico para dizer "estas são minhas fases", útil
  para outras ferramentas depois (export por fase, playtest dirigido).
- A pill some no modo Play (ela é chrome de edição).
- O id é o mesmo do `?level=` — se um jogo usar outra convenção de URL, a pill
  não serve para ele sem ajuste.
