# SPEC-0283 — Espuma de contato

**Data:** 2026-09-28
**Status:** implementado

## Comportamento

Seguindo o ADR-0282, remover manchas de espuma em mar aberto. Extrair segmentos
das interseções dos triângulos visíveis com o plano no nível médio da água,
respeitando transformações e excluindo a própria água, malhas deformáveis e
objetos completamente acima ou abaixo da superfície.

Rasterizar uma faixa suave de `foamWidth` metros ao redor dos segmentos numa
textura limitada a 1024 pixels por lado. `foamStrength` controla a intensidade
da espuma de contato e dos impactos. Sem contornos ou impactos não há espuma.
As coordenadas são mundiais; acompanhar a câmera não move as margens.

`buildScene` atualiza a máscara depois de carregar os objetos, antes da fusão
estática e do aquecimento. `Water.refreshShoreline()` permite atualização
explícita após editar geometria; `dispose()` libera a máscara. O modo simples
preserva seu comportamento. Não há leitura de profundidade nem passe adicional.

## Validação

Testar interseções reais, exclusão de objetos submersos, transformações,
largura limitada e ausência de espuma fora das margens. Compilar os shaders
no host e capturar o oceano da pista na mesma câmera da validação anterior.

## Resultado

64 testes de água/cena passaram, assim como o typecheck e o build da engine.
Documentação gerada sem erros. O exemplo isolado confirmou espuma ao redor
do obstáculo e nos impactos, com mar aberto limpo. A captura nativa da pista
confirmou a remoção das manchas; nenhum erro de validação WebGPU foi registrado.
Capturas locais: `.cortex/shoreline-demo-capture` e, no jogo,
`.cortex/shoreline-capture`. Não foi acrescentado passe de cena por quadro.
