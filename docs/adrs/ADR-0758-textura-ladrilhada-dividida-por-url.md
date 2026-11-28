# ADR 0758 - Camada do terreno e textura de estrada: uma textura por URL, sem clone, com o KTX2 cozido

**Data:** 2026-11-28
**Status:** aceito
**Relacionado:** SPEC-0757, ADR-0756, SPEC-0755, SPEC-0652

## Contexto

O cook de imagens soltas (SPEC-0755) troca a textura pela versão BC7 só no `loadTexture` público. Duas texturas
ladrilhadas da cena não passam por ele do jeito que o cook aceita (ADR-0756):

- a camada do terreno (`terrainLayerTexture`) carrega pelo `TextureLoader` direto, síncrono: nunca vê o manifesto;
- a textura de estrada (`RoadBuild.applySurface`) passa pelo `loadTexture`, mas clona a textura a cada estrada para
  pôr o wrap e a anisotropia próprios. A BC7 solta os dados da CPU no primeiro upload, e o clone sobe vazio.

O clone também custa no PNG: cada estrada é uma `Texture` à parte, e o renderer sobe uma cópia na GPU por estrada.
No Port Hollow são ~20 estradas com duas texturas de 1024² (~5 MB cada com os mips).

## Alternativas

1. **Manter o clone e guardar os dados BC7 na CPU.** O clone subiria cheio, mas a RAM que a conversão quer cortar
   volta, e as cópias na GPU continuam uma por estrada.
2. **O clone recarregar o `.ktx2` (`CompressedTexture` vazia até a carga chegar).** Uma carga e um upload por estrada,
   e a estrada sem textura por alguns quadros.
3. **Dividir a textura do cache do `loadTexture` e mudar o wrap nela.** Sem cópia, mas muda o wrap e a anisotropia de
   quem mais pedir a mesma URL pelo `loadTexture`.
4. **Um cache próprio por URL para cada uso ladrilhado (camada do terreno, estrada), com o `.ktx2` do manifesto ou o
   original** *(escolhida)*. Cada uso tem uma textura por URL, com as opções dele, e nenhum clone.

## Decisão

A alternativa 4, num módulo só (`tiledTextureCache`, `src/scene/tiledTextures.ts`):

- o cache guarda a promessa da textura por URL e aplica as opções do uso (wrap, sRGB, anisotropia) uma vez, antes do
  primeiro upload;
- a carga é a do `loadTexture` público por dentro (`loadLooseTexture`): no host, o `.ktx2` cozido; senão, o original;
- a camada do terreno passa a ser assíncrona: o `Terrain` põe a textura no nó quando ela chega, se a camada ainda for
  a mesma;
- a estrada deixa de clonar: todas as estradas com a mesma URL dividem a textura.

## Consequências

- A camada do terreno e a estrada podem entrar na lista `cookTextures` do jogo.
- A textura de camada chega um microtask depois no navegador (antes, a `Texture` vinha na hora e a imagem depois).
- A mesma URL pedida pelo `loadTexture` e por uma estrada tem duas texturas: cada uma com as próprias opções.
- O `clearSceneAssetCaches` descarta os dois caches.
