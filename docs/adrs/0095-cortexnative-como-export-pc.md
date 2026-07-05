# 0095 - CortexNative substitui o Tauri como export PC

**Data:** 2026-07-05
**Status:** aceito

## Contexto

O ADR-0024 definiu o Tauri como caminho de distribuição PC (WebView2 +
instalador NSIS). Com o CortexNative validado (M0: Three.js rodando em
Hermes + WebGPU/D3D12 sem browser — PRD-0004, ADR-0094), manter dois
runtimes de publicação cria dupla manutenção e diverge do console: o Tauri
roda no WebView2 (Chromium), o Xbox roda no CortexNative — bugs de
plataforma só apareceriam no console.

Decisão do usuário (2026-07-05): **PC passa a usar o CortexNative** como
runtime de publicação. Racional: "se funcionar no PC, também funcionará no
Xbox em sua maior parte" — o PC vira o campo de prova diário do caminho de
console, com a mesma pilha (Hermes, wgpu/D3D12, SDL3) byte a byte.

## Decisão

- O export PC oficial dos jogos passa a ser o **CortexNative**
  (`native/` — mesmo host do alvo console).
- O **teste prático de validação é o teste4** (branch
  `refactor/port-console-xbox`): o M1 (docs/cortex-native/
  m1-inventario-teste4.md) deixa o jogo jogável no host; a partir daí o
  CortexNative é o alvo de build PC.
- O **Tauri fica congelado** (não removido) até o M1 completar: o template
  e o `installer:setup` continuam funcionando pra projetos existentes, mas
  não recebem evolução. Remoção formal em ADR futuro, após o CortexNative
  ganhar empacotamento/instalador PC próprio.
- O Studio/IDE **continua no Electron** — esta decisão é só sobre o runtime
  de PUBLICAÇÃO dos jogos.

## Consequências

- Um único runtime de publicação pra PC e console — paridade total; o
  esforço de shim/host serve aos dois alvos de uma vez.
- O jogo publicado no PC deixa de depender do WebView2/Edge do sistema
  (renderização determinística: wgpu/D3D12 fixo, Hermes fixo).
- Pendências que o CortexNative herda do Tauri e precisa resolver antes da
  remoção formal: empacotamento (pasta do jogo + exe + assets), ícone,
  instalador (NSIS ou MSIX) — hoje o host roda `boot.hbc` ao lado do exe.
- HUD HTML dos jogos precisa migrar pra API de UI do engine (frente 6 do
  M1) — no Tauri isso não seria necessário; é o preço da paridade com
  console e já estava previsto no PRD-0004.
- ADR-0024 marcado como substituído por este.
