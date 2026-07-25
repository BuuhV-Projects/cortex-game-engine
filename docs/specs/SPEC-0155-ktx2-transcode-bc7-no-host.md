# SPEC-0155 - KTX2 transcodado pra BC7 no host (VRAM 4× menor)

**Data:** 2026-07-25
**Status:** aceito

## Contexto

O transcoder KTX2 do host (`native/src/shims/ktx2.cpp`, ADR-0108) entregava
**RGBA32 cru e só o mip 0** — o three então subia a textura descomprimida e
gerava mips na GPU. Resultado: as texturas do kit ocupavam **4× mais VRAM** do
que no Studio (onde o `KTX2Loader` do three transcoda pra BC7), e a geração de
mips pagava custo de GPU no load. Medido no perf-log (SPEC-0152): kit do mundo
espacial ≈ centenas de MB em `rgba8unorm-srgb` com mips.

Os `.ktx2` do cook já são UASTC com mipmaps embutidos (`setMipGen(true)`,
ADR-0119) — UASTC→BC7 é o par de transcode de maior qualidade do basis. Todo
hardware D3D12 suporta BC1–7 por exigência da spec (PC e Xbox/GDK).

## Decisão

- **Host** (`ktx2.cpp`): transcodar **todos os níveis de mip pra BC7**
  (`cTFBC7_RGBA`, 16 bytes por bloco 4×4) e devolver
  `{ width, height, format: 'bc7', levels: ArrayBuffer[] }`. O caminho RGBA32
  permanece como fallback (`format: 'rgba'`) se o transcode BC7 falhar.
- **Device** (`device.cpp`): pedir `WGPUFeatureName_TextureCompressionBC` no
  `requestDevice` (D3D12 garante; sem custo quando não usada).
- **Engine** (`loadKtx2.ts`): com `format: 'bc7'`, montar `CompressedTexture`
  (three) com a cadeia de mips e `RGBA_BPTC_Format` (→ `bc7-rgba-unorm[-srgb]`
  no backend WebGPU), `generateMipmaps: false`. Com `format: 'rgba'` (host
  antigo), o caminho `DataTexture` continua.

## Consequências

- VRAM das texturas cozidas cai ~4× no export (paridade com o Studio, que já
  era BC7) e o load não paga mais geração de mips.
- Exige host e bundle da mesma geração pro caminho novo; bundles novos em host
  antigo caem no fallback RGBA sem quebrar.
- Qualidade: UASTC→BC7 é praticamente sem perda adicional (o lossy já
  aconteceu no encode UASTC do cook).
