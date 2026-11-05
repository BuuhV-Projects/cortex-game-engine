# 0691 - CSM nativa: o lado nativo dirige as cascatas, uma textura por cascata, skinned excluído

**Data:** 2026-11-05
**Status:** aceito

## Contexto

Com CSM, os receptores do renderer nativo não têm sombra do sol (SPEC-0690). O C++ já sabe desenhar as cascatas, mas
quem pede o desenho é o `updateBefore` do nó TSL, e o three só o chama para materiais que ele mesmo desenha. Para
devolver a sombra, quatro coisas precisavam de decisão: quem dispara a atualização, como o receptor lê as cascatas,
o que fazer com os casters que o C++ não desenha, e o que fazer quando uma cascata é recusada.

## Decisão

1. **O lado nativo dirige a CSM.** O `ShadowBlock.update` chama `CameraFollowingCSM.updateNative` uma vez por quadro,
   com guarda por quadro contra o `updateBefore` do three. As alternativas eram:
   - deixar um receptor do three "isca" para forçar o `updateBefore`, mas isso põe um draw do three por quadro só
     para disparar um efeito colateral;
   - reescrever a CSM em C++, o que duplica a lógica de divisão das cascatas e perde a paridade com o three.

2. **Uma `texture_depth_2d` por cascata, nos bindings 10–15.** O receptor lê direto os alvos que o three criou e onde
   o C++ já desenha. As alternativas eram:
   - um `texture_depth_2d_array`, que exige copiar os mapas a cada quadro (2 × 2048² de profundidade) ou fazer o C++
     desenhar num alvo próprio, com o three perdendo o mapa para os receptores dele;
   - um atlas, que tem o mesmo problema e ainda muda a matriz de cada cascata.

   O custo é o teto de 6 cascatas, que é folgado (o padrão da engine é 3; o DDD 00 usa 2).

3. **Caster skinned é excluído, não recusa a cascata.** As alternativas eram:
   - manter a recusa, mas o player está sempre na cascata 0, então a CSM nativa nunca valeria;
   - o modo híbrido, com o three redesenhando só os skinned por cima: o `ShadowNode` limpa o alvo, então isso exige
     um pass do three com `load`, e é uma segunda fonte de verdade para o mesmo mapa.

   Personagens ficam sem sombra nesta fase, como já estão hoje no export. A sombra deles entra quando o passe de
   sombra em C++ souber fazer skinning.

4. **Cascata recusada fica desligada no receptor nativo, naquele quadro.** A alternativa era manter o mapa do quadro
   anterior, mas a câmera da cascata acompanha o jogador e o mapa velho vira sombra fantasma deslocada. Luz plena por
   um quadro de streaming é o erro menos visível. A recusa contínua aparece no perf-trace (`sunShadow.cascades`).

## Consequências

- O three deixa de ser necessário para a sombra do sol no export. Receptores do three, se houver, continuam lendo a
  CSM pelo TSL, com o mesmo mapa.
- O `drawShadowCasters` passa a distinguir vazio (limpa), não pronto (recusa) e descartado no shim (recusa). Isso
  troca "recusa silenciosa por quadro vazio" por "limpeza explícita", e um bug ali deixaria sombra fantasma; o teste
  do host cobre a classificação e o roteiro dos três casos (funções puras); a execução na GPU fica para o aceite
  em captura.
- O WGSL do receptor ganha um ramo de CSM com N amostragens condicionais. O custo por fragmento é o PCFSoft de hoje
  (uma cascata), ou o dobro na faixa de fade. O aceite da SPEC-0690 mede isso por área.
- Personagens sem sombra no export continuam sendo uma limitação conhecida.
