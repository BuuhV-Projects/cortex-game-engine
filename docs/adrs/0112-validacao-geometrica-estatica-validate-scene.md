# 0112 - Validação geométrica estática (`validateScene` + tool `validate_scene`)

**Data:** 2026-07-15
**Status:** aceito

## Contexto

Toda a garantia de qualidade geométrica das cenas geradas pela IA era **visual**:
screenshots de playtest (ADR-0033) + crítica (ADR-0043), com disciplina de prompt
(ADR-0039). Objeto torto, peça dentro da outra e vão impulável eram caçados no
sensor mais caro e menos confiável (visão de LLM sobre screenshot), gastando
iterações — sendo que bounding box detecta isso com 100% de precisão e custo ~zero.
O precedente já existia fora do engine: o lint de fases R1–R5 da game-design-bible
(`ai-rules/fases-por-trechos.md`), cada regra nascida de um bug real, com a máxima
"verifique em LOOP, não confie em olhômetro de screenshot".

## Decisão

1. **`src/scene/validateScene.ts`** — módulo **puro de dados** (sem three/GPU;
   valida o JSON da cena + `size`/anchors do `kit.json` + overlay):
   - `overlap` — interpenetração entre sólidos (AABB com rotY; toque ≤0.05u ok);
   - `floating` — sólido sem apoio sob a base (role `platform` = warning,
     flutuar é legítimo em platformer; chão/prop = erro);
   - `tilted`/`misaligned` — gameplay tombado (rotX/rotZ) ou chão fora de
     múltiplo de 90° (lint R1/R2);
   - `gap`/`rise` — vão/subida além do pulável entre plataformas vizinhas
     (lint R4), só quando a cena tem `player`;
   - `attach` — encaixe quebrado (reportado como violação; no `buildScene`
     falharia alto).
   Nós sem `size` conhecido vão em `stats.skipped` — cobertura honesta, nunca
   silenciosa. Convenção de pivô: `model` = base-centro (padrão dos kits),
   `primitive` = centro.
2. **MCP tool `validate_scene`** (`cortex-validate`, electron): lê `scenes/*.json`
   + `assets/*/kit.json` + overlay da fase, grava o relatório **completo** em
   `.cortex/validation/` e devolve ao agente só o **resumo** (contagens por regra
   + top 10) — orçamento de contexto do Chat IA é restrição de projeto.
3. **Definição de Pronto em duas etapas** (AGENT_SYSTEM_PROMPT): (1) `validate_scene`
   até **0 erros** após toda escrita de cena; (2) só então validação visual —
   playtest close-up + critique_scene, agora focados em **composição/beleza**,
   não em caçar geometria.

## Consequências

- Erro geométrico é pego em milissegundos com localização exata (id + medida),
  não em screenshots interpretados; o loop visual fica reservado pro que visão
  faz bem. Menos iterações caras por fase.
- Validação é **estática por construção**: usa o `size` do kit, não o mesh real.
  Peça fora de kit (sem bbox) não é validada — aparece em `skipped`. Modelos com
  pivô fora da base violam a convenção e podem gerar falso positivo/negativo.
- Heurísticas têm tolerâncias (penetração 0.15u, gap 2.8u, rise 3u) —
  configuráveis por chamada; defeito novo achado em playtest deve virar REGRA
  nova aqui (princípio do lint da bible), alimentado pelo ciclo do ADR-0113.
- `checklist` da bible (`ai-rules/validation-checklist.md`) preenchido com o
  fluxo em duas etapas.
- Relaciona-se com: ADR-0039 (grounding/protocolo visual — o protocolo visual
  continua, depois do geométrico), ADR-0043 (crítica de beleza), ADR-0053
  (kit/sockets — fonte dos bbox/roles), ADR-0033 (playtest).
