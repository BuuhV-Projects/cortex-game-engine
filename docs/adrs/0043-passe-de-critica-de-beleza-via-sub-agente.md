# 0043 - Passe de crítica de beleza via sub-agente (critique_scene)

**Data:** 2026-06-05
**Status:** aceito

## Contexto

O objetivo nº1 do usuário é que o Chat IA produza **cenários bonitos** a partir
dos assets + imagens de referência (ele delega o level design à IA). O gargalo
não é mais montar a geometria — é **fidelidade de beleza à referência**
(atmosfera, paleta, densidade). Mas o agente que constrói está imerso no próprio
contexto e tende a "achar que ficou bom" — auto-avaliação no mesmo fluxo é fraca.
Modelos costumam ser bem melhores **criticando** com contexto limpo do que
auto-avaliando.

## Decisão

Nova tool MCP **`critique_scene`** (`electron/agent/tools/critic.ts`), registrada
no `agentLoop.ts` ao lado de `playtest_game`/`inspect_assets`. Implementação em
`electron/agent/critic/sceneCritique.ts`:

- Recebe `screenshot_path` (PNG do `playtest_game`), `reference_path` (imagem
  colada pelo usuário / preview do pacote) e `goal` (spec da cena).
- Despacha um **Claude single-shot, sem histórico e sem tools** (via
  `@anthropic-ai/claude-agent-sdk` — mesma auth OAuth/API-key do Chat IA, ADR-0020),
  com input **multimodal** (as duas imagens como blocos base64 num
  `SDKUserMessage`) e uma rubrica de direção de arte.
- Devolve uma crítica acionável: **distância visual N/10** + top correções
  priorizadas (atmosfera/luz primeiro, depois densidade, composição, câmera).

É um "olhos frescos" isolado: vê só as duas imagens + a rubrica, sem o viés de
quem construiu. O `AGENT_SYSTEM_PROMPT` passou a mandar usar `critique_scene` no
passo de crítica (antes de declarar "pronto") e iterar até a distância encolher.

Também reforça o **protocolo dos 5 lados (topo + 4 laterais)** em DUAS
granularidades: por implementação isolada (cada item, na hora) e do mapa inteiro
(no fim) — pega flutuação/interseção cedo em vez de acumular.

## Consequências

- Cada crítica é uma chamada Claude extra (vision, single-shot) — custo/tempo a
  mais, mas opt-in e disparada poucas vezes por cena. Reusa o padrão single-shot
  do `BlenderModelGenerator`.
- Depende da auth do SDK (OAuth do `claude login` ou ANTHROPIC_API_KEY); sem ela,
  a tool retorna erro.
- Não é unit-testável (precisa de modelo real). Validação: pedir uma cena com
  referência e conferir a crítica.
- Caminho da referência costuma ser absoluto (`<userData>/cortex-pastes/...`); a
  tool lê arquivos fora do cwd de propósito (imagens que o usuário colou).
- Relaciona-se com ADR-0033 (playtest), 0037 (inspect_assets) e a direção de
  "atmosfera = beleza" das mudanças de prompt recentes.
