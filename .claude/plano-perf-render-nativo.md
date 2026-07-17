# Plano — Performance do render nativo (40 → 60+ fps)

**Data:** 2026-07-17 · **Contexto:** depois do ADR-0118 (raycast skinned + clamp
de dt), a fase 1 do teste4 roda a ~40 fps no host. O teto agora é o custo de CPU
do `WebGPURenderer` do three **por objeto por frame** (travessia + node
materials + encoding) rodando no Hermes (interpretador, sem JIT). Medido:
render ~19 ms/frame, física+ECS ~2 ms, UI ~2 ms. Menu (sem cena) faz 250+ fps.

---

## Item 2 — Merge estático no export (alvo: 60 fps, esforço médio)

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

### Rota B — Hermes com JIT (só PC)
- O Hermes tem JIT experimental (HERMES_ENABLE_JIT). Ganho menor que shermes
  AOT e **não serve pro Xbox** (JIT proibido em console) → bifurca o
  comportamento PC vs console. Só vale como tapa-buraco.

### Rota C — Trocar o motor (V8/JSC embarcado)
- V8 embarcado dá o desempenho do Studio, mas: binário +30–60 MB, JIT proibido
  no Xbox (V8 jitless ≈ interpretador de novo), NAPI reescrita. Não recomendo —
  perde a razão de ser do host único PC/console.

### Sequência sugerida
1. Item 2 primeiro (independe de motor, ganho garantido, destrava 60 fps).
2. Spike da Rota A (1–2 dias, mede e decide com número).
3. Se shermes entregar ≥2×: migração num milestone próprio (M5?), com ADR.

---

*Relacionado: ADR-0108 (BVH/KTX2), ADR-0118 (skinned raycast + clamp dt),
ADR-0119 (UASTC+Zstd), memória native-fps-cpu-bound-render.*
