# 0230 - Refino de asset 3D por atlas de paleta

**Data:** 2026-09-20
**Status:** aceito

## Contexto

O ADR-0228 fechou a migração do render para C++ e concluiu, com medição, que o
ganho de performance do host **não está em deixar o trabalho por objeto mais
barato, e sim em ter menos objetos**. O censo da cena do `kart-racer` mostrou
onde eles estão:

- **1.320 `Object3D` para ~383 draws**; os 6 carros carregam **509 nós (40%)**,
  ~92 por carro, dos quais ~77 são as quatro rodas.
- Custo medido por nó: **3,8 us** de travessia de matriz + **4,0 us** de
  culling; e **33,5 us por draw** no `renderObject`.

A causa é conhecida e está registrada na SPEC-0224: os modelos foram gerados
por IA sem direcionamento de performance, e o padrão é **um material por peça**.
Uma roda é 1 malha com **6 primitivas e 6 materiais** (borracha, cromo, disco,
pinça, gunmetal, friso). O `mergeSubtree` do engine agrupa por material —
então não há o que fundir, e cada peça sobrevive como draw e como nó.

Duas saídas já foram tentadas e registradas:

- **Instanciar as rodas** (SPEC-0012 do jogo): revertida. Com o mesmo número de
  draws ficava igual ou pior, porque cada `InstancedMesh` paga um `writeBuffer`
  por frame mesmo parada.
- **Unificar materiais "parecidos" na mão** (também na SPEC-0012): descartada no
  papel, e com razão — as peças são de verdade diferentes, e o máximo honesto
  seria 6 → 4 materiais. Fundir tudo num material só deixaria a roda
  monocromática.

## Decisão

Adotar **atlas de paleta** como refino automático de asset: os materiais de cor
sólida viram **texels de uma textura minúscula**, as UVs de cada primitiva são
remapeadas para o texel do seu material, e as primitivas passam a caber num
**único material** — portanto numa única malha.

É a saída que a SPEC-0012 não considerou, e ela resolve o impasse: **a aparência
é preservada** (cada peça mantém cor, metallic e roughness próprios, agora
lidos da textura) e ainda assim sobra **um material só**, que é o que destrava
o merge.

O que torna isto aplicável aqui, e foi verificado antes de decidir: os GLBs dos
carros não têm **nenhuma textura** — todo material é `baseColorFactor` +
`metallicFactor`/`roughnessFactor` —, todos são `OPAQUE`, nenhum tem emissivo, e
**nenhuma peça é referenciada por nome pelo código do jogo**.

### Por que não escrever isso do zero

`@gltf-transform/functions` **já é dependência do engine** (o `cook-assets.mjs`
do host usa o `core`) e traz `palette()`, `join()`, `flatten()`, `dedup()` e
`prune()` — exatamente as operações necessárias, numa biblioteca madura e MIT.
Escrever remapeamento de UV e fusão de primitivas na mão seria reimplementar,
com bugs próprios, algo que o ecossistema já resolve.

### O que fica de fora do refino automático

- **Material com textura, translúcido (`alphaMode` ≠ `OPAQUE`) ou emissivo**
  não entra na paleta: a cor deixaria de ser a única diferença e o resultado não
  seria fiel.
- **`doubleSided`** é reportado, não corrigido. Desligá-lo dobra o desempenho de
  fragmento em malha fechada, mas em peça modelada sem cuidado com normal vira
  buraco visível — é decisão de quem olha o modelo, não de script.
- **Achatamento de hierarquia** (`flatten`) só onde não há nó nomeado que o jogo
  ou o rig usem como pivô; o `rig.json` dos carros aponta pivôs de roda por
  nome, e perdê-los quebraria o `syncVehicle`.

## Consequências

- Um asset refinado ganha **duas texturas minúsculas** (baseColor e
  metallicRoughness) onde antes não tinha nenhuma. É troca consciente: textura
  de paleta é lida uma vez e não custa CPU por objeto, que é o gargalo aqui.
- O filtro dessas texturas tem de ser **NEAREST**, sem mipmap: com filtro
  linear, texels vizinhos sangram e a peça sai com a cor da vizinha.
- O refino é **idempotente** — rodar de novo num asset já refinado não muda
  nada — porque é o que permite ligá-lo no fluxo do Chat IA sem medo de rodar
  duas vezes.
- O asset original **não é sobrescrito sem pedido**: o refinador escreve ao lado
  e relata o que mudou. Asset do usuário não se perde por conta de script.

## Alternativas descartadas

| alternativa | por quê |
| --- | --- |
| Instanciar peças repetidas | já medido e revertido (SPEC-0012 do jogo) |
| Unificar materiais "parecidos" na mão | 6 → 4 materiais no melhor caso, e muda a aparência |
| Decimar geometria | triângulo é GPU; o gargalo medido é CPU por objeto |
| Escrever a fusão de UV/primitiva do zero | `@gltf-transform` já é dependência e faz isso |
