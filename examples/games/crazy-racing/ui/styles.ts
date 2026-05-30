/**
 * Injeta os estilos globais usados pelos overlays. Chamado uma vez no
 * bootstrap. Em vez de import de .css (Vite suportaria), tudo inline pra
 * não exigir asset extra.
 */
const CSS = /* css */ `
  body { font-family: 'Segoe UI', Roboto, sans-serif; background:#101820; color:#fff; }
  /* Único canvas — split-screen é feito via renderer.renderViewport() do engine */
  #canvas { position:absolute; top:0; left:0; width:100vw; height:100vh; }
  /* Linha divisória sutil entre os viewports em coop */
  body.coop::before {
    content:''; position:fixed; top:0; bottom:0; left:50vw; width:2px;
    background:rgba(0,0,0,.5); pointer-events:none; z-index:4;
  }
  .overlay {
    position:fixed; inset:0; background:linear-gradient(135deg,#1a2740 0%,#10141c 100%);
    display:flex; flex-direction:column; align-items:center; justify-content:center;
    z-index:10; padding:24px; box-sizing:border-box; overflow:auto;
  }
  .overlay h1 { font-size:42px; margin-bottom:8px; color:#ffd23f; letter-spacing:2px; }
  .overlay h2 { font-size:22px; margin:8px 0; color:#9ad0ff; }
  .overlay h3 { font-size:18px; margin:6px 0; color:#fff; }
  .overlay p  { color:#bbb; margin:4px 0; max-width:640px; text-align:center; }
  .btn-row { display:flex; gap:12px; margin-top:18px; flex-wrap:wrap; justify-content:center; }
  .btn {
    background:#ffd23f; color:#10141c; border:none; padding:12px 22px; border-radius:8px;
    font-size:16px; font-weight:700; cursor:pointer; transition:transform .1s;
  }
  .btn:hover { transform:translateY(-2px); }
  .btn.secondary { background:#2a3650; color:#fff; }
  .btn.small { padding:6px 12px; font-size:13px; }
  .btn.locked { background:#444; color:#888; cursor:not-allowed; }
  .grid {
    display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));
    gap:12px; margin:16px 0; max-width:760px; width:100%;
  }
  .card {
    background:#1d2940; border:2px solid transparent; border-radius:10px;
    padding:14px; cursor:pointer; text-align:center; transition:.15s;
  }
  .card:hover { border-color:#9ad0ff; }
  .card.selected { border-color:#ffd23f; background:#26365a; }
  .swatch { width:38px; height:38px; border-radius:50%; display:inline-block; margin:2px; cursor:pointer; border:3px solid transparent; }
  .swatch.selected { border-color:#fff; }
  .player-panel {
    background:#16213a; padding:16px; border-radius:12px; min-width:280px; margin:8px;
  }
  .row { display:flex; gap:16px; flex-wrap:wrap; justify-content:center; }
  /* HUD em jogo */
  .hud {
    position:fixed; pointer-events:none; color:#fff;
    text-shadow:0 1px 3px rgba(0,0,0,.8); z-index:5; font-weight:700;
  }
  .hud-p0 { left:12px; top:12px; }
  .hud-p1 { right:12px; top:12px; text-align:right; }
  body.coop .hud-p0 { left:12px; }
  body.coop .hud-p1 { left:calc(50vw + 12px); right:auto; text-align:left; }
  .hud .speed { font-size:42px; color:#ffd23f; }
  .hud .lap { font-size:20px; }
  .hud .pos { font-size:28px; color:#9ad0ff; }
  .hud .label { font-size:12px; opacity:.7; text-transform:uppercase; letter-spacing:1px; }
  /* Minimap — canto inferior esquerdo da viewport de cada jogador.
     Fixar width/height em CSS evita o canvas ser esticado pelo layout. */
  .minimap {
    position:fixed; bottom:12px; left:12px;
    width:180px; height:180px;
    pointer-events:none; z-index:5;
    filter: drop-shadow(0 4px 12px rgba(0,0,0,.6));
  }
  .minimap-p1 { display:none; }
  /* Em coop, P0 no canto esquerdo da metade esquerda;
     P1 no canto esquerdo da metade direita. */
  body.coop .minimap-p0 { left:12px; }
  body.coop .minimap-p1 { display:block; left:calc(50vw + 12px); }
  .countdown {
    position:fixed; inset:0; display:flex; align-items:center; justify-content:center;
    font-size:160px; font-weight:900; color:#ffd23f; text-shadow:0 4px 16px rgba(0,0,0,.6);
    pointer-events:none; z-index:6;
  }
`

export function injectStyles(): void {
  if (document.getElementById('crm-styles')) return
  const style = document.createElement('style')
  style.id = 'crm-styles'
  style.textContent = CSS
  document.head.appendChild(style)
}
