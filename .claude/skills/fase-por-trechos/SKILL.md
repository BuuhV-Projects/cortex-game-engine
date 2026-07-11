---
name: fase-por-trechos
description: Cria fases de plataforma COMBINANDO trechos (peças de encaixar) fatiados de um mapa-demo autorado (.blend dos packs), com loop de verificação determinístico (lint até 0 erros + sweep panorâmico). Use quando o usuário pedir para fatiar um mapa pronto em trechos/peças, compor/montar fases a partir de trechos, ou validar fases geradas com o método de loop verificável. Complementa montar-jogo (construção) e level-design-plataforma (critérios).
---

# Fase por trechos: fatiar mapa-demo → compor → verificar em loop

Método provado no teste4 (specs 0004/0005): em vez de posicionar peça por peça,
**fatiar o mapa-demo profissional** (coleção `Demonstration` do `.blend` do
pack) em trechos normalizados e **compor fases encadeando-os**. Criar fase vira
curadoria de catálogo. A validação NÃO é olhômetro de screenshot: é um **loop
verificável** (método "Loop Engineer"/Karpathy) — fatiar → lint → corrigir →
re-fatiar até 0 erros; screenshot é a confirmação final.

Implementação canônica (calibrada ao `CourseData` do teste4):
`D:/jogos/teste4/tools/{slice_trechos,lint_chunks,sweep}.mjs` +
`D:/jogos/teste4/scenes/trechosCompose.ts`. Os três `.mjs` estão copiados em
`scripts/` ao lado deste arquivo como TEMPLATE — adapte vocabulário/faixas ao
pack em mãos. O compositor é código do jogo (usa o courseKit do mundo).

## Fase 0 — Conhecer o demo ANTES de fatiar (medir, nunca chutar)

1. **Exportar** a coleção `Demonstration` pra JSON em espaço-engine com o
   `blender_export_scene.py` da skill `level-design-plataforma`. A conversão
   Z-up→Y-up é por CONJUGAÇÃO (`C·M·C⁻¹`) — left-multiply tomba TODAS as peças.
2. **Plotar** vista lateral (u×y) e topo (u×v) por percurso, colorido por
   categoria. É o que revela a anatomia — e ela decide TUDO:
   - **Plataformas discretas sobre o vazio** (ex.: Deathrun): fatia bem — corte
     nos vãos entre pivôs de chão.
   - **Parque sobre terreno contínuo** (ex.: Chocolate): exige modo
     `surfaceAware` (footprint + topo POR PEÇA, corte no vale de menor
     sobreposição de miolos) e mesmo assim rende pior. Prefira o 1º tipo.
   - Demos costumam ter **3 percursos paralelos completos** (faixas) — descubra
     por clusterização espacial, não a olho.
3. **Perguntar o que é chão**: o que PARECE terreno pode ser LÍQUIDO no design
   do usuário (poças rosa do Chocolate). Chão do player = peças de pista;
   líquido/decoração ganham script que desliga raycast.

## Fase 1 — Fatiar (`scripts/slice_trechos.mjs`)

Separa faixas, gira a progressão pra +X, corta a ~35 m (cadência de checkpoint
da skill de level design). Cada trecho sai NORMALIZADO (entrada da pista em
x=0, v=0) com catálogo: `length`, `entryY/exitY` (**topo andável** da peça da
borda — nunca a média de pivôs: pivô de laje fica na base, 2.8 m abaixo de onde
se pisa), `exitV` + `exitHeadingDeg` (o percurso serpenteia), `peakY` (pico
interno), `maxGap` (maior vão da pista), `difficulty` (nº de hazards),
`headR/tailR` (overhang real das peças de borda — ilha de 13 m de raio avança
8 m além do pivô; sem isso o terreno engole o conector).

Regras de sanidade NA ORIGEM (cada uma nasceu de bug real de playtest):
- **R1** gameplay eixo-alinhado: checkpoint/finish/trampolim com tombo zero e
  rotY travado em múltiplo de 90° (portal deitado não é atravessável); canhão
  preserva a MIRA (yaw efetivo pela matriz).
- **R2** moldura tombada >30° = destroço decorativo do demo → fora. Tombamento
  pela MATRIZ (up local × up do mundo, |dot| ignora flip): Euler cru mente —
  (−172°,1°,1°) é yaw com flip e renderiza EM PÉ (falso-positivo clássico).
- **R5** nada fora do vão da pista + ponte/moldura a <1.5 m da borda sai (ela
  atravessava o corte e ficou sem a outra ponta = tronco flutuando).

## Fase 2 — Compor (padrão `trechosCompose.ts`)

`composeLevel({world, chunks: [ids…]})`: para cada trecho, desloca X pro
cursor (+headR), Y pra casar `entryY` com a saída anterior, Z pelo `exitV`
acumulado; entre trechos entra um CONECTOR do kit do mundo (plataforma curta +
checkpoint com o arco girado `90 + exitHeadingDeg` — perpendicular ao eixo
global numa trilha diagonal lê torto). Scripts de gameplay anexados por
CATEGORIA da peça; `finish` interno descartado (a chegada é do compositor).
Nomes de nós estáveis (`tr<i>-<n>`) → overlay do editor funciona.

Escolha de trechos = curadoria pelo catálogo: `maxGap ~0` e `peakY` baixo pra
emenda simples; `difficulty` em crescendo (calmo → médio → clímax).

## Fase 3 — Verificar em LOOP (nunca só screenshot)

1. `node tools/lint_chunks.mjs` — juiz independente (R1–R5 + sanidade de
   catálogo), exit 1 com erro. **Repita fatiar→lint até 0 erros.**
2. `node tools/sweep.mjs "<url da fase>" <dir> [x0] [x1] [quadros]` — varredura
   panorâmica: uma carga só, teleporta o player quadro a quadro e captura N
   PNGs. Revisar EM SEQUÊNCIA procurando: objeto torto, peça flutuando, ilha
   órfã, emenda desnivelada, portal de lado.
3. **Defeito novo de playtest vira REGRA nova do lint** — nunca só um conserto
   pontual. É assim que o sistema melhora a cada ciclo.

## Gotchas que custaram iteração (não repita)

- `SkinnedMesh` mente no bbox: o three desenha pelos OSSOS (cereja do
  Chocolate: pivô real 11 m acima da origem). Meça no runtime
  (`window.__game.scene._scene.traverse`), não no arquivo.
- Checkpoint/finish dos kits nascem com o vão no eixo X → `rotY: 90` pra
  cruzar pista em +X (fases antigas corrigiam à mão no overlay).
- Decoração NUNCA colide (arco decorativo que fura a pista TRAVA o player — o
  raycast do chão vira parede); líquido idem (player afunda e morre na queda).
- Duplicata do Blender: `obstacle_5_007` é instância; o ARQUIVO é
  `obstacle_5_001.glb`.
- No Studio (bundle dev), gameplay fica atrás do gate ▶ Play do editor — o
  sweep/harness precisa CLICAR no botão antes de fotografar.
