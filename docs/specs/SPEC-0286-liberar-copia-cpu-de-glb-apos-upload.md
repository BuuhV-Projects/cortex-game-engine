# SPEC-0286 — Liberar a cópia em CPU do GLB depois do upload

**Data:** 2026-10-02
**Status:** aceito

## Contexto

Os modelos carregados por `AssetLoader.loadGLTF` mantinham em RAM duas cópias
do que já estava na GPU:

1. o `GLTFParser` devolvido em `gltf.parser`, que retém o corpo binário do
   GLB inteiro (cache de dependências do parser);
2. os dados dos mips das texturas KTX2 transcodificadas pelo host
   (`CompressedTexture.mipmaps[i].data`, BC7).

No export nativo, todo `ArrayBuffer` conta como memória externa do Hermes, que
tem teto de 2 GB. O Circuito da Baía do crash-bandicoot-racer usa 14 assets em
3 LODs, quase todos residentes ao mesmo tempo pelo streaming; o jogo caiu com
`HermesGC: OOM ... external = 2189675165`.

Medição no host (probe em `D:/Codex/2026-10-02/leak-probe`, 42 combinações
asset/LOD residentes e renderizadas): **1.759 MB** de memória externa com as
cópias, **130 MB** sem elas. Ciclos de carregar/descartar não vazam — o
problema é o volume retido, não a liberação.

## Decisão

No caminho do `AssetLoader.loadGLTF`:

- `gltf.parser` é removido do objeto devolvido (nenhum código da engine nem dos
  jogos o lê). A cena, materiais, geometrias e animações continuam.
- Texturas KTX2 do transcoder nativo (`loadKtx2Native`) são marcadas em
  `userData.cortexNativeKtx2`. `releaseKtx2DataAfterUpload(root)` agrupa as
  texturas da cena que compartilham os mesmos objetos de mip (o GLTFLoader cria
  um clone por material, e `Texture.clone` copia a lista de mips mas mantém os
  objetos) e encadeia `texture.onUpdate`, que o renderer chama logo depois de
  enviar a textura. Quando **todas** as texturas do grupo já subiram, `data` de
  cada mip vira `null`.

Uma textura que nunca é desenhada nunca sobe, e o grupo dela mantém os dados —
correto, porque ela ainda pode ser enviada depois.

## Consequências

- O GPU continua com a textura; só a cópia em CPU some.
- Uma textura liberada **não pode** ser reenviada: mudar algo que incremente
  `texture.version` (`needsUpdate = true`) depois do upload falharia. Texturas
  KTX2 de GLB não são editadas em runtime; o Studio (browser) não usa KTX2.
- Quem precisar do parser do GLTF deve usar o `GLTFLoader` do three
  diretamente.
- Teste: `tests/core/releaseKtx2Data.test.ts`.
