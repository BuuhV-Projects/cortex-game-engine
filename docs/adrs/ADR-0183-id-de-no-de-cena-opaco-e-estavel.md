# 0183 - Id de nó de cena é opaco e estável (nunca sequencial)

**Data:** 2026-08-02
**Status:** aceito

## Contexto

O `id` de um nó de cena vira `Object3D.name` no grafo, e é por ele — **e só por
ele** — que o overlay do editor reencontra o objeto que o usuário moveu:

```ts
// src/scene/SceneLoader.ts
root.traverse((obj) => {
  const e = file.objects[obj.name];
  if (!e) return;
  obj.position.set(...); obj.rotation.set(...); obj.scale.set(...);
});
```

Não há conferência de `url`, de tipo, de nada. Se o id `m42` existir, a transform
salva para `m42` é aplicada — seja ele o mesmo objeto de antes ou outro que
herdou o nome.

O padrão que se espalhou pelas cenas geradas por código é um **contador**:

```ts
let seq = 0
const uid = (p: string) => `${p}${seq++}`   // plat0, m1, m2, …
```

Isso amarra a identidade do objeto à **ordem em que ele foi criado**. Inserir ou
remover um nó no meio da função desloca todos os ids seguintes, e o overlay passa
a aplicar a transform de um objeto em outro — sem erro, sem aviso, sem log. O
sintoma aparece longe da causa: uma árvore afundada no chão, uma plataforma
deslocada, um item flutuando. O autor da mudança mexeu na chegada da fase e
quebrou a decoração do fim do percurso.

O caso concreto que motivou o registro: trocar a faixa de chegada da fase 1 do
teste4 por um portal significa remover duas chamadas `model()` do meio da cena.
O overlay dessa fase tem transforms salvas para `m42`, `m56`, `m57` e `m70` —
todos posteriores. A remoção deslocaria os quatro em −2 e o usuário veria quatro
objetos fora do lugar, sem relação aparente com a chegada.

O risco cresce com o uso: quanto mais o usuário edita no editor, mais entradas o
overlay tem, e maior a área de dano de qualquer edição de código no meio da cena.

## Decisão

**O id de um nó de cena é opaco e estável.** Duas propriedades, e as duas são
obrigatórias:

1. **Não deriva da ordem.** Nada de contador, índice de array ou posição na
   função. Reordenar, inserir ou remover nós não pode mudar o id de nenhum outro.
2. **Não muda entre execuções.** O id é decidido na **autoria** e persistido —
   nunca sorteado no momento de montar a cena.

A segunda é fácil de violar sem perceber, e é fatal: as cenas do jogo são
**geradas por código a cada carregamento**. Um `crypto.randomUUID()` chamado
dentro do `build()` daria um id novo a cada load, e o overlay — que guarda o id
de ontem — não casaria com nada. Aleatório só serve se for sorteado uma vez e
gravado.

### Formato

`<prefixo-semântico>-<sufixo alfanumérico>`, por exemplo `plat-k3f9a2`,
`coin-8xz1qq`, `tree-p04mwe`. Sufixo em base36, 6 caracteres.

O prefixo não é enfeite: o id é o que aparece na **hierarquia do editor**, e uma
lista de UUIDs crus (`8f14e45f-ceea-467a-9ae1-1b0dd8f1ba2c`) é ilegível para quem
está procurando a plataforma da largada. O prefixo dá a leitura humana; o sufixo
dá a estabilidade. UUID v4 puro foi descartado por isso — não pelo tamanho do
espaço, que sobra nos dois casos.

Seis caracteres base36 são ~2,2 bilhões de combinações; numa cena de 500 nós a
chance de colisão é de ~0,006%. Mesmo assim o gerador **verifica unicidade contra
os ids já emitidos** e sorteia de novo se colidir — colisão silenciosa aqui tem o
mesmo efeito de um id reciclado.

### As duas formas aceitas de decidir o id

- **Cena em JSON** (o caminho padrão da engine, e o que o Chat IA gera): o id já
  nasce escrito no arquivo. Sorteie o sufixo ao criar o nó e grave. Estável por
  construção.
- **Cena gerada por código**: o id é **autorado**, não calculado. Ou o sufixo
  aleatório é colado como literal no código (`platform('plat-k3f9a2', …)`), ou o
  autor passa uma **chave semântica** própria (`platform('largada', …)` →
  `plat-largada`). A chave semântica atende ao invariante — não depende da ordem,
  não muda entre execuções — e ainda é legível no editor; é a forma preferida
  quando a cena tem estrutura nomeável (setores, checkpoints, trechos).

Em ambos os casos o gerador **falha alto em id duplicado**, em vez de deixar
passar: duplicata tem exatamente o mesmo efeito de um id reciclado, e é o único
modo de falha que sobra depois desta decisão.

## Consequências

- **As cenas existentes continuam com ids sequenciais.** Renomear em massa é
  justamente a operação que o overlay não suporta: trocar `m42` por `plat-k3f9a2`
  no código sem reescrever o overlay junto perde a edição do usuário. A migração
  tem plano próprio e roteiro de reescrita casada (`docs/specs/` do jogo); esta
  decisão vale para **cena nova e nó novo** a partir de hoje.
- O Chat IA passa a gerar ids nesse formato — a regra entra no system prompt
  (`electron/agent/prompt.ts`), na seção de cena data-driven, porque vale para
  qualquer pedido que gere cena.
- Ids ficam mais longos e menos "arrumadinhos" na hierarquia. É o preço; o
  prefixo semântico é o que mantém a lista navegável.
- Não há mudança de runtime na engine: `SceneLoader`/`SceneBuilder` continuam
  casando por nome. Esta é uma regra de **autoria**, e a validação de duplicata é
  o único ponto onde ela vira código.
