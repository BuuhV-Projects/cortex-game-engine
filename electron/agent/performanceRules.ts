/**
 * Regras de performance do Chat IA (SPEC-0266) — fonte ÚNICA, lida pelas duas
 * cabeças: o prompt do Claude (modo Codificar) e o preâmbulo do Astra (modo
 * Modelagem). Cada regra veio de uma medida no kart-racer; o número entre
 * parênteses é o registro que a sustenta.
 */

/** As regras, em Markdown. */
export const PERFORMANCE_RULES = `## Regras de performance (medidas, não opinião)

1. **Modelo 3D: o custo é material, não triângulo** (SPEC-0224). No host nativo o render custa **por draw call** (~68 us cada), e o merge da engine agrupa por material — cada peça com material próprio sobrevive como uma malha, e cada malha é uma draw. Um gerador sem direcionamento entrega um material por peça — num carro real as 4 rodas viraram 24 das 41 malhas. Triângulo não é o gargalo: pedir "low poly" otimiza a coisa errada.
   - **Ao encomendar um modelo**, ponha no pedido: peças com o **mesmo acabamento** compartilham UM material ("todo cromo usa um material só"); no máximo **4 materiais** numa peça pequena (roda, item) e **8** num objeto grande (carro, prédio); sem malha separada para detalhe que o jogo nunca mostra de perto. O Studio reprova e manda refazer o modelo que passar disso (SPEC-0267).
   - **Ao diagnosticar um modelo pesado**, conte **materiais por primitiva** antes de culpar a geometria, e proponha unificar material — não decimar.
2. **Aquecer DEPOIS de criar** (ADR-0262). \`game.precompile()\` sob a tela de carregamento opaca, depois de criar tudo que só nasce no uso (efeitos, projéteis, variantes). Objeto que aparece pela primeira vez no meio do jogo compila shader na hora e trava — foram travadas de 50 a 175 ms num quadro.
3. **Pool, não criação no uso.** Efeitos e projéteis nascem no carregamento e voltam a um pool. \`InstancedMesh\` gera um shader POR OBJETO: um novo criado em jogo é uma compilação nova.
4. **Um caminho de render a mais é outro aquecimento.** Se o jogo desenha a cena num \`pass()\` próprio (pós-processamento que liga por estado, como um borrão de velocidade), force esse caminho e chame \`game.precompile()\` de novo — senão a cena inteira recompila na primeira vez que ele liga.
5. **Teto de fps é escolha do jogo** (ADR-0257): \`game.maxFps\`, de preferência um divisor do refresh (\`game.refreshHz\`) — senão a média bate, mas os quadros alternam de duração.`

/** Fechamento do turno do Codificar: revisar o código escrito contra as regras. */
export const CODE_REVIEW_CLOSING = `## Antes de encerrar o turno

Revise o código que você escreveu neste turno contra as **Regras de performance** acima e diga ao usuário, em uma linha, o resultado (ex.: "Performance: efeitos criados no carregamento e aquecidos; nada criado no update."). Se alguma regra foi violada, corrija antes de encerrar — ou explique por que não se aplica.`

/** Fechamento do turno do Modelagem: revisar os dados e modelos contra as regras. */
export const MODELING_REVIEW_CLOSING = `Antes de encerrar, revise o que você criou ou alterou neste turno (modelos, cenário, efeitos) contra as regras de performance acima e diga ao usuário, em uma linha, o resultado.`
