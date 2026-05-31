# 0032 - Renderer baseado em WebGPU (obrigatório)

**Data:** 2026-05-31
**Status:** aceito (refina ADR-0001)

## Contexto

O engine deve renderizar jogos 3D com **WebGPU** (acesso a node materials, compute,
melhor performance e caminho pra efeitos mais ricos). O `Renderer` encapsulava
`THREE.WebGLRenderer` (ADR-0001). O three 0.184 traz `WebGPURenderer` em
`three/webgpu`.

Decisão do usuário: **WebGPU é obrigatório** — sem fallback silencioso pra WebGL.
(Um caminho WebGL explícito pode voltar no futuro para 2D, via escape hatch.)

## Decisão

`Renderer` ([src/core/Renderer.ts](../../src/core/Renderer.ts)) passa a usar `WebGPURenderer` de `three/webgpu`.

- **Init assíncrono sem quebrar a API:** `WebGPURenderer` exige `await init()` antes
  do primeiro `render()`. O construtor segue síncrono e dispara o init em background;
  `render`/`clear`/`renderViewport` são **no-op até o backend ficar pronto**. Expõe
  `init(): Promise<void>` e `isReady` pra quem quiser aguardar (LoadingScreen esconde
  os ms iniciais). → **zero mudança nos projetos**.
- **WebGPU obrigatório:** o `WebGPURenderer` instala internamente um fallback WebGL2
  não-desligável por opção; então, para exigir WebGPU, o construtor checa
  `navigator.gpu` e **lança** se ausente (em vez de cair pra WebGL2). `forceWebGL`
  é um escape hatch explícito que ignora essa checagem.
- **Instância única do three (anti dual-instance):** `three/webgpu` é um superset
  (`export * from Three.Core` + `WebGPURenderer`). Misturar `import 'three'` com
  `import 'three/webgpu'` criaria duas cópias do three → `instanceof` quebraria.
  Solução: alias `^three$` → `three/webgpu` no [vite.engine.config.ts](../../vite.engine.config.ts), unificando
  core + addons + renderer numa só instância no bundle. O `Renderer.test.ts` mocka
  `three/webgpu` (sem alias no vitest).
- **Materiais clássicos** (MeshStandardMaterial etc.) seguem funcionando (node
  materials internos do WebGPURenderer) — sem mudança nos projetos.

## Consequências

- Bundle do engine cresceu de ~1,4 MB → ~2,1 MB (gzip ~310 → ~459 kB): three/webgpu
  inclui o node system + os dois backends. Aceito como custo do WebGPU.
- **Jogos exigem um ambiente com WebGPU** (Chrome/Edge atuais, WebView2 recente).
  Sem `navigator.gpu`, o `Renderer` lança no boot com mensagem clara. Em ambiente
  sem WebGPU o jogo não roda (decisão explícita).
- O caminho WebGPU real não é unit-testável (precisa GPU/browser) — validação por
  build + execução manual. Testes cobrem a lógica do wrapper (skip-until-ready,
  split-screen) com `WebGPURenderer` mockado.
- corrida-teste migrado só re-vendorizando o bundle (API do `Renderer` inalterada).
- ADR-0001 segue válido (three.js como camada de renderização); só o backend mudou.
