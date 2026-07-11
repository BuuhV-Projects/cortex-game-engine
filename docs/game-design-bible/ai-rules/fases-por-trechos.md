# Fases por trechos (peças de encaixar) + loop de verificação

Método pra criar fases COMBINANDO trechos fatiados de um mapa-demo autorado
(coleção `Demonstration` dos `.blend` dos packs), em vez de posicionar peça por
peça. O level design profissional vem de graça; criar fase vira curadoria.
Provado no projeto teste4 (specs 0004/0005) — se o projeto tiver
`tools/slice_trechos.mjs`, `tools/lint_chunks.mjs`, `tools/sweep.mjs` e
`scenes/trechosCompose.ts`, USE-OS; senão, copie do teste4 ou peça ao usuário.

## Pipeline

1. **Exportar** o demo em espaço-engine (Blender headless; conversão Z-up→Y-up
   por CONJUGAÇÃO `C·M·C⁻¹` — left-multiply tomba tudo).
2. **Fatiar** (`slice_trechos.mjs`): separa os percursos por faixa, gira a
   progressão pra +X e corta nos vãos da pista (~35 m por trecho). Cada trecho
   sai normalizado (entrada em x=0, v=0) com catálogo: `length`, `entryY/exitY`
   (TOPO andável, não pivô), `exitV`, `exitHeadingDeg`, `peakY`, `maxGap`,
   `difficulty`, `headR/tailR` (overhang das peças de borda).
3. **Compor** (`composeLevel({world, chunks})`): encadeia trechos casando
   altura/lateral, com CONECTOR + checkpoint entre eles (arco girado pro rumo
   local da trilha). Largada/água/chegada vêm do kit do mundo.
4. **Verificar em LOOP** (não confie em olhômetro de screenshot): rode
   `lint_chunks.mjs` até 0 erros; só então `sweep.mjs` (varredura panorâmica
   em N quadros) como confirmação visual final. Defeito novo achado em
   playtest vira REGRA nova do lint, nunca só um conserto pontual.

## Regras do lint (cada uma nasceu de um bug real)

- **R1** gameplay eixo-alinhado: checkpoint/finish/trampolim sem tombamento e
  com rotY em múltiplo de 90° (portal DEITADO não é atravessável); canhão
  preserva a mira (yaw efetivo pela matriz).
- **R2** moldura tombada (cerca/barreira/estaca >30°) = destroço decorativo do
  demo → remover. Tombamento se mede pela MATRIZ de rotação (up local × up do
  mundo, |dot| ignora flip) — Euler cru dá falso-positivo: (−172°,1°,1°) é yaw
  com flip e renderiza EM PÉ.
- **R3** gameplay sem pista num raio de 6 m = órfã de corte (aviso).
- **R4** `maxGap` > 2.8 m (pulo) = trecho só encaixável com mecânica de
  traversal calibrada — não entra em fase de emenda simples.
- **R5** nada fora do vão da pista; ponte/moldura a <1.5 m da borda sai (ela
  atravessava o corte e ficou sem a outra ponta).

## Ao escolher trechos pra uma fase

- Filtre pelo catálogo: `maxGap ~0` e `peakY` baixo pra emenda simples;
  `difficulty` em crescendo (arco: calmo → médio → clímax; curva de
  dificuldade da bible).
- Anatomias diferentes fatiam diferente: percurso de PLATAFORMAS DISCRETAS
  sobre vazio (ex.: Deathrun) fatia bem; PARQUE sobre terreno contínuo (ex.:
  Chocolate) exige modo surface-aware (footprint/topo por peça) e mesmo assim
  rende pior — prefira o primeiro tipo.
- O que PARECE chão pode ser líquido (poças): pergunte/observe o demo; chão do
  player = peças de pista; líquido ganha script que desliga raycast (afunda).
- Decoração nunca colide (script que desliga raycast) — um arco decorativo que
  fura a pista TRAVA o player (raio do chão vira parede).
