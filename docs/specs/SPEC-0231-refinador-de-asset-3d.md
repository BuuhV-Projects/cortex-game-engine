# 0231 - Refinador de asset 3D

**Data:** 2026-09-20
**Status:** aceito

## Contexto

O ADR-0230 decidiu a técnica (atlas de paleta) e o porquê. Esta spec descreve a
ferramenta e como ela entra no fluxo de quem cria asset — inclusive o Chat IA,
que hoje gera modelo 3D **sem nenhuma verificação de performance** e é a origem
do problema (SPEC-0224).

## A ferramenta

`native/scripts/refine-asset.mjs`, rodada por `yarn asset:refine`:

```
yarn asset:refine <arquivo.glb | pasta> [opções]

  --out <dir>        onde escrever (default: ao lado, com sufixo .refined.glb)
  --in-place         sobrescreve o arquivo original
  --keep <nomes>     materiais que NÃO entram na paleta, por nome, separados
                     por vírgula (ver "materiais protegidos")
  --check            só mede e relata; não escreve nada
  --json             relatório em JSON na saída padrão (para o Chat IA ler)
```

Pipeline, nesta ordem (a ordem importa: paletizar antes de juntar é o que torna
as malhas elegíveis ao `join`):

1. **Medir** o estado de entrada: nós, malhas, primitivas, materiais, texturas,
   triângulos.
2. **Proteger** os materiais pedidos em `--keep`.
3. `dedup()` — materiais e acessores idênticos viram um só.
4. `palette()` — materiais de cor sólida viram texels de uma textura.
5. `join()` — primitivas que agora dividem material viram uma malha.
6. `prune()` — sobras.
7. **Desproteger** e **medir de novo**, relatando a diferença.

### Materiais protegidos

Um jogo pode procurar um material **pelo nome** em runtime. No `kart-racer`, o
`rig.json` de cada carro traz `paintMaterial: "Gol_Paint"`, e o
`createCar.ts:48` compara esse nome para descobrir o que pintar com a cor
escolhida. Se a paleta engolisse esse material, o carro deixaria de ser pintável
— e o bug apareceria só em runtime, na garagem.

Como `palette()` só recolhe materiais **sem textura**, a proteção é dar ao
material uma textura `baseColor` branca de 1x1 antes do passo, e removê-la
depois. Branca de 1x1 não muda a aparência: a cor final continua sendo o
`baseColorFactor`, que é justamente o que o jogo escreve.

### O que a ferramenta reporta mas não conserta

- **`doubleSided`** — dobra o trabalho de fragmento e quase sempre está ligado
  sem necessidade, mas desligar em peça com normal invertida abre buraco
  visível. É decisão de quem olha o modelo.
- **Contagem de nós vazios** e profundidade da hierarquia: `flatten()` some com
  pivôs nomeados, e o `rig.json` depende deles.
- **Escala métrica** (a regra de proporção real do projeto): só avisa quando o
  bounding box foge do esperado para a categoria.

## Integração com o Chat IA

Toda vez que o Chat IA **cria ou altera um modelo 3D**, ele roda
`refine-asset --check --json` no resultado e lê o relatório. Se houver refino a
fazer, aplica e informa o que mudou, em vez de entregar um asset que só vai
aparecer como queda de fps três sessões depois.

Os limites que disparam aviso vivem em um lugar só, no próprio script, e são os
que a medição do ADR-0228 justifica:

| sinal | limite | por quê |
| --- | --- | --- |
| materiais por asset | > 4 | cada material é uma draw que o merge não funde |
| primitivas por malha | > 2 | primitiva separada = malha separada depois do merge |
| nós por asset | > 24 | custo medido de 7,8 us por nó por frame |
| textura por material | ausente + cor sólida | é o caso em que a paleta se aplica |

Não são números escolhidos por gosto: saem do custo por nó e por draw medido na
SPEC-0227.

## Consequências

- Asset do usuário **não é sobrescrito** sem `--in-place`.
- O refino é **idempotente**: um asset já refinado passa pelo pipeline sem
  mudar, o que permite rodá-lo no fluxo do Chat IA sem medo de rodar duas vezes.
- A ferramenta vive em `native/scripts/`, junto do `cook-assets.mjs`, porque é a
  pasta que o `electron-builder.json` empacota (`extraResources`) e da qual o
  Studio já resolve script por `resourceBase()` — o Chat IA roda no Electron
  EMPACOTADO, e um script fora dali simplesmente não existiria lá.
