# ADR 0756 - Imagens soltas cozidas para KTX2 por uma lista opt-in do jogo

**Data:** 2026-11-28
**Status:** aceito
**Relacionado:** SPEC-0755, SPEC-0750

## Contexto

O cook converte as texturas dos GLB para KTX2 sem perguntar nada ao jogo: o material diz se a textura é cor ou dado, e
o GLB já guarda a orientação. Uma imagem solta não diz nada disso, e quem a carrega pode:

- ler os pixels na CPU (um canvas 2D, um heightmap, o `new Image()` de pré-carga da UI);
- usá-la com `flipY = true`, que uma textura comprimida ignora;
- ser dado linear (normal, gradiente), que o encode perceptual estraga;
- ter dimensões fora dos blocos 4×4 do BC7.

## Alternativas

1. **Converter toda imagem solta e trocar no `AssetLoader` sem o jogo saber.** Quebra quem lê os pixels, inverte o que
   usa `flipY = true` e codifica dado como cor. A engine não tem como saber.
2. **Converter por pasta ou extensão, com exceções.** Erra no primeiro arquivo novo que cair numa pasta convertida,
   como o normal e o roughness de um pacote de terreno.
3. **Uma lista opt-in do jogo no `cortex.json`, com cor ou dado, flip e substituição por entrada** *(escolhida)*. O jogo
   sabe como usa cada imagem. A engine aplica e avisa o que não deu.
4. **O jogo converter as próprias imagens e versionar o `.ktx2`.** Duplica o asset no repositório e na ferramenta, e o
   dev no navegador perde o PNG editável.

## Decisão

A alternativa 3:

- O cook só converte o que a lista casa.
- O `loadTexture` público troca a URL pela versão cozida só no host e só com o manifesto que o cook gravou.
- O navegador segue com o PNG.

## Consequências

- Imagem nova não muda de comportamento sozinha: entra no KTX2 quando o jogo a põe na lista.
- Quem põe uma imagem na lista responde pela orientação (`flipY`) e pela cor ou dado (`srgb`). Errar mostra a textura
  virada ou com a cor lavada no export, não no dev. A lista precisa de conferência visual no export.
