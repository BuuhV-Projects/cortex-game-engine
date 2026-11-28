# ADR 0754 - Residência de assets por contador, dono e LRU com orçamento em bytes

**Data:** 2026-11-27
**Status:** aceito

## Contexto

A SPEC-0753 dá à engine o carregar e soltar GLBs sob demanda. A pergunta é quando um GLB carregado sai da memória.
O primeiro usuário é o Port Hollow: os skins de NPC de missão, que a missão usa por um trecho e que a gangue da rua
pode pedir a qualquer instante.

## Alternativas

1. **Só contador de referências:** o GLB sai quando o último usuário o larga. Simples, mas solta e recarrega o mesmo
   modelo toda vez que um NPC some e outro igual aparece logo depois (o de gangue que morre e é recrutado de novo, a
   missão seguinte com o mesmo personagem), com um engasgo de decodificação a cada volta.
2. **Só orçamento com LRU:** sai o usado há mais tempo quando passa do orçamento. Pode soltar um modelo que um boneco
   ainda desenha (o clone compartilha a textura com o GLB), e a missão não tem como garantir o elenco dela.
3. **Contador + dono + LRU com orçamento em bytes** (o `CStreaming` do GTA SA): o contador protege quem está vivo; o
   dono ("a missão segura") protege o elenco de um trecho mesmo antes de alguém aparecer; o orçamento decide quando
   soltar, e a LRU decide quem. Largar não é apagar.

## Decisão

A alternativa 3, na engine (`AssetResidency`), porque é mecanismo genérico (vale para veículo, prop de missão,
cenário), e o jogo só diz o que pedir, segurar e o orçamento.

- O orçamento conta bytes estimados de GPU e CPU (textura e geometria), não o tamanho do arquivo como o SA: o que
  estoura aqui é a imagem decodificada e a VRAM.
- O orçamento só limita o descarte: um pedido nunca falha por falta de espaço (como o `MakeSpaceFor` do SA, que
  descarta o que pode e segue).
- O descarte roda no fim de cada carga, não por quadro.

## Consequências

- O jogo precisa contar cada clone vivo (`acquire`/`unref`): esquecer o `unref` prende o modelo (fica residente até
  o fim); esquecer o `acquire` pode soltar o modelo de um boneco à mostra.
- A estimativa de bytes é aproximada (a textura comprimida conta 1 byte por texel, os mips 4/3). Serve para comparar
  e decidir, não como medida da memória do processo.
- Soltar uma URL fecha a imagem decodificada: um clone esquecido vivo perde a textura em vez de vazar memória.
