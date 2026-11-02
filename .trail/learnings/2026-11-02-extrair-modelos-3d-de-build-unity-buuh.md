---
title: Extrair modelos 3D de build Unity WebGL (.data)
author: Buuh
date: 2026-11-02
id: l-add3c662
scope: repo
status: active
touches:
  - "native/rapier-native/patched/rapier3d/src/dynamics/joint/multibody_joint/multibody_link.rs#deref"
  - "native/rapier-native/patched/rapier3d/src/geometry/collider_components.rs#deref"
---

## Decided
Build Unity WebGL `.data` (mesmo com nome `.gz`, o navegador já descompacta) começa com `UnityWebData1.0`. O REA (`open_binary`) recusa: `unsupported binary format` (PR de suporte aberto em sessão separada em 01/11/2026).

Pipeline que funciona: `D:/ai-scripts/unity-webgl-extract/` (venv com UnityPy==1.24.2 + trimesh==4.5.3):
- `inventory.py <data>` → tipos e malhas; `roots.py`/`tree.py <data> <prof>` → hierarquia da cena
- `export_glb.py <data> <saida> ["Nome|Pai" ...]` → GLB montado por GameObject (uma peça por nó, flip X Unity→glTF, material base+normal); sem args exporta uma variante por grupo + `aeroporto_completo.glb`
- `viewer.html?f=x.glb` servido por `http.server` pra validar no navegador embutido (render no load por causa do rAF congelado — gotcha-painel-navegador-congela-raf)

Gotchas: PPtr do UnityPy 1.24 não tem `assets_file` (use `pptr.deref()`); trimesh sobrescreve nós de mesmo nome; Windows colide nomes só por maiúscula.
1º uso: aeroporto em E:/Downloads/aeroporto-glb (avião Cessna 3 variantes, hangar, props).

_From Claude Code's memory of this repo, last updated Nov 1._
