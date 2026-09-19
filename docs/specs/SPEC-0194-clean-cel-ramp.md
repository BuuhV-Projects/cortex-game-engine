# SPEC-0194 — Toon cel com uma transição de luz

## Contexto

Quantizar toda a iluminação em 3–4 bandas cria faixas visíveis sobre superfícies
curvas. A direção visual do kart-racer pede uma área clara uniforme e uma área
de sombra legível, ligadas por uma transição estreita e suave.

## Comportamento

- `MaterialConfig` toon ganha `shading?: 'bands' | 'cel'`. Ausente mantém o
  comportamento anterior e o controle `gradientSteps` (compatibilidade).
- `cel` usa uma rampa linear de 256 amostras: patamar de sombra 0.22, patamar
  iluminado 1.0 e smoothstep apenas no intervalo 0.50–0.56 da coordenada da
  rampa (N·L entre 0 e 0.12). Não há degraus intermediários ou um degradê amplo.
- O piso 0.22 afeta a luz direta segundo a normal; sombras projetadas continuam
  dependendo do preenchimento ambiente/hemisférico. Não é emissão/fullbright.
- Usa o pipeline toon existente (textura `gradientMap`), com filtro linear e
  sem mipmaps. Preserva sombras, mapas, cores, contorno, descarte e override.
- Campo suportado pelo schema de cena e pelo Inspector: `Acabamento` permite
  `Faixas` ou `Cel suave`. `Bandas` aparece apenas para `Faixas`. Reescolher
  Toon preserva acabamento/contagem atuais, inclusive em seleção múltipla.
- Documentar a API e atualizar os bundles/declarations dos jogos consumidores.

## Validação

Testar dois patamares, transição localizada/monótona, compatibilidade com bandas,
parse da cena e precedência do overlay; testar troca/persistência no Inspector.
Compilar somente a engine. Verificar jogo com TypeScript sem emissão e testes
da corrida. Revisão visual final depende do Studio disponível.
