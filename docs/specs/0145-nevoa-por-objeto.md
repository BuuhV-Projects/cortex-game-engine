# 0145 - Névoa por objeto (`fog: false` no nó)

**Data:** 2026-07-23
**Status:** aceito

## Contexto

A `fog` de uma cena é global: tinge todo objeto em função da distância à câmera.
É exatamente o que se quer no percurso — é a perspectiva aérea que empilha as
plataformas em camadas e cria profundidade.

O problema aparece com o que está longe **de propósito**. Um planeta de fundo,
uma montanha no horizonte, um marco de escala: a função dessas peças é ser lida
à distância, e a cor própria de cada uma é o que as diferencia. Sob uma névoa
forte, todas convergem para o mesmo tom e o fundo vira uma mancha só.

O caso concreto veio do Mundo 3 do Cute Obstacle Rush (spec 0011 daquele
projeto): com névoa magenta de 50→300u, os planetas de cenário (a 170–330u)
ficavam todos do mesmo rosa, perdendo a variedade que os tornava marcos úteis.

As saídas sem esta feature eram todas ruins: empurrar a névoa pra tão longe que
ela não age no percurso (perde o efeito onde ele interessa), tingi-la da cor do
céu (objetos distantes somem em vez de recuar), ou desistir da névoa.

## Decisão

Campo `fog` opcional no nó de cena (`baseFields`, portanto disponível em
`model`, `primitive` e `mesh`):

```jsonc
{ "type": "model", "id": "planeta", "url": "planet_01.glb", "fog": false }
```

Omitido = o objeto recebe a névoa (comportamento de sempre). `false` o isenta.

O helper público é `setFog(object, enabled)` em `src/scene/SceneAssets.ts`, ao
lado de `setShadows` e `setMatte`, e segue o mesmo formato: percorre os meshes
e escreve em todos os materiais, inclusive multi-slot. Materiais sem suporte a
`fog` são pulados.

No `SceneBuilder` o ajuste roda **depois** de `applyMaterial`, porque este pode
trocar as malhas — o `fog` tem de cair na versão final delas.

## Consequências

- Mudar `material.fog` altera uma *define* do shader, não um uniform: exige
  `needsUpdate = true` e portanto **recompilação**. Fazer isso por frame custaria
  caro; é ajuste de montagem de cena, não de runtime.
- O campo entra em `baseFields`, então aparece no Inspector como qualquer outro
  campo base e persiste no overlay do editor.
- Não há override de overlay dedicado (como existe pra sombras em `data.shadow`):
  a autoria vale pelo nó. Se surgir a necessidade de alternar pelo Inspector sem
  editar o JSON, é aí que entra um `data.fog`.
- `setFog` mexe no material **compartilhado**: dois nós que instanciam o mesmo
  GLB podem compartilhar materiais e um isentar o outro sem querer. Na prática o
  `instance()` clona por nó, mas vale a atenção ao usar o helper à mão.
