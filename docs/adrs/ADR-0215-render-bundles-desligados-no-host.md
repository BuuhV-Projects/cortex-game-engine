# 0215 - Render bundles desligados no host

**Data:** 2026-09-19
**Status:** aceito

## Contexto

Os **render bundles** (SPEC-0136 / M-perf-2b) envolvem as subárvores estáticas da
cena num `BundleGroup`: o `WebGPURenderer` grava os comandos de draw **uma vez** e
no replay executa um `executeBundles` por pass, cortando milhares de travessias
JS→C++ por frame. É um dos ganhos do PRD-0005, e liga **só no host nativo**
(`isNativeHost()`).

No export do kart-racer isso produz imagem errada:

1. **Objetos presos na tela.** Durante a cutscene de abertura, uma faixa inteira
   do cenário fica **parada** enquanto o resto gira com a câmera — e o lago da
   ponte aparece no alto da tela, onde ele não está. Os objetos bundlados são
   desenhados com a matriz de câmera do momento em que o bundle foi **gravado**.
2. **Silhuetas pretas** no lugar das árvores: a casca de contorno do toon
   (inverted hull, preta) também é bundlada, fica presa e cobre o que estiver
   atrás dela.

O segundo sintoma parecia um problema próprio do contorno e chegou a ser tratado
como tal — excluindo a casca do bundle. Era paliativo: tratava um sintoma de uma
causa que afeta **todo** objeto bundlado. A imagem do usuário, com a faixa
circulada parada e o lago fora do lugar, mostrou a causa comum.

No Studio nada disso aparece, porque lá os bundles ficam desligados.

## Decisão

**Os render bundles ficam desligados por padrão**, inclusive no host, até que a
atualização de câmera dentro do bundle esteja correta.

`options.renderBundles` continua existindo e passa a ser **opt-in explícito** —
quem quiser medir ou experimentar liga, e sabe o que está ligando.

Alternativas consideradas:

- **Manter ligado e excluir o que quebra** (o paliativo do contorno): rejeitada.
  A câmera congelada atinge qualquer objeto bundlado; excluir caso a caso é
  perseguir sintomas, e cada cena nova traz um sintoma diferente.
- **Regravar o bundle a cada frame**: anula o ganho — o bundle existe
  justamente para não regravar.
- **Corrigir a atualização do bind group da câmera** no host: é a correção de
  verdade, e fica como frente aberta. Não bloqueia desligar agora: imagem errada
  é pior que 21% de fps.

## Consequências

- **A imagem fica correta no export.** Nada de objeto preso, nada de silhueta
  preta, nada de lago no céu.
- **Custo medido** no kart-racer (vista panorâmica, mediana de ~25 amostras após
  o carregamento): **29 → 23 fps** e 733 → 839 draw calls. É o preço de ter a
  cena no lugar certo.
- O **merge estático** (SPEC-0120) continua ligado no host e segue sendo o corte
  principal de draw calls — ele não tem este defeito, porque não grava comandos:
  funde geometria.
- Quando o bundle for corrigido, religar é mudar um default — e aí o contorno
  toon precisa ser reavaliado junto, porque foi o primeiro sintoma a aparecer.

## Validação

- `tests/scene/renderBundles.test.ts`: o default **não** bundla (nem no host);
  `renderBundles: true` explícito continua bundlando o que é elegível.
- Visual, no export do kart-racer: a cutscene de abertura gira inteira, sem faixa
  parada, com as árvores coloridas e o lago no lugar.
