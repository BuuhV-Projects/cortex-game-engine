# 0102 - UI de runtime com dois backends (DOM e renderer)

**Data:** 2026-07-05
**Status:** aceito

## Contexto

A UI de runtime do engine (DialogueUI/ADR-0070, LoadingScreen, Speedometer)
e a dos jogos (menu e HUD do teste4) são HTML/DOM. No CortexNative (host
nativo → Xbox, e agora export PC oficial por ADR-0101) **não existe DOM** —
hoje o DOM-lite inerte deixa esse código rodar, mas nada aparece (o teste4
boota jogável e "cego" de HUD). É a frente 6 do M1
(docs/cortex-native/m1-inventario-teste4.md), a última antes do teste4
100% jogável no host.

## Decisão

Nova API de UI **retida** no engine (`src/ui/runtime/`), com UMA interface e
DOIS backends selecionados por detecção de ambiente:

1. **`UiLayer`** — raiz da UI de runtime. Widgets mínimos e suficientes pro
   catálogo real dos jogos/engine:
   - `Panel` (caixa com cor/opacidade/padding, ancorada)
   - `Label` (texto com tamanho/cor/alinhamento)
   - `Button` (focável, navegável por gamepad/teclado — REGRA do projeto:
     100% jogável no controle)
   - Âncoras declarativas (`top-left`, `top-right`, `center`,
     `bottom-center`...) + offset — SEM layout engine/CSS: posicionamento
     absoluto ancorado resolve HUD/menu/diálogo de jogo.
2. **`DomUiBackend`** (Studio/browser/preview): renderiza os widgets como
   divs — visual e comportamento de hoje.
3. **`RendererUiBackend`** (CortexNative/console): cena ortográfica própria
   desenhada POR CIMA da cena do jogo no mesmo WebGPURenderer; texto
   rasterizado NATIVAMENTE via stb_truetype (novo shim `__cortexRasterText`
   → bitmap RGBA → textura), painéis como quads coloridos.
4. **Navegação de foco na API** (não no backend): d-pad/setas movem o foco,
   A/Enter ativa — o mesmo grafo de navegação nos dois backends.
5. **Migração**: DialogueUI, LoadingScreen e Speedometer passam a usar a
   API; o teste4 é o piloto da migração nos jogos (menu + HUD do
   RushSystem). O overlay DOM cru continua PERMITIDO em jogos que só miram
   browser — mas o template e a doc apontam pra API nova.

## Adendo (2026-07-06): estilo rico + CSS que compila pro subset

- O subset de estilo cresceu: **gradiente vertical, canto arredondado e
  borda** (+ borda de foco em botões). No backend DOM viram CSS; no backend
  renderer são desenhados por **SDF em TSL** (um shader de rounded-rect com
  uniforms — estilo muda sem recompilar pipeline).
- **`parseUiCss` (UiStylesheet)**: o dev escreve um SUBSET de CSS familiar
  (`.classe { ... }` e `.classe:focus`) que **compila** pros estilos de
  widget — idêntico nos dois backends. Propriedade/seletor fora do subset =
  **erro claro na compilação** (mesma filosofia do pipeline JS: falhar no
  build do PC, nunca no console). CSS COMPLETO (layout arbitrário, flex,
  animações) segue fora de escopo; se a ambição de UI crescer, o caminho
  avaliado é RmlUi (HTML/CSS pra jogos, usado em títulos de console) — 
  decisão futura com ADR próprio.

- **Templates HTML dinâmicos (parseUiTemplate/loadUiTemplate)**: telas
  autoradas em arquivos .html de asset (vocabulário: panel/label/button/
  stack + <style> do subset + {{data}} + onpress/id), carregados via fetch
  em runtime — o menu do teste4 vive em ssets/ui/menu.html. Tag fora do
  vocabulário = erro claro na compilação.

## Consequências

- HUD/menus funcionam idênticos no Studio, no export PC e no console — e
  ficam navegáveis por controle de graça (a API força o foco).
- Estilo é um SUBSET (cor, opacidade, tamanho, padding, âncora) — quem
  precisar de CSS elaborado está fazendo UI de browser, não de console.
- Fonte: uma TTF embarcada no engine (+ opção por jogo); no backend DOM a
  mesma fonte via @font-face pra paridade visual.
- Novo shim nativo `__cortexRasterText` (stb_truetype, pinado como os
  demais) — texto dinâmico re-rasteriza só quando o Label muda.
- O Speedometer/DialogueUI mudam de implementação mas mantêm a API pública
  (rodar `yarn docs:engine` na migração).
- Numeração: ADRs do CortexNative usam a faixa 0100+ pra não colidir com a
  série 0094–0096 da branch release/mundo-aberto.
