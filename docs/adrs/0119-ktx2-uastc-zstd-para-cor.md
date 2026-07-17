# 0119 - Texturas de cor do export em UASTC+RDO+Zstd (ETC1S bandava os gradientes)

**Data:** 2026-07-17
**Status:** aceito (complementa 0108-ktx2-texturas-comprimidas)

## Contexto

No jogo exportado, superfícies grandes e suaves (a pedra cinza da fase 1 do
teste4) apareciam "cheias de camadas" — bandas horizontais — enquanto no Studio
a mesma superfície era lisa. Não é luz: o Studio renderiza as texturas FONTE
(PNG); o export converte as texturas de cor pra **KTX2/Basis ETC1S** (ADR-0108),
e o ETC1S quantiza gradientes suaves em blocos visíveis.

Os kits estilizados usados nos jogos (Cute, Chocolate…) pintam TUDO com **atlas
de paleta + degradê contínuo** — o pior caso possível pro ETC1S. Medido no atlas
do kit (1024²): ETC1S q128 = **37,4 dB** PSNR (bandas visíveis; q255 = 38,8, não
resolve), UASTC = **52,4 dB** (visualmente sem perda). Detecção automática de
"textura que banda" foi tentada (PSNR em regiões lisas, PSNR de baixa
frequência) e **não separa** — o erro do ETC1S tem magnitude parecida em todas
as texturas; o que muda é a visibilidade (banda coerente vs ruído mascarado).

Restrições encontradas no caminho:
- UASTC cru é 8 bpp fixo (1024² = 1,37 MB) e o **pak não comprime** (ADR-0104,
  só XOR) — precisa da supercompressão **Zstd** no próprio KTX2.
- O host buildava com `BASISD_SUPPORT_KTX2_ZSTD=0` — KTX2+Zstd nem carregava.
- RDO com dicionário default (4096) custava ~15 s por textura 1024² no encoder
  WASM — inviável pra ~250 GLBs.

## Decisão

1. **Toda textura convertida vira UASTC + supercompressão Zstd** no cook do
   export (`ktx2-glb.mjs`):
   - **Cor** (sRGB): UASTC + **RDO** scalar 1.0 — o RDO deixa o UASTC
     compressível pelo Zstd (1024²: 1,37 MB → **352 KB**).
   - **Normal/dados** (linear): UASTC sem RDO (RDO distorce vetores de normal).
   - Parâmetros de velocidade medidos no atlas do kit: `setPackUASTCFlags(1)`
     ("faster") + `setRDOUASTCDictSize(1024)` → **2,6 s** por 1024² mantendo
     **52,4 dB** (vs 15,4 s / 52,7 dB no default). ETC1S continua disponível
     por flag (`--etc1s` no CLI / `uastc: false` na API).
   - O guard "só troca se ficar MENOR que a fonte" continua — textura pequena
     fica PNG (qualidade máxima).
2. **Host transcoda Zstd**: `BASISD_SUPPORT_KTX2_ZSTD=1` + `zstddeclib.c`
   single-file vendorizado do próprio basis_universal em `third_party/zstd/`
   (layout upstream — o transcoder inclui `../zstd/zstd.h`; fetch-deps baixa).
   Vale pros três builds do host (desktop/steam/gdk) — **steam e gdk precisam
   de rebuild** na próxima release.
3. **Cache do cook ganhou versão** (`COOK_VERSION` entra no hash,
   `cook-assets.mjs`): mudar a política de encode invalida os GLB cozidos — sem
   isso o export re-usaria ETC1S do cache pra sempre.
4. O encoder WASM é **memoizado** entre chamadas (inicializar por textura
   custava ~2 s no lote).

## Consequências

- Banda/"camadas" some das superfícies com degradê; o export fica visualmente
  igual ao Studio.
- Pak maior (ETC1S ~1 bpp → UASTC+RDO+Zstd ~2-3 bpp efetivos): teste4 foi de
  52 MB pra **116 MB** (fonte: 134 MB) — aceitável pro alvo (Steam). VRAM: BC7
  8 bpp (vs BC1 4 bpp do caminho ETC1S) — irrelevante na escala destes jogos.
- Cook inicial mais lento (~2,6 s por textura grande, uma vez; cache absorve os
  próximos exports).
- Primeiro export depois deste ADR re-cozinha TUDO (cache v2).
