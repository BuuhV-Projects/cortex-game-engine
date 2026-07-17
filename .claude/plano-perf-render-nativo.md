# Plano — Performance do render nativo (40 → 60+ fps)

**Data:** 2026-07-17 · **Contexto:** depois do ADR-0118 (raycast skinned + clamp
de dt), a fase 1 do teste4 roda a ~40 fps no host. O teto agora é o custo de CPU
do `WebGPURenderer` do three **por objeto por frame** (travessia + node
materials + encoding) rodando no Hermes (interpretador, sem JIT). Medido:
render ~19 ms/frame, física+ECS ~2 ms, UI ~2 ms. Menu (sem cena) faz 250+ fps.

---

## Item 2 — Merge estático no export — ✅ FEITO, resultado abaixo do previsto

> **Resultado medido (2026-07-17, ADR-0121):** implementado e ligado por default
> no host nativo (`mergeStaticScene`, auto no `buildScene`). Fase 1: 57 malhas
> → 15 grupos, física/visual intactos — mas fps foi só de 41 → ~43. Draw call
> NÃO era o gargalo restante: com/sem merge e com SSAA 1×/2× o frame fica
> ~23 ms ⇒ o custo dominante é o overhead por-frame do WebGPURenderer no
> interpretador. Fica ligado (custo zero, ajuda em cena maior), mas o salto de
> fps real depende do **item 3**. Plano original abaixo, mantido pra histórico.

**Ideia:** o custo do render é ∝ nº de draw calls (~90 na fase 1: cada ilha,
árvore, pedra, moeda, flor). Cozinhar a parte ESTÁTICA da cena em ~10–15 meshes
agrupados por material derruba o custo por frame sem mudar nada do gameplay.

### Fases

1. **Medição/inventário (meio dia)** — instrumentar contagem de draw calls por
   fase (`renderer.info` no boot com `cortexPerf=1`); listar quais nós são
   estáticos (sem script, sem física dinâmica, sem animação) por fase do teste4.
2. **Merge em runtime no buildScene (2–3 dias)** — novo passo opcional no
   `SceneBuilder` (`mergeStatic: true` no `SceneDefinition` ou flag do export):
   - Elegível: nó SEM `script`, SEM `movingPlatform`/animação, SEM física
     dinâmica (estático com collider ok — o collider é derivado ANTES do merge),
     não-skinned, não-instanciado por vegetação.
   - Agrupar por material efetivo (inclui override do overlay data.material —
     grupos `unlit`/`toon` com mesmos params); `BufferGeometryUtils.mergeGeometries`
     com transform aplicado (bake em world space).
   - Manter os nós originais no `SceneDefinition`/editor — o merge acontece SÓ
     no Play/export (Studio F2 continua editando objetos individuais; no editor
     ativo o merge é desligado).
   - Física intocada: colliders continuam derivando dos nós individuais
     (raycast de chão usa a MESMA malha mergeada — BVH único, até melhor).
3. **Validação (1 dia)** — fase 1 e choco-1: fps antes/depois (meta ≥55 no
   host), lint das fases (loop verificável), editor F2 segue funcional,
   contornos (inverted-hull) — a casca de outline também merge por grupo.
4. **Riscos/cuidados:**
   - Frustum culling piora (1 mesh gigante = sempre visível) — irrelevante aqui,
     o gargalo é CPU por draw call, não fill.
   - Outline inverted-hull por mesh mergeado muda a espessura relativa? Não —
     casca é por-geometria escalada; validar visual.
   - `data.matte`/`shadow` por nó: nós com settings distintos caem em grupos
     distintos.

## Item 3 — Motor JS com JIT / Static Hermes (alvo: 2–5× todo o JS, esforço alto)

**Ideia:** o multiplicador de TUDO (render, física, scripts) é o interpretador.
Três rotas, em ordem de recomendação:

### Rota A — Static Hermes (shermes) ★ recomendada
- O Hermes novo (static_h) compila JS → C → nativo AOT; typed arrays e loops
  numéricos chegam perto de nativo. Mantém o modelo atual (sem GC pausas de JIT,
  console-friendly: **AOT é permitido no Xbox**, JIT não!).
- Passos: (1) spike com o bundle atual (boot.bundle.js) no shermes standalone —
  medir o render loop; (2) se ≥2×, integrar a toolchain no build (substitui
  hermesc; a NAPI continua igual); (3) validar teste4 completo + save/pak.
- Risco: shermes é experimental; bundle de 2,6 MB pode expor bugs — o spike
  responde rápido.

### Rota B — Hermes com JIT (DESCARTADA, decisão 2026-07-17)
- **Consoles proíbem JIT** (W^X: página de memória não pode ser gravável E
  executável; todo código executável vem assinado no pacote — vale pra Xbox/
  GDK, PlayStation e Switch). JIT só rodaria no export PC → bifurca PC rápido /
  Xbox lento e mata a razão de ser do host único (PRD-0004). Além disso o JIT
  do Hermes é experimental e focado em arm64, não x86-64. Não seguir.

### Rota C — Trocar o motor (V8/JSC embarcado) (DESCARTADA)
- V8 embarcado dá o desempenho do Studio no PC, mas no Xbox só roda jitless
  (≈ interpretador de novo), binário +30–60 MB e NAPI reescrita. Não seguir.

### Nota "IL2CPP da engine" (pergunta do dev)
A alternativa AOT análoga ao IL2CPP da Unity **é exatamente a Rota A**: IL2CPP
compila IL/C# → C++ → nativo; shermes compila JS → C → nativo. Mesma categoria
permitida em console (código pré-compilado e assinado, zero codegen em
runtime). Outras rotas AOT avaliadas e descartadas: AssemblyScript/WASM
(reescrever a engine num subset de TS, abandona o three), Porffor (imaturo),
reescrever o render em C++/Rust no host (abandona o WebGPURenderer — escopo de
outra engine).

### Sequência DECIDIDA (2026-07-17)
1. **Item 2 primeiro** (em execução) — independe de motor, ganho garantido.
2. Spike da Rota A/shermes (1–2 dias, mede e decide com número).
3. Se shermes entregar ≥2×: migração num milestone próprio (M5?), com ADR.

---

*Relacionado: ADR-0108 (BVH/KTX2), ADR-0118 (skinned raycast + clamp dt),
ADR-0119 (UASTC+Zstd), memória native-fps-cpu-bound-render.*
