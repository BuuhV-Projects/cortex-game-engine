# SPEC-0294 - Espaço de cor das texturas KTX2 do glTF no Studio

**Data:** 2026-10-03
**Status:** aceito

## Contexto

No Studio, a pista da fase 2 do crash-bandicoot-racer tinha manchas escuras
de bordas serrilhadas. A/B no jogo rodando: as manchas continuavam sem a
sombra da luz e sumiam com a pista num material sem iluminação — o problema
estava no sombreamento do material. Os mapas `normalMap`, `roughnessMap` e
`metalnessMap` chegavam com `colorSpace = srgb`.

Os KTX2 do pacote do mapa marcam TODAS as imagens com transferência sRGB no
DFD, inclusive normal e metal/rugosidade. O `KTX2Loader` do three (caminho do
browser) copia essa marca para a textura, e o `GLTFLoader` só sobrescreve o
espaço de cor nos slots de cor. Resultado: dados lineares decodificados com a
curva sRGB → normais tortas (manchas) e metal/rugosidade errados. O caminho
nativo (`loadKtx2Native`) já devolvia a textura sem espaço de cor e não tinha
o defeito.

## Decisão

O `CortexKtx2Loader` (usado pelo `GLTFLoader` para `KHR_texture_basisu`) zera
`colorSpace` para `NoColorSpace` antes de entregar a textura: o slot do glTF
decide, como no nativo. Base e emissivo continuam sRGB (o `GLTFLoader` marca).
O `loadKtx2` direto (fora do glTF) não muda.

## Consequências

- Studio e host nativo passam a sombrear os mesmos materiais KTX2 igual.
- Pacotes com a marca sRGB errada em mapas de dados deixam de quebrar no Studio.
