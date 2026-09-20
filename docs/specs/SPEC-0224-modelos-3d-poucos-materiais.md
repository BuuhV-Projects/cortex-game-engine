# 0224 - Chat IA orienta performance ao encomendar modelo 3D

**Data:** 2026-09-20
**Status:** aceito

## Contexto

Os carros do `kart-racer` foram gerados por um modelo de IA externo a pedido do
usuário, **sem nenhum direcionamento sobre técnica de modelagem**. O resultado
foi medido e é sistemático, não acidental:

| | |
| --- | --- |
| GLB de roda | 6 primitivas, **6 materiais distintos** |
| 4 rodas de um carro | 24 das 41 malhas |
| corpo do carro | 13–33 primitivas → 7–17 malhas (funde bem) |

Um material por peça é a forma mais natural de **descrever** um objeto — pneu,
cromo, disco, pinça, gunmetal, friso — e a pior possível para draw calls: o
merge estático da engine (SPEC-0120/SPEC-0213) agrupa **por material**, então
cada peça com material próprio sobrevive como uma malha, e uma malha é uma
draw. O corpo funde justamente onde as peças compartilham material.

No host nativo o custo é por draw: medido em **68 us por draw** no
`kart-racer`, com o render em 10,4 ms fixos mais 68 us × draws. Os cinco carros
visíveis somavam metade das malhas da cena.

O contraponto importa tanto quanto a regra: **triângulo não é o gargalo.** O
`camaro-blower` tem 570 k triângulos e renderizar em 1× ou 2× de supersampling
dá o **mesmo fps** — a GPU tem folga. Pedir "low poly" a um gerador otimizaria
a coisa errada.

## Decisão

O prompt de sistema do Chat IA (`electron/agent/prompt.ts`) ganha a seção
**"Modelos 3D: o custo é material, não triângulo"**, com duas obrigações:

1. **Ao encomendar um modelo 3D a um gerador** (o usuário pedindo a outra IA,
   ou o agente escrevendo o briefing), incluir as restrições de material no
   pedido — não deixar implícito.
2. **Ao diagnosticar um modelo pesado**, contar materiais por primitiva antes
   de culpar a geometria, e propor unificação de material em vez de decimação.

As regras que o prompt passa a carregar, todas medidas:

- peças com o mesmo acabamento compartilham **um material** ("todo cromo do
  modelo usa um material só"), nunca um material por peça;
- teto sugerido: **≤ 4 materiais** numa peça pequena (roda, item), **≤ 8** num
  objeto grande (carro, prédio);
- contagem de triângulos é secundária — só importa para VRAM e tempo de carga;
- nada de malha separada para detalhe que o jogo nunca mostra de perto
  (parafuso, interior, motor).

## Consequências

- O prompt cresce. É o custo de todo turno do Chat IA, e por isso a seção é
  curta e sem exemplo longo.
- A regra é do **Studio**, não da engine: quem gera modelo é o usuário com
  outra ferramenta. O Chat IA só passa a saber pedir direito e a diagnosticar
  direito.
- Não há validação automática: o agente pode ignorar a orientação. Uma
  ferramenta que conte materiais por GLB e avise no `validate_scene` seria o
  passo seguinte, e fica registrado como não-feito.
